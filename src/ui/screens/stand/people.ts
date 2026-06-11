/**
 * Everyone in the scene: the queue (with moods and walk-up paths), the workers
 * at their stations, ambient foot traffic, and leavers (happy, stormed-off, or
 * trudging away). Owns the sprite/walker state; the StandView orchestrates.
 */
import type { SimEvent, SimSnapshot } from "../../../engine";
import { ARCHETYPE_BY_ID } from "../../../data/archetypes";
import type { SceneContext } from "./sceneContext";
import { drawEmoji, drawShadow, type SceneGeom } from "./draw";

const MOOD_RING = { happy: "#69db7c", ok: "#ffd43b", impatient: "#ff8787" };

interface Sprite {
  x: number;
  y: number;
  tx: number;
  ty: number;
  icon: string;
  mood: keyof typeof MOOD_RING;
  isRegular: boolean;
  born: number;
  phase: number;
  /** Remaining walk-up path; sprite heads to waypoints[0] until empty. */
  waypoints: { x: number; y: number }[];
}

type WalkerKind = "ambient" | "depart" | "balk" | "trudge";

interface Walker {
  x: number;
  y: number;
  vx: number;
  icon: string;
  size: number;
  alpha: number;
  lane: "back" | "front";
  phase: number;
  kind: WalkerKind;
  /** Little celebratory hop played right after a purchase (departers). */
  hopT: number;
}

export function queueSlot(g: SceneGeom, i: number): { x: number; y: number } {
  return { x: g.cx + 50 + i * 40, y: g.cy + 34 };
}

export class People {
  readonly sprites = new Map<number, Sprite>();
  private walkers: Walker[] = [];
  /** Sprites that left the queue this frame (for renege correlation). */
  private removedThisFrame: Sprite[] = [];

  constructor(private readonly reduceMotion: boolean) {}

  /** Reconcile sprites with the live queue (call before handleEvents). */
  sync(snap: SimSnapshot, g: SceneGeom, now: number): void {
    const seen = new Set<number>();
    snap.queue.forEach((c, i) => {
      seen.add(c.id);
      const slot = queueSlot(g, i);
      let s = this.sprites.get(c.id);
      if (!s) {
        // walk up from the sidewalk instead of teleporting to the slot
        const fromLeft = Math.random() < 0.35;
        s = {
          x: fromLeft ? -30 : g.W + 30,
          y: g.laneY - 6,
          tx: slot.x,
          ty: slot.y,
          icon: c.icon,
          mood: c.mood,
          isRegular: c.archetype === "regular",
          born: now,
          phase: Math.random() * Math.PI * 2,
          waypoints: this.reduceMotion ? [] : [{ x: slot.x + 14, y: g.laneY - 14 }],
        };
        this.sprites.set(c.id, s);
      }
      s.tx = slot.x;
      s.ty = slot.y;
      s.mood = c.mood;
    });
    this.removedThisFrame = [];
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) {
        this.removedThisFrame.push(s);
        this.sprites.delete(id);
      }
    }
  }

  /** Spawn walkers for this frame's events. Call after sync(). */
  handleEvents(events: SimEvent[], g: SceneGeom): void {
    for (const e of events) {
      switch (e.type) {
        case "arrive": {
          // A passer-by strolls the sidewalk (ambience — the actual queue
          // joiner is handled by sync()).
          const icon = ARCHETYPE_BY_ID[e.archetype]?.icon ?? "🧍";
          const fromLeft = Math.random() < 0.5;
          this.walkers.push({
            x: fromLeft ? -20 : g.W + 20,
            y: g.laneY + (Math.random() - 0.5) * 24,
            vx: (fromLeft ? 1 : -1) * (0.024 + Math.random() * 0.022),
            icon,
            size: 24 + Math.random() * 6,
            alpha: 1,
            lane: "back",
            phase: Math.random() * Math.PI * 2,
            kind: "ambient",
            hopT: 1,
          });
          break;
        }
        case "sale":
          // A happy customer hops and steps away from the counter.
          this.walkers.push({
            x: g.cx + 30,
            y: g.cy + 30,
            vx: 0.04 + Math.random() * 0.03,
            icon: e.stars >= 4 ? "😋" : "🙂",
            size: 22,
            alpha: 1,
            lane: "front",
            phase: 0,
            kind: "depart",
            hopT: this.reduceMotion ? 1 : 0,
          });
          break;
        case "balk": {
          // Took one look at the line and stormed off.
          const tail = queueSlot(g, 5);
          this.walkers.push({
            x: Math.min(tail.x, g.W - 40),
            y: tail.y + 6,
            vx: 0.07 + Math.random() * 0.03,
            icon: "😤",
            size: 22,
            alpha: 1,
            lane: "front",
            phase: 0,
            kind: "balk",
            hopT: 1,
          });
          break;
        }
        case "renege": {
          // The sprite that just vanished from the queue trudges away.
          const s = this.removedThisFrame.pop();
          this.walkers.push({
            x: s?.x ?? g.cx + 130,
            y: s?.y ?? g.cy + 38,
            vx: 0.022,
            icon: "😞",
            size: 22,
            alpha: 1,
            lane: "front",
            phase: 0,
            kind: "trudge",
            hopT: 1,
          });
          break;
        }
      }
    }
    if (this.walkers.length > 60) this.walkers.splice(0, this.walkers.length - 60);
  }

  /** When the day ends, everyone still in line disperses as walkers. */
  disperseQueue(g: SceneGeom): void {
    for (const s of this.sprites.values()) {
      this.walkers.push({
        x: s.x,
        y: s.y,
        vx: 0.03 + Math.random() * 0.02,
        icon: s.icon,
        size: 22,
        alpha: 1,
        lane: "front",
        phase: Math.random() * Math.PI * 2,
        kind: "ambient",
        hopT: 1,
      });
    }
    this.sprites.clear();
  }

  step(dt: number, W: number): void {
    const k = this.reduceMotion ? 1 : Math.min(1, dt / 90);
    for (const s of this.sprites.values()) {
      const wp = s.waypoints[0];
      const target = wp ?? { x: s.tx, y: s.ty };
      s.x += (target.x - s.x) * k;
      s.y += (target.y - s.y) * k;
      if (wp && Math.abs(s.x - wp.x) + Math.abs(s.y - wp.y) < 6) s.waypoints.shift();
      s.phase += dt * (s.mood === "impatient" ? 0.014 : 0.006);
    }
    for (const w of this.walkers) {
      w.x += w.vx * dt;
      w.phase += dt * 0.012;
      w.hopT = Math.min(1, w.hopT + dt / 280);
      if (w.lane === "front") w.alpha = Math.max(0, w.alpha - dt * (w.kind === "trudge" ? 0.0006 : 0.0009));
    }
    this.walkers = this.walkers.filter((w) => w.x > -40 && w.x < W + 60 && w.alpha > 0.02);
  }

  drawQueue(ctx: CanvasRenderingContext2D, sunT: number): void {
    for (const s of this.sprites.values()) {
      const idleBob = this.reduceMotion ? 0 : Math.sin(s.phase) * (s.mood === "impatient" ? 2.2 : 1.4);
      const fidget = !this.reduceMotion && s.mood === "impatient" ? Math.sin(s.phase * 1.7) * 1 : 0;
      const x = s.x + fidget;
      const y = s.y + idleBob;

      drawShadow(ctx, s.x, s.y + 20, 30, sunT, 0.1);

      // mood ring
      ctx.beginPath();
      ctx.fillStyle = MOOD_RING[s.mood];
      ctx.arc(x, y + 2, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fffdf3";
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();
      drawEmoji(ctx, s.icon, x, y + 1, 22);

      // loyal regulars wear their heart
      if (s.isRegular) drawEmoji(ctx, "💛", x, y - 22, 11);

      // a little thought bubble for impatient folks
      if (s.mood === "impatient") {
        drawEmoji(ctx, "💭", x + 13, y - 15, 13);
        drawEmoji(ctx, "⏳", x + 17, y - 18, 9);
      }
    }
  }

  drawWalkers(ctx: CanvasRenderingContext2D, lane: "back" | "front", sunT: number): void {
    for (const w of this.walkers) {
      if (w.lane !== lane) continue;
      const bob = this.reduceMotion ? 0 : Math.sin(w.phase) * (w.kind === "trudge" ? 1 : 2);
      // post-purchase hop: a quick eased bounce as they step away
      const hop = w.kind === "depart" && w.hopT < 1 ? Math.sin(w.hopT * Math.PI) * 9 : 0;
      if (lane === "back" && w.alpha > 0.5) drawShadow(ctx, w.x, w.y + 16, w.size, sunT, 0.06);
      drawEmoji(ctx, w.icon, w.x, w.y + bob - hop, w.size, w.alpha);
      if (w.kind === "balk" && w.alpha > 0.4) drawEmoji(ctx, "💨", w.x - 16, w.y + 6, 12, w.alpha * 0.8);
    }
  }

  drawStations(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot, scene: SceneContext, sunT: number): void {
    const n = snap.stations.length;
    const slotW = g.w / Math.max(1, n);
    const brewer = scene.equip["brewer"] ?? 0;
    const autoServe = (scene.equip["dispenser"] ?? 0) >= 3;
    snap.stations.forEach((st, i) => {
      const x = g.left + slotW * i + slotW / 2;
      // MAKE stations stand a half-step back from the counter
      const headY = g.cy - 12 - (st.role === "MAKE" ? 6 : 0);
      if (st.state !== "idle") {
        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle =
          st.state === "serving"
            ? autoServe ? "#9775fa" : "#4dabf7"
            : brewer >= 2 ? "#7048e8" : "#9775fa";
        ctx.arc(x, headY - 6, 20, -Math.PI / 2, -Math.PI / 2 + st.progress * Math.PI * 2);
        ctx.stroke();
      }
      const staff = st.kind === "staff" ? scene.staffByStation[st.id - 1] : undefined;
      const icon = st.kind === "player" ? "🧑" : staff?.icon ?? "🧑‍🍳";
      drawEmoji(ctx, icon, x, headY, 30);
      if (staff?.tier === 3) drawEmoji(ctx, "⭐", x + 12, headY + 10, 10);
      // which drink is being brewed + the brewer's badge
      if (st.state === "making" && st.makeIcon) {
        drawEmoji(ctx, st.makeIcon, x, headY - 30, 16);
        if (brewer >= 1) drawEmoji(ctx, brewer >= 2 ? "🌀" : "⚡", x + 18, headY - 24, 12);
      }
    });
  }

  /** A customer at the window for each station currently serving. */
  drawServed(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot): void {
    const n = snap.stations.length;
    const slotW = g.w / Math.max(1, n);
    snap.stations.forEach((st, i) => {
      if (st.state !== "serving" || !st.servingIcon) return;
      const x = g.left + slotW * i + slotW / 2;
      const y = g.cy + 16;
      ctx.beginPath();
      ctx.fillStyle = "#fffdf3";
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      drawEmoji(ctx, st.servingIcon, x, y + 1, 20);
    });
  }
}
