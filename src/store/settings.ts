/**
 * App-level preferences (persist across games, separate from the save). Kept in
 * a tiny standalone module so non-reactive consumers (canvas renderer, confetti,
 * game loop) can read the current values synchronously via `getSettings()`,
 * while the UI mirrors them in the app store for reactive rendering.
 */
export type DefaultSpeed = 0.5 | 1 | 2 | 4;

export interface Settings {
  /** Disable transitions, confetti, count-ups, particles, bobbing, etc. */
  reducedMotion: boolean;
  /** Rain/snow/sun particle effects in the day view. */
  weatherFx: boolean;
  /** Speed the day starts at. */
  defaultSpeed: DefaultSpeed;
}

const KEY = "lemonadeLane.settings.v1";

function osReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

function defaults(): Settings {
  return { reducedMotion: osReducedMotion(), weatherFx: true, defaultSpeed: 1 };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaults();
  }
}

let live: Settings = loadSettings();

/** Synchronous read for non-reactive consumers. */
export function getSettings(): Settings {
  return live;
}

/** Update the live mirror + persist. The app store also holds a reactive copy. */
export function persistSettings(s: Settings): void {
  live = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — ignore */
  }
}
