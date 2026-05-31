/**
 * Canvas renderer for the live stand. Pure view — it consumes SimSnapshots and
 * SimEvents and paints a cheerful scene (queue with moods, stations with
 * progress, floating coin/tip/review pops). No game logic lives here.
 */
import type { Condition, SimEvent, SimSnapshot, WeatherDay } from "../../engine";
import { ARCHETYPE_BY_ID } from "../../data/archetypes";

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
const MOOD_RING = { happy: "#69db7c", ok: "#ffd43b", impatient: "#ff8787" };

interface Sprite {
  x: number;
  y: number;
  tx: number;
  ty: number;
  icon: string;
  mood: keyof typeof MOOD_RING;
  born: number;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
  age: number;
  size: number;
}

/** Ambient foot traffic + happy departers — conveys how busy the street is. */
interface Walker {
  x: number;
  y: number;
  vx: number;
  icon: string;
  size: number;
  alpha: number;
  lane: "back" | "front";
  phase: number;
}

export class StandView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly weather: WeatherDay;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private sprites = new Map<number, Sprite>();
  private pops: Pop[] = [];
  private walkers: Walker[] = [];
  private last = 0;
  private reduceMotion = false;

  constructor(canvas: HTMLCanvasElement, weather: WeatherDay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.weather = weather;
    this.reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = rect.width;
    this.H = rect.height;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private counterX() {
    return Math.min(this.W * 0.42, 360);
  }
  private counterY() {
    return this.H * 0.66;
  }

  render(snap: SimSnapshot, events: SimEvent[], now: number) {
    if (this.last === 0) this.last = now;
    const dt = Math.min(64, now - this.last);
    this.last = now;

    this.syncSprites(snap);
    this.spawnPops(events);
    this.spawnWalkers(events);
    this.step(dt);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawSky();
    this.drawStandBack(); // back wall + posts
    this.drawStations(snap); // workers behind the counter…
    this.drawCounter(snap); // …counter front so they peek over it
    this.drawCanopy(snap); // striped awning resting on the posts + sign
    this.drawQueue();
    this.drawWalkers("back"); // foot traffic strolling the sidewalk
    this.drawWalkers("front"); // happy customers leaving the counter
    this.drawPops();
  }

  // Stand geometry (shared by the structure pieces).
  private stand() {
    const cx = this.counterX();
    const cy = this.counterY();
    const left = 24;
    const w = cx - left;
    return { left, w, cx, cy, roofY: cy - 104, counterBottom: cy + 58, post: 12 };
  }

  private backLaneY() {
    return this.H * 0.9;
  }

  private spawnWalkers(events: SimEvent[]) {
    for (const e of events) {
      if (e.type === "arrive") {
        // A passer-by enters from a side and strolls along the sidewalk.
        const icon = ARCHETYPE_BY_ID[e.archetype]?.icon ?? "🧍";
        const fromLeft = Math.random() < 0.5;
        this.walkers.push({
          x: fromLeft ? -20 : this.W + 20,
          y: this.backLaneY() + (Math.random() - 0.5) * 24,
          vx: (fromLeft ? 1 : -1) * (0.024 + Math.random() * 0.022),
          icon,
          size: 24 + Math.random() * 6,
          alpha: 1,
          lane: "back",
          phase: Math.random() * Math.PI * 2,
        });
      } else if (e.type === "sale") {
        // A happy customer steps away from the counter.
        this.walkers.push({
          x: this.counterX() + 30,
          y: this.counterY() + 30,
          vx: 0.04 + Math.random() * 0.03,
          icon: e.stars >= 4 ? "😋" : "🙂",
          size: 22,
          alpha: 1,
          lane: "front",
          phase: 0,
        });
      }
    }
    if (this.walkers.length > 60) this.walkers.splice(0, this.walkers.length - 60);
  }

  private drawWalkers(lane: "back" | "front") {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const w of this.walkers) {
      if (w.lane !== lane) continue;
      const bob = this.reduceMotion ? 0 : Math.sin(w.phase) * 2;
      ctx.globalAlpha = w.alpha;
      ctx.font = `${w.size}px serif`;
      ctx.fillText(w.icon, w.x, w.y + bob);
    }
    ctx.globalAlpha = 1;
  }

  // --- scene ---
  private drawSky() {
    const ctx = this.ctx;
    const [a, b] = SKY[this.weather.condition];
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    // weather glyph in the corner
    ctx.font = "34px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(WEATHER_GLYPH[this.weather.condition], this.W - 44, 44);

    // ground
    ctx.fillStyle = "#c3e8b8";
    ctx.fillRect(0, this.counterY() + 54, this.W, this.H);
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, this.counterY() + 54, this.W, 3);

    // sidewalk strip where foot traffic strolls
    const lane = this.backLaneY();
    ctx.fillStyle = "#d8cfa8";
    ctx.fillRect(0, lane - 22, this.W, 44);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(0, lane - 22, this.W, 2);
  }

  /** Back wall + two posts — gives the booth structure behind the counter. */
  private drawStandBack() {
    const ctx = this.ctx;
    const { left, w, cx, cy, roofY, post } = this.stand();

    // back wall (light planks)
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

    // posts
    ctx.fillStyle = "#a87b3f";
    roundRect(ctx, left, roofY, post, cy - roofY + 6, 4);
    ctx.fill();
    roundRect(ctx, cx - post, roofY, post, cy - roofY + 6, 4);
    ctx.fill();
  }

  private drawStations(snap: SimSnapshot) {
    const ctx = this.ctx;
    const { left, w, cy } = this.stand();
    const n = snap.stations.length;
    const slotW = w / Math.max(1, n);
    snap.stations.forEach((st, i) => {
      const x = left + slotW * i + slotW / 2;
      const headY = cy - 12; // chest behind the counter, head peeking above it
      if (st.state !== "idle") {
        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = st.state === "serving" ? "#4dabf7" : "#9775fa";
        ctx.arc(x, headY - 6, 20, -Math.PI / 2, -Math.PI / 2 + st.progress * Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = "30px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.kind === "player" ? "🧑" : "🧑‍🍳", x, headY);
    });
  }

  private drawCounter(snap: SimSnapshot) {
    const ctx = this.ctx;
    const { left, w, cx, cy, counterBottom } = this.stand();

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

    // lemonade jugs on the counter + the ready count
    ctx.font = "20px serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("🍋🥤", left + 10, cy + 3);
    ctx.font = "bold 13px 'Fredoka', system-ui, sans-serif";
    ctx.fillStyle = "#fffdf3";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(snap.pitcherPool)} ready`, cx - 8, cy + 30);
  }

  /** Striped scalloped awning resting on the posts + the hanging sign. */
  private drawCanopy(_snap: SimSnapshot) {
    const ctx = this.ctx;
    const { left, w, cy, roofY } = this.stand();
    const ax = left - 8;
    const aw = w + 16;
    const stripes = 8;
    const sw = aw / stripes;

    // canopy band
    ctx.fillStyle = "#ff8787";
    roundRect(ctx, ax, roofY - 16, aw, 20, 7);
    ctx.fill();
    // scalloped stripes hanging from the band
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? "#fff5f5" : "#ff8787";
      const sx = ax + sw * i;
      ctx.beginPath();
      ctx.moveTo(sx, roofY + 4);
      ctx.lineTo(sx + sw, roofY + 4);
      ctx.lineTo(sx + sw / 2, roofY + 18);
      ctx.closePath();
      ctx.fill();
    }
    // a little shadow line under the canopy
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(ax + 4, roofY + 18, aw - 8, 2);

    // hanging sign
    ctx.fillStyle = "#fffdf3";
    roundRect(ctx, left + w * 0.14, roofY + 24, w * 0.72, 28, 8);
    ctx.fill();
    ctx.strokeStyle = "#efe4c4";
    ctx.lineWidth = 2;
    roundRect(ctx, left + w * 0.14, roofY + 24, w * 0.72, 28, 8);
    ctx.stroke();
    ctx.fillStyle = "#3a2e20";
    ctx.font = "bold 16px 'Fredoka', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🍋 LEMONADE", left + w / 2, roofY + 39);
  }

  private drawQueue() {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const s of this.sprites.values()) {
      // mood ring
      ctx.beginPath();
      ctx.fillStyle = MOOD_RING[s.mood];
      ctx.arc(s.x, s.y + 2, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fffdf3";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "22px serif";
      ctx.fillText(s.icon, s.x, s.y + 1);
    }
  }

  private drawPops() {
    const ctx = this.ctx;
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

  // --- state updates ---
  private queueSlot(i: number): { x: number; y: number } {
    const startX = this.counterX() + 50;
    const gap = 40;
    return { x: startX + i * gap, y: this.counterY() + 34 };
  }

  private syncSprites(snap: SimSnapshot) {
    const seen = new Set<number>();
    snap.queue.forEach((c, i) => {
      seen.add(c.id);
      const slot = this.queueSlot(i);
      let s = this.sprites.get(c.id);
      if (!s) {
        s = { x: this.W + 30, y: slot.y, tx: slot.x, ty: slot.y, icon: c.icon, mood: c.mood, born: this.last };
        this.sprites.set(c.id, s);
      }
      s.tx = slot.x;
      s.ty = slot.y;
      s.mood = c.mood;
    });
    for (const [id] of this.sprites) if (!seen.has(id)) this.sprites.delete(id);
  }

  private step(dt: number) {
    const k = this.reduceMotion ? 1 : Math.min(1, dt / 90);
    for (const s of this.sprites.values()) {
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
    }
    for (const p of this.pops) p.age += dt;
    this.pops = this.pops.filter((p) => p.age < p.ttl);

    for (const w of this.walkers) {
      w.x += w.vx * dt;
      w.phase += dt * 0.012;
      if (w.lane === "front") w.alpha = Math.max(0, w.alpha - dt * 0.0009);
    }
    this.walkers = this.walkers.filter((w) => w.x > -40 && w.x < this.W + 60 && w.alpha > 0.02);
  }

  private popSeq = 0;
  private spawnPops(events: SimEvent[]) {
    const cx = this.counterX();
    const cy = this.counterY();
    for (const e of events) {
      // Spread successive pops so a busy minute doesn't stack them in one spot.
      const jx = ((this.popSeq++ % 5) - 2) * 16;
      const jy = (this.popSeq % 3) * 6;
      switch (e.type) {
        case "sale":
          this.pops.push(pop(cx + 26 + jx, cy - 4 - jy, e.stars >= 5 ? `+$${e.price.toFixed(2)} ⭐` : `+$${e.price.toFixed(2)}`, "#2f9e44", 900, 20));
          break;
        case "tip":
          this.pops.push(pop(cx + 54 + jx, cy - 20 - jy, `🪙 +$${e.amount.toFixed(2)}`, "#e8a800", 1000, 18));
          break;
        case "renege":
          this.pops.push(pop(cx + 110 + jx, cy + 6, "💨", "#868e96", 700, 22));
          break;
        case "stockout":
          this.pops.push(pop(cx, cy - 70, `out of ${e.item}!`, "#e03131", 1200, 18));
          break;
      }
    }
    if (this.pops.length > 40) this.pops.splice(0, this.pops.length - 40);
  }
}

function pop(x: number, y: number, text: string, color: string, ttl: number, size: number): Pop {
  return { x, y, text, color, ttl, age: 0, size };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
