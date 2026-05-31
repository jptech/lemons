import { ARCHETYPES } from "../data/archetypes";
import { LOCATION_BY_ID } from "../data/locations";
import { EVENT_BY_ID } from "../data/events";
import { GOALS } from "../data/goals";
import { ACHIEVEMENTS } from "../data/achievements";
import { Rng } from "./rng";
import { creditLimit, derive, effectiveReputation, forecastConfidence, type Derived } from "./derive";
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
import { TUNING } from "./tuning";
import type {
  ArchetypeDef,
  DayResult,
  GameState,
  InventoryLot,
  ItemId,
  LocationDef,
  SimEvent,
  SimSnapshot,
  StationView,
  WeatherDay,
} from "./types";

// ---------------------------------------------------------------------------
// Internal simulation entities
// ---------------------------------------------------------------------------
interface SimCustomer {
  id: number;
  arch: ArchetypeDef;
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
  ticksLeft: number;
  customer: SimCustomer | null;
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

  // working state
  private readonly inv: InventoryLot[];
  private readonly stations: Station[];
  private readonly queue: SimCustomer[] = [];
  private pool = 0; // cups of lemonade ready to serve
  private minute = 0;
  private nextCustomerId = 1;
  private over = false;
  private stockoutMinute: number | null = null;
  private unsoldCups = 0;

  // counters
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
  // Recipe-feedback accumulators: summed (idealComp - playerComp) over served.
  private fbL = 0;
  private fbS = 0;
  private fbI = 0;

  private readonly batchPitchers: number;
  private readonly cupsPerBatch: number;

  constructor(state: GameState) {
    this.state = state;
    this.rng = new Rng(state.rngState);
    this.derived = derive(state);
    this.location = LOCATION_BY_ID[state.currentLocationId]!;
    this.openMinutes = this.location.openMinutes;
    this.effRep = effectiveReputation(state);

    const weather = state.weatherToday;
    this.tolerance = priceTolerance(
      this.location,
      this.effRep,
      weather,
      state.qualityScoreEMA,
    );

    const event = state.activeEventId ? EVENT_BY_ID[state.activeEventId] : undefined;
    const baseExpected = expectedCustomers({
      location: this.location,
      weather,
      dayOfWeek: this.dayOfWeek(),
      effectiveRep: this.effRep,
      marketingSpend: state.marketingSpend,
      marketingFloor: this.derived.marketingFloor,
      price: state.recipe.pricePerCup,
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

    this.inv = state.inventory.map((l) => ({ ...l }));
    this.batchPitchers = this.derived.batchSizeMult;
    this.cupsPerBatch = Math.max(1, Math.round(TUNING.CUPS_PER_PITCHER * this.derived.batchSizeMult));
    this.stations = this.buildStations();
  }

  private dayOfWeek() {
    return (this.state.day - 1) % 7;
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
        customer: null,
      },
    ];
    this.state.staff.forEach((st, i) => {
      stations.push({
        id: i + 1,
        kind: "staff",
        role: st.role,
        serveMult: this.derived.serveSpeedMult + st.serveSpeedBonus,
        batchMult: this.derived.batchSpeedMult + st.batchSpeedBonus,
        state: "idle",
        ticksLeft: 0,
        customer: null,
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

    // 2. Advance busy stations
    for (const st of this.stations) {
      if (st.state === "idle") continue;
      st.ticksLeft--;
      if (st.ticksLeft > 0) continue;
      if (st.state === "serving") {
        this.finalizeSale(st, events);
      } else {
        this.pool += this.cupsPerBatch;
        events.push({ type: "batch", cups: this.cupsPerBatch });
      }
      st.state = "idle";
      st.customer = null;
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
        events.push({ type: "renege", archetype: c.arch.id });
      }
    }

    this.minute++;
    if (this.minute >= this.openMinutes) this.close(events);
  }

  private arrive(events: SimEvent[]) {
    const arch = this.pickArchetype();
    events.push({ type: "arrive", archetype: arch.id });
    const patience = Math.max(
      1,
      Math.round(
        TUNING.PATIENCE_BASE *
          this.derived.patienceMult *
          arch.patienceMult *
          this.rng.uniform(0.7, 1.3),
      ),
    );
    const c: SimCustomer = {
      id: this.nextCustomerId++,
      arch,
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

  private assignStations(events: SimEvent[]) {
    const buffer = Math.max(2, this.stations.length);
    for (const st of this.stations) {
      if (st.state !== "idle") continue;
      const canServe = this.queue.length > 0 && this.pool >= 1 && qtyOf(this.inv, "cup") >= 1;
      const canMake = this.canMakeBatch();
      const poolLow = this.pool < buffer;

      // Prefer keeping the pool stocked when it runs low; otherwise serve.
      if (canMake && poolLow && (this.queue.length > 0 || this.pool < 1)) {
        this.startMake(st);
      } else if (canServe) {
        this.startServe(st);
      } else if (canMake && this.queue.length > 0) {
        this.startMake(st);
      } else if (this.queue.length > 0 && this.pool < 1 && !canMake) {
        // Out of raw ingredients (and no pool) — a real stockout.
        if (this.stockoutMinute === null) {
          this.stockoutMinute = this.minute;
          const missing = this.firstMissingForBatch();
          if (missing) events.push({ type: "stockout", item: missing });
        }
      } else if (canServe === false && this.pool >= 1 && this.queue.length > 0 && qtyOf(this.inv, "cup") < 1) {
        // Lemonade ready but out of cups.
        if (this.stockoutMinute === null) {
          this.stockoutMinute = this.minute;
          events.push({ type: "stockout", item: "cup" });
        }
      }
    }
  }

  private canMakeBatch(): boolean {
    const r = this.state.recipe;
    return (
      qtyOf(this.inv, "lemon") + 1e-9 >= r.lemons * this.batchPitchers &&
      qtyOf(this.inv, "sugar") + 1e-9 >= r.sugar * this.batchPitchers &&
      qtyOf(this.inv, "ice") + 1e-9 >= r.ice * this.batchPitchers
    );
  }

  private firstMissingForBatch(): ItemId | null {
    const r = this.state.recipe;
    if (qtyOf(this.inv, "lemon") < r.lemons * this.batchPitchers) return "lemon";
    if (qtyOf(this.inv, "sugar") < r.sugar * this.batchPitchers) return "sugar";
    if (qtyOf(this.inv, "ice") < r.ice * this.batchPitchers) return "ice";
    return null;
  }

  private startMake(st: Station) {
    const r = this.state.recipe;
    consume(this.inv, "lemon", r.lemons * this.batchPitchers);
    consume(this.inv, "sugar", r.sugar * this.batchPitchers);
    consume(this.inv, "ice", r.ice * this.batchPitchers);
    st.state = "making";
    st.ticksLeft = Math.max(1, Math.round(TUNING.BATCH_TIME / st.batchMult));
  }

  private startServe(st: Station) {
    const c = this.queue.shift()!;
    this.pool -= 1;
    consume(this.inv, "cup", 1);
    st.state = "serving";
    st.customer = c;
    st.ticksLeft = Math.max(1, Math.round(TUNING.SERVE_BASE / st.serveMult));
  }

  private finalizeSale(st: Station, events: SimEvent[]) {
    const c = st.customer!;
    const price = this.state.recipe.pricePerCup;
    const weather = this.state.weatherToday;

    const baseQ = recipeQuality(this.state.recipe, weather, c.tasteShift);
    const quality = clamp(baseQ + this.rng.gaussian(0, TUNING.TASTE_NOISE), 0, 1);
    const fairness = priceFairness(price, this.tolerance, c.priceSensitivity);
    const wait = waitScore(c.waited, c.patience);
    const satisfaction = combineSatisfaction(quality, fairness, wait);

    this.cupsSold++;
    this.served++;
    this.revenue += price;
    this.qualSum += quality;
    this.fairSum += fairness;
    this.waitSum += wait;
    this.servedSatSum += satisfaction;
    if (satisfaction >= TUNING.TIP_THRESHOLD) this.delighted++;
    this.accumulateFeedback(c, weather);

    const stars = starsFromSatisfaction(satisfaction);
    // Reviewers: a sample plus the extremes (delight/disappointment).
    if (this.rng.chance(TUNING.REVIEW_RATE) || stars === 5 || stars === 1) {
      this.starHist[stars - 1] = (this.starHist[stars - 1] ?? 0) + 1;
    }

    const tip = tipAmount(satisfaction, price, c.arch, this.rng.next());
    if (tip > 0) {
      this.tips += tip;
      events.push({ type: "tip", amount: tip });
    }
    events.push({ type: "sale", archetype: c.arch.id, price, stars, satisfaction });
  }

  /** Accumulate how far this customer's ideal differs from the recipe (per part). */
  private accumulateFeedback(c: SimCustomer, weather: WeatherDay) {
    const ideal = idealRecipe(weather);
    const il = Math.max(0, ideal.vec[0] + c.tasteShift.lemon);
    const is = Math.max(0, ideal.vec[1] + c.tasteShift.sugar);
    const ii = Math.max(0, ideal.vec[2] + c.tasteShift.ice);
    const isum = il + is + ii || 1;
    const r = this.state.recipe;
    const psum = r.lemons + r.sugar + r.ice || 1;
    this.fbL += il / isum - r.lemons / psum;
    this.fbS += is / isum - r.sugar / psum;
    this.fbI += ii / isum - r.ice / psum;
  }

  private close(events: SimEvent[]) {
    // Anyone still in line when we close didn't get served.
    this.balked += this.queue.length;
    this.queue.length = 0;
    this.unsoldCups = Math.floor(this.pool); // brewed but never sold
    this.over = true;
    events.push({ type: "close" });
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
      pitcherPool: this.pool,
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
        progress:
          s.state === "idle"
            ? 0
            : s.state === "serving"
              ? 1 - s.ticksLeft / Math.max(1, Math.round(TUNING.SERVE_BASE / s.serveMult))
              : 1 - s.ticksLeft / Math.max(1, Math.round(TUNING.BATCH_TIME / s.batchMult)),
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
      fbL: this.fbL,
      fbS: this.fbS,
      fbI: this.fbI,
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

  // ---- Reputation (sticky, slow) ----
  const repStartLocal = prev.locationRep[prev.currentLocationId] ?? 0;
  const repStartEff = d.effRep;
  let newGlobal = prev.reputationGlobal;
  let newLocal = repStartLocal;
  if (d.served > 0) {
    // Reputation tracks the experience of customers you actually SERVED, with a
    // modest penalty for turning people away (a long line dents your name).
    const lost = d.balked + d.reneged;
    const lossRate = lost / (d.served + lost);
    const target = clamp(100 * (d.servedSatSum / d.served) - TUNING.LOSS_REP_PENALTY * lossRate, 0, 100);
    const mkt = marketingRepBoost(marketing) + (event?.effect.repDelta ?? 0);
    newLocal = clamp((newLocal + TUNING.REP_EASE * (target - newLocal)) * (1 - TUNING.REP_DECAY), 0, 100);
    newGlobal = clamp(
      (newGlobal + TUNING.GLOBAL_REP_EASE_FACTOR * TUNING.REP_EASE * (target - newGlobal) + mkt) * (1 - TUNING.REP_DECAY),
      0,
      100,
    );
  } else if (event?.effect.repDelta) {
    newGlobal = clamp(newGlobal + event.effect.repDelta, 0, 100);
  }

  // ---- Quality EMA + recipe feedback (only when we actually served) ----
  let qualityEMA = prev.qualityScoreEMA;
  const prevFb = prev.recipeFeedback ?? { lemon: 0, sugar: 0, ice: 0 };
  let recipeFeedback = prevFb;
  let priceFeedback = prev.priceFeedback ?? 0;
  if (d.served > 0) {
    const avgQ = d.qualSum / d.served;
    qualityEMA = qualityEMA + TUNING.QUALITY_EMA_EASE * (avgQ - qualityEMA);
    const e = TUNING.FEEDBACK_EASE;
    recipeFeedback = {
      lemon: prevFb.lemon + e * (d.fbL / d.served - prevFb.lemon),
      sugar: prevFb.sugar + e * (d.fbS / d.served - prevFb.sugar),
      ice: prevFb.ice + e * (d.fbI / d.served - prevFb.ice),
    };
    // Pricing signal: how the day's price compared to what the crowd would bear.
    // Positive = room to charge more; negative = guests found you pricey.
    const ratio = prev.recipe.pricePerCup / (d.tolerance || 1);
    const daySignal = clamp((0.9 - ratio) * 1.8, -1, 1);
    priceFeedback = priceFeedback + TUNING.PRICE_FEEDBACK_EASE * (daySignal - priceFeedback);
  }

  // ---- Regulars pool (loyalty program speeds growth) ----
  const regularsCap = location.baseTraffic * 0.4;
  let regulars =
    prev.regularsPool +
    TUNING.REGULARS_GAIN * d.derived.regularsGainMult * d.delighted -
    TUNING.REGULARS_DECAY * prev.regularsPool;
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
    const aged = { ...lot, ageDays: lot.ageDays + 1 };
    if (lot.item === "lemon" && aged.ageDays >= TUNING.LEMON_SHELF_LIFE) {
      spoiledLemons += aged.qty;
      continue;
    }
    nextInv.push(aged);
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
    price: prev.recipe.pricePerCup,
    recipe: { ...prev.recipe },
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
    regularsEnd: regulars,
    newGoals: [],
    newAchievements: [],
  };

  // ---- Advance to next day ----
  const nextCond = nextCondition(rng, prev.weatherToday.condition);
  const weatherToday = makeWeatherDay(rng, nextCond, d.derived.forecastAccuracy);
  const nextEventId = rollEvent(rng, prev.day + 1);

  const next: GameState = {
    ...prev,
    rngState: rng.state,
    day: prev.day + 1,
    cash,
    debt,
    reputationGlobal: newGlobal,
    locationRep: { ...prev.locationRep, [prev.currentLocationId]: newLocal },
    regularsPool: regulars,
    inventory: nextInv,
    qualityScoreEMA: qualityEMA,
    recipeFeedback,
    priceFeedback,
    weatherToday,
    activeEventId: nextEventId,
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

// re-export for callers that only need qtyOf semantics
export { qtyOf };
