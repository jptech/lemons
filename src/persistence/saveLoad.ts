/**
 * Persistence — versioned localStorage save/load with a migration hook. The
 * game is deterministic from {seed, state}, so the save is just the GameState
 * (no frame log). Loading a corrupt/old save fails soft (returns null).
 */
import { TUNING, type GameState } from "../engine";
import { LEGACY_EQUIPMENT_MAP } from "../data/equipment";

const KEY = "lemonadeLane.save.v1";

interface Envelope {
  v: number;
  savedAt: number;
  game: GameState;
}

/** Sequential migrations keyed by the version they upgrade FROM. */
const MIGRATIONS: Record<number, (g: GameState) => GameState> = {
  // 1 -> 2: add saved recipe-feedback signal.
  1: (g) => ({ ...g, recipeFeedback: g.recipeFeedback ?? { lemon: 0, sugar: 0, ice: 0 } }),
  // 2 -> 3: remap flat equipment ids onto the new upgrade-line ids; add price feedback.
  2: (g) => ({
    ...g,
    ownedEquipmentIds: (g.ownedEquipmentIds ?? []).map((id) => LEGACY_EQUIPMENT_MAP[id] ?? id),
    priceFeedback: g.priceFeedback ?? 0,
  }),
  // 3 -> 4: round any fractional stock left by the old fractional-batch bug.
  3: (g) => ({
    ...g,
    inventory: (g.inventory ?? [])
      .map((lot) => ({ ...lot, qty: Math.round(lot.qty) }))
      .filter((lot) => lot.qty > 0),
  }),
};

function migrate(game: GameState, fromVersion: number): GameState {
  let g = game;
  for (let v = fromVersion; v < TUNING.SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) g = step(g);
  }
  g.schemaVersion = TUNING.SCHEMA_VERSION;
  return g;
}

function looksLikeGame(g: unknown): g is GameState {
  if (!g || typeof g !== "object") return false;
  const o = g as Record<string, unknown>;
  return (
    typeof o.seed === "number" &&
    typeof o.day === "number" &&
    typeof o.cash === "number" &&
    typeof o.currentLocationId === "string" &&
    Array.isArray(o.inventory) &&
    Array.isArray(o.history) &&
    typeof o.recipe === "object"
  );
}

export function saveGame(game: GameState, now: number): void {
  try {
    const env: Envelope = { v: TUNING.SCHEMA_VERSION, savedAt: now, game };
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    // Storage full / unavailable — fail silently; the game still runs.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Partial<Envelope>;
    const game = env.game;
    if (!looksLikeGame(game)) return null;
    return migrate(game, env.v ?? 0);
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Validate an arbitrary parsed object as a loadable game (for imports). */
export function validateImport(data: unknown): GameState | null {
  if (looksLikeGame(data)) return migrate(data, (data as GameState).schemaVersion ?? 0);
  // also accept an envelope shape
  if (data && typeof data === "object" && looksLikeGame((data as Envelope).game)) {
    const env = data as Envelope;
    return migrate(env.game, env.v ?? 0);
  }
  return null;
}
