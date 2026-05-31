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
- **Menu & recipes** — up to **2 active products** (`menu`), each with its own
  `recipe`, price, quality EMA, and recipe/price feedback (`products` map). A
  recipe is parts of lemon/sugar/water/ice + price; quality = distance from a
  hidden, weather-dependent ideal (shifted per product). Persistent **recipe
  feedback** (EMA) guides tweaks with an Apply button. The 2nd product (Pink
  Lemonade) shares raw ingredients but tunes to a sweeter ideal and appeals to
  kids/tourists — a strategic menu choice that splits crew time, not free upside.
- **Reputation** — a **4-facet vector** (Taste / Service / Value / Buzz), global +
  location-sticky, each eased toward its own daily signal with its own decay
  (Buzz fades fast, Taste compounds). Blended (`REP_BLEND`) into the cached
  overall ★ that drives credit/forecast/UI. Each facet tilts a different lever
  vs the overall — Taste→price tolerance, Buzz/Value→demand, Service→patience —
  neutral at uniformity (a balanced business behaves like the old single dial).
  **Regulars pool** = sticky baseline traffic grown by delight.
- **Equipment** — upgrade **lines** with stacking **levels**, gated by
  location/reputation/day prerequisites (see below).
- **Staff** — up to 3; each adds a service station; daily wages.
- **Weather** — Markov chain; noisy forecast vs actual; sets the ideal recipe.
- **Inventory/spoilage** — slot-based storage; ice melts overnight, lemons spoil
  in 4 days, sugar/cups never. Ice Maker regenerates ice during the day.
- **Supplier market** — per-item price index drifts daily via a seeded
  mean-reverting walk (lemons swing most, cups least; stepped once at settlement).
  **Quality grades** (standard/premium) on taste solids (lemon/sugar) raise the
  recipe quality ceiling (premium fraction → additive taste bonus). **Bulk
  discounts** on larger single purchases. Turns "buy stock" into sourcing +
  timing speculation. (Supply contracts deferred to Phase 2, gated by research.)
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
- Panel layout pass — Marketing/Staff hire as one-per-line option buttons,
  Locations rows with a consistent 3-line stat block + centered action, grid
  shop rows (fixes wide-control alignment), Finance moved to a full-width bar so
  the panel grid is a balanced fixed 3-col (2 cols ≤1040px, 1 col ≤820px).
- Feel & options pass:
  - **Settings** — persisted prefs (`store/settings.ts`, separate localStorage
    key) in a modal: reduced-motion, weather effects, default speed. Reached
    from the main menu + topbar ⋯. `getSettings()` is the sync read for the
    canvas/confetti/loop; the app store mirrors it for reactive UI.
  - **Transitions/micro-interactions** — screen enter fade-slide (only on actual
    screen change, via `ui/anim.ts`), count-ups on recap headline stats
    (`[data-countup]` + `runEnterEffects`), topbar cash pulse on change. All
    gated by reduced-motion.
  - **Day comes alive** — time-of-day sky wash (cool morning → golden evening),
    sun glow on bright days, rain/snow particles (gated by weather-fx),
    customer shown at the window per serving station (`StationView.servingIcon`),
    and a 💭⏳ thought bubble over impatient queuers.
- Recap stat cards — uniform layout so a row lines up: full-width header
  (label + delta), value, sub line, and a full-width sparkline pinned to the
  bottom (stretched via `preserveAspectRatio=none` + non-scaling stroke). Every
  card supplies spark + delta + sub (short single-word labels avoid wrapping).
- Equipment rows — the wide "🔒 Reach …" unlock requirement moved into the info
  area as its own orange chip line; the action column stays narrow (price button
  or a small 🔒), so long requirements no longer squeeze the name/blurb into
  ugly multi-line wraps. Locked rows are slightly dimmed.
- Day-view live stock strip — a sleek row below the stage showing each
  ingredient's count + a depletion bar (green→yellow→red as it runs low); ice
  carries a ⚙️ ice-maker badge and visibly holds/refills. `SimSnapshot.stock`.
- Fractional-stock bug — root cause was batch ingredient use computed as
  `recipe.part × batchSizeMult` (×1.5 / ×2.1 → fractional). Fixed by rounding
  per-batch ingredient cost to whole units (`batchLemons/Sugar/Ice`), rounding
  carried leftovers at settlement, and a v3→v4 migration that rounds existing
  saves. Regression test in progression.test.ts.
- Ice-maker forecast — the stock estimate now counts the ice maker's full-day
  output (`projectedIceAvailable = on-hand + iceRegenPerMin × openMinutes`), so
  an ice-maker stand isn't falsely "stock-limited" on the ice it starts with.
  The Stock panel's ice row shows "❄️ +N made today". (A linear-rate estimate;
  good enough without artificially bottlenecking on ice.)
- Staff tiers — root bug: per-task time was `Math.round(BASE / mult)`, so small
  speed bonuses (Barista ×1.2 → round(1.67)=2 min, same as Helper) were erased
  → paying more bought nothing. Fixed with a **fractional work model + carry**:
  stations track fractional `ticksLeft`/`taskTime` and carry the leftover minute
  fraction into the next task, so speed multipliers (staff AND equipment) take
  effect smoothly. Bumped tiers (Barista +40%/+25%, Manager +90%/+50%) and the
  Staff panel now spells out each tier's perks. Verified: at busy/capacity-bound
  spots a Manager crew serves ~14–53% more than Helpers. Regression test added.

## Depth Phase 1 (see DEPTH_ROADMAP.md)

- **Step A — multi-facet reputation.** Split the single rep dial into four facets
  (Taste/Service/Value/Buzz) stored on `GameState.repFacets` +
  `locationRepFacets`, each eased toward its own daily target (taste←quality,
  value←fairness, service←wait−loss, buzz←satisfaction+marketing+word-of-mouth)
  with its own decay (`REP_DECAY_FACET`: buzz fast, taste slow). The blended
  overall (`REP_BLEND`) is cached back into `reputationGlobal`/`locationRep`, so
  credit/forecast/stats/UI are untouched. Economy "tilts" each lever by a facet's
  divergence from the overall — Taste→`priceTolerance`, Buzz/Value→
  `expectedCustomers`, Service→patience — all **neutral at uniformity** (a
  balanced business reproduces the old single-rep math; proven by tests + the
  6/6 balance run). UI: a Reputation panel (4 bars + trend arrows + a
  plain-language weak-spot nudge once facets diverge), and the recap's driver
  bars relabeled ⭐Taste / 💵Value / ⚡Service ("What built your reputation").
  Migration 4→5 splits the old scalar into equal facets. Regression tests in
  `test/reputation.test.ts`.

- **Step B — supplier market & ingredient quality.** New pure `engine/supplier.ts`:
  `stepSupplierPrices` (mean-reverting per-item walk, one gaussian draw/item at
  settlement — determinism preserved), `unitPrice`/`bulkFactor`/`nextBulkTier`,
  `gradeQualityBonus`. `GameState.supplier.priceIndex` drifts daily;
  `InventoryLot.grade` ("standard"/"premium", absent = standard so old lots are
  valid). Premium taste solids (lemon/sugar) add up to +10% recipe quality
  (`GRADE_QUALITY_BONUS` × premium fraction, applied as a day-level bonus from
  starting inventory); premium cups/ice are intentionally not offered (a trap
  avoided). Bulk tiers discount large single buys. `buyStock`/`maxBuyable`/
  `itemBuyPrice` gained an optional grade; premium and standard are kept as
  distinct lots. UI: per-row Standard/✨Premium toggle (lemon/sugar), price-trend
  chip (▲/▼ % vs normal), bulk hint, and event-spike red. Migration 5→6 seeds a
  neutral market. Tests in `test/supplier.test.ts`.

- **Step E₀ — menu foundation (per-product refactor + 2nd product).** Replaced
  the singular `recipe`/`qualityScoreEMA`/`recipeFeedback`/`priceFeedback` with a
  `products: Record<ProductId, ProductState>` map + `menu: ProductId[]` (new
  `engine/menu.ts` accessors). The `DaySim` is now multi-product: each customer
  picks a drink (weighted by per-product archetype appeal; **no RNG draw when the
  menu has one product**, so the classic path stays byte-identical — proven by
  unchanged balance + 61 prior tests), per-product pitcher pools, per-product
  make/serve with FIFO, per-product quality/feedback at settlement, and a
  `DayResult.perProduct` breakdown. Pink Lemonade (`data/products.ts`) shares raw
  ingredients but has its own ideal shift / strength bias / price-tolerance
  premium / archetype appeal. UI: per-product recipe editors + a menu manager
  (add/remove, cap 2) in the planning panel; a per-product menu-mix in the recap.
  Economy `idealRecipe`/`recipeQuality` gained an optional product taste profile
  (defaults preserve classic). Migration 6→7 wraps the old singular fields into
  `products.classic` and seeds the menu. Tests in `test/menu.test.ts`.
  (More products + snack add-ons come in Phase 2 / E₊.)

- **E₀ refinements — grade clarity, per-product forecasting, live split.**
  - **Standard vs premium stock**: lots already carry grade and spoil/age as
    distinct lots (verified by test); the Stock panel now shows the split
    ("74 standard · ✨ 50 premium") via `inventoryByGrade`.
  - **Per-product forecasting**: `productSplit` estimates each drink's share of
    sales from archetype-mix × product appeal (customers buy either but lean by
    type — e.g. kids skew pink). The Stock forecast (`servableCups`) now blends
    both products' shared-ingredient demand by that split, and revenue uses a
    `blendedPrice`. Each product editor shows its "~X% of sales".
  - **Live day stats**: `SimSnapshot.products` carries per-product pool + cups
    sold; the sim shows a **Menu** strip (sold/ready per drink) and a brew icon
    over a station making each drink (`StationView.makeIcon`).

- **Dashboard UI overhaul** (planning screen got busy as systems stacked up):
  - **Masonry layout**: `.grid--panels` switched from an equal-height CSS grid to
    a balanced multi-column (`column-count` + `break-inside: avoid`), so short
    cards (Reputation, Marketing) tuck beside tall ones instead of leaving big
    vertical gaps. Responsive: 3 → 2 → 1 columns.
  - **Tabbed "Grow" panel**: Equipment / Staff / Locations (the occasional
    "invest" actions) collapsed into one tabbed card (`growPanel` + `growTab`),
    so the dashboard is 5 cards instead of 7 and the tall Equipment list only
    shows on demand. The three panel bodies are now `*Content()` helpers.
  - **Recap per-product table**: the recap's "By the menu" panel (per-product
    cups/revenue/★/share + aggregate total row).
  - **Menu add-drink row** redesigned (`.menu-add`): name + wrapping blurb left,
    compact "+ Add" button right — fixes the 3-line "Pink Lemonade" overflow.
  - **Stock card** redesigned into a sleek 3-zone row: identity + live price on
    one line, a compact meta line (freshness · slots · premium count), then the
    grade toggle grouped with the buy controls, with the bulk/grade hint beneath.
