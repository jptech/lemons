import { describe, expect, test } from "bun:test";
import {
  buyStock,
  newGame,
  setRecipe,
  simulateDay,
  toggleMenuProduct,
  primaryProduct,
  productStateOf,
  type GameState,
} from "../src/engine";
import { inventoryByGrade, productSplit, servableCups } from "../src/store/selectors";

function stocked(s: GameState): GameState {
  s = buyStock(s, "lemon", 120);
  s = buyStock(s, "sugar", 120);
  s = buyStock(s, "ice", 160);
  s = buyStock(s, "cup", 220);
  return s;
}

describe("menu foundation", () => {
  test("a new game starts with just classic; the products map holds both", () => {
    const s = newGame(1, "sandbox");
    expect(s.menu).toEqual(["classic"]);
    expect(s.products.classic).toBeDefined();
    expect(s.products.pink).toBeDefined(); // available to add, not yet on the menu
  });

  test("toggle adds/removes the second product but never drops the primary", () => {
    let s = newGame(1, "sandbox");
    s = toggleMenuProduct(s, "pink");
    expect(s.menu).toEqual(["classic", "pink"]);
    // Can't remove the primary.
    s = toggleMenuProduct(s, "classic");
    expect(s.menu).toContain("classic");
    // Remove the secondary.
    s = toggleMenuProduct(s, "pink");
    expect(s.menu).toEqual(["classic"]);
  });

  test("each product has an independent recipe", () => {
    let s = newGame(1, "sandbox");
    s = toggleMenuProduct(s, "pink");
    s = setRecipe(s, { sugar: 9 }, "pink");
    expect(productStateOf(s, "pink").recipe.sugar).toBe(9);
    expect(primaryProduct(s).recipe.sugar).not.toBe(9); // classic untouched
  });

  test("a two-product day sells both drinks and reports a per-product breakdown", () => {
    let s = newGame(7, "sandbox");
    s = toggleMenuProduct(s, "pink");
    s = stocked(s);
    const { result } = simulateDay(s);
    expect(result.served).toBeGreaterThan(0);
    expect(result.perProduct?.classic?.cupsSold ?? 0).toBeGreaterThan(0);
    expect(result.perProduct?.pink?.cupsSold ?? 0).toBeGreaterThan(0);
    // Sales across products reconcile with the headline cups sold.
    const sum =
      (result.perProduct?.classic?.cupsSold ?? 0) + (result.perProduct?.pink?.cupsSold ?? 0);
    expect(sum).toBe(result.cupsSold);
  });

  test("adding the second product is deterministic from the seed", () => {
    const run = () => {
      let s = newGame(99, "sandbox");
      s = toggleMenuProduct(s, "pink");
      s = stocked(s);
      return simulateDay(s).result;
    };
    const a = run();
    const b = run();
    expect(a.cupsSold).toBe(b.cupsSold);
    expect(a.perProduct).toEqual(b.perProduct);
  });

  test("each product keeps its own quality EMA and price feedback after a day", () => {
    let s = newGame(11, "sandbox");
    s = toggleMenuProduct(s, "pink");
    // Make pink deliberately bad, classic good, then play.
    s = setRecipe(s, { lemons: 0, sugar: 20, water: 1, ice: 0 }, "pink");
    s = stocked(s);
    const next = simulateDay(s).state;
    // Both products retained independent state entries.
    expect(next.products.classic.qualityScoreEMA).toBeGreaterThan(
      next.products.pink.qualityScoreEMA,
    );
  });
});

describe("standard vs premium stock & per-product forecasting", () => {
  test("spoilage preserves ingredient grade — lots age as distinct grades", () => {
    let s = newGame(3, "sandbox");
    s = buyStock(s, "lemon", 20, "standard");
    s = buyStock(s, "lemon", 20, "premium");
    // No cups bought → nothing can be sold → lemons simply age overnight.
    const next = simulateDay(s).state;
    const lemonLots = next.inventory.filter((l) => l.item === "lemon");
    expect(lemonLots.length).toBe(2); // standard + premium kept separate
    expect(lemonLots.every((l) => l.ageDays === 1)).toBe(true);
    expect(lemonLots.some((l) => l.grade === "premium")).toBe(true);
    expect(lemonLots.some((l) => (l.grade ?? "standard") === "standard")).toBe(true);
  });

  test("inventoryByGrade reports the standard/premium split", () => {
    let s = newGame(1, "sandbox");
    s = buyStock(s, "lemon", 30, "standard");
    s = buyStock(s, "lemon", 10, "premium");
    const split = inventoryByGrade(s, "lemon");
    expect(split.standard).toBe(30);
    expect(split.premium).toBe(10);
  });

  test("productSplit sums to 1 and gives the novelty drink a real share", () => {
    let s = newGame(1, "sandbox");
    s = toggleMenuProduct(s, "pink");
    const split = productSplit(s);
    expect(split.reduce((a, b) => a + b.fraction, 0)).toBeCloseTo(1, 6);
    const pink = split.find((x) => x.id === "pink");
    expect(pink?.fraction).toBeGreaterThan(0.1);
    expect(pink?.fraction).toBeLessThan(0.9);
  });

  test("servableCups accounts for both products sharing the same stock", () => {
    let oneP = newGame(1, "sandbox");
    oneP = buyStock(oneP, "lemon", 80);
    oneP = buyStock(oneP, "sugar", 80);
    oneP = buyStock(oneP, "ice", 120);
    oneP = buyStock(oneP, "cup", 200);
    expect(servableCups(oneP)).toBeGreaterThan(0);
    // With a second (sweeter, more-sugar) product on the menu, the same stock
    // still yields a sensible, positive cup estimate.
    const twoP = toggleMenuProduct(oneP, "pink");
    expect(servableCups(twoP)).toBeGreaterThan(0);
  });
});
