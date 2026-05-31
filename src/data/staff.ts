import type { StaffDef } from "../engine/types";

/**
 * Hireable staff tiers. Each hire adds a service station; wages are charged at
 * settlement regardless of profit, so over-hiring on a poor forecast hurts.
 */
export const STAFF_TIERS: readonly StaffDef[] = [
  {
    tier: 1,
    name: "Helper",
    icon: "🧑‍🍳",
    wage: 35,
    serveSpeedBonus: 0,
    batchSpeedBonus: 0,
  },
  {
    tier: 2,
    name: "Barista",
    icon: "👩‍🍳",
    wage: 55,
    serveSpeedBonus: 0.4,
    batchSpeedBonus: 0.25,
  },
  {
    tier: 3,
    name: "Manager",
    icon: "🧑‍💼",
    wage: 80,
    serveSpeedBonus: 0.9,
    batchSpeedBonus: 0.5,
  },
];

export const STAFF_BY_TIER: Record<number, StaffDef> = Object.fromEntries(
  STAFF_TIERS.map((s) => [s.tier, s]),
);
