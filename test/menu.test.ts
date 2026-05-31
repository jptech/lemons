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
