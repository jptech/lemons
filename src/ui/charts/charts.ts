/** Hand-rolled SVG charts — clean, tooltip-driven, ≤2 series, brand-colored. */
import { svg } from "../dom";
import {
  chartCard,
  DEFAULT_MARGIN,
  niceTicks,
  pathFrom,
  scaleLinear,
  Tooltip,
} from "./chartUtils";

const C = {
  sun: "#ffd43b",
  sky: "#4dabf7",
  mint: "#69db7c",
  coral: "#ff8787",
  grape: "#9775fa",
  line: "#efe4c4",
  ink: "#6b5d4a",
};

export interface LinePoint {
  x: number;
  y: number;
  label: string; // tooltip html
}

export function lineChart(
  data: LinePoint[],
  opts: { title: string; color?: string; yFormat?: (n: number) => string; width?: number; height?: number },
): HTMLElement {
  const W = opts.width ?? 460;
  const H = opts.height ?? 200;
  const m = DEFAULT_MARGIN;
  const color = opts.color ?? C.sky;
  const fmt = opts.yFormat ?? ((n) => String(Math.round(n)));

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart__svg", preserveAspectRatio: "none" });
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(1, ...ys);
  const sx = scaleLinear([xMin, xMax === xMin ? xMin + 1 : xMax], [m.l, W - m.r]);
  const sy = scaleLinear([yMin, yMax], [H - m.b, m.t]);

  // gridlines + y ticks
  for (const t of niceTicks(yMin, yMax, 4)) {
    const y = sy(t);
    root.appendChild(svg("line", { x1: m.l, y1: y, x2: W - m.r, y2: y, stroke: C.line, "stroke-width": 1 }));
    root.appendChild(svg("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "chart__axis" }, fmt(t)));
  }

  const pts: Array<[number, number]> = data.map((d) => [sx(d.x), sy(d.y)]);

  // soft area fill
  if (pts.length > 1) {
    const area = `${pathFrom(pts)} L${pts[pts.length - 1]![0].toFixed(1)},${sy(yMin)} L${pts[0]![0].toFixed(1)},${sy(yMin)} Z`;
    root.appendChild(svg("path", { d: area, fill: color, opacity: "0.12" }));
    root.appendChild(svg("path", { d: pathFrom(pts), fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }

  const { card, body } = chartCard(opts.title, root);
  const tip = new Tooltip(body);
  data.forEach((d, i) => {
    const [cx, cy] = pts[i]!;
    const dot = svg("circle", { cx, cy, r: 4, fill: "#fff", stroke: color, "stroke-width": 2.5, class: "chart__dot" });
    const hit = svg("circle", { cx, cy, r: 12, fill: "transparent", class: "chart__hit" });
    hit.addEventListener("mouseenter", () => tip.show((cx / W) * body.clientWidth, (cy / H) * body.clientHeight - 8, d.label));
    hit.addEventListener("mouseleave", () => tip.hide());
    root.appendChild(dot);
    root.appendChild(hit);
  });
  return card;
}

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
  tip: string;
}

export function barChart(
  data: BarDatum[],
  opts: { title: string; yFormat?: (n: number) => string; width?: number; height?: number },
): HTMLElement {
  const W = opts.width ?? 460;
  const H = opts.height ?? 200;
  const m = DEFAULT_MARGIN;
  const fmt = opts.yFormat ?? ((n) => String(Math.round(n)));
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart__svg", preserveAspectRatio: "none" });

  const yMax = Math.max(1, ...data.map((d) => d.value));
  const sy = scaleLinear([0, yMax], [H - m.b, m.t]);
  for (const t of niceTicks(0, yMax, 4)) {
    const y = sy(t);
    root.appendChild(svg("line", { x1: m.l, y1: y, x2: W - m.r, y2: y, stroke: C.line, "stroke-width": 1 }));
    root.appendChild(svg("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "chart__axis" }, fmt(t)));
  }

  const innerW = W - m.l - m.r;
  const bw = (innerW / data.length) * 0.62;
  const { card, body } = chartCard(opts.title, root);
  const tip = new Tooltip(body);

  data.forEach((d, i) => {
    const cx = m.l + (innerW / data.length) * (i + 0.5);
    const y = sy(d.value);
    const hgt = H - m.b - y;
    const rect = svg("rect", {
      x: cx - bw / 2,
      y,
      width: bw,
      height: Math.max(0, hgt),
      rx: 5,
      fill: d.color ?? C.sun,
      class: "chart__bar",
    });
    rect.addEventListener("mouseenter", () => tip.show((cx / W) * body.clientWidth, (y / H) * body.clientHeight - 8, d.tip));
    rect.addEventListener("mouseleave", () => tip.hide());
    root.appendChild(rect);
    root.appendChild(svg("text", { x: cx, y: H - m.b + 16, "text-anchor": "middle", class: "chart__axis" }, d.label));
  });
  return card;
}

export interface DonutSeg {
  label: string;
  value: number;
  color: string;
}

export function donut(
  segments: DonutSeg[],
  opts: { title: string; centerLabel?: string; centerValue?: string; size?: number },
): HTMLElement {
  const size = opts.size ?? 200;
  const r = size / 2 - 8;
  const inner = r * 0.6;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const root = svg("svg", { viewBox: `0 0 ${size} ${size}`, class: "chart__svg chart__donut" });

  let a0 = -Math.PI / 2;
  const { card, body } = chartCard(opts.title, root);
  const tip = new Tooltip(body);

  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const a1 = a0 + (seg.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (radius: number, a: number) => `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`;
    const d = `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
    const path = svg("path", { d, fill: seg.color, class: "chart__seg" });
    const mid = (a0 + a1) / 2;
    path.addEventListener("mouseenter", () =>
      tip.show(
        ((cx + (r * 0.8) * Math.cos(mid)) / size) * body.clientWidth,
        ((cy + (r * 0.8) * Math.sin(mid)) / size) * body.clientHeight,
        `${seg.label}: <strong>${Math.round((seg.value / total) * 100)}%</strong>`,
      ),
    );
    path.addEventListener("mouseleave", () => tip.hide());
    root.appendChild(path);
    a0 = a1;
  }

  if (opts.centerValue) {
    root.appendChild(svg("text", { x: cx, y: cy - 2, "text-anchor": "middle", class: "chart__center-v" }, opts.centerValue));
  }
  if (opts.centerLabel) {
    root.appendChild(svg("text", { x: cx, y: cy + 16, "text-anchor": "middle", class: "chart__center-l" }, opts.centerLabel));
  }
  return card;
}

/** Tiny inline sparkline (no axes) for stat cards. */
export function sparkline(values: number[], opts: { color?: string; width?: number; height?: number } = {}): SVGElement {
  const W = opts.width ?? 72;
  const H = opts.height ?? 24;
  const color = opts.color ?? C.sky;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "sparkline", width: W, height: H });
  if (values.length === 0) return root;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sx = scaleLinear([0, Math.max(1, values.length - 1)], [2, W - 2]);
  const sy = scaleLinear([min, max === min ? min + 1 : max], [H - 3, 3]);
  const pts: Array<[number, number]> = values.map((v, i) => [sx(i), sy(v)]);
  root.appendChild(svg("path", { d: pathFrom(pts), fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  const last = pts[pts.length - 1]!;
  root.appendChild(svg("circle", { cx: last[0], cy: last[1], r: 2.5, fill: color }));
  return root;
}

export const CHART_COLORS = C;
