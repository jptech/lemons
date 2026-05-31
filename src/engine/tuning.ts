/**
 * All balance constants in one place. Tweak the game's feel here without
 * touching logic. Pure data.
 */
import type { Condition, ItemId } from "./types";

export const TUNING = {
  SCHEMA_VERSION: 4,
  STARTING_CASH: 80,

  // --- Day structure ---
  CUPS_PER_PITCHER: 8,
  LEMON_SHELF_LIFE: 4, // days before lemons spoil
  BASE_STORAGE_SLOTS: 60,

  // --- Service & queue (minutes) ---
  SERVE_BASE: 2.0,
  BATCH_TIME: 6,
  PATIENCE_BASE: 6,
  WAIT_K: 1.0,

  // --- Demand ---
  REP_DEMAND_FLOOR: 0.6, // demand mult at rep 0
  REP_DEMAND_SPAN: 0.8, // + this at rep 100
  PRICE_STEEP: 4.6,
  PRICE_MID: 1.0,
  // Intra-day bimodal arrival curve (gaussian peaks over 480 minutes)
  PEAK1_CENTER: 150,
  PEAK1_WIDTH: 60,
  PEAK1_WEIGHT: 0.45,
  PEAK2_CENTER: 330,
  PEAK2_WIDTH: 80,
  PEAK2_WEIGHT: 0.55,
  CURVE_BASELINE: 0.15,

  // --- Satisfaction ---
  QUALITY_K1: 1.6, // taste-distance penalty
  QUALITY_K2: 0.4, // strength-error penalty
  IDEAL_STRENGTH_HOT: 0.9,
  IDEAL_STRENGTH_MILD: 1.0,
  IDEAL_STRENGTH_COLD: 1.15,
  TASTE_NOISE: 0.05,
  W_QUALITY: 0.45,
  W_PRICE: 0.25,
  W_WAIT: 0.3,
  PRICE_FAIR_FREE: 0.8, // price/tol below this = perfectly fair
  PRICE_FAIR_K: 1.5,
  SAT_BALK: 0.35,
  SAT_RENEGE: 0.1,

  // --- Reviews & reputation ---
  REVIEW_RATE: 0.25,
  REP_EASE: 0.15,
  REP_DECAY: 0.01,
  GLOBAL_REP_EASE_FACTOR: 0.6, // global rep eases slower than location rep
  LOSS_REP_PENALTY: 18, // reputation points shaved per 100% loss rate
  PRICE_TOL_REP_SPAN: 240, // rep/this added as price-tolerance fraction (lower = less)
  QUALITY_EMA_EASE: 0.2,
  FEEDBACK_EASE: 0.34, // how fast saved recipe feedback adapts
  PRICE_FEEDBACK_EASE: 0.3, // how fast saved pricing feedback adapts

  // --- Demand uncertainty / forecast confidence ---
  FORECAST_SIGMA_HI: 0.2, // demand noise at low confidence (early game)
  FORECAST_SIGMA_LO: 0.05, // demand noise at high confidence (research + experience)
  CONFIDENCE_DAY_MAX: 0.35, // experience contribution cap
  CONFIDENCE_DAY_RATE: 0.012, // per-day experience gain
  CONFIDENCE_REP_WEIGHT: 0.2, // reputation/100 × this

  // --- Tips ---
  TIP_THRESHOLD: 0.7, // satisfaction above which a tip is possible
  TIP_BASE_FRACTION: 0.25, // of cup price, scaled by satisfaction & generosity

  // --- Regulars / loyalty ---
  REGULARS_GAIN: 0.08, // fraction of (delighted - regulars target) eased in
  REGULARS_DECAY: 0.03,
  REGULARS_TRAFFIC_FRACTION: 0.5, // how much of regularsPool shows up as traffic

  // --- Marketing (diminishing returns) ---
  MKT_SHORT_MAX: 0.6,
  MKT_SHORT_SCALE: 40,
  MKT_REP_MAX: 1.5,
  MKT_REP_SCALE: 60,

  // --- Staff ---
  STAFF_CAP: 3,

  // --- Loans / soft failure ---
  LOAN_RATE_PER_DAY: 0.02,
  CREDIT_BASE: 100,
  CREDIT_PER_REP: 6, // credit limit += rep * this

  // --- Weather forecast ---
  FORECAST_ACCURACY: 0.75,
  FORECAST_TEMP_NOISE: 4,

  // --- Real-time playback ---
  MS_PER_SIM_MINUTE: 95, // ~46s for a 480-min day at 1x (calmer); 0.5x ≈ 90s

  // --- Item economics ---
  ITEM_COST: { lemon: 0.2, sugar: 0.1, ice: 0.08, cup: 0.03 } as Record<ItemId, number>,
  SLOT_COST: { lemon: 0.1, sugar: 0.05, ice: 0.2, cup: 0.02 } as Record<ItemId, number>,

  // Sun .. Sat
  DOW_MULT: [1.25, 0.85, 0.9, 1.0, 1.05, 1.2, 1.35] as const,
} as const;

export const WEATHER_DEMAND_MULT: Record<Condition, number> = {
  heatwave: 1.7,
  sunny: 1.4,
  partly: 1.15,
  cloudy: 0.9,
  rainy: 0.45,
  cold: 0.6,
};

export const WEATHER_PRICE_MULT: Record<Condition, number> = {
  heatwave: 1.2,
  sunny: 1.1,
  partly: 1.0,
  cloudy: 0.92,
  rainy: 0.8,
  cold: 0.85,
};

/** Base temperature (°F) for each condition before per-day noise. */
export const WEATHER_TEMP: Record<Condition, number> = {
  heatwave: 98,
  sunny: 84,
  partly: 76,
  cloudy: 68,
  rainy: 60,
  cold: 48,
};
