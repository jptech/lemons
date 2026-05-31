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
  newGoals: string[];
  newAchievements: string[];
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

  marketingSpend: number; // planned spend for today
  todayStockSpend: number; // cash spent buying stock today (for P&L)
  todayEquipmentSpend: number; // cash spent on equipment today (for P&L)

  weatherToday: WeatherDay;
  activeEventId: string | null;

  completedGoalIds: string[];
  unlockedAchievementIds: string[];

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
