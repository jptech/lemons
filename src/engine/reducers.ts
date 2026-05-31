import { EVENT_BY_ID } from "../data/events";
import { EQUIPMENT, EQUIPMENT_BY_ID } from "../data/equipment";
import { LOCATION_BY_ID } from "../data/locations";
import { STAFF_BY_TIER } from "../data/staff";
import { creditLimit, derive, usedStorage } from "./derive";
import { TUNING } from "./tuning";
import { clamp } from "./economy";
import type {
  GameState,
  InventoryLot,
  ItemId,
  Recipe,
  StaffRole,
} from "./types";

/** Effective per-unit buy price for an item today (events can spike lemons). */
export function itemBuyPrice(state: GameState, item: ItemId): number {
  let unit = TUNING.ITEM_COST[item];
  if (item === "lemon" && state.activeEventId) {
    const fx = EVENT_BY_ID[state.activeEventId]?.effect;
    if (fx?.lemonPriceMult) unit *= fx.lemonPriceMult;
  }
  return unit;
}

export function setPrice(state: GameState, price: number): GameState {
  const p = Math.max(0, Math.round(price * 100) / 100);
  if (p === state.recipe.pricePerCup) return state;
  return { ...state, recipe: { ...state.recipe, pricePerCup: p } };
}

export function setRecipe(state: GameState, patch: Partial<Recipe>): GameState {
  const recipe = { ...state.recipe, ...patch };
  // Keep parts sane (non-negative; water at least 1 to avoid divide-by-zero).
  recipe.lemons = clamp(Math.round(recipe.lemons), 0, 20);
  recipe.sugar = clamp(Math.round(recipe.sugar), 0, 20);
  recipe.ice = clamp(Math.round(recipe.ice), 0, 20);
  recipe.water = clamp(Math.round(recipe.water), 1, 30);
  recipe.pricePerCup = Math.max(0, Math.round(recipe.pricePerCup * 100) / 100);
  return { ...state, recipe };
}

/** Buy `qty` of an item, respecting cash and storage capacity. */
export function buyStock(state: GameState, item: ItemId, qty: number): GameState {
  const n = Math.floor(qty);
  if (n <= 0) return state;
  const unit = itemBuyPrice(state, item);
  const cost = unit * n;
  if (cost > state.cash) return state;
  const cap = derive(state).storageCapacity;
  if (usedStorage(state) + n * TUNING.SLOT_COST[item] > cap + 1e-9) return state;

  const inventory = mergeLot(state.inventory, item, n);
  return {
    ...state,
    cash: round2(state.cash - cost),
    todayStockSpend: round2(state.todayStockSpend + cost),
    inventory,
  };
}

/** Largest quantity of an item affordable AND fit-able right now. */
export function maxBuyable(state: GameState, item: ItemId): number {
  const unit = itemBuyPrice(state, item);
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
      },
    ],
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
function mergeLot(inv: InventoryLot[], item: ItemId, qty: number): InventoryLot[] {
  const out = inv.map((l) => ({ ...l }));
  const fresh = out.find((l) => l.item === item && l.ageDays === 0);
  if (fresh) fresh.qty += qty;
  else out.push({ item, qty, ageDays: 0 });
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
