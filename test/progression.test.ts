import { describe, expect, test } from "bun:test";
import {
  buyEquipment,
  buyStock,
  derive,
  equipmentStatus,
  forecastConfidence,
  hireStaff,
  newGame,
  setPrice,
  setRecipe,
  simulateDay,
  type GameState,
  type InventoryLot,
} from "../src/engine";
import { pitchersFromStock, projectedIceAvailable } from "../src/store/selectors";

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

  test("inventory stays whole even with fractional batch multipliers", () => {
    // Industrial Batch (×2.1) would make 4 × 2.1 = 8.4 lemons/batch under the
    // old code, leaving fractional stock. It must round to whole units now.
    let s = newGame(5, "sandbox");
    s = { ...s, ownedEquipmentIds: ["pitch_2"] };
    s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
    s = buyStock(s, "lemon", 70);
    s = buyStock(s, "sugar", 70);
    s = buyStock(s, "ice", 100);
    s = buyStock(s, "cup", 150);
    const { state, result } = simulateDay(s);
    expect(result.served).toBeGreaterThan(0); // it actually made batches
    for (const lot of state.inventory) {
      expect(Number.isInteger(lot.qty)).toBe(true);
    }
    for (const v of Object.values(result.leftover)) expect(Number.isInteger(v)).toBe(true);
  });

  test("the stock forecast counts the ice maker's daily output", () => {
    let s = newGame(1, "sandbox");
    s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
    s = buyStock(s, "lemon", 100);
    s = buyStock(s, "sugar", 100);
    s = buyStock(s, "cup", 200); // no ice bought
    expect(pitchersFromStock(s)).toBe(0); // ice-bottlenecked with no maker
    const withMaker: GameState = { ...s, ownedEquipmentIds: ["icemaker_1"] };
    expect(projectedIceAvailable(withMaker)).toBeGreaterThan(0);
    expect(pitchersFromStock(withMaker)).toBeGreaterThan(0); // no longer bottlenecked
  });

  test("better (pricier) staff serve more — the wage buys real throughput", () => {
    const plenty: InventoryLot[] = [
      { item: "lemon", qty: 600, ageDays: 0 },
      { item: "sugar", qty: 600, ageDays: 0 },
      { item: "ice", qty: 900, ageDays: 0 },
      { item: "cup", qty: 1200, ageDays: 0 },
    ];
    function servedWith(tier: 1 | 2 | 3): number {
      // Downtown (high traffic) + huge stock → capacity-bound, so serve speed matters.
      let s = newGame(123, "sandbox");
      s = { ...s, currentLocationId: "downtown", inventory: plenty.map((l) => ({ ...l })) };
      s = hireStaff(s, tier);
      s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
      return simulateDay(s).result.served;
    }
    const helper = servedWith(1);
    const manager = servedWith(3);
    expect(helper).toBeGreaterThan(0);
    expect(manager).toBeGreaterThan(helper); // the manager's speed clearly pays off
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
      return s.products.classic.priceFeedback;
    }
    expect(run(3.5)).toBeLessThan(0); // pricey
    expect(run(0.75)).toBeGreaterThan(0); // bargain → room to raise
  });
});
