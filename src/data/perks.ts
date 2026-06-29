/**
 * Prestige perks — permanent upgrades bought with the Prestige currency earned
 * from the endless Tycoon ladder (and cash conversion). Declarative + add-only.
 *
 * Design rule (do not break): a perk must unlock a *recurring decision or cost*,
 * never a flat passive multiplier — otherwise it just re-creates the plateau one
 * tier higher. The starter set opens menu capacity and a premium marketing
 * channel; later late-game phases append more perks here.
 */
import { TUNING } from "../engine/tuning";

export interface PerkEffect {
  /** Extra active-menu slots (raises the menu cap). */
  menuSlots?: number;
}

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  /** Prestige cost. */
  cost: number;
  blurb: string;
  /** Another perk that must be owned first. */
  prereq?: string;
  effect: PerkEffect;
}

export const PERKS: readonly PerkDef[] = [
  {
    id: "menu_slot",
    name: "Bigger Menu Board",
    icon: "📋",
    cost: 6,
    blurb: "Run a third drink at once — more recipe puzzles, more crew pressure.",
    effect: { menuSlots: 1 },
  },
  {
    id: "menu_slot_2",
    name: "Full Menu Board",
    icon: "🗒️",
    cost: 14,
    prereq: "menu_slot",
    blurb: "Run a fourth drink. Only worth it with the equipment & staff to serve it.",
    effect: { menuSlots: 1 },
  },
  {
    id: "billboard",
    name: "Billboard Deal",
    icon: "🪧",
    cost: 10,
    blurb: "Unlock the $200 Billboard marketing blitz — a bigger daily reach lever.",
    effect: {},
  },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(
  PERKS.map((p) => [p.id, p]),
);

/** Total extra menu slots granted by the owned perks. */
export function perkMenuSlots(ownedPerkIds: readonly string[]): number {
  let n = 0;
  for (const id of ownedPerkIds) n += PERK_BY_ID[id]?.effect.menuSlots ?? 0;
  return n;
}

/** Active-menu capacity given the owned perks. */
export function menuCapFor(ownedPerkIds: readonly string[]): number {
  return TUNING.BASE_MENU_CAP + perkMenuSlots(ownedPerkIds);
}
