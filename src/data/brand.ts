/**
 * Branding — the single place to rename / re-skin the game's identity.
 * Pure data, no imports, safe for both engine and UI.
 */
export const BRAND = {
  name: "Lemonade Lane",
  tagline: "Squeeze the day.",
  mascot: "🍋",
  /** Emoji icon set reused across the UI. */
  icons: {
    lemon: "🍋",
    sun: "☀️",
    rain: "🌧️",
    cloud: "☁️",
    cold: "❄️",
    heat: "🔥",
    ice: "🧊",
    sugar: "🍬",
    cup: "🥤",
    money: "💰",
    tip: "🪙",
    star: "⭐",
    staff: "🧑‍🍳",
    marketing: "📣",
    beach: "🏖️",
    park: "🌳",
    city: "🏙️",
    stadium: "🏟️",
    happy: "😊",
    neutral: "😐",
    angry: "😠",
    leave: "💨",
    yum: "😋",
  },
} as const;

export type BrandIcon = keyof typeof BRAND.icons;
