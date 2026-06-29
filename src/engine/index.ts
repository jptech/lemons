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
  toggleMenuProduct,
  buyStock,
  discardStock,
  maxBuyable,
  itemBuyPrice,
  buyEquipment,
  equipmentStatus,
  hireStaff,
  fireStaff,
  setStaffRole,
  setStaffResting,
  trainStaff,
  startResearch,
  researchStatus,
  setMarketing,
  moveLocation,
  unlockLocation,
  takeLoan,
  repayLoan,
  menuCap,
  buyPerk,
  perkStatus,
  convertCashToPrestige,
  nextPrestigeCost,
  acceptContract,
  buyoutRival,
} from "./reducers";
export { stepRival, rivalBuyoutCost } from "./rival";

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
  levelForXp,
  nextLevelXp,
  effectiveStaffBonus,
} from "./derive";
export type { EquipmentStatus, ResearchStatus, PerkStatus } from "./reducers";

export {
  expectedCustomers,
  priceTolerance,
  priceDemandMult,
  recipeQuality,
  idealRecipe,
  weatherDemandMult,
  weatherPriceMult,
  marketingShortTerm,
  rivalShare,
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

export {
  freshProducts,
  freshProductState,
  primaryProductId,
  primaryProduct,
  productStateOf,
  activeProducts,
  productTaste,
} from "./menu";

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
