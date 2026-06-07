/** Analytics / Stats screen — lifetime dashboard + curated Tier-2 charts. */
import { actions, type AppState } from "../../store/gameStore";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { GOALS } from "../../data/goals";
import { ACHIEVEMENTS } from "../../data/achievements";
import { ARCHETYPE_BY_ID } from "../../data/archetypes";
import type { ArchetypeId, Condition, DayResult, GameState } from "../../engine";
import { h, type Child } from "../dom";
import { button, panel, statBlock } from "../components";
import { barChart, donut, lineChart, CHART_COLORS as C } from "../charts/charts";
import { money, pct, signed, stars } from "../format";
import { ARCHETYPE_COLOR } from "./results";

const WX_COLOR: Record<Condition, string> = {
  heatwave: "#ff8787",
  sunny: "#ffd43b",
  partly: "#a9e34b",
  cloudy: "#ced4da",
  rainy: "#74c0fc",
  cold: "#bac8ff",
};

export function renderAnalytics(s: AppState): HTMLElement {
  const g = s.game;
  const recent = g.history.slice(-14);

  return h("main.screen.analytics", {}, [
    h("header.recap-head", {}, [
      h("div.recap-head__title", {}, [h("span.recap-head__wx", {}, "📊"), h("h1", {}, "Stand Analytics")]),
      button("← Back", () => actions.goTo(g.history.length ? "planning" : "menu"), { variant: "ghost", size: "sm" }),
    ]),
    lifetimePanel(g),
    g.history.length === 0
      ? h("p.muted", { style: { textAlign: "center", padding: "24px" } }, "Play a day to start building your charts!")
      : h("div.grid.grid--charts", {}, [
          cashChart(recent),
          profitChart(recent),
          weatherSalesChart(recent),
          repChart(recent),
        ]),
    recent.some((d) => d.metrics) ? customerInsights(recent) : null,
    g.mode === "campaign" ? goalsPanel(g) : null,
    achievementsPanel(g),
  ]);
}

// ---------------------------------------------------------------------------
// Customer insights — demographics, satisfaction by segment, waits, loyalty.
// ---------------------------------------------------------------------------
function customerInsights(recent: DayResult[]): HTMLElement {
  // Aggregate per-archetype served + sampled stars across the recent window.
  const agg: Partial<Record<ArchetypeId, { served: number; starSum: number; starCount: number }>> = {};
  for (const d of recent) {
    const demo = d.metrics?.demographics;
    if (!demo) continue;
    for (const [id, row] of Object.entries(demo) as [ArchetypeId, NonNullable<typeof demo[ArchetypeId]>][]) {
      const a = (agg[id] ??= { served: 0, starSum: 0, starCount: 0 });
      a.served += row.served;
      a.starSum += row.starSum;
      a.starCount += row.starCount;
    }
  }
  const ids = (Object.keys(agg) as ArchetypeId[]).sort((x, y) => agg[y]!.served - agg[x]!.served);

  const mixSegs = ids
    .filter((id) => agg[id]!.served > 0)
    .map((id) => ({ label: ARCHETYPE_BY_ID[id]?.name ?? id, value: agg[id]!.served, color: ARCHETYPE_COLOR[id] }));
  const totalServed = mixSegs.reduce((s, x) => s + x.value, 0);

  const satBars = ids
    .filter((id) => agg[id]!.starCount > 0)
    .map((id) => {
      const avg = agg[id]!.starSum / agg[id]!.starCount;
      return {
        label: ARCHETYPE_BY_ID[id]?.icon ?? "🙂",
        value: Math.round(avg * 10) / 10,
        color: ARCHETYPE_COLOR[id],
        tip: `${ARCHETYPE_BY_ID[id]?.name ?? id}<br><strong>${avg.toFixed(1)}★</strong> avg (${agg[id]!.starCount} reviews)`,
      };
    });

  const waitLine = recent
    .filter((d) => d.metrics)
    .map((d) => ({ x: d.day, y: d.metrics!.wait.avgMin, label: `Day ${d.day}<br><strong>${d.metrics!.wait.avgMin.toFixed(1)} min</strong> avg wait` }));

  const regularsLine = recent.map((d) => ({ x: d.day, y: d.regularsEnd, label: `Day ${d.day}<br><strong>${Math.round(d.regularsEnd)}</strong> regulars` }));

  const convLine = recent
    .filter((d) => d.metrics)
    .map((d) => ({ x: d.day, y: Math.round(d.metrics!.loyalty.conversionRate * 100), label: `Day ${d.day}<br><strong>${pct(d.metrics!.loyalty.conversionRate)}</strong> left delighted` }));

  return h("div.col", { style: { gap: "16px" } }, [
    panel(
      "👥",
      "Customer insights",
      h("div.grid.grid--charts", {}, [
        donut(mixSegs, { title: "🧑‍🤝‍🧑 Customer mix", centerValue: String(totalServed), centerLabel: "served" }),
        barChart(satBars, { title: "⭐ Satisfaction by segment", yFormat: (n) => `${n.toFixed(1)}` }),
      ]),
    ),
    panel(
      "💛",
      "Waits & loyalty",
      h("div.grid.grid--charts", {}, [
        lineChart(waitLine, { title: "⏱️ Avg wait over time", color: C.sky, yFormat: (n) => `${n.toFixed(1)}m` }),
        lineChart(regularsLine, { title: "💛 Regulars pool", color: C.sun, yFormat: (n) => String(Math.round(n)) }),
        lineChart(convLine, { title: "✨ Delighted conversion", color: C.mint, yFormat: (n) => `${Math.round(n)}%` }),
      ]),
    ),
  ]);
}

// ---------------------------------------------------------------------------
function lifetimePanel(g: GameState): HTMLElement {
  const st = g.stats;
  const avgStars = st.countStars > 0 ? st.sumStars / st.countStars : 0;
  return panel(
    "🏅",
    "Lifetime",
    h("div.grid.grid--stats", {}, [
      statBlock("Days played", String(st.daysPlayed)),
      statBlock("Cups sold", st.totalCupsSold.toLocaleString()),
      statBlock("Revenue", money(st.totalRevenue)),
      statBlock("Net profit", signed(st.totalProfit)),
      statBlock("Best day", money(st.bestDayProfit), st.bestDayProfitDay ? `day ${st.bestDayProfitDay}` : ""),
      statBlock("Best day cups", String(st.bestDayCups)),
      statBlock("Longest streak", `${st.longestProfitStreak} days`),
      statBlock("Avg review", stars(avgStars), avgStars.toFixed(2)),
      statBlock("Peak cash", money(st.peakCash)),
      statBlock("Peak reputation", String(Math.round(st.peakReputation))),
      statBlock("Customers lost", st.totalCustomersLost.toLocaleString()),
      statBlock("Total tips", money(st.totalTips)),
    ]),
  );
}

// ---------------------------------------------------------------------------
function cashChart(recent: DayResult[]): HTMLElement {
  return lineChart(
    recent.map((d) => ({ x: d.day, y: d.cashEnd, label: `${WEATHER_ICON[d.weather.condition]} Day ${d.day}<br><strong>${money(d.cashEnd)}</strong>` })),
    { title: "💵 Cash over time", color: C.sky, yFormat: money },
  );
}

function profitChart(recent: DayResult[]): HTMLElement {
  return barChart(
    recent.map((d) => ({
      label: String(d.day),
      value: Math.max(0, d.profit),
      color: d.profit >= 0 ? C.mint : C.coral,
      tip: `Day ${d.day}: <strong>${signed(d.profit)}</strong>`,
    })),
    { title: "📈 Daily profit", yFormat: money },
  );
}

function weatherSalesChart(recent: DayResult[]): HTMLElement {
  return barChart(
    recent.map((d) => ({
      label: WEATHER_ICON[d.weather.condition],
      value: d.cupsSold,
      color: WX_COLOR[d.weather.condition],
      tip: `${WEATHER_LABEL[d.weather.condition]} · Day ${d.day}<br><strong>${d.cupsSold} cups</strong>`,
    })),
    { title: "☀️ Cups sold by weather", yFormat: (n) => String(Math.round(n)) },
  );
}

function repChart(recent: DayResult[]): HTMLElement {
  return lineChart(
    recent.map((d) => ({ x: d.day, y: d.reputationEnd, label: `Day ${d.day}<br><strong>${Math.round(d.reputationEnd)} rep</strong>` })),
    { title: "📣 Reputation over time", color: C.coral, yFormat: (n) => String(Math.round(n)) },
  );
}

// ---------------------------------------------------------------------------
function goalsPanel(g: GameState): HTMLElement {
  const done = g.completedGoalIds.length;
  return panel(
    "🎯",
    `Campaign Goals (${done}/${GOALS.length})`,
    h(
      "div.goals",
      {},
      GOALS.map((goal) => {
        const complete = g.completedGoalIds.includes(goal.id);
        return h("div.goal", { class: complete ? "goal--done" : "" }, [
          h("span.goal__check", {}, complete ? "✅" : "⬜"),
          h("div", {}, [h("strong", {}, goal.title), h("div.small.muted", {}, goal.desc)]),
        ]) as Child;
      }),
    ),
    done >= GOALS.length ? h("p.feedback", {}, "🏆 Campaign complete — you're a Lemonade Tycoon!") : null,
  );
}

function achievementsPanel(g: GameState): HTMLElement {
  return panel(
    "🏆",
    `Achievements (${g.unlockedAchievementIds.length}/${ACHIEVEMENTS.length})`,
    h(
      "div.badges",
      {},
      ACHIEVEMENTS.map((a) => {
        const got = g.unlockedAchievementIds.includes(a.id);
        return h("div.badge", { class: got ? "badge--got" : "badge--locked", title: a.desc }, [
          h("span.badge__icon", {}, got ? a.icon : "🔒"),
          h("span.badge__title", {}, a.title),
          h("span.small.muted", {}, a.desc),
        ]) as Child;
      }),
    ),
  );
}
