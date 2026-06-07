# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Lemonade Lane** — a browser-based lemonade-stand tycoon game. Built with **Bun**
(runtime + bundler + test runner), vanilla TypeScript, and a hand-rolled DOM/SVG/canvas
UI. **Zero runtime dependencies.** No framework, no Vite/Webpack.

## Commands

```sh
bun install
bun run dev          # dev server with HMR → http://localhost:3000
bun run build        # bundle a fully static site into dist/
bun run preview      # serve the built dist/ (no HMR — use to verify cleanly)
bun test             # engine test suite (deterministic, DOM-free)
bun test test/economy.test.ts        # a single test file
bun test -t "price"  # tests whose name matches a pattern
bun run typecheck    # tsc --noEmit type gate
bun run balance      # headless difficulty-curve sanity check (not a test)
```

There is no linter. `bun run typecheck` is the type gate; `strict` is on with
`noUncheckedIndexedAccess`, so indexed access yields `T | undefined` (note the `!`
assertions in hot paths). Run `typecheck` + `test` before considering a change done.

## Architecture

The hard line in this codebase is **pure deterministic engine ↔ everything else**.

### `src/engine/` — the pure simulation (the heart of the game)
No DOM, no clock, no `Math.random()`. Time enters only via `dt`; randomness only via a
single seeded mulberry32 PRNG (`src/engine/rng.ts`) whose entire state is one 32-bit int
threaded through `GameState.rngState`. **Same seed + same action sequence → identical
results.** This is what makes saves just `{seed, state}` and the economy `bun test`-able.

- `index.ts` — the public engine API; the only surface the UI/store should import from.
- `types.ts` — all engine types. `GameState` is the serializable save payload.
- `setup.ts` (`newGame`), `reducers.ts` (pure `(state, …) → state` planning actions),
  `derive.ts` (memoizable read-only selectors over state), `economy.ts` (demand/price/
  quality math), `dayLoop.ts` (`DaySim` — the real-time queue-and-service sim for one day).
- `tuning.ts` — `TUNING`: every balance constant in one place. Tweak feel here, not logic.
  It also holds `SCHEMA_VERSION` — bump it when you change the `GameState` shape (drives
  save migration/invalidation).

Reducers are pure and return a **new** state (or the same reference for no-ops, which the
store uses to skip re-renders). Never mutate state in place.

### `src/data/` — static config (mostly add-only)
Locations, equipment, staff, weather, archetypes (customer types), products, marketing,
events, goals, research, achievements, brand. Adding content here is the common,
low-risk way to extend the game.

### `src/store/` — the reactive membrane
- `store.ts` — a ~50-line generic store: `getState`/`setState`/`subscribe`, batched
  notify once per microtask.
- `gameStore.ts` — the app singleton. Holds `GameState` + light UI state (current
  `screen`, `lastResult`, `toast`, `settings`). **All `GameState` mutations go through
  engine reducers here and nowhere else.** Autosaves (debounced) on game changes.

### `src/loop/gameLoop.ts` — fixed-timestep driver
`SimController` owns the live `DaySim` and advances it on `requestAnimationFrame`. Speed
(0/0.5/1/2/4 + skip) scales **how many** sim-minutes pass per real second, never the
minute size — so every speed produces the identical deterministic event sequence.

### `src/ui/` — hand-rolled view layer
`router.ts` subscribes to the store and re-renders the active screen (menu → planning →
simulation → results → analytics) by replacing DOM. Screens in `ui/screens/`, shared bits
in `ui/components.ts`/`dom.ts`/`format.ts`, charts are hand-drawn SVG (`ui/charts/`), the
animated stand is a `<canvas>` (`ui/screens/standView.ts`). CSS lives in `src/styles/`.

### Data flow
`UI event → actions.* (gameStore) → engine reducer → setState → router re-render`.
A day plays out as: **plan** (reducers) → **open** (`SimController` ticks `DaySim`) →
**recap** (`commitDay` writes next-day state + result). `simulateDay(state)` runs a whole
day synchronously (used by tests and `balance.ts`).

## Conventions & gotchas

- **Determinism is sacred.** Inside `src/engine/`, never call `Date.now()`, `Math.random()`,
  or touch the DOM. UI-side randomness (e.g. `randomSeed()`) is fine — only the seed crosses
  the boundary. If you add randomness in the engine, draw it from the threaded `Rng`.
- **Dev-loop HMR noise:** Bun's `--hot` server emits transient "Failed to load bundled
  module" / "Cannot read properties of null" errors in the browser console during rapid
  edits (mid-rebuild module swaps). These are **not real bugs** — a fresh load renders
  fine. To verify cleanly, use the **dist preview** (`bun run preview`, launch config
  `lemonade-dist`).
- **Preview screenshots can lag a frame** behind the live DOM — query the DOM via eval to
  confirm actual state when verifying.
- `window.__lemon = { store, actions, simulateDay }` is exposed (`src/main.ts`) for driving
  the game from the browser console.
- Tests live in `test/`, import from `src/engine`, and must stay DOM-free and fast.
- `NOTES.md` and `DEPTH_ROADMAP.md` track design intent and planned depth — consult them
  for the "why" behind balance and feature decisions.
