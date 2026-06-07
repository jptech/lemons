/**
 * Persistence — versioned localStorage save/load with a migration hook. The
 * game is deterministic from {seed, state}, so the save is just the GameState
 * (no frame log). Loading a corrupt/old save fails soft (returns null).
 */
import { TUNING, freshProductState, type GameState } from "../engine";
import { LEGACY_EQUIPMENT_MAP } from "../data/equipment";

const KEY = "lemonadeLane.save.v1";

interface Envelope {
  v: number;
  savedAt: number;
  game: GameState;
}

/** Sequential migrations keyed by the version they upgrade FROM. Each receives
 *  a loosely-typed prior-shape game (old fields may differ from the current
 *  GameState) and returns a game one version newer. */
const MIGRATIONS: Record<number, (g: any) => GameState> = {
  // 1 -> 2: add saved recipe-feedback signal.
  1: (g) => ({ ...g, recipeFeedback: g.recipeFeedback ?? { lemon: 0, sugar: 0, ice: 0 } }),
  // 2 -> 3: remap flat equipment ids onto the new upgrade-line ids; add price feedback.
  2: (g) => ({
    ...g,
    ownedEquipmentIds: (g.ownedEquipmentIds ?? []).map((id: string) => LEGACY_EQUIPMENT_MAP[id] ?? id),
    priceFeedback: g.priceFeedback ?? 0,
  }),
  // 3 -> 4: round any fractional stock left by the old fractional-batch bug.
  3: (g) => ({
    ...g,
    inventory: (g.inventory ?? [])
      .map((lot: { qty: number }) => ({ ...lot, qty: Math.round(lot.qty) }))
      .filter((lot: { qty: number }) => lot.qty > 0),
  }),
  // 4 -> 5: split the single reputation scalar into four equal facets (neutral —
  // a loaded save plays identically next day, then the facets differentiate).
  4: (g) => {
    const fromScalar = (v: number) => ({ taste: v, service: v, value: v, buzz: v });
    const locFacets: Record<string, ReturnType<typeof fromScalar>> = {};
    for (const [id, v] of Object.entries(g.locationRep ?? {})) {
      locFacets[id] = fromScalar(v as number);
    }
    return {
      ...g,
      repFacets: g.repFacets ?? fromScalar(g.reputationGlobal ?? 10),
      locationRepFacets: g.locationRepFacets ?? locFacets,
    };
  },
  // 5 -> 6: introduce the supplier market at a neutral index (prices start flat;
  // existing lots are implicitly standard grade).
  5: (g) => ({
    ...g,
    supplier: g.supplier ?? { priceIndex: { lemon: 1, sugar: 1, ice: 1, cup: 1 } },
  }),
  // 6 -> 7: wrap the singular recipe/quality/feedback into a per-product map
  // (classic) and seed the second product; menu starts with just classic.
  6: (g) => {
    const anyG = g as unknown as {
      recipe?: GameState["products"]["classic"]["recipe"];
      qualityScoreEMA?: number;
      recipeFeedback?: { lemon: number; sugar: number; ice: number };
      priceFeedback?: number;
    };
    const classic = {
      recipe: anyG.recipe ?? freshProductState("classic").recipe,
      qualityScoreEMA: anyG.qualityScoreEMA ?? 0.5,
      recipeFeedback: anyG.recipeFeedback ?? { lemon: 0, sugar: 0, ice: 0 },
      priceFeedback: anyG.priceFeedback ?? 0,
    };
    const out = {
      ...g,
      menu: g.menu ?? ["classic"],
      products: g.products ?? { classic, pink: freshProductState("pink") },
    };
    delete (out as Record<string, unknown>).recipe;
    delete (out as Record<string, unknown>).qualityScoreEMA;
    delete (out as Record<string, unknown>).recipeFeedback;
    delete (out as Record<string, unknown>).priceFeedback;
    return out;
  },
  // 7 -> 8: add the research tree (none done/in progress) and backfill staff
  // experience (xp/level = 0). Neutral — a loaded save plays identically, then
  // staff start leveling and research becomes available.
  7: (g) => ({
    ...g,
    research: g.research ?? { completed: [], inProgress: null },
    staff: (g.staff ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      xp: typeof s.xp === "number" ? s.xp : 0,
      level: typeof s.level === "number" ? s.level : 0,
    })),
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
    // Either the new per-product map or a legacy single recipe (pre-migration).
    (typeof o.products === "object" || typeof o.recipe === "object")
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
