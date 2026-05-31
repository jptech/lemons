/** Day Recap — headline stat cards (delta + sparkline) + clean SVG charts. */
import { actions, type AppState } from "../../store/gameStore";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { EVENT_BY_ID } from "../../data/events";
import { GOAL_BY_ID } from "../../data/goals";
import { ACHIEVEMENT_BY_ID } from "../../data/achievements";
import { GOALS } from "../../data/goals";
import type { DayResult, GameState } from "../../engine";
import { h, type Child } from "../dom";
import { button, panel, pill, statBlock, statCard } from "../components";
import { barChart, donut, lineChart, CHART_COLORS as C } from "../charts/charts";
import { confettiBurst } from "../confetti";
import { money, pct, signed, stars } from "../format";

let lastCelebratedDay = -1;

export function renderResults(s: AppState): HTMLElement {
  const r = s.lastResult;
  if (!r) return h("main.screen.center", {}, [button("Back to planning", () => actions.goTo("planning"))]);
  const g = s.game;
  const hist = g.history;
  const prev = hist.length >= 2 ? hist[hist.length - 2]! : null;
  const recent = hist.slice(-12);

  const campaignDone = g.mode === "campaign" && g.completedGoalIds.length >= GOALS.length;

  // Celebrate new goals/achievements once per day.
  if ((r.newGoals.length || r.newAchievements.length) && r.day !== lastCelebratedDay) {
    lastCelebratedDay = r.day;
    requestAnimationFrame(() => confettiBurst(campaignDone ? 160 : 90));
  }

  return h("main.screen.results", {}, [
    recapHeader(r, g),
    rewardsBanner(r),
    campaignDone && r.newGoals.length ? campaignBanner() : null,
    statRow(r, prev, recent),
    h("div.grid.grid--charts", {}, [
      cashChart(recent),
      costDonut(r),
    ]),
    reviewsPanel(r),
    wasteSection(r),
    footer(r, g, campaignDone),
  ]);
}

// ---------------------------------------------------------------------------
function wasteSection(r: DayResult): HTMLElement {
  const lo = r.leftover;
  const totalWaste = r.spoiled.ice + r.spoiled.lemons + r.unsoldCups;
  let tip = "Nice — barely any waste today! 👌";
  if (r.spoiled.ice > 40) tip = "Lots of ice melted — buy ice closer to what you'll sell, or get an insulated cooler / ice maker.";
  else if (r.unsoldCups > 25) tip = "You brewed more than you sold — ease off batching late in the day.";
  else if (r.spoiled.lemons > 10) tip = "Some lemons spoiled — buy fewer, or use the older ones first.";

  return panel(
    "🗑️",
    "Leftovers & waste",
    h("div.grid.grid--stats", {}, [
      statBlock("🧊 Ice melted", `${r.spoiled.ice}`, "overnight"),
      statBlock("🍋 Lemons spoiled", `${r.spoiled.lemons}`, "too old"),
      statBlock("🥤 Unsold lemonade", `${r.unsoldCups}`, "brewed, not sold"),
    ]),
    h("p.muted.small", { style: { marginTop: "8px" } }, [
      "Carried to tomorrow: ",
      `🍋 ${lo.lemon}  ·  🍬 ${lo.sugar}  ·  🧊 ${lo.ice}  ·  🥤 ${lo.cup}`,
    ]),
    totalWaste > 0 || r.served > 0 ? h("p.feedback", {}, tip) : null,
  );
}

function rewardsBanner(r: DayResult): Child {
  if (!r.newGoals.length && !r.newAchievements.length) return null;
  return h("div.rewards", {}, [
    ...r.newGoals.map((id) => pill(`🎯 Goal: ${GOAL_BY_ID[id]?.title ?? id}`) as Child),
    ...r.newAchievements.map((id) => pill(`${ACHIEVEMENT_BY_ID[id]?.icon ?? "🏆"} ${ACHIEVEMENT_BY_ID[id]?.title ?? id}`) as Child),
  ]);
}

function campaignBanner(): HTMLElement {
  return h("div.event-banner", {}, [h("span", {}, "🏆"), h("div", {}, [h("strong", {}, "Campaign complete!"), h("div.muted", {}, "You've built a lemonade empire. Keep playing in endless mode whenever you like.")])]);
}

// ---------------------------------------------------------------------------
function recapHeader(r: DayResult, g: GameState): HTMLElement {
  const ev = r.eventId ? EVENT_BY_ID[r.eventId] : undefined;
  const missed = r.weather.forecast.condition !== r.weather.condition;
  return h("header.recap-head", {}, [
    h("div.recap-head__title", {}, [
      h("span.recap-head__wx", {}, WEATHER_ICON[r.weather.condition]),
      h("div", {}, [
        h("h1", {}, g.gameOver ? "Game Over" : `Day ${r.day} Recap`),
        h("span.muted", {}, [
          `${WEATHER_LABEL[r.weather.condition]} · ${r.weather.tempF}°F`,
          missed ? h("span.neg", {}, `  (forecast missed — said ${WEATHER_LABEL[r.weather.forecast.condition]})`) : null,
        ]),
      ]),
    ]),
    ev ? h("div.pill", {}, `${ev.icon} ${ev.title}`) : null,
  ]);
}

// A value element that counts up from zero on screen enter (final text preset).
function cu(n: number, kind: "int" | "money" | "signed", text: string): Child {
  return h("span", { "data-countup": String(n), "data-countup-fmt": kind }, text);
}

function repTier(rep: number): string {
  return rep >= 80 ? "famous" : rep >= 60 ? "well-loved" : rep >= 40 ? "well-liked" : rep >= 20 ? "getting known" : "new in town";
}

// ---------------------------------------------------------------------------
// Every card has the same shape: short label + sparkline, value, foot (delta + sub).
function statRow(r: DayResult, prev: DayResult | null, recent: DayResult[]): HTMLElement {
  const lost = r.balked + r.reneged;
  const rep = Math.round(r.reputationEnd);
  return h("div.grid.grid--cards", {}, [
    statCard({
      icon: "💰",
      label: "Profit",
      value: cu(r.profit, "signed", signed(r.profit)),
      delta: prev ? r.profit - prev.profit : undefined,
      deltaText: prev ? money(Math.abs(r.profit - prev.profit)) : undefined,
      spark: recent.map((d) => d.profit),
      sparkColor: C.mint,
      sub: `cash ${money(r.cashEnd)}`,
    }),
    statCard({
      icon: "🥤",
      label: "Cups",
      value: cu(r.cupsSold, "int", String(r.cupsSold)),
      delta: prev ? r.cupsSold - prev.cupsSold : undefined,
      spark: recent.map((d) => d.cupsSold),
      sparkColor: C.sky,
      sub: `${r.served} of ~${r.potentialCustomers}`,
    }),
    statCard({
      icon: "⭐",
      label: "Review",
      value: stars(r.avgStars),
      delta: prev ? Math.round((r.avgStars - prev.avgStars) * 10) / 10 : undefined,
      deltaText: prev ? Math.abs(Math.round((r.avgStars - prev.avgStars) * 10) / 10).toFixed(1) : undefined,
      spark: recent.map((d) => d.avgStars),
      sparkColor: C.sun,
      sub: `${r.avgStars.toFixed(1)} avg stars`,
    }),
    statCard({
      icon: "🪙",
      label: "Tips",
      value: cu(r.tips, "money", money(r.tips)),
      delta: prev ? Math.round((r.tips - prev.tips) * 100) / 100 : undefined,
      deltaText: prev ? money(Math.abs(r.tips - prev.tips)) : undefined,
      spark: recent.map((d) => d.tips),
      sparkColor: C.grape,
      sub: r.cupsSold > 0 ? `${money(r.tips / r.cupsSold)} / cup` : "no sales",
    }),
    statCard({
      icon: "📣",
      label: "Reputation",
      value: cu(rep, "int", String(rep)),
      delta: prev ? Math.round(r.reputationEnd - prev.reputationEnd) : undefined,
      spark: recent.map((d) => d.reputationEnd),
      sparkColor: C.coral,
      sub: repTier(rep),
    }),
    statCard({
      icon: "💨",
      label: "Lost",
      value: cu(lost, "int", String(lost)),
      upIsGood: false,
      delta: prev ? lost - (prev.balked + prev.reneged) : undefined,
      spark: recent.map((d) => d.balked + d.reneged),
      sparkColor: "#adb5bd",
      sub: lost > 0 ? "queue / sold out" : "served everyone!",
    }),
  ]);
}

// ---------------------------------------------------------------------------
function cashChart(recent: DayResult[]): HTMLElement {
  const data = recent.map((d) => ({
    x: d.day,
    y: d.cashEnd,
    label: `${WEATHER_ICON[d.weather.condition]} Day ${d.day}<br><strong>${money(d.cashEnd)}</strong> · ${signed(d.profit)}`,
  }));
  return lineChart(data, { title: "💵 Cash over time", color: C.sky, yFormat: (n) => money(n) });
}

function costDonut(r: DayResult): HTMLElement {
  const segs = [
    { label: "Stock", value: r.costs.stock, color: C.sun },
    { label: "Rent", value: r.costs.rent, color: C.coral },
    { label: "Wages", value: r.costs.wages, color: C.sky },
    { label: "Marketing", value: r.costs.marketing, color: C.grape },
    { label: "Equipment", value: r.costs.equipment, color: C.mint },
    { label: "Interest", value: r.costs.interest, color: "#adb5bd" },
  ].filter((s) => s.value > 0);
  const total = segs.reduce((s, x) => s + x.value, 0);
  return h("div.col", {}, [
    donut(segs, { title: "🧾 Where today's money went", centerValue: money(total), centerLabel: "spent" }),
    h("div.legend", {}, segs.map((s) => h("span.legend__item", {}, [h("span.legend__dot", { style: { background: s.color } }), `${s.label} ${money(s.value)}`]) as Child)),
  ]);
}

// ---------------------------------------------------------------------------
function reviewsPanel(r: DayResult): HTMLElement {
  const starColors = ["#ff8787", "#ffa94d", "#ffd43b", "#a9e34b", "#69db7c"];
  const starBars = r.starHistogram.map((count, i) => ({
    label: "★".repeat(i + 1),
    value: count,
    color: starColors[i],
    tip: `${i + 1}★: <strong>${count}</strong> reviews`,
  }));
  const drivers = [
    { label: "🍋 Taste", value: Math.round(r.satDrivers.quality * 100), color: C.sun, tip: `Taste score: <strong>${pct(r.satDrivers.quality)}</strong>` },
    { label: "💵 Price", value: Math.round(r.satDrivers.price * 100), color: C.mint, tip: `Price fairness: <strong>${pct(r.satDrivers.price)}</strong>` },
    { label: "⏱️ Wait", value: Math.round(r.satDrivers.wait * 100), color: C.sky, tip: `Wait score: <strong>${pct(r.satDrivers.wait)}</strong>` },
  ];
  return panel(
    "⭐",
    "Your reviews",
    h("div.grid.grid--charts", {}, [
      barChart(starBars, { title: "Star ratings", yFormat: (n) => String(Math.round(n)) }),
      barChart(drivers, { title: "What drove satisfaction", yFormat: (n) => `${Math.round(n)}%`, height: 200 }),
    ]),
    feedbackLine(r),
  );
}

function feedbackLine(r: DayResult): HTMLElement {
  const d = r.satDrivers;
  const worst = Math.min(d.quality, d.price, d.wait);
  let msg = "Customers are happy across the board — keep it up! 🎉";
  if (r.served === 0) msg = "Nobody got served today — make sure you have stock to sell.";
  else if (worst === d.quality && d.quality < 0.7) msg = "Some folks weren't sold on the taste — tweak your recipe toward the forecast.";
  else if (worst === d.price && d.price < 0.7) msg = "A few thought you were pricey — consider easing the price or boosting reputation.";
  else if (worst === d.wait && d.wait < 0.7) msg = "Lines got long — more staff or faster equipment would help.";
  return h("p.feedback", {}, msg);
}

// ---------------------------------------------------------------------------
function footer(r: DayResult, g: GameState, campaignDone: boolean): HTMLElement {
  if (g.gameOver) {
    return h("div.results__footer", {}, [
      h("p.muted", {}, "You ran out of cash and credit. The stand is closed."),
      h("div.row", {}, [
        button("📊 Stats", () => actions.goTo("analytics"), { variant: "ghost", size: "lg" }),
        button("Try Again", () => actions.startNewGame(g.mode), { variant: "sun", size: "lg" }),
      ]),
    ]);
  }
  return h("div.results__footer", {}, [
    r.spoiled.ice + r.spoiled.lemons > 0
      ? h("span.muted", {}, `🧊 ${r.spoiled.ice} ice melted${r.spoiled.lemons ? ` · 🍋 ${r.spoiled.lemons} lemons spoiled` : ""}`)
      : h("span", {}),
    h("div.row", {}, [
      button("📊 Stats", () => actions.goTo("analytics"), { variant: "ghost", size: "lg" }),
      campaignDone
        ? button("Continue endless  ♾️", () => actions.continueEndless(), { variant: "sun", size: "lg" })
        : null,
      button([`Start Day ${r.day + 1}  `, h("span", {}, "▶")], () => actions.goTo("planning"), { variant: "mint", size: "lg" }),
    ]),
  ]);
}
