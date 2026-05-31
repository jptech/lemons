import { describe, expect, test } from "bun:test";
import {
  buyStock,
  createDay,
  hireStaff,
  newGame,
  setRecipe,
  simulateDay,
  type GameState,
} from "../src/engine";
import { inventoryQty } from "../src/engine/derive";

/** A fixed morning strategy, used to make days reproducible in tests. */
function planMorning(s: GameState): GameState {
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
  s = buyStock(s, "lemon", 40);
  s = buyStock(s, "sugar", 40);
  s = buyStock(s, "cup", 120);
  s = buyStock(s, "ice", 80);
  return s;
}

function playDays(seed: number, days: number): GameState {
  let s = newGame(seed, "sandbox");
  for (let i = 0; i < days && !s.gameOver; i++) {
    s = planMorning(s);
    s = simulateDay(s).state;
  }
  return s;
}

describe("determinism", () => {
  test("newGame is identical for the same seed", () => {
    expect(newGame(2024)).toEqual(newGame(2024));
  });

  test("a fixed strategy replays to a byte-identical DayResult", () => {
    const a = simulateDay(planMorning(newGame(555, "sandbox")));
    const b = simulateDay(planMorning(newGame(555, "sandbox")));
    expect(a.result).toEqual(b.result);
    expect(a.state).toEqual(b.state);
  });

  test("an 8-day run reproduces exactly", () => {
    const a = playDays(777, 8);
    const b = playDays(777, 8);
    expect(a.history).toEqual(b.history);
    expect(a.cash).toBe(b.cash);
  });
});

describe("a normal day actually sells lemonade", () => {
  const { result } = simulateDay(planMorning(newGame(123, "sandbox")));
  test("serves customers and earns revenue", () => {
    expect(result.served).toBeGreaterThan(0);
    expect(result.revenue).toBeGreaterThan(0);
    expect(result.cupsSold).toBe(result.served);
  });
  test("records reviews and satisfaction drivers", () => {
    expect(result.avgStars).toBeGreaterThan(0);
    expect(result.satDrivers.quality).toBeGreaterThan(0);
  });
});

describe("spoilage", () => {
  test("unused ice melts fully overnight", () => {
    let s = newGame(321, "sandbox");
    s = buyStock(s, "ice", 50); // ice only → no batches made, nothing consumed
    const iceBought = inventoryQty(s, "ice");
    const { state, result } = simulateDay(s);
    expect(inventoryQty(state, "ice")).toBe(0); // no insulated cooler → all melts
    expect(result.spoiled.ice).toBe(iceBought);
  });

  test("sugar persists and lemons survive a day", () => {
    let s = newGame(321, "sandbox");
    s = buyStock(s, "sugar", 30);
    s = buyStock(s, "lemon", 10);
    const { state } = simulateDay(s);
    expect(inventoryQty(state, "sugar")).toBeGreaterThan(0); // never spoils
    expect(inventoryQty(state, "lemon")).toBeGreaterThan(0); // lasts 4 days
  });

  test("lemons spoil after their shelf life", () => {
    let s = newGame(321, "sandbox");
    s = buyStock(s, "lemon", 8);
    // No re-buying — sell nothing meaningful, just age them out over 4 days.
    for (let i = 0; i < 4; i++) s = simulateDay(s).state;
    expect(inventoryQty(s, "lemon")).toBe(0);
  });
});

describe("loans & soft failure", () => {
  function loadedWithWages(cash: number): GameState {
    let s = newGame(9, "sandbox");
    s = hireStaff(s, 3);
    s = hireStaff(s, 3);
    s = hireStaff(s, 3); // 3 × $80 wages, no stock → no revenue
    return { ...s, cash };
  }

  test("a shortfall auto-borrows within the credit limit and survives", () => {
    const { state } = simulateDay(loadedWithWages(100));
    expect(state.gameOver).toBe(false);
    expect(state.debt).toBeGreaterThan(0);
    expect(state.cash).toBeGreaterThanOrEqual(0);
  });

  test("a shortfall beyond all credit ends the game", () => {
    const { state } = simulateDay(loadedWithWages(0));
    expect(state.gameOver).toBe(true);
    expect(state.cash).toBeLessThan(0);
  });
});

describe("playback paths agree", () => {
  test("minute-by-minute, chunked, and skip-to-end all produce the same result", () => {
    const s = planMorning(newGame(4242, "sandbox"));

    const byOne = createDay(s);
    while (!byOne.isOver) byOne.tick(1);
    const r1 = byOne.finalize().result;

    const byTen = createDay(s);
    while (!byTen.isOver) byTen.tick(10);
    const r10 = byTen.finalize().result;

    const skip = createDay(s).finalize().result; // finalize() runs to end

    expect(r1).toEqual(skip);
    expect(r10).toEqual(skip);
  });
});
