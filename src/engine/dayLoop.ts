import { ARCHETYPES } from "../data/archetypes";
import { LOCATION_BY_ID } from "../data/locations";
import { EVENT_BY_ID } from "../data/events";
import { GOALS } from "../data/goals";
import { ACHIEVEMENTS } from "../data/achievements";
import { Rng } from "./rng";
import {
  blendRep,
  creditLimit,
  derive,
  effectiveFacets,
  effectiveReputation,
  effectiveStaffBonus,
  forecastConfidence,
  levelForXp,
  uniformFacets,
  type Derived,
} from "./derive";
import {
  arrivalCurveWeight,
  clamp,
  combineSatisfaction,
  expectedCustomers,
  forecastSigma,
  idealRecipe,
  marketingRepBoost,
  priceFairness,
  priceTolerance,
  recipeQuality,
  starsFromSatisfaction,
  tipAmount,
  waitScore,
} from "./economy";
import { nextCondition, makeWeatherDay } from "./weatherGen";
import { rollEvent } from "./eventRoll";
import { gradeQualityBonus, stepSupplierPrices } from "./supplier";
import { activeProducts, primaryProductId, productTaste } from "./menu";
import { PRODUCT_BY_ID } from "../data/products";
import { TUNING } from "./tuning";
import type {
  ArchetypeDef,
  ArchetypeId,
  DayMetrics,
  DayResult,
  DemographicsRow,
  GameState,
  InventoryLot,
  ItemId,
  LocationDef,
  ProductId,
  ProductState,
  RepFacets,
  Recipe,
  SimEvent,
  SimSnapshot,
  StationView,
  WeatherDay,
} from "./types";
import { WAIT_BUCKETS_MIN } from "./types";
import type { ProductTaste } from "./economy";

// ---------------------------------------------------------------------------
// Internal simulation entities
// ---------------------------------------------------------------------------
interface SimCustomer {
  id: number;
  arch: ArchetypeDef;
  product: ProductId; // which drink this customer wants
  patience: number;
  priceSensitivity: number;
  tasteShift: { lemon: number; sugar: number; ice: number };
  waited: number;
}

interface Station {
  id: number;
  kind: "player" | "staff";
  role: "SERVE" | "MAKE";
  serveMult: number;
  batchMult: number;
  state: "idle" | "serving" | "making";
  /** Whole/fractional minutes left on the current task. */
  ticksLeft: number;
  /** Minutes this task takes in total (for the progress bar). */
  taskTime: number;
  /** Leftover time from finishing a task mid-minute, applied to the next one
   *  so a faster worker's speed isn't lost to integer-minute rounding. */
  carry: number;
  customer: SimCustomer | null;
  /** Which product this station is currently brewing (when state === "making"). */
  makeProduct: ProductId | null;
}

/** Per-product run-state: recipe/price/tolerance + pool + accumulators. */
interface ProdRun {
  id: ProductId;
  recipe: Recipe;
  price: number;
  tolerance: number;
  taste: ProductTaste;
  batchLemons: number;
  batchSugar: number;
  batchIce: number;
  pool: number; // cups ready to serve
  served: number;
  revenue: number;
  qualSum: number;
  fbL: number;
  fbS: number;
  fbI: number;
  starSum: number;
  starCount: number;
}

// ---------------------------------------------------------------------------
// Inventory helpers (operate on a working copy)
// ---------------------------------------------------------------------------
function qtyOf(inv: InventoryLot[], item: ItemId): number {
  let n = 0;
  for (const lot of inv) if (lot.item === item) n += lot.qty;
  return n;
}

/** Add freshly-made stock (e.g. ice maker output) to a fresh lot. */
function addItem(inv: InventoryLot[], item: ItemId, amount: number): void {
  const fresh = inv.find((l) => l.item === item && l.ageDays === 0);
  if (fresh) fresh.qty += amount;
  else inv.push({ item, qty: amount, ageDays: 0 });
}

/** Consume `amount` of an item FIFO. Returns false (and consumes nothing) if short. */
function consume(inv: InventoryLot[], item: ItemId, amount: number): boolean {
  if (qtyOf(inv, item) + 1e-9 < amount) return false;
  let remaining = amount;
  for (const lot of inv) {
    if (lot.item !== item || remaining <= 0) continue;
    const take = Math.min(lot.qty, remaining);
    lot.qty -= take;
    remaining -= take;
  }
  return true;
}

// ---------------------------------------------------------------------------
// DaySim — the live, tickable open-period simulation
// ---------------------------------------------------------------------------
export class DaySim {
  readonly state: GameState;
  private readonly rng: Rng;
  private readonly derived: Derived;
  private readonly location: LocationDef;
  readonly openMinutes: number;

  // precomputed demand
  private readonly expected: number;
  private readonly sumWeights: number;
  private readonly tolerance: number;
  private readonly effRep: number;
  private readonly effFacets: RepFacets;
  /** Service-facet patience tilt (>1 = more patient), neutral at uniformity. */
  private readonly servicePatienceMult: number;

  // working state
  private readonly inv: InventoryLot[];
  private readonly stations: Station[];
  private readonly queue: SimCustomer[] = [];
  private minute = 0;
  private nextCustomerId = 1;
  private over = false;
  private stockoutMinute: number | null = null;
  private unsoldCups = 0;

  // per-product run state (recipe/price/pool/accumulators)
  private readonly prods: Record<ProductId, ProdRun>;
  private readonly menuIds: ProductId[];
  private readonly primaryId: ProductId;

  // global counters (business-wide — drive reputation, stars, P&L)
  private cupsSold = 0;
  private revenue = 0;
  private tips = 0;
  private served = 0;
  private balked = 0;
  private reneged = 0;
  private starHist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  private qualSum = 0;
  private fairSum = 0;
  private waitSum = 0;
  private servedSatSum = 0; // sum of satisfaction over SERVED customers only
  private delighted = 0;
  private iceAccum = 0;

  // advanced metrics (additive bookkeeping — no extra RNG draws)
  private readonly demo: Partial<Record<ArchetypeId, DemographicsRow>> = {};
  private waitMinSum = 0; // total minutes waited over served customers
  private waitMaxMin = 0; // longest wait of any served customer
  private readonly waitHist: number[] = new Array(WAIT_BUCKETS_MIN.length + 1).fill(0);

  /** Additive quality bonus from premium taste solids brought into the day. */
  private readonly gradeBonus: number;

  private readonly batchPitchers: number;
  private readonly cupsPerBatch: number;

  constructor(state: GameState) {
    this.state = state;
    this.rng = new Rng(state.rngState);
    this.derived = derive(state);
    this.location = LOCATION_BY_ID[state.currentLocationId]!;
    this.openMinutes = this.location.openMinutes;
    this.effRep = effectiveReputation(state);
    this.effFacets = effectiveFacets(state);
    // Service above the overall makes customers a bit more patient (and vice
    // versa). Neutral when facets are uniform.
    this.servicePatienceMult = Math.max(
      0.5,
      1 + (TUNING.SERVICE_PATIENCE_TILT * (this.effFacets.service - this.effRep)) / 100,
    );

    const weather = state.weatherToday;
    this.inv = state.inventory.map((l) => ({ ...l }));
    this.gradeBonus = gradeQualityBonus(state.inventory);
    this.batchPitchers = this.derived.batchSizeMult;
    this.cupsPerBatch = Math.max(1, Math.round(TUNING.CUPS_PER_PITCHER * this.derived.batchSizeMult));

    // Build per-product run state for every product on the menu.
    this.primaryId = primaryProductId(state);
    this.menuIds = (state.menu.length ? state.menu : (["classic"] as ProductId[])).filter(
      (id) => PRODUCT_BY_ID[id],
    );
    if (!this.menuIds.length) this.menuIds = ["classic"];
    this.prods = {} as Record<ProductId, ProdRun>;
    for (const ap of activeProducts(state)) {
      this.prods[ap.id] = this.buildProdRun(ap.id, ap.state, weather);
    }
    if (!this.prods[this.primaryId]) {
      // Safety: ensure the primary always has a run entry.
      const ps = state.products[this.primaryId];
      if (ps) this.prods[this.primaryId] = this.buildProdRun(this.primaryId, ps, weather);
    }

    // Top-of-funnel demand is driven by the PRIMARY product's price/tolerance.
    this.tolerance = this.prods[this.primaryId]!.tolerance;
    const primaryPrice = this.prods[this.primaryId]!.price;

    const event = state.activeEventId ? EVENT_BY_ID[state.activeEventId] : undefined;
    const baseExpected = expectedCustomers({
      location: this.location,
      weather,
      dayOfWeek: this.dayOfWeek(),
      effectiveRep: this.effRep,
      buzzEff: this.effFacets.buzz,
      valueEff: this.effFacets.value,
      marketingSpend: state.marketingSpend,
      marketingFloor: this.derived.marketingFloor,
      price: primaryPrice,
      tolerance: this.tolerance,
      regularsPool: state.regularsPool,
      eventTrafficMult: event?.effect.trafficMult ?? 1,
    });
    // "Market mood": a seeded per-day demand swing the player can't perfectly
    // predict. Its spread shrinks as forecast confidence rises (research +
    // experience + reputation) — this is the FIRST rng draw of the day.
    const sigma = forecastSigma(forecastConfidence(state));
    const mood = clamp(this.rng.gaussian(1, sigma), 1 - 2.5 * sigma, 1 + 2.5 * sigma);
    this.expected = Math.max(0, baseExpected * mood);

    let s = 0;
    for (let m = 0; m < this.openMinutes; m++) s += arrivalCurveWeight(m, this.openMinutes);
    this.sumWeights = s;

    this.stations = this.buildStations();
  }

  /** Build the per-product run state (price/tolerance/batch amounts) for a day. */
  private buildProdRun(id: ProductId, ps: ProductState, weather: WeatherDay): ProdRun {
    const def = PRODUCT_BY_ID[id];
    const tol =
      priceTolerance(this.location, this.effRep, weather, ps.qualityScoreEMA, this.effFacets.taste) *
      (def?.priceTolMult ?? 1);
    return {
      id,
      recipe: ps.recipe,
      price: ps.recipe.pricePerCup,
      tolerance: tol,
      taste: productTaste(id),
      // Round per-batch ingredient use to whole units so inventory stays integer.
      batchLemons: Math.round(ps.recipe.lemons * this.batchPitchers),
      batchSugar: Math.round(ps.recipe.sugar * this.batchPitchers),
      batchIce: Math.round(ps.recipe.ice * this.batchPitchers),
      pool: 0,
      served: 0,
      revenue: 0,
      qualSum: 0,
      fbL: 0,
      fbS: 0,
      fbI: 0,
      starSum: 0,
      starCount: 0,
    };
  }

  private dayOfWeek() {
    return (this.state.day - 1) % 7;
  }

  /** Lazily get (or create) the demographics accumulator for an archetype. */
  private demoRow(id: ArchetypeId): DemographicsRow {
    let row = this.demo[id];
    if (!row) {
      row = { arrived: 0, served: 0, lost: 0, revenue: 0, tips: 0, starSum: 0, starCount: 0, waitSum: 0, delighted: 0 };
      this.demo[id] = row;
    }
    return row;
  }

  /** Tally a served customer's wait (minutes) into the global histogram. */
  private recordWait(waited: number): void {
    this.waitMinSum += waited;
    if (waited > this.waitMaxMin) this.waitMaxMin = waited;
    let bucket = WAIT_BUCKETS_MIN.length; // overflow bucket by default
    for (let i = 0; i < WAIT_BUCKETS_MIN.length; i++) {
      if (waited <= WAIT_BUCKETS_MIN[i]!) {
        bucket = i;
        break;
      }
    }
    this.waitHist[bucket] = (this.waitHist[bucket] ?? 0) + 1;
  }

  private buildStations(): Station[] {
    const stations: Station[] = [
      {
        id: 0,
        kind: "player",
        role: "SERVE",
        serveMult: this.derived.serveSpeedMult,
        batchMult: this.derived.batchSpeedMult,
        state: "idle",
        ticksLeft: 0,
        taskTime: 1,
        carry: 0,
        customer: null,
        makeProduct: null,
      },
    ];
    this.state.staff.forEach((st, i) => {
      const bonus = effectiveStaffBonus(st);
      stations.push({
        id: i + 1,
        kind: "staff",
        role: st.role,
        serveMult: this.derived.serveSpeedMult + bonus.serve,
        batchMult: this.derived.batchSpeedMult + bonus.batch,
        state: "idle",
        ticksLeft: 0,
        taskTime: 1,
        carry: 0,
        customer: null,
        makeProduct: null,
      });
    });
    return stations;
  }

  get isOver() {
    return this.over;
  }

  /** Advance up to `minutes` in-game minutes, returning everything that happened. */
  tick(minutes = 1): SimEvent[] {
    const events: SimEvent[] = [];
    for (let i = 0; i < minutes && !this.over; i++) this.stepMinute(events);
    return events;
  }

  private stepMinute(events: SimEvent[]) {
    if (this.minute === 0) events.push({ type: "open" });

    // 0. Ice maker: produce ice over time (capped so it can't run away).
    if (this.derived.iceRegenPerMin > 0 && qtyOf(this.inv, "ice") < 400) {
      this.iceAccum += this.derived.iceRegenPerMin;
      const whole = Math.floor(this.iceAccum);
      if (whole > 0) {
        this.iceAccum -= whole;
        addItem(this.inv, "ice", whole);
      }
    }

    // 1. Arrivals
    const lambda = (this.expected * arrivalCurveWeight(this.minute, this.openMinutes)) / this.sumWeights;
    const arrivals = this.rng.poisson(lambda);
    for (let i = 0; i < arrivals; i++) this.arrive(events);

    // 2. Advance busy stations by one minute (fractional; carry the overshoot
    //    so faster workers actually finish sooner instead of rounding up).
    for (const st of this.stations) {
      if (st.state === "idle") continue;
      st.ticksLeft -= 1;
      if (st.ticksLeft > 1e-9) continue;
      if (st.state === "serving") {
        this.finalizeSale(st, events);
      } else {
        const pr = st.makeProduct ? this.prods[st.makeProduct] : undefined;
        if (pr) pr.pool += this.cupsPerBatch;
        events.push({ type: "batch", cups: this.cupsPerBatch });
      }
      st.carry = Math.min(st.taskTime, -st.ticksLeft); // leftover minute fraction
      st.state = "idle";
      st.customer = null;
      st.makeProduct = null;
    }

    // 3. Assign idle stations
    this.assignStations(events);

    // 4. Wait & renege
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const c = this.queue[i]!;
      c.waited++;
      if (c.waited > c.patience) {
        this.queue.splice(i, 1);
        this.reneged++;
        this.demoRow(c.arch.id).lost++;
        events.push({ type: "renege", archetype: c.arch.id });
      }
    }

    this.minute++;
    if (this.minute >= this.openMinutes) this.close(events);
  }

  private arrive(events: SimEvent[]) {
    const arch = this.pickArchetype();
    this.demoRow(arch.id).arrived++;
    events.push({ type: "arrive", archetype: arch.id });
    const patience = Math.max(
      1,
      Math.round(
        TUNING.PATIENCE_BASE *
          this.derived.patienceMult *
          this.servicePatienceMult *
          arch.patienceMult *
          this.rng.uniform(0.7, 1.3),
      ),
    );
    const product = this.pickProduct(arch);
    const c: SimCustomer = {
      id: this.nextCustomerId++,
      arch,
      product,
      patience,
      priceSensitivity: arch.priceSensitivity,
      tasteShift: arch.tasteShift,
      waited: 0,
    };
    // Balk if the line is already longer than this customer will tolerate.
    const avgServe = TUNING.SERVE_BASE / this.derived.serveSpeedMult;
    const throughput = this.stations.length / avgServe;
    const maxQueue = Math.max(1, Math.ceil(patience * throughput));
    if (this.queue.length >= maxQueue) {
      this.balked++;
      this.demoRow(arch.id).lost++;
      events.push({ type: "balk", archetype: arch.id });
      return;
    }
    this.queue.push(c);
  }

  private pickArchetype(): ArchetypeDef {
    const bias = this.location.archetypeBias ?? {};
    // Regulars enter the mix proportional to the regulars pool.
    const regularWeight = Math.min(
      2.5,
      this.state.regularsPool / Math.max(1, this.location.baseTraffic * 0.15),
    );
    const weights = ARCHETYPES.map((a) => {
      if (a.id === "regular") return regularWeight;
      return a.baseWeight * (bias[a.id] ?? 1);
    });
    return this.rng.weightedPick(ARCHETYPES, weights);
  }

  /** Which product this customer wants, weighted by per-product archetype appeal.
   *  Single-product menus take no RNG draw (keeps the classic path identical). */
  private pickProduct(arch: ArchetypeDef): ProductId {
    if (this.menuIds.length <= 1) return this.menuIds[0] ?? this.primaryId;
    const weights = this.menuIds.map((id) => Math.max(0, PRODUCT_BY_ID[id]?.appeal?.[arch.id] ?? 1));
    return this.rng.weightedPick(this.menuIds, weights);
  }

  private assignStations(events: SimEvent[]) {
    const buffer = Math.max(2, this.stations.length);
    for (const st of this.stations) {
      if (st.state !== "idle") continue;
      const front = this.queue[0];
      const cupsAvail = qtyOf(this.inv, "cup") >= 1;
      const makeProd = this.productToMake();
      const canServeFront = !!front && cupsAvail && (this.prods[front.product]?.pool ?? 0) >= 1;
      const makePoolLow = makeProd ? makeProd.pool < buffer : false;
      const makePoolEmpty = makeProd ? makeProd.pool < 1 : false;

      // Prefer keeping the most-needed product's pool stocked; otherwise serve
      // the front of the line (FIFO).
      if (makeProd && makePoolLow && (this.queue.length > 0 || makePoolEmpty)) {
        this.startMake(st, makeProd);
      } else if (canServeFront) {
        this.startServe(st, front!);
      } else if (makeProd && this.queue.length > 0) {
        this.startMake(st, makeProd);
      } else if (this.queue.length > 0) {
        // A waiting line we can neither serve nor brew for → a stockout.
        if (this.stockoutMinute === null) {
          this.stockoutMinute = this.minute;
          const missing: ItemId | null = !cupsAvail ? "cup" : makeProd ? null : this.firstMissingAny();
          if (missing) events.push({ type: "stockout", item: missing });
        }
      }
    }
  }

  /** Count of queued customers waiting for a given product. */
  private queuedDemand(id: ProductId): number {
    let n = 0;
    for (const c of this.queue) if (c.product === id) n++;
    return n;
  }

  /** Which product to brew next: the front customer's (if their pool is empty),
   *  else the makeable product with the greatest shortfall. */
  private productToMake(): ProdRun | null {
    const makeable = this.menuIds
      .map((id) => this.prods[id])
      .filter((pr): pr is ProdRun => !!pr && this.canMakeBatch(pr));
    if (!makeable.length) return null;
    const front = this.queue[0];
    if (front) {
      const fpr = this.prods[front.product];
      if (fpr && this.canMakeBatch(fpr) && fpr.pool < 1) return fpr;
    }
    let best = makeable[0]!;
    let bestScore = -Infinity;
    for (const pr of makeable) {
      const score = this.queuedDemand(pr.id) - pr.pool;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = pr;
      }
    }
    return best;
  }

  private canMakeBatch(pr: ProdRun): boolean {
    return (
      qtyOf(this.inv, "lemon") >= pr.batchLemons &&
      qtyOf(this.inv, "sugar") >= pr.batchSugar &&
      qtyOf(this.inv, "ice") >= pr.batchIce
    );
  }

  private firstMissingForBatch(pr: ProdRun): ItemId | null {
    if (qtyOf(this.inv, "lemon") < pr.batchLemons) return "lemon";
    if (qtyOf(this.inv, "sugar") < pr.batchSugar) return "sugar";
    if (qtyOf(this.inv, "ice") < pr.batchIce) return "ice";
    return null;
  }

  private firstMissingAny(): ItemId | null {
    const pr = this.prods[this.queue[0]?.product ?? this.primaryId] ?? this.prods[this.primaryId];
    return pr ? this.firstMissingForBatch(pr) : null;
  }

  private startMake(st: Station, pr: ProdRun) {
    consume(this.inv, "lemon", pr.batchLemons);
    consume(this.inv, "sugar", pr.batchSugar);
    consume(this.inv, "ice", pr.batchIce);
    st.state = "making";
    st.makeProduct = pr.id;
    st.taskTime = TUNING.BATCH_TIME / st.batchMult;
    st.ticksLeft = Math.max(0.001, st.taskTime - st.carry);
    st.carry = 0;
  }

  private startServe(st: Station, c: SimCustomer) {
    this.queue.shift(); // c is the front of the line
    const pr = this.prods[c.product];
    if (pr) pr.pool -= 1;
    consume(this.inv, "cup", 1);
    st.state = "serving";
    st.customer = c;
    st.taskTime = TUNING.SERVE_BASE / st.serveMult;
    st.ticksLeft = Math.max(0.001, st.taskTime - st.carry);
    st.carry = 0;
  }

  private finalizeSale(st: Station, events: SimEvent[]) {
    const c = st.customer!;
    const pr = this.prods[c.product] ?? this.prods[this.primaryId]!;
    const price = pr.price;
    const weather = this.state.weatherToday;

    const baseQ = recipeQuality(pr.recipe, weather, c.tasteShift, pr.taste);
    const quality = clamp(baseQ + this.gradeBonus + this.rng.gaussian(0, TUNING.TASTE_NOISE), 0, 1);
    const fairness = priceFairness(price, pr.tolerance, c.priceSensitivity);
    const wait = waitScore(c.waited, c.patience);
    const satisfaction = combineSatisfaction(quality, fairness, wait);

    // Global (business-wide) tallies.
    this.cupsSold++;
    this.served++;
    this.revenue += price;
    this.qualSum += quality;
    this.fairSum += fairness;
    this.waitSum += wait;
    this.servedSatSum += satisfaction;
    const delighted = satisfaction >= TUNING.TIP_THRESHOLD;
    if (delighted) this.delighted++;
    // Per-archetype demographics + wait tallies (advanced metrics).
    const row = this.demoRow(c.arch.id);
    row.served++;
    row.revenue += price;
    row.waitSum += c.waited;
    if (delighted) row.delighted++;
    this.recordWait(c.waited);
    // Per-product tallies (drive each product's quality EMA + feedback).
    pr.served++;
    pr.revenue += price;
    pr.qualSum += quality;
    this.accumulateFeedback(pr, c, weather);

    const stars = starsFromSatisfaction(satisfaction);
    // Reviewers: a sample plus the extremes (delight/disappointment).
    if (this.rng.chance(TUNING.REVIEW_RATE) || stars === 5 || stars === 1) {
      this.starHist[stars - 1] = (this.starHist[stars - 1] ?? 0) + 1;
      pr.starSum += stars;
      pr.starCount++;
      row.starSum += stars;
      row.starCount++;
    }

    const tip = tipAmount(satisfaction, price, c.arch, this.rng.next());
    if (tip > 0) {
      this.tips += tip;
      row.tips += tip;
      events.push({ type: "tip", amount: tip });
    }
    events.push({ type: "sale", archetype: c.arch.id, price, stars, satisfaction });
  }

  /** Accumulate how far this customer's ideal differs from the product recipe. */
  private accumulateFeedback(pr: ProdRun, c: SimCustomer, weather: WeatherDay) {
    const ideal = idealRecipe(weather, pr.taste);
    const il = Math.max(0, ideal.vec[0] + c.tasteShift.lemon);
    const is = Math.max(0, ideal.vec[1] + c.tasteShift.sugar);
    const ii = Math.max(0, ideal.vec[2] + c.tasteShift.ice);
    const isum = il + is + ii || 1;
    const r = pr.recipe;
    const psum = r.lemons + r.sugar + r.ice || 1;
    pr.fbL += il / isum - r.lemons / psum;
    pr.fbS += is / isum - r.sugar / psum;
    pr.fbI += ii / isum - r.ice / psum;
  }

  private close(events: SimEvent[]) {
    // Anyone still in line when we close didn't get served.
    this.balked += this.queue.length;
    for (const c of this.queue) this.demoRow(c.arch.id).lost++;
    this.queue.length = 0;
    this.unsoldCups = this.totalPool(); // brewed but never sold (across products)
    this.over = true;
    events.push({ type: "close" });
  }

  /** Total ready-to-serve cups across all products (floored). */
  private totalPool(): number {
    let n = 0;
    for (const id of this.menuIds) n += Math.floor(this.prods[id]?.pool ?? 0);
    return n;
  }

  // -------------------------------------------------------------------------
  // Live view for rendering
  // -------------------------------------------------------------------------
  snapshot(): SimSnapshot {
    return {
      minute: this.minute,
      openMinutes: this.openMinutes,
      cash: this.state.cash + this.revenue + this.tips,
      cupsSold: this.cupsSold,
      revenue: this.revenue,
      tips: this.tips,
      served: this.served,
      lost: this.balked + this.reneged,
      pitcherPool: this.totalPool(),
      stock: {
        lemon: Math.floor(qtyOf(this.inv, "lemon")),
        sugar: Math.floor(qtyOf(this.inv, "sugar")),
        ice: Math.floor(qtyOf(this.inv, "ice")),
        cup: Math.floor(qtyOf(this.inv, "cup")),
      },
      products: this.menuIds.map((id) => {
        const pr = this.prods[id]!;
        const def = PRODUCT_BY_ID[id];
        return {
          id,
          icon: def?.icon ?? "🥤",
          name: def?.name ?? id,
          pool: Math.floor(pr.pool),
          sold: pr.served,
          price: pr.price,
        };
      }),
      queue: this.queue.slice(0, 12).map((c) => ({
        id: c.id,
        archetype: c.arch.id,
        icon: c.arch.icon,
        mood:
          c.waited < c.patience * 0.4
            ? "happy"
            : c.waited < c.patience * 0.8
              ? "ok"
              : "impatient",
        waited: c.waited,
        patience: c.patience,
      })),
      stations: this.stations.map<StationView>((s) => ({
        id: s.id,
        kind: s.kind,
        role: s.role,
        state: s.state,
        progress: s.state === "idle" ? 0 : clamp(1 - s.ticksLeft / s.taskTime, 0, 1),
        ...(s.state === "serving" && s.customer ? { servingIcon: s.customer.arch.icon } : {}),
        ...(s.state === "making" && s.makeProduct
          ? { makeIcon: PRODUCT_BY_ID[s.makeProduct]?.icon ?? "🥤" }
          : {}),
      })),
      isOver: this.over,
    };
  }

  /** Run to the end synchronously (skip-to-end). Deterministic — same draws. */
  runToEnd(): SimEvent[] {
    const events: SimEvent[] = [];
    while (!this.over) this.stepMinute(events);
    return events;
  }

  // -------------------------------------------------------------------------
  // Settlement → next-day GameState + DayResult
  // -------------------------------------------------------------------------
  finalize(): { state: GameState; result: DayResult } {
    if (!this.over) this.runToEnd();
    return settle(this);
  }

  // Accessors for settlement (kept on the instance to avoid re-simulating).
  _data() {
    return {
      rng: this.rng,
      inv: this.inv,
      location: this.location,
      derived: this.derived,
      effRep: this.effRep,
      cupsSold: this.cupsSold,
      revenue: this.revenue,
      tips: this.tips,
      served: this.served,
      balked: this.balked,
      reneged: this.reneged,
      starHist: this.starHist,
      qualSum: this.qualSum,
      fairSum: this.fairSum,
      waitSum: this.waitSum,
      servedSatSum: this.servedSatSum,
      delighted: this.delighted,
      stockoutMinute: this.stockoutMinute,
      unsoldCups: this.unsoldCups,
      tolerance: this.tolerance,
      prods: this.prods,
      menuIds: this.menuIds,
      primaryId: this.primaryId,
      demo: this.demo,
      waitMinSum: this.waitMinSum,
      waitMaxMin: this.waitMaxMin,
      waitHist: this.waitHist,
    };
  }
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------
function settle(sim: DaySim): { state: GameState; result: DayResult } {
  const prev = sim.state;
  const d = sim._data();
  const rng = d.rng;
  const location = d.location;
  const event = prev.activeEventId ? EVENT_BY_ID[prev.activeEventId] : undefined;

  // ---- Costs & cash ----
  const rent = location.rentPerDay;
  const wages = prev.staff.reduce((sum, s) => sum + s.wage, 0);
  const marketing = prev.marketingSpend;
  const interest = Math.round(prev.debt * TUNING.LOAN_RATE_PER_DAY * 100) / 100;
  const stock = prev.todayStockSpend;
  const equipment = prev.todayEquipmentSpend;

  let cash = prev.cash + d.revenue + d.tips - rent - wages - marketing - interest;
  let debt = prev.debt;

  // Soft failure: auto-borrow to cover a shortfall, up to the credit limit.
  if (cash < 0) {
    const available = creditLimit(prev) - debt;
    const borrow = Math.min(Math.max(0, available), -cash);
    debt += borrow;
    cash += borrow;
  }
  const gameOver = cash < 0;

  const profit =
    d.revenue + d.tips - rent - wages - marketing - interest - stock - equipment;

  // ---- Reputation facets (taste / service / value / buzz) ----
  // Each facet eases toward its own daily signal and decays at its own rate, so
  // a business develops a distinct reputational profile. The blended overall
  // (REP_BLEND) is cached back into reputationGlobal/locationRep for everything
  // that reads a single ★ (credit, forecast, stats, UI).
  const repStartLocal = prev.locationRep[prev.currentLocationId] ?? 0;
  const repStartEff = d.effRep;
  const prevGF: RepFacets = prev.repFacets ?? uniformFacets(prev.reputationGlobal);
  const prevLF: RepFacets =
    prev.locationRepFacets?.[prev.currentLocationId] ?? uniformFacets(repStartLocal);
  let newGF: RepFacets = prevGF;
  let newLF: RepFacets = prevLF;

  const easeFacet = (cur: number, target: number, ease: number, decay: number, boost = 0) =>
    clamp((cur + ease * (target - cur) + boost) * (1 - decay), 0, 100);

  if (d.served > 0) {
    const lost = d.balked + d.reneged;
    const lossRate = lost / (d.served + lost);
    // Per-facet daily targets, each in 0..100.
    const tasteT = clamp(100 * (d.qualSum / d.served), 0, 100);
    const valueT = clamp(100 * (d.fairSum / d.served), 0, 100);
    const serviceT = clamp(100 * (d.waitSum / d.served) - TUNING.LOSS_REP_PENALTY * lossRate, 0, 100);
    const buzzT = clamp(100 * (d.servedSatSum / d.served), 0, 100);
    // Buzz boosts: marketing reach (global awareness) + organic word-of-mouth.
    const mktBoost = marketingRepBoost(marketing) + (event?.effect.repDelta ?? 0);
    const womBoost = TUNING.BUZZ_WOM_GAIN * (d.delighted / d.served);
    const dF = TUNING.REP_DECAY_FACET;
    const gEase = TUNING.GLOBAL_REP_EASE_FACTOR * TUNING.REP_EASE;
    const lEase = TUNING.REP_EASE;
    newLF = {
      taste: easeFacet(prevLF.taste, tasteT, lEase, dF.taste),
      service: easeFacet(prevLF.service, serviceT, lEase, dF.service),
      value: easeFacet(prevLF.value, valueT, lEase, dF.value),
      buzz: easeFacet(prevLF.buzz, buzzT, lEase, dF.buzz, womBoost),
    };
    newGF = {
      taste: easeFacet(prevGF.taste, tasteT, gEase, dF.taste),
      service: easeFacet(prevGF.service, serviceT, gEase, dF.service),
      value: easeFacet(prevGF.value, valueT, gEase, dF.value),
      buzz: easeFacet(prevGF.buzz, buzzT, gEase, dF.buzz, mktBoost + womBoost),
    };
  } else if (event?.effect.repDelta) {
    // No sales — a pure reputational event lands on awareness (Buzz).
    newGF = { ...prevGF, buzz: clamp(prevGF.buzz + event.effect.repDelta, 0, 100) };
  }

  const newGlobal = blendRep(newGF);
  const newLocal = blendRep(newLF);

  // ---- Per-product quality EMA + recipe/price feedback (its own discovery) ----
  const nextProducts: Record<ProductId, ProductState> = { ...prev.products };
  for (const id of d.menuIds) {
    const pr = d.prods[id];
    const ps = prev.products[id];
    if (!pr || !ps || pr.served <= 0) continue;
    const avgQ = pr.qualSum / pr.served;
    const qualityScoreEMA = ps.qualityScoreEMA + TUNING.QUALITY_EMA_EASE * (avgQ - ps.qualityScoreEMA);
    const e = TUNING.FEEDBACK_EASE;
    const recipeFeedback = {
      lemon: ps.recipeFeedback.lemon + e * (pr.fbL / pr.served - ps.recipeFeedback.lemon),
      sugar: ps.recipeFeedback.sugar + e * (pr.fbS / pr.served - ps.recipeFeedback.sugar),
      ice: ps.recipeFeedback.ice + e * (pr.fbI / pr.served - ps.recipeFeedback.ice),
    };
    // Pricing signal: how this product's price compared to what its crowd would
    // bear. Positive = room to charge more; negative = guests found it pricey.
    const ratio = pr.price / (pr.tolerance || 1);
    const daySignal = clamp((0.9 - ratio) * 1.8, -1, 1);
    const priceFeedback = ps.priceFeedback + TUNING.PRICE_FEEDBACK_EASE * (daySignal - ps.priceFeedback);
    nextProducts[id] = { recipe: ps.recipe, qualityScoreEMA, recipeFeedback, priceFeedback };
  }

  // ---- Regulars pool (loyalty program speeds growth) ----
  const regularsCap = location.baseTraffic * 0.4;
  const regularsGain = TUNING.REGULARS_GAIN * d.derived.regularsGainMult * d.delighted;
  const regularsDecay = TUNING.REGULARS_DECAY * prev.regularsPool;
  let regulars = prev.regularsPool + regularsGain - regularsDecay;
  regulars = clamp(regulars, 0, regularsCap);

  // ---- Spoilage (mutates the working inventory copy) ----
  const iceBefore = qtyOf(d.inv, "ice");
  const spoiledIce = Math.round(iceBefore * (1 - d.derived.iceRetention));
  let spoiledLemons = 0;
  const nextInv: InventoryLot[] = [];
  for (const lot of d.inv) {
    if (lot.qty <= 0) continue;
    if (lot.item === "ice") {
      const keep = lot.qty * d.derived.iceRetention;
      if (keep > 0.5) nextInv.push({ item: "ice", qty: Math.round(keep), ageDays: 0 });
      continue;
    }
    const aged = { ...lot, qty: Math.round(lot.qty), ageDays: lot.ageDays + 1 };
    if (lot.item === "lemon" && aged.ageDays >= TUNING.LEMON_SHELF_LIFE) {
      spoiledLemons += aged.qty;
      continue;
    }
    if (aged.qty > 0) nextInv.push(aged);
  }

  // Stock carried into tomorrow (post-spoilage).
  const leftover = { lemon: 0, sugar: 0, ice: 0, cup: 0 };
  for (const lot of nextInv) leftover[lot.item] += lot.qty;

  // ---- Stats ----
  const sumStars = d.starHist.reduce((s, n, i) => s + n * (i + 1), 0);
  const countStars = d.starHist.reduce((s, n) => s + n, 0);
  const avgStars = countStars > 0 ? sumStars / countStars : 0;
  const lostToday = d.balked + d.reneged;

  const st = { ...prev.stats };
  st.totalCupsSold += d.cupsSold;
  st.totalRevenue += d.revenue + d.tips;
  st.totalProfit += profit;
  st.totalTips += d.tips;
  st.totalCustomersLost += lostToday;
  st.daysPlayed += 1;
  st.sumStars += sumStars;
  st.countStars += countStars;
  if (profit > st.bestDayProfit) {
    st.bestDayProfit = profit;
    st.bestDayProfitDay = prev.day;
  }
  if (d.cupsSold > st.bestDayCups) st.bestDayCups = d.cupsSold;
  st.currentProfitStreak = profit > 0 ? st.currentProfitStreak + 1 : 0;
  st.longestProfitStreak = Math.max(st.longestProfitStreak, st.currentProfitStreak);
  st.peakReputation = Math.max(st.peakReputation, newGlobal);
  st.peakCash = Math.max(st.peakCash, cash);
  st.locationsUnlocked = prev.unlockedLocationIds.length;

  const result: DayResult = {
    day: prev.day,
    dayOfWeek: (prev.day - 1) % 7,
    locationId: prev.currentLocationId,
    weather: prev.weatherToday,
    ...(prev.activeEventId ? { eventId: prev.activeEventId } : {}),
    price: prev.products[d.primaryId]!.recipe.pricePerCup,
    recipe: { ...prev.products[d.primaryId]!.recipe },
    perProduct: buildPerProduct(d),
    potentialCustomers: d.served + lostToday,
    served: d.served,
    balked: d.balked,
    reneged: d.reneged,
    stockoutMinute: d.stockoutMinute,
    cupsSold: d.cupsSold,
    revenue: d.revenue,
    tips: d.tips,
    costs: { rent, wages, marketing, stock, equipment, interest },
    profit,
    cashEnd: cash,
    spoiled: { ice: spoiledIce, lemons: spoiledLemons },
    unsoldCups: d.unsoldCups,
    leftover,
    avgStars,
    starHistogram: d.starHist,
    satDrivers: {
      quality: d.served > 0 ? d.qualSum / d.served : 0,
      price: d.served > 0 ? d.fairSum / d.served : 0,
      wait: d.served > 0 ? d.waitSum / d.served : 0,
    },
    reputationStart: repStartEff,
    reputationEnd: 0.4 * newGlobal + 0.6 * newLocal,
    repFacetsEnd: {
      taste: 0.4 * newGF.taste + 0.6 * newLF.taste,
      service: 0.4 * newGF.service + 0.6 * newLF.service,
      value: 0.4 * newGF.value + 0.6 * newLF.value,
      buzz: 0.4 * newGF.buzz + 0.6 * newLF.buzz,
    },
    regularsEnd: regulars,
    metrics: buildMetrics(d, regulars, prev.regularsPool, regularsGain, regularsDecay),
    newGoals: [],
    newAchievements: [],
  };

  // ---- Advance to next day ----
  const nextCond = nextCondition(rng, prev.weatherToday.condition);
  const weatherToday = makeWeatherDay(rng, nextCond, d.derived.forecastAccuracy);
  const nextEventId = rollEvent(rng, prev.day + 1);
  // Supplier prices drift overnight (one gaussian draw per item, fixed order).
  const supplier = stepSupplierPrices(prev.supplier, rng);

  // Staff earn flat XP for the day worked (deterministic — no RNG); re-level.
  const nextStaff = prev.staff.map((s) => {
    const xp = s.xp + TUNING.STAFF_XP_PER_DAY;
    return { ...s, xp, level: levelForXp(xp) };
  });

  // Research: tick the in-progress node; complete it when its days run out.
  let research = prev.research;
  if (research?.inProgress) {
    const daysLeft = research.inProgress.daysLeft - 1;
    research =
      daysLeft <= 0
        ? { completed: [...research.completed, research.inProgress.id], inProgress: null }
        : { ...research, inProgress: { ...research.inProgress, daysLeft } };
  }

  const next: GameState = {
    ...prev,
    rngState: rng.state,
    staff: nextStaff,
    research,
    day: prev.day + 1,
    cash,
    debt,
    reputationGlobal: newGlobal,
    locationRep: { ...prev.locationRep, [prev.currentLocationId]: newLocal },
    repFacets: newGF,
    locationRepFacets: { ...prev.locationRepFacets, [prev.currentLocationId]: newLF },
    regularsPool: regulars,
    inventory: nextInv,
    products: nextProducts,
    weatherToday,
    activeEventId: nextEventId,
    supplier,
    marketingSpend: 0,
    todayStockSpend: 0,
    todayEquipmentSpend: 0,
    stats: st,
    history: [...prev.history, result],
    gameOver,
  };

  // ---- Goals & achievements (evaluated against the new state) ----
  const completedGoalIds = [...prev.completedGoalIds];
  for (const g of GOALS) {
    if (!completedGoalIds.includes(g.id) && g.check(next)) completedGoalIds.push(g.id);
  }
  const unlockedAchievementIds = [...prev.unlockedAchievementIds];
  for (const a of ACHIEVEMENTS) {
    if (!unlockedAchievementIds.includes(a.id) && a.check(next)) unlockedAchievementIds.push(a.id);
  }
  next.completedGoalIds = completedGoalIds;
  next.unlockedAchievementIds = unlockedAchievementIds;
  // Surface what was earned *today* for the recap (result is shared with next.history).
  result.newGoals = completedGoalIds.filter((id) => !prev.completedGoalIds.includes(id));
  result.newAchievements = unlockedAchievementIds.filter((id) => !prev.unlockedAchievementIds.includes(id));

  return { state: next, result };
}

/** Build the rich per-day metrics (demographics / wait / recipe prefs / loyalty). */
function buildMetrics(
  d: ReturnType<DaySim["_data"]>,
  regularsEnd: number,
  prevRegulars: number,
  regularsGain: number,
  regularsDecay: number,
): DayMetrics {
  // Demographics: copy rows that actually saw traffic.
  const demographics: DayMetrics["demographics"] = {};
  for (const [id, row] of Object.entries(d.demo) as [ArchetypeId, DemographicsRow][]) {
    if (row && row.arrived > 0) demographics[id] = { ...row };
  }

  // Per-product taste-drift + price signal this day.
  const recipePrefs: DayMetrics["recipePrefs"] = {};
  for (const id of d.menuIds) {
    const pr = d.prods[id];
    if (!pr || pr.served <= 0) continue;
    const ratio = pr.price / (pr.tolerance || 1);
    recipePrefs[id] = {
      lemon: pr.fbL / pr.served,
      sugar: pr.fbS / pr.served,
      ice: pr.fbI / pr.served,
      price: clamp((0.9 - ratio) * 1.8, -1, 1),
    };
  }

  return {
    demographics,
    wait: {
      avgMin: d.served > 0 ? d.waitMinSum / d.served : 0,
      maxMin: d.waitMaxMin,
      histogram: [...d.waitHist],
    },
    recipePrefs,
    loyalty: {
      delighted: d.delighted,
      conversionRate: d.served > 0 ? d.delighted / d.served : 0,
      regularsGain,
      regularsDecay,
      regularsNet: regularsEnd - prevRegulars,
      regularsEnd,
    },
  };
}

/** Build the per-product sales breakdown for the recap from the day's run state. */
function buildPerProduct(d: ReturnType<DaySim["_data"]>): DayResult["perProduct"] {
  const out: NonNullable<DayResult["perProduct"]> = {};
  for (const id of d.menuIds) {
    const pr = d.prods[id];
    if (!pr || pr.served <= 0) continue;
    out[id] = {
      cupsSold: pr.served,
      revenue: pr.revenue,
      avgStars: pr.starCount > 0 ? pr.starSum / pr.starCount : 0,
    };
  }
  return out;
}

// re-export for callers that only need qtyOf semantics
export { qtyOf };
