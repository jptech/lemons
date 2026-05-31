/** Small UI animation helpers (count-ups, enter effects). Honors reduced-motion. */
import { getSettings } from "../store/settings";
import { money, moneyShort, signed } from "./format";

type Fmt = "int" | "money" | "moneyShort" | "signed";

function fmt(v: number, kind: Fmt): string {
  switch (kind) {
    case "money":
      return money(v);
    case "moneyShort":
      return moneyShort(v);
    case "signed":
      return signed(v);
    default:
      return String(Math.round(v));
  }
}

function animateNumber(el: HTMLElement, to: number, kind: Fmt, durationMs = 650): void {
  let start = 0;
  const tick = (now: number) => {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.textContent = fmt(to * eased, kind);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(to, kind);
  };
  requestAnimationFrame(tick);
}

/**
 * Run one-shot enter effects inside a freshly-mounted screen element:
 * animate any `[data-countup]` numbers up from zero.
 */
export function runEnterEffects(rootEl: HTMLElement): void {
  if (getSettings().reducedMotion) return;
  rootEl.querySelectorAll<HTMLElement>("[data-countup]").forEach((el) => {
    const to = Number(el.getAttribute("data-countup"));
    if (!Number.isFinite(to)) return;
    const kind = (el.getAttribute("data-countup-fmt") as Fmt) || "int";
    animateNumber(el, to, kind);
  });
}
