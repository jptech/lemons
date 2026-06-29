import { describe, expect, test } from "bun:test";
import { newGame, simulateDay, type GameState } from "../src/engine";
import { awarenessMult, stepAwareness, expectedCustomers, type DemandInputs } from "../src/engine/economy";
import { LOCATION_BY_ID } from "../src/data/locations";
import { validateImport } from "../src/persistence/saveLoad";
import { TUNING } from "../src/engine/tuning";

const SUNNY = { condition: "sunny" as const, tempF: 80, forecast: { condition: "sunny" as const, tempF: 80 } };

function demand(awareness: number): DemandInputs {
  return {
    location: LOCATION_BY_ID["downtown"]!,
    weather: SUNNY,
    dayOfWeek: 6,
    effectiveRep: 80,
    marketingSpend: 0,
    marketingFloor: 0,
    price: 3.5,
    tolerance: 4.2,
    regularsPool: 0,
    eventTrafficMult: 1,
    awareness,
  };
}

describe("awareness → demand multiplier", () => {
  test("is exactly 1 at zero awareness (neutral) and capped at the ceiling", () => {
    expect(awarenessMult(0)).toBe(1);
    expect(awarenessMult(60)).toBeGreaterThan(1.4); // breaks past the rep ceiling
    expect(awarenessMult(10_000)).toBe(TUNING.AWARENESS_CAP_MULT); // hard cap, no runaway
  });

  test("lifts expected demand past the awareness-0 baseline", () => {
    const base = expectedCustomers(demand(0));
    const lifted = expectedCustomers(demand(60));
    expect(lifted).toBeGreaterThan(base);
    expect(lifted / base).toBeCloseTo(awarenessMult(60), 5);
  });
});

describe("stepAwareness reservoir (flow-fed, self-limiting)", () => {
  test("fills from marketing + word-of-mouth and clamps to the ceiling", () => {
    const a = stepAwareness(0, 0, 0);
    expect(a).toBe(0); // nothing in, nothing held
    const withMkt = stepAwareness(0, 0, 50);
    expect(withMkt).toBeGreaterThan(0); // marketing alone fills it
    const withWom = stepAwareness(0, 40, 0);
    expect(withWom).toBeGreaterThan(0); // delighted customers alone fill it
    expect(stepAwareness(TUNING.AWARENESS_MAX, 999, 999)).toBeLessThanOrEqual(TUNING.AWARENESS_MAX);
  });

  test("a steady delighted flow converges to a stable level (no runaway)", () => {
    let a = 0;
    let prev = -1;
    for (let i = 0; i < 200; i++) {
      prev = a;
      a = stepAwareness(a, 20, 0); // modest steady word-of-mouth, no marketing
    }
    expect(Math.abs(a - prev)).toBeLessThan(0.01); // converged
    expect(a).toBeLessThan(TUNING.AWARENESS_MAX); // self-limited below the ceiling
    expect(a).toBeGreaterThan(0);
  });

  test("decays toward zero when nothing feeds it", () => {
    let a = 50;
    for (let i = 0; i < 50; i++) a = stepAwareness(a, 0, 0);
    expect(a).toBeLessThan(5); // faded
  });
});

describe("settle() builds awareness; migration is neutral", () => {
  test("a marketed day raises the reservoir, deterministically", () => {
    const base = newGame(1, "sandbox");
    const g: GameState = {
      ...base,
      marketingSpend: 50,
      inventory: [
        { item: "cup", qty: 300, ageDays: 0 },
        { item: "lemon", qty: 300, ageDays: 0 },
        { item: "sugar", qty: 300, ageDays: 0 },
        { item: "ice", qty: 300, ageDays: 0 },
      ],
    };
    const a = simulateDay(g);
    const b = simulateDay(g);
    expect(a.state.brand.awareness).toBeGreaterThan(0);
    expect(a.state.brand.awareness).toBe(b.state.brand.awareness); // deterministic (pure)
    expect(a.state.rngState).toBe(b.state.rngState);
  });

  test("migration 10 -> 11 seeds awareness at 0 (a neutral 1x demand mult)", () => {
    const g = newGame(2, "sandbox");
    const legacy: Record<string, unknown> = { ...g, schemaVersion: 10 };
    delete legacy.brand;
    const migrated = validateImport(legacy)!;
    expect(migrated.brand).toEqual({ awareness: 0 });
    expect(awarenessMult(migrated.brand.awareness)).toBe(1);
  });
});
