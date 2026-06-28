/**
 * All balance constants in one place. Tweak the game's feel here without
 * touching logic. Pure data.
 */
import type { Condition, ItemId } from "./types";

export const TUNING = {
  SCHEMA_VERSION: 10,
  STARTING_CASH: 80,

  // --- Late-game: Tycoon ladder & Prestige (Phase L1) ---
  BASE_MENU_CAP: 2, // active products before menu-slot perks
  // The endless goal ladder activates once the player has cleared this many of
  // the base campaign goals (≈ early-mid game) — surfaces depth before the win.
  LADDER_ACTIVATE_GOALS: 3,
  // Cash → Prestige conversion: an escalating cost per point (pure fn of balance)
  // so a cash-rich late game has somewhere to pour money. Perks are the sink.
  PRESTIGE_CONVERT_BASE: 2000, // cash for the first prestige point
  PRESTIGE_CONVERT_GROWTH: 0.15, // +15% cost per prestige already held
  // Weekly contracts (Phase L2)
  CONTRACTS_UNLOCK_DAY: 4, // first contracts appear once the player has footing
  CONTRACT_ACTIVE_CAP: 2, // how many contracts can be accepted at once

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

  // --- Reputation facets (taste / service / value / buzz) ---
  // Blend weights → the overall ★ (sum to 1). A balanced operator with equal
  // facets reproduces the old single-number behavior closely.
  REP_BLEND: { taste: 0.35, service: 0.25, value: 0.25, buzz: 0.15 } as Record<
    "taste" | "service" | "value" | "buzz",
    number
  >,
  // Per-facet overnight decay. Buzz fades fast (awareness must be fed); taste
  // compounds (a good recipe pays for weeks).
  REP_DECAY_FACET: { taste: 0.008, service: 0.015, value: 0.015, buzz: 0.04 } as Record<
    "taste" | "service" | "value" | "buzz",
    number
  >,
  // Word-of-mouth: delighted customers nudge Buzz upward (organic awareness).
  BUZZ_WOM_GAIN: 14, // × (delighted / served) eased into Buzz
  // Economy "tilts": how far a facet diverging from the overall shifts its lever.
  // Each multiplies (effFacet − effOverall)/100, so they are NEUTRAL at uniformity
  // (a balanced business behaves exactly like the old single-rep model).
  TASTE_TOL_TILT: 0.6, // taste above overall → more price tolerance
  BUZZ_DEMAND_TILT: 0.7, // buzz above overall → more foot traffic
  VALUE_DEMAND_TILT: 0.5, // value above overall → better price acceptance
  SERVICE_PATIENCE_TILT: 0.6, // service above overall → more patient customers
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
  // Staff experience: each day worked earns XP; training buys a chunk of it.
  // Levels are derived from cumulative XP via STAFF_XP_FOR_LEVEL (index = level).
  STAFF_XP_PER_DAY: 12,
  STAFF_XP_FOR_LEVEL: [0, 60, 150, 300] as const, // level 0..3 thresholds
  STAFF_MAX_LEVEL: 3,
  STAFF_LEVEL_SERVE_GAIN: 0.12, // serve-speed bonus added per level
  STAFF_LEVEL_BATCH_GAIN: 0.08, // batch-speed bonus added per level
  STAFF_TRAIN_COST: 60, // cash for one training session
  STAFF_TRAIN_XP: 40, // XP granted per training session

  // --- Research tree (cash + days → permanent capability) ---
  // Only one node researches at a time; progress ticks at day settlement.

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

  // --- Supplier market (mean-reverting daily price walk) ---
  SUPPLIER_REVERSION: 0.25, // fraction of the gap back toward 1.0 each day
  SUPPLIER_VOL: { lemon: 0.14, sugar: 0.06, ice: 0.05, cup: 0.02 } as Record<ItemId, number>,
  SUPPLIER_MIN: 0.7, // price index floor
  SUPPLIER_MAX: 1.5, // price index ceiling
  // Per-unit premium-grade cost multiplier (only taste solids gain quality).
  GRADE_COST_MULT: { lemon: 1.8, sugar: 1.6 } as Partial<Record<ItemId, number>>,
  // Max additive recipe-quality bonus when 100% of taste solids are premium.
  GRADE_QUALITY_BONUS: 0.1,
  // Bulk discounts: buying ≥ `min` units in one purchase scales the unit price.
  // Listed high→low; first match wins.
  BULK_TIERS: [
    { min: 250, mult: 0.82 },
    { min: 120, mult: 0.88 },
    { min: 50, mult: 0.94 },
  ] as const,

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
