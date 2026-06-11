/**
 * Canvas renderer for the live stand. Pure view — it consumes SimSnapshots and
 * SimEvents and paints a cheerful scene (location backdrop, sun arc, evolving
 * booth, queue with moods, stations with progress, floating pops, weather).
 * No game logic lives here; all randomness is cosmetic.
 */
import type { SimEvent, SimSnapshot } from "../../../engine";
import { clamp01 } from "../../tween";
import { Backdrop } from "./backdrop";
import { sceneGeom, type SceneGeom } from "./draw";
import { Fx } from "./fx";
import { People } from "./people";
import {
  DEFAULT_SIGN,
  drawCanopy,
  drawCounter,
  drawEquipment,
  drawStandBack,
  drawStandShadow,
  type SignState,
} from "./structure";
import type { SceneContext } from "./sceneContext";

/** The hanging sign's little ceremony at open/close. */
type SignPhase = "idle" | "flipToOpen" | "holdOpen" | "flipToIdle" | "closed";

const FLIP_MS = 260;
const HOLD_OPEN_MS = 1200;

export class StandView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scene: SceneContext;
  private readonly backdrop = new Backdrop();
  private readonly people: People;
  private readonly fx: Fx;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private last = 0;
  private dayProgress = 0;
  private animT = 0; // seconds, for prop pulses (frozen under reduced motion)
  private readonly reduceMotion: boolean;
  private readonly weatherFx: boolean;
  private signPhase: SignPhase = "idle";
  private signAge = 0;
  private closingT = 0; // 0..1 during the end-of-day beat

  constructor(
    canvas: HTMLCanvasElement,
    scene: SceneContext,
    opts: { reducedMotion: boolean; weatherFx: boolean } = { reducedMotion: false, weatherFx: true },
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.scene = scene;
    this.reduceMotion = opts.reducedMotion;
    this.weatherFx = opts.weatherFx && !opts.reducedMotion;
    this.people = new People(opts.reducedMotion);
    this.fx = new Fx(opts.reducedMotion, this.weatherFx);
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

  render(snap: SimSnapshot, events: SimEvent[], now: number) {
    if (this.last === 0) this.last = now;
    const dt = Math.min(64, now - this.last);
    this.last = now;
    if (!this.reduceMotion) this.animT += dt / 1000;
    this.dayProgress = snap.minute / Math.max(1, snap.openMinutes);

    const g = sceneGeom(this.W, this.H);
    this.people.sync(snap, g, now);
    this.people.handleEvents(events, g);
    this.fx.spawn(events, g, snap.minute);
    for (const e of events) if (e.type === "open") this.startSignFlip();
    this.people.step(dt, this.W);
    this.fx.step(dt);
    this.stepSign(dt);

    this.paint(g, snap, dt);
  }

  /**
   * The brief dusk beat after the last minute: queue disperses, the sign flips
   * to CLOSED, and a warm scrim rises. Driven by simulation.ts after onDone.
   */
  renderClosing(now: number) {
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const g = sceneGeom(this.W, this.H);
    if (this.signPhase !== "closed") {
      this.signPhase = "closed";
      this.signAge = 0;
      this.people.disperseQueue(g);
    }
    this.signAge += dt;
    this.closingT = Math.min(1, this.closingT + dt / 900);
    this.people.step(dt, this.W);
    this.fx.step(dt);
    this.paint(g, null, dt);

    // deepening dusk + a soft cream scrim
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(120,90,140,${0.15 * this.closingT})`;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = `rgba(255,249,219,${0.25 * this.closingT})`;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  private paint(g: SceneGeom, snap: SimSnapshot | null, dt: number) {
    const ctx = this.ctx;
    const sunT = this.dayProgress;
    const cond = this.scene.weather.condition;
    ctx.clearRect(0, 0, this.W, this.H);

    this.backdrop.draw(ctx, g, this.scene, this.dayProgress, this.dpr, this.weatherFx);
    this.fx.drawClouds(ctx, g, dt, cond);
    this.fx.drawShimmer(ctx, g, dt, cond);
    drawStandShadow(ctx, g, sunT);
    drawStandBack(ctx, g);
    drawEquipment(ctx, g, this.scene, this.animT, sunT);
    if (snap) this.people.drawStations(ctx, g, snap, this.scene, sunT);
    if (snap) drawCounter(ctx, g, snap, this.scene);
    if (snap) this.people.drawServed(ctx, g, snap);
    const sway = this.weatherFx ? Math.sin(this.animT * 0.9) * (cond === "rainy" ? 0.05 : 0.025) : 0;
    drawCanopy(ctx, g, this.scene, this.signState(), sway, this.animT);
    this.people.drawQueue(ctx, sunT);
    this.people.drawWalkers(ctx, "back", sunT);
    this.people.drawWalkers(ctx, "front", sunT);
    this.fx.drawPops(ctx);
    this.fx.drawOverlays(ctx, g);
    this.fx.drawWeather(ctx, g, dt, this.scene.weather.condition);
  }

  // --- hanging-sign ceremony ---------------------------------------------------

  private startSignFlip() {
    if (this.reduceMotion) {
      this.signPhase = "holdOpen";
      this.signAge = 0;
      return;
    }
    this.signPhase = "flipToOpen";
    this.signAge = 0;
  }

  private stepSign(dt: number) {
    if (this.signPhase === "idle" || this.signPhase === "closed") return;
    this.signAge += dt;
    if (this.signPhase === "flipToOpen" && this.signAge >= FLIP_MS * 2) {
      this.signPhase = "holdOpen";
      this.signAge = 0;
    } else if (this.signPhase === "holdOpen" && this.signAge >= HOLD_OPEN_MS) {
      this.signPhase = this.reduceMotion ? "idle" : "flipToIdle";
      this.signAge = 0;
    } else if (this.signPhase === "flipToIdle" && this.signAge >= FLIP_MS * 2) {
      this.signPhase = "idle";
      this.signAge = 0;
    }
  }

  /** scaleY runs 1 → 0 → 1 across a flip; the text swaps at the midpoint. */
  private signState(): SignState {
    const t = clamp01(this.signAge / (FLIP_MS * 2));
    const scaleY = Math.abs(1 - 2 * t);
    switch (this.signPhase) {
      case "flipToOpen":
        return t < 0.5 ? { ...DEFAULT_SIGN, scaleY } : { text: "OPEN!", color: "#2f9e44", scaleY };
      case "holdOpen":
        return { text: "OPEN!", color: "#2f9e44", scaleY: 1 };
      case "flipToIdle":
        return t < 0.5 ? { text: "OPEN!", color: "#2f9e44", scaleY } : { ...DEFAULT_SIGN, scaleY };
      case "closed":
        return { text: "CLOSED", color: "#e03131", scaleY: 1 };
      default:
        return DEFAULT_SIGN;
    }
  }
}

export { buildSceneContext, type SceneContext } from "./sceneContext";
