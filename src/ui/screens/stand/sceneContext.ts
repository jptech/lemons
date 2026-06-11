/**
 * Read-only scene description built from GameState for the canvas stand view.
 * Pure data extraction — no engine writes, no DOM.
 */
import type { GameState, WeatherDay } from "../../../engine";
import { EQUIPMENT_BY_ID } from "../../../data/equipment";
import { PRODUCT_BY_ID } from "../../../data/products";

export interface SceneContext {
  weather: WeatherDay;
  locationId: string;
  /** Equipment line → highest owned level (absent line = not owned). */
  equip: Record<string, number>;
  /** Hired staff in station order (station id 1..n maps to index 0..n-1). */
  staffByStation: { icon: string; tier: 1 | 2 | 3 }[];
  /** Icons of the products on today's menu. */
  menuIcons: string[];
  regularsPool: number;
  eventId: string | null;
}

export function buildSceneContext(game: GameState): SceneContext {
  const equip: Record<string, number> = {};
  for (const id of game.ownedEquipmentIds) {
    const def = EQUIPMENT_BY_ID[id];
    if (!def) continue;
    equip[def.line] = Math.max(equip[def.line] ?? 0, def.level);
  }
  return {
    weather: game.weatherToday,
    locationId: game.currentLocationId,
    equip,
    staffByStation: game.staff.map((st) => ({ icon: st.icon, tier: st.tier })),
    menuIcons: game.menu.map((id) => PRODUCT_BY_ID[id]?.icon ?? "🥤"),
    regularsPool: game.regularsPool ?? 0,
    eventId: game.activeEventId ?? null,
  };
}
