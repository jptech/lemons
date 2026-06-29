import { EQUIPMENT_BY_ID } from "../data/equipment";
import { RESEARCH_BY_ID } from "../data/research";
import type { EquipmentDef, GameState, RepFacets, Staff } from "./types";
import { TUNING } from "./tuning";

/**
 * Aggregated, derived stats from owned equipment + staff count. Single source
 * of truth for capacity and the global (equipment) service multipliers. Staff
 * per-station bonuses are layered on top in the day loop.
 */
export interface Derived {
  storageCapacity: number;
  /** Global serve-speed multiplier from equipment (starts at 1, effects add). */
  serveSpeedMult: number;
  batchSpeedMult: number;
  batchSizeMult: number;
  patienceMult: number;
  marketingFloor: number;
  /** Fraction of ice that survives overnight (0 = all melts). */
  iceRetention: number;
  /** Forecast accuracy 0..~0.98. */
  forecastAccuracy: number;
  /** Service stations: 1 (player) + one per staff. */
  stationCount: number;
  /** Ice produced per in-game minute during the open period. */
  iceRegenPerMin: number;
  /** Demand/pricing forecast confidence from research equipment (0..~0.8). */
  researchConfidence: number;
  /** Multiplier on regulars-pool growth (loyalty program). */
  regularsGainMult: number;
}

/** The single applicable def for each owned line (highest level wins). */
export function ownedEquipment(state: GameState): EquipmentDef[] {
  const bestByLine = new Map<string, EquipmentDef>();
  for (const id of state.ownedEquipmentIds) {
    const e = EQUIPMENT_BY_ID[id];
    if (!e) continue;
    const cur = bestByLine.get(e.line);
    if (!cur || e.level > cur.level) bestByLine.set(e.line, e);
  }
  return [...bestByLine.values()];
}

export function derive(state: GameState): Derived {
  let storage = TUNING.BASE_STORAGE_SLOTS;
  let serve = 1;
  let batchSpeed = 1;
  let batchSize = 1;
  let patience = 1;
  let marketingFloor = 0;
  let iceRetention = 0;
  let forecastAccuracy = TUNING.FORECAST_ACCURACY;
  let iceRegenPerMin = 0;
  let researchConfidence = 0;
  let regularsGainMult = 1;

  // Effects are TOTALS at the owned level, so only the top level of each line
  // contributes (lines stack, levels replace).
  for (const e of ownedEquipment(state)) {
    const fx = e.effects;
    if (fx.storageSlots) storage += fx.storageSlots;
    if (fx.serveSpeedMult) serve += fx.serveSpeedMult;
    if (fx.batchSpeedMult) batchSpeed += fx.batchSpeedMult;
    if (fx.batchSizeMult) batchSize += fx.batchSizeMult;
    if (fx.patienceMult) patience += fx.patienceMult;
    if (fx.marketingFloor) marketingFloor += fx.marketingFloor;
    if (fx.iceRetention) iceRetention = Math.max(iceRetention, fx.iceRetention);
    if (fx.forecastAccuracy) forecastAccuracy += fx.forecastAccuracy;
    if (fx.iceRegenPerMin) iceRegenPerMin += fx.iceRegenPerMin;
    if (fx.forecastConfidence) researchConfidence += fx.forecastConfidence;
    if (fx.regularsGainMult) regularsGainMult *= fx.regularsGainMult;
  }

  // Completed research stacks on the same levers (it's a separate progression
  // that costs days as well as cash). Folding here keeps the forecast honest.
  for (const id of state.research?.completed ?? []) {
    const fx = RESEARCH_BY_ID[id]?.effect;
    if (!fx) continue;
    if (fx.forecastConfidence) researchConfidence += fx.forecastConfidence;
    if (fx.regularsGainMult) regularsGainMult *= fx.regularsGainMult;
    if (fx.marketingFloor) marketingFloor += fx.marketingFloor;
  }

  return {
    storageCapacity: storage,
    serveSpeedMult: serve,
    batchSpeedMult: batchSpeed,
    batchSizeMult: batchSize,
    patienceMult: patience,
    marketingFloor,
    iceRetention,
    forecastAccuracy: Math.min(0.98, forecastAccuracy),
    stationCount: 1 + state.staff.length,
    iceRegenPerMin,
    researchConfidence,
    regularsGainMult,
  };
}

/** The level earned by a given cumulative XP (capped at STAFF_MAX_LEVEL). */
export function levelForXp(xp: number): number {
  const thresholds = TUNING.STAFF_XP_FOR_LEVEL;
  let level = 0;
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]!) level = i;
  }
  return Math.min(level, TUNING.STAFF_MAX_LEVEL);
}

/** XP needed for the next level, or null if already maxed (for UI bars). */
export function nextLevelXp(level: number): number | null {
  const thresholds = TUNING.STAFF_XP_FOR_LEVEL;
  if (level >= TUNING.STAFF_MAX_LEVEL || level + 1 >= thresholds.length) return null;
  return thresholds[level + 1]!;
}

/** A staff member's effective speed bonuses including experience (level) gains. */
export function effectiveStaffBonus(s: Staff): { serve: number; batch: number } {
  const level = s.level ?? 0;
  return {
    serve: s.serveSpeedBonus + level * TUNING.STAFF_LEVEL_SERVE_GAIN,
    batch: s.batchSpeedBonus + level * TUNING.STAFF_LEVEL_BATCH_GAIN,
  };
}

/** Speed multiplier for a staffer's station given fatigue (1 when fresh, lower
 *  when tired). Phase L4 — keeps a worn-out crew genuinely worse than a fresh one. */
export function fatigueMult(fatigue: number): number {
  return 1 - TUNING.FATIGUE_SPEED_PENALTY * (Math.max(0, Math.min(100, fatigue)) / 100);
}

/** Slots consumed by the current inventory. */
export function usedStorage(state: GameState): number {
  let used = 0;
  for (const lot of state.inventory) {
    used += lot.qty * (TUNING.SLOT_COST[lot.item] ?? 0);
  }
  return used;
}

/** Total quantity of an item across all lots. */
export function inventoryQty(state: GameState, item: string): number {
  let n = 0;
  for (const lot of state.inventory) if (lot.item === item) n += lot.qty;
  return n;
}

/** Loan credit limit, scaling with reputation. */
export function creditLimit(state: GameState): number {
  return TUNING.CREDIT_BASE + state.reputationGlobal * TUNING.CREDIT_PER_REP;
}

export function effectiveReputation(state: GameState): number {
  const local = state.locationRep[state.currentLocationId] ?? 0;
  return 0.4 * state.reputationGlobal + 0.6 * local;
}

/** Weighted blend of a facet vector → the overall ★ (0..100). */
export function blendRep(f: RepFacets): number {
  const w = TUNING.REP_BLEND;
  return w.taste * f.taste + w.service * f.service + w.value * f.value + w.buzz * f.buzz;
}

/** A neutral facet vector seeded at a single value (for new games / migration). */
export function uniformFacets(v: number): RepFacets {
  return { taste: v, service: v, value: v, buzz: v };
}

/**
 * Effective facets the customer feels = 0.4 global + 0.6 local (same blend the
 * overall reputation uses), so a facet is "effective" exactly like the scalar
 * rep. Falls back to the cached scalar rep if facets are missing (old saves
 * mid-migration) so callers never see NaN.
 */
export function effectiveFacets(state: GameState): RepFacets {
  const g = state.repFacets ?? uniformFacets(state.reputationGlobal);
  const l =
    state.locationRepFacets?.[state.currentLocationId] ??
    uniformFacets(state.locationRep[state.currentLocationId] ?? 0);
  return {
    taste: 0.4 * g.taste + 0.6 * l.taste,
    service: 0.4 * g.service + 0.6 * l.service,
    value: 0.4 * g.value + 0.6 * l.value,
    buzz: 0.4 * g.buzz + 0.6 * l.buzz,
  };
}

/**
 * How well the player can predict demand & pricing (0..1). Built from research
 * equipment, experience (days played), and reputation (familiarity). Higher
 * confidence → narrower forecasts AND lower real day-to-day variance.
 */
export function forecastConfidence(state: GameState): number {
  const research = derive(state).researchConfidence;
  const experience = Math.min(TUNING.CONFIDENCE_DAY_MAX, state.day * TUNING.CONFIDENCE_DAY_RATE);
  const rep = (state.reputationGlobal / 100) * TUNING.CONFIDENCE_REP_WEIGHT;
  return Math.max(0, Math.min(1, research + experience + rep));
}
