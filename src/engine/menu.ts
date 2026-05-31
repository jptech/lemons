/**
 * Menu helpers — pure accessors over the per-product state. The primary product
 * (menu[0]) backs the legacy single-recipe call-sites; the full menu drives the
 * multi-product day simulation.
 */
import { PRODUCT_BY_ID, PRODUCTS } from "../data/products";
import type { ProductDef } from "../data/products";
import { DEFAULT_RECIPE } from "../data/products";
import type { GameState, ProductId, ProductState } from "./types";

export function freshProductState(id: ProductId): ProductState {
  const def = PRODUCT_BY_ID[id];
  return {
    recipe: { ...(def?.defaultRecipe ?? DEFAULT_RECIPE) },
    qualityScoreEMA: 0.5,
    recipeFeedback: { lemon: 0, sugar: 0, ice: 0 },
    priceFeedback: 0,
  };
}

/** A full products map seeded at defaults (every known product present). */
export function freshProducts(): Record<ProductId, ProductState> {
  const out = {} as Record<ProductId, ProductState>;
  for (const p of PRODUCTS) out[p.id] = freshProductState(p.id);
  return out;
}

export function primaryProductId(state: GameState): ProductId {
  return state.menu[0] ?? "classic";
}

export function productStateOf(state: GameState, id: ProductId): ProductState {
  return state.products[id] ?? freshProductState(id);
}

export function primaryProduct(state: GameState): ProductState {
  return productStateOf(state, primaryProductId(state));
}

export interface ActiveProduct {
  id: ProductId;
  def: ProductDef;
  state: ProductState;
}

/** The products currently on the menu, in menu order (primary first). */
export function activeProducts(state: GameState): ActiveProduct[] {
  const out: ActiveProduct[] = [];
  for (const id of state.menu) {
    const def = PRODUCT_BY_ID[id];
    if (!def) continue;
    out.push({ id, def, state: productStateOf(state, id) });
  }
  return out;
}

/** The taste profile (ideal shift / strength bias) for a product, for economy. */
export function productTaste(id: ProductId): { idealShift?: { lemon: number; sugar: number; ice: number }; strengthBias?: number } {
  const def = PRODUCT_BY_ID[id];
  return { idealShift: def?.idealShift, strengthBias: def?.strengthBias };
}
