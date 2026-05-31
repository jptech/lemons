# Lemonade Lane — Design Notes & Roadmap

A living doc for the game's design, current mechanics, and future opportunities.
Keep this updated as systems change so we don't lose track.

---

## Architecture (where things live)

- `src/engine/` — pure, deterministic sim (no DOM/clock/`Math.random()`). Seeded
  PRNG threaded through `GameState.rngState`. Same seed + actions → identical run.
  - `tuning.ts` — every balance constant in one place.
  - `economy.ts` — demand, pricing, satisfaction, marketing, tips formulas.
  - `derive.ts` — aggregates equipment/staff into effective stats.
  - `dayLoop.ts` — `DaySim` (tick-based open period) + settlement.
- `src/data/` — static config (locations, equipment, staff, weather, archetypes,
  events, goals, achievements, products, marketing, brand). Mostly add-only.
- `src/store/` — reactive store + selectors (the engine↔UI membrane).
- `src/loop/gameLoop.ts` — fixed-timestep rAF driver (speed scales tick *count*).
- `src/ui/` — screens (menu, planning, simulation, results, analytics),
  components, hand-rolled SVG charts; the animated stand is a `<canvas>`.

Verify with: `bun run typecheck`, `bun test`, `bun run build`, `bun run balance`.

---

## Core gameplay loop

1. **Plan** — recipe & price (sliders), buy perishable stock (storage-capped),
   equipment, staff, marketing, location; read the noisy weather forecast & event.
2. **Open** — tick-based queue/service sim: customers (archetypes) arrive on a
   bimodal curve, queue, balk/renege, get served from a pitcher pool. Foot
   traffic, tips, reviews, pops shown live.
3. **Recap** — spoilage, costs, reputation, stats, charts. `cash < 0` with no
   credit ends the run (loans are a soft cushion).

Modes: **Campaign** (goal ladder, can continue endless) and **Sandbox**.

---

## Key systems (current state)

- **Demand** = baseTraffic × weather × day-of-week × reputation × marketing ×
  price-acceptance × event, plus a regulars term. Now also × a per-day **market
  mood** noise (uncertainty — see below).
- **Pricing** — logistic acceptance vs a hidden `priceTolerance` (location × rep ×
  weather × proven-quality). The exact tolerance is **not shown**; players do
  **price discovery** via review-driven pricing feedback.
- **Recipe** — parts of lemon/sugar/water/ice + price. Quality = distance from a
  hidden, weather-dependent ideal. Persistent **recipe feedback** (EMA) guides
  ingredient tweaks ("more lemon, less ice") with an Apply button.
- **Reputation** — global + location-sticky (EMA toward satisfaction, slow decay).
  Drives demand and price tolerance. **Regulars pool** = sticky baseline traffic
  grown by delight.
- **Equipment** — upgrade **lines** with stacking **levels**, gated by
  location/reputation/day prerequisites (see below).
- **Staff** — up to 3; each adds a service station; daily wages.
- **Weather** — Markov chain; noisy forecast vs actual; sets the ideal recipe.
- **Inventory/spoilage** — slot-based storage; ice melts overnight, lemons spoil
  in 4 days, sugar/cups never. Ice Maker regenerates ice during the day.
- **Events** — seeded daily deck (festival, heatwave, lemon shortage, …).
- **Loans** — credit line scaling with reputation; auto-borrow cushions a bad day.
- **Goals/achievements**, **analytics dashboard**, **save/load + import/export**.

---

## Uncertainty & price discovery (design intent)

The forecast is deliberately **imprecise** so the player must experiment:

- **Market mood**: each day's true demand is multiplied by a seeded noise factor.
  Its spread (σ) shrinks as **forecast confidence** rises.
- **Forecast confidence** = research equipment + days played + reputation. Higher
  confidence → narrower projected-sales range *and* lower real variance (your
  business becomes more predictable as you learn your customers).
- **Hidden price tolerance**: instead of a number, the player gets qualitative,
  saved **pricing feedback** from reviews ("a few found you pricey" / "you could
  charge a bit more"). Progression (research) sharpens this.

This keeps early game risky and exploratory; progression de-risks it.

---

## Equipment progression model

`EquipmentDef` has `line`, `level`, `effects` (TOTAL at that level), and optional
`unlock` prerequisites (`location` unlocked / `rep` / `day`). `derive()` applies
only the **highest owned level per line** (levels replace, lines stack). The shop
shows each line's next upgrade, its prereq, or "Maxed".

Lines: cooler (storage), insulation (ice retention), icemaker (ice regen),
dispenser (serve speed), pitchers (batch size), brewer (batch speed), comfort
(patience), signage (marketing floor), forecast (weather accuracy), **research**
(narrows demand/pricing uncertainty), **loyalty** (boosts regulars).

---

## Future opportunities (roadmap)

Tagged by effort. Pulled from the theme review; trim/expand as we go.

### Tuning
- Parameter sweeps via `scripts/balance.ts` across *strategies* to catch
  degenerate/dominant lines (price, recipe, ice maker vs buying). **[quick]**
- Difficulty modes (cash, rent, spoilage, forecast accuracy). **[medium]**
- Re-validate break-evens (location rent vs traffic, staff wage vs throughput).

### Layout / UI polish
- First-run **tutorial/onboarding** (biggest gap for casual players). **[bigger]**
- Settings panel (reduce-motion, sound, default speed, confirm-before-open).
- Optional **audio** (coin/pour/register + ambient), off by default.
- Recipe **presets** (name/save recipes; quick-swap by weather).
- Color-blind-safe chart palette (patterns, not just color); ARIA.

### Equipment (more)
- New archetypes to iterate on: **all-weather canopy** (reduce rainy penalty —
  `rainShelter` hook reserved), **auto-restock hopper**, **premium-ingredient
  station** (raise quality ceiling), **cup auto-dispenser**.
- Maintenance/wear + upkeep cost.
- Show owned equipment on the canvas stand.

### Location (more)
- Surface unlock **ROI** ("+160 traffic vs +$95 rent → break-even ~X cups").
- Location-flavored demand (beach weekends, stadium event days, downtown lunch).
- Returning-rep memory (don't fully reset when revisiting a built-up spot).
- Endgame: franchising / multiple simultaneous stands / new cities. **[bigger]**

### Marketing + reputation (long game) — highest leverage
- **Brand equity / awareness** as a slow stock marketing builds & that decays;
  daily spend draws on it. **[bigger]**
- Channel variety + saturation/cooldown (reward a media mix).
- **Multi-facet reputation** (Taste / Service / Value) feeding the overall.
- Word-of-mouth compounding from delighted days (organic growth past the cap).
- Negative shocks + recovery arcs (scandal, viral complaint, inspection fail).
- Reputation tiers/titles with perks (press, premium customers, price headroom).
- Persistent rivalry (the rival event becomes an ongoing competitor).

---

## Changelog (high level)

- v0.1 — full vertical slice → depth layer → polish (9 build steps).
- Fixes round — slider drag, ice maker, storage clarity, foot traffic/queue,
  forecast insight, directed recipe feedback.
- This round — equipment progression (levels/prereqs/new archetypes), price
  discovery + demand uncertainty, reputation-ceiling + difficulty tuning, layout
  cleanup.
- Feel round — slower 1x + 0.5× speed + calmer walkers; cohesive stand redesign
  (back wall, posts, attached canopy); spoilage clarity (planning "melts/spoils
  tonight" warnings + dynamic freshness, Day Recap "Leftovers & waste" with
  ice melted / lemons spoiled / unsold brewed cups / stock carried over).
- Stat-block consistency — single-line values (compact `moneyShort` ranges,
  `nowrap`) with subtext pinned to a shared baseline across equal-height grid
  rows; applies to the insight bar, recap stat cards, waste, and lifetime stats.
