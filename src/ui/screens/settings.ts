/** Settings modal — overlays the current screen. */
import { actions, type AppState } from "../../store/gameStore";
import type { DefaultSpeed } from "../../store/settings";
import { BRAND } from "../../data/brand";
import { h, type Child } from "../dom";

const SPEEDS: { value: DefaultSpeed; label: string }[] = [
  { value: 0.5, label: "🐢 ½×" },
  { value: 1, label: "▶ 1×" },
  { value: 2, label: "⏩ 2×" },
  { value: 4, label: "⏭ 4×" },
];

export function renderSettingsModal(s: AppState): HTMLElement {
  const set = s.settings;
  return h("div.modal-backdrop", { onClick: () => actions.closeSettings() }, [
    h("div.modal", { onClick: (e: Event) => e.stopPropagation() }, [
      h("div.modal__head", {}, [
        h("h2", {}, "⚙️ Settings"),
        h("button.modal__close", { onClick: () => actions.closeSettings(), "aria-label": "Close" }, "✕"),
      ]),

      settingRow(
        "Reduced motion",
        "Turn off transitions, confetti & particles",
        toggle(set.reducedMotion, () => actions.setSetting({ reducedMotion: !set.reducedMotion })),
      ),
      settingRow(
        "Weather effects",
        "Rain, snow & sunshine in the day view",
        toggle(set.weatherFx, () => actions.setSetting({ weatherFx: !set.weatherFx })),
      ),
      settingRow(
        "Default speed",
        "How fast the day starts playing",
        h(
          "div.seg",
          {},
          SPEEDS.map((sp) =>
            h(
              "button.seg__btn" + (set.defaultSpeed === sp.value ? ".seg__btn--on" : ""),
              { onClick: () => actions.setSetting({ defaultSpeed: sp.value }) },
              sp.label,
            ),
          ),
        ),
      ),

      h("p.modal__foot.muted.small", {}, `${BRAND.mascot} ${BRAND.name} · settings are saved on this device.`),
    ]),
  ]);
}

function settingRow(title: string, desc: string, control: Child): HTMLElement {
  return h("div.setting", {}, [
    h("div.setting__text", {}, [h("strong", {}, title), h("span.muted.small", {}, desc)]),
    h("div.setting__control", {}, control),
  ]);
}

function toggle(on: boolean, onClick: () => void): HTMLElement {
  return h(
    "button.switch" + (on ? ".switch--on" : ""),
    { onClick, role: "switch", "aria-checked": on ? "true" : "false" },
    [h("span.switch__knob", {})],
  );
}
