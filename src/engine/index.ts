/**
 * Public engine API — the contract the UI imports. Everything here is pure and
 * deterministic from `GameState.seed` + the player's action sequence.
 */
import { DaySim } from "./dayLoop";
import type { DayResult, GameState } from "./types";

export { newGame } from "./setup";
export { DaySim } from "./dayLoop";

export {
  setPrice,
  setRecipe,
  buyStock,
  discardStock,
  maxBuyable,
  itemBuyPrice,
  buyEquipment,
  equipmentStatus,
  hireStaff,
  fireStaff,
  setStaffRole,
  setMarketing,
  moveLocation,
  unlockLocation,
  takeLoan,
  repayLoan,
} from "./reducers";

export {
  derive,
  ownedEquipment,
  usedStorage,
  inventoryQty,
  creditLimit,
  effectiveReputation,
  forecastConfidence,
  blendRep,
  uniformFacets,
  effectiveFacets,
} from "./derive";
export type { EquipmentStatus } from "./reducers";

export {
  expectedCustomers,
  priceTolerance,
  priceDemandMult,
  recipeQuality,
  idealRecipe,
  weatherDemandMult,
  weatherPriceMult,
  marketingShortTerm,
} from "./economy";

export {
  freshSupplier,
  stepSupplierPrices,
  itemHasPremium,
  unitPrice,
  bulkFactor,
  nextBulkTier,
  gradeQualityBonus,
} from "./supplier";

export { TUNING } from "./tuning";

export * from "./types";

/** Create a live, tickable simulation of today's open period. */
export function createDay(state: GameState): DaySim {
  return new DaySim(state);
}

/** Run today's full day synchronously and return next-day state + the result. */
export function simulateDay(state: GameState): { state: GameState; result: DayResult } {
  return new DaySim(state).finalize();
}
