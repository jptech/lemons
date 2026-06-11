/**
 * The stand's structure: back wall, counter, canopy + hanging sign, and the
 * owned-equipment props drawn on/around the booth. Equipment visuals are a
 * declarative table keyed by equipment line + minimum level, so new gear in
 * src/data/equipment.ts stays add-only here too.
 */
import type { SimSnapshot } from "../../../engine";
import type { SceneContext } from "./sceneContext";
import { drawEmoji, drawShadow, roundRect, type SceneGeom } from "./draw";

/** Hanging-sign display state (Phase 4 flips OPEN/CLOSED via scaleY). */
export interface SignState {
  text: string;
  color: string;
  scaleY: number;
}

export const DEFAULT_SIGN: SignState = { text: "🍋 LEMONADE", color: "#3a2e20", scaleY: 1 };

/** Back wall + two posts — gives the booth structure behind the counter. */
export function drawStandBack(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const { left, w, cx, cy, roofY, post } = g;

  ctx.fillStyle = "#e8c99a";
  roundRect(ctx, left + post - 2, roofY + 8, w - 2 * (post - 2), cy - roofY - 4, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(168,123,63,0.25)";
  ctx.lineWidth = 1;
  for (let py = roofY + 24; py < cy - 8; py += 16) {
    ctx.beginPath();
    ctx.moveTo(left + post, py);
    ctx.lineTo(cx - post, py);
    ctx.stroke();
  }

  ctx.fillStyle = "#a87b3f";
  roundRect(ctx, left, roofY, post, cy - roofY + 6, 4);
  ctx.fill();
  roundRect(ctx, cx - post, roofY, post, cy - roofY + 6, 4);
  ctx.fill();
}

/** Soft ground shadow under the whole booth (stretches with the sun). */
export function drawStandShadow(ctx: CanvasRenderingContext2D, g: SceneGeom, sunT: number): void {
  drawShadow(ctx, g.left + g.w / 2, g.counterBottom + 6, g.w * 0.9, sunT, 0.08);
}

export function drawCounter(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot, scene: SceneContext): void {
  const { left, w, cx, cy, counterBottom } = g;

  // counter top lip
  ctx.fillStyle = "#a87b3f";
  roundRect(ctx, left - 4, cy - 4, w + 8, 14, 6);
  ctx.fill();
  // apron (front face)
  ctx.fillStyle = "#c99a5b";
  roundRect(ctx, left, cy + 8, w, counterBottom - cy - 8, 8);
  ctx.fill();
  // apron panel shading
  ctx.fillStyle = "rgba(168,123,63,0.25)";
  roundRect(ctx, left + 10, cy + 18, w - 20, counterBottom - cy - 28, 6);
  ctx.fill();

  // lemonade jugs on the counter — bigger vessels with better pitchers
  const pitchers = scene.equip["pitchers"] ?? 0;
  const jugs = pitchers >= 2 ? "🛢️🍋🥤" : pitchers >= 1 ? "🫙🍋🥤" : "🍋🥤";
  ctx.font = "20px serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(jugs, left + 10, cy + 3);

  // ready count
  ctx.font = "bold 13px 'Fredoka', system-ui, sans-serif";
  ctx.fillStyle = "#fffdf3";
  ctx.textAlign = "right";
  ctx.fillText(`${Math.floor(snap.pitcherPool)} ready`, cx - 8, cy + 30);
}

/**
 * Striped scalloped awning resting on the posts + the hanging sign.
 * `sway` (radians, ~±0.05) rocks the sign and shears the scallop tips; the
 * signage equipment line adds a glow / neon outline. `animT` is seconds for
 * the glow pulse (pass a constant under reduced motion).
 */
export function drawCanopy(
  ctx: CanvasRenderingContext2D,
  g: SceneGeom,
  scene: SceneContext,
  sign: SignState,
  sway: number,
  animT: number,
): void {
  const { left, w, roofY } = g;
  const ax = left - 8;
  const aw = w + 16;
  const stripes = 8;
  const sw = aw / stripes;
  const tipShear = sway * 40;

  // canopy band
  ctx.fillStyle = "#ff8787";
  roundRect(ctx, ax, roofY - 16, aw, 20, 7);
  ctx.fill();
  // scalloped stripes hanging from the band (tips shear with the wind)
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? "#fff5f5" : "#ff8787";
    const sx = ax + sw * i;
    ctx.beginPath();
    ctx.moveTo(sx, roofY + 4);
    ctx.lineTo(sx + sw, roofY + 4);
    ctx.lineTo(sx + sw / 2 + tipShear, roofY + 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.fillRect(ax + 4, roofY + 18, aw - 8, 2);

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

  ctx.fillStyle = "#fffdf3";
  roundRect(ctx, signX, roofY + 24, signW, 28, 8);
  ctx.fill();
  ctx.strokeStyle = "#efe4c4";
  ctx.lineWidth = 2;
  roundRect(ctx, signX, roofY + 24, signW, 28, 8);
  ctx.stroke();
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
        drawEmoji(ctx, "🏬", x + 26, y - 2, 14);
      } else {
        const w = level >= 2 ? 44 : 36;
        const h = level >= 2 ? 34 : 24;
        drawShadow(ctx, x + w / 2, y + h + 4, w + 6, sunT, 0.09);
        ctx.fillStyle = "#4dabf7";
        roundRect(ctx, x, y + 28 - h, w, h, 5);
        ctx.fill();
        ctx.fillStyle = level >= 2 ? "#fffdf3" : "rgba(255,253,243,0.6)";
        ctx.fillRect(x + 2, y + 28 - h + 5, w - 4, 3);
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
        ctx.fillStyle = "#a87b3f";
        roundRect(ctx, bx, by, 52, 7, 3);
        ctx.fill();
        ctx.fillRect(bx + 5, by + 7, 5, 8);
        ctx.fillRect(bx + 42, by + 7, 5, 8);
      }
      // umbrella planted mid-queue (all levels)
      drawShadow(ctx, ux, g.cy + 50, 40, sunT, 0.08);
      drawEmoji(ctx, "⛱️", ux, g.cy - 2, 34);
    },
  },
  // pitchers/signage/brewer render inside drawCounter/drawCanopy/people.ts.
];

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
