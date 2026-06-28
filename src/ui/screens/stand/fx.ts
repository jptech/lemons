/**
 * Event-driven and ambient effects: floating text pops, weather particles,
 * awning rain drips, cup-handoff arcs, coins that fly into the tip jar, batch
 * pour splashes, 5★ star bursts, opening confetti, sun motes, park fireflies
 * at dusk, passing birds, the rush-streak badge, and the stockout vignette.
 * All cosmetic, all capped, all gated by the relevant settings.
 */
import type { Condition, ItemId, SimEvent } from "../../../engine";
import { arcPoint, clamp01, easeOutCubic } from "../../tween";
import type { SceneContext } from "./sceneContext";
import { drawCup, drawEmoji, hash01, withAlpha, type SceneGeom } from "./draw";
import { drawStar } from "./peeps";
import { awningScallopTips, pitcherPos, tipJarPos } from "./structure";

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  age: number;
  size: number;
  pill?: boolean;
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

interface CoinArc {
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

interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  color: string;
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
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

interface Drip {
  x: number;
  y: number;
  vy: number;
  tipY: number;
}

interface Bird {
  x: number;
  y: number;
  vx: number;
  phase: number;
}

interface Firefly {
  x: number;
  y: number;
  phase: number;
  drift: number;
}

const RIPPLE_MS = 700;
const CUP_ARC_MS = 320;
const COIN_ARC_MS = 460;
const BURST_MS = 550;

const CONFETTI_COLORS = ["#ffd43b", "#ff8787", "#69db7c", "#4dabf7", "#fff5f5"];

/** Pre-baked puffy cloud sprites (one light, one dark) — three-tone shading. */
const cloudSprites = new Map<string, HTMLCanvasElement>();
function cloudSprite(dark: boolean): HTMLCanvasElement {
  const key = dark ? "dark" : "light";
  let c = cloudSprites.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = 150;
    c.height = 66;
    const g = c.getContext("2d")!;
    const base = dark ? "rgba(150,160,178,0.8)" : "rgba(255,255,255,0.85)";
    const shadeC = dark ? "rgba(120,130,150,0.7)" : "rgba(205,215,230,0.7)";
    const lite = dark ? "rgba(185,193,208,0.8)" : "rgba(255,255,255,0.95)";
    // flat-bottomed puff cluster
    g.fillStyle = base;
    for (const [cx, cy, r] of [[44, 40, 22], [75, 30, 27], [106, 40, 20]] as const) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(34, 40, 84, 16);
    // underside shading
    g.fillStyle = shadeC;
    g.beginPath();
    g.ellipse(75, 54, 42, 6, 0, 0, Math.PI * 2);
    g.fill();
    // top highlight
    g.fillStyle = lite;
    g.beginPath();
    g.arc(70, 24, 16, 0, Math.PI * 2);
    g.arc(88, 28, 12, 0, Math.PI * 2);
    g.fill();
    cloudSprites.set(key, c);
  }
  return c;
}

const STOCKOUT_ICON: Record<ItemId, string> = { lemon: "🍋", sugar: "🍬", ice: "🧊", cup: "🥤" };

export class Fx {
  private pops: Pop[] = [];
  private particles: Particle[] = [];
  private cupArcs: CupArc[] = [];
  private coins: CoinArc[] = [];
  private bursts: StarBurst[] = [];
  private sparkles: Sparkle[] = [];
  private droplets: Droplet[] = [];
  private confetti: Confetto[] = [];
  private vignetteAlpha = 0;
  private vignetteSprite: HTMLCanvasElement | null = null;
  private vignetteKey = "";
  private popSeq = 0;
  private clouds: Cloud[] = [];
  private cloudCondition: Condition | null = null;
  private ripples: Ripple[] = [];
  private rippleCooldown = 0;
  private drips: Drip[] = [];
  private dripCooldown = 0;
  private shimmerPhase = 0;
  private birds: Bird[] = [];
  private birdCooldown = 4000;
  private fireflies: Firefly[] = [];
  private motes: { x: number; y: number; phase: number }[] = [];

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
        case "open":
          if (!this.reduceMotion) {
            // confetti burst around the hanging sign
            const sx = g.left + g.w / 2;
            const sy = g.roofY + 38;
            for (let i = 0; i < 18; i++) {
              const a = (i / 18) * Math.PI * 2;
              const sp = 0.05 + Math.random() * 0.07;
              this.confetti.push({
                x: sx,
                y: sy,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 0.06,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 0.012,
                color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
                age: 0,
                ttl: 800 + Math.random() * 400,
              });
            }
          }
          break;
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
        case "tip": {
          this.pops.push(pop(cx + 54 + jx, cy - 24 - jy, `+$${e.amount.toFixed(2)} tip`, "#e8a800", 1000, 16));
          if (!this.reduceMotion && this.coins.length < 8) {
            const jar = tipJarPos(g);
            this.coins.push({ x0: cx + 16, y0: cy + 14, x1: jar.x, y1: jar.y - 16, age: 0 });
          }
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
        }
        case "batch":
          // a pour splash at the pitcher as the fresh batch lands
          if (!this.reduceMotion) {
            const p = pitcherPos(g);
            for (let i = 0; i < 7 && this.droplets.length < 40; i++) {
              this.droplets.push({
                x: p.x + (Math.random() - 0.5) * 10,
                y: p.y - 30,
                vx: (Math.random() - 0.5) * 0.07,
                vy: -0.07 - Math.random() * 0.07,
                age: 0,
                ttl: 420 + Math.random() * 200,
                color: Math.random() < 0.7 ? "#ffe066" : "#fff7cf",
              });
            }
          }
          break;
        case "renege":
          this.pops.push(pop(cx + 110 + jx, cy + 6, "💨", "#868e96", 700, 22));
          break;
        case "stockout":
          this.pops.push(pop(cx, cy - 70, `${STOCKOUT_ICON[e.item]} out of ${e.item}s!`, "#e03131", 1300, 15, true));
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

    for (const cArc of this.coins) cArc.age += dt;
    this.coins = this.coins.filter((cArc) => cArc.age < COIN_ARC_MS);

    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < BURST_MS);

    for (const s of this.sparkles) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparkles = this.sparkles.filter((s) => s.age < s.ttl);

    for (const d of this.droplets) {
      d.age += dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += dt * 0.0005;
    }
    this.droplets = this.droplets.filter((d) => d.age < d.ttl);

    for (const cf of this.confetti) {
      cf.age += dt;
      cf.x += cf.vx * dt;
      cf.y += cf.vy * dt;
      cf.vy += dt * 0.00028;
      cf.rot += cf.vr * dt;
    }
    this.confetti = this.confetti.filter((cf) => cf.age < cf.ttl);

    this.vignetteAlpha = Math.max(0, this.vignetteAlpha - dt / 2400);
    if (this.streakShown > 0) {
      this.streakFade += dt;
      if (this.streakFade > 2000) this.streakShown = 0;
    }
  }

  /** Arcs, coins, bursts, sparkles, splashes, streak badge, vignette. */
  drawOverlays(ctx: CanvasRenderingContext2D, g: SceneGeom): void {
    for (const a of this.cupArcs) {
      const t = easeOutCubic(clamp01(a.age / CUP_ARC_MS));
      const p = arcPoint(a.x0, a.y0, a.x1, a.y1, 26, t);
      drawCup(ctx, p.x, p.y + 7, 13);
    }

    for (const cArc of this.coins) {
      const t = easeOutCubic(clamp01(cArc.age / COIN_ARC_MS));
      const p = arcPoint(cArc.x0, cArc.y0, cArc.x1, cArc.y1, 34, t);
      const squash = Math.abs(Math.sin(cArc.age / 60)); // tumbling
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4.2 * Math.max(0.25, squash), 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e8a800";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (t > 0.92) {
        // plink ring as it lands in the jar
        ctx.strokeStyle = "rgba(255,212,59,0.7)";
        ctx.beginPath();
        ctx.arc(cArc.x1, cArc.y1, (t - 0.92) * 90, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const b of this.bursts) {
      const t = clamp01(b.age / BURST_MS);
      const r = easeOutCubic(t) * 28;
      ctx.globalAlpha = 1 - t;
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        drawStar(ctx, b.x + Math.cos(ang) * r, b.y + Math.sin(ang) * r, 4.5, "#ffd43b");
      }
      // ray ring
      ctx.strokeStyle = "rgba(255,212,59,0.8)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(ang) * r * 0.55, b.y + Math.sin(ang) * r * 0.55);
        ctx.lineTo(b.x + Math.cos(ang) * r * 0.8, b.y + Math.sin(ang) * r * 0.8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (const s of this.sparkles) {
      const a = 1 - s.age / s.ttl;
      ctx.fillStyle = `rgba(255,236,153,${a})`;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.age / 200);
      ctx.fillRect(-3, -0.8, 6, 1.6);
      ctx.fillRect(-0.8, -3, 1.6, 6);
      ctx.restore();
    }

    for (const d of this.droplets) {
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 1 - d.age / d.ttl;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const cf of this.confetti) {
      ctx.save();
      ctx.translate(cf.x, cf.y);
      ctx.rotate(cf.rot);
      ctx.globalAlpha = 1 - cf.age / cf.ttl;
      ctx.fillStyle = cf.color;
      ctx.fillRect(-2.5, -1.5, 5, 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (this.streakShown > 0) {
      const alpha = this.streakFade > 1400 ? 1 - (this.streakFade - 1400) / 600 : 1;
      ctx.globalAlpha = Math.max(0, alpha);
      const bx = g.left + g.w - 16;
      const by = g.roofY - 34;
      ctx.fillStyle = "rgba(255,253,243,0.95)";
      ctx.beginPath();
      ctx.moveTo(bx - 12, by - 11);
      ctx.arcTo(bx + 44, by - 11, bx + 44, by + 11, 11);
      ctx.arcTo(bx + 44, by + 11, bx - 12, by + 11, 11);
      ctx.arcTo(bx - 12, by + 11, bx - 12, by - 11, 11);
      ctx.arcTo(bx - 12, by - 11, bx + 44, by - 11, 11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(232,89,12,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = "bold 15px 'Fredoka', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      drawEmoji(ctx, "🔥", bx, by, 16);
      ctx.fillStyle = "#e8590c";
      ctx.fillText(`×${this.streakShown}`, bx + 11, by + 1);
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
      const y = p.y - t * 34;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.font = `bold ${p.size}px 'Fredoka', system-ui, sans-serif`;
      if (p.pill) {
        const tw = ctx.measureText(p.text).width;
        ctx.fillStyle = "rgba(255,253,243,0.95)";
        ctx.beginPath();
        const px = p.x - tw / 2 - 9;
        const pw = tw + 18;
        ctx.moveTo(px + 11, y - 12);
        ctx.arcTo(px + pw, y - 12, px + pw, y + 12, 11);
        ctx.arcTo(px + pw, y + 12, px, y + 12, 11);
        ctx.arcTo(px, y + 12, px, y - 12, 11);
        ctx.arcTo(px, y - 12, px + pw, y - 12, 11);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = withAlpha(p.color, 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, y);
      } else {
        // thick warm-white outline keeps money pops readable over anything
        ctx.strokeStyle = "rgba(255,253,243,0.9)";
        ctx.lineWidth = 3.5;
        ctx.lineJoin = "round";
        ctx.strokeText(p.text, p.x, y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, y);
      }
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
      const w = 150 * c.scale;
      if (c.x - w / 2 > g.W) c.x = -w / 2;
      ctx.drawImage(cloudSprite(c.dark), c.x - w / 2, c.y - 33 * c.scale, w, 66 * c.scale);
    }
  }

  /**
   * Ambient life between the backdrop and the stand: passing birds, sun motes
   * sparkling in the light, and fireflies in the park at dusk.
   */
  drawAmbient(ctx: CanvasRenderingContext2D, g: SceneGeom, dt: number, scene: SceneContext, tod: number): void {
    if (!this.weatherFx) return;
    const cond = scene.weather.condition;

    // birds — occasional small flocks crossing the sky (not in rain)
    if (cond !== "rainy") {
      this.birdCooldown -= dt;
      if (this.birdCooldown <= 0 && this.birds.length < 5) {
        this.birdCooldown = 9000 + Math.random() * 9000;
        const fromLeft = Math.random() < 0.5;
        const baseY = 40 + Math.random() * 60;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this.birds.push({
            x: (fromLeft ? -20 : g.W + 20) - (fromLeft ? 1 : -1) * i * 18,
            y: baseY + (i % 2) * 10,
            vx: (fromLeft ? 1 : -1) * (0.035 + Math.random() * 0.02),
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      ctx.strokeStyle = "rgba(70,75,95,0.7)";
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (const b of this.birds) {
        b.x += b.vx * dt;
        b.phase += dt * 0.014;
        const flap = Math.sin(b.phase) * 3.2;
        ctx.beginPath();
        ctx.moveTo(b.x - 4.5, b.y - flap);
        ctx.quadraticCurveTo(b.x, b.y + 1.5, b.x, b.y);
        ctx.quadraticCurveTo(b.x, b.y + 1.5, b.x + 4.5, b.y - flap);
        ctx.stroke();
      }
      this.birds = this.birds.filter((b) => b.x > -40 && b.x < g.W + 40);
    }

    // sun motes — slow golden specks drifting in the warm light
    if ((cond === "sunny" || cond === "heatwave") && tod < 0.75) {
      if (this.motes.length === 0) {
        this.motes = Array.from({ length: 12 }, (_, i) => ({
          x: hash01(i, 91) * g.W,
          y: 30 + hash01(i, 92) * (g.groundY - 80),
          phase: hash01(i, 93) * Math.PI * 2,
        }));
      }
      for (const m of this.motes) {
        m.phase += dt * 0.0006;
        const a = 0.18 + 0.16 * Math.sin(m.phase * 3.1);
        ctx.fillStyle = `rgba(255,240,170,${Math.max(0, a)})`;
        ctx.beginPath();
        ctx.arc(m.x + Math.sin(m.phase) * 14, m.y + Math.cos(m.phase * 0.7) * 10, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // fireflies — park magic once dusk falls
    if (scene.locationId === "park" && tod > 0.68) {
      if (this.fireflies.length === 0) {
        this.fireflies = Array.from({ length: 7 }, (_, i) => ({
          x: g.W * (0.45 + hash01(i, 95) * 0.5),
          y: g.groundY - 14 - hash01(i, 96) * 52,
          phase: hash01(i, 97) * Math.PI * 2,
          drift: 0.6 + hash01(i, 98) * 0.8,
        }));
      }
      const rise = clamp01((tod - 0.68) / 0.12);
      for (const f of this.fireflies) {
        f.phase += dt * 0.0011 * f.drift;
        const x = f.x + Math.sin(f.phase) * 22;
        const y = f.y + Math.sin(f.phase * 1.7) * 9;
        const pulse = Math.max(0, Math.sin(f.phase * 2.3));
        const a = rise * pulse * 0.85;
        if (a < 0.04) continue;
        const glow = ctx.createRadialGradient(x, y, 0.4, x, y, 6);
        glow.addColorStop(0, `rgba(212,255,140,${a})`);
        glow.addColorStop(1, "rgba(212,255,140,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.fillStyle = `rgba(232,255,180,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.fireflies.length > 0 && scene.locationId !== "park") {
      this.fireflies = [];
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
      // drips gathering at the awning scallop tips, falling, and splashing
      this.dripCooldown -= dt;
      if (this.dripCooldown <= 0 && this.drips.length < 10) {
        this.dripCooldown = 240;
        const tips = awningScallopTips(g);
        const tip = tips[Math.floor(Math.random() * tips.length)]!;
        this.drips.push({ x: tip.x, y: tip.y, vy: 0, tipY: tip.y });
      }
      for (const d of this.drips) {
        if (d.y - d.tipY < 4 && d.vy < 0.1) d.vy += dt * 0.00012; // swelling at the tip
        else d.vy += dt * 0.0008;
        d.y += d.vy * dt;
        ctx.fillStyle = "rgba(160,195,235,0.8)";
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, 1.6, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (d.y >= g.groundY + 2 && this.ripples.length < 10) {
          this.ripples.push({ x: d.x, y: g.groundY + 4, age: 0 });
        }
      }
      this.drips = this.drips.filter((d) => d.y < g.groundY + 2);

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

function pop(x: number, y: number, text: string, color: string, ttl: number, size: number, pill = false): Pop {
  return { x, y, text, color, ttl, age: 0, size, pill };
}
