/**
 * The stand scene's backdrop: weather sky blended with time-of-day keyframes
 * (golden morning → clear noon → amber/violet dusk), sun arc, layered location
 * art with atmospheric haze, textured ground, and a sidewalk. Everything here
 * is static for a given (size, condition, location, time-bucket), so it's
 * baked into an offscreen canvas and re-drawn per frame as one drawImage; the
 * bucket granularity (~48/day) also animates dusk for free — downtown windows
 * light up and stadium floodlights switch on as the buckets advance.
 *
 * `drawLive` paints the few backdrop bits that move every frame (sea foam,
 * the park fountain, floodlight halos, chimney smoke) on top of the bake.
 */
import type { Condition } from "../../../engine";
import type { SceneContext } from "./sceneContext";
import { clamp01, lerp } from "../../tween";
import { hash01, mixColor, roundRect, shade, type SceneGeom } from "./draw";

const SKY: Record<Condition, [string, string]> = {
  heatwave: ["#ffe8cc", "#ffd8a8"],
  sunny: ["#ffec99", "#fff3bf"],
  partly: ["#d0ebff", "#e7f5ff"],
  cloudy: ["#dee2e6", "#e9ecef"],
  rainy: ["#aebfd0", "#cfd8e3"],
  cold: ["#bac8ff", "#dbe4ff"],
};

/** Conditions where the sun disc is visible in the sky. */
const SUNNY: ReadonlySet<Condition> = new Set(["sunny", "heatwave", "partly"]);

/** Sun position along its arc for a day progress 0..1. */
export function sunPos(geom: SceneGeom, t: number): { x: number; y: number } {
  return {
    x: lerp(geom.W * 0.14, geom.W * 0.86, t),
    y: 86 - Math.sin(Math.PI * clamp01(t)) * 48,
  };
}

function morningAmt(tod: number): number {
  return clamp01((0.24 - tod) / 0.24);
}
function eveningAmt(tod: number): number {
  return clamp01((tod - 0.66) / 0.34);
}

export class Backdrop {
  private buf: HTMLCanvasElement | null = null;
  private key = "";

  /** Paint the backdrop (rebaking the buffer only when its inputs changed). */
  draw(ctx: CanvasRenderingContext2D, geom: SceneGeom, scene: SceneContext, dayProgress: number, dpr: number, weatherFx = true): void {
    const bucket = Math.floor(clamp01(dayProgress) * 48);
    const key = `${geom.W}x${geom.H}|${scene.weather.condition}|${scene.locationId}|${bucket}|${dpr}|${weatherFx}`;
    if (key !== this.key || !this.buf) {
      this.key = key;
      this.buf = this.bake(geom, scene, (bucket + 0.5) / 48, dpr, weatherFx);
    }
    ctx.drawImage(this.buf, 0, 0, geom.W, geom.H);
  }

  /** The animated backdrop layer (drawn over the bake, under the stand). */
  drawLive(ctx: CanvasRenderingContext2D, g: SceneGeom, scene: SceneContext, tod: number, animT: number): void {
    const cond = scene.weather.condition;
    switch (scene.locationId) {
      case "beach":
        drawSeaLive(ctx, g, animT, SUNNY.has(cond), tod);
        break;
      case "park":
        drawFountainLive(ctx, g, animT);
        break;
      case "stadium":
        if (eveningAmt(tod) > 0.25) drawFloodlightHalos(ctx, g, animT);
        break;
      case "downtown":
        break;
      default:
        if (cond === "cold" || cond === "cloudy") drawChimneySmoke(ctx, g, animT);
    }
  }

  private bake(geom: SceneGeom, scene: SceneContext, tod: number, dpr: number, weatherFx: boolean): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(geom.W * dpr));
    c.height = Math.max(1, Math.round(geom.H * dpr));
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cond = scene.weather.condition;
    const { W, H, groundY, laneY } = geom;
    const m = morningAmt(tod);
    const e = eveningAmt(tod);

    // sky — condition base blended toward morning/evening keyframes
    const [baseTop, baseBot] = SKY[cond];
    let top = baseTop;
    let mid = mixColor(baseTop, baseBot, 0.55);
    let bot = baseBot;
    if (m > 0) {
      top = mixColor(top, "#a9c3f0", 0.4 * m);
      bot = mixColor(bot, "#ffdfb8", 0.5 * m);
      mid = mixColor(mid, "#e8d4c0", 0.3 * m);
    }
    if (e > 0) {
      top = mixColor(top, "#7d639e", 0.45 * e);
      mid = mixColor(mid, "#e0935a", 0.38 * e);
      bot = mixColor(bot, "#ffb368", 0.5 * e);
    }
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, top);
    sky.addColorStop(0.62, mid);
    sky.addColorStop(1, bot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY + 2);

    // sun disc + layered glow, traversing the sky with the day
    if (SUNNY.has(cond)) {
      const { x: sx, y: sy } = sunPos(geom, tod);
      const late = clamp01((tod - 0.8) / 0.2); // redden toward the close
      const wide = ctx.createRadialGradient(sx, sy, 10, sx, sy, 130);
      wide.addColorStop(0, cond === "heatwave" ? "rgba(255,170,60,0.4)" : "rgba(255,230,120,0.35)");
      wide.addColorStop(1, "rgba(255,230,120,0)");
      ctx.fillStyle = wide;
      ctx.fillRect(sx - 130, sy - 130, 260, 260);
      const core = ctx.createRadialGradient(sx, sy, 4, sx, sy, 40);
      core.addColorStop(0, "rgba(255,245,200,0.8)");
      core.addColorStop(1, "rgba(255,245,200,0)");
      ctx.fillStyle = core;
      ctx.fillRect(sx - 40, sy - 40, 80, 80);
      // soft spokes
      ctx.strokeStyle = "rgba(255,235,150,0.25)";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + tod * 0.8;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 20, sy + Math.sin(a) * 20);
        ctx.lineTo(sx + Math.cos(a) * 30, sy + Math.sin(a) * 30);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.fillStyle = late > 0 ? `rgb(255,${Math.round(212 - late * 90)},${Math.round(59 + late * 40)})` : "#ffd43b";
      ctx.arc(sx, sy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(sx - 4.5, sy - 4.5, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // far layer (atmospheric, blue-lifted), haze, then the near location art
    this.drawFar(ctx, geom, scene.locationId, bot);
    const haze = ctx.createLinearGradient(0, groundY - 56, 0, groundY);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(1, "rgba(255,255,255,0.32)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - 56, W, 56);
    this.drawLocation(ctx, geom, scene.locationId, e, tod);

    // ground (textured; darkens slightly toward evening)
    drawGround(ctx, geom, scene.locationId, e);

    // rain puddles on the ground (weather cosmetics — off with weatherFx)
    if (weatherFx && cond === "rainy") {
      for (const [px, py, pr] of [[W * 0.62, groundY + 22, 26], [W * 0.84, groundY + 14, 18], [W * 0.3, groundY + 30, 20]] as const) {
        const pg = ctx.createRadialGradient(px, py, 1, px, py, pr);
        pg.addColorStop(0, "rgba(150,185,225,0.4)");
        pg.addColorStop(1, "rgba(120,160,210,0.15)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(px, py, pr, pr * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(px, py - 1, pr * 0.85, pr * 0.26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // sidewalk strip where foot traffic strolls
    drawSidewalk(ctx, geom, scene.locationId);

    // time-of-day wash over the whole scene (silhouettes tint for free)
    if (m > 0) {
      ctx.fillStyle = `rgba(180,200,255,${0.1 * m})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (e > 0) {
      const ev = ctx.createLinearGradient(0, 0, 0, H);
      ev.addColorStop(0, `rgba(255,180,110,${0.16 * e})`);
      ev.addColorStop(1, `rgba(120,90,140,${0.18 * e})`);
      ctx.fillStyle = ev;
      ctx.fillRect(0, 0, W, H);
    }

    return c;
  }

  // --- location art ----------------------------------------------------------

  private drawFar(ctx: CanvasRenderingContext2D, g: SceneGeom, locationId: string, horizon: string): void {
    const y = g.groundY;
    switch (locationId) {
      case "park": {
        // rolling hill
        ctx.fillStyle = mixColor("#9dc08b", horizon, 0.45);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(g.W * 0.3, y - 44, g.W * 0.62, y - 14);
        ctx.quadraticCurveTo(g.W * 0.82, y - 36, g.W, y - 6);
        ctx.lineTo(g.W, y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "beach": {
        // a distant headland on the horizon
        ctx.fillStyle = mixColor("#7fa8c9", horizon, 0.55);
        ctx.beginPath();
        ctx.moveTo(g.W * 0.04, y - 44);
        ctx.quadraticCurveTo(g.W * 0.13, y - 58, g.W * 0.24, y - 44);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "downtown":
      case "stadium": {
        // an extra-far skyline row
        ctx.fillStyle = mixColor("#9aa5bd", horizon, 0.55);
        for (const [bx, bw, bh] of [
          [0.1, 40, 60], [0.28, 52, 84], [0.45, 38, 52], [0.58, 46, 96], [0.78, 42, 66], [0.93, 36, 78],
        ] as const) {
          ctx.fillRect(g.W * bx, y - bh - 26, bw, bh + 26);
        }
        break;
      }
      default: {
        // distant treeline behind the houses
        ctx.fillStyle = mixColor("#8fb582", horizon, 0.5);
        for (let i = 0; i < 9; i++) {
          const tx = (g.W / 8) * i + hash01(i, 41) * 30;
          const r = 18 + hash01(i, 42) * 16;
          ctx.beginPath();
          ctx.arc(tx, y - 18, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillRect(0, y - 20, g.W, 20);
      }
    }
  }

  private drawLocation(ctx: CanvasRenderingContext2D, geom: SceneGeom, locationId: string, evening: number, tod: number): void {
    switch (locationId) {
      case "park": return drawPark(ctx, geom);
      case "beach": return drawBeach(ctx, geom, tod);
      case "downtown": return drawDowntown(ctx, geom, evening);
      case "stadium": return drawStadium(ctx, geom, evening);
      default: return drawSuburb(ctx, geom, evening);
    }
  }
}

// --- ground & sidewalk ---------------------------------------------------------

function groundColor(locationId: string, evening: number): string {
  const base =
    locationId === "beach" ? "#ecdcab"
    : locationId === "downtown" || locationId === "stadium" ? "#d6d3c8"
    : "#c3e8b8";
  const dusk =
    locationId === "beach" ? "#d9c693"
    : locationId === "downtown" || locationId === "stadium" ? "#c2bfb2"
    : "#aacf9e";
  return mixColor(base, dusk, clamp01(evening * 1.4));
}

function drawGround(ctx: CanvasRenderingContext2D, g: SceneGeom, locationId: string, evening: number): void {
  const { W, H, groundY } = g;
  const base = groundColor(locationId, evening);
  ctx.fillStyle = base;
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(0, groundY, W, 3);

  if (locationId === "beach") {
    // tide line + sand speckles + a shell
    ctx.fillStyle = "rgba(150,120,80,0.14)";
    ctx.fillRect(0, groundY + 3, W, 5);
    for (let i = 0; i < 90; i++) {
      const x = hash01(i, 51) * W;
      const y = groundY + 8 + hash01(i, 52) * (H - groundY - 12);
      ctx.fillStyle = hash01(i, 53) < 0.5 ? "rgba(120,95,60,0.12)" : "rgba(255,255,255,0.3)";
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    const shx = W * 0.55;
    const shy = groundY + 30;
    ctx.fillStyle = "#f3e3e8";
    ctx.beginPath();
    ctx.arc(shx, shy, 4.5, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(150,110,120,0.5)";
    ctx.lineWidth = 0.8;
    for (const k of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(shx, shy);
      ctx.lineTo(shx + Math.sin(k) * 4.5, shy - Math.cos(k) * 4.5);
      ctx.stroke();
    }
  } else if (locationId === "downtown" || locationId === "stadium") {
    // concrete slabs with seams + faint stains
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1.2;
    for (let x = 40; x < W; x += 92) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 2);
      ctx.lineTo(x - 10, H);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const sx = hash01(i, 55) * W;
      const sy = groundY + 10 + hash01(i, 56) * (H - groundY - 18);
      ctx.fillStyle = "rgba(0,0,0,0.035)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, 16 + hash01(i, 57) * 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // grass — mower bands, tufts, and tiny flowers
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.045)" : "rgba(43,80,40,0.04)";
      ctx.fillRect(0, groundY + 6 + i * 14, W, 9);
    }
    ctx.strokeStyle = "rgba(85,130,75,0.38)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 32; i++) {
      const x = hash01(i, 61) * W;
      const y = groundY + 8 + hash01(i, 62) * Math.max(8, g.laneY - 26 - groundY - 8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 1.6, y - 3.6);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.4, y - 4.2);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y - 3.2);
      ctx.stroke();
    }
    const petals = ["#fff5f5", "#ffe8f0", "#fff9db"];
    for (let i = 0; i < 8; i++) {
      const x = hash01(i, 63) * W;
      const y = groundY + 10 + hash01(i, 64) * Math.max(6, g.laneY - 28 - groundY - 10);
      ctx.fillStyle = petals[i % petals.length]!;
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSidewalk(ctx: CanvasRenderingContext2D, g: SceneGeom, locationId: string): void {
  const { W, laneY } = g;
  if (locationId === "beach") {
    // boardwalk planks
    ctx.fillStyle = "#d9b37c";
    ctx.fillRect(0, laneY - 22, W, 44);
    ctx.strokeStyle = "rgba(120,85,45,0.35)";
    ctx.lineWidth = 1.2;
    for (let x = 0; x < W; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, laneY - 22);
      ctx.lineTo(x, laneY + 22);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(120,85,45,0.5)";
    ctx.beginPath();
    ctx.moveTo(0, laneY - 22);
    ctx.lineTo(W, laneY - 22);
    ctx.moveTo(0, laneY + 21);
    ctx.lineTo(W, laneY + 21);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = locationId === "downtown" || locationId === "stadium" ? "#dcd6c4" : "#d8cfa8";
  ctx.fillRect(0, laneY - 22, W, 44);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(0, laneY - 22, W, 2);
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.fillRect(0, laneY + 20, W, 2);
  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  ctx.lineWidth = 1.2;
  for (let x = 30; x < W; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, laneY - 22);
    ctx.lineTo(x, laneY + 22);
    ctx.stroke();
  }
  if (locationId === "downtown") {
    // crosswalk stripes on the sidewalk
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let x = W * 0.62; x < W * 0.62 + 70; x += 18) ctx.fillRect(x, laneY - 18, 10, 36);
  }
}

// --- near location art -----------------------------------------------------

const HOUSE_BODIES = ["#f5d8c2", "#dbe7f2", "#f2e6c9", "#e6d8ef", "#d9ecd5"];

function drawSuburb(ctx: CanvasRenderingContext2D, g: SceneGeom, evening: number): void {
  const y = g.groundY;
  house(ctx, g.W * 0.06, y, 66, 42, 0, evening);
  house(ctx, g.W * 0.25, y, 80, 52, 1, evening, true);
  house(ctx, g.W * 0.52, y, 60, 38, 2, evening);
  house(ctx, g.W * 0.72, y, 84, 56, 3, evening);
  bigTree(ctx, g.W * 0.93, y, 28);
  bush(ctx, g.W * 0.205, y, 10);
  bush(ctx, g.W * 0.475, y, 8);
  // picket fence along the ground line
  ctx.fillStyle = "rgba(255,253,243,0.75)";
  for (let x = 6; x < g.W; x += 16) {
    const h = 12 + hash01(x, 71) * 2;
    ctx.fillRect(x, y - h, 5, h);
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + 2.5, y - h - 3);
    ctx.lineTo(x + 5, y - h);
    ctx.fill();
  }
  ctx.fillRect(0, y - 9, g.W, 2.5);
  ctx.fillRect(0, y - 4.5, g.W, 2.5);
  // mailbox
  const mx = g.W * 0.49;
  ctx.fillStyle = "#a87b3f";
  ctx.fillRect(mx - 1.5, y - 18, 3, 18);
  ctx.fillStyle = "#74c0fc";
  roundRect(ctx, mx - 6, y - 25, 12, 8, 3);
  ctx.fill();
  ctx.fillStyle = "#ff8787";
  ctx.fillRect(mx + 4, y - 30, 1.5, 6);
}

function house(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  evening: number,
  chimney = false,
): void {
  const body = HOUSE_BODIES[seed % HOUSE_BODIES.length]!;
  ctx.fillStyle = body;
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = "rgba(43,31,18,0.08)";
  ctx.fillRect(x, y - h, w, 4);
  // roof
  ctx.fillStyle = shade(body, -0.42);
  ctx.beginPath();
  ctx.moveTo(x - 6, y - h);
  ctx.lineTo(x + w / 2, y - h - w * 0.3);
  ctx.lineTo(x + w + 6, y - h);
  ctx.closePath();
  ctx.fill();
  if (chimney) {
    ctx.fillStyle = shade(body, -0.5);
    ctx.fillRect(x + w * 0.72, y - h - w * 0.26, 8, w * 0.16);
  }
  // door
  ctx.fillStyle = shade(body, -0.35);
  roundRect(ctx, x + w * 0.42, y - h * 0.5, w * 0.16, h * 0.5, 2);
  ctx.fill();
  // windows (lit progressively at dusk)
  for (let i = 0; i < 2; i++) {
    const wx = x + w * (0.12 + i * 0.55);
    const wy = y - h * 0.72;
    const lit = hash01(seed * 7 + i, 73) < evening * 1.5 - 0.15;
    if (lit) {
      ctx.fillStyle = "rgba(255,236,153,0.35)";
      ctx.fillRect(wx - 3, wy - 3, w * 0.22 + 6, h * 0.3 + 6);
      ctx.fillStyle = "#ffec99";
    } else {
      ctx.fillStyle = "rgba(80,95,120,0.4)";
    }
    ctx.fillRect(wx, wy, w * 0.22, h * 0.3);
    ctx.strokeStyle = "rgba(255,253,243,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(wx, wy, w * 0.22, h * 0.3);
  }
}

function bigTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = "#8a6238";
  ctx.beginPath();
  ctx.moveTo(x - 3.5, y);
  ctx.lineTo(x - 2, y - r * 0.95);
  ctx.lineTo(x + 2, y - r * 0.95);
  ctx.lineTo(x + 3.5, y);
  ctx.closePath();
  ctx.fill();
  // canopy: shadow base, mid, highlight
  const cy = y - r * 1.15;
  ctx.fillStyle = "#5d8f5d";
  blobs(ctx, x + 1.5, cy + 2, r);
  ctx.fillStyle = "#74a874";
  blobs(ctx, x, cy, r * 0.96);
  ctx.fillStyle = "#8fbf86";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, cy - r * 0.42, r * 0.42, 0, Math.PI * 2);
  ctx.arc(x + r * 0.18, cy - r * 0.55, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function blobs(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y - r * 0.18, r, 0, Math.PI * 2);
  ctx.arc(x - r * 0.62, y + r * 0.12, r * 0.66, 0, Math.PI * 2);
  ctx.arc(x + r * 0.62, y + r * 0.12, r * 0.66, 0, Math.PI * 2);
  ctx.fill();
}

function bush(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = "#74a874";
  ctx.beginPath();
  ctx.arc(x, y - r * 0.5, r, 0, Math.PI * 2);
  ctx.arc(x - r * 0.8, y - r * 0.3, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 0.8, y - r * 0.3, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fbf86";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.75, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawPark(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const y = g.groundY;
  bigTree(ctx, g.W * 0.08, y, 30);
  bigTree(ctx, g.W * 0.3, y, 38);
  bigTree(ctx, g.W * 0.55, y, 26);
  bigTree(ctx, g.W * 0.78, y, 40);
  bigTree(ctx, g.W * 0.95, y, 30);
  // flower bed
  ctx.fillStyle = "#9dbb90";
  ctx.beginPath();
  ctx.ellipse(g.W * 0.44, y - 3, 26, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const fl = ["#ff8787", "#ffd43b", "#f783ac", "#fff5f5"];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = fl[i % fl.length]!;
    ctx.beginPath();
    ctx.arc(g.W * 0.44 - 22 + i * 6, y - 4 - hash01(i, 75) * 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // park bench
  const bx = g.W * 0.665;
  ctx.fillStyle = "#a87b3f";
  roundRect(ctx, bx, y - 16, 34, 4, 2);
  ctx.fill();
  roundRect(ctx, bx, y - 25, 34, 4, 2);
  ctx.fill();
  ctx.fillRect(bx + 2, y - 14, 3, 14);
  ctx.fillRect(bx + 29, y - 14, 3, 14);
  // fountain base (live water drawn per-frame on top)
  const fx = fountainPos(g).x;
  ctx.fillStyle = "#b6bdc9";
  ctx.beginPath();
  ctx.ellipse(fx, y - 2, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8e97a8";
  ctx.beginPath();
  ctx.ellipse(fx, y - 4, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(120,160,200,0.55)";
  ctx.beginPath();
  ctx.ellipse(fx, y - 4, 19, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b6bdc9";
  ctx.fillRect(fx - 3, y - 26, 6, 22);
  ctx.beginPath();
  ctx.ellipse(fx, y - 26, 8, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // a kite high above the trees
  const kx = g.W * 0.62;
  const ky = 54;
  ctx.strokeStyle = "rgba(58,46,32,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.quadraticCurveTo(kx - 30, ky + 60, kx - 44, y - 40);
  ctx.stroke();
  ctx.fillStyle = "#ff8787";
  ctx.beginPath();
  ctx.moveTo(kx, ky - 10);
  ctx.lineTo(kx + 8, ky);
  ctx.lineTo(kx, ky + 12);
  ctx.lineTo(kx - 8, ky);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,253,243,0.8)";
  ctx.beginPath();
  ctx.moveTo(kx, ky - 10);
  ctx.lineTo(kx, ky + 12);
  ctx.moveTo(kx - 8, ky);
  ctx.lineTo(kx + 8, ky);
  ctx.stroke();
}

export function fountainPos(g: SceneGeom): { x: number; y: number } {
  return { x: g.W * 0.66, y: g.groundY - 26 };
}

function drawBeach(ctx: CanvasRenderingContext2D, g: SceneGeom, tod: number): void {
  const y = g.groundY;
  // sea: three depth bands
  const sea = ctx.createLinearGradient(0, y - 52, 0, y);
  sea.addColorStop(0, "rgba(58,134,205,0.7)");
  sea.addColorStop(0.55, "rgba(77,171,247,0.6)");
  sea.addColorStop(1, "rgba(120,200,255,0.45)");
  ctx.fillStyle = sea;
  ctx.fillRect(0, y - 52, g.W, 52);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(0, y - 52, g.W, 1.6);
  // sun glint path on the water
  const sx = sunPos(g, tod).x;
  const glint = ctx.createLinearGradient(0, y - 52, 0, y);
  glint.addColorStop(0, "rgba(255,245,200,0.4)");
  glint.addColorStop(1, "rgba(255,245,200,0)");
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.moveTo(sx - 8, y - 52);
  ctx.lineTo(sx + 8, y - 52);
  ctx.lineTo(sx + 30, y);
  ctx.lineTo(sx - 30, y);
  ctx.closePath();
  ctx.fill();
  // sailboats
  sail(ctx, g.W * 0.2, y - 30, 12);
  sail(ctx, g.W * 0.58, y - 38, 9);
  sail(ctx, g.W * 0.85, y - 26, 13);
  // dune grass tufts at the sand line
  ctx.strokeStyle = "rgba(140,160,90,0.8)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const tx = g.W * (0.3 + i * 0.14) + hash01(i, 79) * 20;
    for (const k of [-2.5, 0, 2.5]) {
      ctx.beginPath();
      ctx.moveTo(tx, y + 4);
      ctx.quadraticCurveTo(tx + k, y - 3, tx + k * 1.6, y - 8);
      ctx.stroke();
    }
  }
  // planted beach umbrella + towel
  const ux = g.W * 0.88;
  ctx.strokeStyle = "#a87b3f";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ux, y + 18);
  ctx.lineTo(ux + 6, y - 22);
  ctx.stroke();
  ctx.fillStyle = "#4dabf7";
  ctx.beginPath();
  ctx.moveTo(ux - 18, y - 16);
  ctx.quadraticCurveTo(ux + 6, y - 40, ux + 30, y - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,253,243,0.85)";
  ctx.lineWidth = 1.6;
  for (const k of [-0.55, 0, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(ux + 6, y - 36);
    ctx.quadraticCurveTo(ux + 6 + k * 16, y - 28, ux + 6 + k * 22, y - 17);
    ctx.stroke();
  }
  ctx.fillStyle = "#f783ac";
  ctx.save();
  ctx.translate(ux - 14, y + 10);
  ctx.rotate(-0.08);
  ctx.fillRect(-12, -5, 26, 12);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(-12, -1, 26, 2);
  ctx.restore();
}

function drawDowntown(ctx: CanvasRenderingContext2D, g: SceneGeom, evening: number): void {
  const y = g.groundY;
  // far row (lighter)
  ctx.fillStyle = "rgba(140,150,170,0.45)";
  building(ctx, g.W * 0.04, y, 54, 96);
  building(ctx, g.W * 0.34, y, 66, 120);
  building(ctx, g.W * 0.6, y, 48, 84);
  building(ctx, g.W * 0.86, y, 58, 108);
  // water tower on the tallest far roof
  const wtx = g.W * 0.34 + 33;
  ctx.fillStyle = "rgba(120,128,150,0.55)";
  ctx.fillRect(wtx - 8, y - 134, 16, 12);
  ctx.beginPath();
  ctx.moveTo(wtx - 9, y - 134);
  ctx.lineTo(wtx, y - 141);
  ctx.lineTo(wtx + 9, y - 134);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,128,150,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(wtx - 6, y - 122);
  ctx.lineTo(wtx - 6, y - 120);
  ctx.moveTo(wtx + 6, y - 122);
  ctx.lineTo(wtx + 6, y - 120);
  ctx.stroke();
  // near row (darker) with windows that light up at dusk
  ctx.fillStyle = "rgba(105,115,140,0.65)";
  building(ctx, g.W * 0.16, y, 62, 74);
  building(ctx, g.W * 0.48, y, 56, 64);
  building(ctx, g.W * 0.74, y, 64, 80);
  let wi = 0;
  for (const [bx, bh] of [[g.W * 0.16, 74], [g.W * 0.48, 64], [g.W * 0.74, 80]] as const) {
    for (let wy = y - bh + 10; wy < y - 12; wy += 14) {
      for (let wx = bx + 8; wx < bx + 50; wx += 13) {
        const lit = hash01(wi++, 81) < evening * 1.6 - 0.1;
        ctx.fillStyle = lit ? "#ffec99" : "rgba(255,236,153,0.28)";
        ctx.fillRect(wx, wy, 5, 6);
        if (lit) {
          ctx.fillStyle = "rgba(255,236,153,0.25)";
          ctx.fillRect(wx - 1.5, wy - 1.5, 8, 9);
        }
      }
    }
  }
  // rooftop billboard with the lemon brand
  const bbx = g.W * 0.74 + 32;
  const bby = y - 80;
  ctx.fillStyle = "rgba(90,98,120,0.8)";
  ctx.fillRect(bbx - 2, bby - 4, 3, 6);
  ctx.fillRect(bbx + 14, bby - 4, 3, 6);
  ctx.fillStyle = "#fffdf3";
  roundRect(ctx, bbx - 14, bby - 26, 44, 23, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(90,98,120,0.7)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, bbx - 14, bby - 26, 44, 23, 3);
  ctx.stroke();
  ctx.fillStyle = "#ffd43b";
  ctx.beginPath();
  ctx.ellipse(bbx - 2, bby - 14.5, 7, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff8787";
  ctx.fillRect(bbx + 8, bby - 19, 16, 3);
  ctx.fillRect(bbx + 8, bby - 13, 12, 3);
}

function drawStadium(ctx: CanvasRenderingContext2D, g: SceneGeom, evening: number): void {
  const y = g.groundY;
  const cx = g.W * 0.6;
  // bowl
  ctx.fillStyle = "rgba(130,135,155,0.55)";
  ctx.beginPath();
  ctx.moveTo(cx - g.W * 0.42, y);
  ctx.quadraticCurveTo(cx, y - 130, cx + g.W * 0.42, y);
  ctx.closePath();
  ctx.fill();
  // seating bands inside the bowl
  ctx.fillStyle = "rgba(170,175,195,0.5)";
  ctx.beginPath();
  ctx.moveTo(cx - g.W * 0.3, y);
  ctx.quadraticCurveTo(cx, y - 86, cx + g.W * 0.3, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,135,135,0.3)";
  ctx.beginPath();
  ctx.moveTo(cx - g.W * 0.24, y);
  ctx.quadraticCurveTo(cx, y - 64, cx + g.W * 0.24, y);
  ctx.closePath();
  ctx.fill();
  // entry arch
  ctx.fillStyle = "rgba(90,95,115,0.6)";
  ctx.beginPath();
  ctx.moveTo(cx - 16, y);
  ctx.quadraticCurveTo(cx, y - 26, cx + 16, y);
  ctx.closePath();
  ctx.fill();
  // light masts (lamps glow at dusk; halos animate live)
  ctx.strokeStyle = "rgba(90,95,115,0.7)";
  ctx.lineWidth = 3;
  for (const mx of [cx - g.W * 0.34, cx + g.W * 0.34]) {
    ctx.beginPath();
    ctx.moveTo(mx, y - 60);
    ctx.lineTo(mx, y - 128);
    ctx.stroke();
    if (evening > 0.25) {
      const cone = ctx.createLinearGradient(mx, y - 140, mx > cx ? mx - 60 : mx + 60, y - 60);
      cone.addColorStop(0, "rgba(255,243,191,0.32)");
      cone.addColorStop(1, "rgba(255,243,191,0)");
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(mx - 11, y - 140);
      ctx.lineTo(mx + 11, y - 140);
      ctx.lineTo(mx + (mx > cx ? -1 : 1) * 70, y - 56);
      ctx.lineTo(mx + (mx > cx ? -1 : 1) * 30, y - 56);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = evening > 0.25 ? "#fff3bf" : "rgba(255,243,191,0.8)";
    roundRect(ctx, mx - 11, y - 142, 22, 12, 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,95,115,0.7)";
    for (let lx = mx - 7; lx <= mx + 7; lx += 7) {
      ctx.beginPath();
      ctx.arc(lx, y - 136, 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // pennant string across the bowl
  ctx.strokeStyle = "rgba(90,95,115,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - g.W * 0.3, y - 96);
  ctx.quadraticCurveTo(cx, y - 78, cx + g.W * 0.3, y - 96);
  ctx.stroke();
  const colors = ["#ffd43b", "#4dabf7", "#ff8787", "#69db7c", "#9775fa"];
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const px = lerp(cx - g.W * 0.3, cx + g.W * 0.3, t);
    const py = y - 96 + Math.sin(Math.PI * t) * 17;
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.beginPath();
    ctx.moveTo(px - 5, py);
    ctx.lineTo(px + 5, py);
    ctx.lineTo(px, py + 9);
    ctx.closePath();
    ctx.fill();
  }
  // a blimp drifting overhead
  const bx = g.W * 0.24;
  const by = 52;
  ctx.fillStyle = "rgba(220,225,235,0.9)";
  ctx.beginPath();
  ctx.ellipse(bx, by, 24, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(160,168,188,0.9)";
  ctx.beginPath();
  ctx.moveTo(bx - 22, by - 4);
  ctx.lineTo(bx - 32, by - 9);
  ctx.lineTo(bx - 32, by + 9);
  ctx.lineTo(bx - 22, by + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(120,128,150,0.9)";
  roundRect(ctx, bx - 6, by + 7, 12, 5, 2);
  ctx.fill();
  ctx.fillStyle = "#ffd43b";
  ctx.beginPath();
  ctx.ellipse(bx + 2, by, 8, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

// --- live (per-frame) backdrop bits -----------------------------------------

function drawSeaLive(ctx: CanvasRenderingContext2D, g: SceneGeom, t: number, sunny: boolean, tod: number): void {
  const y = g.groundY;
  // two drifting foam lines where the surf meets the sand
  for (let band = 0; band < 2; band++) {
    const baseY = y - 4 - band * 9;
    const drift = Math.sin(t * (0.5 + band * 0.22)) * 4;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 - band * 0.18})`;
    ctx.lineWidth = 2.2 - band * 0.7;
    ctx.beginPath();
    for (let x = -20; x <= g.W + 20; x += 16) {
      const wy = baseY + Math.sin(x * 0.035 + t * (1 + band * 0.4)) * 2.2 + drift * 0.4;
      if (x === -20) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  // sparkling glints along the sun path
  if (sunny) {
    const sx = sunPos(g, tod).x;
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.7 + i * 0.61) % 1;
      const gx = sx + Math.sin(i * 2.4) * (12 + i * 5);
      const gy = y - 48 + ((i * 13.7) % 42);
      ctx.fillStyle = `rgba(255,250,210,${0.5 * Math.sin(ph * Math.PI)})`;
      ctx.fillRect(gx - 2.5, gy, 5, 1.4);
    }
  }
}

function drawFountainLive(ctx: CanvasRenderingContext2D, g: SceneGeom, t: number): void {
  const { x } = fountainPos(g);
  const topY = g.groundY - 28;
  // arcs of droplets cycling out of the spout
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.8 + i / 6) % 1;
    const side = i % 2 === 0 ? 1 : -1;
    const dx = side * ph * 14;
    const dy = -10 * Math.sin(ph * Math.PI) + ph * ph * 22;
    ctx.fillStyle = `rgba(150,200,240,${0.75 * (1 - ph * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x + dx, topY + dy, 1.6 - ph * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // shimmering pool surface
  const shimmer = 0.25 + 0.1 * Math.sin(t * 2.2);
  ctx.fillStyle = `rgba(255,255,255,${shimmer})`;
  ctx.beginPath();
  ctx.ellipse(x - 5, g.groundY - 5, 6, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFloodlightHalos(ctx: CanvasRenderingContext2D, g: SceneGeom, t: number): void {
  const y = g.groundY;
  const cx = g.W * 0.6;
  for (const [k, mx] of [cx - g.W * 0.34, cx + g.W * 0.34].entries()) {
    const pulse = 0.16 + 0.05 * Math.sin(t * 1.6 + k * 2.1);
    const halo = ctx.createRadialGradient(mx, y - 136, 2, mx, y - 136, 26);
    halo.addColorStop(0, `rgba(255,243,191,${pulse * 2})`);
    halo.addColorStop(1, "rgba(255,243,191,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 26, y - 162, 52, 52);
  }
}

function drawChimneySmoke(ctx: CanvasRenderingContext2D, g: SceneGeom, t: number): void {
  // matches the chimney on the second suburb house (see drawSuburb/house)
  const hx = g.W * 0.25 + 80 * 0.72 + 4;
  const hy = g.groundY - 52 - 80 * 0.26;
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.22 + i / 4) % 1;
    const px = hx + Math.sin(ph * 5 + i) * 4 + ph * 10;
    const py = hy - ph * 30;
    ctx.fillStyle = `rgba(235,235,240,${0.4 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.5 + ph * 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- tiny shape helpers ------------------------------------------------------

function sail(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = "rgba(255,253,243,0.85)";
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y);
  ctx.lineTo(x + s * 0.8, y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 2, y - s * 0.8);
  ctx.lineTo(x - 2, y);
  ctx.lineTo(x - s * 0.55, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(90,95,115,0.6)";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y + 1);
  ctx.lineTo(x + s * 0.7, y + 1);
  ctx.lineTo(x + s * 0.45, y + 4);
  ctx.lineTo(x - s * 0.35, y + 4);
  ctx.closePath();
  ctx.fill();
}

function building(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x, y - h, w, h);
}
