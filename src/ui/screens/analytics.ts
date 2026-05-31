/** Analytics / Stats screen — lifetime dashboard + curated Tier-2 charts. */
import { actions, type AppState } from "../../store/gameStore";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { GOALS } from "../../data/goals";
import { ACHIEVEMENTS } from "../../data/achievements";
import type { Condition, DayResult, GameState } from "../../engine";
import { h, type Child } from "../dom";
import { button, panel, statBlock } from "../components";
import { barChart, lineChart, CHART_COLORS as C } from "../charts/charts";
import { money, signed, stars } from "../format";

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
    g.mode === "campaign" ? goalsPanel(g) : null,
    achievementsPanel(g),
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
