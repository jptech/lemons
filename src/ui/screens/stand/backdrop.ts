/**
 * The stand scene's backdrop: weather sky, sun arc, location silhouettes,
 * ground and sidewalk, and the time-of-day wash. Everything here is static
 * for a given (size, condition, location, time-bucket), so it's baked into an
 * offscreen canvas and re-drawn per frame as a single drawImage. The bucket
 * granularity (~48 per day) keeps the wash/sun smooth without rebaking often.
 */
import type { Condition } from "../../../engine";
import type { SceneContext } from "./sceneContext";
import { clamp01, lerp } from "../../tween";
import { roundRect, type SceneGeom } from "./draw";

const SKY: Record<Condition, [string, string]> = {
  heatwave: ["#ffe8cc", "#ffd8a8"],
  sunny: ["#fff3bf", "#ffec99"],
  partly: ["#e7f5ff", "#d0ebff"],
  cloudy: ["#e9ecef", "#dee2e6"],
  rainy: ["#cfd8e3", "#aebfd0"],
  cold: ["#dbe4ff", "#bac8ff"],
};
const WEATHER_GLYPH: Record<Condition, string> = {
  heatwave: "🔥", sunny: "☀️", partly: "⛅", cloudy: "☁️", rainy: "🌧️", cold: "❄️",
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

  private bake(geom: SceneGeom, scene: SceneContext, tod: number, dpr: number, weatherFx: boolean): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(geom.W * dpr));
    c.height = Math.max(1, Math.round(geom.H * dpr));
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cond = scene.weather.condition;
    const { W, H, groundY, laneY } = geom;

    // sky
    const [a, b] = SKY[cond];
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, a);
    sky.addColorStop(1, b);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // sun disc + glow, traversing the sky with the day
    if (SUNNY.has(cond)) {
      const { x: sx, y: sy } = sunPos(geom, tod);
      const late = clamp01((tod - 0.8) / 0.2); // redden toward the close
      const glow = ctx.createRadialGradient(sx, sy, 6, sx, sy, 90);
      glow.addColorStop(0, cond === "heatwave" ? "rgba(255,170,60,0.5)" : "rgba(255,230,120,0.45)");
      glow.addColorStop(1, "rgba(255,230,120,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 90, sy - 90, 180, 180);
      ctx.beginPath();
      ctx.fillStyle = late > 0 ? `rgb(255,${Math.round(212 - late * 90)},${Math.round(59 + late * 40)})` : "#ffd43b";
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // location silhouettes along the horizon
    this.drawLocation(ctx, geom, scene.locationId);

    // ground (darkens slightly toward evening; sand/concrete by location)
    const evening = clamp01((tod - 0.62) / 0.38);
    ctx.fillStyle = groundColor(scene.locationId, evening > 0.3);
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, groundY, W, 3);

    // rain puddles on the ground (weather cosmetics — off with weatherFx)
    if (weatherFx && cond === "rainy") {
      ctx.fillStyle = "rgba(120,160,210,0.25)";
      for (const [px, py, pr] of [[W * 0.62, groundY + 22, 26], [W * 0.84, groundY + 14, 18], [W * 0.3, groundY + 30, 20]] as const) {
        ctx.beginPath();
        ctx.ellipse(px, py, pr, pr * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // sidewalk strip where foot traffic strolls
    ctx.fillStyle = scene.locationId === "beach" ? "#e6d49b" : "#d8cfa8";
    ctx.fillRect(0, laneY - 22, W, 44);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, laneY - 22, W, 2);
    if (scene.locationId === "downtown") {
      // crosswalk stripes on the sidewalk
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (let x = W * 0.62; x < W * 0.62 + 70; x += 18) ctx.fillRect(x, laneY - 18, 10, 36);
    }

    // time-of-day wash over the whole scene (silhouettes tint for free)
    const morning = clamp01((0.28 - tod) / 0.28);
    if (morning > 0) {
      ctx.fillStyle = `rgba(180,200,255,${0.16 * morning})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (evening > 0) {
      const e = ctx.createLinearGradient(0, 0, 0, H);
      e.addColorStop(0, `rgba(255,180,110,${0.28 * evening})`);
      e.addColorStop(1, `rgba(120,90,140,${0.22 * evening})`);
      ctx.fillStyle = e;
      ctx.fillRect(0, 0, W, H);
    }

    // weather glyph in the corner (kept crisp, over the wash)
    ctx.font = "34px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(WEATHER_GLYPH[cond], W - 44, 44);

    return c;
  }

  // --- location silhouettes --------------------------------------------------

  private drawLocation(ctx: CanvasRenderingContext2D, geom: SceneGeom, locationId: string): void {
    switch (locationId) {
      case "park": return drawPark(ctx, geom);
      case "beach": return drawBeach(ctx, geom);
      case "downtown": return drawDowntown(ctx, geom);
      case "stadium": return drawStadium(ctx, geom);
      default: return drawSuburb(ctx, geom);
    }
  }
}

function groundColor(locationId: string, evening: boolean): string {
  switch (locationId) {
    case "beach": return evening ? "#d9c693" : "#ecdcab";
    case "downtown":
    case "stadium": return evening ? "#c2bfb2" : "#d6d3c8";
    default: return evening ? "#aacf9e" : "#c3e8b8";
  }
}

// Each silhouette draws flat muted shapes with bottoms on the horizon (groundY).
// Two depths: a lighter far row and a slightly darker near row.

function drawSuburb(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const y = g.groundY;
  // far houses
  ctx.fillStyle = "rgba(170,150,180,0.35)";
  house(ctx, g.W * 0.06, y, 64, 40);
  house(ctx, g.W * 0.52, y, 58, 36);
  // near houses
  ctx.fillStyle = "rgba(150,125,110,0.5)";
  house(ctx, g.W * 0.25, y, 76, 50);
  house(ctx, g.W * 0.72, y, 82, 54);
  // a tree between them
  tree(ctx, g.W * 0.92, y, 26, "rgba(90,140,90,0.55)");
  // picket fence along the ground line
  ctx.fillStyle = "rgba(255,253,243,0.6)";
  for (let x = 6; x < g.W; x += 16) ctx.fillRect(x, y - 12, 5, 12);
  ctx.fillRect(0, y - 9, g.W, 3);
}

function drawPark(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const y = g.groundY;
  tree(ctx, g.W * 0.08, y, 30, "rgba(110,160,105,0.4)");
  tree(ctx, g.W * 0.3, y, 38, "rgba(85,140,85,0.55)");
  tree(ctx, g.W * 0.55, y, 26, "rgba(110,160,105,0.4)");
  tree(ctx, g.W * 0.78, y, 40, "rgba(85,140,85,0.55)");
  tree(ctx, g.W * 0.95, y, 30, "rgba(110,160,105,0.45)");
  // small fountain
  ctx.fillStyle = "rgba(120,160,200,0.5)";
  ctx.beginPath();
  ctx.ellipse(g.W * 0.66, y - 4, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(200,210,220,0.6)";
  ctx.fillRect(g.W * 0.66 - 3, y - 22, 6, 18);
  // a duck on the grass
  ctx.font = "14px serif";
  ctx.textAlign = "center";
  ctx.fillText("🦆", g.W * 0.62, y + 14);
}

function drawBeach(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const y = g.groundY;
  // sea band on the horizon
  const sea = ctx.createLinearGradient(0, y - 46, 0, y);
  sea.addColorStop(0, "rgba(77,171,247,0.55)");
  sea.addColorStop(1, "rgba(77,171,247,0.35)");
  ctx.fillStyle = sea;
  ctx.fillRect(0, y - 46, g.W, 46);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, y - 46, g.W, 2);
  // sailboats
  sail(ctx, g.W * 0.2, y - 30, 12);
  sail(ctx, g.W * 0.58, y - 38, 9);
  sail(ctx, g.W * 0.85, y - 26, 13);
  // beach umbrella on the sand
  ctx.font = "26px serif";
  ctx.textAlign = "center";
  ctx.fillText("⛱️", g.W * 0.88, y + 16);
}

function drawDowntown(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const y = g.groundY;
  // far row (lighter)
  ctx.fillStyle = "rgba(140,150,170,0.35)";
  building(ctx, g.W * 0.04, y, 54, 96);
  building(ctx, g.W * 0.34, y, 66, 120);
  building(ctx, g.W * 0.6, y, 48, 84);
  building(ctx, g.W * 0.86, y, 58, 108);
  // near row (darker) with window dots
  ctx.fillStyle = "rgba(105,115,140,0.5)";
  building(ctx, g.W * 0.16, y, 62, 74);
  building(ctx, g.W * 0.48, y, 56, 64);
  building(ctx, g.W * 0.74, y, 64, 80);
  ctx.fillStyle = "rgba(255,236,153,0.6)";
  for (const [bx, bh] of [[g.W * 0.16, 74], [g.W * 0.48, 64], [g.W * 0.74, 80]] as const) {
    for (let wy = y - bh + 10; wy < y - 12; wy += 14) {
      for (let wx = bx + 8; wx < bx + 50; wx += 13) ctx.fillRect(wx, wy, 5, 6);
    }
  }
}

function drawStadium(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
  const y = g.groundY;
  const cx = g.W * 0.6;
  // bowl
  ctx.fillStyle = "rgba(130,135,155,0.45)";
  ctx.beginPath();
  ctx.moveTo(cx - g.W * 0.42, y);
  ctx.quadraticCurveTo(cx, y - 130, cx + g.W * 0.42, y);
  ctx.closePath();
  ctx.fill();
  // inner cut
  ctx.fillStyle = "rgba(170,175,195,0.4)";
  ctx.beginPath();
  ctx.moveTo(cx - g.W * 0.3, y);
  ctx.quadraticCurveTo(cx, y - 86, cx + g.W * 0.3, y);
  ctx.closePath();
  ctx.fill();
  // light masts
  ctx.strokeStyle = "rgba(90,95,115,0.6)";
  ctx.lineWidth = 3;
  for (const mx of [cx - g.W * 0.34, cx + g.W * 0.34]) {
    ctx.beginPath();
    ctx.moveTo(mx, y - 60);
    ctx.lineTo(mx, y - 128);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,243,191,0.8)";
    roundRect(ctx, mx - 11, y - 142, 22, 12, 3);
    ctx.fill();
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
}

// --- tiny shape helpers ------------------------------------------------------

function house(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - 5, y - h);
  ctx.lineTo(x + w / 2, y - h - w * 0.32);
  ctx.lineTo(x + w + 5, y - h);
  ctx.closePath();
  ctx.fill();
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = "rgba(120,90,60,0.5)";
  ctx.fillRect(x - 3, y - r * 0.9, 6, r * 0.9);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - r * 1.1, r, 0, Math.PI * 2);
  ctx.arc(x - r * 0.6, y - r * 0.8, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 0.6, y - r * 0.8, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function sail(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = "rgba(255,253,243,0.75)";
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y);
  ctx.lineTo(x + s * 0.8, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(90,95,115,0.5)";
  ctx.fillRect(x - s * 0.5, y, s * 1.2, 2.5);
}

function building(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x, y - h, w, h);
}
