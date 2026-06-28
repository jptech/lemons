/**
 * Shared canvas drawing utilities for the stand scene: geometry, color math
 * (the whole scene shares one warm palette), deterministic hash variation,
 * soft gradient shadows, rounded rects, and a baked emoji sprite cache (a few
 * glyphs — product icons, weather props — still render as emoji "stickers";
 * `drawImage` of a pre-rendered glyph is far cheaper than `fillText`).
 */

export interface SceneGeom {
  W: number;
  H: number;
  /** Stand box. */
  left: number;
  w: number;
  cx: number;
  cy: number;
  roofY: number;
  counterBottom: number;
  post: number;
  /** Grass/ground starts here. */
  groundY: number;
  /** Sidewalk centerline where foot traffic strolls. */
  laneY: number;
}

export function sceneGeom(W: number, H: number): SceneGeom {
  const cx = Math.min(W * 0.42, 360);
  const cy = H * 0.66;
  const left = 24;
  return {
    W,
    H,
    left,
    w: cx - left,
    cx,
    cy,
    roofY: cy - 104,
    counterBottom: cy + 58,
    post: 12,
    groundY: cy + 54,
    laneY: H * 0.9,
  };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- palette & color math ------------------------------------------------------

/** The scene's ink — matches --c-ink in theme.css. */
export const INK = "#3a2e20";

const WARM_BLACK: [number, number, number] = [43, 31, 18];
const WARM_WHITE: [number, number, number] = [255, 253, 243];

/** Parse "#rrggbb" or "rgb(r,g,b)" (our own mix/shade output feeds back in). */
function hexToRgb(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function rgbStr(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Mix two hex colors. t=0 → a, t=1 → b. */
export function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbStr(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * Shade a hex color toward warm black (amt < 0) or warm white (amt > 0).
 * Mixing toward warm poles instead of pure #000/#fff keeps the palette cozy.
 */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = amt < 0 ? WARM_BLACK : WARM_WHITE;
  const t = Math.min(1, Math.abs(amt));
  return rgbStr(r + (tr - r) * t, g + (tg - g) * t, b + (tb - b) * t);
}

/** hex + alpha → rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Deterministic 0..1 hash — gives sprites/props stable cosmetic variety
 * (outfit colors, tuft positions) without threading a PRNG through the view.
 */
export function hash01(seed: number, salt = 0): number {
  let h = (Math.imul(seed | 0, 0x9e3779b9) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 0xffffffff;
}

/** Pick a stable element of `arr` for (seed, salt). */
export function hashPick<T>(arr: readonly T[], seed: number, salt = 0): T {
  return arr[Math.min(arr.length - 1, Math.floor(hash01(seed, salt) * arr.length))]!;
}

// --- emoji sprite cache ------------------------------------------------------

const glyphCache = new Map<string, HTMLCanvasElement>();

function bakeGlyph(icon: string, size: number): HTMLCanvasElement {
  const pad = Math.ceil(size * 0.35);
  const side = size + pad * 2;
  const scale = 2; // bake at 2x so glyphs stay crisp on retina
  const c = document.createElement("canvas");
  c.width = side * scale;
  c.height = side * scale;
  const g = c.getContext("2d")!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.font = `${size}px serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(icon, side / 2, side / 2 + size * 0.04);
  return c;
}

/**
 * Draw an emoji glyph centered at (x, y). Sizes are bucketed to whole pixels
 * so the cache stays small (~one entry per distinct glyph+size).
 */
export function drawEmoji(
  ctx: CanvasRenderingContext2D,
  icon: string,
  x: number,
  y: number,
  size: number,
  alpha = 1,
): void {
  const bucket = Math.round(size);
  const key = `${icon}@${bucket}`;
  let sprite = glyphCache.get(key);
  if (!sprite) {
    sprite = bakeGlyph(icon, bucket);
    glyphCache.set(key, sprite);
  }
  const side = sprite.width / 2; // baked at 2x
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - side / 2, y - side / 2, side, side);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// --- sun-driven ground shadows ----------------------------------------------

/** Horizontal shadow offset + stretch for the current sun position (0..1). */
export function sunShadowParams(sunT: number): { dx: number; stretch: number } {
  return {
    dx: (0.5 - sunT) * 26,
    stretch: 1 + Math.pow(Math.abs(sunT - 0.5) * 2, 1.5) * 0.8,
  };
}

/**
 * Soft elliptical ground shadow under a sprite/prop of width `w` at (x, y).
 * Radial-gradient falloff (dense core, feathered edge) grounds sprites far
 * better than a flat ellipse.
 */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  sunT: number,
  alpha = 0.1,
): void {
  const { dx, stretch } = sunShadowParams(sunT);
  const rx = Math.max(2, (w / 2) * stretch);
  const ry = Math.max(1.5, w * 0.14);
  ctx.save();
  ctx.translate(x + dx * 0.5, y);
  ctx.scale(1, ry / rx);
  const grad = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
  grad.addColorStop(0, `rgba(58,46,32,${alpha * 1.5})`);
  grad.addColorStop(1, "rgba(58,46,32,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- shared lemonade cup -------------------------------------------------------

/**
 * A to-go lemonade cup, drawn feet-up from its bottom-center at (x, y).
 * Used by carried-cup peeps, the counter stack, and flying-cup FX.
 */
export function drawCup(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, withStraw = true): void {
  const topW = h * 0.82;
  const botW = h * 0.6;
  // body
  ctx.beginPath();
  ctx.moveTo(x - topW / 2, y - h);
  ctx.lineTo(x + topW / 2, y - h);
  ctx.lineTo(x + botW / 2, y);
  ctx.lineTo(x - botW / 2, y);
  ctx.closePath();
  ctx.fillStyle = "#fffdf3";
  ctx.fill();
  // lemonade band showing through the sleeve
  ctx.beginPath();
  ctx.moveTo(x - topW * 0.44, y - h * 0.78);
  ctx.lineTo(x + topW * 0.44, y - h * 0.78);
  ctx.lineTo(x + topW * 0.4, y - h * 0.4);
  ctx.lineTo(x - topW * 0.4, y - h * 0.4);
  ctx.closePath();
  ctx.fillStyle = "#ffe066";
  ctx.fill();
  // rim
  ctx.fillStyle = "#f3e9cd";
  ctx.fillRect(x - topW / 2, y - h, topW, h * 0.14);
  ctx.strokeStyle = withAlpha(INK, 0.3);
  ctx.lineWidth = Math.max(0.8, h * 0.07);
  ctx.beginPath();
  ctx.moveTo(x - topW / 2, y - h);
  ctx.lineTo(x + topW / 2, y - h);
  ctx.lineTo(x + botW / 2, y);
  ctx.lineTo(x - botW / 2, y);
  ctx.closePath();
  ctx.stroke();
  if (withStraw) {
    ctx.strokeStyle = "#ff8787";
    ctx.lineWidth = Math.max(1, h * 0.1);
    ctx.beginPath();
    ctx.moveTo(x + topW * 0.12, y - h);
    ctx.lineTo(x + topW * 0.34, y - h * 1.45);
    ctx.stroke();
  }
}
