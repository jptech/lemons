/** Day Recap — headline stat cards (delta + sparkline) + clean SVG charts. */
import { actions, type AppState } from "../../store/gameStore";
import { WEATHER_ICON, WEATHER_LABEL } from "../../data/weather";
import { EVENT_BY_ID } from "../../data/events";
import { GOALS, goalTitle, ladderRungFromId, rungPrestige } from "../../data/goals";
import { ACHIEVEMENT_BY_ID } from "../../data/achievements";
import { PRODUCT_BY_ID } from "../../data/products";
import { ARCHETYPE_BY_ID } from "../../data/archetypes";
import { WAIT_BUCKETS_MIN } from "../../engine";
import type { ArchetypeId, DayMetrics, DayResult, GameState } from "../../engine";
import { h, type Child } from "../dom";
import { button, panel, pill, statBlock, statCard } from "../components";
import { barChart, donut, lineChart, CHART_COLORS as C } from "../charts/charts";
import { confettiBurst } from "../confetti";
import { money, pct, signed, stars } from "../format";

/** Brand colors per customer archetype (shared with the analytics screen feel). */
export const ARCHETYPE_COLOR: Record<ArchetypeId, string> = {
  kid: C.coral,
  adult: C.sky,
  tourist: C.grape,
  regular: C.sun,
  healthnut: C.mint,
};

/** Human labels for the wait-time histogram buckets (≤1, 2, …, last is overflow). */
export function waitBucketLabels(): string[] {
  const labels = WAIT_BUCKETS_MIN.map((edge, i) => {
    const prev = i === 0 ? 0 : WAIT_BUCKETS_MIN[i - 1]!;
    return edge - prev <= 1 ? `${edge}` : `${prev + 1}–${edge}`;
  });
  labels[0] = `≤${WAIT_BUCKETS_MIN[0]}`;
  labels.push(`${WAIT_BUCKETS_MIN[WAIT_BUCKETS_MIN.length - 1]! + 1}+`);
  return labels;
}

let lastCelebratedDay = -1;

export function renderResults(s: AppState): HTMLElement {
  const r = s.lastResult;
  if (!r) return h("main.screen.center", {}, [button("Back to planning", () => actions.goTo("planning"))]);
  const g = s.game;
  const hist = g.history;
  const prev = hist.length >= 2 ? hist[hist.length - 2]! : null;
  const recent = hist.slice(-12);

  const campaignDone = g.mode === "campaign" && g.completedGoalIds.length >= GOALS.length;
  // The campaign is *won today* only when a base (non-ladder) goal completes the
  // set this day. Endless ladder rungs also land in r.newGoals, but they must
  // not re-trigger the victory banner / big confetti on every post-win day.
  const campaignJustWon = campaignDone && r.newGoals.some((id) => ladderRungFromId(id) === null);

  // Celebrate new goals/achievements/contract wins once per day — after the stat
  // cards and reward pills have landed (confetti self-gates on reduced motion).
  const contractWon = (r.contractsResolved ?? []).some((c) => c.status === "done");
  if ((r.newGoals.length || r.newAchievements.length || contractWon) && r.day !== lastCelebratedDay) {
    lastCelebratedDay = r.day;
    setTimeout(() => confettiBurst(campaignJustWon ? 160 : 90), 700);
  }

  return h("main.screen.results", {}, [
    recapHeader(r, g),
    rewardsBanner(r),
    campaignJustWon ? campaignBanner() : null,
    statRow(r, prev, recent),
    productBreakdownPanel(r),
    h("div.grid.grid--charts", {}, [
      cashChart(recent),
      costDonut(r),
    ]),
    reviewsPanel(r),
    r.metrics ? demographicsPanel(r.metrics) : null,
    r.metrics ? waitLoyaltyPanel(r, r.metrics) : null,
    r.metrics ? recipePrefPanel(r.metrics) : null,
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
  const contracts = r.contractsResolved ?? [];
  if (!r.newGoals.length && !r.newAchievements.length && !contracts.length) return null;
  const labels = [
    ...r.newGoals.map((id) => {
      const n = ladderRungFromId(id);
      return n === null
        ? `🎯 Goal: ${goalTitle(id)}`
        : `✦ ${goalTitle(id)} · +${rungPrestige(n)} Prestige`;
    }),
    ...contracts.map((c) =>
      c.status === "done"
        ? `📋 ${c.name} done · 💵${c.rewardCash} + ✦${c.rewardPrestige}`
        : `📋 ${c.name} expired`,
    ),
    ...r.newAchievements.map((id) => `${ACHIEVEMENT_BY_ID[id]?.icon ?? "🏆"} ${ACHIEVEMENT_BY_ID[id]?.title ?? id}`),
  ];
  // Pills cascade in after the stat cards (pop-in keyframe + backwards fill).
  return h("div.rewards", {}, labels.map((text, i) => {
    const p = pill(text);
    p.style.animationDelay = `${420 + i * 90}ms`;
    return p as Child;
  }));
}

function campaignBanner(): HTMLElement {
  return h("div.event-banner", {}, [h("span", {}, "🏆"), h("div", {}, [h("strong", {}, "Campaign complete!"), h("div.muted", {}, "You've built a lemonade empire. Keep playing in endless mode whenever you like.")])]);
}

// ---------------------------------------------------------------------------
/** One-line story of the day — the first thing the player should read. */
function dayVerdict(r: DayResult, g: GameState): { text: string; tone: "pos" | "neg" | "neutral" } {
  if (g.gameOver) return { text: "The stand ran out of cash and credit. 💔", tone: "neg" };
  if (r.served === 0) return { text: "Nobody got served — stock up and try again! 🧺", tone: "neg" };
  const bestBefore = g.stats.bestDayProfit; // already includes today; compare loosely
  if (r.profit > 0 && r.profit >= bestBefore) return { text: "Best day yet — the stand is buzzing! 🏆", tone: "pos" };
  if (r.profit > 50) return { text: "A fantastic day at the stand! 🎉", tone: "pos" };
  if (r.profit > 10) return { text: "A solid, profitable day. 👍", tone: "pos" };
  if (r.profit > -10) return { text: "Just about broke even — small tweaks add up.", tone: "neutral" };
  if (r.balked + r.reneged > r.served) return { text: "Long lines cost you — speed up service. 🐢", tone: "neg" };
  return { text: "A rough day — tomorrow is a fresh squeeze. 🍋", tone: "neg" };
}

function recapHeader(r: DayResult, g: GameState): HTMLElement {
  const ev = r.eventId ? EVENT_BY_ID[r.eventId] : undefined;
  const missed = r.weather.forecast.condition !== r.weather.condition;
  const verdict = dayVerdict(r, g);
  return h(`header.recap-head.recap-head--${verdict.tone}`, {}, [
    h("div.recap-head__title", {}, [
      h("span.recap-head__wx", {}, WEATHER_ICON[r.weather.condition]),
      h("div", {}, [
        h("h1", {}, g.gameOver ? "Game Over" : `Day ${r.day} Recap`),
        h(`div.recap-head__verdict.recap-head__verdict--${verdict.tone}`, {}, verdict.text),
        h("span.muted.small", {}, [
          `${WEATHER_LABEL[r.weather.condition]} · ${r.weather.tempF}°F`,
          missed ? h("span.neg", {}, `  (forecast missed — said ${WEATHER_LABEL[r.weather.forecast.condition]})`) : null,
        ]),
      ]),
    ]),
    ev ? h("div.pill", {}, `${ev.icon} ${ev.title}`) : null,
  ]);
}

// A value element that counts up from zero on screen enter (final text preset).
// `delay` sequences the count-ups; `punch` adds a scale-pop when it finishes.
function cu(
  n: number,
  kind: "int" | "money" | "signed",
  text: string,
  opts: { delay?: number; punch?: boolean } = {},
): Child {
  return h(
    "span",
    {
      "data-countup": String(n),
      "data-countup-fmt": kind,
      "data-countup-delay": opts.delay ? String(opts.delay) : null,
      "data-punch": opts.punch ? "" : null,
    },
    text,
  );
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
      value: cu(r.profit, "signed", signed(r.profit), { punch: true }),
      delta: prev ? r.profit - prev.profit : undefined,
      deltaText: prev ? money(Math.abs(r.profit - prev.profit)) : undefined,
      spark: recent.map((d) => d.profit),
      sparkColor: C.mint,
      sub: `cash ${money(r.cashEnd)}`,
      hero: true,
    }),
    statCard({
      icon: "🥤",
      label: "Cups",
      value: cu(r.cupsSold, "int", String(r.cupsSold), { delay: 80 }),
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
      value: cu(r.tips, "money", money(r.tips), { delay: 240 }),
      delta: prev ? Math.round((r.tips - prev.tips) * 100) / 100 : undefined,
      deltaText: prev ? money(Math.abs(r.tips - prev.tips)) : undefined,
      spark: recent.map((d) => d.tips),
      sparkColor: C.grape,
      sub: r.cupsSold > 0 ? `${money(r.tips / r.cupsSold)} / cup` : "no sales",
    }),
    statCard({
      icon: "📣",
      label: "Reputation",
      value: cu(rep, "int", String(rep), { delay: 320 }),
      delta: prev ? Math.round(r.reputationEnd - prev.reputationEnd) : undefined,
      spark: recent.map((d) => d.reputationEnd),
      sparkColor: C.coral,
      sub: repTier(rep),
    }),
    statCard({
      icon: "💨",
      label: "Lost",
      value: cu(lost, "int", String(lost), { delay: 400 }),
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
    { label: "⭐ Taste", value: Math.round(r.satDrivers.quality * 100), color: C.sun, tip: `Taste — builds your <strong>Taste</strong> reputation: <strong>${pct(r.satDrivers.quality)}</strong>` },
    { label: "💵 Value", value: Math.round(r.satDrivers.price * 100), color: C.mint, tip: `Price fairness — builds <strong>Value</strong>: <strong>${pct(r.satDrivers.price)}</strong>` },
    { label: "⚡ Service", value: Math.round(r.satDrivers.wait * 100), color: C.sky, tip: `Wait score — builds <strong>Service</strong>: <strong>${pct(r.satDrivers.wait)}</strong>` },
  ];
  return panel(
    "⭐",
    "Your reviews",
    h("div.grid.grid--charts", {}, [
      barChart(starBars, { title: "Star ratings", yFormat: (n) => String(Math.round(n)) }),
      barChart(drivers, { title: "What built your reputation", yFormat: (n) => `${Math.round(n)}%`, height: 200 }),
    ]),
    feedbackLine(r),
  );
}

// ---------------------------------------------------------------------------
// Advanced metrics panels (demographics / wait / loyalty / recipe prefs)
// ---------------------------------------------------------------------------
/** Who showed up today, who you served, and how each segment felt. */
function demographicsPanel(m: DayMetrics): Child {
  const entries = (Object.entries(m.demographics) as [ArchetypeId, NonNullable<DayMetrics["demographics"][ArchetypeId]>][])
    .filter(([, row]) => row.arrived > 0)
    .sort((a, b) => b[1].served - a[1].served);
  if (!entries.length) return null;

  const bars = entries.map(([id, row]) => {
    const a = ARCHETYPE_BY_ID[id];
    return {
      label: a?.icon ?? "🙂",
      value: row.served,
      color: ARCHETYPE_COLOR[id],
      tip: `${a?.icon ?? ""} ${a?.name ?? id}<br><strong>${row.served}</strong> served · ${row.lost} lost`,
    };
  });

  const headerRow = h("div.prodtable__row.prodtable__row--head", {}, [
    h("span", {}, "Who"),
    h("span.num", {}, "Served"),
    h("span.num", {}, "Lost"),
    h("span.num", {}, "Avg ★"),
    h("span.num", {}, "Wait"),
  ]);
  const rows = entries.map(([id, row]) => {
    const a = ARCHETYPE_BY_ID[id];
    const avgStars = row.starCount > 0 ? `${(row.starSum / row.starCount).toFixed(1)}★` : "—";
    const avgWait = row.served > 0 ? `${(row.waitSum / row.served).toFixed(1)}m` : "—";
    return h("div.prodtable__row", {}, [
      h("span.prodtable__name", {}, `${a?.icon ?? "🙂"} ${a?.name ?? id}`),
      h("span.num", {}, String(row.served)),
      h("span.num", { class: row.lost > 0 ? "neg" : "" }, String(row.lost)),
      h("span.num", {}, avgStars),
      h("span.num", {}, avgWait),
    ]);
  });

  return panel(
    "👥",
    "Who came by today",
    barChart(bars, { title: "Customers served by type", yFormat: (n) => String(Math.round(n)), height: 180 }),
    h("div.prodtable", {}, [headerRow, ...rows]),
    h("p.muted.small", {}, "“Lost” = walked off without buying (long line or sold out). Stars are from sampled reviews."),
  );
}

/** Wait times + the regulars-conversion funnel ("how fast/often we mint regulars"). */
function waitLoyaltyPanel(r: DayResult, m: DayMetrics): Child {
  if (r.served === 0) return null;
  const labels = waitBucketLabels();
  const waitBars = m.wait.histogram.map((count, i) => ({
    label: labels[i] ?? "?",
    value: count,
    color: i < 3 ? C.mint : i < 5 ? C.sun : C.coral,
    tip: `${labels[i]} min wait: <strong>${count}</strong> guests`,
  }));

  const net = m.loyalty.regularsNet;
  const netText = `${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(1)}`;
  const conv = m.loyalty.conversionRate;
  let read = `✨ ${pct(conv)} of guests left delighted`;
  if (net > 0.5) read += ` — minting about ${net.toFixed(1)} regulars/day.`;
  else if (net < -0.5) read += ` — but regulars are slipping (${netText} today). Win back the delight.`;
  else read += ` — your regulars pool is holding steady.`;

  return panel(
    "💛",
    "Waits & loyalty",
    h("div.grid.grid--stats", {}, [
      statBlock("Avg wait", `${m.wait.avgMin.toFixed(1)}m`, "served guests"),
      statBlock("Longest wait", `${m.wait.maxMin}m`, "one guest"),
      statBlock("Delighted", String(m.loyalty.delighted), `${pct(conv)} of served`),
      statBlock("Regulars", `${Math.round(m.loyalty.regularsEnd)}`, `${netText} today`),
    ]),
    barChart(waitBars, { title: "How long guests waited (minutes)", yFormat: (n) => String(Math.round(n)), height: 180 }),
    h("p.feedback", {}, read),
  );
}

/** What today's guests wished was different about each recipe. */
function recipePrefPanel(m: DayMetrics): Child {
  const TH = 0.025; // ignore tiny drift
  const entries = Object.entries(m.recipePrefs) as [string, NonNullable<DayMetrics["recipePrefs"][keyof DayMetrics["recipePrefs"]]>][];
  const lines = entries
    .map(([id, p]) => {
      const def = PRODUCT_BY_ID[id];
      const chips: Child[] = [];
      const add = (label: string, v: number) => {
        if (v > TH) chips.push(pill(`▲ more ${label}`) as Child);
        else if (v < -TH) chips.push(pill(`▼ less ${label}`) as Child);
      };
      add("🍋 lemon", p.lemon);
      add("🍬 sugar", p.sugar);
      add("🧊 ice", p.ice);
      if (p.price > 0.25) chips.push(pill("💵 room to charge more") as Child);
      else if (p.price < -0.25) chips.push(pill("💵 felt pricey") as Child);
      if (!chips.length) return null;
      return h("div.row", { style: { flexWrap: "wrap", gap: "6px", alignItems: "center" } }, [
        h("strong", {}, `${def?.icon ?? "🥤"} ${def?.name ?? id}:`),
        ...chips,
      ]);
    })
    .filter(Boolean) as Child[];
  if (!lines.length) return null;

  return panel(
    "🧪",
    "Recipe preferences",
    h("div.col", { style: { gap: "8px" } }, lines),
    h("p.muted.small", {}, "Today's guests leaned this way. The recipe panel's feedback chips smooth these signals over several days."),
  );
}

/**
 * Per-product sales breakdown with an aggregate total row (only shown when more
 * than one drink was on the menu — a single-product day is fully covered by the
 * headline stat cards). Each product's cups + revenue sum to the day totals.
 */
function productBreakdownPanel(r: DayResult): Child {
  const entries = Object.entries(r.perProduct ?? {});
  if (entries.length < 2) return null;
  const totalCups = r.cupsSold || 1;

  const headerRow = h("div.prodtable__row.prodtable__row--head", {}, [
    h("span", {}, "Drink"),
    h("span.num", {}, "Cups"),
    h("span.num", {}, "Revenue"),
    h("span.num", {}, "Avg ★"),
    h("span.num", {}, "Share"),
  ]);
  const rows = entries.map(([id, p]) => {
    const def = PRODUCT_BY_ID[id];
    const share = Math.round((p!.cupsSold / totalCups) * 100);
    return h("div.prodtable__row", {}, [
      h("span.prodtable__name", {}, `${def?.icon ?? "🥤"} ${def?.name ?? id}`),
      h("span.num", {}, String(p!.cupsSold)),
      h("span.num", {}, money(p!.revenue)),
      h("span.num", {}, p!.avgStars > 0 ? `${p!.avgStars.toFixed(1)}★` : "—"),
      h("span.num", {}, `${share}%`),
    ]);
  });
  const totalRow = h("div.prodtable__row.prodtable__row--total", {}, [
    h("span.prodtable__name", {}, "🧮 All drinks"),
    h("span.num", {}, String(r.cupsSold)),
    h("span.num", {}, money(r.revenue)),
    h("span.num", {}, r.avgStars > 0 ? `${r.avgStars.toFixed(1)}★` : "—"),
    h("span.num", {}, "100%"),
  ]);

  return panel(
    "🥤",
    "By the menu",
    h("div.prodtable", {}, [headerRow, ...rows, totalRow]),
    h("p.muted.small", {}, "Revenue is cup sales (tips are pooled in the day total). Share is by cups sold."),
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
  // After commitDay the game state is already tomorrow — tease its forecast so
  // the player walks into planning with a head start.
  const f = g.weatherToday.forecast;
  return h("div.results__footer", {}, [
    h("div.col", { style: { gap: "2px" } }, [
      h("span.results__tomorrow", {}, [
        "Tomorrow: ",
        h("strong", {}, `${WEATHER_ICON[f.condition]} ${WEATHER_LABEL[f.condition]} · ~${f.tempF}°F`),
      ]),
      r.spoiled.ice + r.spoiled.lemons > 0
        ? h("span.muted.small", {}, `🧊 ${r.spoiled.ice} ice melted${r.spoiled.lemons ? ` · 🍋 ${r.spoiled.lemons} lemons spoiled` : ""}`)
        : null,
    ]),
    h("div.row", {}, [
      button("📊 Stats", () => actions.goTo("analytics"), { variant: "ghost", size: "lg" }),
      campaignDone
        ? button("Continue endless  ♾️", () => actions.continueEndless(), { variant: "sun", size: "lg" })
        : null,
      button([`Start Day ${r.day + 1}  `, h("span", {}, "▶")], () => actions.goTo("planning"), { variant: "mint", size: "lg" }),
    ]),
  ]);
}
