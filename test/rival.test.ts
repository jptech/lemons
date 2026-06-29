import { describe, expect, test } from "bun:test";
import { newGame, simulateDay, buyoutRival, stepRival, rivalBuyoutCost, TUNING, type GameState, type RivalState } from "../src/engine";
import { rivalShare, expectedCustomers, type DemandInputs } from "../src/engine/economy";
import { Rng } from "../src/engine/rng";
import { LOCATION_BY_ID } from "../src/data/locations";
import { validateImport } from "../src/persistence/saveLoad";

const SUNNY = { condition: "sunny" as const, tempF: 80, forecast: { condition: "sunny" as const, tempF: 80 } };
function demand(rivalStrength: number): DemandInputs {
  return {
    location: LOCATION_BY_ID["downtown"]!, weather: SUNNY, dayOfWeek: 6, effectiveRep: 60,
    marketingSpend: 0, marketingFloor: 0, price: 3.5, tolerance: 4, regularsPool: 0,
    eventTrafficMult: 1, rivalStrength,
  };
}

describe("stepRival (determinism & spawn gate)", () => {
  test("draws no rng before spawn; spawn is deterministic; existing rival draws one/day", () => {
    const rng = new Rng(12345);
    const before = rng.state;
    expect(stepRival(null, 5, 50, rng)).toBeNull();
    expect(rng.state).toBe(before); // pre-spawn: no draw

    const spawned = stepRival(null, TUNING.RIVAL_SPAWN_DAY, 50, rng);
    expect(spawned?.active).toBe(true);
    expect(rng.state).toBe(before); // spawn: still no draw

    stepRival(spawned, TUNING.RIVAL_SPAWN_DAY + 1, 50, rng);
    expect(rng.state).not.toBe(before); // existing rival: one draw
  });

  test("buyout cooldown ticks then re-enters weaker", () => {
    const rng = new Rng(1);
    let r: RivalState = { name: "X", strength: 1.0, active: false, cooldownDays: 2 };
    r = stepRival(r, 20, 50, rng)!;
    expect(r.active).toBe(false);
    expect(r.cooldownDays).toBe(1);
    r = stepRival(r, 21, 50, rng)!;
    expect(r.active).toBe(true);
    expect(r.strength).toBeLessThan(1.0); // came back weaker
  });
});

describe("rivalShare (market split)", () => {
  test("is 0 without a rival and bounded by the cap", () => {
    expect(rivalShare(0, 50, 3, 4)).toBe(0);
    expect(rivalShare(100, 0, 10, 1)).toBe(TUNING.RIVAL_MAX_SHARE);
  });
  test("undercutting price and higher reputation both win share back", () => {
    expect(rivalShare(0.6, 50, 3, 4)).toBeLessThan(rivalShare(0.6, 50, 4, 4)); // cheaper → less taken
    expect(rivalShare(0.6, 80, 4, 4)).toBeLessThan(rivalShare(0.6, 40, 4, 4)); // higher rep → less taken
  });
  test("an active rival reduces expected demand", () => {
    expect(expectedCustomers(demand(0.8))).toBeLessThan(expectedCustomers(demand(0)));
  });
});

describe("rival lifecycle in settle()", () => {
  test("spawns at the day gate — in sandbox AND campaign", () => {
    expect(simulateDay({ ...newGame(1, "sandbox"), day: 12 }).state.rival).toBeNull();
    expect(simulateDay({ ...newGame(1, "sandbox"), day: 13 }).state.rival?.active).toBe(true);
    expect(simulateDay({ ...newGame(1, "campaign"), day: 13 }).state.rival?.active).toBe(true);
  });

  test("a rival-active day is deterministic", () => {
    const g: GameState = { ...newGame(3, "sandbox"), day: 20, rival: { name: "X", strength: 1.0, active: true, cooldownDays: 0 } };
    const a = simulateDay(g);
    const b = simulateDay(g);
    expect(a.state.rngState).toBe(b.state.rngState);
    expect(a.state.rival).toEqual(b.state.rival);
  });
});

describe("buyoutRival", () => {
  test("spends cash and sends the rival into cooldown", () => {
    const r: RivalState = { name: "X", strength: 1.0, active: true, cooldownDays: 0 };
    const g = { ...newGame(1, "sandbox"), cash: 10000, rival: r };
    const cost = rivalBuyoutCost(r);
    expect(cost).toBe(Math.round(TUNING.RIVAL_BUYOUT_BASE * 2));
    const s = buyoutRival(g);
    expect(s.cash).toBe(10000 - cost);
    expect(s.rival!.active).toBe(false);
    expect(s.rival!.cooldownDays).toBe(TUNING.RIVAL_COOLDOWN);
  });
  test("is a no-op when unaffordable or no active rival", () => {
    const r: RivalState = { name: "X", strength: 1.0, active: true, cooldownDays: 0 };
    const poor = { ...newGame(1, "sandbox"), cash: 100, rival: r };
    expect(buyoutRival(poor)).toBe(poor);
    const none = { ...newGame(1, "sandbox"), cash: 9999, rival: null };
    expect(buyoutRival(none)).toBe(none);
  });
});

describe("migration 12 -> 13", () => {
  test("seeds rival as null (neutral)", () => {
    const g = newGame(2, "sandbox");
    const legacy: Record<string, unknown> = { ...g, schemaVersion: 12 };
    delete legacy.rival;
    const migrated = validateImport(legacy)!;
    expect(migrated.rival).toBeNull();
  });
});
