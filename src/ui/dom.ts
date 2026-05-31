/**
 * Tiny hyperscript DOM helper — no vdom, no deps. Build elements declaratively:
 *
 *   h("button.btn.btn--sky", { onClick: () => ... }, "Buy")
 *   h("div", { class: "row" }, [h("span", {}, "A"), h("span", {}, "B")])
 *
 * The tag string supports a `tag.class.class` shorthand. Props handle events
 * (`onClick`, `onInput`, ...), `style` (object or string), `dataset`, `class`,
 * boolean/null attributes, and form properties (`value`, `checked`).
 */
export type Child =
  | Node
  | string
  | number
  | null
  | undefined
  | false
  | Child[];

export interface Props {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string | number>;
  /** Direct DOM property assignments (e.g. value, checked). */
  [key: string]: unknown;
}

export function h(
  tagSpec: string,
  props: Props = {},
  ...children: Child[]
): HTMLElement {
  const [tag, ...classes] = tagSpec.split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.classList.add(...classes);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;

    if (key === "class") {
      el.className = el.className
        ? `${el.className} ${value as string}`
        : (value as string);
    } else if (key === "style") {
      if (typeof value === "string") el.setAttribute("style", value);
      else Object.assign(el.style, value);
    } else if (key === "dataset") {
      for (const [dk, dv] of Object.entries(value as Record<string, unknown>)) {
        el.dataset[dk] = String(dv);
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(
        key.slice(2).toLowerCase(),
        value as EventListener,
      );
    } else if (key in el && key !== "list") {
      // Prefer the DOM property (value, checked, disabled, ...).
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el: HTMLElement, children: Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

/** Replace an element's contents with new children. */
export function mount(parent: HTMLElement, ...children: Child[]): HTMLElement {
  parent.replaceChildren();
  appendChildren(parent, children);
  return parent;
}

/** Get a required mount point or throw. */
export function root(id = "app"): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Mount point #${id} not found`);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG-namespaced element helper (attributes set verbatim). */
export function svg(
  tag: string,
  attrs: Record<string, string | number> = {},
  ...children: (SVGElement | string)[]
): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) {
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}
