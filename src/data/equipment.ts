import type { EquipmentDef } from "../engine/types";

/**
 * Equipment catalogue — organised into upgrade LINES with stacking LEVELS.
 * Within a line, only the highest owned level applies (effects are TOTALS, not
 * deltas). Different lines stack. Advanced levels are gated by `unlock`
 * prerequisites (a better location, reputation, or day).
 */
export const EQUIPMENT: readonly EquipmentDef[] = [
  // --- Storage (cooler) ---
  { id: "cooler_1", line: "cooler", level: 1, name: "Bigger Cooler", icon: "🧊", cost: 80, blurb: "+40 storage slots", effects: { storageSlots: 40 } },
  { id: "cooler_2", line: "cooler", level: 2, name: "Cold Room", icon: "🧊", cost: 220, blurb: "+100 storage slots", effects: { storageSlots: 100 }, unlock: { location: "park" } },
  { id: "cooler_3", line: "cooler", level: 3, name: "Cold Warehouse", icon: "🏬", cost: 600, blurb: "+220 storage slots", effects: { storageSlots: 220 }, unlock: { location: "downtown" } },

  // --- Ice retention (insulation) ---
  { id: "iceret_1", line: "insulation", level: 1, name: "Insulated Cooler", icon: "❄️", cost: 260, blurb: "Keeps 60% of ice overnight", effects: { iceRetention: 0.6 } },
  { id: "iceret_2", line: "insulation", level: 2, name: "Deep Freeze", icon: "❄️", cost: 560, blurb: "Keeps 85% of ice overnight", effects: { iceRetention: 0.85 }, unlock: { location: "beach" } },

  // --- Ice production (icemaker) ---
  { id: "icemaker_1", line: "icemaker", level: 1, name: "Ice Maker", icon: "🧊", cost: 340, blurb: "Makes ~0.5 ice/min all day", effects: { iceRegenPerMin: 0.5 } },
  { id: "icemaker_2", line: "icemaker", level: 2, name: "Pro Ice Machine", icon: "🏭", cost: 720, blurb: "Makes ~1.2 ice/min all day", effects: { iceRegenPerMin: 1.2 }, unlock: { location: "beach" } },

  // --- Serve speed (dispenser) ---
  { id: "disp_1", line: "dispenser", level: 1, name: "Fast Dispenser", icon: "🚰", cost: 120, blurb: "Serve faster (×1.4)", effects: { serveSpeedMult: 0.4 } },
  { id: "disp_2", line: "dispenser", level: 2, name: "Two-Tap Dispenser", icon: "🔱", cost: 300, blurb: "Serve much faster (×1.9)", effects: { serveSpeedMult: 0.9 } },
  { id: "disp_3", line: "dispenser", level: 3, name: "Auto-Pour Station", icon: "🤖", cost: 800, blurb: "Lightning service (×2.6)", effects: { serveSpeedMult: 1.6 }, unlock: { location: "downtown" } },

  // --- Batch size (pitchers) ---
  { id: "pitch_1", line: "pitchers", level: 1, name: "Large Pitcher Set", icon: "🫙", cost: 90, blurb: "Bigger batches (×1.5)", effects: { batchSizeMult: 0.5 } },
  { id: "pitch_2", line: "pitchers", level: 2, name: "Industrial Batch", icon: "🛢️", cost: 280, blurb: "Huge batches (×2.1)", effects: { batchSizeMult: 1.1 }, unlock: { rep: 25 } },

  // --- Batch speed (brewer) ---
  { id: "brew_1", line: "brewer", level: 1, name: "Power Brewer", icon: "⚡", cost: 180, blurb: "Mix batches faster (×1.6)", effects: { batchSpeedMult: 0.6 } },
  { id: "brew_2", line: "brewer", level: 2, name: "Turbo Brewer", icon: "🌀", cost: 480, blurb: "Mix batches blazing fast (×2.3)", effects: { batchSpeedMult: 1.3 }, unlock: { location: "park" } },

  // --- Patience (comfort) ---
  { id: "comf_1", line: "comfort", level: 1, name: "Patio Umbrella", icon: "⛱️", cost: 70, blurb: "Shade keeps the line patient (+0.25)", effects: { patienceMult: 0.25 } },
  { id: "comf_2", line: "comfort", level: 2, name: "Bench Seating", icon: "🪑", cost: 200, blurb: "Comfier wait (+0.6)", effects: { patienceMult: 0.6 } },
  { id: "comf_3", line: "comfort", level: 3, name: "Shaded Lounge", icon: "🛋️", cost: 500, blurb: "Guests barely mind a line (+1.0)", effects: { patienceMult: 1.0 }, unlock: { location: "beach" } },

  // --- Curb appeal (signage) ---
  { id: "sign_1", line: "signage", level: 1, name: "Lit Menu Sign", icon: "🪧", cost: 110, blurb: "Passive curb appeal (+0.05 reach)", effects: { marketingFloor: 0.05 } },
  { id: "sign_2", line: "signage", level: 2, name: "Neon Sign", icon: "🎆", cost: 300, blurb: "Eye-catching (+0.12 reach)", effects: { marketingFloor: 0.12 }, unlock: { location: "downtown" } },

  // --- Weather forecasting (forecast) ---
  { id: "wx_1", line: "forecast", level: 1, name: "Weather Radio", icon: "📻", cost: 130, blurb: "Sharper weather forecasts", effects: { forecastAccuracy: 0.15 } },
  { id: "wx_2", line: "forecast", level: 2, name: "Weather Station", icon: "🛰️", cost: 350, blurb: "Very reliable forecasts", effects: { forecastAccuracy: 0.3 }, unlock: { location: "park" } },

  // --- NEW: Customer research (narrows demand/pricing uncertainty) ---
  { id: "research_1", line: "research", level: 1, name: "Customer Survey Board", icon: "📋", cost: 200, blurb: "Sharper sales & price reads", effects: { forecastConfidence: 0.4 } },
  { id: "research_2", line: "research", level: 2, name: "Market Research", icon: "🔬", cost: 520, blurb: "Know your numbers cold", effects: { forecastConfidence: 0.8 }, unlock: { location: "downtown" } },

  // --- NEW: Loyalty program (grows regulars faster) ---
  { id: "loyalty_1", line: "loyalty", level: 1, name: "Loyalty Punch Cards", icon: "💳", cost: 240, blurb: "Regulars build ~70% faster", effects: { regularsGainMult: 1.7 }, unlock: { location: "park" } },
];

export const EQUIPMENT_BY_ID: Record<string, EquipmentDef> = Object.fromEntries(
  EQUIPMENT.map((e) => [e.id, e]),
);

/** Ordered levels for each line. */
export const EQUIPMENT_LINES: { line: string; levels: EquipmentDef[] }[] = (() => {
  const byLine = new Map<string, EquipmentDef[]>();
  for (const e of EQUIPMENT) {
    const arr = byLine.get(e.line) ?? [];
    arr.push(e);
    byLine.set(e.line, arr);
  }
  return [...byLine.entries()].map(([line, levels]) => ({
    line,
    levels: levels.sort((a, b) => a.level - b.level),
  }));
})();

/** Old (flat) equipment ids → new line/level ids, for save migration. */
export const LEGACY_EQUIPMENT_MAP: Record<string, string> = {
  cooler_big: "cooler_1",
  cooler_insulated: "iceret_1",
  ice_maker: "icemaker_1",
  dispenser_fast: "disp_1",
  dispenser_twotap: "disp_2",
  pitchers_large: "pitch_1",
  brewer_power: "brew_1",
  umbrella: "comf_1",
  seating: "comf_2",
  sign_lit: "sign_1",
  weather_radio: "wx_1",
};
