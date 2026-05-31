import type { LocationDef } from "../engine/types";

/**
 * Location ladder — each tier trades higher rent + weather risk for more
 * traffic and price tolerance. `archetypeBias` reshapes the crowd (the beach
 * draws tourists; downtown draws adults; the park draws families/kids).
 */
export const LOCATIONS: readonly LocationDef[] = [
  {
    id: "suburb",
    name: "Suburb Sidewalk",
    icon: "🏡",
    baseTraffic: 120,
    priceToleranceBase: 1.8,
    rentPerDay: 15,
    unlockCost: 0,
    openMinutes: 480,
    weatherVariance: 1.0,
    archetypeBias: { kid: 1.3, regular: 1.2 },
  },
  {
    id: "park",
    name: "Town Park",
    icon: "🌳",
    baseTraffic: 220,
    priceToleranceBase: 2.4,
    rentPerDay: 45,
    unlockCost: 400,
    openMinutes: 480,
    weatherVariance: 1.15,
    archetypeBias: { kid: 1.4, tourist: 1.1 },
  },
  {
    id: "beach",
    name: "Beach Boardwalk",
    icon: "🏖️",
    baseTraffic: 380,
    priceToleranceBase: 3.1,
    rentPerDay: 110,
    unlockCost: 1500,
    openMinutes: 600,
    weatherVariance: 1.5,
    archetypeBias: { tourist: 1.8, healthnut: 1.2 },
  },
  {
    id: "downtown",
    name: "Downtown Plaza",
    icon: "🏙️",
    baseTraffic: 560,
    priceToleranceBase: 3.9,
    rentPerDay: 240,
    unlockCost: 4500,
    openMinutes: 600,
    weatherVariance: 1.25,
    archetypeBias: { adult: 1.5, healthnut: 1.4 },
  },
  {
    id: "stadium",
    name: "Stadium Gate",
    icon: "🏟️",
    baseTraffic: 850,
    priceToleranceBase: 4.8,
    rentPerDay: 520,
    unlockCost: 12000,
    openMinutes: 360,
    weatherVariance: 1.35,
    archetypeBias: { tourist: 1.3, adult: 1.3 },
  },
];

export const LOCATION_BY_ID: Record<string, LocationDef> = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
);

export const STARTER_LOCATION_ID = "suburb";
