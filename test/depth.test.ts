import { describe, expect, test } from "bun:test";
import {
  buyStock,
  itemBuyPrice,
  newGame,
  setMarketing,
  setRecipe,
  simulateDay,
  type GameState,
} from "../src/engine";
import { inventoryQty } from "../src/engine/derive";
import { EVENT_BY_ID } from "../src/data/events";

function topUp(s: GameState, item: Parameters<typeof buyStock>[1], target: number) {
  const need = Math.max(0, Math.round(target) - inventoryQty(s, item));
  return need > 0 ? buyStock(s, item, need) : s;
}
function planMorning(s: GameState): GameState {
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
  s = topUp(s, "lemon", 60);
  s = topUp(s, "sugar", 60);
  s = topUp(s, "cup", 130);
  s = topUp(s, "ice", 90);
  if (s.cash > 120) s = setMarketing(s, 20);
  return s;
}

describe("random daily events", () => {
  test("events fire across seeds and are deterministic", () => {
    let withEvent = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const a = newGame(seed);
      const b = newGame(seed);
      expect(a.activeEventId).toBe(b.activeEventId);
      if (a.activeEventId) {
        expect(EVENT_BY_ID[a.activeEventId]).toBeDefined();
        withEvent++;
      }
    }
    expect(withEvent).toBeGreaterThan(5); // ~45% chance → plenty across 60 seeds
  });

  test("a lemon-shortage event spikes the lemon buy price that day", () => {
    // Find a day with the lemon_shortage event active.
    let s = newGame(1, "sandbox");
    for (let i = 0; i < 60 && s.activeEventId !== "lemon_shortage"; i++) {
      s = simulateDay(planMorning(s)).state;
    }
    if (s.activeEventId === "lemon_shortage") {
      const normal = 0.2; // base lemon cost
      expect(itemBuyPrice(s, "lemon")).toBeGreaterThan(normal * 1.5);
      expect(itemBuyPrice(s, "sugar")).toBe(0.1); // others unaffected
    }
  });

  test("the active event is recorded on the day's result", () => {
    let s = newGame(7, "sandbox");
    for (let i = 0; i < 30; i++) {
      const hadEvent = s.activeEventId;
      const { state, result } = simulateDay(planMorning(s));
      if (hadEvent) expect(result.eventId).toBe(hadEvent);
      s = state;
    }
  });
});

describe("ice maker", () => {
  function stockNoIce(s: GameState): GameState {
    s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
    s = buyStock(s, "lemon", 60);
    s = buyStock(s, "sugar", 60);
    s = buyStock(s, "cup", 120);
    return s; // deliberately no ice
  }

  test("with no ice and no ice maker, nothing can be made", () => {
    const { result } = simulateDay(stockNoIce(newGame(5, "sandbox")));
    expect(result.served).toBe(0);
  });

  test("an ice maker produces ice so the stand can sell with none bought", () => {
    let s = newGame(5, "sandbox");
    s = { ...s, ownedEquipmentIds: ["icemaker_1"] };
    const { result } = simulateDay(stockNoIce(s));
    expect(result.served).toBeGreaterThan(0);
  });
});

describe("recipe feedback", () => {
  test("a too-icy recipe yields negative ice feedback (customers want less ice)", () => {
    let s = newGame(11, "sandbox");
    for (let i = 0; i < 5 && !s.gameOver; i++) {
      s = setRecipe(s, { lemons: 3, sugar: 3, water: 8, ice: 9, pricePerCup: 1.4 });
      s = topUp(s, "lemon", 60);
      s = topUp(s, "sugar", 60);
      s = topUp(s, "ice", 120);
      s = topUp(s, "cup", 130);
      s = simulateDay(s).state;
    }
    expect(s.recipeFeedback.ice).toBeLessThan(0);
  });
});

describe("campaign goals", () => {
  test("the $500 goal flips once cash crosses the threshold", () => {
    let s = newGame(7, "campaign");
    let sawGoal = false;
    for (let i = 0; i < 25 && !s.gameOver; i++) {
      s = simulateDay(planMorning(s)).state;
      if (s.cash >= 500) {
        expect(s.completedGoalIds).toContain("cash_500");
        sawGoal = true;
        break;
      }
    }
    expect(sawGoal).toBe(true);
  });

  test("achievements unlock and persist", () => {
    let s = newGame(7, "campaign");
    for (let i = 0; i < 15 && !s.gameOver; i++) s = simulateDay(planMorning(s)).state;
    // With good service a perfect/near-perfect day and a profit streak are likely.
    expect(s.unlockedAchievementIds.length).toBeGreaterThan(0);
  });
});
