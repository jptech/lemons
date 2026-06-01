/** Small formatting helpers shared across the UI. */

export function money(n: number): string {
  const neg = n < 0;
  const v = Math.abs(n);
  const s = v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);
  return `${neg ? "-" : ""}$${s}`;
}

/** Whole-dollar amounts (equipment, wages, rent, marketing) — never shows cents,
 *  so $80 and $260 read consistently (vs money()'s "$80.00" / "$260"). */
export function moneyWhole(n: number): string {
  const neg = n < 0;
  return `${neg ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

export function moneyShort(n: number): string {
  const neg = n < 0;
  const v = Math.abs(n);
  let s: string;
  if (v >= 1000) s = `${(v / 1000).toFixed(1)}k`;
  else s = Math.round(v).toString();
  return `${neg ? "-" : ""}$${s}`;
}

export function signed(n: number): string {
  return (n >= 0 ? "+" : "") + money(n);
}

/** A 0..5 star value as filled/empty star glyphs plus the number. */
export function stars(value: number): string {
  const full = Math.round(value);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function clock(minute: number): string {
  // Business day starts at 9:00 AM.
  const total = 9 * 60 + minute;
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
