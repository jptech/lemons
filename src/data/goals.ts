import type { GameState, GoalDef } from "../engine/types";

/**
 * Campaign goals — an ordered ladder. Declarative predicates over GameState.
 * Completing them all wins the campaign (which can then continue into endless).
 */
export const GOALS: readonly GoalDef[] = [
  { id: "cash_500", title: "First Profits", desc: "Reach $500 in cash", check: (s) => s.cash >= 500 },
  { id: "rep_35", title: "Local Favorite", desc: "Reach 35 reputation", check: (s) => s.reputationGlobal >= 35 },
  { id: "unlock_park", title: "Moving Up", desc: "Unlock the Town Park", check: (s) => s.unlockedLocationIds.includes("park") },
  { id: "cups_150", title: "Busy Bee", desc: "Sell 150 cups in a single day", check: (s) => s.stats.bestDayCups >= 150 },
  { id: "cash_2000", title: "Big Squeeze", desc: "Reach $2,000 in cash", check: (s) => s.cash >= 2000 },
  { id: "unlock_beach", title: "Beach Life", desc: "Unlock the Beach Boardwalk", check: (s) => s.unlockedLocationIds.includes("beach") },
  { id: "rep_65", title: "Citywide Fame", desc: "Reach 65 reputation", check: (s) => s.reputationGlobal >= 65 },
  { id: "cash_10000", title: "Lemonade Tycoon", desc: "Reach $10,000 in cash", check: (s) => s.cash >= 10000 },
];

export const GOAL_BY_ID: Record<string, GoalDef> = Object.fromEntries(GOALS.map((g) => [g.id, g]));

// ---------------------------------------------------------------------------
// Endless "Tycoon ladder" (Phase L1)
// ---------------------------------------------------------------------------
// A generative, never-ending goal ladder that extends past the campaign so the
// late game always has a next target. Rungs cycle through three tracks so it's
// "fresh challenges", not just "more cash". Every track uses an *unbounded*
// metric (cash / lifetime profit / lifetime cups) so a single sequential ladder
// can never get permanently stuck on a throughput- or rep-capped rung.
//
// Each rung awards Prestige (NOT cash — a cash reward would just build a faster
// money printer and re-create the plateau).

const LADDER_TRACKS = 3;

function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function cupsShort(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;
}

/** The Nth endless-ladder rung as a declarative GoalDef (id `ladder_${n}`). */
export function rung(n: number): GoalDef {
  const track = n % LADDER_TRACKS;
  const step = Math.floor(n / LADDER_TRACKS); // 0,1,2,… within the track
  const tier = step + 1;
  if (track === 0) {
    const target = 25_000 * 2 ** step; // 25k → 50k → 100k → …
    return {
      id: `ladder_${n}`,
      title: `Cash Vault ${tier}`,
      desc: `Hold ${moneyShort(target)} in cash`,
      check: (s) => s.cash >= target,
    };
  }
  if (track === 1) {
    const target = 50_000 * 2 ** step; // 50k → 100k → 200k → … lifetime profit
    return {
      id: `ladder_${n}`,
      title: `Empire Profit ${tier}`,
      desc: `Earn ${moneyShort(target)} lifetime profit`,
      check: (s) => s.stats.totalProfit >= target,
    };
  }
  const target = 5_000 * 2 ** step; // 5k → 10k → 20k → … lifetime cups
  return {
    id: `ladder_${n}`,
    title: `Cups Served ${tier}`,
    desc: `Sell ${cupsShort(target)} cups in total`,
    check: (s) => s.stats.totalCupsSold >= target,
  };
}

/** Prestige awarded for clearing rung `n` (grows as the ladder climbs). */
export function rungPrestige(n: number): number {
  return 6 + 2 * n;
}

/** Parse a ladder goal id back to its rung index (or null if not a ladder id). */
export function ladderRungFromId(id: string): number | null {
  const m = /^ladder_(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Title for any goal id — resolves both base goals and generative ladder rungs. */
export function goalTitle(id: string): string {
  if (GOAL_BY_ID[id]) return GOAL_BY_ID[id]!.title;
  const n = ladderRungFromId(id);
  return n === null ? id : rung(n).title;
}

/**
 * Back-compute the next un-cleared rung for a state, summing the Prestige of all
 * already-satisfied rungs. Used by save migration so a rich legacy save neither
 * re-fires old rungs nor is denied the Prestige it "should" have earned.
 */
export function backfillLadder(s: GameState): { ladderRung: number; prestige: number } {
  let n = 0;
  let prestige = 0;
  while (n < 1000 && rung(n).check(s)) {
    prestige += rungPrestige(n);
    n++;
  }
  return { ladderRung: n, prestige };
}
