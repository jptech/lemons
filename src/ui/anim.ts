/** Small UI animation helpers (count-ups, enter effects). Honors reduced-motion. */
import { getSettings } from "../store/settings";
import { money, moneyShort, signed } from "./format";

type Fmt = "int" | "locale" | "money" | "moneyShort" | "signed";

function fmt(v: number, kind: Fmt): string {
  switch (kind) {
    case "money":
      return money(v);
    case "moneyShort":
      return moneyShort(v);
    case "signed":
      return signed(v);
    case "locale":
      return Math.round(v).toLocaleString();
    default:
      return String(Math.round(v));
  }
}

export function animateNumber(
  el: HTMLElement,
  to: number,
  kind: Fmt,
  durationMs = 650,
  delayMs = 0,
  onDone?: () => void,
): void {
  let start = 0;
  const tick = (now: number) => {
    if (!start) start = now;
    const elapsed = now - start - delayMs;
    if (elapsed < 0) {
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = fmt(to * eased, kind);
    if (t < 1) requestAnimationFrame(tick);
    else {
      el.textContent = fmt(to, kind);
      onDone?.();
    }
  };
  requestAnimationFrame(tick);
}

/**
 * Stagger matching children in with `card-enter`: each gets an increasing
 * animation-delay (capped at maxTotalMs). No-op under reduced motion.
 */
export function staggerChildren(
  rootEl: HTMLElement,
  selector: string,
  stepMs = 45,
  maxTotalMs = 420,
): void {
  if (getSettings().reducedMotion) return;
  rootEl.querySelectorAll<HTMLElement>(selector).forEach((el, i) => {
    el.style.animationDelay = `${Math.min(i * stepMs, maxTotalMs)}ms`;
    el.classList.add("enter-stagger");
  });
}

/**
 * One-shot CSS effect helper: re-adds `className` so its animation retriggers
 * even if it's already present (forces a reflow between remove/add).
 */
export function flashClass(el: HTMLElement, className: string, durationMs = 500): void {
  if (getSettings().reducedMotion) return;
  el.classList.remove(className);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), durationMs);
}

/**
 * Run one-shot enter effects inside a freshly-mounted screen element:
 * stagger cards/panels in and animate any `[data-countup]` numbers up from zero.
 */
export function runEnterEffects(rootEl: HTMLElement): void {
  if (getSettings().reducedMotion) return;
  staggerChildren(rootEl, ".panel, .statcard, .menucard");
  rootEl.querySelectorAll<HTMLElement>("[data-countup]").forEach((el) => {
    const to = Number(el.getAttribute("data-countup"));
    if (!Number.isFinite(to)) return;
    const kind = (el.getAttribute("data-countup-fmt") as Fmt) || "int";
    const delay = Number(el.getAttribute("data-countup-delay")) || 0;
    const punch = el.hasAttribute("data-punch");
    animateNumber(el, to, kind, 650, delay, punch ? () => flashClass(el, "value-punch", 600) : undefined);
  });
}
