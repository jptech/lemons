import type { ArchetypeDef, ArchetypeId } from "../engine/types";

/**
 * Customer archetypes. Each perturbs the shared per-customer model — price
 * sensitivity, patience, taste target, and tipping — rather than adding new
 * systems. The mix is reshaped by location bias and (for regulars) reputation.
 */
export const ARCHETYPES: readonly ArchetypeDef[] = [
  {
    id: "kid",
    name: "Kid",
    icon: "🧒",
    priceSensitivity: 1.6,
    patienceMult: 0.7,
    tasteShift: { lemon: -0.02, sugar: 0.06, ice: 0.0 }, // sweeter
    tipGenerosity: 0.1,
    baseWeight: 0.9,
  },
  {
    id: "adult",
    name: "Regular Joe",
    icon: "🧑",
    priceSensitivity: 1.0,
    patienceMult: 1.0,
    tasteShift: { lemon: 0, sugar: 0, ice: 0 },
    tipGenerosity: 0.4,
    baseWeight: 1.6,
  },
  {
    id: "tourist",
    name: "Tourist",
    icon: "📸",
    priceSensitivity: 0.7,
    patienceMult: 1.0,
    tasteShift: { lemon: 0, sugar: 0, ice: 0.02 },
    tipGenerosity: 0.7,
    baseWeight: 0.7,
  },
  {
    id: "regular",
    name: "Regular",
    icon: "💛",
    priceSensitivity: 0.7,
    patienceMult: 1.4,
    tasteShift: { lemon: 0, sugar: 0, ice: 0 }, // knows & likes your recipe
    tipGenerosity: 0.7,
    baseWeight: 0.0, // injected from regularsPool, not the base mix
  },
  {
    id: "healthnut",
    name: "Health Nut",
    icon: "🧘",
    priceSensitivity: 1.0,
    patienceMult: 1.0,
    tasteShift: { lemon: 0.05, sugar: -0.07, ice: 0.0 }, // tart, less sugar
    tipGenerosity: 0.5,
    baseWeight: 0.5,
  },
];

export const ARCHETYPE_BY_ID: Record<ArchetypeId, ArchetypeDef> =
  Object.fromEntries(ARCHETYPES.map((a) => [a.id, a])) as Record<
    ArchetypeId,
    ArchetypeDef
  >;
