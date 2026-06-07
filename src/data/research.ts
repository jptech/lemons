import type { ResearchNodeDef } from "../engine/types";

/**
 * Research tree — a late-game cash + TIME sink that buys permanent capability.
 * Unlike equipment (instant, cash-only), a node takes `days` to complete and
 * only one cooks at a time, so research is a planning commitment. Effects fold
 * into `derive()` (and thus the honest forecast), stacking on the equivalent
 * equipment lines. Nodes can require `prereqs` (other completed nodes).
 */
export const RESEARCH_NODES: readonly ResearchNodeDef[] = [
  {
    id: "analytics_1",
    name: "Demand Analytics",
    icon: "📊",
    cost: 300,
    days: 2,
    prereqs: [],
    blurb: "Tighter sales & price forecasts (narrower demand swings).",
    effect: { forecastConfidence: 0.25 },
  },
  {
    id: "analytics_2",
    name: "Predictive Pricing",
    icon: "🔮",
    cost: 700,
    days: 3,
    prereqs: ["analytics_1"],
    blurb: "Read the market cold — demand is highly predictable.",
    effect: { forecastConfidence: 0.35 },
  },
  {
    id: "membership",
    name: "Membership Program",
    icon: "🎟️",
    cost: 450,
    days: 3,
    prereqs: [],
    blurb: "Regulars build 50% faster — compounding loyalty.",
    effect: { regularsGainMult: 1.5 },
  },
  {
    id: "brand_playbook",
    name: "Brand Playbook",
    icon: "📐",
    cost: 400,
    days: 2,
    prereqs: [],
    blurb: "A repeatable marketing system — passive reach every day.",
    effect: { marketingFloor: 0.1 },
  },
];

export const RESEARCH_BY_ID: Record<string, ResearchNodeDef> = Object.fromEntries(
  RESEARCH_NODES.map((n) => [n.id, n]),
);
