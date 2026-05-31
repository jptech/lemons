import type { ProductId, Recipe } from "../engine/types";

/**
 * Product list. The slice ships one product (classic lemonade); the model is a
 * list so pink lemonade / limeade / iced tea / snacks slot in later without
 * reshaping inventory or the sim.
 */
export interface ProductDef {
  id: ProductId;
  name: string;
  icon: string;
  defaultRecipe: Recipe;
}

export const PRODUCTS: readonly ProductDef[] = [
  {
    id: "classic",
    name: "Classic Lemonade",
    icon: "🍋",
    defaultRecipe: { lemons: 4, sugar: 4, water: 8, ice: 4, pricePerCup: 1.5 },
  },
];

export const DEFAULT_RECIPE: Recipe = PRODUCTS[0]!.defaultRecipe;
