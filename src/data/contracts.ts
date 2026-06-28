/**
 * Weekly contracts (Phase L2) — opt-in, deadline-bound objectives dealt two at a
 * time each in-game week. Accepting one is a real weekly decision: active slots
 * are limited, the deadline forces a window, and the constraint shapes how you
 * play that stretch (push volume, chase margin, work the tip jar). Reward is
 * cash + Prestige; missing the deadline simply forfeits the reward.
 *
 * "challenge" contracts track a *delta* on a cumulative stat since acceptance, so
 * they're robust and fully deterministic. (The operational "catering" kind — a
 * pre-paid order injected into a day's brew — is the L2b follow-up; the data
 * model and dealer already leave room for it.)
 */
import { Rng, seedFromString } from "../engine/rng";
import type { GameState } from "../engine/types";

export type ContractStat = "cups" | "profit" | "tips" | "revenue";
export type ContractKind = "challenge";

export interface ContractDef {
  id: string;
  kind: ContractKind;
  name: string;
  icon: string;
  /** Cumulative stat whose delta-since-accept must reach `target`. */
  stat: ContractStat;
  target: number;
  /** Days from acceptance to the deadline. */
  days: number;
  rewardCash: number;
  rewardPrestige: number;
  /** Earliest day this contract can be dealt (keeps the early game gentle). */
  minDay?: number;
}

export const CONTRACTS: readonly ContractDef[] = [
  { id: "weekend_rush", kind: "challenge", name: "Weekend Rush", icon: "🏃", stat: "cups", target: 300, days: 4, rewardCash: 400, rewardPrestige: 1, minDay: 4 },
  { id: "tip_jar", kind: "challenge", name: "Fill the Tip Jar", icon: "🪙", stat: "tips", target: 80, days: 4, rewardCash: 350, rewardPrestige: 1, minDay: 4 },
  { id: "profit_sprint", kind: "challenge", name: "Profit Sprint", icon: "💸", stat: "profit", target: 1200, days: 5, rewardCash: 500, rewardPrestige: 2, minDay: 4 },
  { id: "revenue_run", kind: "challenge", name: "Revenue Run", icon: "🧾", stat: "revenue", target: 2500, days: 5, rewardCash: 450, rewardPrestige: 1, minDay: 4 },
  { id: "cup_marathon", kind: "challenge", name: "Cup Marathon", icon: "🥤", stat: "cups", target: 700, days: 7, rewardCash: 800, rewardPrestige: 3, minDay: 8 },
  { id: "profit_push", kind: "challenge", name: "Profit Push", icon: "📈", stat: "profit", target: 2500, days: 7, rewardCash: 900, rewardPrestige: 3, minDay: 8 },
  { id: "crowd_pleaser", kind: "challenge", name: "Crowd Pleaser", icon: "💛", stat: "tips", target: 150, days: 6, rewardCash: 600, rewardPrestige: 2, minDay: 8 },
];

export const CONTRACT_BY_ID: Record<string, ContractDef> = Object.fromEntries(
  CONTRACTS.map((c) => [c.id, c]),
);

/** The cumulative value of a contract's tracked stat for the current state. */
export function statValue(state: GameState, stat: ContractStat): number {
  switch (stat) {
    case "cups": return state.stats.totalCupsSold;
    case "profit": return state.stats.totalProfit;
    case "tips": return state.stats.totalTips;
    case "revenue": return state.stats.totalRevenue;
  }
}

/** Plain-language objective line for a contract. */
export function contractObjective(def: ContractDef): string {
  const unit =
    def.stat === "cups" ? `${def.target} cups`
    : def.stat === "tips" ? `$${def.target} in tips`
    : def.stat === "profit" ? `$${def.target} profit`
    : `$${def.target} revenue`;
  return `${unit} within ${def.days} days`;
}

/**
 * Deterministically deal up to two distinct contract ids for a given week.
 * Uses a THROWAWAY rng seeded from `${seed}:contracts:week:${week}` so it never
 * touches the game's main `rngState` — reproducible across save/load.
 */
export function dealWeek(seed: number, week: number, day: number): string[] {
  const rng = new Rng(seedFromString(`${seed}:contracts:week:${week}`));
  const pool = CONTRACTS.filter((c) => (c.minDay ?? 1) <= day).map((c) => c.id);
  const out: string[] = [];
  for (let i = 0; i < 2 && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}
