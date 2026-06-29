import { EVENT_BY_ID } from "../data/events";
import { EQUIPMENT, EQUIPMENT_BY_ID } from "../data/equipment";
import { RESEARCH_BY_ID } from "../data/research";
import { LOCATION_BY_ID } from "../data/locations";
import { STAFF_BY_TIER } from "../data/staff";
import { creditLimit, derive, levelForXp, usedStorage } from "./derive";
import { TUNING } from "./tuning";
import { clamp } from "./economy";
import { bulkFactor, unitPrice } from "./supplier";
import { freshProductState, primaryProductId, productStateOf } from "./menu";
import { PRODUCT_BY_ID } from "../data/products";
import { PERK_BY_ID, menuCapFor } from "../data/perks";
import { CONTRACT_BY_ID, statValue } from "../data/contracts";
import type {
  GameState,
  InventoryLot,
  ItemGrade,
  ItemId,
  ProductId,
  ProductState,
  Recipe,
  StaffRole,
} from "./types";

/**
 * Effective per-unit sticker price for an item/grade today: the supplier market
 * index × base × grade premium, with events still able to spike lemons. Does NOT
 * include the bulk discount (which depends on the purchase quantity).
 */
export function itemBuyPrice(
  state: GameState,
  item: ItemId,
  grade: ItemGrade = "standard",
): number {
  let unit = unitPrice(state.supplier, item, grade);
  if (item === "lemon" && state.activeEventId) {
    const fx = EVENT_BY_ID[state.activeEventId]?.effect;
    if (fx?.lemonPriceMult) unit *= fx.lemonPriceMult;
  }
  return unit;
}

export function setPrice(state: GameState, price: number, product: ProductId = primaryProductId(state)): GameState {
  const ps = productStateOf(state, product);
  const p = Math.max(0, Math.round(price * 100) / 100);
  if (p === ps.recipe.pricePerCup) return state;
  return patchProduct(state, product, { recipe: { ...ps.recipe, pricePerCup: p } });
}

export function setRecipe(state: GameState, patch: Partial<Recipe>, product: ProductId = primaryProductId(state)): GameState {
  const ps = productStateOf(state, product);
  const recipe = { ...ps.recipe, ...patch };
  // Keep parts sane (non-negative; water at least 1 to avoid divide-by-zero).
  recipe.lemons = clamp(Math.round(recipe.lemons), 0, 20);
  recipe.sugar = clamp(Math.round(recipe.sugar), 0, 20);
  recipe.ice = clamp(Math.round(recipe.ice), 0, 20);
  recipe.water = clamp(Math.round(recipe.water), 1, 30);
  recipe.pricePerCup = Math.max(0, Math.round(recipe.pricePerCup * 100) / 100);
  return patchProduct(state, product, { recipe });
}

/** Add/remove a product from the active menu (primary product can't be removed;
 *  Phase 1 caps the menu at 2). */
export function toggleMenuProduct(state: GameState, product: ProductId): GameState {
  if (!PRODUCT_BY_ID[product]) return state;
  const on = state.menu.includes(product);
  if (on) {
    if (state.menu[0] === product) return state; // can't drop the primary
    return { ...state, menu: state.menu.filter((p) => p !== product) };
  }
  if (state.menu.length >= menuCap(state)) return state;
  // Ensure the product has a state entry.
  const products = state.products[product]
    ? state.products
    : { ...state.products, [product]: freshProductState(product) };
  return { ...state, menu: [...state.menu, product], products };
}

/** Active-menu capacity: base cap plus any menu-slot perks (Phase L1). */
export function menuCap(state: GameState): number {
  return menuCapFor(state.ownedPerkIds ?? []);
}

function patchProduct(state: GameState, product: ProductId, patch: Partial<ProductState>): GameState {
  const cur = productStateOf(state, product);
  return { ...state, products: { ...state.products, [product]: { ...cur, ...patch } } };
}

/** Buy `qty` of an item/grade, respecting cash and storage capacity. Larger
 *  single purchases earn a bulk discount on the unit price. */
export function buyStock(
  state: GameState,
  item: ItemId,
  qty: number,
  grade: ItemGrade = "standard",
): GameState {
  const n = Math.floor(qty);
  if (n <= 0) return state;
  const unit = itemBuyPrice(state, item, grade) * bulkFactor(n);
  const cost = unit * n;
  if (cost > state.cash) return state;
  const cap = derive(state).storageCapacity;
  if (usedStorage(state) + n * TUNING.SLOT_COST[item] > cap + 1e-9) return state;

  const inventory = mergeLot(state.inventory, item, n, grade);
  return {
    ...state,
    cash: round2(state.cash - cost),
    todayStockSpend: round2(state.todayStockSpend + cost),
    inventory,
  };
}

/** Largest quantity of an item/grade affordable AND fit-able right now. Uses the
 *  sticker price (no bulk) as a conservative cash bound. */
export function maxBuyable(state: GameState, item: ItemId, grade: ItemGrade = "standard"): number {
  const unit = itemBuyPrice(state, item, grade);
  const byCash = unit > 0 ? Math.floor(state.cash / unit) : 0;
  const cap = derive(state).storageCapacity;
  const slot = TUNING.SLOT_COST[item];
  const bySpace = slot > 0 ? Math.floor((cap - usedStorage(state)) / slot) : Infinity;
  return Math.max(0, Math.min(byCash, bySpace));
}

/** Throw away stock to free storage (no refund). Prevents soft-locks from
 *  over-buying non-spoiling items like cups/sugar. */
export function discardStock(state: GameState, item: ItemId, qty: number): GameState {
  const n = Math.floor(qty);
  if (n <= 0) return state;
  let remaining = n;
  const inventory: InventoryLot[] = [];
  let changed = false;
  for (const lot of state.inventory) {
    if (lot.item === item && remaining > 0) {
      const take = Math.min(lot.qty, remaining);
      remaining -= take;
      changed = true;
      if (lot.qty - take > 0) inventory.push({ ...lot, qty: lot.qty - take });
      continue;
    }
    inventory.push({ ...lot });
  }
  return changed ? { ...state, inventory } : state;
}

export type EquipmentStatus =
  | { kind: "owned" }
  | { kind: "buyable" }
  | { kind: "tooExpensive" }
  | { kind: "needsPrev"; prevName: string }
  | { kind: "locked"; reason: string };

/** Whether a specific equipment level can be bought right now (and why not). */
export function equipmentStatus(state: GameState, id: string): EquipmentStatus {
  const def = EQUIPMENT_BY_ID[id];
  if (!def) return { kind: "locked", reason: "unavailable" };
  if (state.ownedEquipmentIds.includes(id)) return { kind: "owned" };

  // Must own the previous level in the line first.
  if (def.level > 1) {
    const prev = EQUIPMENT.find((e) => e.line === def.line && e.level === def.level - 1);
    if (prev && !state.ownedEquipmentIds.includes(prev.id)) {
      return { kind: "needsPrev", prevName: prev.name };
    }
  }

  const u = def.unlock;
  if (u?.location && !state.unlockedLocationIds.includes(u.location)) {
    return { kind: "locked", reason: `Reach ${LOCATION_BY_ID[u.location]?.name ?? u.location}` };
  }
  if (u?.rep !== undefined && state.reputationGlobal < u.rep) {
    return { kind: "locked", reason: `Reputation ${u.rep}` };
  }
  if (u?.day !== undefined && state.day < u.day) {
    return { kind: "locked", reason: `Day ${u.day}` };
  }
  if (def.cost > state.cash) return { kind: "tooExpensive" };
  return { kind: "buyable" };
}

export function buyEquipment(state: GameState, id: string): GameState {
  if (equipmentStatus(state, id).kind !== "buyable") return state;
  const def = EQUIPMENT_BY_ID[id]!;
  return {
    ...state,
    cash: round2(state.cash - def.cost),
    todayEquipmentSpend: round2(state.todayEquipmentSpend + def.cost),
    ownedEquipmentIds: [...state.ownedEquipmentIds, id],
  };
}

export function hireStaff(state: GameState, tier: 1 | 2 | 3): GameState {
  if (state.staff.length >= TUNING.STAFF_CAP) return state;
  const def = STAFF_BY_TIER[tier];
  if (!def) return state;
  const id = `staff-${state.day}-${state.staff.length}-${tier}`;
  return {
    ...state,
    staff: [
      ...state.staff,
      {
        id,
        tier: def.tier,
        name: def.name,
        icon: def.icon,
        wage: def.wage,
        serveSpeedBonus: def.serveSpeedBonus,
        batchSpeedBonus: def.batchSpeedBonus,
        role: state.staff.length === 0 ? "MAKE" : "SERVE",
        xp: 0,
        level: 0,
      },
    ],
  };
}

/** Pay to train a staff member: a chunk of XP, re-leveling immediately. No-op
 *  when already at max level or unaffordable. */
export function trainStaff(state: GameState, id: string): GameState {
  if (TUNING.STAFF_TRAIN_COST > state.cash) return state;
  let changed = false;
  const staff = state.staff.map((s) => {
    if (s.id !== id || s.level >= TUNING.STAFF_MAX_LEVEL) return s;
    changed = true;
    const xp = s.xp + TUNING.STAFF_TRAIN_XP;
    return { ...s, xp, level: levelForXp(xp) };
  });
  if (!changed) return state;
  return {
    ...state,
    cash: round2(state.cash - TUNING.STAFF_TRAIN_COST),
    todayEquipmentSpend: round2(state.todayEquipmentSpend + TUNING.STAFF_TRAIN_COST),
    staff,
  };
}

export type ResearchStatus =
  | { kind: "done" }
  | { kind: "inProgress"; daysLeft: number }
  | { kind: "busy" } // another node is already cooking
  | { kind: "buyable" }
  | { kind: "tooExpensive" }
  | { kind: "locked"; reason: string };

/** Whether a research node can be started right now (and why not). */
export function researchStatus(state: GameState, id: string): ResearchStatus {
  const def = RESEARCH_BY_ID[id];
  if (!def) return { kind: "locked", reason: "unavailable" };
  const r = state.research ?? { completed: [], inProgress: null };
  if (r.completed.includes(id)) return { kind: "done" };
  if (r.inProgress?.id === id) return { kind: "inProgress", daysLeft: r.inProgress.daysLeft };
  if (r.inProgress) return { kind: "busy" };
  const missing = def.prereqs.find((p) => !r.completed.includes(p));
  if (missing) return { kind: "locked", reason: `Needs ${RESEARCH_BY_ID[missing]?.name ?? missing}` };
  if (def.cost > state.cash) return { kind: "tooExpensive" };
  return { kind: "buyable" };
}

/** Begin researching a node (one at a time); completes after `def.days` days. */
export function startResearch(state: GameState, id: string): GameState {
  if (researchStatus(state, id).kind !== "buyable") return state;
  const def = RESEARCH_BY_ID[id]!;
  return {
    ...state,
    cash: round2(state.cash - def.cost),
    todayEquipmentSpend: round2(state.todayEquipmentSpend + def.cost),
    research: { ...state.research, inProgress: { id, daysLeft: def.days } },
  };
}

export function fireStaff(state: GameState, id: string): GameState {
  const staff = state.staff.filter((s) => s.id !== id);
  if (staff.length === state.staff.length) return state;
  return { ...state, staff };
}

export function setStaffRole(state: GameState, id: string, role: StaffRole): GameState {
  let changed = false;
  const staff = state.staff.map((s) => {
    if (s.id !== id || s.role === role) return s;
    changed = true;
    return { ...s, role };
  });
  return changed ? { ...state, staff } : state;
}

export function setMarketing(state: GameState, spend: number): GameState {
  const s = Math.max(0, Math.round(spend));
  if (s === state.marketingSpend) return state;
  if (s > state.cash + state.marketingSpend) return state; // can't plan more than affordable
  return { ...state, marketingSpend: s };
}

/** Move to an already-unlocked location (free; takes effect immediately). */
export function moveLocation(state: GameState, id: string): GameState {
  if (id === state.currentLocationId) return state;
  if (!state.unlockedLocationIds.includes(id)) return state;
  return { ...state, currentLocationId: id };
}

/** Pay to unlock a new location, then move there (local rep seeded from global). */
export function unlockLocation(state: GameState, id: string): GameState {
  const def = LOCATION_BY_ID[id];
  if (!def || state.unlockedLocationIds.includes(id)) return state;
  if (def.unlockCost > state.cash) return state;
  const seededLocalRep = state.locationRep[id] ?? 0.5 * state.reputationGlobal;
  return {
    ...state,
    cash: round2(state.cash - def.unlockCost),
    unlockedLocationIds: [...state.unlockedLocationIds, id],
    currentLocationId: id,
    locationRep: { ...state.locationRep, [id]: seededLocalRep },
  };
}

export function takeLoan(state: GameState, amount: number): GameState {
  const a = Math.max(0, Math.round(amount));
  if (a <= 0) return state;
  const available = creditLimit(state) - state.debt;
  if (a > available) return state;
  return { ...state, debt: round2(state.debt + a), cash: round2(state.cash + a) };
}

export function repayLoan(state: GameState, amount: number): GameState {
  const a = Math.min(Math.max(0, Math.round(amount)), state.debt, state.cash);
  if (a <= 0) return state;
  return { ...state, debt: round2(state.debt - a), cash: round2(state.cash - a) };
}

// ---------------------------------------------------------------------------
// Prestige & perks (Phase L1)
// ---------------------------------------------------------------------------

export type PerkStatus =
  | { kind: "owned" }
  | { kind: "buyable" }
  | { kind: "tooExpensive" }
  | { kind: "needsPrev"; prevName: string };

/** Whether a perk can be bought right now (and why not). */
export function perkStatus(state: GameState, id: string): PerkStatus | null {
  const def = PERK_BY_ID[id];
  if (!def) return null;
  if ((state.ownedPerkIds ?? []).includes(id)) return { kind: "owned" };
  if (def.prereq && !(state.ownedPerkIds ?? []).includes(def.prereq)) {
    return { kind: "needsPrev", prevName: PERK_BY_ID[def.prereq]?.name ?? def.prereq };
  }
  if (def.cost > (state.prestige ?? 0)) return { kind: "tooExpensive" };
  return { kind: "buyable" };
}

/** Spend Prestige on a permanent perk (each unlocks a recurring decision). */
export function buyPerk(state: GameState, id: string): GameState {
  if (perkStatus(state, id)?.kind !== "buyable") return state;
  const def = PERK_BY_ID[id]!;
  return {
    ...state,
    prestige: round2((state.prestige ?? 0) - def.cost),
    ownedPerkIds: [...(state.ownedPerkIds ?? []), id],
  };
}

/** Cash cost of the next single Prestige point given the balance held (pure). */
export function nextPrestigeCost(state: GameState): number {
  return Math.round(
    TUNING.PRESTIGE_CONVERT_BASE * (1 + TUNING.PRESTIGE_CONVERT_GROWTH * (state.prestige ?? 0)),
  );
}

/**
 * Convert cash into up to `n` Prestige points at an escalating per-point cost
 * (pure function of the running balance). Gives a cash-rich late game a sink.
 * No-op if the first point is unaffordable.
 */
export function convertCashToPrestige(state: GameState, n = 1): GameState {
  let cash = state.cash;
  let prestige = state.prestige ?? 0;
  let bought = 0;
  for (let i = 0; i < n; i++) {
    const cost = Math.round(
      TUNING.PRESTIGE_CONVERT_BASE * (1 + TUNING.PRESTIGE_CONVERT_GROWTH * prestige),
    );
    if (cash < cost) break;
    cash -= cost;
    prestige += 1;
    bought++;
  }
  if (bought === 0) return state;
  return { ...state, cash: round2(cash), prestige };
}

// ---------------------------------------------------------------------------
// Weekly contracts (Phase L2)
// ---------------------------------------------------------------------------

/** Accept an offered contract: it becomes active with a deadline and a baseline
 *  snapshot of its tracked stat. No-op if the active slots are full / unknown. */
export function acceptContract(state: GameState, offerId: string): GameState {
  const offer = state.contracts.offers.find((o) => o.id === offerId);
  if (!offer) return state;
  if (state.contracts.active.length >= TUNING.CONTRACT_ACTIVE_CAP) return state;
  const def = CONTRACT_BY_ID[offer.defId];
  if (!def) return state;
  // challenge: an N-day window [day, day+N-1] (expires when the day passes it).
  // catering: a single DUE day (day + leadDays) when the cohort arrives.
  const deadlineDay =
    def.kind === "challenge" ? state.day + def.days - 1 : state.day + def.leadDays;
  const baseline = def.kind === "challenge" ? statValue(state, def.stat) : 0;
  const accepted = { ...offer, acceptedDay: state.day, deadlineDay, baseline };
  return {
    ...state,
    contracts: {
      ...state.contracts,
      offers: state.contracts.offers.filter((o) => o.id !== offerId),
      active: [...state.contracts.active, accepted],
    },
  };
}

// ---------------------------------------------------------------------------
function mergeLot(
  inv: InventoryLot[],
  item: ItemId,
  qty: number,
  grade: ItemGrade = "standard",
): InventoryLot[] {
  const out = inv.map((l) => ({ ...l }));
  // Standard and premium are distinct lots (different quality); merge like-grade.
  const fresh = out.find(
    (l) => l.item === item && l.ageDays === 0 && (l.grade ?? "standard") === grade,
  );
  if (fresh) fresh.qty += qty;
  else out.push(grade === "premium" ? { item, qty, ageDays: 0, grade } : { item, qty, ageDays: 0 });
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
