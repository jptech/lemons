/**
 * Event-driven effects: floating text pops, weather particles, cup-handoff
 * arcs, 5★ star bursts, tip sparkles, the rush-streak badge, and the stockout
 * vignette. All cosmetic, all capped, all gated by the relevant settings.
 */
import type { Condition, ItemId, SimEvent } from "../../../engine";
import { arcPoint, clamp01, easeOutCubic } from "../../tween";
import { drawEmoji, type SceneGeom } from "./draw";

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  age: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

interface CupArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
}

interface StarBurst {
  x: number;
  y: number;
  age: number;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
}

interface Cloud {
  x: number;
  y: number;
  v: number;
  scale: number;
  dark: boolean;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
}

const RIPPLE_MS = 700;

/** Pre-baked puffy cloud sprites (one light, one dark). */
const cloudSprites = new Map<string, HTMLCanvasElement>();
function cloudSprite(dark: boolean): HTMLCanvasElement {
  const key = dark ? "dark" : "light";
  let c = cloudSprites.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = 140;
    c.height = 60;
    const g = c.getContext("2d")!;
    g.fillStyle = dark ? "rgba(160,170,185,0.75)" : "rgba(255,255,255,0.8)";
    for (const [cx, cy, r] of [[40, 38, 22], [70, 30, 26], [100, 38, 20]] as const) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(30, 38, 80, 16);
    cloudSprites.set(key, c);
  }
  return c;
}

const STOCKOUT_ICON: Record<ItemId, string> = { lemon: "🍋❗", sugar: "🍬❗", ice: "🧊❗", cup: "🥤❗" };

const CUP_ARC_MS = 320;
const BURST_MS = 550;

export class Fx {
  private pops: Pop[] = [];
  private particles: Particle[] = [];
  private cupArcs: CupArc[] = [];
  private bursts: StarBurst[] = [];
  private sparkles: Sparkle[] = [];
  private vignetteAlpha = 0;
  private vignetteSprite: HTMLCanvasElement | null = null;
  private vignetteKey = "";
  private popSeq = 0;
  private clouds: Cloud[] = [];
  private cloudCondition: Condition | null = null;
  private ripples: Ripple[] = [];
  private rippleCooldown = 0;
  private shimmerPhase = 0;

  // rush streak: sale timestamps in sim-minutes (speed-invariant)
  private saleMinutes: number[] = [];
  private streakShown = 0;
  private streakFade = 0; // ms since the streak last qualified

  constructor(
    private readonly reduceMotion: boolean,
    private readonly weatherFx: boolean,
  ) {}

  spawn(events: SimEvent[], g: SceneGeom, simMinute: number): void {
    const cx = g.cx;
    const cy = g.cy;
    for (const e of events) {
      // Spread successive pops so a busy minute doesn't stack them in one spot.
      const jx = ((this.popSeq++ % 5) - 2) * 16;
      const jy = (this.popSeq % 3) * 6;
      switch (e.type) {
        case "sale":
          this.pops.push(pop(cx + 26 + jx, cy - 4 - jy, e.stars >= 5 ? `+$${e.price.toFixed(2)} ⭐` : `+$${e.price.toFixed(2)}`, "#2f9e44", 900, 20));
          this.saleMinutes.push(simMinute);
          if (this.saleMinutes.length > 24) this.saleMinutes.shift();
          if (!this.reduceMotion) {
            if (this.cupArcs.length < 10) {
              this.cupArcs.push({ x0: cx - 36, y0: cy - 14, x1: cx + 30, y1: cy + 24, age: 0 });
            }
            if (e.stars >= 5 && this.bursts.length < 6) {
              this.bursts.push({ x: cx + 30, y: cy + 18, age: 0 });
            }
          }
          break;
        case "tip":
          this.pops.push(pop(cx + 54 + jx, cy - 20 - jy, `🪙 +$${e.amount.toFixed(2)}`, "#e8a800", 1000, 18));
          if (!this.reduceMotion) {
            for (let i = 0; i < 3 && this.sparkles.length < 24; i++) {
              this.sparkles.push({
                x: cx + 40 + Math.random() * 24,
                y: cy - 6,
                vx: (Math.random() - 0.5) * 0.06,
                vy: -0.05 - Math.random() * 0.05,
                age: 0,
                ttl: 500 + Math.random() * 250,
              });
            }
          }
          break;
        case "renege":
          this.pops.push(pop(cx + 110 + jx, cy + 6, "💨", "#868e96", 700, 22));
          break;
        case "stockout":
          this.pops.push(pop(cx, cy - 70, `${STOCKOUT_ICON[e.item]} out of ${e.item}s!`, "#e03131", 1200, 18));
          if (!this.reduceMotion) this.vignetteAlpha = 0.25;
          break;
      }
    }
    if (this.pops.length > 40) this.pops.splice(0, this.pops.length - 40);

    // rush streak: ≥4 sales within the last 6 sim-minutes
    const recent = this.saleMinutes.filter((m) => simMinute - m <= 6).length;
    if (recent >= 4) {
      this.streakShown = recent;
      this.streakFade = 0;
    }
  }

  step(dt: number): void {
    for (const p of this.pops) p.age += dt;
    this.pops = this.pops.filter((p) => p.age < p.ttl);

    for (const a of this.cupArcs) a.age += dt;
    this.cupArcs = this.cupArcs.filter((a) => a.age < CUP_ARC_MS);

    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < BURST_MS);

    for (const s of this.sparkles) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparkles = this.sparkles.filter((s) => s.age < s.ttl);

    this.vignetteAlpha = Math.max(0, this.vignetteAlpha - dt / 2400);
    if (this.streakShown > 0) {
      this.streakFade += dt;
      if (this.streakFade > 2000) this.streakShown = 0;
    }
  }

  /** Arcs, bursts, sparkles, streak badge, vignette — drawn above the scene. */
  drawOverlays(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
    for (const a of this.cupArcs) {
      const t = easeOutCubic(clamp01(a.age / CUP_ARC_MS));
      const p = arcPoint(a.x0, a.y0, a.x1, a.y1, 26, t);
      drawEmoji(ctx, "🥤", p.x, p.y, 16);
    }

    for (const b of this.bursts) {
      const t = clamp01(b.age / BURST_MS);
      const r = easeOutCubic(t) * 26;
      const alpha = 1 - t;
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        drawEmoji(ctx, "⭐", b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r, 10, alpha);
      }
    }

    for (const s of this.sparkles) {
      drawEmoji(ctx, "✨", s.x, s.y, 11, 1 - s.age / s.ttl);
    }

    if (this.streakShown > 0) {
      const alpha = this.streakFade > 1400 ? 1 - (this.streakFade - 1400) / 600 : 1;
      ctx.globalAlpha = Math.max(0, alpha);
      const bx = g.left + g.w - 8;
      const by = g.roofY - 34;
      ctx.font = "bold 16px 'Fredoka', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      drawEmoji(ctx, "🔥", bx, by, 18);
      ctx.fillStyle = "#e8590c";
      ctx.fillText(`×${this.streakShown}`, bx + 12, by + 1);
      ctx.globalAlpha = 1;
    }

    if (this.vignetteAlpha > 0.01) {
      ctx.globalAlpha = this.vignetteAlpha;
      ctx.drawImage(this.vignette(g), 0, 0, g.W, g.H);
      ctx.globalAlpha = 1;
    }
  }

  drawPops(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.pops) {
      const t = p.age / p.ttl;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      ctx.font = `bold ${p.size}px 'Fredoka', system-ui, sans-serif`;
      ctx.fillText(p.text, p.x, p.y - t * 34);
    }
    ctx.globalAlpha = 1;
  }

  /** Drifting clouds (partly/cloudy/rainy) — drawn just above the backdrop. */
  drawClouds(ctx: CanvasRenderingContext2D, g: SceneGeom, dt: number, condition: Condition): void {
    if (!this.weatherFx) return;
    const wantsClouds = condition === "partly" || condition === "cloudy" || condition === "rainy";
    if (!wantsClouds) return;
    if (this.cloudCondition !== condition) {
      this.cloudCondition = condition;
      const n = condition === "partly" ? 3 : 5;
      const dark = condition !== "partly";
      this.clouds = Array.from({ length: Math.min(6, n) }, () => ({
        x: Math.random() * g.W,
        y: 24 + Math.random() * Math.max(40, g.H * 0.18),
        v: (4 + Math.random() * 4) / 1000,
        scale: 0.6 + Math.random() * 0.7,
        dark,
      }));
    }
    for (const c of this.clouds) {
      c.x += c.v * dt;
      const w = 140 * c.scale;
      if (c.x - w / 2 > g.W) c.x = -w / 2;
      ctx.drawImage(cloudSprite(c.dark), c.x - w / 2, c.y - 30 * c.scale, w, 60 * c.scale);
    }
  }

  /** Heat shimmer bands above the ground line on heatwave days. */
  drawShimmer(ctx: CanvasRenderingContext2D, g: SceneGeom, dt: number, condition: Condition): void {
    if (!this.weatherFx || condition !== "heatwave") return;
    this.shimmerPhase += dt / 900;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 4;
    for (let band = 0; band < 3; band++) {
      const y = g.groundY - 8 - band * 9;
      ctx.beginPath();
      for (let x = 0; x <= g.W; x += 14) {
        const wy = y + Math.sin(x * 0.045 + this.shimmerPhase * (1 + band * 0.4)) * 2.4;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
  }

  drawWeather(ctx: CanvasRenderingContext2D, g: SceneGeom, dt: number, condition: Condition): void {
    if (!this.weatherFx) return;
    if (condition === "rainy") {
      // expanding ripple rings where drops land on the ground
      this.rippleCooldown -= dt;
      if (this.rippleCooldown <= 0 && this.ripples.length < 8) {
        this.rippleCooldown = 300;
        this.ripples.push({ x: Math.random() * g.W, y: g.groundY + 8 + Math.random() * (g.H - g.groundY - 20), age: 0 });
      }
      for (const r of this.ripples) {
        r.age += dt;
        const t = r.age / RIPPLE_MS;
        ctx.strokeStyle = `rgba(180,205,235,${0.5 * (1 - t)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, 4 + t * 14, (4 + t * 14) * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.ripples = this.ripples.filter((r) => r.age < RIPPLE_MS);
      for (let i = 0; i < 2; i++) {
        this.particles.push({ x: Math.random() * g.W, y: -10, vx: -0.03, vy: 0.45 + Math.random() * 0.25, size: 9 + Math.random() * 7 });
      }
      ctx.strokeStyle = "rgba(140,170,210,0.55)";
      ctx.lineWidth = 2;
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 8, p.y + p.size);
        ctx.stroke();
      }
    } else if (condition === "cold") {
      if (Math.random() < 0.7) {
        this.particles.push({ x: Math.random() * g.W, y: -8, vx: (Math.random() - 0.5) * 0.02, vy: 0.04 + Math.random() * 0.05, size: 2 + Math.random() * 3 });
      }
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      for (const p of this.particles) {
        p.y += p.vy * dt;
        p.x += Math.sin(p.y * 0.03 + p.size) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      this.particles.length = 0;
      return;
    }
    this.particles = this.particles.filter((p) => p.y < g.H + 14);
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }

  /** Pre-baked red vignette frame (rebaked only when the canvas resizes). */
  private vignette(g: SceneGeom): HTMLCanvasElement {
    const key = `${g.W}x${g.H}`;
    if (this.vignetteKey !== key || !this.vignetteSprite) {
      this.vignetteKey = key;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(g.W));
      c.height = Math.max(1, Math.round(g.H));
      const vctx = c.getContext("2d")!;
      const grad = vctx.createRadialGradient(g.W / 2, g.H / 2, Math.min(g.W, g.H) * 0.35, g.W / 2, g.H / 2, Math.max(g.W, g.H) * 0.62);
      grad.addColorStop(0, "rgba(224,49,49,0)");
      grad.addColorStop(1, "rgba(224,49,49,0.9)");
      vctx.fillStyle = grad;
      vctx.fillRect(0, 0, g.W, g.H);
      this.vignetteSprite = c;
    }
    return this.vignetteSprite;
  }
}

function pop(x: number, y: number, text: string, color: string, ttl: number, size: number): Pop {
  return { x, y, text, color, ttl, age: 0, size };
}
