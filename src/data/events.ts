import type { DayEventDef } from "../engine/types";

/**
 * Random daily event deck. Effects are plain modifiers applied deterministically
 * by the engine (no functions → fully serializable & testable). New events are
 * add-only data. Wired into the planning flow in the depth-layer step.
 */
export const EVENTS: readonly DayEventDef[] = [
  {
    id: "festival",
    title: "Street Festival!",
    blurb: "A parade rolls through today — crowds everywhere. Stock up!",
    icon: "🎉",
    weight: 1,
    effect: { trafficMult: 1.6 },
  },
  {
    id: "heatwave_alert",
    title: "Heatwave Alert",
    blurb: "It's going to be a scorcher. Thirsty crowds, but pack the ice.",
    icon: "🥵",
    weight: 1,
    effect: { trafficMult: 1.3 },
  },
  {
    id: "lemon_shortage",
    title: "Lemon Shortage",
    blurb: "Suppliers hiked lemon prices today. Buy carefully.",
    icon: "📉",
    weight: 1,
    effect: { lemonPriceMult: 2.2 },
  },
  {
    id: "field_trip",
    title: "School Field Trip",
    blurb: "A busload of kids is coming by — fast, cheap, and impatient.",
    icon: "🚌",
    weight: 1,
    effect: { trafficMult: 1.25 },
  },
  {
    id: "rival",
    title: "Rival Stand Opens",
    blurb: "A competitor set up nearby and split the crowd. Win them back.",
    icon: "🥊",
    weight: 1,
    minDay: 4,
    effect: { trafficMult: 0.7 },
  },
  {
    id: "influencer",
    title: "Influencer Visit",
    blurb: "A local foodie posted about you — a nice little buzz today.",
    icon: "🤳",
    weight: 1,
    minDay: 3,
    effect: { trafficMult: 1.2, repDelta: 2 },
  },
  {
    id: "perfect_day",
    title: "Picture-Perfect Day",
    blurb: "Clear skies and good vibes — forecasts are spot on.",
    icon: "🌈",
    weight: 1,
    effect: { trafficMult: 1.1, forecastReliable: true },
  },
];

export const EVENT_BY_ID: Record<string, DayEventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e]),
);

/** Roughly how often a day has an event at all (vs. an ordinary day). */
export const EVENT_CHANCE = 0.45;
