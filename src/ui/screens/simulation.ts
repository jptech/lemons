/** Live "open for business" screen: animated canvas stand + HUD + speed control. */
import { actions, type AppState } from "../../store/gameStore";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { SimController, type Speed } from "../../loop/gameLoop";
import type { SimSnapshot } from "../../engine";
import { h } from "../dom";
import { button } from "../components";
import { clock, money, moneyShort } from "../format";
import { StandView } from "./standView";

let active: SimController | null = null;
let view: StandView | null = null;
let onResize: (() => void) | null = null;

function teardown() {
  active?.destroy();
  active = null;
  view = null;
  if (onResize) window.removeEventListener("resize", onResize);
  onResize = null;
}

export function renderSimulation(s: AppState): HTMLElement {
  teardown();
  const game = s.game;

  const canvas = h("canvas.stand", {}) as HTMLCanvasElement;

  // HUD refs we mutate directly each frame (no store churn).
  const clockEl = h("strong.hud__clock", {}, "9:00 AM");
  const cashEl = h("span.num", {}, moneyShort(game.cash));
  const cupsEl = h("span.num", {}, "0");
  const servedEl = h("span.num", {}, "0");
  const lostEl = h("span.num", {}, "0");
  const progressFill = h("div.meter__fill", { style: { width: "0%", background: "var(--c-sun)" } });

  const speedButtons: Record<number, HTMLElement> = {};
  const mkSpeed = (label: string, sp: Speed) => {
    const b = button(label, () => setSpeed(sp), { size: "sm", variant: "ghost" });
    speedButtons[sp] = b;
    return b;
  };
  function setSpeed(sp: Speed) {
    active?.setSpeed(sp);
    for (const [k, el] of Object.entries(speedButtons)) {
      el.classList.toggle("is-active", Number(k) === sp);
    }
  }

  const speedbar = h("div.speedbar", {}, [
    mkSpeed("⏸", 0),
    mkSpeed("🐢 ½×", 0.5),
    mkSpeed("▶ 1×", 1),
    mkSpeed("⏩ 2×", 2),
    mkSpeed("⏭ 4×", 4),
    h("div.spacer", {}),
    button("Skip to end  ⏭️", () => active?.skip(), { size: "sm", variant: "sky" }),
  ]);

  const el = h("main.screen.sim", {}, [
    h("div.sim__stage", {}, [
      canvas,
      h("div.hud", {}, [
        h("div.hud__left", {}, [
          clockEl,
          h("span.hud__weather", {}, `${WEATHER_ICON[game.weatherToday.condition]} ${WEATHER_LABEL[game.weatherToday.condition]}`),
        ]),
        h("div.hud__stats", {}, [
          hudStat("💰", cashEl),
          hudStat("🥤", cupsEl),
          hudStat("😊", servedEl),
          hudStat("💨", lostEl),
        ]),
      ]),
      h("div.hud__progress", {}, [h("div.meter", {}, [progressFill])]),
    ]),
    speedbar,
  ]);

  // Start once the canvas is in the DOM (so it has a measured size).
  requestAnimationFrame(() => {
    view = new StandView(canvas, game.weatherToday);
    onResize = () => view?.resize();
    window.addEventListener("resize", onResize);

    active = new SimController(game, {
      onFrame: (snap: SimSnapshot, events) => {
        view?.render(snap, events, performance.now());
        clockEl.textContent = clock(snap.minute);
        cashEl.textContent = moneyShort(snap.cash);
        cupsEl.textContent = String(snap.cupsSold);
        servedEl.textContent = String(snap.served);
        lostEl.textContent = String(snap.lost);
        progressFill.style.width = `${(snap.minute / snap.openMinutes) * 100}%`;
      },
      onDone: (sim) => {
        const { state, result } = sim.finalize();
        teardown();
        actions.commitDay(state, result);
      },
    });
    setSpeed(1);
    active.start();
  });

  return el;
}

function hudStat(icon: string, valueEl: HTMLElement): HTMLElement {
  return h("div.hud__stat", {}, [h("span", {}, icon), valueEl]);
}
