/**
 * Real-time day driver. Owns the live DaySim and advances it on a fixed
 * timestep via requestAnimationFrame. Speed scales how MANY sim-minutes pass
 * per real second — never the minute size — so 1×/2×/4× and skip all produce
 * the identical (deterministic) event sequence.
 */
import { createDay, TUNING, type DaySim, type GameState, type SimEvent, type SimSnapshot } from "../engine";

export type Speed = 0 | 0.5 | 1 | 2 | 4;

export interface LoopCallbacks {
  onFrame: (snapshot: SimSnapshot, events: SimEvent[]) => void;
  onDone: (sim: DaySim) => void;
}

export class SimController {
  private readonly sim: DaySim;
  private readonly cb: LoopCallbacks;
  private speed: Speed = 1;
  private acc = 0; // accumulated sim-minutes
  private last = 0;
  private raf = 0;
  private running = false;
  private finished = false;

  constructor(game: GameState, cb: LoopCallbacks) {
    this.sim = createDay(game);
    this.cb = cb;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    if (this.last === 0) this.last = now;
    const dtMs = now - this.last;
    this.last = now;

    let events: SimEvent[] = [];
    if (this.speed > 0 && !this.sim.isOver) {
      this.acc += (dtMs / TUNING.MS_PER_SIM_MINUTE) * this.speed;
      // Cap catch-up so a long stall (tab hidden) can't freeze the loop.
      let budget = 240;
      while (this.acc >= 1 && !this.sim.isOver && budget-- > 0) {
        events = events.concat(this.sim.tick(1));
        this.acc -= 1;
      }
    }

    this.cb.onFrame(this.sim.snapshot(), events);

    if (this.sim.isOver) return this.finish();
    this.raf = requestAnimationFrame(this.frame);
  };

  setSpeed(speed: Speed) {
    this.speed = speed;
  }
  getSpeed(): Speed {
    return this.speed;
  }
  isPaused(): boolean {
    return this.speed === 0;
  }

  /** Run instantly to the end of the day. */
  skip() {
    if (this.finished) return;
    const events = this.sim.runToEnd();
    this.cb.onFrame(this.sim.snapshot(), events);
    this.finish();
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.cb.onDone(this.sim);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
