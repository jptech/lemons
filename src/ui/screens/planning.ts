import { actions, type AppState } from "../../store/gameStore";
import { getSettings } from "../../store/settings";
import * as sel from "../../store/selectors";
import { EQUIPMENT_LINES } from "../../data/equipment";
import { RESEARCH_NODES } from "../../data/research";
import { STAFF_TIERS } from "../../data/staff";
import { MARKETING_TIERS } from "../../data/marketing";
import { LOCATIONS } from "../../data/locations";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { EVENT_BY_ID } from "../../data/events";
import { GOALS } from "../../data/goals";
import {
  activeProducts,
  derive,
  effectiveStaffBonus,
  equipmentStatus,
  idealRecipe,
  itemBuyPrice,
  itemHasPremium,
  inventoryQty,
  maxBuyable,
  menuCap,
  nextBulkTier,
  nextLevelXp,
  nextPrestigeCost,
  perkStatus,
  primaryProductId,
  productStateOf,
  productTaste,
  recipeQuality,
  researchStatus,
  TUNING,
  type GameState,
  type ItemGrade,
  type ItemId,
  type ProductId,
  type Recipe,
} from "../../engine";
import { PRODUCTS, PRODUCT_BY_ID } from "../../data/products";
import { PERKS } from "../../data/perks";
import { CONTRACT_BY_ID, statValue, contractObjective } from "../../data/contracts";
import { h, type Child } from "../dom";
import { bar, button, panel, pill, slider, statBlock } from "../components";
import { flashClass } from "../anim";
import { money, moneyShort, moneyWhole, pct } from "../format";

// One-shot "flash this on next render" note — a purchase re-renders the whole
// screen, so the click handler records a key and the next render consumes it
// by playing a success flash on the re-rendered element.
let pendingFlash: string | null = null;
function flashOnNextRender(key: string): void {
  pendingFlash = key;
}
function consumeFlash(key: string, el: HTMLElement): HTMLElement {
  if (pendingFlash === key) {
    pendingFlash = null;
    flashClass(el, "flash-success", 600);
  }
  return el;
}

const STOCK_ROWS: { item: ItemId; icon: string; name: string; note: (g: GameState) => string }[] = [
  {
    item: "lemon",
    icon: "🍋",
    name: "Lemons",
    note: (g) => {
      const d = sel.lemonDaysLeft(g);
      return d === null ? `last ${TUNING.LEMON_SHELF_LIFE} days` : d <= 1 ? "use today!" : `freshest ${d} days left`;
    },
  },
  { item: "sugar", icon: "🍬", name: "Sugar", note: () => "never spoils" },
  {
    item: "ice",
    icon: "🧊",
    name: "Ice",
    note: (g) => {
      const ret = derive(g).iceRetention;
      const base = ret > 0 ? `keeps ${Math.round(ret * 100)}% overnight` : "melts overnight";
      const made = sel.dailyIceProduction(g);
      return made > 0 ? `${base} · ❄️ +${made} made today` : base;
    },
  },
  { item: "cup", icon: "🥤", name: "Cups", note: () => "never spoils" },
];

export function renderPlanning(s: AppState): HTMLElement {
  const g = s.game;
  return h("main.screen.planning", {}, [
    topbar(g),
    s.toast ? h("div.toast", {}, s.toast) : null,
    insightPanel(g),
    // Fixed columns (independent stacks) — cards never jump between columns, so
    // changing one card's height (e.g. a Grow tab) doesn't reflow the others.
    h("div.dashboard", {}, [
      h("div.dashboard__col", {}, [recipePanel(g), marketingPanel(g)]),
      h("div.dashboard__col", {}, [stockPanel(g), reputationPanel(g)]),
      h("div.dashboard__col", {}, [growPanel(g)]),
    ]),
    financeBar(g),
    openBar(g),
  ]);
}

/** A full-width option button: label on the left, value/price on the right. */
function optionBtn(
  label: Child,
  value: Child,
  onClick: () => void,
  opts: { selected?: boolean; variant?: "sky" | "mint" | "ghost"; disabled?: boolean } = {},
): HTMLElement {
  const cls = ["btn", "opt-btn"];
  cls.push(opts.selected ? "btn--mint" : `btn--${opts.variant ?? "ghost"}`);
  return h(
    "button." + cls.join("."),
    { onClick, disabled: opts.disabled ?? false },
    [h("span.opt-btn__label", {}, label), h("span.opt-btn__value", {}, value)],
  );
}

// ---------------------------------------------------------------------------
let lastCashSeen: number | null = null;

/** The late-game meta-layer (ladder + prestige + perks) is surfaced once the
 *  player has cleared a few base goals, or has already engaged with it. */
function ladderActive(g: GameState): boolean {
  return (
    g.completedGoalIds.length >= TUNING.LADDER_ACTIVATE_GOALS ||
    (g.prestige ?? 0) > 0 ||
    (g.ownedPerkIds?.length ?? 0) > 0
  );
}

function topbar(g: GameState): HTMLElement {
  const loc = sel.currentLocation(g);
  const f = g.weatherToday.forecast;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(g.day - 1) % 7];
  const cashPulse = lastCashSeen !== null && lastCashSeen !== g.cash && !getSettings().reducedMotion;
  lastCashSeen = g.cash;
  return h(`header.topbar.topbar--${f.condition}`, {}, [
    h("div.topbar__brand", {}, [
      h("span.topbar__day", {}, `Day ${g.day}`),
      h("span.muted", {}, dow),
    ]),
    h("div.topbar__loc", {}, [`${loc.icon} ${loc.name}`]),
    h("div.topbar__weather", {}, [
      h("span.topbar__wicon", {}, WEATHER_ICON[f.condition]),
      h("div.col", { style: { gap: "0" } }, [
        h("strong", {}, WEATHER_LABEL[f.condition]),
        h("span.muted.topbar__wconf", {}, `forecast · ${f.tempF}°F`),
      ]),
    ]),
    h("div.spacer", {}),
    h("div.topbar__money", {}, [
      h("div.stat", {}, [
        h("div.stat__label", {}, "Cash"),
        h("div.stat__value.num", { class: `${g.cash < 0 ? "neg" : ""}${cashPulse ? " pulse" : ""}` }, money(g.cash)),
      ]),
      g.debt > 0
        ? h("div.stat", {}, [h("div.stat__label", {}, "Debt"), h("div.stat__value.num.neg", {}, money(g.debt))])
        : null,
      h("div.stat", {}, [
        h("div.stat__label", {}, "Reputation"),
        h("div.stat__value.num", {}, `${Math.round(g.reputationGlobal)}`),
      ]),
      ladderActive(g)
        ? h("div.stat", { title: "Prestige — earn it from the Tycoon ladder, spend it on perks" }, [
            h("div.stat__label", {}, "Prestige"),
            h("div.stat__value.num", {}, `✦ ${Math.round(g.prestige ?? 0)}`),
          ])
        : null,
    ]),
    h("div.topbar__menu", {}, [
      g.mode === "campaign" ? goalChip(g) : null,
      button("📊 Stats", () => actions.goTo("analytics"), { size: "sm", variant: "sky" }),
      h("details.menu-pop", {}, [
        h("summary.menu-pop__btn", {}, "⋯"),
        h("div.menu-pop__list", {}, [
          h("button.menu-pop__item", { onClick: () => actions.openSettings() }, "⚙️ Settings"),
          h("button.menu-pop__item", { onClick: () => actions.exportSave() }, "⬇️ Export save"),
          h("button.menu-pop__item", { onClick: () => void actions.importSave() }, "⬆️ Import save"),
          h("button.menu-pop__item", {
            onClick: () => {
              if (confirm("Start a new game? Your current run will be overwritten.")) actions.goTo("menu");
            },
          }, "🔄 New game"),
        ]),
      ]),
    ]),
  ]);
}

function goalChip(g: GameState): Child {
  const next = GOALS.find((goal) => !g.completedGoalIds.includes(goal.id));
  if (!next) return pill("🏆 Campaign complete!");
  return h("span.pill.goal-chip", { title: next.desc }, [`🎯 ${next.title}`]);
}

// ---------------------------------------------------------------------------
const LIMITER_NOTE: Record<sel.SalesLimiter, string> = {
  crowd: "limited by demand",
  capacity: "limited by staff/speed",
  stock: "limited by stock",
};

function confidenceWord(c: number): string {
  if (c > 0.66) return "fairly confident";
  if (c > 0.33) return "rough estimate";
  return "very rough guess";
}

function insightPanel(g: GameState): HTMLElement {
  const f = sel.salesForecast(g);
  const quality = sel.recipeQualityHint(g);
  const ph = sel.pricingHint(g);
  const costs = sel.fixedCostsToday(g);
  const event = g.activeEventId ? EVENT_BY_ID[g.activeEventId] : undefined;
  const priceClass = ph.verdict === "pricey" ? "neg" : ph.verdict === "raise" ? "pos" : "muted";

  return h("section.panel.insight", {}, [
    event
      ? h("div.event-banner", {}, [h("span", {}, event.icon), h("div", {}, [h("strong", {}, event.title), h("div.muted", {}, event.blurb)])])
      : null,
    h("div.grid.grid--stats", {}, [
      statBlock("Expected crowd", `~${f.crowdLow}–${f.crowdHigh}`, confidenceWord(f.confidence)),
      statBlock("Likely sales", `~${f.low}–${f.high}`, h("span", { class: f.limiter === "crowd" ? "muted" : "neg" }, LIMITER_NOTE[f.limiter])),
      statBlock("Projected take", `${moneyShort(f.revenueLow)}–${moneyShort(f.revenueHigh)}`, `before ${moneyShort(costs.total)} costs`),
      statBlock("Recipe match", pct(quality), qualityHint(g, primaryProductId(g))),
      statBlock("Your price", money(productStateOf(g, primaryProductId(g)).recipe.pricePerCup), h("span", { class: priceClass }, ph.text)),
    ]),
  ]);
}

function facetColor(v: number): string {
  return v > 62 ? "var(--c-mint)" : v > 38 ? "var(--c-sun)" : "var(--c-coral)";
}

/** Reputation as four diagnosable facets + a plain-language weak-spot nudge. */
function reputationPanel(g: GameState): HTMLElement {
  const facets = sel.repFacetViews(g);
  const weak = sel.repWeakSpot(g);
  const rows = facets.map((f) => {
    const arrow =
      f.delta > 0.3 ? h("span.rep-facet__arrow.pos", {}, "▲")
      : f.delta < -0.3 ? h("span.rep-facet__arrow.neg", {}, "▼")
      : h("span.rep-facet__arrow.muted", {}, "·");
    const meter = bar(f.value / 100, facetColor(f.value), `rep:${f.label}`);
    meter.classList.add("rep-facet__meter");
    return h("div.rep-facet", { title: f.tip }, [
      h("span.rep-facet__icon", {}, f.icon),
      h("span.rep-facet__label", {}, f.label),
      meter,
      h("span.rep-facet__val.num", {}, `${Math.round(f.value)}`),
      arrow,
    ]);
  });
  const children: Child[] = [
    h("p.muted.small", {}, "Four sides of your name — each grows from a different thing and pulls a different lever."),
    h("div.rep-facets", {}, rows),
  ];
  if (weak) {
    children.push(
      h("div.rep-weakspot", {}, [
        h("strong", {}, `${weak.icon} Focus on ${weak.label}`),
        h("span.muted", {}, ` — ${weak.tip}`),
      ]),
    );
  }
  return panel("🏅", "Reputation", ...children);
}

function qualityHint(g: GameState, productId: ProductId): string {
  const ideal = idealRecipe(sel.forecastWeather(g), productTaste(productId));
  const r = productStateOf(g, productId).recipe;
  const sum = r.lemons + r.sugar + r.ice || 1;
  const have: [number, number, number] = [r.lemons / sum, r.sugar / sum, r.ice / sum];
  const names = ["lemon", "sugar", "ice"] as const;
  let worstI = 0;
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    const d = have[i]! - ideal.vec[i]!;
    if (Math.abs(d) > Math.abs(worst)) {
      worst = d;
      worstI = i;
    }
  }
  if (Math.abs(worst) < 0.04) return "crowd will love it!";
  return `${worst > 0 ? "less" : "more"} ${names[worstI]} today`;
}

// ---------------------------------------------------------------------------
function qColor(q: number): string {
  return q > 0.7 ? "var(--c-mint)" : q > 0.45 ? "var(--c-sun)" : "var(--c-coral)";
}

/** The Menu panel: a recipe+price editor per active product, plus add/remove. */
function recipePanel(g: GameState): HTMLElement {
  const editors = activeProducts(g).map((ap) => productEditor(g, ap.id));
  return panel("🧪", g.menu.length > 1 ? "Menu & Recipes" : "Recipe & Price", ...editors, menuManager(g));
}

function productEditor(g: GameState, productId: ProductId): HTMLElement {
  const def = PRODUCT_BY_ID[productId]!;
  const r = productStateOf(g, productId).recipe;
  const wx = sel.forecastWeather(g);
  const taste = productTaste(productId);
  const live: Recipe = { ...r };
  const multi = g.menu.length > 1;
  const isPrimary = primaryProductId(g) === productId;

  // Live quality preview that updates during a drag (no store write).
  const qFill = h("div.meter__fill", {}) as HTMLElement;
  const qLabel = h("span.num", {}) as HTMLElement;
  const paintQuality = () => {
    const q = recipeQuality(live, wx, undefined, taste);
    qFill.style.width = `${Math.max(0, Math.min(1, q)) * 100}%`;
    qFill.style.background = qColor(q);
    qLabel.textContent = pct(q);
  };
  paintQuality();

  const part = (key: "lemons" | "sugar" | "ice" | "water", label: string, icon: string, min: number, max: number) =>
    slider({
      label,
      icon,
      min,
      max,
      value: r[key],
      onLive: (v) => {
        live[key] = v;
        paintQuality();
      },
      onInput: (v) => actions.setRecipe({ [key]: v }, productId),
    });

  const share = multi ? sel.productSplit(g).find((s) => s.id === productId)?.fraction ?? 0 : 0;
  const header = multi
    ? h("div.product-head", {}, [
        h("strong", {}, `${def.icon} ${def.name}`),
        h("span.product-share.muted", { title: "Expected share of today's sales" }, `~${Math.round(share * 100)}% of sales`),
        isPrimary
          ? h("span.pill.product-tag", {}, "primary")
          : button("✕ Remove", () => actions.toggleMenuProduct(productId), { size: "sm", variant: "ghost" }),
      ])
    : null;

  return h(multi ? "div.product-editor" : "div", {}, [
    header,
    part("lemons", "Lemons", "🍋", 0, 10),
    part("sugar", "Sugar", "🍬", 0, 10),
    part("ice", "Ice", "🧊", 0, 10),
    part("water", "Water", "💧", 1, 16),
    h("div.recipe__quality", {}, [
      h("div.row.row--between", {}, [h("span.muted", {}, "Quality vs forecast"), qLabel]),
      h("div.meter", {}, [qFill]),
    ]),
    recipeFeedbackBox(g, productId),
    slider({
      label: "Price per cup",
      icon: "💵",
      min: 0.25,
      max: 6,
      step: 0.05,
      value: r.pricePerCup,
      onInput: (v) => actions.setPrice(v, productId),
      format: (v) => money(v),
    }),
    pricingHintLine(g, productId),
  ]);
}

/** Add/remove the optional products (cap grows with menu-slot perks). */
function menuManager(g: GameState): Child {
  const offMenu = PRODUCTS.filter((p) => !g.menu.includes(p.id));
  if (!offMenu.length) return null;
  const cap = menuCap(g);
  const atCap = g.menu.length >= cap;
  return h("div.menu-manager", {}, [
    h("p.muted.small", {}, atCap ? `Menu full (${cap}). Remove a drink to swap, or unlock a menu slot in Perks.` : "Add another drink to widen your appeal — it splits your crew's time, so it's a trade-off."),
    ...offMenu.map((p) =>
      h("div.menu-add" + (atCap ? ".menu-add--off" : ""), {}, [
        h("div.menu-add__info", {}, [
          h("strong.menu-add__name", {}, `${p.icon} ${p.name}`),
          h("span.menu-add__blurb.muted.small", {}, p.blurb),
        ]),
        button(atCap ? "Full" : "+ Add", () => actions.toggleMenuProduct(p.id), {
          size: "sm",
          variant: "sky",
          disabled: atCap,
        }),
      ]),
    ),
  ]);
}

function pricingHintLine(g: GameState, productId: ProductId): HTMLElement {
  const ph = sel.pricingHint(g, productId);
  const icon = ph.verdict === "raise" ? "📈" : ph.verdict === "pricey" ? "💸" : "👍";
  const cls = ph.verdict === "pricey" ? "neg" : ph.verdict === "raise" ? "pos" : "muted";
  return h("p.price-hint", { class: cls }, `${icon} ${ph.text}`);
}

/** Persistent, learned guidance from recent customer reviews (per product). */
function recipeFeedbackBox(g: GameState, productId: ProductId): Child {
  const fb = productStateOf(g, productId).recipeFeedback ?? { lemon: 0, sugar: 0, ice: 0 };
  const TH = 0.035;
  const parts: { key: "lemons" | "sugar" | "ice"; delta: number; word: string }[] = [];
  if (Math.abs(fb.lemon) > TH) parts.push({ key: "lemons", delta: Math.sign(fb.lemon), word: `${fb.lemon > 0 ? "more" : "less"} 🍋 lemon` });
  if (Math.abs(fb.sugar) > TH) parts.push({ key: "sugar", delta: Math.sign(fb.sugar), word: `${fb.sugar > 0 ? "more" : "less"} 🍬 sugar` });
  if (Math.abs(fb.ice) > TH) parts.push({ key: "ice", delta: Math.sign(fb.ice), word: `${fb.ice > 0 ? "more" : "less"} 🧊 ice` });

  if (g.stats.daysPlayed < 1) {
    return h("div.feedbox.muted", {}, "📝 Sell a few days and your guests' tastes will show up here.");
  }
  if (!parts.length) {
    return h("div.feedbox", {}, "📝 Guests love the current recipe — no changes suggested!");
  }
  return h("div.feedbox", {}, [
    h("div", {}, [h("strong", {}, "📝 Guests lately wished for: "), parts.map((p) => p.word).join(", ")]),
    button("✨ Apply suggestion", () => {
      const patch: Partial<Recipe> = {};
      const base = productStateOf(g, productId).recipe;
      for (const p of parts) patch[p.key] = base[p.key] + p.delta;
      actions.setRecipe(patch, productId);
    }, { size: "sm", variant: "mint" }),
  ]);
}

// ---------------------------------------------------------------------------
const ITEM_COLOR: Record<ItemId, string> = {
  lemon: "#ffd43b",
  sugar: "#faa2c1",
  ice: "#74c0fc",
  cup: "#b2f2bb",
};

function itemsPerSlot(item: ItemId): number {
  return Math.round(1 / TUNING.SLOT_COST[item]);
}

/** Per-item grade the buy buttons use (UI-only; resets are harmless). */
const selectedGrade: Partial<Record<ItemId, ItemGrade>> = {};

const TREND_ICON: Record<sel.PriceTrend["dir"], string> = { up: "▲", down: "▼", flat: "▬" };

function stockPanel(g: GameState): HTMLElement {
  const st = sel.storage(g);
  const frac = st.used / st.capacity;

  // Segmented storage bar — see at a glance what's filling your space.
  const segments = STOCK_ROWS.map((row) => {
    const slots = inventoryQty(g, row.item) * TUNING.SLOT_COST[row.item];
    return h("div.segbar__seg", { style: { width: `${(slots / st.capacity) * 100}%`, background: ITEM_COLOR[row.item] }, title: `${row.name}: ${slots.toFixed(1)} slots` });
  });

  return panel(
    "📦",
    "Stock",
    h("div.storage", {}, [
      h("div.row.row--between", {}, [
        h("span.muted.small", {}, "Storage"),
        h("span.num.storage__count", { class: frac > 0.92 ? "neg" : "" }, [
          `${Math.round(st.used)}`,
          h("span.muted", {}, ` / ${st.capacity} slots`),
        ]),
      ]),
      h(
        "div.segbar",
        { title: STOCK_ROWS.map((r) => `${r.name}: ${itemsPerSlot(r.item)}/slot`).join("  ·  ") },
        segments,
      ),
    ]),
    h("div.stocklist", {}, STOCK_ROWS.map((row) => stockRow(g, row))),
  );
}

function stockRow(g: GameState, row: (typeof STOCK_ROWS)[number]): HTMLElement {
  const have = inventoryQty(g, row.item);
  const hasPremium = itemHasPremium(row.item);
  const grade: ItemGrade = (hasPremium && selectedGrade[row.item]) || "standard";
  const price = itemBuyPrice(g, row.item, grade);
  const slotsUsed = have * TUNING.SLOT_COST[row.item];
  const byGrade = sel.inventoryByGrade(g, row.item);
  const eventSpiked =
    row.item === "lemon" &&
    g.activeEventId != null &&
    (EVENT_BY_ID[g.activeEventId]?.effect.lemonPriceMult ?? 1) > 1;
  const trend = sel.priceTrend(g, row.item);
  const spoils = sel.spoilTonight(g, row.item);

  // Bulk hint: the next quantity that earns a discount.
  const nextTier = nextBulkTier(have);
  const canFitTier = nextTier && maxBuyable(g, row.item, grade) >= nextTier.min - have;

  const trendChip =
    trend.dir === "flat"
      ? null
      : h("span.price-trend", { class: trend.dir === "up" ? "neg" : "pos", title: `${Math.abs(Math.round(trend.pctFromNormal))}% ${trend.dir === "up" ? "above" : "below"} normal` },
          `${TREND_ICON[trend.dir]} ${Math.abs(Math.round(trend.pctFromNormal))}%`);

  const gradeToggle = hasPremium
    ? h("div.grade-toggle", {}, [
        gradeBtn(row.item, "standard", grade),
        gradeBtn(row.item, "premium", grade),
      ])
    : null;

  // Compact meta: freshness/spoilage · slots (· premium count).
  const metaBits: Child[] = [h("span", {}, row.note(g)), h("span.dotsep", {}, "·"), h("span", {}, `${slotsUsed.toFixed(1)} slots`)];
  if (hasPremium && byGrade.premium > 0) {
    metaBits.push(h("span.dotsep", {}, "·"), h("span.grade-split__prem", {}, `✨ ${byGrade.premium}`));
  }

  // Tiny trailing note: premium perk or the next bulk break.
  const note =
    grade === "premium"
      ? h("span.stockrow__note.pos", {}, `✨ +${Math.round(TUNING.GRADE_QUALITY_BONUS * 100)}% taste`)
      : canFitTier
        ? h("span.stockrow__note.muted", {}, `${nextTier!.min}+ saves ${Math.round((1 - nextTier!.mult) * 100)}%`)
        : null;

  // Segmented buy bar — one sleek control that spans the row width.
  const buy = (qty: number) => {
    flashOnNextRender(`stock:${row.item}`);
    if (qty > 0) actions.buyStock(row.item, qty, grade);
    else actions.buyMax(row.item, grade);
  };
  const buyBar = h("div.buybar", {}, [
    h("button.buybar__btn", { onClick: () => actions.discardStock(row.item, 10), disabled: have <= 0 }, "−10"),
    h("button.buybar__btn", { onClick: () => buy(10) }, "+10"),
    h("button.buybar__btn", { onClick: () => buy(50) }, "+50"),
    h("button.buybar__btn.buybar__btn--max", { onClick: () => buy(0) }, "Max"),
  ]);

  return consumeFlash(`stock:${row.item}`, h("div.stockrow", {}, [
    h("div.stockrow__head", {}, [
      h("span.stock__dot", { style: { background: ITEM_COLOR[row.item] } }),
      h("span.stockrow__name", {}, `${row.icon} ${row.name}`),
      h("span.stockrow__have.num", {}, `${have}`),
      h("span.stockrow__price", { class: eventSpiked ? "neg" : "" }, [money(price), trendChip]),
    ]),
    h("div.stockrow__meta.muted", {}, [
      h("span.stockrow__metatext", {}, metaBits),
      note,
    ]),
    spoils > 0 ? h("span.spoil-warn", {}, `⚠️ ${spoils} ${row.item === "ice" ? "melt" : "spoil"} tonight`) : null,
    gradeToggle ? h("div.stockrow__controls", {}, [gradeToggle, buyBar]) : buyBar,
  ]));
}

function gradeBtn(item: ItemId, grade: ItemGrade, current: ItemGrade): HTMLElement {
  const label = grade === "premium" ? "✨ Premium" : "Standard";
  return h(
    "button.grade-pill" + (grade === current ? ".grade-pill--on" : ""),
    {
      onClick: () => {
        selectedGrade[item] = grade;
        actions.refresh();
      },
    },
    label,
  );
}

// ---------------------------------------------------------------------------
function marketingPanel(g: GameState): HTMLElement {
  return panel(
    "📣",
    "Marketing",
    h("p.muted.small", {}, "Spend to pull a bigger crowd today and nudge your reputation."),
    h(
      "div.opt-list",
      {},
      MARKETING_TIERS.filter((t) => !t.unlockPerk || g.ownedPerkIds?.includes(t.unlockPerk)).map((t) =>
        optionBtn(
          `${t.icon} ${t.name}`,
          t.spend > 0 ? moneyWhole(t.spend) : "free",
          () => actions.setMarketing(t.spend),
          { selected: g.marketingSpend === t.spend, disabled: t.spend > g.cash + g.marketingSpend },
        ),
      ),
    ),
    awarenessGauge(g),
  );
}

/** Brand-awareness reservoir gauge — the slow stock marketing + delighted
 *  customers build, that lifts demand past the reputation ceiling and fades. */
function awarenessGauge(g: GameState): HTMLElement {
  const aware = g.brand?.awareness ?? 0;
  const frac = aware / TUNING.AWARENESS_MAX;
  const lift = Math.round((Math.min(TUNING.AWARENESS_CAP_MULT, 1 + TUNING.AWARENESS_GAIN * aware) - 1) * 100);
  const read =
    aware < 4 ? "Build it with marketing & happy customers — it lifts demand and fades if you stop."
    : lift >= Math.round((TUNING.AWARENESS_CAP_MULT - 1) * 100) - 1 ? "Maxed — your brand is pulling its biggest crowd."
    : "Compounding from delighted days — keep them happy to grow it.";
  return h("div.awareness", { style: { marginTop: "8px" } }, [
    h("div.row", { style: { display: "flex", justifyContent: "space-between" } }, [
      h("strong.small", {}, "📣 Brand awareness"),
      h("span.small.muted", {}, `+${lift}% demand`),
    ]),
    bar(frac, "var(--c-grape, #9775fa)", "brand:awareness"),
    h("p.muted.small", { style: { marginTop: "4px" } }, read),
  ]);
}

// ---------------------------------------------------------------------------
// "Grow" — a tabbed panel grouping the occasional invest actions (equipment,
// staff, locations) so they don't sprawl across the dashboard.
type GrowTab = "equipment" | "staff" | "research" | "locations" | "perks" | "contracts";
let growTab: GrowTab = "equipment";
let lastGrowTab: GrowTab = growTab;

/** How many things the player could afford to do in each Grow tab right now. */
function growActionCounts(g: GameState): Record<GrowTab, number> {
  const equipment = EQUIPMENT_LINES.filter((line) => {
    const ownedLevel = line.levels.filter((l) => g.ownedEquipmentIds.includes(l.id)).reduce((m, l) => Math.max(m, l.level), 0);
    const next = line.levels.find((l) => l.level === ownedLevel + 1);
    return next != null && equipmentStatus(g, next.id).kind === "buyable";
  }).length;
  const staff =
    (g.staff.length < TUNING.STAFF_CAP ? 1 : 0) +
    (g.cash >= TUNING.STAFF_TRAIN_COST ? g.staff.filter((st) => st.level < TUNING.STAFF_MAX_LEVEL).length : 0);
  const research = g.research?.inProgress
    ? 0
    : RESEARCH_NODES.filter((n) => researchStatus(g, n.id).kind === "buyable").length;
  const locations = LOCATIONS.filter((l) => !g.unlockedLocationIds.includes(l.id) && l.unlockCost <= g.cash).length;
  const perks = PERKS.filter((p) => perkStatus(g, p.id)?.kind === "buyable").length;
  const contracts = g.contracts.active.length < TUNING.CONTRACT_ACTIVE_CAP ? g.contracts.offers.length : 0;
  return { equipment, staff, research, locations, perks, contracts };
}

/** Contracts surface once they're available (or any are in flight). */
function contractsVisible(g: GameState): boolean {
  return g.day >= TUNING.CONTRACTS_UNLOCK_DAY || g.contracts.active.length > 0 || g.contracts.offers.length > 0;
}

function growPanel(g: GameState): HTMLElement {
  const tabs: { id: GrowTab; icon: string; label: string }[] = [
    { id: "equipment", icon: "🛠️", label: "Equipment" },
    { id: "staff", icon: "🧑‍🍳", label: "Staff" },
    { id: "research", icon: "🔬", label: "Research" },
    { id: "locations", icon: "📍", label: "Locations" },
    ...(contractsVisible(g) ? [{ id: "contracts" as GrowTab, icon: "📋", label: "Contracts" }] : []),
    ...(ladderActive(g) ? [{ id: "perks" as GrowTab, icon: "✦", label: "Perks" }] : []),
  ];
  // If the active tab vanished (perks/contracts not yet unlocked), fall back.
  if (!tabs.some((t) => t.id === growTab)) growTab = "equipment";
  const counts = growActionCounts(g);
  const content =
    growTab === "equipment"
      ? equipmentContent(g)
      : growTab === "staff"
        ? staffContent(g)
        : growTab === "research"
          ? researchContent(g)
          : growTab === "perks"
            ? perksContent(g)
            : growTab === "contracts"
              ? contractsContent(g)
              : locationContent(g);
  // Fade the body in only when the tab actually changed (not on every re-render).
  const switched = growTab !== lastGrowTab;
  lastGrowTab = growTab;
  return h("section.panel.grow", {}, [
    h(
      "div.tabbar",
      {},
      tabs.map((t) =>
        h(
          "button.tab" + (t.id === growTab ? ".tab--on" : ""),
          {
            onClick: () => {
              growTab = t.id;
              actions.refresh();
            },
            title: counts[t.id] > 0 ? `${t.label} — ${counts[t.id]} affordable now` : t.label,
          },
          [
            h("span.tab__icon", {}, t.icon),
            h("span.tab__label", {}, t.label),
            counts[t.id] > 0 ? h("span.tab__badge", {}, String(Math.min(counts[t.id], 9))) : null,
          ],
        ),
      ),
    ),
    h("div.grow__body" + (switched ? ".tab-fade" : ""), {}, content),
  ]);
}

function perksContent(g: GameState): Child[] {
  const prestige = Math.round(g.prestige ?? 0);
  const convCost = nextPrestigeCost(g);
  const canConvert = g.cash >= convCost;
  return [
    h("p.muted.small", {}, "Spend Prestige (earned from the Tycoon ladder) on permanent perks that open new decisions."),
    h("div.perk-bank.statblock", {}, [
      h("strong", {}, `✦ ${prestige} Prestige`),
      h("div", { style: { display: "flex", gap: "6px" } }, [
        button(`+1 · ${moneyShort(convCost)}`, () => actions.convertCashToPrestige(1), {
          size: "sm",
          variant: "sky",
          disabled: !canConvert,
        }),
        button("+5", () => actions.convertCashToPrestige(5), {
          size: "sm",
          variant: "sky",
          disabled: !canConvert,
        }),
      ]),
    ]),
    h("p.muted.small", {}, "Convert spare cash into Prestige — the cost rises as you bank more."),
    h(
      "div.shop",
      {},
      PERKS.map((p) => {
        const st = perkStatus(g, p.id);
        let action: Child;
        let rowClass = "";
        let lockText: string | null = null;
        if (st?.kind === "owned") {
          action = pill("✓ owned");
          rowClass = "shop__row--owned";
        } else if (st?.kind === "needsPrev") {
          action = h("span.pill.pill--locked", {}, "🔒");
          rowClass = "shop__row--locked";
          lockText = `Needs ${st.prevName}`;
        } else {
          action = button(`✦ ${p.cost}`, () => {
            flashOnNextRender(`perk:${p.id}`);
            actions.buyPerk(p.id);
          }, { size: "sm", disabled: st?.kind !== "buyable" });
        }
        return consumeFlash(`perk:${p.id}`, h("div.shop__row", { class: rowClass }, [
          h("div.shop__icon", {}, p.icon),
          h("div.shop__info", {}, [
            h("strong", {}, p.name),
            h("div.small.muted", {}, p.blurb),
            lockText ? h("div.shop__lock", {}, `🔒 ${lockText}`) : null,
          ]),
          h("div.shop__action", {}, action),
        ]));
      }),
    ),
  ];
}

function contractsContent(g: GameState): Child[] {
  const cap = TUNING.CONTRACT_ACTIVE_CAP;
  const { active, offers } = g.contracts;
  const slotsFull = active.length >= cap;
  const blocks: Child[] = [
    h("p.muted.small", {}, `Weekly jobs — take up to ${cap} at once. Hit the target before the deadline for cash + Prestige.`),
  ];

  if (active.length) {
    blocks.push(h("div.shop", {}, active.map((c) => {
      const def = CONTRACT_BY_ID[c.defId];
      if (!def) return null;
      const info: Child[] = [h("strong", {}, def.name)];
      if (def.kind === "challenge") {
        const progress = Math.max(0, statValue(g, def.stat) - c.baseline);
        const frac = def.target > 0 ? progress / def.target : 0;
        const daysLeft = c.deadlineDay !== null ? Math.max(0, c.deadlineDay - g.day + 1) : def.days;
        info.push(h("div.small.muted", {}, `${Math.floor(progress)} / ${def.target} · ${daysLeft}d left`));
        info.push(bar(frac, "var(--c-mint, #51cf66)", `contract:${c.id}`));
      } else {
        const dueIn = c.deadlineDay !== null ? c.deadlineDay - g.day : def.leadDays;
        const when = dueIn <= 0 ? "due today!" : `due in ${dueIn}d`;
        info.push(h("div.small.muted", {}, `Cater ${def.cups} cups @ $${def.pricePerCup.toFixed(2)} · ${when}`));
      }
      return h("div.shop__row", {}, [
        h("div.shop__icon", {}, def.icon),
        h("div.shop__info", {}, info),
        h("div.shop__action", {}, pill(`💵${def.rewardCash} · ✦${def.rewardPrestige}`)),
      ]);
    }).filter(Boolean) as Child[]));
  }

  if (offers.length) {
    blocks.push(h("p.muted.small", {}, slotsFull ? "Slots full — finish or wait out an active job to take a new one." : "This week's offers:"));
    blocks.push(h("div.shop", {}, offers.map((o) => {
      const def = CONTRACT_BY_ID[o.defId];
      if (!def) return null;
      return h("div.shop__row", {}, [
        h("div.shop__icon", {}, def.icon),
        h("div.shop__info", {}, [
          h("strong", {}, def.name),
          h("div.small.muted", {}, `${contractObjective(def)} → 💵${def.rewardCash} + ✦${def.rewardPrestige}`),
        ]),
        h("div.shop__action", {}, button("Accept", () => actions.acceptContract(o.id), { size: "sm", variant: "sky", disabled: slotsFull })),
      ]);
    }).filter(Boolean) as Child[]));
  } else if (!active.length) {
    blocks.push(h("p.muted.small", {}, "No offers right now — new jobs arrive each week."));
  }

  return blocks;
}

function equipmentContent(g: GameState): Child[] {
  return [
    h("p.muted.small", {}, "Upgrade lines — each level replaces the last. Some need a better location or reputation."),
    h(
      "div.shop",
      {},
      EQUIPMENT_LINES.map((line) => {
        const ownedLevel = line.levels.filter((l) => g.ownedEquipmentIds.includes(l.id)).reduce((m, l) => Math.max(m, l.level), 0);
        const next = line.levels.find((l) => l.level === ownedLevel + 1);
        const def = next ?? line.levels.find((l) => l.level === ownedLevel)!;

        // Action stays narrow (price / maxed / a small lock); the unlock
        // requirement goes into the info area where it has room to read.
        let action: Child;
        let lockText: string | null = null;
        let rowClass = "";
        if (!next) {
          action = pill("✓ maxed");
          rowClass = "shop__row--owned";
        } else {
          const st = equipmentStatus(g, next.id);
          if (st.kind === "buyable" || st.kind === "tooExpensive") {
            action = button(moneyWhole(next.cost), () => {
              flashOnNextRender(`equip:${line.line}`);
              actions.buyEquipment(next.id);
            }, { size: "sm", disabled: st.kind === "tooExpensive" });
          } else {
            action = h("span.pill.pill--locked", {}, "🔒");
            rowClass = "shop__row--locked";
            lockText = st.kind === "locked" ? st.reason : st.kind === "needsPrev" ? `Needs ${st.prevName}` : "Locked";
          }
        }

        return consumeFlash(`equip:${line.line}`, h("div.shop__row", { class: rowClass }, [
          h("div.shop__icon", {}, def.icon),
          h("div.shop__info", {}, [
            h("strong", {}, [def.name, ownedLevel > 0 ? h("span.lvl", {}, `Lv.${ownedLevel}`) : null]),
            h("div.small.muted", {}, def.blurb),
            lockText ? h("div.shop__lock", {}, `🔒 ${lockText}`) : null,
          ]),
          h("div.shop__action", {}, action),
        ]));
      }),
    ),
  ];
}

// Describe a staff tier's perks from its speed bonuses.
function staffBenefit(s: { serveSpeedBonus: number; batchSpeedBonus: number }): string {
  const parts = ["+1 serving station"];
  if (s.serveSpeedBonus > 0) parts.push(`serves ${Math.round(s.serveSpeedBonus * 100)}% faster`);
  if (s.batchSpeedBonus > 0) parts.push(`mixes ${Math.round(s.batchSpeedBonus * 100)}% faster`);
  return parts.join(" · ");
}

// A hired staffer's perks reflect their trained level (effective bonuses).
function staffBenefitLeveled(st: GameState["staff"][number]): string {
  const eff = effectiveStaffBonus(st);
  const parts = ["+1 station"];
  if (eff.serve > 0) parts.push(`serves ${Math.round(eff.serve * 100)}% faster`);
  if (eff.batch > 0) parts.push(`mixes ${Math.round(eff.batch * 100)}% faster`);
  return parts.join(" · ");
}

// A small XP/level progress bar for a hired staffer.
function staffXpBar(st: GameState["staff"][number]): Child {
  const next = nextLevelXp(st.level);
  if (next === null) return h("div.small.muted", {}, "✨ Fully trained");
  const floor = TUNING.STAFF_XP_FOR_LEVEL[st.level] ?? 0;
  const frac = (st.xp - floor) / (next - floor);
  return h("div.xpbar", {}, [
    bar(frac, "var(--c-grape, #9775fa)"),
    h("span.small.muted", {}, `Lv.${st.level} · ${Math.round(st.xp)}/${next} XP`),
  ]);
}

// A fatigue bar for a hired staffer (only once they've tired a little).
function staffFatigueBar(st: GameState["staff"][number]): Child {
  const f = st.fatigue ?? 0;
  if (f < 1 && !st.resting) return null;
  const color = f > 66 ? "var(--c-coral, #ff6b6b)" : f > 33 ? "var(--c-sun, #ffd43b)" : "var(--c-mint, #51cf66)";
  const slow = Math.round(fatigueSpeedLoss(f) * 100);
  const label = st.resting ? "💤 resting — recovering" : slow > 0 ? `😓 ${Math.round(f)}% tired · −${slow}% speed` : `${Math.round(f)}% tired`;
  return h("div.xpbar", {}, [bar(f / 100, color, `fatigue:${st.id}`), h("span.small.muted", {}, label)]);
}

function fatigueSpeedLoss(fatigue: number): number {
  return TUNING.FATIGUE_SPEED_PENALTY * (Math.max(0, Math.min(100, fatigue)) / 100);
}

// ---------------------------------------------------------------------------
function staffContent(g: GameState): Child[] {
  const full = g.staff.length >= TUNING.STAFF_CAP;
  const canAffordTrain = g.cash >= TUNING.STAFF_TRAIN_COST;
  return [
    h("p.muted.small", {}, `${g.staff.length}/${TUNING.STAFF_CAP} hired. Each adds a serving station and gains experience daily. They tire as they work and slow down — rest one to recover (half wage, no station that day).`),
    ...g.staff.map((st) =>
      h("div.shop__row", {}, [
        h("div.shop__icon", {}, st.icon),
        h("div.shop__info", {}, [
          h("strong", {}, [st.name, h("span.lvl", {}, `Lv.${st.level}`), h("span.lvl", {}, `${moneyWhole(st.wage)}/day`)]),
          h("div.small.muted", {}, staffBenefitLeveled(st)),
          staffXpBar(st),
          staffFatigueBar(st),
        ]),
        h("div.shop__action.shop__action--group", {}, [
          button(st.resting ? "💤 Resting" : "Rest", () => actions.setStaffResting(st.id, !st.resting), {
            size: "sm",
            variant: st.resting ? "sky" : "ghost",
          }),
          button(st.role === "MAKE" ? "🫙 Mixing" : "🥤 Serving", () => actions.setStaffRole(st.id, st.role === "MAKE" ? "SERVE" : "MAKE"), {
            size: "sm",
            variant: "ghost",
          }),
          st.level < TUNING.STAFF_MAX_LEVEL
            ? button(`Train ${moneyWhole(TUNING.STAFF_TRAIN_COST)}`, () => actions.trainStaff(st.id), {
                size: "sm",
                variant: "sky",
                disabled: !canAffordTrain,
              })
            : null,
          button("Let go", () => actions.fireStaff(st.id), { size: "sm", variant: "ghost" }),
        ]),
      ]),
    ),
    full
      ? h("p.muted.small", {}, "Your crew is full.")
      : h(
          "div.shop",
          {},
          STAFF_TIERS.map((t) =>
            consumeFlash(`staff:${t.tier}`, h("div.shop__row", {}, [
              h("div.shop__icon", {}, t.icon),
              h("div.shop__info", {}, [
                h("strong", {}, t.name),
                h("div.small.muted", {}, staffBenefit(t)),
              ]),
              h("div.shop__action.shop__action--group", {}, [
                h("span.small.muted", {}, `${moneyWhole(t.wage)}/day`),
                button("Hire", () => {
                  flashOnNextRender(`staff:${t.tier}`);
                  actions.hireStaff(t.tier);
                }, { size: "sm", variant: "sky" }),
              ]),
            ])),
          ),
        ),
  ];
}

// ---------------------------------------------------------------------------
function researchContent(g: GameState): Child[] {
  const inProg = g.research?.inProgress ?? null;
  return [
    h("p.muted.small", {}, "Invest cash and days into permanent upgrades. One project at a time — progress ticks each day you open."),
    inProg
      ? h("p.feedback", {}, `🔬 Researching ${RESEARCH_NODES.find((n) => n.id === inProg.id)?.name ?? inProg.id} — ${inProg.daysLeft} day${inProg.daysLeft === 1 ? "" : "s"} left.`)
      : null,
    h(
      "div.shop",
      {},
      RESEARCH_NODES.map((node) => {
        const st = researchStatus(g, node.id);
        let action: Child;
        let rowClass = "";
        let lockText: string | null = null;
        if (st.kind === "done") {
          action = pill("✓ done");
          rowClass = "shop__row--owned";
        } else if (st.kind === "inProgress") {
          action = pill(`⏳ ${st.daysLeft}d`);
        } else if (st.kind === "buyable" || st.kind === "tooExpensive") {
          action = button(`${moneyWhole(node.cost)} · ${node.days}d`, () => actions.startResearch(node.id), {
            size: "sm",
            disabled: st.kind === "tooExpensive",
          });
        } else {
          action = h("span.pill.pill--locked", {}, "🔒");
          rowClass = "shop__row--locked";
          lockText = st.kind === "locked" ? st.reason : "Finish current research first";
        }
        return h("div.shop__row", { class: rowClass }, [
          h("div.shop__icon", {}, node.icon),
          h("div.shop__info", {}, [
            h("strong", {}, node.name),
            h("div.small.muted", {}, node.blurb),
            lockText ? h("div.shop__lock", {}, `🔒 ${lockText}`) : null,
          ]),
          h("div.shop__action", {}, action),
        ]);
      }),
    ),
  ];
}

// ---------------------------------------------------------------------------
function locationContent(g: GameState): Child[] {
  return [
    h("p.muted.small", {}, "Bigger spots mean more traffic and higher prices — but pricier rent and weather risk."),
    h(
      "div.shop",
      {},
      LOCATIONS.map((loc) => {
        const here = loc.id === g.currentLocationId;
        const unlocked = g.unlockedLocationIds.includes(loc.id);
        const action = here
          ? pill("📍 here")
          : unlocked
            ? button("Move", () => actions.moveLocation(loc.id), { size: "sm", variant: "sky" })
            : button(`Unlock ${moneyWhole(loc.unlockCost)}`, () => actions.unlockLocation(loc.id), { size: "sm", disabled: loc.unlockCost > g.cash });
        return h("div.loc-row", { class: here ? "loc-row--here" : "" }, [
          h("div.shop__icon", {}, loc.icon),
          h("div.loc-row__info", {}, [
            h("strong", {}, loc.name),
            h("div.loc-row__stats.small.muted", {}, [
              h("span", {}, `🚶 ~${loc.baseTraffic} traffic`),
              h("span", {}, `💵 ${moneyWhole(loc.rentPerDay)}/day rent`),
              h("span", {}, `🏷️ ${money(loc.priceToleranceBase)} price ceiling`),
            ]),
          ]),
          h("div.loc-row__action", {}, action),
        ]);
      }),
    ),
  ];
}

// ---------------------------------------------------------------------------
function financeBar(g: GameState): HTMLElement {
  const c = sel.credit(g);
  return h("section.panel.finance-bar", {}, [
    h("div.finance-bar__info", {}, [
      h("strong", {}, "🏦 Finance"),
      h("span.muted.small", {}, `Cash ${money(g.cash)} · Debt ${money(g.debt)} · ${money(c.available)} credit left · ${pct(TUNING.LOAN_RATE_PER_DAY)}/day interest`),
    ]),
    h("div.finance-bar__actions", {}, [
      button("Borrow $100", () => actions.takeLoan(100), { size: "sm", variant: "ghost", disabled: c.available < 100 }),
      button("Borrow $500", () => actions.takeLoan(500), { size: "sm", variant: "ghost", disabled: c.available < 500 }),
      g.debt > 0 ? button("Repay all", () => actions.repayLoan(Math.min(g.debt, g.cash)), { size: "sm", variant: "mint", disabled: g.cash < 1 }) : null,
    ]),
  ]);
}

// ---------------------------------------------------------------------------
function openBar(g: GameState): HTMLElement {
  const servable = sel.servableCups(g);
  const projected = sel.projectedCustomers(g);
  const open = button(["Open for Business  ", h("span", {}, "▶")], () => actions.goTo("simulation"), {
    variant: "mint",
    size: "lg",
    disabled: servable <= 0,
  });
  if (servable > 0) open.classList.add("btn--beckon"); // gentle idle glow when ready
  return h("div.openbar", {}, [
    h("div.openbar__hint.muted", {}, servable <= 0 ? "⚠️ No lemonade to sell — buy some stock first!" : `Ready to serve ~${Math.min(servable, projected)} cups`),
    open,
  ]);
}
