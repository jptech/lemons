import { describe, expect, test } from "bun:test";
import {
  bulkFactor,
  buyStock,
  freshSupplier,
  gradeQualityBonus,
  itemBuyPrice,
  newGame,
  nextBulkTier,
  setRecipe,
  simulateDay,
  stepSupplierPrices,
  TUNING,
  unitPrice,
  type GameState,
} from "../src/engine";
import { Rng } from "../src/engine/rng";
import { inventoryQty } from "../src/engine/derive";

function buyAll(s: GameState, grade: "standard" | "premium" = "standard"): GameState {
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
  s = buyStock(s, "lemon", 80, grade);
  s = buyStock(s, "sugar", 80, grade);
  s = buyStock(s, "ice", 120);
  s = buyStock(s, "cup", 160);
  return s;
}

describe("supplier market", () => {
  test("price walk stays in bounds, mean-reverts, and is deterministic", () => {
    const run = () => {
      const rng = new Rng(99);
      let m = { priceIndex: { lemon: 1.5, sugar: 1.5, ice: 1.5, cup: 1.5 } };
      for (let i = 0; i < 40; i++) m = stepSupplierPrices(m, rng);
      return m;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b); // deterministic from the seed
    for (const item of ["lemon", "sugar", "ice", "cup"] as const) {
      expect(a.priceIndex[item]).toBeGreaterThanOrEqual(TUNING.SUPPLIER_MIN - 1e-9);
      expect(a.priceIndex[item]).toBeLessThanOrEqual(TUNING.SUPPLIER_MAX + 1e-9);
    }
    // Mean reversion pulls an extreme start back toward ~1 on average.
    expect(a.priceIndex.cup).toBeLessThan(1.4); // low-vol item settles near 1
  });

  test("bulk discounts kick in at the configured tiers", () => {
    expect(bulkFactor(10)).toBe(1);
    expect(bulkFactor(50)).toBeLessThan(1);
    expect(bulkFactor(250)).toBeLessThan(bulkFactor(120));
    expect(nextBulkTier(10)?.min).toBe(50);
    expect(nextBulkTier(10_000)).toBeNull();
  });

  test("a big single purchase costs less per unit than two small ones", () => {
    const s = newGame(3, "sandbox");
    const bulk = newGame(3, "sandbox");
    const a = buyStock(s, "cup", 50); // earns the 50+ tier
    const b = buyStock(s, "cup", 10); // below any tier
    const unitBulk = (s.cash - a.cash) / 50;
    const unitSmall = (s.cash - b.cash) / 10;
    expect(unitBulk).toBeLessThan(unitSmall);
    void bulk;
  });

  test("premium taste solids cost more but raise the quality ceiling", () => {
    const std = unitPrice(freshSupplier(), "lemon", "standard");
    const prem = unitPrice(freshSupplier(), "lemon", "premium");
    expect(prem).toBeGreaterThan(std);

    // gradeQualityBonus scales with the premium fraction of lemon+sugar.
    expect(gradeQualityBonus([{ item: "lemon", qty: 100, ageDays: 0, grade: "premium" }])).toBeCloseTo(
      TUNING.GRADE_QUALITY_BONUS,
      6,
    );
    expect(gradeQualityBonus([{ item: "lemon", qty: 100, ageDays: 0 }])).toBe(0);
    // Ice/cups don't count toward the taste bonus.
    expect(gradeQualityBonus([{ item: "cup", qty: 100, ageDays: 0, grade: "premium" }])).toBe(0);
  });

  test("a premium-ingredient day earns better reviews than a standard one", () => {
    const stdRes = simulateDay(buyAll(newGame(21, "sandbox"), "standard")).result;
    const premRes = simulateDay(buyAll(newGame(21, "sandbox"), "premium")).result;
    expect(premRes.served).toBeGreaterThan(0);
    // Same seed/plan, only ingredient grade differs → higher satisfaction.
    expect(premRes.avgStars).toBeGreaterThanOrEqual(stdRes.avgStars);
    expect(premRes.satDrivers.quality).toBeGreaterThan(stdRes.satDrivers.quality);
  });

  test("premium and standard stock are kept as distinct lots", () => {
    let s = newGame(5, "sandbox");
    s = buyStock(s, "lemon", 20, "standard");
    s = buyStock(s, "lemon", 20, "premium");
    const lemonLots = s.inventory.filter((l) => l.item === "lemon");
    expect(lemonLots.length).toBe(2);
    expect(inventoryQty(s, "lemon")).toBe(40);
    expect(lemonLots.some((l) => l.grade === "premium")).toBe(true);
  });

  test("itemBuyPrice tracks the market index after the day rolls over", () => {
    const s0 = newGame(8, "sandbox");
    expect(itemBuyPrice(s0, "lemon")).toBeCloseTo(TUNING.ITEM_COST.lemon, 9); // index 1.0 on day 1
    const s1 = simulateDay(buyAll(s0)).state;
    expect(itemBuyPrice(s1, "lemon")).toBeCloseTo(
      TUNING.ITEM_COST.lemon * s1.supplier.priceIndex.lemon,
      9,
    );
  });
});
