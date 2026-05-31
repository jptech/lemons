# 🍋 Lemonade Lane

A cheerful, casual-but-deep lemonade-stand tycoon game for the browser. Run your
stand day by day: dial in a recipe and price, stock perishable inventory, buy
equipment, hire staff, market yourself, and react to the weather — while a
real-time queue-and-service simulation plays out each business day. Earn
reputation, unlock higher-traffic locations, and chase the campaign goals (or
just vibe in endless sandbox).

Built with **[Bun](https://bun.sh)** — no framework, zero runtime dependencies.

## Quick start

```sh
bun install
bun run dev        # dev server with hot reload → http://localhost:3000
```

## Scripts

| Command            | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `bun run dev`      | Dev server (Bun's native HTML bundler + HMR)            |
| `bun run build`    | Bundle a fully static site into `dist/`                 |
| `bun run preview`  | Serve the built `dist/` folder                          |
| `bun test`         | Run the engine test suite (deterministic, DOM-free)     |
| `bun run typecheck`| `tsc --noEmit` type gate                                |
| `bun run balance`  | Headless balance check — plays seeded days, prints curve |

## How it's built

The codebase is split into a **pure, deterministic simulation engine** and the
UI, joined by a tiny reactive store:

- `src/engine/` — pure TypeScript sim. No DOM, no clock, no `Math.random()`:
  time enters via `dt`, randomness via a single seeded PRNG threaded through
  state. Same seed + same actions → identical results. This is what makes the
  game save/loadable from just `{seed, state}` and unit-testable with `bun test`.
- `src/data/` — static config (locations, equipment, staff, weather, archetypes,
  events, goals, achievements). Mostly add-only data.
- `src/store/` — the reactive membrane between engine and UI.
- `src/loop/` — fixed-timestep `requestAnimationFrame` driver. Speed (1×/2×/4×/
  skip) scales how many sim-minutes pass per frame, never the minute size, so
  every speed produces the identical event sequence.
- `src/ui/` — screens (menu, planning, simulation, results, analytics),
  components, and hand-rolled SVG charts. The animated stand is a `<canvas>`.

## The day loop

1. **Plan** — set recipe & price, buy stock (capped by storage; ice melts
   overnight, lemons spoil in a few days), buy equipment, hire staff, market,
   maybe move locations. The weather **forecast** is a noisy hint.
2. **Open** — customers (kids, tourists, regulars, …) arrive on a bimodal daily
   curve, queue, and either get served from your pitcher pool or leave if the
   line is too long. Watch cash, tips, and reviews roll in live.
3. **Recap** — spoilage, costs, reputation, and stats settle. Charts show how
   you did. Running cash below $0 with no credit left ends the run.
