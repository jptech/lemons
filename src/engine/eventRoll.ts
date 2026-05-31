import { EVENTS, EVENT_CHANCE } from "../data/events";
import type { Rng } from "./rng";

/**
 * Deterministically decide whether a daily event fires (and which). Consumes a
 * fixed number of RNG draws so the stream stays reproducible. Called once when
 * each new day begins (in newGame for day 1, in settlement for later days).
 */
export function rollEvent(rng: Rng, day: number): string | null {
  const fires = rng.chance(EVENT_CHANCE);
  const eligible = EVENTS.filter((e) => !e.minDay || day >= e.minDay);
  // Always consume the weighted draw so the stream is independent of `fires`.
  const idx = eligible.length ? rng.weightedIndex(eligible.map((e) => e.weight)) : 0;
  if (!fires || !eligible.length) return null;
  return eligible[idx]!.id;
}
