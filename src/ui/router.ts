/** Screen router — re-renders the active screen when the store changes. */
import { store, type AppState } from "../store/gameStore";
import { mount, root } from "./dom";
import { renderMenu } from "./screens/menu";
import { renderPlanning } from "./screens/planning";
import { renderSimulation } from "./screens/simulation";
import { renderResults } from "./screens/results";
import { renderAnalytics } from "./screens/analytics";

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
    const render = screens[s.screen] ?? renderPlanning;
    mount(root(), render(s));
    lastScreen = s.screen;
  };
  store.subscribe(rerender);
  rerender(store.getState());
}

export function currentScreen() {
  return lastScreen;
}
