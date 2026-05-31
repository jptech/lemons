import type { GoalDef } from "../engine/types";

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
