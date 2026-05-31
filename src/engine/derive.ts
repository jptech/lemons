import { EQUIPMENT_BY_ID } from "../data/equipment";
import type { EquipmentDef, GameState } from "./types";
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
