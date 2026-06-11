/** Title / mode-select screen. */
import { actions, type AppState } from "../../store/gameStore";
import { hasSave } from "../../persistence/saveLoad";
import { BRAND } from "../../data/brand";
import { h } from "../dom";
import { button } from "../components";
import { money } from "../format";

export function renderMenu(s: AppState): HTMLElement {
  const canContinue = hasSave() && s.game.day > 1;
  const g = s.game;

  // Title letters pop in one by one (pure CSS; instant under reduced motion).
  const titleLetters = [...BRAND.name].map((ch, i) =>
    h("span.menu__letter", { style: `animation-delay: ${i * 40}ms` }, ch === " " ? " " : ch),
  );

  return h("main.screen.menu", {}, [
    h("div.menu__hero", {}, [
      h("div.menu__rays", {}),
      h("div.menu__logo", {}, BRAND.mascot),
      h("h1.menu__title", {}, titleLetters),
      h("p.menu__tag", {}, BRAND.tagline),
    ]),
    h("div.menu__street", {}, [
      h("span.menu__stroller.menu__stroller--a", {}, "🚶"),
      h("span.menu__stroller.menu__stroller--b", {}, "🧒"),
      h("span.menu__stroller.menu__stroller--c", {}, "🐕"),
    ]),
    h("div.menu__cards", {}, [
      canContinue
        ? menuCard("▶️", "Continue", `${g.mode === "campaign" ? "Campaign" : "Sandbox"} · Day ${g.day} · ${money(g.cash)}`, () => actions.continueGame(), "mint")
        : null,
      menuCard("🎯", "New Campaign", "Chase goals from a roadside stand to a lemonade empire.", () => actions.startNewGame("campaign"), "sun"),
      menuCard("🏖️", "New Sandbox", "Endless, open-ended play. Build your stand your way.", () => actions.startNewGame("sandbox"), "sky"),
      menuCard("⬆️", "Load Save", "Import a save file from your device.", () => void actions.importSave(), "ghost"),
    ]),
    h("div.menu__links", {}, [
      h("button.menu__link", { onClick: () => actions.openSettings() }, "⚙️ Settings"),
    ]),
    h("p.menu__foot.muted", {}, "Tip: hot, sunny days sell the most — stock extra ice and watch the forecast."),
  ]);
}

function menuCard(icon: string, title: string, blurb: string, onClick: () => void, variant: "sun" | "sky" | "mint" | "ghost"): HTMLElement {
  return h("button.menucard." + (variant === "ghost" ? "menucard--ghost" : `menucard--${variant}`), { onClick }, [
    h("span.menucard__icon", {}, icon),
    h("div.menucard__text", {}, [h("strong", {}, title), h("span.small", {}, blurb)]),
  ]);
}
