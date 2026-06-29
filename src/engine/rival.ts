/**
 * Rival competitor (Phase L5) — a pure, deterministic market actor.
 *
 * `stepRival` is the LAST rng-consuming step of day settlement. To keep saves
 * replayable it never branches a draw on `state.mode`: before the spawn day it
 * draws nothing (rival is null), and from the spawn day on it draws exactly one
 * value per day regardless of whether the rival is active or in a buyout cooldown.
 */
import { Rng } from "./rng";
import { TUNING } from "./tuning";
import type { RivalState } from "./types";

const RIVAL_NAMES = ["Sour Squeeze", "Citrus Co.", "Zest Bros", "Pucker Up", "Lemon Drop Co."] as const;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Advance the rival one day. `day` is the upcoming day (spawn gate); `playerRep`
 * sets how strong the competition grows toward. Returns the next RivalState.
 */
export function stepRival(rival: RivalState | null, day: number, playerRep: number, rng: Rng): RivalState | null {
  if (!rival) {
    // Not spawned yet — draw nothing so pre-rival days are byte-identical.
    if (day < TUNING.RIVAL_SPAWN_DAY) return null;
    // Spawn (deterministic — no rng): a fresh competitor moves in nearby.
    const name = RIVAL_NAMES[(day - TUNING.RIVAL_SPAWN_DAY) % RIVAL_NAMES.length]!;
    return { name, strength: TUNING.RIVAL_INIT_STRENGTH, active: true, cooldownDays: 0 };
  }

  // Rival exists: exactly one draw per day from here on (consumed unconditionally).
  const wobble = rng.uniform(-TUNING.RIVAL_WOBBLE, TUNING.RIVAL_WOBBLE);

  if (!rival.active) {
    const cooldownDays = rival.cooldownDays - 1;
    if (cooldownDays > 0) return { ...rival, cooldownDays };
    // Re-enter after the buyout, weakened.
    return { ...rival, active: true, cooldownDays: 0, strength: Math.max(TUNING.RIVAL_INIT_STRENGTH, rival.strength * 0.6) };
  }

  // Active: strength eases toward a target that rises with the player's success.
  const target = TUNING.RIVAL_INIT_STRENGTH + (playerRep / 100) * TUNING.RIVAL_REP_TARGET;
  const strength = clamp(
    rival.strength + (target - rival.strength) * TUNING.RIVAL_ADAPT + wobble,
    0.1,
    TUNING.RIVAL_MAX_STRENGTH,
  );
  return { ...rival, strength };
}

/** Cash cost to buy out the rival right now (scales with their strength). */
export function rivalBuyoutCost(rival: RivalState | null): number {
  if (!rival || !rival.active) return 0;
  return Math.round(TUNING.RIVAL_BUYOUT_BASE * (1 + rival.strength));
}

/** A throwaway rng for tests/headless callers that need to step a rival. */
export function rngFrom(seed: number): Rng {
  return new Rng(seed);
}
