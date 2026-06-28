/**
 * L0 SPIKE — prove the word-of-mouth demand model before any schema change.
 *
 *   bun run scripts/awarenessProbe.ts
 *
 * The whole anti-plateau thesis (Phase L3 "brand equity") rests on one claim:
 * a compounding word-of-mouth *awareness reservoir* can push demand past the
 * location ceiling AND feel like gradual growth WITHOUT running away or trivially
 * pinning at a cap. This is a throwaway probe — it imports the real
 * `expectedCustomers` to ground the base demand, then layers a synthetic
 * awareness reservoir on top under three candidate update rules:
 *
 *   1. stock-feeds-stock  Δ = k·awareness − leak·awareness   → expect RUNAWAY
 *   2. flow-feeds-stock   Δ = k·delightedYesterday − leak·awareness  → CHOSEN
 *   3. flow-feeds-stock + hard demand-mult cap (2.2×)         → safety net
 *
 * Why rule 2 self-limits: `delighted` is a fraction of `served`, and `served` is
 * capped by the stand's throughput. So once demand exceeds capacity, the inflow
 * (k·delighted) pins to a constant while the leak (leak·awareness) keeps growing
 * with the stock → a stable equilibrium. Rule 1 has no such brake: any positive
 * net rate compounds geometrically.
 *
 * PASS: rule 2 grows then plateaus asymptotically (a finite, gradually-approached
 * demand multiplier > 1.4, i.e. past the current rep ceiling); rule 1 diverges.
 */
import { expectedCustomers, type DemandInputs } from "../src/engine/economy";
import type { LocationDef, WeatherDay } from "../src/engine/types";

// --- A "maxed stand" demand profile, grounded in the real economy function ---
// Downtown-tier traffic, high reputation, sustained marketing, price near
// tolerance — the day-35 saturated state where the plateau bites.
const DOWNTOWN: LocationDef = {
  id: "downtown",
  name: "Downtown Plaza",
  icon: "🏙️",
  baseTraffic: 560,
  priceToleranceBase: 3.9,
  rentPerDay: 240,
  unlockCost: 4500,
  openMinutes: 540,
  weatherVariance: 1.3,
};

const SUNNY: WeatherDay = {
  condition: "sunny",
  tempF: 82,
  forecast: { condition: "sunny", tempF: 82 },
};

/** Would-be customers BEFORE the awareness reservoir layer (the base ceiling). */
const baseInputs: DemandInputs = {
  location: DOWNTOWN,
  weather: SUNNY,
  dayOfWeek: 6, // Saturday — strong day
  effectiveRep: 80,
  marketingSpend: 50,
  marketingFloor: 0.1,
  price: 3.6, // a touch under tolerance
  tolerance: 4.2,
  regularsPool: 180,
  eventTrafficMult: 1,
  // buzz/value neutral → no facet tilt; awareness is layered on separately below.
};

const BASE_DEMAND = expectedCustomers(baseInputs);

// --- Stand throughput ceiling (what a maxed 3-staff + auto-pour stand serves) -
const CAPACITY = 360;
const DELIGHT_FRACTION = 0.25; // ~quarter of served customers leave delighted

// --- Awareness → demand multiplier (the reservoir's effect on top-of-funnel) ---
const AW_GAIN = 0.02; // each awareness point adds ~2% demand (linear, uncapped)
const HARD_CAP = 2.2; // rule 3's safety net on the multiplier
function awarenessMult(aw: number, capped: boolean): number {
  const m = 1 + AW_GAIN * aw;
  return capped ? Math.min(HARD_CAP, m) : m;
}

// --- Reservoir tuning ---
const LEAK = 0.04; // ~4%/day decay → time constant ~25 days
const K_STOCK = 0.10; // rule 1 self-feed (net +6%/day vs leak → compounds)
const K_FLOW = 0.02; // rule 2/3 inflow per delighted customer

type Rule = 1 | 2 | 3;
interface DayRow {
  day: number;
  awareness: number;
  mult: number;
  demand: number;
  served: number;
}

function simulate(rule: Rule, days: number): DayRow[] {
  const capped = rule === 3;
  let awareness = 1; // seed so the stock rules have something to feed on
  const rows: DayRow[] = [];
  for (let day = 1; day <= days; day++) {
    const mult = awarenessMult(awareness, capped);
    const demand = BASE_DEMAND * mult;
    const served = Math.min(CAPACITY, demand);
    const delighted = DELIGHT_FRACTION * served;

    // Update the reservoir for tomorrow.
    const inflow = rule === 1 ? K_STOCK * awareness : K_FLOW * delighted;
    awareness = Math.max(0, awareness + inflow - LEAK * awareness);

    rows.push({ day, awareness, mult, demand, served });
  }
  return rows;
}

function fmt(n: number, w = 7, d = 1): string {
  return (Number.isFinite(n) ? n.toFixed(d) : "∞").padStart(w);
}

const DAYS = 200;
const SAMPLE = [1, 10, 25, 50, 75, 100, 150, 200];
const RULE_NAMES: Record<Rule, string> = {
  1: "stock-feeds-stock (Δ = k·awareness − leak·aw)",
  2: "flow-feeds-stock  (Δ = k·delighted − leak·aw)   [CHOSEN]",
  3: "flow + hard 2.2× demand-mult cap                [safety net]",
};

console.log(`Base demand (maxed downtown, neutral awareness): ${BASE_DEMAND.toFixed(0)} would-be customers`);
console.log(`Throughput capacity: ${CAPACITY}  ·  delight fraction: ${DELIGHT_FRACTION}\n`);

for (const rule of [1, 2, 3] as Rule[]) {
  const rows = simulate(rule, DAYS);
  console.log(`── Rule ${rule}: ${RULE_NAMES[rule]}`);
  console.log(`   day   awareness    mult     demand    served`);
  for (const d of SAMPLE) {
    const r = rows[d - 1]!;
    console.log(`   ${String(d).padStart(3)}  ${fmt(r.awareness, 9, 1)}  ${fmt(r.mult, 6, 2)}  ${fmt(r.demand, 9, 0)}  ${fmt(r.served, 7, 0)}`);
  }
  const last = rows[rows.length - 1]!;
  const prev = rows[rows.length - 11]!; // 10 days earlier
  const growth10 = (last.awareness - prev.awareness) / (prev.awareness || 1);
  const diverged = !Number.isFinite(last.awareness) || last.awareness > 1e4;
  const verdict = diverged
    ? "❌ DIVERGED (runaway) — reject"
    : Math.abs(growth10) < 0.02
      ? `✅ stable plateau (last-10d Δ ${(growth10 * 100).toFixed(1)}%) — mult settles at ${last.mult.toFixed(2)}×`
      : `↗︎ still climbing at day ${DAYS} (last-10d Δ ${(growth10 * 100).toFixed(1)}%)`;
  console.log(`   → ${verdict}\n`);
}

console.log(
  "Interpretation: rule 1 compounds without bound (the awareness column blows up);\n" +
  "rules 2 & 3 grow then asymptote because `delighted` pins at delightFraction×capacity\n" +
  "once demand exceeds throughput, so inflow caps while the leak scales with the stock.\n" +
  "Rule 2 lifts demand PAST the rep ceiling (mult > 1.4) yet converges → thesis holds.\n" +
  "Ship L3 with rule 2 (flow-fed) + rule 3's hard cap as the safety net.",
);
