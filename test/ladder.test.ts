import { describe, expect, test } from "bun:test";
import {
  newGame,
  simulateDay,
  buyPerk,
  convertCashToPrestige,
  nextPrestigeCost,
  perkStatus,
  menuCap,
  TUNING,
  type GameState,
} from "../src/engine";
import { rung, rungPrestige, ladderRungFromId, backfillLadder, GOALS } from "../src/data/goals";
import { validateImport } from "../src/persistence/saveLoad";

/** A state with the ladder active (≥3 base goals cleared) and lots of cash. */
function activeRichState(cash = 30000): GameState {
  const g = newGame(1, "sandbox");
  return {
    ...g,
    cash,
    completedGoalIds: GOALS.slice(0, 3).map((x) => x.id),
  };
}

describe("ladder generation", () => {
  test("rungs are deterministic and cycle three unbounded tracks", () => {
    // Same id + same targets every call (no RNG, no time).
    expect(rung(0).id).toBe("ladder_0");
    expect(rung(7).id).toBe("ladder_7");
    expect(rung(0).title).toBe(rung(0).title);

    // Track 0 = cash, 1 = lifetime profit, 2 = lifetime cups (round-robin).
    const base = newGame(1, "sandbox");
    expect(rung(0).check({ ...base, cash: 25000 })).toBe(true);
    expect(rung(0).check({ ...base, cash: 24999 })).toBe(false);
    expect(rung(3).check({ ...base, cash: 50000 })).toBe(true); // next cash tier doubles
  });

  test("ladderRungFromId round-trips and rejects non-ladder ids", () => {
    expect(ladderRungFromId("ladder_5")).toBe(5);
    expect(ladderRungFromId("cash_500")).toBeNull();
  });

  test("rung prestige grows with the rung index", () => {
    expect(rungPrestige(0)).toBe(6);
    expect(rungPrestige(1)).toBeGreaterThan(rungPrestige(0));
  });
});

describe("settle() ladder evaluation", () => {
  test("awards prestige and advances the rung when a target is met", () => {
    const { state, result } = simulateDay(activeRichState(30000));
    expect(result.newGoals).toContain("ladder_0");
    expect(state.ladderRung).toBe(1); // cleared exactly rung 0 (cash ≥ 25k)
    expect(state.prestige).toBe(rungPrestige(0));
  });

  test("the ladder draws NO rng — same day with/without a rung firing is byte-identical", () => {
    const firing = activeRichState(30000); // ladderRung 0 → rung 0 fires
    const inert = { ...firing, ladderRung: 9999 }; // far rung target → nothing fires
    const a = simulateDay(firing);
    const b = simulateDay(inert);
    // The rng stream is untouched by the ladder block, so the next-day rng state
    // and every simulated outcome match exactly.
    expect(a.state.rngState).toBe(b.state.rngState);
    expect(a.result.served).toBe(b.result.served);
    expect(a.result.revenue).toBe(b.result.revenue);
    // Only the meta-progression differs.
    expect(a.result.newGoals).toContain("ladder_0");
    expect(b.result.newGoals.some((id) => id.startsWith("ladder_"))).toBe(false);
  });

  test("the ladder stays dormant until enough base goals are cleared", () => {
    // Low cash (no base cash-goals fire) but a cups rung that WOULD fire if the
    // ladder were active — proves the activation gate, not just an unmet target.
    const g = {
      ...newGame(1, "sandbox"),
      cash: 100,
      ladderRung: 2, // rung 2 = lifetime cups ≥ 5000
      completedGoalIds: [],
      stats: { ...newGame(1, "sandbox").stats, totalCupsSold: 6000 },
    };
    expect(rung(2).check(g)).toBe(true); // the target is met…
    const { state, result } = simulateDay(g);
    // …but the gate (≥3 base goals) isn't, so nothing fires.
    expect(result.newGoals.some((id) => id.startsWith("ladder_"))).toBe(false);
    expect(state.ladderRung).toBe(2);
  });
});

describe("migration 8 -> 9", () => {
  test("back-computes the rung and grants retroactive prestige without re-firing", () => {
    const g = newGame(7, "sandbox");
    // Shape a legacy v8 save: drop the new fields, set a rich post-campaign state.
    const legacy: Record<string, unknown> = {
      ...g,
      schemaVersion: 8,
      cash: 60000,
      completedGoalIds: GOALS.slice(0, 3).map((x) => x.id),
      stats: { ...g.stats, totalProfit: 120000, totalCupsSold: 12000 },
    };
    delete legacy.ladderRung;
    delete legacy.prestige;
    delete legacy.ownedPerkIds;

    const expected = backfillLadder(legacy as unknown as GameState);
    const migrated = validateImport(legacy)!;
    expect(migrated).not.toBeNull();
    expect(migrated.schemaVersion).toBe(TUNING.SCHEMA_VERSION);
    expect(migrated.ladderRung).toBe(expected.ladderRung);
    expect(migrated.prestige).toBe(expected.prestige);
    expect(migrated.ownedPerkIds).toEqual([]);

    // The very next day must NOT re-fire any already-cleared rung.
    const { result } = simulateDay(migrated);
    expect(result.newGoals.some((id) => id.startsWith("ladder_"))).toBe(false);
  });

  test("low-progress legacy saves get neutral defaults (no pre-credited prestige)", () => {
    const g = newGame(2, "sandbox");
    const legacy: Record<string, unknown> = { ...g, schemaVersion: 8, cash: 999999, completedGoalIds: [] };
    delete legacy.ladderRung;
    delete legacy.prestige;
    delete legacy.ownedPerkIds;
    const migrated = validateImport(legacy)!;
    expect(migrated.ladderRung).toBe(0);
    expect(migrated.prestige).toBe(0);
  });
});

describe("prestige & perks reducers (pure)", () => {
  test("convertCashToPrestige buys at an escalating cost and never mutates input", () => {
    const g = { ...newGame(1, "sandbox"), cash: 10000, prestige: 0 };
    expect(nextPrestigeCost(g)).toBe(2000);

    const one = convertCashToPrestige(g, 1);
    expect(one.prestige).toBe(1);
    expect(one.cash).toBe(8000);
    expect(g.cash).toBe(10000); // original untouched

    // +5 requested from $10k: 2000+2300+2600+2900 = 9800 affords 4; the 5th (3200) doesn't.
    const many = convertCashToPrestige(g, 5);
    expect(many.prestige).toBe(4);
    expect(many.cash).toBe(200);
  });

  test("convert is a no-op when the first point is unaffordable", () => {
    const g = { ...newGame(1, "sandbox"), cash: 100, prestige: 0 };
    expect(convertCashToPrestige(g, 1)).toBe(g);
  });

  test("buyPerk spends prestige, enforces prereqs, and raises the menu cap", () => {
    const g = { ...newGame(1, "sandbox"), prestige: 30 };
    expect(menuCap(g)).toBe(2);

    // The 2nd menu slot needs its prereq first.
    expect(perkStatus(g, "menu_slot_2")?.kind).toBe("needsPrev");

    const afterFirst = buyPerk(g, "menu_slot");
    expect(afterFirst.ownedPerkIds).toContain("menu_slot");
    expect(afterFirst.prestige).toBe(24);
    expect(menuCap(afterFirst)).toBe(3);
    expect(g.ownedPerkIds).toEqual([]); // original untouched

    const afterSecond = buyPerk(afterFirst, "menu_slot_2");
    expect(menuCap(afterSecond)).toBe(4);
  });

  test("buyPerk is a no-op without enough prestige", () => {
    const g = { ...newGame(1, "sandbox"), prestige: 1 };
    expect(buyPerk(g, "menu_slot")).toBe(g);
  });
});
