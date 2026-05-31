import {
  WEATHER_DEMAND_MULT,
  WEATHER_PRICE_MULT,
  TUNING,
} from "./tuning";
import type {
  ArchetypeDef,
  Condition,
  LocationDef,
  Recipe,
  WeatherDay,
} from "./types";

// ---------------------------------------------------------------------------
// Weather → demand / price
// ---------------------------------------------------------------------------

/** Whole-day demand multiplier from weather, amplified by location variance. */
export function weatherDemandMult(weather: WeatherDay, variance = 1): number {
  const base = WEATHER_DEMAND_MULT[weather.condition];
  const tempTerm = clamp((weather.tempF - 75) / 100, -0.2, 0.25);
  const m = base + tempTerm;
  // Variance amplifies deviation from a neutral day.
  return Math.max(0, 1 + (m - 1) * variance);
}

export function weatherPriceMult(weather: WeatherDay): number {
  return WEATHER_PRICE_MULT[weather.condition];
}

// ---------------------------------------------------------------------------
// Ideal recipe (the hidden, weather-dependent target players discover)
// ---------------------------------------------------------------------------

export interface IdealRecipe {
  /** Unit-sum taste vector over [lemon, sugar, ice]. */
  vec: [number, number, number];
  strength: number; // solids/water target
}

function tempBand(weather: WeatherDay): "hot" | "mild" | "cold" {
  if (weather.condition === "heatwave" || weather.tempF >= 85) return "hot";
  if (weather.condition === "cold" || weather.tempF <= 58) return "cold";
  return "mild";
}

export function idealRecipe(weather: WeatherDay): IdealRecipe {
  switch (tempBand(weather)) {
    case "hot":
      return { vec: [0.34, 0.3, 0.36], strength: TUNING.IDEAL_STRENGTH_HOT };
    case "cold":
      return { vec: [0.42, 0.42, 0.16], strength: TUNING.IDEAL_STRENGTH_COLD };
    default:
      return { vec: [0.38, 0.34, 0.28], strength: TUNING.IDEAL_STRENGTH_MILD };
  }
}

function normalize3(a: number, b: number, c: number): [number, number, number] {
  const sum = a + b + c || 1;
  return [a / sum, b / sum, c / sum];
}

/**
 * Recipe quality in [0,1] vs the weather's ideal, optionally nudged by an
 * archetype's taste preference. Caller adds per-customer noise.
 */
export function recipeQuality(
  recipe: Recipe,
  weather: WeatherDay,
  tasteShift?: { lemon: number; sugar: number; ice: number },
): number {
  const ideal = idealRecipe(weather);
  let [il, is, ii] = ideal.vec;
  if (tasteShift) {
    [il, is, ii] = normalize3(
      Math.max(0, il + tasteShift.lemon),
      Math.max(0, is + tasteShift.sugar),
      Math.max(0, ii + tasteShift.ice),
    );
  }
  const [pl, ps, pi] = normalize3(recipe.lemons, recipe.sugar, recipe.ice);
  const dist = Math.hypot(pl - il, ps - is, pi - ii);

  const water = recipe.water || 1;
  const strength = (recipe.lemons + recipe.sugar) / water;
  const strengthErr = Math.abs(strength - ideal.strength);

  return clamp(
    1 - TUNING.QUALITY_K1 * dist - TUNING.QUALITY_K2 * strengthErr,
    0,
    1,
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Price tolerance ($) given location, reputation, weather, recipe track record. */
export function priceTolerance(
  location: LocationDef,
  effectiveRep: number,
  weather: WeatherDay,
  qualityScoreEMA: number,
): number {
  return (
    location.priceToleranceBase *
    (1 + effectiveRep / TUNING.PRICE_TOL_REP_SPAN) *
    weatherPriceMult(weather) *
    (1 + 0.1 * (qualityScoreEMA - 0.5))
  );
}

/** Fraction of would-be customers who accept the price (logistic). */
export function priceDemandMult(price: number, tolerance: number): number {
  const r = price / (tolerance || 1);
  return 1 / (1 + Math.exp(TUNING.PRICE_STEEP * (r - TUNING.PRICE_MID)));
}

/** How "fair" the price feels (drives reviews even when the sale completes). */
export function priceFairness(
  price: number,
  tolerance: number,
  priceSensitivity = 1,
): number {
  const r = price / (tolerance || 1);
  const over = Math.max(0, r - TUNING.PRICE_FAIR_FREE);
  return clamp(1 - over * TUNING.PRICE_FAIR_K * priceSensitivity, 0, 1);
}

// ---------------------------------------------------------------------------
// Marketing (diminishing returns)
// ---------------------------------------------------------------------------

export function marketingShortTerm(spend: number, floor = 0): number {
  return (
    TUNING.MKT_SHORT_MAX * (1 - Math.exp(-spend / TUNING.MKT_SHORT_SCALE)) +
    floor
  );
}

export function marketingRepBoost(spend: number): number {
  return TUNING.MKT_REP_MAX * (1 - Math.exp(-spend / TUNING.MKT_REP_SCALE));
}

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

export interface DemandInputs {
  location: LocationDef;
  weather: WeatherDay;
  dayOfWeek: number;
  effectiveRep: number;
  marketingSpend: number;
  marketingFloor: number;
  price: number;
  tolerance: number;
  regularsPool: number;
  eventTrafficMult: number;
}

/** Expected number of would-be customers for the whole day. */
export function expectedCustomers(d: DemandInputs): number {
  const repMult =
    TUNING.REP_DEMAND_FLOOR + (TUNING.REP_DEMAND_SPAN * d.effectiveRep) / 100;
  const market = 1 + marketingShortTerm(d.marketingSpend, d.marketingFloor);
  const base =
    d.location.baseTraffic *
    weatherDemandMult(d.weather, d.location.weatherVariance) *
    (TUNING.DOW_MULT[d.dayOfWeek] ?? 1) *
    repMult *
    market *
    priceDemandMult(d.price, d.tolerance) *
    d.eventTrafficMult;
  // Regulars show up on top, only lightly weather-sensitive.
  const regulars =
    d.regularsPool *
    TUNING.REGULARS_TRAFFIC_FRACTION *
    Math.max(0.5, weatherDemandMult(d.weather, 0.5));
  return base + regulars;
}

// ---------------------------------------------------------------------------
// Intra-day arrival curve
// ---------------------------------------------------------------------------

function gaussBump(x: number, center: number, width: number): number {
  const z = (x - center) / width;
  return Math.exp(-0.5 * z * z);
}

/** Unnormalized arrival weight for a given minute, scaled to the day length. */
export function arrivalCurveWeight(minute: number, openMinutes: number): number {
  const s = openMinutes / 480; // peaks are tuned for an 8h day
  return (
    TUNING.PEAK1_WEIGHT * gaussBump(minute, TUNING.PEAK1_CENTER * s, TUNING.PEAK1_WIDTH * s) +
    TUNING.PEAK2_WEIGHT * gaussBump(minute, TUNING.PEAK2_CENTER * s, TUNING.PEAK2_WIDTH * s) +
    TUNING.CURVE_BASELINE
  );
}

// ---------------------------------------------------------------------------
// Satisfaction & tips
// ---------------------------------------------------------------------------

export function waitScore(waited: number, patience: number): number {
  return clamp(1 - (waited / (patience || 1)) * TUNING.WAIT_K, 0, 1);
}

export function combineSatisfaction(
  quality: number,
  fairness: number,
  wait: number,
): number {
  return (
    TUNING.W_QUALITY * quality + TUNING.W_PRICE * fairness + TUNING.W_WAIT * wait
  );
}

export function starsFromSatisfaction(satisfaction: number): number {
  return clamp(Math.round(1 + 4 * satisfaction), 1, 5);
}

/** Tip amount for a sale (0 if not delighted / archetype too stingy). */
export function tipAmount(
  satisfaction: number,
  price: number,
  archetype: ArchetypeDef,
  roll: number,
): number {
  if (satisfaction < TUNING.TIP_THRESHOLD) return 0;
  if (roll > archetype.tipGenerosity) return 0;
  const over = (satisfaction - TUNING.TIP_THRESHOLD) / (1 - TUNING.TIP_THRESHOLD);
  return (
    price * TUNING.TIP_BASE_FRACTION * over * (0.5 + 0.5 * archetype.tipGenerosity)
  );
}

// ---------------------------------------------------------------------------
// Forecast confidence → demand noise
// ---------------------------------------------------------------------------

/** Standard deviation of the day's demand "market mood" given confidence 0..1. */
export function forecastSigma(confidence: number): number {
  const c = clamp(confidence, 0, 1);
  return TUNING.FORECAST_SIGMA_HI + (TUNING.FORECAST_SIGMA_LO - TUNING.FORECAST_SIGMA_HI) * c;
}

// ---------------------------------------------------------------------------
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function conditionTempBand(c: Condition): "hot" | "mild" | "cold" {
  if (c === "heatwave") return "hot";
  if (c === "cold") return "cold";
  return "mild";
}
