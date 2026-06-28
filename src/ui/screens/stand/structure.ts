/**
 * The stand's structure: plank back wall, counter (with a glass pitcher whose
 * fill level tracks the live ready-cup pool, a cup stack that drains with
 * stock, and a tip jar that fills with the day's tips), scalloped awning with
 * string lights that glow on at dusk, the hanging sign, and the owned-equipment
 * props. Equipment visuals are a declarative table keyed by equipment line +
 * minimum level, so new gear in src/data/equipment.ts stays add-only here too.
 */
import type { SimSnapshot } from "../../../engine";
import type { SceneContext } from "./sceneContext";
import { clamp01 } from "../../tween";
import { INK, drawCup, drawEmoji, drawShadow, hash01, roundRect, shade, withAlpha, type SceneGeom } from "./draw";

/** Hanging-sign display state (flips OPEN/CLOSED via scaleY). */
export interface SignState {
  text: string;
  color: string;
  scaleY: number;
}

export const DEFAULT_SIGN: SignState = { text: "🍋 LEMONADE", color: "#3a2e20", scaleY: 1 };

const WOOD = "#c99a5b";
const WOOD_DEEP = "#a87b3f";
const WALL = "#e8c99a";

// --- anchor points shared with fx.ts -----------------------------------------

/** Where the pitcher sits (base center, on the counter top). */
export function pitcherPos(g: SceneGeom): { x: number; y: number } {
  return { x: g.left + 30, y: g.cy - 3 };
}

/** Where the tip jar sits (base center, on the counter top). */
export function tipJarPos(g: SceneGeom): { x: number; y: number } {
  return { x: g.cx - 24, y: g.cy - 3 };
}

const SCALLOPS = 8;

/** The awning's scallop tip points (rain drips fall from these). */
export function awningScallopTips(g: SceneGeom): { x: number; y: number }[] {
  const ax = g.left - 8;
  const sw = (g.w + 16) / SCALLOPS;
  const tips: { x: number; y: number }[] = [];
  for (let i = 0; i < SCALLOPS; i++) tips.push({ x: ax + sw * (i + 0.5), y: g.roofY + 19 });
  return tips;
}

// --- structure ----------------------------------------------------------------

/** Plank back wall + two posts — gives the booth structure behind the counter. */
export function drawStandBack(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const { left, w, cx, cy, roofY, post } = g;

  ctx.fillStyle = WALL;
  roundRect(ctx, left + post - 2, roofY + 8, w - 2 * (post - 2), cy - roofY - 4, 6);
  ctx.fill();

  // vertical planks with subtle alternating tone + a few knots
  const inner = w - 2 * post;
  const planks = Math.max(4, Math.round(inner / 22));
  const pw = inner / planks;
  for (let i = 0; i < planks; i++) {
    const px = left + post + i * pw;
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(168,123,63,0.08)";
      ctx.fillRect(px, roofY + 10, pw, cy - roofY - 8);
    }
    ctx.strokeStyle = "rgba(168,123,63,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, roofY + 12);
    ctx.lineTo(px, cy - 4);
    ctx.stroke();
    if (hash01(i, 11) < 0.4) {
      ctx.fillStyle = "rgba(168,123,63,0.3)";
      ctx.beginPath();
      ctx.ellipse(px + pw * 0.5, roofY + 30 + hash01(i, 12) * (cy - roofY - 60), 1.8, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the awning casts a soft band of shade on the top of the wall
  const sh = ctx.createLinearGradient(0, roofY + 8, 0, roofY + 30);
  sh.addColorStop(0, "rgba(58,46,32,0.18)");
  sh.addColorStop(1, "rgba(58,46,32,0)");
  ctx.fillStyle = sh;
  roundRect(ctx, left + post - 2, roofY + 8, w - 2 * (post - 2), 24, 6);
  ctx.fill();

  // posts (lit face + shaded edge)
  for (const px of [left, cx - post]) {
    ctx.fillStyle = WOOD_DEEP;
    roundRect(ctx, px, roofY, post, cy - roofY + 6, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,253,243,0.18)";
    ctx.fillRect(px + 1.5, roofY + 2, 3, cy - roofY);
    ctx.fillStyle = "rgba(43,31,18,0.18)";
    ctx.fillRect(px + post - 3, roofY + 2, 2, cy - roofY);
  }
}

/** Soft ground shadow under the whole booth (stretches with the sun). */
export function drawStandShadow(ctx: CanvasRenderingContext2D, g: SceneGeom, sunT: number): void {
  drawShadow(ctx, g.left + g.w / 2, g.counterBottom + 6, g.w * 0.9, sunT, 0.08);
}

export function drawCounter(
  ctx: CanvasRenderingContext2D,
  g: SceneGeom,
  snap: SimSnapshot,
  scene: SceneContext,
  animT: number,
): void {
  const { left, w, cx, cy, counterBottom } = g;

  // counter top lip with grain strokes
  ctx.fillStyle = WOOD_DEEP;
  roundRect(ctx, left - 4, cy - 4, w + 8, 14, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,253,243,0.16)";
  ctx.fillRect(left - 2, cy - 3, w + 4, 3);
  ctx.strokeStyle = "rgba(43,31,18,0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const gx = left + 14 + hash01(i, 21) * (w - 40);
    ctx.beginPath();
    ctx.moveTo(gx, cy + 1);
    ctx.lineTo(gx + 12 + hash01(i, 22) * 14, cy + 4);
    ctx.stroke();
  }

  // apron (front face) with plank seams
  ctx.fillStyle = WOOD;
  roundRect(ctx, left, cy + 8, w, counterBottom - cy - 8, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(168,123,63,0.45)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const py = cy + 8 + ((counterBottom - cy - 8) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(left + 6, py);
    ctx.lineTo(left + w - 6, py);
    ctx.stroke();
  }
  // skirt shadow under the lip
  const lipSh = ctx.createLinearGradient(0, cy + 8, 0, cy + 20);
  lipSh.addColorStop(0, "rgba(58,46,32,0.22)");
  lipSh.addColorStop(1, "rgba(58,46,32,0)");
  ctx.fillStyle = lipSh;
  ctx.fillRect(left + 2, cy + 8, w - 4, 12);

  // painted lemon badge on the apron — the stand's brand
  const bx = left + w / 2;
  const by = cy + (counterBottom - cy) / 2 + 5;
  ctx.fillStyle = "#fffdf3";
  ctx.beginPath();
  ctx.arc(bx, by, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(168,123,63,0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffd43b";
  ctx.beginPath();
  ctx.ellipse(bx, by, 9.5, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(168,123,63,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(bx, by, 6, 4.8, -0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#69db7c";
  ctx.beginPath();
  ctx.ellipse(bx + 8, by - 7.5, 3.4, 1.7, -0.5, 0, Math.PI * 2);
  ctx.fill();

  drawPitcher(ctx, g, snap, animT);
  drawCupStack(ctx, g, snap);
  drawTipJar(ctx, g, snap, animT);
  drawMenuBoard(ctx, g, scene);

  // ready count pill beside the pitcher
  const ready = Math.floor(snap.pitcherPool);
  const label = `${ready} ready`;
  ctx.font = "bold 11px 'Fredoka', system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  const px = pitcherPos(g).x + 24;
  const py = cy - 16;
  ctx.fillStyle = "rgba(255,253,243,0.92)";
  roundRect(ctx, px - 5, py - 8, tw + 10, 16, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(168,123,63,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = ready > 0 ? "#3a2e20" : "#e03131";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px, py + 0.5);
}

/** Glass pitcher of lemonade — its fill level IS the live ready-cup pool. */
function drawPitcher(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot, animT: number): void {
  const { x, y } = pitcherPos(g);
  const w = 26;
  const h = 36;
  const top = y - h;
  const fill = snap.pitcherPool > 0 ? 0.22 + 0.78 * clamp01(snap.pitcherPool / 16) : 0;

  // glass body (slightly tapered)
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 3, top + 4);
    ctx.lineTo(x - w / 2, y - 3);
    ctx.quadraticCurveTo(x - w / 2, y, x - w / 2 + 4, y);
    ctx.lineTo(x + w / 2 - 4, y);
    ctx.quadraticCurveTo(x + w / 2, y, x + w / 2, y - 3);
    ctx.lineTo(x + w / 2 - 3, top + 4);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = "rgba(220,235,245,0.45)";
  ctx.fill();

  // lemonade
  if (fill > 0.01) {
    const lvl = y - 2 - (h - 8) * fill;
    ctx.save();
    body();
    ctx.clip();
    const grad = ctx.createLinearGradient(0, lvl, 0, y);
    grad.addColorStop(0, "#ffe680");
    grad.addColorStop(1, "#ffd43b");
    ctx.fillStyle = grad;
    ctx.fillRect(x - w / 2, lvl, w, y - lvl);
    // surface line + bobbing lemon wheel
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(x - w / 2, lvl, w, 1.6);
    const bobY = lvl + 4 + Math.sin(animT * 1.4) * 1;
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(x - 3, bobY, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(232,168,0,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x - 3, bobY, 4.4, 0, Math.PI * 2);
    ctx.moveTo(x - 3, bobY - 4.4);
    ctx.lineTo(x - 3, bobY + 4.4);
    ctx.moveTo(x - 7.4, bobY);
    ctx.lineTo(x + 1.4, bobY);
    ctx.stroke();
    // ice cubes
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (const [ix, iy] of [[x + 4, lvl + 7], [x - 1, lvl + 13]] as const) {
      roundRect(ctx, ix, iy + Math.sin(animT * 1.8 + ix) * 0.8, 5, 5, 1.5);
      ctx.fill();
    }
    ctx.restore();
  }

  // glass outline, gloss, spout, handle
  body();
  ctx.strokeStyle = "rgba(90,110,130,0.55)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 5.5, top + 9);
  ctx.lineTo(x - w / 2 + 7.5, y - 7);
  ctx.stroke();
  // spout
  ctx.strokeStyle = "rgba(90,110,130,0.55)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 1, top + 5);
  ctx.quadraticCurveTo(x - w / 2 - 4, top + 3, x - w / 2 - 1, top + 9);
  ctx.stroke();
  // handle
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 1, top + 8);
  ctx.quadraticCurveTo(x + w / 2 + 8, top + 14, x + w / 2 - 1, y - 9);
  ctx.stroke();
}

/** Stack of paper cups — height tracks the remaining cup stock. */
function drawCupStack(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot): void {
  const x = g.left + g.w * 0.68;
  const y = g.cy - 3;
  const count = Math.min(5, Math.ceil(snap.stock.cup / 14));
  for (let i = 0; i < count; i++) drawCup(ctx, x, y - i * 5.5, 11, false);
}

/** Tip jar — coins pile up as the day's tips come in. */
function drawTipJar(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot, animT: number): void {
  const { x, y } = tipJarPos(g);
  const w = 17;
  const h = 21;
  const top = y - h;
  const fill = clamp01(snap.tips / 14);

  // coins inside
  if (fill > 0.02) {
    const lvl = y - 2 - (h - 7) * fill;
    ctx.fillStyle = "#e8a800";
    roundRect(ctx, x - w / 2 + 2, lvl, w - 4, y - lvl - 1, 2);
    ctx.fill();
    ctx.fillStyle = "#ffd43b";
    for (let i = 0; i < 4; i++) {
      const cxn = x - w / 2 + 4 + hash01(i, 31) * (w - 8);
      const cyn = lvl + 2 + hash01(i, 32) * Math.max(1, y - lvl - 6);
      ctx.beginPath();
      ctx.ellipse(cxn, cyn, 2.4, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // an occasional glint
    const gph = (animT % 4) / 4;
    if (gph < 0.2) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - gph / 0.2)})`;
      ctx.beginPath();
      ctx.arc(x + 3, lvl + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // glass
  ctx.fillStyle = "rgba(220,235,245,0.4)";
  roundRect(ctx, x - w / 2, top, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,110,130,0.5)";
  ctx.lineWidth = 1.4;
  roundRect(ctx, x - w / 2, top, w, h, 4);
  ctx.stroke();
  // rim + label
  ctx.fillStyle = "rgba(90,110,130,0.35)";
  ctx.fillRect(x - w / 2 - 1.5, top - 2, w + 3, 3.5);
  ctx.font = "bold 7px 'Fredoka', system-ui, sans-serif";
  ctx.fillStyle = withAlpha(INK, 0.75);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TIPS", x, top + 7);
}

/** A-frame chalkboard listing today's menu. */
function drawMenuBoard(ctx: CanvasRenderingContext2D, g: SceneGeom, scene: SceneContext): void {
  const x = g.cx + 26;
  const yb = g.groundY + 16;
  const bw = 30;
  const bh = 42;
  // legs
  ctx.strokeStyle = WOOD_DEEP;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - bw / 2 + 3, yb - bh + 6);
  ctx.lineTo(x - bw / 2 - 3, yb);
  ctx.moveTo(x + bw / 2 - 3, yb - bh + 6);
  ctx.lineTo(x + bw / 2 + 3, yb);
  ctx.stroke();
  // board
  ctx.fillStyle = WOOD_DEEP;
  roundRect(ctx, x - bw / 2 - 2, yb - bh - 2, bw + 4, bh - 6, 3);
  ctx.fill();
  ctx.fillStyle = "#3f4a44";
  roundRect(ctx, x - bw / 2, yb - bh, bw, bh - 10, 2);
  ctx.fill();
  // chalk header + menu icons
  ctx.strokeStyle = "rgba(255,253,243,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - bw / 2 + 4, yb - bh + 8);
  ctx.lineTo(x + bw / 2 - 4, yb - bh + 8);
  ctx.stroke();
  const icons = scene.menuIcons.slice(0, 3);
  icons.forEach((icon, i) => {
    drawEmoji(ctx, icon, x - ((icons.length - 1) * 10) / 2 + i * 10, yb - bh + 17, 9);
  });
  ctx.fillStyle = "rgba(255,253,243,0.55)";
  for (let i = 0; i < 2; i++) ctx.fillRect(x - bw / 2 + 5, yb - bh + 24 + i * 5, bw - 10 - i * 6, 1.6);
}

/**
 * Striped scalloped awning resting on the posts + string lights + the hanging
 * sign. `sway` (radians, ~±0.05) rocks the sign and shears the scallop tips;
 * the signage equipment line adds a glow / neon outline. `animT` is seconds
 * for glow pulses (pass a constant under reduced motion); `tod` 0..1 turns the
 * string lights on as evening falls.
 */
export function drawCanopy(
  ctx: CanvasRenderingContext2D,
  g: SceneGeom,
  scene: SceneContext,
  sign: SignState,
  sway: number,
  animT: number,
  tod: number,
): void {
  const { left, w, roofY } = g;
  const ax = left - 8;
  const aw = w + 16;
  const sw = aw / SCALLOPS;
  const tipShear = sway * 40;

  // canopy band with a cloth sheen
  ctx.fillStyle = "#ff8787";
  roundRect(ctx, ax, roofY - 16, aw, 20, 7);
  ctx.fill();
  const sheen = ctx.createLinearGradient(0, roofY - 16, 0, roofY + 4);
  sheen.addColorStop(0, "rgba(255,255,255,0.28)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(43,31,18,0.1)");
  ctx.fillStyle = sheen;
  roundRect(ctx, ax, roofY - 16, aw, 20, 7);
  ctx.fill();

  // scalloped stripes hanging from the band (tips shear with the wind)
  for (let i = 0; i < SCALLOPS; i++) {
    const red = i % 2 === 0;
    const sx = ax + sw * i;
    ctx.fillStyle = red ? "#ff8787" : "#fff5f5";
    ctx.beginPath();
    ctx.moveTo(sx, roofY + 2);
    ctx.lineTo(sx + sw, roofY + 2);
    ctx.quadraticCurveTo(sx + sw * 0.85 + tipShear * 0.6, roofY + 13, sx + sw / 2 + tipShear, roofY + 18);
    ctx.quadraticCurveTo(sx + sw * 0.15 + tipShear * 0.6, roofY + 13, sx, roofY + 2);
    ctx.closePath();
    ctx.fill();
    // hem shading gives the scallop a curl
    ctx.fillStyle = red ? "rgba(43,31,18,0.12)" : "rgba(168,123,63,0.12)";
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.12, roofY + 9);
    ctx.quadraticCurveTo(sx + sw / 2 + tipShear * 0.7, roofY + 20, sx + sw * 0.88, roofY + 9);
    ctx.quadraticCurveTo(sx + sw / 2 + tipShear, roofY + 13.5, sx + sw * 0.12, roofY + 9);
    ctx.fill();
  }

  // string lights at the scallop tips — they pop on as dusk falls
  const lightsOn = tod > 0.7;
  for (let i = 0; i < SCALLOPS; i++) {
    const bx = ax + sw * (i + 0.5) + tipShear;
    const by = roofY + 21;
    if (lightsOn) {
      const tw = 0.75 + 0.25 * Math.sin(animT * 2.4 + i * 1.7);
      const glow = ctx.createRadialGradient(bx, by, 0.5, bx, by, 9);
      glow.addColorStop(0, `rgba(255,220,110,${0.55 * tw})`);
      glow.addColorStop(1, "rgba(255,220,110,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(bx - 9, by - 9, 18, 18);
      ctx.fillStyle = `rgba(255,236,153,${0.85 + 0.15 * tw})`;
    } else {
      ctx.fillStyle = "rgba(255,253,243,0.8)";
    }
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(INK, 0.25);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // hanging sign (rocks on its pivot; flips by squashing scaleY)
  const signX = left + w * 0.14;
  const signW = w * 0.72;
  const pivotX = left + w / 2;
  const pivotY = roofY + 22;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(sway);
  ctx.scale(1, Math.max(0.02, Math.abs(sign.scaleY)));
  ctx.translate(-pivotX, -pivotY);

  // rope ties from the awning down to the sign corners
  ctx.strokeStyle = "rgba(168,123,63,0.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(signX + 10, roofY + 17);
  ctx.lineTo(signX + 13, roofY + 25);
  ctx.moveTo(signX + signW - 10, roofY + 17);
  ctx.lineTo(signX + signW - 13, roofY + 25);
  ctx.stroke();

  // signage equipment: glow (L1) / neon color-cycle (L2) outline
  const signage = scene.equip["signage"] ?? 0;
  if (signage >= 1) {
    const pulse = 0.55 + 0.35 * Math.sin(animT * 3);
    ctx.lineWidth = 5;
    ctx.strokeStyle =
      signage >= 2
        ? `hsl(${(animT * 40) % 360}, 90%, 65%)`
        : `rgba(255,212,59,${pulse})`;
    roundRect(ctx, signX - 2, roofY + 22, signW + 4, 32, 10);
    ctx.stroke();
  }

  // wooden sign plank with a painted face
  ctx.fillStyle = shade(WOOD, -0.1);
  roundRect(ctx, signX - 2, roofY + 22, signW + 4, 32, 9);
  ctx.fill();
  ctx.fillStyle = "#fffdf3";
  roundRect(ctx, signX + 1, roofY + 25, signW - 2, 26, 7);
  ctx.fill();
  ctx.fillStyle = sign.color;
  ctx.font = "bold 16px 'Fredoka', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sign.text, left + w / 2, roofY + 39);

  if (signage >= 2) drawEmoji(ctx, "🎆", signX - 8, roofY + 26, 14);
  ctx.restore();
}

// --- owned equipment props ---------------------------------------------------

type PropDraw = (ctx: CanvasRenderingContext2D, g: SceneGeom, level: number, animT: number, sunT: number) => void;

/** Declarative line → visual table. Highest owned level styles the prop. */
const PROPS: { line: string; draw: PropDraw }[] = [
  {
    line: "cooler",
    draw(ctx, g, level, _t, sunT) {
      const x = g.left + 4;
      const y = g.groundY + 14;
      if (level >= 3) {
        // mini cold-shed
        drawShadow(ctx, x + 26, y + 40, 56, sunT, 0.09);
        ctx.fillStyle = "#74c0fc";
        roundRect(ctx, x, y - 10, 52, 48, 6);
        ctx.fill();
        ctx.fillStyle = "#4dabf7";
        roundRect(ctx, x + 18, y + 6, 16, 32, 3);
        ctx.fill();
        ctx.strokeStyle = withAlpha(INK, 0.2);
        ctx.lineWidth = 1.2;
        roundRect(ctx, x, y - 10, 52, 48, 6);
        ctx.stroke();
        drawEmoji(ctx, "🏬", x + 26, y - 2, 14);
      } else {
        // drawn icebox: lid, latch, handle
        const w = level >= 2 ? 44 : 36;
        const h = level >= 2 ? 34 : 26;
        const top = y + 28 - h;
        drawShadow(ctx, x + w / 2, y + h + 4, w + 6, sunT, 0.09);
        ctx.fillStyle = "#4dabf7";
        roundRect(ctx, x, top, w, h, 5);
        ctx.fill();
        ctx.fillStyle = "#74c0fc";
        roundRect(ctx, x, top, w, 8, 5);
        ctx.fill();
        ctx.strokeStyle = withAlpha(INK, 0.22);
        ctx.lineWidth = 1.2;
        roundRect(ctx, x, top, w, h, 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 1, top + 8.5);
        ctx.lineTo(x + w - 1, top + 8.5);
        ctx.stroke();
        // latch + side handle
        ctx.fillStyle = "#fffdf3";
        roundRect(ctx, x + w / 2 - 2.5, top + 6, 5, 6, 1.5);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,253,243,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + w - 4, top + h / 2, 4.5, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    },
  },
  {
    line: "insulation",
    draw(ctx, g, level) {
      // decal on the cooler face (cooler may be any size — anchor to its corner)
      const x = g.left + 4;
      const y = g.groundY + 14;
      drawEmoji(ctx, "❄️", x + 12, y + 22, 12);
      if (level >= 2) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2.5;
        roundRect(ctx, x - 2, y + 2, 48, 38, 6);
        ctx.stroke();
      }
    },
  },
  {
    line: "icemaker",
    draw(ctx, g, level, t) {
      const x = g.cx - g.post - 30;
      const y = g.roofY + 30;
      const s = level >= 2 ? 26 : 20;
      ctx.fillStyle = "#ced4da";
      roundRect(ctx, x - s / 2, y - s / 2, s, s, 4);
      ctx.fill();
      ctx.strokeStyle = withAlpha(INK, 0.18);
      ctx.lineWidth = 1;
      roundRect(ctx, x - s / 2, y - s / 2, s, s, 4);
      ctx.stroke();
      drawEmoji(ctx, level >= 2 ? "🏭" : "🧊", x, y, s * 0.6);
      // a periodic puff of cold air
      const phase = (t % 3) / 3;
      if (phase < 0.4) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - phase / 0.4)})`;
        ctx.beginPath();
        ctx.arc(x + s / 2 + 4, y - s / 2 - phase * 12, 3 + phase * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    line: "research",
    draw(ctx, g, level) {
      const x = g.left + g.post + 24;
      const y = g.roofY + 32;
      ctx.fillStyle = "#fffdf3";
      roundRect(ctx, x - 12, y - 14, 24, 28, 3);
      ctx.fill();
      drawEmoji(ctx, "📋", x, y, 16);
      if (level >= 2) drawEmoji(ctx, "🔬", x + 22, y + 4, 14);
    },
  },
  {
    line: "dispenser",
    draw(ctx, g, level) {
      const icon = level >= 3 ? "🤖" : level >= 2 ? "🔱" : "🚰";
      drawEmoji(ctx, icon, g.cx - 30, g.cy - 9, 18);
    },
  },
  {
    line: "forecast",
    draw(ctx, g, level) {
      drawEmoji(ctx, "📻", g.left + g.w * 0.52, g.cy - 9, 15);
      if (level >= 2) drawEmoji(ctx, "🛰️", g.left + g.w - 16, g.roofY - 26, 18);
    },
  },
  {
    line: "loyalty",
    draw(ctx, g) {
      drawEmoji(ctx, "💳", g.left + 64, g.cy + 38, 14);
    },
  },
  {
    line: "comfort",
    draw(ctx, g, level, _t, sunT) {
      // queue slots start at cx+50 with a 40px gap (see people.ts)
      const ux = g.cx + 50 + 2.5 * 40;
      if (level >= 3) {
        // lounge canopy strip over the queue
        ctx.fillStyle = "rgba(255,249,219,0.9)";
        roundRect(ctx, g.cx + 56, g.cy - 14, 170, 9, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(168,123,63,0.5)";
        ctx.fillRect(g.cx + 58, g.cy - 5, 3, 22);
        ctx.fillRect(g.cx + 221, g.cy - 5, 3, 22);
        drawEmoji(ctx, "🛋️", g.cx + 240, g.cy + 2, 16);
      }
      if (level >= 2) {
        // bench under the back of the queue
        const bx = ux + 56;
        const by = g.cy + 46;
        drawShadow(ctx, bx + 24, by + 12, 52, sunT, 0.07);
        ctx.fillStyle = WOOD_DEEP;
        roundRect(ctx, bx, by, 52, 7, 3);
        ctx.fill();
        ctx.fillRect(bx + 5, by + 7, 5, 8);
        ctx.fillRect(bx + 42, by + 7, 5, 8);
      }
      // parasol planted mid-queue (all levels)
      drawShadow(ctx, ux, g.cy + 50, 40, sunT, 0.08);
      drawParasol(ctx, ux, g.cy + 50);
    },
  },
  // pitchers/signage/brewer render inside drawCounter/drawCanopy/people.ts.
];

/** A drawn beach parasol (pole, ribbed canopy, finial). */
function drawParasol(ctx: CanvasRenderingContext2D, x: number, yBase: number): void {
  ctx.strokeStyle = WOOD_DEEP;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, yBase);
  ctx.lineTo(x, yBase - 46);
  ctx.stroke();
  const top = yBase - 58;
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(x - r, top + 14);
  ctx.quadraticCurveTo(x, top - 8, x + r, top + 14);
  // scalloped hem
  for (let i = 3; i >= 0; i--) {
    const x0 = x - r + ((i + 1) * 2 * r) / 4;
    const x1 = x - r + (i * 2 * r) / 4;
    ctx.quadraticCurveTo((x0 + x1) / 2, top + 20, x1, top + 14);
  }
  ctx.closePath();
  ctx.fillStyle = "#ff8787";
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.2);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // ribs
  ctx.strokeStyle = "rgba(255,245,245,0.85)";
  ctx.lineWidth = 2;
  for (const k of [-0.5, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(x, top - 4);
    ctx.quadraticCurveTo(x + k * r * 0.7, top + 2, x + k * r, top + 15);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffd43b";
  ctx.beginPath();
  ctx.arc(x, top - 6, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

export function drawEquipment(
  ctx: CanvasRenderingContext2D,
  g: SceneGeom,
  scene: SceneContext,
  animT: number,
  sunT: number,
): void {
  for (const prop of PROPS) {
    const level = scene.equip[prop.line] ?? 0;
    if (level >= 1) prop.draw(ctx, g, level, animT, sunT);
  }
}
