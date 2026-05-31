/**
 * Supplier market — a tiny, pure, seeded model that turns "buy stock" into a
 * sourcing decision: prices drift day to day, larger purchases earn a bulk
 * discount, and premium-grade taste solids raise the recipe's quality ceiling.
 * No DOM/clock/Math.random — randomness comes from the engine Rng.
 */
import { TUNING } from "./tuning";
import { clamp } from "./economy";
import type { ItemGrade, ItemId, InventoryLot, SupplierState } from "./types";
import { STOCK_ITEMS } from "./types";
import type { Rng } from "./rng";

/** A neutral market (all prices at their baseline). */
export function freshSupplier(): SupplierState {
  return { priceIndex: { lemon: 1, sugar: 1, ice: 1, cup: 1 } };
}

/**
 * Advance the market one day: each item's index mean-reverts toward 1.0 and
 * takes a seeded gaussian step sized by its volatility. Consumes exactly one
 * gaussian draw per item, in STOCK_ITEMS order — called once at settlement so
 * playback speed never changes the result.
 */
export function stepSupplierPrices(prev: SupplierState, rng: Rng): SupplierState {
  const priceIndex = { ...prev.priceIndex };
  for (const item of STOCK_ITEMS) {
    const cur = priceIndex[item] ?? 1;
    const reverted = 1 + (cur - 1) * (1 - TUNING.SUPPLIER_REVERSION);
    const vol = TUNING.SUPPLIER_VOL[item] ?? 0;
    const next = reverted + rng.gaussian(0, vol);
    priceIndex[item] = clamp(next, TUNING.SUPPLIER_MIN, TUNING.SUPPLIER_MAX);
  }
  return { priceIndex };
}

/** Does this item offer a premium grade worth paying for? */
export function itemHasPremium(item: ItemId): boolean {
  return TUNING.GRADE_COST_MULT[item] !== undefined;
}

/** The per-unit sticker price for an item at a grade today (before bulk discount). */
export function unitPrice(market: SupplierState, item: ItemId, grade: ItemGrade = "standard"): number {
  const base = TUNING.ITEM_COST[item] * (market.priceIndex[item] ?? 1);
  const gradeMult = grade === "premium" ? TUNING.GRADE_COST_MULT[item] ?? 1 : 1;
  return base * gradeMult;
}

/** Bulk-discount multiplier on the unit price for a single purchase of `qty`. */
export function bulkFactor(qty: number): number {
  for (const tier of TUNING.BULK_TIERS) {
    if (qty >= tier.min) return tier.mult;
  }
  return 1;
}

/** The next bulk breakpoint above `qty` (for a UI hint), or null if maxed. */
export function nextBulkTier(qty: number): { min: number; mult: number } | null {
  // BULK_TIERS is high→low; find the smallest min that is still above qty.
  const ascending = [...TUNING.BULK_TIERS].sort((a, b) => a.min - b.min);
  for (const tier of ascending) {
    if (qty < tier.min) return tier;
  }
  return null;
}

/**
 * Day-level recipe-quality bonus from premium taste solids in the inventory the
 * player brings into the day: the premium fraction of (lemon + sugar) units,
 * scaled by GRADE_QUALITY_BONUS. A fair approximation of "better ingredients →
 * better taste" without threading grades through every FIFO sale.
 */
export function gradeQualityBonus(inv: InventoryLot[]): number {
  let premium = 0;
  let total = 0;
  for (const lot of inv) {
    if (lot.item !== "lemon" && lot.item !== "sugar") continue;
    total += lot.qty;
    if (lot.grade === "premium") premium += lot.qty;
  }
  if (total <= 0) return 0;
  return TUNING.GRADE_QUALITY_BONUS * (premium / total);
}
