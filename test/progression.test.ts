import { describe, expect, test } from "bun:test";
import {
  buyEquipment,
  buyStock,
  derive,
  equipmentStatus,
  forecastConfidence,
  newGame,
  setPrice,
  setRecipe,
  simulateDay,
  type GameState,
} from "../src/engine";

function stocked(s: GameState): GameState {
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
  s = buyStock(s, "lemon", 60);
  s = buyStock(s, "sugar", 60);
  s = buyStock(s, "ice", 90);
  s = buyStock(s, "cup", 130);
  return s;
}

describe("equipment progression", () => {
  test("level 2 needs level 1 first; buying in order works", () => {
    let s = newGame(1, "sandbox");
    s = { ...s, cash: 9999 };
    expect(equipmentStatus(s, "disp_2").kind).toBe("needsPrev");
    s = buyEquipment(s, "disp_1");
    expect(s.ownedEquipmentIds).toContain("disp_1");
    expect(equipmentStatus(s, "disp_2").kind).toBe("buyable");
    s = buyEquipment(s, "disp_2");
    expect(s.ownedEquipmentIds).toContain("disp_2");
  });

  test("only the highest owned level in a line applies (no double-count)", () => {
    let s = newGame(1, "sandbox");
    s = { ...s, cash: 9999 };
    s = buyEquipment(s, "disp_1"); // +0.4 → 1.4
    s = buyEquipment(s, "disp_2"); // total +0.9 → 1.9 (NOT 1.4+0.9)
    expect(derive(s).serveSpeedMult).toBeCloseTo(1.9, 5);
  });

  test("location-gated gear is locked until the location is unlocked", () => {
    let s = newGame(1, "sandbox");
    s = { ...s, cash: 9999 };
    const st = equipmentStatus(s, "loyalty_1"); // level 1, requires Town Park
    expect(st.kind).toBe("locked");
    if (st.kind === "locked") expect(st.reason).toContain("Park");
  });

  test("loyalty program speeds regulars growth", () => {
    const base = newGame(3, "sandbox");
    const loyal = { ...base, ownedEquipmentIds: ["loyalty_1"] };
    const a = simulateDay(stocked(base)).state.regularsPool;
    const b = simulateDay(stocked(loyal)).state.regularsPool;
    expect(b).toBeGreaterThan(a);
  });
});

describe("forecast confidence + uncertainty", () => {
  test("confidence rises with research equipment", () => {
    const base = newGame(7, "sandbox");
    const withResearch = { ...base, ownedEquipmentIds: ["research_1"] };
    expect(forecastConfidence(withResearch)).toBeGreaterThan(forecastConfidence(base));
  });

  test("market mood makes identical plans vary across seeds", () => {
    // Same plan, different seeds → different served counts (demand noise).
    const counts = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5]) {
      counts.add(simulateDay(stocked(newGame(seed, "sandbox"))).result.served);
    }
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe("price feedback (discovery)", () => {
  test("a high price trends feedback negative; a low price trends positive", () => {
    function run(price: number): number {
      let s = newGame(9, "sandbox");
      for (let i = 0; i < 5 && !s.gameOver; i++) {
        s = stocked(s);
        s = setPrice(s, price);
        s = buyStock(s, "lemon", 60);
        s = buyStock(s, "ice", 90);
        s = buyStock(s, "cup", 130);
        s = simulateDay(s).state;
      }
      return s.priceFeedback;
    }
    expect(run(3.5)).toBeLessThan(0); // pricey
    expect(run(0.75)).toBeGreaterThan(0); // bargain → room to raise
  });
});
