import { actions, type AppState } from "../../store/gameStore";
import { getSettings } from "../../store/settings";
import * as sel from "../../store/selectors";
import { EQUIPMENT_LINES } from "../../data/equipment";
import { STAFF_TIERS } from "../../data/staff";
import { MARKETING_TIERS } from "../../data/marketing";
import { LOCATIONS } from "../../data/locations";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { EVENT_BY_ID } from "../../data/events";
import { GOALS } from "../../data/goals";
import {
  derive,
  equipmentStatus,
  idealRecipe,
  itemBuyPrice,
  inventoryQty,
  recipeQuality,
  TUNING,
  type GameState,
  type ItemId,
  type Recipe,
} from "../../engine";
import { h, type Child } from "../dom";
import { button, panel, pill, slider, statBlock } from "../components";
import { money, moneyShort, pct } from "../format";

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
    h("div.grid.grid--panels", {}, [
      recipePanel(g),
      stockPanel(g),
      marketingPanel(g),
      equipmentPanel(g),
      staffPanel(g),
      locationPanel(g),
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

function topbar(g: GameState): HTMLElement {
  const loc = sel.currentLocation(g);
  const f = g.weatherToday.forecast;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(g.day - 1) % 7];
  const cashPulse = lastCashSeen !== null && lastCashSeen !== g.cash && !getSettings().reducedMotion;
  lastCashSeen = g.cash;
  return h("header.topbar", {}, [
    h("div.topbar__brand", {}, [
      h("span.topbar__day", {}, `Day ${g.day}`),
      h("span.muted", {}, dow),
    ]),
    h("div.topbar__loc", {}, [`${loc.icon} ${loc.name}`]),
    h("div.topbar__weather", {}, [
      h("span.topbar__wicon", {}, WEATHER_ICON[f.condition]),
      h("div.col", { style: { gap: "0" } }, [
        h("strong", {}, WEATHER_LABEL[f.condition]),
        h("span.muted", {}, `forecast · ${f.tempF}°F`),
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
      statBlock("Recipe match", pct(quality), qualityHint(g)),
      statBlock("Your price", money(g.recipe.pricePerCup), h("span", { class: priceClass }, ph.text)),
    ]),
  ]);
}

function qualityHint(g: GameState): string {
  const ideal = idealRecipe(sel.forecastWeather(g));
  const sum = g.recipe.lemons + g.recipe.sugar + g.recipe.ice || 1;
  const have: [number, number, number] = [g.recipe.lemons / sum, g.recipe.sugar / sum, g.recipe.ice / sum];
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

function recipePanel(g: GameState): HTMLElement {
  const r = g.recipe;
  const wx = sel.forecastWeather(g);
  const live: Recipe = { ...r };

  // Live quality preview that updates during a drag (no store write).
  const qFill = h("div.meter__fill", {}) as HTMLElement;
  const qLabel = h("span.num", {}) as HTMLElement;
  const paintQuality = () => {
    const q = recipeQuality(live, wx);
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
      onInput: (v) => actions.setRecipe({ [key]: v }),
    });

  return panel(
    "🧪",
    "Recipe & Price",
    part("lemons", "Lemons", "🍋", 0, 10),
    part("sugar", "Sugar", "🍬", 0, 10),
    part("ice", "Ice", "🧊", 0, 10),
    part("water", "Water", "💧", 1, 16),
    h("div.recipe__quality", {}, [
      h("div.row.row--between", {}, [h("span.muted", {}, "Quality vs forecast"), qLabel]),
      h("div.meter", {}, [qFill]),
    ]),
    recipeFeedbackBox(g),
    slider({
      label: "Price per cup",
      icon: "💵",
      min: 0.25,
      max: 6,
      step: 0.05,
      value: r.pricePerCup,
      onInput: (v) => actions.setPrice(v),
      format: (v) => money(v),
    }),
    pricingHintLine(g),
  );
}

function pricingHintLine(g: GameState): HTMLElement {
  const ph = sel.pricingHint(g);
  const icon = ph.verdict === "raise" ? "📈" : ph.verdict === "pricey" ? "💸" : "👍";
  const cls = ph.verdict === "pricey" ? "neg" : ph.verdict === "raise" ? "pos" : "muted";
  return h("p.price-hint", { class: cls }, `${icon} ${ph.text}`);
}

/** Persistent, learned guidance from recent customer reviews. */
function recipeFeedbackBox(g: GameState): Child {
  const fb = g.recipeFeedback ?? { lemon: 0, sugar: 0, ice: 0 };
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
      for (const p of parts) patch[p.key] = g.recipe[p.key] + p.delta;
      actions.setRecipe(patch);
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
        h("span.muted", {}, "Storage space"),
        h("span.num", { class: frac > 0.92 ? "neg" : "" }, `${Math.round(st.used)} / ${st.capacity} slots`),
      ]),
      h("div.segbar", {}, segments),
      h("p.stock__legend.muted", {}, `Bulky items eat more space: 🧊 ${itemsPerSlot("ice")}/slot · 🍋 ${itemsPerSlot("lemon")}/slot · 🍬 ${itemsPerSlot("sugar")}/slot · 🥤 ${itemsPerSlot("cup")}/slot`),
    ]),
    ...STOCK_ROWS.map((row) => {
      const have = inventoryQty(g, row.item);
      const price = itemBuyPrice(g, row.item);
      const slotsUsed = have * TUNING.SLOT_COST[row.item];
      const spiked = row.item === "lemon" && price > TUNING.ITEM_COST.lemon + 1e-9;
      const spoils = sel.spoilTonight(g, row.item);
      return h("div.stockrow", {}, [
        h("div.stockrow__info", {}, [
          h("strong.stockrow__name", {}, [
            h("span.stock__dot", { style: { background: ITEM_COLOR[row.item] } }),
            ` ${row.icon} ${row.name}`,
            h("span.stockrow__have.num", {}, `× ${have}`),
          ]),
          h("span.stock__note", { class: spiked ? "neg" : "muted" }, `${money(price)} ea · ${row.note(g)} · ${slotsUsed.toFixed(1)} slots`),
          spoils > 0 ? h("span.spoil-warn", {}, `⚠️ ${spoils} ${row.item === "ice" ? "melt" : "spoil"} tonight`) : null,
        ]),
        h("div.stockrow__controls", {}, [
          button("−10", () => actions.discardStock(row.item, 10), { size: "sm", variant: "ghost" }),
          button("+10", () => actions.buyStock(row.item, 10), { size: "sm", variant: "ghost" }),
          button("+50", () => actions.buyStock(row.item, 50), { size: "sm", variant: "ghost" }),
          button("Max", () => actions.buyMax(row.item), { size: "sm", variant: "sky" }),
        ]),
      ]);
    }),
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
      MARKETING_TIERS.map((t) =>
        optionBtn(
          `${t.icon} ${t.name}`,
          t.spend > 0 ? money(t.spend) : "free",
          () => actions.setMarketing(t.spend),
          { selected: g.marketingSpend === t.spend, disabled: t.spend > g.cash + g.marketingSpend },
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
function equipmentPanel(g: GameState): HTMLElement {
  return panel(
    "🛠️",
    "Equipment",
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
            action = button(money(next.cost), () => actions.buyEquipment(next.id), { size: "sm", disabled: st.kind === "tooExpensive" });
          } else {
            action = h("span.pill.pill--locked", {}, "🔒");
            rowClass = "shop__row--locked";
            lockText = st.kind === "locked" ? st.reason : st.kind === "needsPrev" ? `Needs ${st.prevName}` : "Locked";
          }
        }

        return h("div.shop__row", { class: rowClass }, [
          h("div.shop__icon", {}, def.icon),
          h("div.shop__info", {}, [
            h("strong", {}, [def.name, ownedLevel > 0 ? h("span.lvl", {}, `Lv.${ownedLevel}`) : null]),
            h("div.small.muted", {}, def.blurb),
            lockText ? h("div.shop__lock", {}, `🔒 ${lockText}`) : null,
          ]),
          h("div.shop__action", {}, action),
        ]);
      }),
    ),
  );
}

// Describe a staff tier's perks from its speed bonuses.
function staffBenefit(s: { serveSpeedBonus: number; batchSpeedBonus: number }): string {
  const parts = ["+1 serving station"];
  if (s.serveSpeedBonus > 0) parts.push(`serves ${Math.round(s.serveSpeedBonus * 100)}% faster`);
  if (s.batchSpeedBonus > 0) parts.push(`mixes ${Math.round(s.batchSpeedBonus * 100)}% faster`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
function staffPanel(g: GameState): HTMLElement {
  const full = g.staff.length >= TUNING.STAFF_CAP;
  return panel(
    "🧑‍🍳",
    `Staff (${g.staff.length}/${TUNING.STAFF_CAP})`,
    h("p.muted.small", {}, `Each hire adds a serving station (max ${TUNING.STAFF_CAP}). Pricier staff work faster — worth it once your stations are full.`),
    ...g.staff.map((st) =>
      h("div.shop__row", {}, [
        h("div.shop__icon", {}, st.icon),
        h("div.shop__info", {}, [
          h("strong", {}, [st.name, h("span.lvl", {}, `${money(st.wage)}/day`)]),
          h("div.small.muted", {}, staffBenefit(st)),
        ]),
        h("div.shop__action.shop__action--group", {}, [
          button(st.role === "MAKE" ? "🫙 Mixing" : "🥤 Serving", () => actions.setStaffRole(st.id, st.role === "MAKE" ? "SERVE" : "MAKE"), {
            size: "sm",
            variant: "ghost",
          }),
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
            h("div.shop__row", {}, [
              h("div.shop__icon", {}, t.icon),
              h("div.shop__info", {}, [
                h("strong", {}, t.name),
                h("div.small.muted", {}, staffBenefit(t)),
              ]),
              h("div.shop__action.shop__action--group", {}, [
                h("span.small.muted", {}, `${money(t.wage)}/day`),
                button("Hire", () => actions.hireStaff(t.tier), { size: "sm", variant: "sky" }),
              ]),
            ]),
          ),
        ),
  );
}

// ---------------------------------------------------------------------------
function locationPanel(g: GameState): HTMLElement {
  return panel(
    "📍",
    "Locations",
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
            : button(`Unlock ${money(loc.unlockCost)}`, () => actions.unlockLocation(loc.id), { size: "sm", disabled: loc.unlockCost > g.cash });
        return h("div.loc-row", { class: here ? "loc-row--here" : "" }, [
          h("div.shop__icon", {}, loc.icon),
          h("div.loc-row__info", {}, [
            h("strong", {}, loc.name),
            h("div.loc-row__stats.small.muted", {}, [
              h("span", {}, `🚶 ~${loc.baseTraffic} traffic`),
              h("span", {}, `💵 ${money(loc.rentPerDay)}/day rent`),
              h("span", {}, `🏷️ ${money(loc.priceToleranceBase)} price ceiling`),
            ]),
          ]),
          h("div.loc-row__action", {}, action),
        ]);
      }),
    ),
  );
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
  return h("div.openbar", {}, [
    h("div.openbar__hint.muted", {}, servable <= 0 ? "⚠️ No lemonade to sell — buy some stock first!" : `Ready to serve ~${Math.min(servable, projected)} cups`),
    button(["Open for Business  ", h("span", {}, "▶")], () => actions.goTo("simulation"), {
      variant: "mint",
      size: "lg",
      disabled: servable <= 0,
    }),
  ]);
}
