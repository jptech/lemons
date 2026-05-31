import {
  CONDITION_NEIGHBORS,
  CONDITION_ORDER,
  WEATHER_TRANSITION,
} from "../data/weather";
import { WEATHER_TEMP, TUNING } from "./tuning";
import type { Condition, WeatherDay } from "./types";
import type { Rng } from "./rng";

/** Roll the next day's actual condition from the Markov chain. */
export function nextCondition(rng: Rng, prev: Condition): Condition {
  const weights = WEATHER_TRANSITION[prev];
  return CONDITION_ORDER[rng.weightedIndex(weights)]!;
}

/** Build a full WeatherDay (actual + noisy forecast) given an actual condition. */
export function makeWeatherDay(
  rng: Rng,
  condition: Condition,
  forecastAccuracy: number,
): WeatherDay {
  const tempF = Math.round(WEATHER_TEMP[condition] + rng.gaussian(0, 5));

  // Forecast: usually right, sometimes a neighbouring condition.
  let fCondition = condition;
  if (!rng.chance(forecastAccuracy)) {
    const neighbors = CONDITION_NEIGHBORS[condition];
    fCondition = neighbors[rng.int(0, neighbors.length - 1)] ?? condition;
  }
  const fTemp = Math.round(
    WEATHER_TEMP[fCondition] + rng.gaussian(0, TUNING.FORECAST_TEMP_NOISE),
  );

  return {
    condition,
    tempF,
    forecast: { condition: fCondition, tempF: fTemp },
  };
}

/** Generate the very first day's weather from a seeded starting condition. */
export function initialWeather(rng: Rng, accuracy: number): WeatherDay {
  const start = CONDITION_ORDER[rng.weightedIndex([1, 3, 3, 2, 1, 1])]!;
  return makeWeatherDay(rng, start, accuracy);
}
