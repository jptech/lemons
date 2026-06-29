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
  effectiveFacets,
  uniformFacets,
  primaryProduct,
  primaryProductId,
  productStateOf,
  productTaste,
  type GameState,
  type ItemId,
  type ProductId,
  type RepFacetId,
} from "../engine";
import { forecastSigma } from "../engine/economy";
import { PRODUCT_BY_ID, type ProductDef } from "../data/products";
import { ARCHETYPES } from "../data/archetypes";
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
  const facets = effectiveFacets(g);
  const weather = forecastWeather(g);
  const primary = primaryProduct(g);
  const tol = priceTolerance(loc, effRep, weather, primary.qualityScoreEMA, facets.taste);
  const event = g.activeEventId ? EVENT_BY_ID[g.activeEventId] : undefined;
  return Math.round(
    expectedCustomers({
      location: loc,
      weather,
      dayOfWeek: (g.day - 1) % 7,
      effectiveRep: effRep,
      buzzEff: facets.buzz,
      valueEff: facets.value,
      marketingSpend: g.marketingSpend,
      marketingFloor: derive(g).marketingFloor,
      price: primary.recipe.pricePerCup,
      tolerance: tol,
      regularsPool: g.regularsPool,
      eventTrafficMult: event?.effect.trafficMult ?? 1,
      awareness: g.brand?.awareness ?? 0,
    }),
  );
}

/** Recipe quality vs the forecast ideal (0..1) — the player-facing hint. */
export function recipeQualityHint(g: GameState, productId: ProductId = primaryProductId(g)): number {
  const ps = productStateOf(g, productId);
  return recipeQuality(ps.recipe, forecastWeather(g), undefined, productTaste(productId));
}

export function priceToleranceHint(g: GameState, productId: ProductId = primaryProductId(g)): number {
  const def = PRODUCT_BY_ID[productId];
  const ps = productStateOf(g, productId);
  return (
    priceTolerance(
      currentLocation(g),
      effectiveReputation(g),
      forecastWeather(g),
      ps.qualityScoreEMA,
      effectiveFacets(g).taste,
    ) * (def?.priceTolMult ?? 1)
  );
}

// ---------------------------------------------------------------------------
// Reputation facets — player-facing readout + weak-spot diagnosis
// ---------------------------------------------------------------------------
export interface RepFacetView {
  id: RepFacetId;
  label: string;
  icon: string;
  value: number; // effective 0..100
  /** Change vs the prior day's effective facet (for a trend arrow). */
  delta: number;
  /** One-line plain-language "what this does / how to improve". */
  tip: string;
}

const FACET_META: Record<RepFacetId, { label: string; icon: string; tip: string }> = {
  taste: { label: "Taste", icon: "⭐", tip: "Dial in your recipe for the weather — lets you charge more." },
  service: { label: "Service", icon: "⚡", tip: "Cut the wait — add a station or faster staff so fewer walk off." },
  value: { label: "Value", icon: "💵", tip: "Ease your price — overcharging sours how fair you feel." },
  buzz: { label: "Buzz", icon: "📣", tip: "Market and delight customers — awareness fades fast if you coast." },
};

const FACET_ORDER: RepFacetId[] = ["taste", "service", "value", "buzz"];

/** The four effective facets with trend deltas, for the reputation card. */
export function repFacetViews(g: GameState): RepFacetView[] {
  const cur = effectiveFacets(g); // == end of the last day played
  // Trend = how each facet moved on the MOST RECENT day: compare the last day's
  // end (≈ cur) against the day before it (or the run's starting rep on day 2).
  const n = g.history.length;
  const last = n ? g.history[n - 1] : undefined;
  const prev =
    g.history[n - 2]?.repFacetsEnd ?? (last ? uniformFacets(last.reputationStart) : undefined);
  return FACET_ORDER.map((id) => ({
    id,
    label: FACET_META[id].label,
    icon: FACET_META[id].icon,
    value: cur[id],
    delta: prev ? cur[id] - prev[id] : 0,
    tip: FACET_META[id].tip,
  }));
}

/**
 * The facet most worth improving: the lowest one, but only flagged once there's
 * a meaningful spread (so we don't nag a balanced operator). Returns null when
 * the business is evenly developed.
 */
export function repWeakSpot(g: GameState): RepFacetView | null {
  if (g.stats.daysPlayed < 2) return null;
  const views = repFacetViews(g);
  const lowest = views.reduce((a, b) => (b.value < a.value ? b : a));
  const highest = views.reduce((a, b) => (b.value > a.value ? b : a));
  if (highest.value - lowest.value < 8) return null; // evenly developed
  return lowest;
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
 * (Primary product — kept for the single-product stock check.)
 */
export function pitchersFromStock(g: GameState): number {
  const r = primaryProduct(g).recipe;
  const lim = (have: number, per: number) => (per > 0 ? have / per : Infinity);
  return Math.floor(
    Math.min(
      lim(inventoryQty(g, "lemon"), r.lemons),
      lim(inventoryQty(g, "sugar"), r.sugar),
      lim(projectedIceAvailable(g), r.ice),
    ),
  );
}

// ---------------------------------------------------------------------------
// Per-product expectations (the menu split & blended stock demand)
// ---------------------------------------------------------------------------
export interface ProductShare {
  id: ProductId;
  def: ProductDef;
  fraction: number; // expected share of sales (0..1)
}

/**
 * Expected split of sales across the active menu. Customers will buy either
 * drink but lean by archetype appeal — a kid usually grabs pink, an adult is
 * even. Mirrors the sim's archetype × product-appeal weighting (an estimate;
 * the live mix varies with the day's actual crowd).
 */
export function productSplit(g: GameState): ProductShare[] {
  const menu = (g.menu.length ? g.menu : (["classic"] as ProductId[])).filter((id) => PRODUCT_BY_ID[id]);
  if (menu.length <= 1) {
    const id = menu[0] ?? "classic";
    return [{ id, def: PRODUCT_BY_ID[id]!, fraction: 1 }];
  }
  const loc = currentLocation(g);
  const bias = loc.archetypeBias ?? {};
  const regularWeight = Math.min(2.5, g.regularsPool / Math.max(1, loc.baseTraffic * 0.15));
  const archWeights = ARCHETYPES.map((a) => ({
    a,
    w: a.id === "regular" ? regularWeight : a.baseWeight * (bias[a.id] ?? 1),
  }));
  const totalArch = archWeights.reduce((s, x) => s + x.w, 0) || 1;
  const frac: Record<string, number> = {};
  for (const id of menu) frac[id] = 0;
  for (const { a, w } of archWeights) {
    const pArch = w / totalArch;
    const appealSum = menu.reduce((s, id) => s + Math.max(0, PRODUCT_BY_ID[id]?.appeal?.[a.id] ?? 1), 0) || 1;
    for (const id of menu) {
      const ap = Math.max(0, PRODUCT_BY_ID[id]?.appeal?.[a.id] ?? 1);
      frac[id] = (frac[id] ?? 0) + pArch * (ap / appealSum);
    }
  }
  return menu.map((id) => ({ id, def: PRODUCT_BY_ID[id]!, fraction: frac[id] ?? 0 }));
}

/** Expected ingredient units consumed per cup, blended across the menu split. */
function blendedPerCup(g: GameState): { lemon: number; sugar: number; ice: number } {
  const out = { lemon: 0, sugar: 0, ice: 0 };
  for (const { id, fraction } of productSplit(g)) {
    const r = productStateOf(g, id).recipe;
    out.lemon += (fraction * r.lemons) / TUNING.CUPS_PER_PITCHER;
    out.sugar += (fraction * r.sugar) / TUNING.CUPS_PER_PITCHER;
    out.ice += (fraction * r.ice) / TUNING.CUPS_PER_PITCHER;
  }
  return out;
}

/** Blended average price per cup across the expected menu split. */
export function blendedPrice(g: GameState): number {
  let p = 0;
  for (const { id, fraction } of productSplit(g)) p += fraction * productStateOf(g, id).recipe.pricePerCup;
  return p;
}

/**
 * Cups the day's stock can ultimately serve, accounting for BOTH products
 * sharing the same raw ingredients (weighted by the expected sales split) and
 * the cup count.
 */
export function servableCups(g: GameState): number {
  const pc = blendedPerCup(g);
  const lim = (have: number, per: number) => (per > 1e-9 ? have / per : Infinity);
  return Math.max(
    0,
    Math.floor(
      Math.min(
        lim(inventoryQty(g, "lemon"), pc.lemon),
        lim(inventoryQty(g, "sugar"), pc.sugar),
        lim(projectedIceAvailable(g), pc.ice),
        inventoryQty(g, "cup"),
      ),
    ),
  );
}

/** Stock split by quality grade (for clear standard-vs-premium display). */
export function inventoryByGrade(g: GameState, item: ItemId): { standard: number; premium: number } {
  let standard = 0;
  let premium = 0;
  for (const lot of g.inventory) {
    if (lot.item !== item) continue;
    if (lot.grade === "premium") premium += lot.qty;
    else standard += lot.qty;
  }
  return { standard, premium };
}

export function netWorth(g: GameState): number {
  return g.cash - g.debt;
}

// ---------------------------------------------------------------------------
// Supplier market — player-facing price read
// ---------------------------------------------------------------------------
export interface PriceTrend {
  index: number; // current multiplier vs baseline (1.0)
  dir: "up" | "down" | "flat"; // pricey / cheap / about normal today
  pctFromNormal: number; // signed % away from the baseline price
}

/** How an item's price compares to its normal baseline right now. */
export function priceTrend(g: GameState, item: ItemId): PriceTrend {
  const index = g.supplier?.priceIndex[item] ?? 1;
  const pctFromNormal = (index - 1) * 100;
  const dir = pctFromNormal > 3 ? "up" : pctFromNormal < -3 ? "down" : "flat";
  return { index, dir, pctFromNormal };
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
  // Revenue uses the blended price across the expected menu split (a 2nd, pricier
  // drink lifts the average take per cup).
  const price = blendedPrice(g);
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
export function pricingHint(g: GameState, productId: ProductId = primaryProductId(g)): PricingHint {
  const pf = productStateOf(g, productId).priceFeedback ?? 0;
  if (g.stats.daysPlayed < 1) return { verdict: "fair", text: "set a price & watch reviews" };
  if (pf > 0.22) return { verdict: "raise", text: "a bargain — could charge more" };
  if (pf < -0.18) return { verdict: "pricey", text: "a few find you pricey" };
  return { verdict: "fair", text: "feels about right" };
}
