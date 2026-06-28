/**
 * Procedural little people ("peeps") — fully drawn vector characters that
 * replace the old emoji-in-a-circle sprites. A peep's look (skin, hair,
 * outfit, hat, accessory) is derived deterministically from a seed plus their
 * archetype, so the same customer keeps the same outfit all day; the pose
 * (walk cycle, facing, mood face, carried cup) is passed fresh every frame.
 *
 * Anatomy is drawn in a local space with the feet at (0,0), ~36px tall before
 * `look.scale`, so callers position peeps by where they stand on the ground.
 */
import { INK, hash01, hashPick, shade, withAlpha, drawCup } from "./draw";

export type PeepMood = "happy" | "ok" | "impatient" | "sad" | "angry";

export interface PeepLook {
  seed: number;
  scale: number;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3;
  hat: "none" | "cap" | "bucket";
  hatColor: string;
  chest: "none" | "camera" | "heart";
  zen: boolean;
}

export interface PeepPose {
  /** Walk-cycle phase in radians; legs scissor by sin(walk). */
  walk: number;
  /** 0 = standing, 1 = full stride. Scales leg swing, arm swing, and bob. */
  stride: number;
  facing: 1 | -1;
  mood: PeepMood;
  carryCup?: boolean;
  /** Drawn from behind (at the serving window) — hair but no face. */
  back?: boolean;
  /** Extra upward offset in px (celebratory hops). */
  lift?: number;
}

const SKIN = ["#ffd9b8", "#f6c393", "#e0a36c", "#c08552", "#9c6b40", "#7d5230"];
const SHIRT = ["#ff8787", "#4dabf7", "#69db7c", "#ffd43b", "#9775fa", "#f783ac", "#63e6be", "#ffa94d", "#74c0fc", "#b2f2bb"];
const PANTS = ["#5c6b8a", "#7a6a55", "#4a5568", "#7d6b9e", "#566d50", "#8a5a5a"];
const HAIR = ["#3a2e20", "#6b4423", "#9c6b2f", "#d9a05b", "#2f2f3a", "#a23e48", "#8d8d99", "#e6c06a"];

/** Build a stable look for (seed, archetype). */
export function makeLook(seed: number, archetype = "adult"): PeepLook {
  const look: PeepLook = {
    seed,
    scale: 0.95 + hash01(seed, 0) * 0.12,
    skin: hashPick(SKIN, seed, 1),
    shirt: hashPick(SHIRT, seed, 2),
    pants: hashPick(PANTS, seed, 3),
    hair: hashPick(HAIR, seed, 4),
    hairStyle: Math.min(3, Math.floor(hash01(seed, 5) * 4)) as 0 | 1 | 2 | 3,
    hat: "none",
    hatColor: hashPick(SHIRT, seed, 6),
    chest: "none",
    zen: false,
  };
  switch (archetype) {
    case "kid":
      look.scale *= 0.76;
      if (hash01(seed, 7) < 0.55) look.hat = "cap";
      break;
    case "tourist":
      look.hat = "bucket";
      look.hatColor = hash01(seed, 7) < 0.5 ? "#fff4d6" : "#ffe8cc";
      look.chest = "camera";
      break;
    case "regular":
      look.chest = "heart";
      break;
    case "zen":
      look.zen = true;
      look.hairStyle = 2;
      look.shirt = hashPick(["#b2f2bb", "#d0bfff", "#ffec99", "#a5d8ff"], seed, 2);
      break;
  }
  return look;
}

/**
 * Draw a peep standing at ground point (x, yFeet). `t` is scene time in
 * seconds (drives blinks; pass a constant under reduced motion).
 */
export function drawPeep(
  ctx: CanvasRenderingContext2D,
  x: number,
  yFeet: number,
  look: PeepLook,
  pose: PeepPose,
  t: number,
  alpha = 1,
): void {
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  const bob = Math.abs(Math.cos(pose.walk)) * 1.6 * pose.stride;
  ctx.translate(x, yFeet - (pose.lift ?? 0) - bob);
  ctx.scale(look.scale, look.scale);
  const f = pose.facing;

  // legs — scissor walk; feet lift alternately on the up-swing
  const swing = Math.sin(pose.walk) * 4.5 * pose.stride;
  ctx.strokeStyle = look.pants;
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  for (const side of [-1, 1] as const) {
    const fx = side * swing;
    const liftY = Math.max(0, side * Math.sin(pose.walk)) * 2.6 * pose.stride;
    ctx.beginPath();
    ctx.moveTo(side * 2.6, -9);
    ctx.lineTo(fx, -1.5 - liftY);
    ctx.stroke();
    // shoe
    ctx.fillStyle = shade(look.pants, -0.35);
    ctx.beginPath();
    ctx.ellipse(fx + f * 1.1, -1 - liftY, 3, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // back arm (behind the torso) — swings opposite the legs
  const shoulderY = -22.5;
  const armSwing = Math.sin(pose.walk + Math.PI) * 3.6 * pose.stride;
  const sleeve = shade(look.shirt, -0.18);
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 3.1;
  if (!pose.carryCup || !pose.back) {
    ctx.beginPath();
    ctx.moveTo(-f * 5, shoulderY + 1.5);
    ctx.quadraticCurveTo(-f * 6.2, shoulderY + 6, -f * 5.2 - armSwing, shoulderY + 10.5);
    ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(-f * 5.2 - armSwing, shoulderY + 10.5, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // torso
  ctx.beginPath();
  roundedTorso(ctx, -6.6, -24, 13.2, 16.5, 5.5);
  ctx.fillStyle = look.shirt;
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();
  // hem shade so the torso reads as a volume
  ctx.fillStyle = "rgba(43,31,18,0.1)";
  ctx.fillRect(-6.2, -11, 12.4, 3);

  // chest accessory
  if (pose.back !== true) {
    if (look.chest === "camera") {
      ctx.strokeStyle = withAlpha(INK, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-5.5, -23);
      ctx.lineTo(5.5, -21);
      ctx.stroke();
      ctx.fillStyle = "#454552";
      ctx.beginPath();
      roundedTorso(ctx, -3.4, -21.5, 6.8, 4.8, 1.6);
      ctx.fill();
      ctx.fillStyle = "#9ad0ff";
      ctx.beginPath();
      ctx.arc(0, -19.1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (look.chest === "heart") {
      drawHeart(ctx, f * 1.5, -18.5, 3.4, "#ff6b6b");
    }
  }

  // front arm — carries the cup or swings with the walk
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 3.1;
  if (pose.carryCup) {
    const hx = f * 8.2;
    const hy = shoulderY + 6.5;
    ctx.beginPath();
    ctx.moveTo(f * 5, shoulderY + 1.5);
    ctx.quadraticCurveTo(f * 8.5, shoulderY + 3.5, hx, hy);
    ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
    ctx.fill();
    drawCup(ctx, hx + f * 1.2, hy + 4.5, 7.5);
  } else {
    ctx.beginPath();
    ctx.moveTo(f * 5, shoulderY + 1.5);
    ctx.quadraticCurveTo(f * 6.2, shoulderY + 6, f * 5.2 + armSwing, shoulderY + 10.5);
    ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(f * 5.2 + armSwing, shoulderY + 10.5, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // head
  const hx = f * 0.7;
  const hy = -29.5;
  const r = 6.6;
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.16);
  ctx.lineWidth = 1;
  ctx.stroke();

  drawHairAndHat(ctx, hx, hy, r, look, f, pose.back === true);
  if (pose.back !== true) drawFace(ctx, hx, hy, look, pose.mood, f, t);

  ctx.restore();
}

// --- staff behind the counter --------------------------------------------------

export interface StaffPose {
  action: "idle" | "make" | "serve";
  /** Scene seconds (drives the shake/breath cycles). */
  t: number;
  facing: 1 | -1;
}

export interface ApronStyle {
  color: string;
  star?: boolean;
}

/**
 * A staff peep working behind the counter. `yCounter` is the counter-top line;
 * the body rises out from behind it (the counter front is drawn after, hiding
 * the waist). Making = shaking a little jug; serving = handing a cup forward.
 */
export function drawStaffPeep(
  ctx: CanvasRenderingContext2D,
  x: number,
  yCounter: number,
  look: PeepLook,
  apron: ApronStyle,
  pose: StaffPose,
): void {
  ctx.save();
  const breath = pose.action === "idle" ? Math.sin(pose.t * 1.7 + look.seed) * 0.7 : 0;
  ctx.translate(x, yCounter + 4 + breath);
  const f = pose.facing;

  // torso (taller — we only see the top half)
  ctx.beginPath();
  roundedTorso(ctx, -8, -26, 16, 27, 6);
  ctx.fillStyle = look.shirt;
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();

  // apron bib + straps
  ctx.fillStyle = apron.color;
  ctx.beginPath();
  ctx.moveTo(-5.5, -21);
  ctx.lineTo(5.5, -21);
  ctx.lineTo(7, -2);
  ctx.lineTo(-7, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5.5, -21);
  ctx.lineTo(-7.5, -25);
  ctx.moveTo(5.5, -21);
  ctx.lineTo(7.5, -25);
  ctx.stroke();
  if (apron.star) drawStar(ctx, 0, -14, 3.2, "#ffd43b");

  // arms by action
  const sleeve = shade(look.shirt, -0.18);
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  if (pose.action === "make") {
    // both hands on a cocktail-style shaker, rocking quickly
    const rock = Math.sin(pose.t * 11 + look.seed) * 0.22;
    const sx = f * 6;
    const sy = -16;
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(side * 7, -22);
      ctx.quadraticCurveTo(side * 9, -19, sx + side * 2.4, sy + 1);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rock);
    ctx.fillStyle = "#ced4da";
    ctx.beginPath();
    roundedTorso(ctx, -3.2, -5.5, 6.4, 9, 2.4);
    ctx.fill();
    ctx.fillStyle = "#adb5bd";
    ctx.fillRect(-3.2, -5.5, 6.4, 2.6);
    ctx.strokeStyle = withAlpha(INK, 0.25);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    roundedTorso(ctx, -3.2, -5.5, 6.4, 9, 2.4);
    ctx.stroke();
    ctx.restore();
    for (const side of [-1, 1] as const) {
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.arc(sx + side * 2.4, sy + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pose.action === "serve") {
    // one arm extends forward with a fresh cup
    const hx2 = f * 12;
    const hy2 = -10;
    ctx.beginPath();
    ctx.moveTo(f * 7, -22);
    ctx.quadraticCurveTo(f * 11, -17, hx2, hy2);
    ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(hx2, hy2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    drawCup(ctx, hx2 + f * 1.5, hy2 + 4, 8);
    ctx.strokeStyle = sleeve;
    ctx.beginPath();
    ctx.moveTo(-f * 7, -22);
    ctx.lineTo(-f * 8, -10);
    ctx.stroke();
  } else {
    // hands resting at the counter edge
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      ctx.moveTo(side * 7, -22);
      ctx.quadraticCurveTo(side * 9.5, -15, side * 8, -7);
      ctx.stroke();
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.arc(side * 8, -7, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // head + soda-jerk hat
  const hx = f * 0.7;
  const hy = -33;
  const r = 7;
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.16);
  ctx.lineWidth = 1;
  ctx.stroke();
  drawHairAndHat(ctx, hx, hy, r, look, f, false);
  // paper hat sits over the hair
  ctx.fillStyle = "#fffdf3";
  ctx.beginPath();
  ctx.moveTo(hx - 5.5, hy - r + 1.5);
  ctx.lineTo(hx - 4.2, hy - r - 4);
  ctx.lineTo(hx + 4.2, hy - r - 4);
  ctx.lineTo(hx + 5.5, hy - r + 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(INK, 0.2);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = "#ff8787";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hx - 4.6, hy - r - 1);
  ctx.lineTo(hx + 4.6, hy - r - 1);
  ctx.stroke();
  drawFace(ctx, hx, hy, look, pose.action === "make" ? "ok" : "happy", f, pose.t);

  ctx.restore();
}

// --- shared bits ---------------------------------------------------------------

/** roundRect that only opens a path (no fill) — keeps callers explicit. */
function roundedTorso(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHairAndHat(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  look: PeepLook,
  f: 1 | -1,
  back: boolean,
): void {
  // hair base: a dome over the top of the head (fuller from behind)
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.arc(hx, hy - 0.5, r + 0.7, Math.PI, Math.PI * 2);
  if (back) {
    // from behind, hair covers most of the head
    ctx.arc(hx, hy + 1.5, r + 0.7, 0, Math.PI);
  } else {
    ctx.lineTo(hx + (r + 0.7), hy + 1);
    ctx.quadraticCurveTo(hx, hy - 2.5 + (look.hairStyle === 1 ? f * 1.6 : 0), hx - (r + 0.7), hy + 1);
  }
  ctx.closePath();
  ctx.fill();
  if (look.hairStyle === 2) {
    // bun
    ctx.beginPath();
    ctx.arc(hx - f * 1, hy - r - 1.8, 2.7, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hairStyle === 3) {
    // ponytail trailing away from facing
    ctx.beginPath();
    ctx.ellipse(hx - f * (r + 1.2), hy + 1.5, 2.4, 4.4, f * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (look.hat === "cap") {
    ctx.fillStyle = look.hatColor;
    ctx.beginPath();
    ctx.arc(hx, hy - 1.2, r + 0.9, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    roundedTorso(ctx, hx + (f === 1 ? -1 : -r - 3.4), hy - 3.4, r + 4.4, 2.4, 1.2);
    ctx.fill();
    ctx.fillStyle = shade(look.hatColor, -0.25);
    ctx.beginPath();
    ctx.arc(hx, hy - r + 0.6, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hat === "bucket") {
    ctx.fillStyle = look.hatColor;
    ctx.beginPath();
    ctx.moveTo(hx - r - 2.4, hy - 1.6);
    ctx.lineTo(hx - r + 2, hy - r - 2.6);
    ctx.lineTo(hx + r - 2, hy - r - 2.6);
    ctx.lineTo(hx + r + 2.4, hy - 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha(INK, 0.2);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.strokeStyle = shade(look.hatColor, -0.3);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(hx - r - 1, hy - 2.6);
    ctx.lineTo(hx + r + 1, hy - 2.6);
    ctx.stroke();
  }
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  look: PeepLook,
  mood: PeepMood,
  f: 1 | -1,
  t: number,
): void {
  const exL = hx + f * 1.4 - 2.2;
  const exR = hx + f * 1.4 + 2.2;
  const ey = hy - 0.6;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = "round";

  // eyes — zen peeps keep them serenely closed; everyone else blinks
  const blink = look.zen || ((t * 1000 + look.seed % 2600) % 3300) < 130;
  if (blink) {
    ctx.lineWidth = 1.1;
    for (const ex of [exL, exR]) {
      ctx.beginPath();
      ctx.arc(ex, ey - 0.4, 1.3, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  } else {
    for (const ex of [exL, exR]) {
      ctx.beginPath();
      ctx.arc(ex, ey, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // brows for the strong moods
  if (mood === "impatient" || mood === "angry") {
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(exL - 1.4, ey - 3.4);
    ctx.lineTo(exL + 1.2, ey - 2.3);
    ctx.moveTo(exR + 1.4, ey - 3.4);
    ctx.lineTo(exR - 1.2, ey - 2.3);
    ctx.stroke();
  } else if (mood === "sad") {
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(exL - 1.3, ey - 2.4);
    ctx.lineTo(exL + 1.2, ey - 3.2);
    ctx.moveTo(exR + 1.3, ey - 2.4);
    ctx.lineTo(exR - 1.2, ey - 3.2);
    ctx.stroke();
  }

  // mouth
  const mx = hx + f * 1.6;
  const my = hy + 2.6;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  if (mood === "happy" || look.zen) {
    ctx.arc(mx, my - 0.6, 2.1, Math.PI * 0.15, Math.PI * 0.85);
  } else if (mood === "ok") {
    ctx.moveTo(mx - 1.4, my + 0.4);
    ctx.lineTo(mx + 1.4, my + 0.4);
  } else {
    // frown for impatient / sad / angry
    ctx.arc(mx, my + 2, 2.1, Math.PI * 1.15, Math.PI * 1.85);
  }
  ctx.stroke();

  // rosy cheeks on the happy ones
  if (mood === "happy") {
    ctx.fillStyle = "rgba(255,135,135,0.3)";
    for (const cx of [hx - 4, hx + 4]) {
      ctx.beginPath();
      ctx.arc(cx, hy + 1.8, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.65);
  ctx.bezierCurveTo(x - s, y - s * 0.25, x - s * 0.5, y - s, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.25, x, y + s * 0.65);
  ctx.fill();
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const ia = a + Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(ia) * r * 0.45, y + Math.sin(ia) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
}
