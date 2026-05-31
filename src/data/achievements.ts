import type { AchievementDef } from "../engine/types";

/** Non-blocking badges — lifetime flavour milestones for the stats screen. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "five_stars", title: "Five Stars", desc: "Finish a day at a perfect 5.0★", icon: "🌟", check: (s) => s.history.some((h) => h.avgStars >= 4.95 && h.served > 5) },
  { id: "sold_out", title: "Sold Out!", desc: "Sell out before closing time", icon: "🪧", check: (s) => s.history.some((h) => h.stockoutMinute !== null && h.served > 10) },
  { id: "big_tipper", title: "Generous Crowd", desc: "Earn $20+ in tips in one day", icon: "🪙", check: (s) => s.history.some((h) => h.tips >= 20) },
  { id: "streak_7", title: "On a Roll", desc: "Profit 7 days in a row", icon: "🔥", check: (s) => s.stats.longestProfitStreak >= 7 },
  { id: "zero_waste", title: "Zero Waste", desc: "Finish a selling day with no spoilage", icon: "♻️", check: (s) => s.history.some((h) => h.spoiled.ice === 0 && h.spoiled.lemons === 0 && h.cupsSold > 0) },
  { id: "windfall", title: "Windfall", desc: "Clear $250 profit in a single day", icon: "💸", check: (s) => s.stats.bestDayProfit >= 250 },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
