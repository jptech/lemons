/**
 * Lemonade Lane — shared type vocabulary. Pure data shapes, no logic, no DOM.
 * The engine and UI both speak these types; the engine is the only writer.
 */

// ---------------------------------------------------------------------------
// Inventory & recipe
// ---------------------------------------------------------------------------
export type ItemId = "lemon" | "sugar" | "ice" | "cup";
export const STOCK_ITEMS: readonly ItemId[] = ["lemon", "sugar", "ice", "cup"];

/** Ingredient quality grade. Premium ingredients raise the recipe quality ceiling
 *  (only the taste solids — lemon/sugar — have a meaningful premium). */
export type ItemGrade = "standard" | "premium";

export interface InventoryLot {
  item: ItemId;
  qty: number;
  ageDays: number;
  /** Absent = standard (keeps old saves valid). */
  grade?: ItemGrade;
}

/** The supplier market: a per-item price index (multiplier on base cost) that
 *  drifts day to day via a seeded mean-reverting walk. */
export interface SupplierState {
  priceIndex: Record<ItemId, number>;
}

/** Recipe for one pitcher: integer "parts" of each ingredient + the cup price. */
export interface Recipe {
  lemons: number;
  sugar: number;
  water: number;
  ice: number;
  pricePerCup: number;
}

export type ProductId = "classic" | "pink";

/** Per-product mutable state — each product has its own recipe, price, learned
 *  quality EMA, and saved recipe/price feedback (its own discovery loop). */
export interface ProductState {
  recipe: Recipe;
  qualityScoreEMA: number; // 0..1 EMA of this product's recipe quality
  recipeFeedback: { lemon: number; sugar: number; ice: number };
  priceFeedback: number; // ~[-1,1]; + = room to charge more
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export type Condition =
  | "sunny"
  | "partly"
  | "cloudy"
  | "rainy"
  | "heatwave"
  | "cold";

export interface WeatherDay {
  condition: Condition;
  tempF: number;
  forecast: { condition: Condition; tempF: number };
}

// ---------------------------------------------------------------------------
// Customer archetypes
// ---------------------------------------------------------------------------
export type ArchetypeId = "kid" | "adult" | "tourist" | "regular" | "healthnut";

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  icon: string;
  /** >1 = more put off by high prices, <1 = will pay up. */
  priceSensitivity: number;
  /** Multiplier on base patience. */
  patienceMult: number;
  /** Shifts this customer's ideal recipe target (unit-vector nudge). */
  tasteShift: { lemon: number; sugar: number; ice: number };
  /** 0..1 chance-and-size factor for leaving a tip when delighted. */
  tipGenerosity: number;
  /** Default mix weight before location/weather bias. */
  baseWeight: number;
}

// ---------------------------------------------------------------------------
// Reputation facets
// ---------------------------------------------------------------------------
/**
 * Reputation is a small vector, not a single dial. Each facet grows from a
 * different driver, decays at a different rate, and pushes a different lever:
 *  - taste   ← recipe quality      → price tolerance (a proven recipe pays)
 *  - service ← short waits         → customer patience / throughput headroom
 *  - value   ← price fairness      → demand at a given price
 *  - buzz    ← marketing + delight → top-of-funnel awareness (decays fastest)
 * The blended overall (see REP_BLEND) still drives credit, forecast, and the
 * headline ★, so old call-sites keep working.
 */
export interface RepFacets {
  taste: number; // 0..100
  service: number; // 0..100
  value: number; // 0..100
  buzz: number; // 0..100
}

export type RepFacetId = keyof RepFacets;

// ---------------------------------------------------------------------------
// Locations, equipment, staff
// ---------------------------------------------------------------------------
export interface LocationDef {
  id: string;
  name: string;
  icon: string;
  baseTraffic: number;
  priceToleranceBase: number;
  rentPerDay: number;
  unlockCost: number;
  openMinutes: number;
  /** Scales weather's swing on demand (higher = riskier). */
  weatherVariance: number;
  /** Per-archetype weight multipliers at this location (default 1). */
  archetypeBias?: Partial<Record<ArchetypeId, number>>;
}

export interface EquipmentEffects {
  storageSlots?: number;
  serveSpeedMult?: number;
  batchSpeedMult?: number;
  batchSizeMult?: number;
  patienceMult?: number;
  marketingFloor?: number;
  iceRetention?: number; // 0..1 fraction of ice surviving overnight
  forecastAccuracy?: number; // additive bump to weather forecast accuracy
  iceRegenPerMin?: number; // ice produced per in-game minute during the day
  forecastConfidence?: number; // narrows demand/pricing uncertainty (0..1-ish)
  regularsGainMult?: number; // multiplies how fast the regulars pool grows
}

/** Prerequisites to purchase an equipment level. */
export interface EquipmentUnlock {
  location?: string; // must have unlocked this location id
  rep?: number; // minimum global reputation
  day?: number; // minimum day
}

export interface EquipmentDef {
  id: string;
  line: string; // upgrade-line group (only the highest owned level applies)
  level: number; // 1, 2, 3 …
  name: string;
  icon: string;
  cost: number;
  blurb: string;
  /** TOTAL effects at this level (levels replace within a line, lines stack). */
  effects: EquipmentEffects;
  unlock?: EquipmentUnlock;
}

export type StaffRole = "SERVE" | "MAKE";

export interface StaffDef {
  tier: 1 | 2 | 3;
  name: string;
  icon: string;
  wage: number;
  serveSpeedBonus: number;
  batchSpeedBonus: number;
}

export interface Staff {
  id: string;
  tier: 1 | 2 | 3;
  name: string;
  icon: string;
  wage: number;
  serveSpeedBonus: number;
  batchSpeedBonus: number;
  role: StaffRole;
  /** Experience earned by working (and training). Drives `level`. */
  xp: number;
  /** Derived from xp via TUNING.STAFF_XP_FOR_LEVEL; adds to the speed bonuses. */
  level: number;
  /** Fatigue 0..100 (Phase L4): rises with work, lowers a tired station's speed. */
  fatigue: number;
  /** Planned to rest the upcoming day (recovers fatigue; no station; half wage). */
  resting: boolean;
}

// ---------------------------------------------------------------------------
// Research tree (long cash + time sink → permanent capability)
// ---------------------------------------------------------------------------
/** Permanent capabilities a completed research node grants. A small subset that
 *  hooks existing levers (all folded in `derive()`), so the forecast stays honest. */
export interface ResearchEffects {
  /** Additive forecast-confidence (stacks with the research-equipment line). */
  forecastConfidence?: number;
  /** Multiplies regulars-pool growth (stacks with the loyalty-equipment line). */
  regularsGainMult?: number;
  /** Additive passive marketing reach. */
  marketingFloor?: number;
}

export interface ResearchNodeDef {
  id: string;
  name: string;
  icon: string;
  cost: number; // cash
  days: number; // in-game days to complete once started
  prereqs: string[]; // research ids that must be completed first
  blurb: string;
  effect: ResearchEffects;
}

/** Player's research progress: what's done and what's currently cooking. */
export interface ResearchState {
  completed: string[];
  inProgress: { id: string; daysLeft: number } | null;
}

// ---------------------------------------------------------------------------
// Random daily events (data-driven; effects are plain modifiers)
// ---------------------------------------------------------------------------
export interface EventEffect {
  trafficMult?: number; // scales the whole day's potential customers
  priceTolMult?: number;
  repDelta?: number; // applied at settlement
  lemonPriceMult?: number; // scales lemon buy price during planning
  forecastReliable?: boolean;
}

export interface DayEventDef {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  weight: number;
  minDay?: number;
  effect: EventEffect;
}

// ---------------------------------------------------------------------------
// Goals & achievements (declarative predicates live in data/)
// ---------------------------------------------------------------------------
export interface GoalDef {
  id: string;
  title: string;
  desc: string;
  /** Evaluated against the post-settlement GameState. */
  check: (s: GameState) => boolean;
}

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  check: (s: GameState) => boolean;
}

// ---------------------------------------------------------------------------
// Stats & per-day results
// ---------------------------------------------------------------------------
export interface Stats {
  totalCupsSold: number;
  totalRevenue: number;
  totalProfit: number;
  totalTips: number;
  totalCustomersLost: number;
  bestDayProfit: number;
  bestDayProfitDay: number;
  bestDayCups: number;
  daysPlayed: number;
  currentProfitStreak: number;
  longestProfitStreak: number;
  sumStars: number;
  countStars: number;
  peakReputation: number;
  peakCash: number;
  locationsUnlocked: number;
}

export interface DayCosts {
  rent: number;
  wages: number;
  marketing: number;
  stock: number;
  equipment: number;
  interest: number;
}

// ---------------------------------------------------------------------------
// Advanced per-day metrics (demographics / wait / recipe prefs / loyalty)
// ---------------------------------------------------------------------------
/** Per-archetype funnel + experience breakdown for a single day. */
export interface DemographicsRow {
  arrived: number; // entered the funnel (served + lost)
  served: number;
  lost: number; // balked + reneged + left-in-queue-at-close
  revenue: number;
  tips: number;
  starSum: number; // sum of sampled stars (reuses the existing review sample)
  starCount: number; // how many sampled reviews this archetype left
  waitSum: number; // total minutes waited, over served customers
  delighted: number; // sat >= TIP_THRESHOLD (the loyalty-conversion driver)
}

/** Rich per-day metrics. Optional on DayResult — older saves lack it and the UI
 *  guards with `?.`, so no migration is needed (history is append-only). */
export interface DayMetrics {
  demographics: Partial<Record<ArchetypeId, DemographicsRow>>;
  /** Wait time over SERVED customers, in minutes. */
  wait: { avgMin: number; maxMin: number; histogram: number[] };
  /** Per-product raw taste drift this day (+ = guests wanted MORE) + price signal. */
  recipePrefs: Partial<Record<ProductId, { lemon: number; sugar: number; ice: number; price: number }>>;
  /** Regulars / loyalty funnel — how fast & how often we mint regulars. */
  loyalty: {
    delighted: number; // delighted customers today
    conversionRate: number; // delighted / served (0..1)
    regularsGain: number; // gross pool growth this day
    regularsDecay: number; // pool shed to churn this day
    regularsNet: number; // regularsEnd − prev pool (can be negative)
    regularsEnd: number; // ending pool (mirrors DayResult.regularsEnd)
  };
}

/** Wait-time histogram bucket upper edges (minutes). Last bucket is the overflow
 *  (> the final edge). 6 buckets: ≤1, 2, 3, 4, 5–6, 7+. */
export const WAIT_BUCKETS_MIN: readonly number[] = [1, 2, 3, 4, 6];

export interface DayResult {
  day: number;
  dayOfWeek: number; // 0 = Sunday
  locationId: string;
  weather: WeatherDay;
  eventId?: string;
  price: number; // primary product's price (back-compat)
  recipe: Recipe; // primary product's recipe (back-compat)
  /** Per-product sales breakdown (for the menu-mix recap). */
  perProduct?: Partial<Record<ProductId, { cupsSold: number; revenue: number; avgStars: number }>>;
  potentialCustomers: number;
  served: number;
  balked: number;
  reneged: number;
  stockoutMinute: number | null;
  cupsSold: number;
  revenue: number;
  tips: number;
  costs: DayCosts;
  profit: number;
  cashEnd: number;
  spoiled: { ice: number; lemons: number };
  unsoldCups: number; // lemonade brewed but not sold (poured out at close)
  leftover: { lemon: number; sugar: number; ice: number; cup: number }; // carried to tomorrow
  avgStars: number;
  starHistogram: [number, number, number, number, number]; // 1★..5★
  satDrivers: { quality: number; price: number; wait: number };
  reputationStart: number;
  reputationEnd: number;
  /** Effective facets (0.4 global + 0.6 local) at end of day, for trend arrows. */
  repFacetsEnd: RepFacets;
  regularsEnd: number;
  /** Rich demographics/wait/recipe-pref/loyalty metrics (absent on old saves). */
  metrics?: DayMetrics;
  newGoals: string[];
  newAchievements: string[];
  /** Weekly contracts that completed or expired today (absent on old saves). */
  contractsResolved?: ContractResolution[];
}

// ---------------------------------------------------------------------------
// Weekly contracts (Phase L2) — opt-in, deadline-bound objectives dealt 2/week
// ---------------------------------------------------------------------------
/** A dealt or accepted contract instance (the def lives in data/contracts.ts). */
export interface ContractInstance {
  id: string; // unique per offer, e.g. `${defId}__w${week}`
  defId: string;
  offeredDay: number;
  acceptedDay: number | null;
  deadlineDay: number | null; // set on accept (offeredDay-relative)
  baseline: number; // tracked cumulative stat snapshotted at accept (0 until then)
}

export interface ContractsState {
  /** Highest week index already dealt (so a reload doesn't re-deal). -1 = none. */
  lastDealtWeek: number;
  offers: ContractInstance[]; // un-accepted, expire when the next week is dealt
  active: ContractInstance[]; // accepted, persist until completed or past deadline
}

export interface ContractResolution {
  name: string;
  status: "done" | "expired";
  rewardCash: number;
  rewardPrestige: number;
}

// ---------------------------------------------------------------------------
// Brand equity (Phase L3)
// ---------------------------------------------------------------------------
/** Brand awareness: a slow reservoir that lifts demand past the rep ceiling and
 *  fades if you stop feeding it (marketing spend + delighted-customer word-of-mouth). */
export interface BrandState {
  awareness: number;
}

// ---------------------------------------------------------------------------
// Top-level game state (the whole save file, minus transient sim)
// ---------------------------------------------------------------------------
export type GameMode = "campaign" | "sandbox";

export interface GameState {
  schemaVersion: number;
  seed: number;
  rngState: number;
  mode: GameMode;
  day: number; // 1-based; day N is "today, not yet played"
  cash: number;
  debt: number;

  reputationGlobal: number; // 0..100 — blended overall (cached from repFacets)
  locationRep: Record<string, number>; // 0..100 per location — blended overall (cached)
  repFacets: RepFacets; // global, per-facet (source of truth for reputationGlobal)
  locationRepFacets: Record<string, RepFacets>; // per-location facets (source of locationRep)
  regularsPool: number; // grown by good service, sticky baseline traffic

  currentLocationId: string;
  unlockedLocationIds: string[];

  menu: ProductId[]; // active products (menu[0] = primary); 1–2 in Phase 1
  products: Record<ProductId, ProductState>; // per-product recipe/EMA/feedback
  inventory: InventoryLot[];
  supplier: SupplierState; // per-item market price index
  ownedEquipmentIds: string[];
  staff: Staff[];
  research: ResearchState;

  marketingSpend: number; // planned spend for today
  todayStockSpend: number; // cash spent buying stock today (for P&L)
  todayEquipmentSpend: number; // cash spent on equipment today (for P&L)

  weatherToday: WeatherDay;
  activeEventId: string | null;

  completedGoalIds: string[];
  unlockedAchievementIds: string[];

  // --- Late-game meta-progression (Phase L1) ---
  /** Next endless-ladder rung to evaluate = count of rungs already cleared. */
  ladderRung: number;
  /** Prestige currency: earned from ladder rungs / cash conversion, spent on perks. */
  prestige: number;
  /** Permanent perks bought with prestige (each unlocks a recurring decision). */
  ownedPerkIds: string[];
  /** Weekly contracts: offered + accepted objectives (Phase L2). */
  contracts: ContractsState;
  /** Brand equity: an awareness reservoir filled by marketing + word-of-mouth (Phase L3). */
  brand: BrandState;

  stats: Stats;
  history: DayResult[];
  gameOver: boolean;
}

// ---------------------------------------------------------------------------
// Live simulation view types (for the animated stand)
// ---------------------------------------------------------------------------
export type CustomerMood = "happy" | "ok" | "impatient";

export interface QueueCustomerView {
  id: number;
  archetype: ArchetypeId;
  icon: string;
  mood: CustomerMood;
  waited: number;
  patience: number;
}

export interface StationView {
  id: number;
  kind: "player" | "staff";
  role: StaffRole;
  state: "idle" | "serving" | "making";
  progress: number; // 0..1
  servingIcon?: string; // archetype icon of the customer being served
  makeIcon?: string; // product icon of the batch being brewed (when making)
}

/** Live per-product stats for the day view (pool ready + cups sold so far). */
export interface ProductLiveView {
  id: ProductId;
  icon: string;
  name: string;
  pool: number; // cups ready to serve
  sold: number; // cups sold so far today
  price: number;
}

export interface SimSnapshot {
  minute: number;
  openMinutes: number;
  cash: number;
  cupsSold: number;
  revenue: number;
  tips: number;
  served: number;
  lost: number;
  pitcherPool: number;
  /** Live raw-ingredient stock remaining (drains through the day). */
  stock: { lemon: number; sugar: number; ice: number; cup: number };
  /** Per-product live stats (pool + cups sold). One entry per active product. */
  products: ProductLiveView[];
  queue: QueueCustomerView[];
  stations: StationView[];
  isOver: boolean;
}

export type SimEvent =
  | { type: "open" }
  | { type: "arrive"; archetype: ArchetypeId }
  | { type: "sale"; archetype: ArchetypeId; price: number; stars: number; satisfaction: number }
  | { type: "tip"; amount: number }
  | { type: "balk"; archetype: ArchetypeId }
  | { type: "renege"; archetype: ArchetypeId }
  | { type: "batch"; cups: number }
  | { type: "stockout"; item: ItemId }
  | { type: "close" };
