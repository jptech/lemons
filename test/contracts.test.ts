import { describe, expect, test } from "bun:test";
import { newGame, simulateDay, acceptContract, type GameState } from "../src/engine";
import { dealWeek, CONTRACT_BY_ID } from "../src/data/contracts";
import type { ContractInstance } from "../src/engine";
import { validateImport } from "../src/persistence/saveLoad";

/** Play N empty days from a fresh game (deterministic, no plan). */
function advance(seed: number, days: number): GameState {
  let s = newGame(seed, "sandbox");
  for (let i = 0; i < days; i++) s = simulateDay(s).state;
  return s;
}

function offer(defId: string, week = 0): ContractInstance {
  return { id: `${defId}__w${week}`, defId, offeredDay: 8, acceptedDay: null, deadlineDay: null, baseline: 0 };
}

describe("dealWeek (deterministic sub-stream)", () => {
  test("same (seed, week, day) is reproducible; deals 2 distinct eligible ids", () => {
    const a = dealWeek(1, 0, 4);
    expect(dealWeek(1, 0, 4)).toEqual(a); // reproducible
    expect(a.length).toBe(2);
    expect(new Set(a).size).toBe(2); // distinct
    for (const id of a) expect((CONTRACT_BY_ID[id]!.minDay ?? 1)).toBeLessThanOrEqual(4);
  });

  test("the minDay gate widens the pool on later days", () => {
    // Day 4 can't deal the day-8 contracts; day 8 can.
    const early = new Set([dealWeek(1, 0, 4), dealWeek(2, 1, 4), dealWeek(3, 2, 4)].flat());
    expect(early.has("cup_marathon")).toBe(false);
    const late = new Set(Array.from({ length: 12 }, (_, w) => dealWeek(w + 1, w, 8)).flat());
    expect(late.has("cup_marathon") || late.has("profit_push") || late.has("crowd_pleaser")).toBe(true);
  });
});

describe("settle() dealing cadence", () => {
  test("no offers before the unlock day; dealt at it; not re-dealt mid-week", () => {
    const day3 = advance(1, 2); // played days 1,2 → now day 3
    expect(day3.day).toBe(3);
    expect(day3.contracts.offers.length).toBe(0);

    const day4 = simulateDay(day3).state; // plays day 3 → day 4, deals week 0
    expect(day4.day).toBe(4);
    expect(day4.contracts.offers.length).toBe(2);
    expect(day4.contracts.lastDealtWeek).toBe(0);

    const day5 = simulateDay(day4).state; // mid-week → no re-deal
    expect(day5.contracts.offers.map((o) => o.id)).toEqual(day4.contracts.offers.map((o) => o.id));
  });

  test("dealing draws NOTHING from the main rng stream", () => {
    const base = newGame(7, "sandbox");
    const willDeal = { ...base, day: 3 }; // lastDealtWeek -1 → deals when it hits day 4
    const wontDeal = { ...base, day: 3, contracts: { ...base.contracts, lastDealtWeek: 0 } };
    const a = simulateDay(willDeal);
    const b = simulateDay(wontDeal);
    expect(a.state.rngState).toBe(b.state.rngState); // identical main stream
    expect(a.result.served).toBe(b.result.served);
    expect(a.state.contracts.offers.length).toBe(2);
    expect(b.state.contracts.offers.length).toBe(0);
  });

  test("offers survive a save/load round-trip and don't re-deal", () => {
    const dealt = advance(3, 3); // day 4, offers present
    expect(dealt.contracts.offers.length).toBe(2);
    const reloaded = validateImport(JSON.parse(JSON.stringify(dealt)))!;
    expect(reloaded.contracts.offers.map((o) => o.id)).toEqual(dealt.contracts.offers.map((o) => o.id));
    const next = simulateDay(reloaded).state; // mid-week → unchanged
    expect(next.contracts.offers.map((o) => o.id)).toEqual(dealt.contracts.offers.map((o) => o.id));
  });
});

describe("acceptContract", () => {
  test("moves an offer to active, snapshots the baseline, sets the deadline", () => {
    const g: GameState = {
      ...newGame(1, "sandbox"),
      day: 8,
      stats: { ...newGame(1, "sandbox").stats, totalCupsSold: 123 },
      contracts: { lastDealtWeek: 0, active: [], offers: [offer("weekend_rush")] },
    };
    const s = acceptContract(g, "weekend_rush__w0");
    expect(s.contracts.offers).toHaveLength(0);
    expect(s.contracts.active).toHaveLength(1);
    const a = s.contracts.active[0]!;
    expect(a.baseline).toBe(123); // weekend_rush tracks cups
    expect(a.deadlineDay).toBe(8 + CONTRACT_BY_ID["weekend_rush"]!.days - 1);
    expect(g.contracts.active).toHaveLength(0); // original untouched
  });

  test("enforces the active-slot cap", () => {
    const g: GameState = {
      ...newGame(1, "sandbox"),
      day: 8,
      contracts: { lastDealtWeek: 0, active: [], offers: [offer("weekend_rush"), offer("tip_jar"), offer("profit_sprint")] },
    };
    let s = acceptContract(g, "weekend_rush__w0");
    s = acceptContract(s, "tip_jar__w0");
    expect(s.contracts.active).toHaveLength(2);
    const capped = acceptContract(s, "profit_sprint__w0");
    expect(capped).toBe(s); // no-op at the cap
  });
});

describe("settle() contract resolution", () => {
  test("completes when the target is met and pays cash + prestige", () => {
    const base = newGame(1, "sandbox");
    const active: ContractInstance = {
      id: "weekend_rush__w0", defId: "weekend_rush",
      offeredDay: 4, acceptedDay: 4, deadlineDay: 7, baseline: 50,
    };
    const g: GameState = {
      ...base, day: 5, prestige: 0,
      stats: { ...base.stats, totalCupsSold: 400 }, // progress = 400 - 50 = 350 ≥ 300
      contracts: { lastDealtWeek: 0, offers: [], active: [active] },
    };
    const { state, result } = simulateDay(g);
    expect(result.contractsResolved).toEqual([
      { name: "Weekend Rush", status: "done", rewardCash: 400, rewardPrestige: 1 },
    ]);
    expect(state.contracts.active).toHaveLength(0);
    expect(state.prestige).toBe(1); // ladder inactive (no base goals) → contract is the only source
  });

  test("expires past the deadline when the target isn't met", () => {
    const base = newGame(1, "sandbox");
    const active: ContractInstance = {
      id: "tip_jar__w0", defId: "tip_jar",
      offeredDay: 4, acceptedDay: 4, deadlineDay: 8, baseline: base.stats.totalTips,
    };
    const g: GameState = {
      ...base, day: 10, // already past the day-8 deadline
      contracts: { lastDealtWeek: 0, offers: [], active: [active] },
    };
    const { state, result } = simulateDay(g);
    expect(result.contractsResolved?.[0]?.status).toBe("expired");
    expect(state.contracts.active).toHaveLength(0);
  });
});
