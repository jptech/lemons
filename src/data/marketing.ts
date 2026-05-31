/**
 * Marketing presets — these are just convenient spend points into the same
 * diminishing-returns curve the engine uses (see economy.marketingShortTerm).
 */
export interface MarketingTier {
  id: string;
  name: string;
  icon: string;
  spend: number;
  blurb: string;
}

export const MARKETING_TIERS: readonly MarketingTier[] = [
  { id: "none", name: "None", icon: "🚫", spend: 0, blurb: "Save your cash today" },
  { id: "flyers", name: "Flyers", icon: "📄", spend: 20, blurb: "A modest local nudge" },
  { id: "social", name: "Social Posts", icon: "📱", spend: 50, blurb: "Solid reach + a little buzz" },
  { id: "radio", name: "Radio Spot", icon: "📻", spend: 100, blurb: "Big reach (diminishing returns)" },
];
