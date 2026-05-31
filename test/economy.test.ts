import { describe, expect, test } from "bun:test";
import {
  priceDemandMult,
  recipeQuality,
  weatherDemandMult,
  weatherPriceMult,
} from "../src/engine/economy";
import type { Recipe, WeatherDay } from "../src/engine/types";

const mild: WeatherDay = {
  condition: "partly",
  tempF: 76,
  forecast: { condition: "partly", tempF: 76 },
};
const rainy: WeatherDay = {
  condition: "rainy",
  tempF: 60,
  forecast: { condition: "rainy", tempF: 60 },
};
const hot: WeatherDay = {
  condition: "heatwave",
  tempF: 98,
  forecast: { condition: "heatwave", tempF: 98 },
};

describe("price → demand", () => {
  test("pricing at tolerance keeps ~half the traffic", () => {
    expect(priceDemandMult(2, 2)).toBeCloseTo(0.5, 5);
  });
  test("cheaper keeps more, pricier keeps less", () => {
    expect(priceDemandMult(1, 2)).toBeGreaterThan(0.8);
    expect(priceDemandMult(3, 2)).toBeLessThan(0.2);
  });
});

describe("weather", () => {
  test("rainy days drive less demand than hot days", () => {
    expect(weatherDemandMult(rainy)).toBeLessThan(weatherDemandMult(mild));
    expect(weatherDemandMult(hot)).toBeGreaterThan(weatherDemandMult(mild));
  });
  test("rainy days tolerate lower prices", () => {
    expect(weatherPriceMult(rainy)).toBeLessThan(weatherPriceMult(hot));
  });
});

describe("recipe quality", () => {
  test("matching the mild ideal scores high; all-ice scores low", () => {
    // mild ideal vec ≈ [0.38, 0.34, 0.28], strength 1.0
    const good: Recipe = { lemons: 38, sugar: 34, water: 72, ice: 28, pricePerCup: 1.5 };
    const bad: Recipe = { lemons: 1, sugar: 0, water: 1, ice: 40, pricePerCup: 1.5 };
    expect(recipeQuality(good, mild)).toBeGreaterThan(0.9);
    expect(recipeQuality(bad, mild)).toBeLessThan(0.3);
  });

  test("the ideal recipe shifts with weather (a hot-day recipe is off on a cold snap)", () => {
    const cold: WeatherDay = {
      condition: "cold",
      tempF: 48,
      forecast: { condition: "cold", tempF: 48 },
    };
    // An icy, low-sugar recipe — great when hot, worse when cold.
    const icy: Recipe = { lemons: 34, sugar: 30, water: 71, ice: 36, pricePerCup: 1.5 };
    expect(recipeQuality(icy, hot)).toBeGreaterThan(recipeQuality(icy, cold));
  });
});
