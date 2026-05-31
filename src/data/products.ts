import type { ArchetypeId, ProductId, Recipe } from "../engine/types";

/**
 * Product list. The slice shipped one product (classic lemonade); Phase 1 (E₀)
 * activates the multi-product path with a second drink that shares the same raw
 * ingredients but tunes to a different hidden ideal and appeals to a different
 * crowd — so it's a strategic menu choice, not free upside. (Products with their
 * own unique ingredient lines come in Phase 2 / E₊.)
 */
export interface ProductDef {
  id: ProductId;
  name: string;
  icon: string;
  /** One-line flavor for the menu UI. */
  blurb: string;
  defaultRecipe: Recipe;
  /** Shifts the weather ideal taste vector for THIS product (added then re-normalized). */
  idealShift?: { lemon: number; sugar: number; ice: number };
  /** Added to the weather ideal strength target (solids/water). */
  strengthBias?: number;
  /** Novelty multiplier on price tolerance (>1 = people pay a little more). */
  priceTolMult?: number;
  /** Per-archetype pick-weight multipliers when the product is on the menu. */
  appeal?: Partial<Record<ArchetypeId, number>>;
  /** Can this product be sold from the start, or is it unlocked later? */
  unlock?: { rep?: number; day?: number };
}

export const PRODUCTS: readonly ProductDef[] = [
  {
    id: "classic",
    name: "Classic Lemonade",
    icon: "🍋",
    blurb: "The timeless crowd-pleaser.",
    defaultRecipe: { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 },
  },
  {
    id: "pink",
    name: "Pink Lemonade",
    icon: "🌸",
    blurb: "Sweeter, fruitier novelty — kids and tourists love it.",
    defaultRecipe: { lemons: 4, sugar: 6, water: 8, ice: 3, pricePerCup: 1.75 },
    // Wants more sugar, a touch less ice than the classic ideal.
    idealShift: { lemon: -0.02, sugar: 0.1, ice: -0.06 },
    strengthBias: 0.05,
    priceTolMult: 1.12, // a fun premium
    appeal: { kid: 1.8, tourist: 1.5, adult: 1.0, regular: 1.0, healthnut: 0.5 },
    unlock: { day: 1 }, // available from the start in Phase 1
  },
];

export const PRODUCT_BY_ID: Record<string, ProductDef> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

export const DEFAULT_RECIPE: Recipe = PRODUCTS[0]!.defaultRecipe;
