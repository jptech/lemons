import { describe, expect, test } from "bun:test";
import { buyStock, newGame, setRecipe, simulateDay } from "../src/engine";
import { validateImport } from "../src/persistence/saveLoad";

function playedGame() {
  let s = newGame(8080, "campaign");
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.6 });
  s = buyStock(s, "lemon", 40);
  s = buyStock(s, "ice", 60);
  s = buyStock(s, "cup", 100);
  return simulateDay(s).state;
}

describe("persistence", () => {
  test("GameState survives a JSON round-trip unchanged", () => {
    const g = playedGame();
    const clone = JSON.parse(JSON.stringify(g));
    expect(clone).toEqual(g);
  });

  test("validateImport accepts a real game (raw and enveloped)", () => {
    const g = playedGame();
    expect(validateImport(JSON.parse(JSON.stringify(g)))?.day).toBe(g.day);
    expect(validateImport({ v: 1, game: JSON.parse(JSON.stringify(g)) })?.cash).toBe(g.cash);
  });

  test("validateImport rejects junk", () => {
    expect(validateImport(null)).toBeNull();
    expect(validateImport({ hello: "world" })).toBeNull();
    expect(validateImport(42)).toBeNull();
  });

  test("a resumed game continues deterministically", () => {
    // Play 3 days, "save" (clone) after day 1, then continue from the clone.
    let s = newGame(31337, "sandbox");
    const stock = (g: typeof s) => buyStock(buyStock(buyStock(g, "lemon", 50), "ice", 70), "cup", 120);

    s = simulateDay(stock(s)).state;
    const saved = JSON.parse(JSON.stringify(s)); // the "save file"

    const direct1 = simulateDay(stock(s)).state;
    const direct2 = simulateDay(stock(direct1)).state;

    const resumed1 = simulateDay(stock(saved)).state;
    const resumed2 = simulateDay(stock(resumed1)).state;

    expect(resumed2.history).toEqual(direct2.history);
    expect(resumed2.cash).toBe(direct2.cash);
  });
});
