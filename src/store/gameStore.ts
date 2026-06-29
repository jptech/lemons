/**
 * The app-level store: holds the persistent GameState plus light UI state
 * (which screen, the most recent day result, a transient toast). A singleton —
 * pragmatic for a single-player local game. All GameState mutations go through
 * pure engine reducers here; nothing else writes the game.
 */
import { createStore, type Store } from "./store";
import { loadGame, saveGame, hasSave } from "../persistence/saveLoad";
import { loadSettings, persistSettings, type Settings } from "./settings";
import { exportSave, importSaveFromFile } from "../persistence/importExport";
import {
  newGame,
  setPrice,
  setRecipe,
  toggleMenuProduct,
  buyStock,
  discardStock,
  buyEquipment,
  hireStaff,
  fireStaff,
  setStaffRole,
  setStaffResting,
  trainStaff,
  startResearch,
  setMarketing,
  moveLocation,
  unlockLocation,
  takeLoan,
  repayLoan,
  buyPerk,
  convertCashToPrestige,
  acceptContract,
  buyoutRival,
  maxBuyable,
  type DayResult,
  type GameMode,
  type GameState,
  type ItemGrade,
  type ItemId,
  type ProductId,
  type Recipe,
  type StaffRole,
} from "../engine";

export type Screen = "menu" | "planning" | "simulation" | "results" | "analytics";

export interface AppState {
  screen: Screen;
  game: GameState;
  lastResult: DayResult | null;
  toast: string | null;
  settings: Settings;
  settingsOpen: boolean;
}

export function randomSeed(): number {
  // UI-side only (engine stays deterministic given the seed).
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

const savedGame = loadGame();
export const store: Store<AppState> = createStore<AppState>({
  screen: hasSave() && savedGame ? "planning" : "menu",
  game: savedGame ?? newGame(randomSeed(), "sandbox"),
  lastResult: null,
  toast: null,
  settings: loadSettings(),
  settingsOpen: false,
});

// --- Autosave (debounced) -------------------------------------------------
let lastSavedGame: GameState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
store.subscribe((s) => {
  if (s.game === lastSavedGame) return;
  lastSavedGame = s.game;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveGame(s.game, Date.now()), 400);
});

function patchGame(fn: (g: GameState) => GameState) {
  store.setState((s) => {
    const game = fn(s.game);
    return game === s.game ? s : { ...s, game };
  });
}

export const actions = {
  // --- navigation ---
  goTo(screen: Screen) {
    store.setState((s) => ({ ...s, screen }));
  },
  startNewGame(mode: GameMode = "sandbox") {
    store.setState((s) => ({
      ...s,
      screen: "planning",
      game: newGame(randomSeed(), mode),
      lastResult: null,
      toast: null,
      settingsOpen: false,
    }));
  },
  continueGame() {
    store.setState((s) => ({ ...s, screen: "planning" }));
  },
  /** After winning the campaign, keep the same game running endlessly. */
  continueEndless() {
    patchGame((g) => ({ ...g, mode: "sandbox" }));
    actions.goTo("planning");
  },
  toast(msg: string | null) {
    store.setState((s) => ({ ...s, toast: msg }));
  },
  /** Force a re-render after a UI-only state change (no game mutation). */
  refresh() {
    store.setState((s) => ({ ...s }));
  },

  // --- settings ---
  openSettings() {
    store.setState((s) => ({ ...s, settingsOpen: true }));
  },
  closeSettings() {
    store.setState((s) => ({ ...s, settingsOpen: false }));
  },
  setSetting(patch: Partial<Settings>) {
    store.setState((s) => {
      const settings = { ...s.settings, ...patch };
      persistSettings(settings);
      return { ...s, settings };
    });
  },

  // --- planning reducers ---
  setPrice: (p: number, product?: ProductId) => patchGame((g) => setPrice(g, p, product)),
  setRecipe: (patch: Partial<Recipe>, product?: ProductId) =>
    patchGame((g) => setRecipe(g, patch, product)),
  toggleMenuProduct: (product: ProductId) => patchGame((g) => toggleMenuProduct(g, product)),
  buyStock: (item: ItemId, qty: number, grade: ItemGrade = "standard") =>
    patchGame((g) => buyStock(g, item, qty, grade)),
  buyMax: (item: ItemId, grade: ItemGrade = "standard") =>
    patchGame((g) => buyStock(g, item, maxBuyable(g, item, grade), grade)),
  discardStock: (item: ItemId, qty: number) => patchGame((g) => discardStock(g, item, qty)),
  setMarketing: (spend: number) => patchGame((g) => setMarketing(g, spend)),
  buyEquipment: (id: string) => patchGame((g) => buyEquipment(g, id)),
  hireStaff: (tier: 1 | 2 | 3) => patchGame((g) => hireStaff(g, tier)),
  fireStaff: (id: string) => patchGame((g) => fireStaff(g, id)),
  setStaffRole: (id: string, role: StaffRole) => patchGame((g) => setStaffRole(g, id, role)),
  setStaffResting: (id: string, resting: boolean) => patchGame((g) => setStaffResting(g, id, resting)),
  trainStaff: (id: string) => patchGame((g) => trainStaff(g, id)),
  startResearch: (id: string) => patchGame((g) => startResearch(g, id)),
  buyPerk: (id: string) => patchGame((g) => buyPerk(g, id)),
  convertCashToPrestige: (n = 1) => patchGame((g) => convertCashToPrestige(g, n)),
  acceptContract: (offerId: string) => patchGame((g) => acceptContract(g, offerId)),
  buyoutRival: () => patchGame((g) => buyoutRival(g)),
  moveLocation: (id: string) => patchGame((g) => moveLocation(g, id)),
  unlockLocation: (id: string) => patchGame((g) => unlockLocation(g, id)),
  takeLoan: (amt: number) => patchGame((g) => takeLoan(g, amt)),
  repayLoan: (amt: number) => patchGame((g) => repayLoan(g, amt)),

  // --- committing a simulated day (called by the game loop) ---
  commitDay(nextGame: GameState, result: DayResult) {
    store.setState((s) => ({
      ...s,
      game: nextGame,
      lastResult: result,
      screen: "results",
    }));
    saveGame(nextGame, Date.now()); // immediate save at the day boundary
  },

  // --- save management ---
  exportSave() {
    exportSave(store.getState().game);
  },
  async importSave() {
    const game = await importSaveFromFile();
    if (!game) {
      actions.toast("Couldn't read that save file.");
      return;
    }
    store.setState((s) => ({ ...s, screen: "planning", game, lastResult: null, toast: "Save loaded! 🍋", settingsOpen: false }));
  },
};
