import "./styles/fonts.css";
import "./styles/reset.css";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/components.css";

import { startRouter } from "./ui/router";
import { actions, store } from "./store/gameStore";
import { simulateDay, type GameState } from "./engine";
import { EQUIPMENT } from "./data/equipment";
import type { Settings } from "./store/settings";

startRouter();

// Mirror the reduced-motion setting onto <body> so pure CSS can gate animations.
function syncReducedMotion(on: boolean) {
  document.body.classList.toggle("reduced-motion", on);
}
syncReducedMotion(store.getState().settings.reducedMotion);
store.subscribe((s) => syncReducedMotion(s.settings.reducedMotion));

// Dev/debug handle — lets the console (and tooling) drive the store directly.
// `debug` is UI-side only: it patches the store with plain spreads (no engine writes).
type Condition = GameState["weatherToday"]["condition"];

function patchGame(fn: (g: GameState) => GameState) {
  store.setState((s) => ({ ...s, game: fn(s.game) }));
}

const debug = {
  forceWeather(condition: Condition, tempF = 75) {
    patchGame((g) => ({
      ...g,
      weatherToday: { condition, tempF, forecast: { condition, tempF } },
    }));
  },
  setLocation(id: string) {
    patchGame((g) => ({
      ...g,
      currentLocationId: id,
      unlockedLocationIds: g.unlockedLocationIds.includes(id)
        ? g.unlockedLocationIds
        : [...g.unlockedLocationIds, id],
    }));
  },
  grantEquipment(...ids: string[]) {
    patchGame((g) => ({
      ...g,
      ownedEquipmentIds: [...new Set([...g.ownedEquipmentIds, ...ids])],
    }));
  },
  grantAllEquipment() {
    debug.grantEquipment(...EQUIPMENT.map((e) => e.id));
  },
  hireStaff(tier: 1 | 2 | 3 = 1) {
    actions.hireStaff(tier);
  },
  addCash(n: number) {
    patchGame((g) => ({ ...g, cash: g.cash + n }));
  },
  setSettings(patch: Partial<Settings>) {
    actions.setSetting(patch);
  },
};

(globalThis as unknown as { __lemon?: unknown }).__lemon = { store, actions, simulateDay, debug };
