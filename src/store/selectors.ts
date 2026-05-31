/** Pure derived reads over GameState — shared by UI and (some) tests. */
import {
  derive,
  effectiveReputation,
  creditLimit,
  forecastConfidence,
  inventoryQty,
  usedStorage,
  priceTolerance,
  recipeQuality,
  expectedCustomers,
  TUNING,
  type GameState,
  type ItemId,
} from "../engine";
import { forecastSigma } from "../engine/economy";
import { LOCATION_BY_ID } from "../data/locations";
import { EVENT_BY_ID } from "../data/events";

export function currentLocation(g: GameState) {
  return LOCATION_BY_ID[g.currentLocationId]!;
}

export function storage(g: GameState) {
  const capacity = derive(g).storageCapacity;
  const used = usedStorage(g);
  return { capacity, used, free: Math.max(0, capacity - used) };
}

export function fixedCostsToday(g: GameState) {
  const rent = currentLocation(g).rentPerDay;
  const wages = g.staff.reduce((s, x) => s + x.wage, 0);
  const interest = Math.round(g.debt * TUNING.LOAN_RATE_PER_DAY * 100) / 100;
  return { rent, wages, marketing: g.marketingSpend, interest, total: rent + wages + g.marketingSpend + interest };
}

export function credit(g: GameState) {
  const limit = creditLimit(g);
  return { limit, available: Math.max(0, limit - g.debt) };
}

/** Forecast-based "today" weather the player plans against. */
export function forecastWeather(g: GameState) {
  return {
    condition: g.weatherToday.forecast.condition,
    tempF: g.weatherToday.forecast.tempF,
    forecast: g.weatherToday.forecast,
  };
}

/** Projected customers using the FORECAST (a hint; actual weather may differ). */
export function projectedCustomers(g: GameState): number {
  const loc = currentLocation(g);
  const effRep = effectiveReputation(g);
  const weather = forecastWeather(g);
  const tol = priceTolerance(loc, effRep, weather, g.qualityScoreEMA);
  const event = g.activeEventId ? EVENT_BY_ID[g.activeEventId] : undefined;
  return Math.round(
    expectedCustomers({
      location: loc,
      weather,
      dayOfWeek: (g.day - 1) % 7,
      effectiveRep: effRep,
      marketingSpend: g.marketingSpend,
      marketingFloor: derive(g).marketingFloor,
      price: g.recipe.pricePerCup,
      tolerance: tol,
      regularsPool: g.regularsPool,
      eventTrafficMult: event?.effect.trafficMult ?? 1,
    }),
  );
}

/** Recipe quality vs the forecast ideal (0..1) — the player-facing hint. */
export function recipeQualityHint(g: GameState): number {
  return recipeQuality(g.recipe, forecastWeather(g));
}

export function priceToleranceHint(g: GameState): number {
  return priceTolerance(
    currentLocation(g),
    effectiveReputation(g),
    forecastWeather(g),
    g.qualityScoreEMA,
  );
}

/** Ice you can count on across the whole day = on hand + ice-maker output. */
export function dailyIceProduction(g: GameState): number {
  return Math.round(derive(g).iceRegenPerMin * currentLocation(g).openMinutes);
}
export function projectedIceAvailable(g: GameState): number {
  return inventoryQty(g, "ice") + dailyIceProduction(g);
}

/**
 * How many pitchers the day's stock can brew (limited by the scarcest
 * ingredient). Ice counts the maker's full-day output too, so a stand with an
 * ice maker isn't falsely bottlenecked on the ice it starts the day with.
 */
export function pitchersFromStock(g: GameState): number {
  const r = g.recipe;
  const lim = (have: number, per: number) => (per > 0 ? have / per : Infinity);
  return Math.floor(
    Math.min(
      lim(inventoryQty(g, "lemon"), r.lemons),
      lim(inventoryQty(g, "sugar"), r.sugar),
      lim(projectedIceAvailable(g), r.ice),
    ),
  );
}

/** Cups of lemonade the current stock can ultimately serve (also cup-limited). */
export function servableCups(g: GameState): number {
  const fromPitchers = pitchersFromStock(g) * TUNING.CUPS_PER_PITCHER;
  return Math.min(fromPitchers, inventoryQty(g, "cup"));
}

export function netWorth(g: GameState): number {
  return g.cash - g.debt;
}

/** How much of an item will spoil tonight if left unused (planning warning). */
export function spoilTonight(g: GameState, item: ItemId): number {
  if (item === "ice") {
    return Math.round(inventoryQty(g, item) * (1 - derive(g).iceRetention));
  }
  if (item === "lemon") {
    let n = 0;
    for (const lot of g.inventory) {
      if (lot.item === "lemon" && lot.ageDays + 1 >= TUNING.LEMON_SHELF_LIFE) n += lot.qty;
    }
    return n;
  }
  return 0;
}

/** Days until the freshest-aging lemons spoil (for a freshness hint). */
export function lemonDaysLeft(g: GameState): number | null {
  const ages = g.inventory.filter((l) => l.item === "lemon").map((l) => l.ageDays);
  if (!ages.length) return null;
  return TUNING.LEMON_SHELF_LIFE - Math.max(...ages); // oldest lot drives spoilage
}

export type SalesLimiter = "crowd" | "capacity" | "stock";

export interface SalesForecast {
  crowd: number; // mid estimate of interested customers (forecast)
  crowdLow: number;
  crowdHigh: number;
  capacity: number; // cups your stations can serve in a day
  stockCups: number; // cups your current stock can make
  low: number;
  high: number;
  limiter: SalesLimiter;
  revenueLow: number;
  revenueHigh: number;
  confidence: number; // 0..1 — how sure the projection is
}

/**
 * A rough, honest sales projection. The crowd estimate carries an uncertainty
 * band that WIDENS at low forecast confidence (early game / no research) and
 * narrows as you learn your customers. Likely sales are then bounded by labor
 * capacity and stock — whichever is smallest.
 */
export function salesForecast(g: GameState): SalesForecast {
  const d = derive(g);
  const loc = currentLocation(g);
  const crowd = projectedCustomers(g);

  const confidence = forecastConfidence(g);
  const w = 2 * forecastSigma(confidence); // ~half-width of the demand band
  const crowdLow = crowd * (1 - w);
  const crowdHigh = crowd * (1 + w);

  // Per-cup time ≈ serve time + amortized batch-make time (stations multitask).
  const serveTime = TUNING.SERVE_BASE / d.serveSpeedMult;
  const cupsPerBatch = TUNING.CUPS_PER_PITCHER * d.batchSizeMult;
  const batchPerCup = TUNING.BATCH_TIME / (cupsPerBatch * d.batchSpeedMult);
  const perCup = serveTime + batchPerCup;
  const capacity = Math.floor((d.stationCount * loc.openMinutes) / perCup);

  const stockCups = servableCups(g);

  // The limiter is judged on the mid estimate.
  const mid = Math.min(crowd, capacity, stockCups);
  const limiter: SalesLimiter =
    mid === stockCups && stockCups <= crowd && stockCups <= capacity
      ? "stock"
      : mid === capacity && capacity <= crowd
        ? "capacity"
        : "crowd";

  const low = Math.round(Math.min(crowdLow, capacity, stockCups));
  const high = Math.round(Math.min(crowdHigh, capacity, stockCups));
  const price = g.recipe.pricePerCup;
  return {
    crowd,
    crowdLow: Math.round(crowdLow),
    crowdHigh: Math.round(crowdHigh),
    capacity,
    stockCups,
    low,
    high,
    limiter,
    revenueLow: low * price,
    revenueHigh: high * price,
    confidence,
  };
}

export type PriceVerdict = "raise" | "fair" | "pricey";

export interface PricingHint {
  verdict: PriceVerdict;
  text: string;
}

/** Qualitative pricing guidance from saved review feedback (price discovery). */
export function pricingHint(g: GameState): PricingHint {
  const pf = g.priceFeedback ?? 0;
  if (g.stats.daysPlayed < 1) return { verdict: "fair", text: "set a price & watch reviews" };
  if (pf > 0.22) return { verdict: "raise", text: "a bargain — could charge more" };
  if (pf < -0.18) return { verdict: "pricey", text: "a few find you pricey" };
  return { verdict: "fair", text: "feels about right" };
}
