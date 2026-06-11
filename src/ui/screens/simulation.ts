/** Live "open for business" screen: animated canvas stand + HUD + speed control. */
import { actions, type AppState } from "../../store/gameStore";
import { getSettings } from "../../store/settings";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { SimController, type Speed } from "../../loop/gameLoop";
import { derive, inventoryQty, type SimSnapshot } from "../../engine";
import { PRODUCT_BY_ID } from "../../data/products";
import { h } from "../dom";
import { button } from "../components";
import { flashClass } from "../anim";
import { clock, money, moneyShort } from "../format";
import { StandView, buildSceneContext } from "./stand/standView";

type StockKey = "lemon" | "sugar" | "ice" | "cup";
const STOCK_ITEMS: { key: StockKey; icon: string }[] = [
  { key: "lemon", icon: "🍋" },
  { key: "sugar", icon: "🍬" },
  { key: "ice", icon: "🧊" },
  { key: "cup", icon: "🥤" },
];

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

  let skipped = false;
  const speedbar = h("div.speedbar", {}, [
    mkSpeed("⏸", 0),
    mkSpeed("🐢 ½×", 0.5),
    mkSpeed("▶ 1×", 1),
    mkSpeed("⏩ 2×", 2),
    mkSpeed("⏭ 4×", 4),
    h("div.spacer", {}),
    button("Skip to end  ⏭️", () => {
      skipped = true;
      active?.skip();
    }, { size: "sm", variant: "sky" }),
  ]);

  // Live stock readout (drains through the day; ice shows a maker badge).
  const iceRegen = derive(game).iceRegenPerMin > 0;
  const gauges = STOCK_ITEMS.map((it) => {
    const initial = Math.max(1, inventoryQty(game, it.key));
    const countEl = h("span.stockgauge__count.num", {}, String(Math.floor(inventoryQty(game, it.key))));
    const fillEl = h("div.meter__fill", { style: { width: "100%", background: "var(--c-mint)" } });
    const el = h("div.stockgauge", {}, [
      h("div.stockgauge__head", {}, [
        h("span.stockgauge__icon", {}, it.icon),
        countEl,
        it.key === "ice" && iceRegen ? h("span.stockgauge__regen", { title: "Ice maker is topping up your ice" }, "⚙️") : null,
      ]),
      h("div.meter.stockgauge__bar", {}, [fillEl]),
    ]);
    return { key: it.key, initial, countEl, fillEl, el };
  });
  const stockStrip = h("div.sim__stock", {}, [
    h("span.sim__stock-label.muted", {}, "Stock"),
    ...gauges.map((g) => g.el),
  ]);

  // Per-product live stats (only when more than one drink is on the menu).
  const showProducts = game.menu.length > 1;
  const productEls = showProducts
    ? game.menu.map((id) => {
        const def = PRODUCT_BY_ID[id];
        const soldEl = h("span.num", {}, "0");
        const poolEl = h("span.num", {}, "0");
        const el = h("div.simprod", {}, [
          h("span.simprod__icon", {}, def?.icon ?? "🥤"),
          h("span.simprod__name", {}, def?.name ?? id),
          h("span.simprod__stat", {}, [soldEl, h("span.muted", {}, " sold")]),
          h("span.simprod__stat", {}, [poolEl, h("span.muted", {}, " ready")]),
        ]);
        return { id, soldEl, poolEl, el };
      })
    : [];
  const productStrip = showProducts
    ? h("div.sim__products", {}, [h("span.sim__stock-label.muted", {}, "Menu"), ...productEls.map((p) => p.el)])
    : null;

  const el = h(`main.screen.sim.sim--${game.weatherToday.condition}`, {}, [
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
    stockStrip,
    productStrip,
    speedbar,
  ]);

  // Per-gauge depletion stage, so warning pulses fire once per threshold crossing.
  const gaugeStage = new Map<StockKey, "ok" | "low" | "out">();
  // Page dusk tint, updated at most every ~2 sim-minutes (never per frame).
  let lastTodBucket = -1;

  // Start once the canvas is in the DOM (so it has a measured size).
  requestAnimationFrame(() => {
    view = new StandView(canvas, buildSceneContext(game), getSettings());
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
        const todBucket = Math.floor(snap.minute / 2);
        if (todBucket !== lastTodBucket) {
          lastTodBucket = todBucket;
          el.style.setProperty("--tod", (snap.minute / snap.openMinutes).toFixed(3));
        }
        for (const g of gauges) {
          const cur = snap.stock[g.key];
          g.countEl.textContent = String(cur);
          const f = Math.max(0, Math.min(1, cur / g.initial));
          g.fillEl.style.width = `${f * 100}%`;
          g.fillEl.style.background = f < 0.12 ? "var(--c-coral)" : f < 0.35 ? "var(--c-sun)" : "var(--c-mint)";
          // one-shot warning pulses on threshold crossings (never per frame)
          const stage = cur <= 0 ? "out" : f < 0.12 ? "low" : "ok";
          if (stage !== (gaugeStage.get(g.key) ?? "ok")) {
            gaugeStage.set(g.key, stage);
            g.el.classList.toggle("stockgauge--out", stage === "out");
            if (stage !== "ok") flashClass(g.el, "pulse", 500);
          }
        }
        for (const p of productEls) {
          const sp = snap.products.find((x) => x.id === p.id);
          if (sp) {
            p.soldEl.textContent = String(sp.sold);
            p.poolEl.textContent = String(sp.pool);
          }
        }
      },
      onDone: (sim) => {
        const { state, result } = sim.finalize();
        const finish = () => {
          teardown();
          actions.commitDay(state, result);
        };
        // A short dusk beat — queue disperses, sign flips to CLOSED — before
        // the recap. Skipped days and reduced motion commit immediately.
        if (skipped || getSettings().reducedMotion || !view) return finish();
        const closeStart = performance.now();
        const tick = (now: number) => {
          if (!view) return finish();
          view.renderClosing(now);
          if (now - closeStart < 1100) requestAnimationFrame(tick);
          else finish();
        };
        requestAnimationFrame(tick);
      },
    });
    setSpeed(getSettings().defaultSpeed);
    active.start();
  });

  return el;
}

function hudStat(icon: string, valueEl: HTMLElement): HTMLElement {
  return h("div.hud__stat", {}, [h("span", {}, icon), valueEl]);
}
