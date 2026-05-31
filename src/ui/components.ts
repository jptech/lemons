/** Small reusable UI building blocks built on the `h()` helper. */
import { h, type Child } from "./dom";
import { sparkline } from "./charts/charts";

export function panel(icon: string, title: string, ...children: Child[]): HTMLElement {
  return h("section.panel", {}, [
    h("h2.panel__title", {}, [h("span", {}, icon), title]),
    ...children,
  ]);
}

export function button(
  label: Child,
  onClick: () => void,
  opts: { variant?: "sun" | "sky" | "mint" | "ghost"; size?: "sm" | "lg"; disabled?: boolean } = {},
): HTMLElement {
  const cls = ["btn"];
  if (opts.variant && opts.variant !== "sun") cls.push(`btn--${opts.variant}`);
  if (opts.size) cls.push(`btn--${opts.size}`);
  return h(
    "button." + cls.join("."),
    { onClick, disabled: opts.disabled ?? false },
    label,
  );
}

export function pill(...children: Child[]): HTMLElement {
  return h("span.pill", {}, children);
}

/** A labelled progress/meter bar. `fraction` 0..1; optional accent CSS var. */
export function bar(fraction: number, accent = "var(--c-sun)"): HTMLElement {
  const f = Math.max(0, Math.min(1, fraction));
  return h("div.meter", {}, [
    h("div.meter__fill", { style: { width: `${f * 100}%`, background: accent } }),
  ]);
}

export interface SliderOpts {
  label: string;
  icon?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  /** Committed on release (the 'change' event) — safe to trigger a re-render. */
  onInput: (v: number) => void;
  /** Optional live callback during drag (no store write / re-render). */
  onLive?: (v: number) => void;
  format?: (v: number) => string;
}

/**
 * A labelled range slider. The committed value (which re-renders the screen) is
 * only pushed on the 'change' event (drag release / click / key), while the
 * value label updates live on 'input'. This keeps the input element stable
 * during a drag — re-rendering mid-drag would replace the node and the drag
 * would "stick" after one notch.
 */
export function slider(o: SliderOpts): HTMLElement {
  const fmt = o.format ?? ((v: number) => String(v));
  const valueEl = h("span.slider__value.num", {}, fmt(o.value));
  const input = h("input.slider__input", {
    type: "range",
    min: o.min,
    max: o.max,
    step: o.step ?? 1,
    value: o.value,
    onInput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      valueEl.textContent = fmt(v);
      o.onLive?.(v);
    },
    onChange: (e: Event) => o.onInput(Number((e.target as HTMLInputElement).value)),
  });
  return h("label.slider", {}, [
    h("div.slider__top", {}, [
      h("span.slider__label", {}, [o.icon ? `${o.icon} ` : "", o.label]),
      valueEl,
    ]),
    input,
  ]);
}

/** A −/value/+ stepper row. */
export function stepper(
  label: Child,
  value: Child,
  onMinus: () => void,
  onPlus: () => void,
  extra?: Child,
): HTMLElement {
  return h("div.stepper", {}, [
    h("div.stepper__label", {}, label),
    h("div.stepper__controls", {}, [
      h("button.step", { onClick: onMinus }, "−"),
      h("span.stepper__value.num", {}, value),
      h("button.step", { onClick: onPlus }, "+"),
      extra,
    ]),
  ]);
}

export function statBlock(label: string, value: Child, sub?: Child): HTMLElement {
  return h("div.stat", {}, [
    h("div.stat__label", {}, label),
    h("div.stat__value.num", {}, value),
    sub ? h("div.stat__sub", {}, sub) : null,
  ]);
}

export interface StatCardOpts {
  icon?: string;
  label: string;
  value: Child;
  delta?: number;
  deltaText?: string;
  /** Whether an increase is a good thing (drives the colour). Default true. */
  upIsGood?: boolean;
  spark?: number[];
  sparkColor?: string;
  sub?: Child;
}

/** A headline stat: big number + delta-vs-yesterday + inline sparkline. */
export function statCard(o: StatCardOpts): HTMLElement {
  const upGood = o.upIsGood ?? true;
  let deltaEl: Child = null;
  if (o.delta !== undefined && o.delta !== 0) {
    const up = o.delta > 0;
    const good = up === upGood;
    deltaEl = h("span.statcard__delta", { class: good ? "pos" : "neg" }, `${up ? "▲" : "▼"} ${o.deltaText ?? Math.abs(o.delta)}`);
  }
  return h("div.statcard", {}, [
    h("div.statcard__top", {}, [
      h("span.statcard__label", {}, [o.icon ? `${o.icon} ` : "", o.label]),
      o.spark && o.spark.length > 1 ? (sparkline(o.spark, { color: o.sparkColor }) as unknown as Child) : null,
    ]),
    h("div.statcard__value.num", {}, o.value),
    h("div.statcard__foot", {}, [deltaEl, o.sub ? h("span.muted", {}, o.sub) : null]),
  ]);
}
