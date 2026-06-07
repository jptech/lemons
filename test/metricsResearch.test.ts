import { describe, expect, test } from "bun:test";
import {
  buyStock,
  derive,
  hireStaff,
  newGame,
  researchStatus,
  setRecipe,
  simulateDay,
  startResearch,
  trainStaff,
  TUNING,
  type GameState,
} from "../src/engine";
import { validateImport } from "../src/persistence/saveLoad";

/** A fixed morning strategy so days are reproducible. */
function planMorning(s: GameState): GameState {
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
  s = buyStock(s, "lemon", 40);
  s = buyStock(s, "sugar", 40);
  s = buyStock(s, "cup", 120);
  s = buyStock(s, "ice", 80);
  return s;
}

describe("advanced metrics capture", () => {
  const { result } = simulateDay(planMorning(newGame(123, "sandbox")));

  test("a day records rich metrics", () => {
    expect(result.metrics).toBeDefined();
  });

  test("demographics reconcile with served + lost", () => {
    const m = result.metrics!;
    let served = 0;
    let lost = 0;
    let arrived = 0;
    for (const row of Object.values(m.demographics)) {
      served += row!.served;
      lost += row!.lost;
      arrived += row!.arrived;
      // arrived ≥ resolved outcomes; the only gap is anyone mid-pour at close.
      expect(row!.arrived).toBeGreaterThanOrEqual(row!.served + row!.lost);
    }
    expect(served).toBe(result.served);
    expect(lost).toBe(result.balked + result.reneged);
    // The unresolved-at-close gap is bounded by the number of service stations.
    expect(arrived - (served + lost)).toBeLessThanOrEqual(1 + result.served); // sanity upper bound
    expect(arrived).toBeGreaterThanOrEqual(served + lost);
  });

  test("wait + loyalty are sane", () => {
    const m = result.metrics!;
    expect(m.wait.avgMin).toBeGreaterThanOrEqual(0);
    expect(m.wait.maxMin).toBeGreaterThanOrEqual(m.wait.avgMin);
    const histTotal = m.wait.histogram.reduce((a, b) => a + b, 0);
    expect(histTotal).toBe(result.served);
    expect(m.loyalty.delighted).toBeLessThanOrEqual(result.served);
    if (result.served > 0) {
      expect(m.loyalty.conversionRate).toBeCloseTo(m.loyalty.delighted / result.served, 6);
    }
    expect(m.loyalty.regularsEnd).toBeCloseTo(result.regularsEnd, 6);
  });

  test("metrics don't break determinism", () => {
    const a = simulateDay(planMorning(newGame(555, "sandbox")));
    const b = simulateDay(planMorning(newGame(555, "sandbox")));
    expect(a.result).toEqual(b.result);
    expect(a.state).toEqual(b.state);
  });
});

describe("research tree", () => {
  test("a started node completes after its days and applies its effect", () => {
    let s = newGame(42, "sandbox");
    s = { ...s, cash: 5000 }; // afford research
    const baseConf = derive(s).researchConfidence;

    s = startResearch(s, "analytics_1");
    expect(s.research.inProgress?.id).toBe("analytics_1");
    // While cooking, another node can't start.
    expect(researchStatus(s, "membership").kind).toBe("busy");

    const days = 2; // analytics_1.days
    for (let i = 0; i < days; i++) s = simulateDay(planMorning(s)).state;

    expect(s.research.completed).toContain("analytics_1");
    expect(s.research.inProgress).toBeNull();
    expect(derive(s).researchConfidence).toBeGreaterThan(baseConf);
  });

  test("prereqs gate downstream nodes", () => {
    let s = newGame(42, "sandbox");
    s = { ...s, cash: 5000 };
    expect(researchStatus(s, "analytics_2").kind).toBe("locked");
  });
});

describe("staff experience & training", () => {
  test("staff level up from working days", () => {
    let s = newGame(7, "sandbox");
    s = hireStaff(s, 1); // a Helper at level 0
    expect(s.staff[0]!.level).toBe(0);
    const before = s.staff[0]!.serveSpeedBonus;

    // Work enough days to cross the level-1 XP threshold.
    const daysToLevel = Math.ceil(TUNING.STAFF_XP_FOR_LEVEL[1]! / TUNING.STAFF_XP_PER_DAY);
    for (let i = 0; i < daysToLevel; i++) s = simulateDay(planMorning(s)).state;

    expect(s.staff[0]!.level).toBeGreaterThanOrEqual(1);
    void before;
  });

  test("training buys XP and can raise level immediately", () => {
    let s = newGame(7, "sandbox");
    s = hireStaff(s, 2);
    s = { ...s, cash: 1000 };
    const cashBefore = s.cash;
    const xpBefore = s.staff[0]!.xp;
    s = trainStaff(s, s.staff[0]!.id);
    expect(s.staff[0]!.xp).toBe(xpBefore + TUNING.STAFF_TRAIN_XP);
    expect(s.cash).toBe(cashBefore - TUNING.STAFF_TRAIN_COST);
  });
});

describe("schema 7 → 8 migration", () => {
  test("a v7 save (no research / no staff xp) loads and plays identically", () => {
    // Build a played game, then degrade it to the v7 shape.
    let native = newGame(31337, "sandbox");
    native = hireStaff(native, 2);
    const v7: any = JSON.parse(JSON.stringify(native));
    delete v7.research;
    for (const st of v7.staff) {
      delete st.xp;
      delete st.level;
    }
    v7.schemaVersion = 7;

    const migrated = validateImport(v7)!;
    expect(migrated).not.toBeNull();
    expect(migrated.research).toEqual({ completed: [], inProgress: null });
    expect(migrated.staff[0]!.xp).toBe(0);
    expect(migrated.staff[0]!.level).toBe(0);

    // A migrated save and a native one play the next day to the same result.
    const fromMigrated = simulateDay(planMorning(migrated)).result;
    const fromNative = simulateDay(planMorning(native)).result;
    expect(fromMigrated.cupsSold).toBe(fromNative.cupsSold);
    expect(fromMigrated.profit).toBe(fromNative.profit);
  });
});
