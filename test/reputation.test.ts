import { describe, expect, test } from "bun:test";
import {
  blendRep,
  buyStock,
  effectiveFacets,
  expectedCustomers,
  newGame,
  priceTolerance,
  setRecipe,
  simulateDay,
  TUNING,
  uniformFacets,
  type GameState,
  type WeatherDay,
} from "../src/engine";
import { LOCATION_BY_ID } from "../src/data/locations";

function stocked(s: GameState): GameState {
  s = setRecipe(s, { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 });
  s = buyStock(s, "lemon", 80);
  s = buyStock(s, "sugar", 80);
  s = buyStock(s, "ice", 120);
  s = buyStock(s, "cup", 160);
  return s;
}

const MILD: WeatherDay = { condition: "partly", tempF: 76, forecast: { condition: "partly", tempF: 76 } };

describe("reputation facets", () => {
  test("a uniform facet vector blends back to its scalar value", () => {
    expect(blendRep(uniformFacets(42))).toBeCloseTo(42, 6);
    // Blend weights sum to 1, so any uniform value is a fixed point.
    expect(blendRep(uniformFacets(0))).toBeCloseTo(0, 6);
    expect(blendRep(uniformFacets(100))).toBeCloseTo(100, 6);
  });

  test("the economy tilts are NEUTRAL when facets are uniform (back-compat)", () => {
    const loc = LOCATION_BY_ID.suburb!;
    const baseTol = priceTolerance(loc, 50, MILD, 0.5); // legacy call (no taste arg)
    const uniformTol = priceTolerance(loc, 50, MILD, 0.5, 50); // taste == overall
    expect(uniformTol).toBeCloseTo(baseTol, 9);

    const inputs = {
      location: loc,
      weather: MILD,
      dayOfWeek: 3,
      effectiveRep: 50,
      marketingSpend: 0,
      marketingFloor: 0,
      price: 1.5,
      tolerance: baseTol,
      regularsPool: 0,
      eventTrafficMult: 1,
    };
    const legacy = expectedCustomers(inputs);
    const uniform = expectedCustomers({ ...inputs, buzzEff: 50, valueEff: 50 });
    expect(uniform).toBeCloseTo(legacy, 9);
  });

  test("Taste above the overall raises price tolerance; Buzz raises demand", () => {
    const loc = LOCATION_BY_ID.suburb!;
    const lowTaste = priceTolerance(loc, 50, MILD, 0.5, 30);
    const highTaste = priceTolerance(loc, 50, MILD, 0.5, 70);
    expect(highTaste).toBeGreaterThan(lowTaste);

    const base = {
      location: loc, weather: MILD, dayOfWeek: 3, effectiveRep: 50,
      marketingSpend: 0, marketingFloor: 0, price: 1.5,
      tolerance: priceTolerance(loc, 50, MILD, 0.5), regularsPool: 0, eventTrafficMult: 1,
    };
    expect(expectedCustomers({ ...base, buzzEff: 70 })).toBeGreaterThan(
      expectedCustomers({ ...base, buzzEff: 30 }),
    );
  });

  test("facets differentiate: a great recipe but long lines lifts Taste over Service", () => {
    // Downtown traffic with a tiny crew and lots of stock → great taste, but
    // lines build (Service suffers) while Taste climbs.
    let s = newGame(42, "sandbox");
    s = { ...s, currentLocationId: "downtown" };
    // Run several busy days.
    for (let i = 0; i < 6 && !s.gameOver; i++) {
      s = stocked(s);
      s = simulateDay(s).state;
    }
    const f = effectiveFacets(s);
    // Taste should outrun Service when the bottleneck is labor, not recipe.
    expect(f.taste).toBeGreaterThan(f.service);
  });

  test("facets persist on state and the cached overall stays in sync with the blend", () => {
    let s = newGame(7, "sandbox");
    s = simulateDay(stocked(s)).state;
    expect(s.repFacets).toBeDefined();
    expect(s.locationRepFacets[s.currentLocationId]).toBeDefined();
    // Cached global scalar equals the blend of the global facets.
    expect(s.reputationGlobal).toBeCloseTo(blendRep(s.repFacets), 6);
  });
});
