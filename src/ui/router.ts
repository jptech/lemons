/** Screen router — re-renders the active screen when the store changes. */
import { store, type AppState } from "../store/gameStore";
import { getSettings } from "../store/settings";
import { mount, root } from "./dom";
import { runEnterEffects } from "./anim";
import { renderMenu } from "./screens/menu";
import { renderPlanning } from "./screens/planning";
import { renderSimulation } from "./screens/simulation";
import { renderResults } from "./screens/results";
import { renderAnalytics } from "./screens/analytics";
import { renderSettingsModal } from "./screens/settings";

type Renderer = (s: AppState) => HTMLElement;

const screens: Record<AppState["screen"], Renderer> = {
  menu: renderMenu,
  planning: renderPlanning,
  simulation: renderSimulation,
  results: renderResults,
  analytics: renderAnalytics,
};

let lastScreen: AppState["screen"] | null = null;

export function startRouter() {
  const rerender = (s: AppState) => {
    const screenChanged = s.screen !== lastScreen;
    const el = (screens[s.screen] ?? renderPlanning)(s);
    const overlay = s.settingsOpen ? renderSettingsModal(s) : null;
    mount(root(), el, overlay);

    if (screenChanged) {
      if (!getSettings().reducedMotion) el.classList.add("screen--enter");
      runEnterEffects(el);
    }
    lastScreen = s.screen;
  };
  store.subscribe(rerender);
  rerender(store.getState());
}

export function currentScreen() {
  return lastScreen;
}
