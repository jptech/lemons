/**
 * Tiny easing/interpolation helpers shared by canvas effects and rAF-driven
 * chart entrances. Deliberately not a manager class — callers own arrays of
 * `Tween` structs and step them with `tweenValue`.
 */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type Ease = (t: number) => number;

export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInQuad: Ease = (t) => t * t;
export const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Sample a parabolic arc from (x0,y0) to (x1,y1) whose apex sits `height` px
 * above the straight line between them. Used for cup tosses and coin pops.
 */
export function arcPoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  height: number,
  t: number,
): { x: number; y: number } {
  const tt = clamp01(t);
  return {
    x: lerp(x0, x1, tt),
    y: lerp(y0, y1, tt) - height * 4 * tt * (1 - tt),
  };
}

/** A one-shot value animation. Step with `tweenValue(tw, dt)`; done when age >= dur. */
export interface Tween {
  age: number; // ms elapsed
  dur: number; // ms total
  from: number;
  to: number;
  ease: Ease;
}

/** Advance the tween by `dt` ms and return its current value. */
export function tweenValue(tw: Tween, dt: number): number {
  tw.age = Math.min(tw.dur, tw.age + dt);
  return lerp(tw.from, tw.to, tw.ease(clamp01(tw.age / tw.dur)));
}

export function tweenDone(tw: Tween): boolean {
  return tw.age >= tw.dur;
}
