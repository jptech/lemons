/** Shared helpers for the hand-rolled SVG charts. */
import { h } from "../dom";

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function scaleLinear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((v: number) => r0 + ((v - d0) / span) * (r1 - r0)) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** "Nice" round tick values spanning [min,max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}

export function pathFrom(points: Array<[number, number]>): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
}

export interface Margin {
  t: number;
  r: number;
  b: number;
  l: number;
}
export const DEFAULT_MARGIN: Margin = { t: 14, r: 14, b: 26, l: 40 };

/** A rounded tooltip bubble managed per-chart container. */
export class Tooltip {
  private readonly el: HTMLElement;
  constructor(private readonly host: HTMLElement) {
    this.el = h("div.chart-tip", { style: { opacity: "0" } });
    host.appendChild(this.el);
  }
  show(x: number, y: number, html: string) {
    this.el.innerHTML = html;
    this.el.style.opacity = "1";
    const w = this.host.clientWidth;
    // keep the bubble inside the chart
    this.el.style.left = `${Math.max(4, Math.min(w - 4, x))}px`;
    this.el.style.top = `${y}px`;
  }
  hide() {
    this.el.style.opacity = "0";
  }
}

/** Wrap an SVG element with an optional title in a chart card. */
export function chartCard(title: string, svgEl: SVGElement): { card: HTMLElement; body: HTMLElement } {
  const body = h("div.chart__body", {}, svgEl as unknown as HTMLElement);
  const card = h("div.chart", {}, [h("div.chart__title", {}, title), body]);
  return { card, body };
}
