/**
 * Everyone in the scene: the queue (with moods and walk-up paths), the workers
 * at their stations, ambient foot traffic, and leavers (happy with a cup in
 * hand, stormed-off, or trudging away). All humans are procedurally drawn
 * peeps (see peeps.ts) — a customer's outfit is seeded by their sim id, so the
 * person who joined the line is the same person who walks off with the drink.
 */
import type { SimEvent, SimSnapshot } from "../../../engine";
import { ARCHETYPE_BY_ID } from "../../../data/archetypes";
import type { SceneContext } from "./sceneContext";
import { drawEmoji, drawShadow, withAlpha, INK, type SceneGeom } from "./draw";
import { drawPeep, drawStaffPeep, makeLook, type PeepLook, type PeepMood } from "./peeps";

interface Sprite {
  x: number;
  y: number;
  tx: number;
  ty: number;
  look: PeepLook;
  mood: PeepMood;
  isRegular: boolean;
  born: number;
  phase: number;
  walk: number; // walk-cycle phase, advanced by actual movement
  stride: number; // smoothed 0..1 — walking vs standing
  facing: 1 | -1;
  /** Remaining walk-up path; sprite heads to waypoints[0] until empty. */
  waypoints: { x: number; y: number }[];
}

type WalkerKind = "ambient" | "depart" | "balk" | "trudge";

interface Walker {
  x: number;
  y: number;
  vx: number;
  look: PeepLook;
  mood: PeepMood;
  carryCup: boolean;
  alpha: number;
  lane: "back" | "front";
  walk: number;
  kind: WalkerKind;
  /** Little celebratory hop played right after a purchase (departers). */
  hopT: number;
}

export function queueSlot(g: SceneGeom, i: number): { x: number; y: number } {
  return { x: g.cx + 50 + i * 40, y: g.cy + 34 };
}

/** Stable-ish seed from a string (staff icons → looks). */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** Reverse icon → archetype map (events carry archetypes, stations only icons). */
const ARCHETYPE_OF_ICON: Record<string, string> = {};
for (const [id, def] of Object.entries(ARCHETYPE_BY_ID)) {
  if (def?.icon) ARCHETYPE_OF_ICON[def.icon] = id;
}

const APRON_BY_TIER: Record<1 | 2 | 3, string> = { 1: "#ffe8cc", 2: "#a5d8ff", 3: "#d0bfff" };
const PLAYER_APRON = "#ffd43b";

export class People {
  readonly sprites = new Map<number, Sprite>();
  private walkers: Walker[] = [];
  /** Sprites that left the queue this frame (for renege correlation). */
  private removedThisFrame: Sprite[] = [];
  /** Per-station serve generation — bumps when a new customer steps up. */
  private serveGen = new Map<number, number>();
  private prevServing = new Map<number, boolean>();
  /** Cached staff/served looks (rebuilt lazily, keyed by seed). */
  private lookCache = new Map<number, PeepLook>();

  constructor(private readonly reduceMotion: boolean) {}

  private cachedLook(seed: number, archetype?: string): PeepLook {
    let l = this.lookCache.get(seed);
    if (!l) {
      l = makeLook(seed, archetype);
      this.lookCache.set(seed, l);
      if (this.lookCache.size > 200) this.lookCache.clear();
    }
    return l;
  }

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
          look: makeLook(c.id, c.archetype),
          mood: c.mood,
          isRegular: c.archetype === "regular",
          born: now,
          phase: Math.random() * Math.PI * 2,
          walk: Math.random() * Math.PI * 2,
          stride: 0,
          facing: fromLeft ? 1 : -1,
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
          // joiner is handled by sync()). Thinned so busy days don't mob it.
          if (Math.random() > 0.6) break;
          const fromLeft = Math.random() < 0.5;
          this.walkers.push({
            x: fromLeft ? -20 : g.W + 20,
            y: g.laneY + (Math.random() - 0.5) * 20,
            vx: (fromLeft ? 1 : -1) * (0.024 + Math.random() * 0.022),
            look: makeLook((Math.random() * 1e9) | 0, e.archetype),
            mood: Math.random() < 0.4 ? "happy" : "ok",
            carryCup: false,
            alpha: 1,
            lane: "back",
            walk: Math.random() * Math.PI * 2,
            kind: "ambient",
            hopT: 1,
          });
          break;
        }
        case "sale": {
          // A happy customer hops away from the counter, lemonade in hand.
          this.walkers.push({
            x: g.cx + 30,
            y: g.cy + 30,
            vx: 0.04 + Math.random() * 0.03,
            look: makeLook((Math.random() * 1e9) | 0, e.archetype),
            mood: "happy",
            carryCup: true,
            alpha: 1,
            lane: "front",
            walk: 0,
            kind: "depart",
            hopT: this.reduceMotion ? 1 : 0,
          });
          break;
        }
        case "balk": {
          // Took one look at the line and stormed off.
          const tail = queueSlot(g, 5);
          this.walkers.push({
            x: Math.min(tail.x, g.W - 40),
            y: tail.y + 6,
            vx: 0.07 + Math.random() * 0.03,
            look: makeLook((Math.random() * 1e9) | 0, e.archetype),
            mood: "angry",
            carryCup: false,
            alpha: 1,
            lane: "front",
            walk: 0,
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
            look: s?.look ?? makeLook((Math.random() * 1e9) | 0, e.archetype),
            mood: "sad",
            carryCup: false,
            alpha: 1,
            lane: "front",
            walk: 0,
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
        look: s.look,
        mood: "ok",
        carryCup: false,
        alpha: 1,
        lane: "front",
        walk: s.walk,
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
      const dx = (target.x - s.x) * k;
      const dy = (target.y - s.y) * k;
      s.x += dx;
      s.y += dy;
      if (wp && Math.abs(s.x - wp.x) + Math.abs(s.y - wp.y) < 6) s.waypoints.shift();
      // movement drives the walk cycle; settle into a stand near the slot
      const moved = Math.abs(dx) + Math.abs(dy);
      const targetStride = Math.min(1, moved / 1.1);
      s.stride += (targetStride - s.stride) * Math.min(1, dt / 120);
      s.walk += moved * 0.42;
      if (Math.abs(dx) > 0.12) s.facing = dx > 0 ? 1 : -1;
      else if (s.stride < 0.2) s.facing = -1; // settled — face the stand
      s.phase += dt * (s.mood === "impatient" ? 0.014 : 0.006);
    }
    for (const w of this.walkers) {
      w.x += w.vx * dt;
      w.walk += Math.abs(w.vx) * dt * 0.42;
      w.hopT = Math.min(1, w.hopT + dt / 280);
      if (w.lane === "front") w.alpha = Math.max(0, w.alpha - dt * (w.kind === "trudge" ? 0.0006 : 0.0009));
    }
    this.walkers = this.walkers.filter((w) => w.x > -40 && w.x < W + 60 && w.alpha > 0.02);
  }

  drawQueue(ctx: CanvasRenderingContext2D, sunT: number, t: number): void {
    for (const s of this.sprites.values()) {
      // impatient peeps tap a foot in place; others shift weight gently
      const idle = s.stride < 0.25;
      const tapWalk = idle && s.mood === "impatient" && !this.reduceMotion ? s.phase * 1.4 : s.walk;
      const tapStride = idle && s.mood === "impatient" && !this.reduceMotion ? 0.22 : s.stride;
      const yFeet = s.y + 20;

      drawShadow(ctx, s.x, yFeet, 26, sunT, 0.11);
      drawPeep(
        ctx,
        s.x,
        yFeet,
        s.look,
        {
          walk: this.reduceMotion ? 0 : tapWalk,
          stride: this.reduceMotion ? 0 : tapStride,
          facing: s.facing,
          mood: s.mood,
        },
        this.reduceMotion ? 0 : t,
      );

      // a little thought bubble for impatient folks
      if (s.mood === "impatient") {
        const bx = s.x + 15;
        const by = yFeet - 44;
        ctx.fillStyle = "rgba(255,253,243,0.92)";
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = withAlpha(INK, 0.18);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx - 6, by + 8.5, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,253,243,0.92)";
        ctx.fill();
        drawEmoji(ctx, "⏳", bx, by + 0.5, 10);
      }
    }
  }

  drawWalkers(ctx: CanvasRenderingContext2D, lane: "back" | "front", sunT: number, t: number): void {
    for (const w of this.walkers) {
      if (w.lane !== lane) continue;
      // post-purchase hop: a quick eased bounce as they step away
      const hop = w.kind === "depart" && w.hopT < 1 ? Math.sin(w.hopT * Math.PI) * 9 : 0;
      const yFeet = w.y + 14;
      if (lane === "back" && w.alpha > 0.5) drawShadow(ctx, w.x, yFeet, 24, sunT, 0.07);
      drawPeep(
        ctx,
        w.x,
        yFeet,
        w.look,
        {
          walk: this.reduceMotion ? 0 : w.walk,
          stride: this.reduceMotion ? 0 : w.kind === "trudge" ? 0.55 : 1,
          facing: w.vx >= 0 ? 1 : -1,
          mood: w.mood,
          carryCup: w.carryCup,
          lift: hop,
        },
        this.reduceMotion ? 0 : t,
        w.alpha,
      );
      if (w.kind === "balk" && w.alpha > 0.4) {
        // storm-off dust puffs at the heels
        ctx.fillStyle = `rgba(160,150,130,${0.35 * w.alpha})`;
        for (let i = 0; i < 2; i++) {
          const px = w.x - (w.vx > 0 ? 1 : -1) * (12 + i * 7);
          ctx.beginPath();
          ctx.arc(px, yFeet - 2 - (i % 2) * 3, 2.6 - i * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  drawStations(
    ctx: CanvasRenderingContext2D,
    g: SceneGeom,
    snap: SimSnapshot,
    scene: SceneContext,
    sunT: number,
    t: number,
  ): void {
    const n = snap.stations.length;
    const slotW = g.w / Math.max(1, n);
    const brewer = scene.equip["brewer"] ?? 0;
    const autoServe = (scene.equip["dispenser"] ?? 0) >= 3;
    snap.stations.forEach((st, i) => {
      const x = g.left + slotW * i + slotW / 2;
      // track per-station serve generations so each window customer gets a face
      if (st.state === "serving" && !this.prevServing.get(st.id)) {
        this.serveGen.set(st.id, (this.serveGen.get(st.id) ?? 0) + 1);
      }
      this.prevServing.set(st.id, st.state === "serving");

      const staff = st.kind === "staff" ? scene.staffByStation[st.id - 1] : undefined;
      const seed = st.kind === "player" ? 7777 : hashStr(staff?.icon ?? "staff") + st.id * 131;
      const look = this.cachedLook(seed);
      const apron = st.kind === "player"
        ? { color: PLAYER_APRON }
        : { color: APRON_BY_TIER[staff?.tier ?? 1], star: staff?.tier === 3 };

      drawStaffPeep(ctx, x, g.cy - 6, look, apron, {
        action: st.state === "making" ? "make" : st.state === "serving" ? "serve" : "idle",
        t: this.reduceMotion ? 0 : t,
        facing: 1,
      });

      // progress dial floating beside the head
      if (st.state !== "idle") {
        const dx = x + 20;
        const dy = g.cy - 46;
        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(58,46,32,0.12)";
        ctx.arc(dx, dy, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle =
          st.state === "serving"
            ? autoServe ? "#9775fa" : "#4dabf7"
            : brewer >= 2 ? "#7048e8" : "#9775fa";
        ctx.arc(dx, dy, 9, -Math.PI / 2, -Math.PI / 2 + st.progress * Math.PI * 2);
        ctx.stroke();
      }

      // which drink is being brewed, in a thought bubble + the brewer's badge
      if (st.state === "making" && st.makeIcon) {
        const bx = x - 16;
        const by = g.cy - 56;
        ctx.fillStyle = "rgba(255,253,243,0.94)";
        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = withAlpha(INK, 0.16);
        ctx.lineWidth = 1;
        ctx.stroke();
        drawEmoji(ctx, st.makeIcon, bx, by + 0.5, 14);
        if (brewer >= 1) drawEmoji(ctx, brewer >= 2 ? "🌀" : "⚡", bx + 12, by + 8, 11);
      }
    });
  }

  /** A customer stepping up to the window for each station currently serving. */
  drawServed(ctx: CanvasRenderingContext2D, g: SceneGeom, snap: SimSnapshot, sunT: number, t: number): void {
    const n = snap.stations.length;
    const slotW = g.w / Math.max(1, n);
    snap.stations.forEach((st, i) => {
      if (st.state !== "serving" || !st.servingIcon) return;
      const x = g.left + slotW * i + slotW / 2 + 8;
      const gen = this.serveGen.get(st.id) ?? 0;
      const look = this.cachedLook(st.id * 977 + gen * 131 + hashStr(st.servingIcon), ARCHETYPE_OF_ICON[st.servingIcon]);
      const yFeet = g.cy + 50;
      drawShadow(ctx, x, yFeet, 24, sunT, 0.09);
      drawPeep(ctx, x, yFeet, look, { walk: 0, stride: 0, facing: 1, mood: "ok", back: true }, this.reduceMotion ? 0 : t);
    });
  }
}
