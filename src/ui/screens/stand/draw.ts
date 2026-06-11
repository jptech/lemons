/**
 * Shared canvas drawing utilities for the stand scene: geometry, rounded
 * rects, ground shadows, and a baked emoji sprite cache (the queue/walkers
 * redraw the same glyphs every frame — `drawImage` of a pre-rendered glyph is
 * far cheaper than `fillText` of an emoji).
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

/** Soft elliptical ground shadow under a sprite/prop of width `w` at (x, y). */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  sunT: number,
  alpha = 0.1,
): void {
  const { dx, stretch } = sunShadowParams(sunT);
  ctx.fillStyle = `rgba(58,46,32,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x + dx * 0.5, y, (w / 2) * stretch, w * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
}
