# Lemonade Lane — Depth & Progression Roadmap

A focused plan for deepening the game across its whole arc: **more meaningful
decisions on day 1** and **more headroom in the late game** so a skilled player
doesn't saturate the systems and coast. Companion to `NOTES.md` (which records
*what exists*); this doc records *what we're adding and why*.

> Design north star (unchanged): a **casual-tilt yet deep economic business
> sim** with a fun, vibrant identity. Success should feel **earned** — not
> trivial to win, not punishing. Every addition below must either open a **new
> decision axis** or make an **existing axis matter for longer**. Bigger numbers
> are not depth; new *choices* are.

---

## The progression problem we're solving

The current difficulty curve is a **hump**: a slightly fiddly opening, a
satisfying mid-game as locations/equipment/staff unlock, then a **plateau**
where every system has been seen and the player just turns the same crank with
larger numbers. We attack both ends:

- **Front-load depth** — give day 1 a real decision beyond "how much to stock"
  (supplier market) and make reputation a *diagnosis* rather than a single dial.
- **Back-load headroom** — add long-horizon sinks (research, training) and a
  menu/brand layer so mastery keeps paying off and fresh "first-time tuning"
  beats recur deep into a run.

---

## Two-phase plan at a glance

| Phase | Adds | Primary axis it deepens | Where on the curve |
|-------|------|-------------------------|--------------------|
| **Phase 1** | **B** Supplier market · **A** Multi-facet reputation · **E₀** Menu foundation (2nd product) | Inventory speculation; reputation diagnosis; recipe/menu variety | Start + mid |
| **Phase 2** | **E₊** Full menu (add-ons, per-location strategy) · **D** Brand equity · **C** Research & training trees | Menu strategy; marketing portfolio; long money-sinks | Mid + late |

Phase 1 is the buildable, high-leverage slice that adds depth at **both** ends
without the franchising lift. Phase 2 layers the long-game richness on top, and
is explicitly designed to consume the cash a maxed-out player would otherwise
have nowhere to spend.

**Sequencing rationale.** B and A are mostly *engine + data* changes that the
later phases lean on (D's "Buzz" facet is one of A's sub-reputations; C's
research tree partly gates B's contracts and E's recipe presets). E₀ ships the
*plumbing* for multiple products in Phase 1 so that E₊, D, and C in Phase 2 are
additive data/UI rather than another schema rework.

---

## Architecture touchpoints (grounding)

Real anchors in the codebase these changes hook into (so the plan stays honest):

- **Schema/migrations** — `TUNING.SCHEMA_VERSION` is currently **4**;
  `persistence/saveLoad.ts` runs a sequential `MIGRATIONS` map keyed by the
  version upgraded *from*. **Every phase below bumps the schema and ships a
  migration** that backfills new fields with neutral defaults (the pattern the
  existing 1→2→3→4 steps already follow).
- **Engine purity** — `engine/` and `data/` import no DOM/clock/`Math.random()`;
  randomness threads through `GameState.rngState`. New randomness (daily supplier
  prices, training rolls) **must** draw from the seeded PRNG in a fixed order so
  determinism + replay hold.
- **Reputation today** — a single `reputationGlobal` + `locationRep` + a
  `regularsPool`, eased toward satisfaction in `dayLoop` settlement; consumed by
  `expectedCustomers` (rep→demand) and `priceTolerance` (rep→price headroom).
- **Recipe/products today** — `GameState.recipe` is a *single* `Recipe`;
  `data/products.ts` already models a **list** of `ProductDef` (only `classic`
  ships) with `ProductId` = `"classic"`. This is the seam E builds on.
- **Inventory today** — `InventoryLot { item, qty, ageDays }`; buy price is a
  flat `TUNING.ITEM_COST[item]` via `itemBuyPrice`/`maxBuyable`. The plan doc
  always intended a `supplierPrice(item, day, rng)` function here — that's B.
- **Marketing today** — a per-day `marketingSpend` through
  `economy.marketingShortTerm` (diminishing) + `marketingRepBoost`. D turns this
  faucet into a stock.
- **Equipment today** — upgrade *lines* with stacking *levels* and
  `unlock` prereqs; a `research` line already exists as a stub. C promotes it.
- **Selectors** — `salesForecast`, `pitchersFromStock`, `projectedCustomers`,
  `pricingHint` are the player-facing read models any new system must feed so the
  forecasts stay honest.

Verify gates for every step: `bun run typecheck`, `bun test`, `bun run build`,
`bun run balance` (the 6-seed survival harness — keep it green / re-tune).

---

# PHASE 1 — depth at the start

> **Status: ✅ SHIPPED** (schema 4→7). A = multi-facet reputation, B = supplier
> market & ingredient quality, E₀ = menu foundation + 2nd product. All verified:
> 67 tests pass, 6/6 balance seeds survive, single-product path byte-identical.
> See `NOTES.md` for per-step details. Deferred to Phase 2: supply contracts
> (gated by research), products with unique ingredient lines, snack add-ons.

Goal: by the end of Phase 1, **day 1 has a real supply decision**, **reputation
is something you diagnose and repair**, and **the menu has a second product** so
the recipe loop (our most casual-friendly system) already has variety and the
plumbing for everything in Phase 2 is in place.

---

## B — Supplier market & ingredient quality

**Turns "buy stock" from a quantity slider into speculation + sourcing.** This is
the rare addition that deepens day 1 with **zero unlocks required**.

### Mechanics

1. **Fluctuating daily prices (seeded).** Replace the flat `ITEM_COST` lookup
   with `supplierPrice(item, day, rngState)` — a mean-reverting random walk per
   item (lemons swing most, cups least; sugar/ice mild). Surfaced as a small
   **price trend arrow** (▲/▼ vs the trailing average) on each buy row. Now
   "stock ahead of the heatwave" and "wait out a spike" are live calls. Ties
   directly into the existing **lemon-shortage event** (it becomes a sharp spike
   on the same curve rather than a one-off flag).
2. **Bulk discount tiers.** Buying a larger quantity of an item in one purchase
   lowers per-unit price (e.g. step discounts at 50/120/250 units). Creates a
   **cash-vs-storage-vs-spoilage** tension: bulk lemons are cheap but spoil in 4
   days; bulk ice is pointless (melts overnight). Rewards reading the forecast.
3. **Quality grades (2–3).** Each ingredient has Standard / Premium (/ Organic)
   grades at higher cost that **raise the recipe's quality ceiling** — they nudge
   `recipeQuality` upward (a small additive bonus, or a tighter effective
   taste-distance). Premium lemons matter most; premium cups are a trap (no
   quality effect) — a legibility lesson the player learns. Grade is carried on
   the lot (`InventoryLot.grade`), so a fridge can hold mixed grades and FIFO
   consumption blends them.
4. **Supply contracts (gated by C's research later; ship a basic version now).**
   Lock a price for an item for N days — a **hedge** against volatility. Early
   game: one simple "standing order" at a slight premium for price certainty.
   Phase 2 research expands contract length/variety.

### Engine / data changes

- `types.ts`: `ItemGrade = "standard" | "premium" | "organic"`; add optional
  `grade?: ItemGrade` to `InventoryLot` (absent = standard, so old saves are
  valid). Add a `SupplierState` slice to `GameState`:
  `{ priceIndex: Record<ItemId, number>; contracts: Contract[] }` where
  `priceIndex` is the current multiplier on each item's base cost.
- `engine/supplier.ts` (new, pure): `supplierPrice(item, grade, supplierState)`,
  `stepSupplierPrices(supplierState, rng)` (mean-reverting walk, called once at
  day rollover in settlement), `bulkUnitPrice(base, qty)`.
- `tuning.ts`: `ITEM_COST` stays the *base*; add `GRADE_COST_MULT`,
  `GRADE_QUALITY_BONUS`, `SUPPLIER_REVERSION`, `SUPPLIER_VOLATILITY` (per item),
  `BULK_TIERS`.
- `reducers.ts`: `buyStock` reads the live supplier price + chosen grade;
  `itemBuyPrice`/`maxBuyable` updated; new `setSupplyContract` reducer.
- `economy.ts`: `recipeQuality` gains an optional `gradeBonus` term; the day sim
  computes the day's effective grade bonus from the consumed lots.
- `dayLoop.ts` settlement: call `stepSupplierPrices` (one fixed PRNG draw block),
  advance/expire contracts.

### UI

- Buy rows gain a **grade selector** (segmented Std/Prem) and a **trend arrow** +
  small 7-day sparkline of that item's price. Bulk-discount breakpoints shown as
  faint ticks on the quantity slider ("buy 120 → −12%").
- A compact **"Market"** strip in the planning Stock panel: today's price index
  per item with ▲/▼ and a one-line read ("🍋 lemons pricey today — −, or stock
  light").
- Contracts surface as a small card ("Standing order: 60 lemons/day @ $0.22").

### Balance & determinism notes

- Mean-reversion keeps prices from drifting to extremes; volatility tuned so a
  *typical* swing is ±15–25% on lemons, far less on cups. Run `balance` across
  seeds to confirm no seed gets a degenerate cheap/expensive streak that trivially
  wins or kills a run.
- **All** supplier randomness is one PRNG block per day at a fixed point in
  settlement — never mid-tick — so skip-to-end and 1×/4× stay byte-identical.
- Migration **4→5**: add `grade` default (none), seed `priceIndex` to 1.0 per
  item, empty `contracts`.

### Why it's day-1 depth

No unlock gates it. The very first planning screen now asks: *what grade, how
much, and is today a good day to buy?* — three coupled decisions where before
there was one. It also makes the existing spoilage and forecast systems pay off
harder (cheap bulk lemons are a trap on a rainy forecast).

---

## A — Multi-facet reputation (Taste / Service / Value / Buzz)

**Split the single ★ into a small vector** so reputation becomes a *diagnosis*
("traffic's fine but everyone balks → I'm Service-bound") instead of one dial you
push up. Makes the analytics screen genuinely useful and gives reviews something
concrete to point at.

### The four facets

| Facet | Grows from | Decays | Drives |
|-------|-----------|--------|--------|
| **Taste** ⭐ | recipe quality of completed sales | slow | **price tolerance** (a proven recipe lets you charge up) |
| **Service** ⚡ | low waits; shrinks on balk/renege | medium | **effective throughput / patience floor** (how much traffic you can absorb before balking spikes) |
| **Value** 💵 | price-fairness memory | medium | **demand at a given price** (overcharging sinks it even when sales complete) |
| **Buzz** 📣 | marketing + delighted days (word-of-mouth) | fast | **top-of-funnel traffic** (awareness). Phase 2's brand-equity stock *is* this facet's reservoir. |

**Overall reputation** = a weighted blend of the facets (keeps a single headline
★ for casual players and for `creditLimit`, goals, etc.):
`overall = 0.35·Taste + 0.25·Service + 0.25·Value + 0.15·Buzz`.

### Engine / data changes

- `types.ts`: introduce `RepFacets { taste; service; value; buzz }` (0..100
  each). Keep `reputationGlobal` as the **derived blend** (a function), and keep
  `locationRep` as location-sticky facets:
  `locationRepFacets: Record<string, RepFacets>`. Preserve `effectiveReputation`
  as the blend so existing call-sites keep working.
- `dayLoop.ts` settlement: where today it eases one rep toward
  `100·meanSatisfaction`, instead ease **each facet** toward its own daily
  signal:
  - Taste ← mean recipe-quality of sales (the existing `quality` driver).
  - Service ← mean wait-score, penalized by `(balked+reneged)/potential`.
  - Value ← mean price-fairness driver.
  - Buzz ← `marketingRepBoost(spend)` + a word-of-mouth term from the count of
    *delighted* (sat > tip threshold) customers; faster decay.
  The existing `satDrivers { quality, price, wait }` on `DayResult` already
  carry exactly these signals — we're routing each driver to its own facet.
- `economy.ts`: `priceTolerance` keys off **Taste** (not overall);
  `expectedCustomers` splits its rep term so **Buzz** scales top-of-funnel and
  **Value** scales price-acceptance; patience/throughput pick up a **Service**
  term. Each is a small, separately-tunable coefficient.
- `tuning.ts`: per-facet `EASE` and `DECAY` rates + the blend weights + the new
  demand/tolerance coefficients.

### UI

- **Reputation card** becomes a small **4-facet readout** (radar or four mini
  bars with emoji), each with a trend arrow; the headline ★ stays on top.
- Day Recap's **review-driver stacked bar** (already exists: taste/price/wait)
  now explicitly maps to **Taste/Value/Service** facet movements — "you gained
  Taste, lost Service today."
- A one-line **diagnosis** in planning ("Your weak spot: **Service** — long
  waits cost you customers. Add a station or speed up serving.") generated from
  the lowest facet relative to its location demand. This is the casual-friendly
  surfacing of the depth.

### Balance & migration notes

- Blend weights chosen so a balanced operator lands near today's single-number
  behavior (regression: an all-equal-facet state should reproduce the current
  demand/tolerance within a few %). Validate via `balance` + a unit test that the
  blend ≈ old rep for uniform facets.
- Decay-rate ordering (Buzz fast → Taste slow) is what makes facets feel
  different: Buzz must be *fed* (marketing), Taste *compounds* (a good recipe
  pays for weeks). This is also what creates the Phase-2 brand-equity hook.
- Migration **5→6**: split the existing scalar rep into four equal facets seeded
  at the old value (`taste = service = value = buzz = reputationGlobal`); same
  for each `locationRep` entry. Neutral — a loaded save plays identically on day 1
  then differentiates.

### Why it's mid-game depth that also helps early

Even early, the diagnosis line teaches the player *which* lever to pull instead of
vaguely "raise reputation." Across a run, the facets diverge based on play style,
so two players' businesses feel different — and the analytics screen finally
answers concrete questions.

---

## E₀ — Menu foundation (ship the second product)

**Activate the product-list plumbing** so the recipe loop has variety now and
Phase 2's full menu is additive. We deliberately ship a *small* version: one
extra primary product, no add-ons yet.

### Mechanics

- Add a **second product** (e.g. **Iced Tea** 🧋 or **Pink Lemonade** 🌸) with
  its own `Recipe`, its own hidden weather-ideal, and a different archetype lean
  (e.g. Iced Tea skews adult/tourist, less ice-critical; Pink Lemonade skews
  kid/sweet). The player can run **one or two products** at once.
- Each active product has **its own recipe, price, quality EMA, and recipe
  feedback** — i.e. the discovery loop multiplies. A second product means a
  second small inventory consideration but **shares** the raw items (mostly) so
  it's not a whole new supply chain (tea adds one ingredient line: `tea`).
- **Capacity coupling:** stations serve whichever product a customer wants;
  running two products splits make-batch time, so a second product is a
  throughput decision, not free upside. This keeps it from being a strict
  power-up — it's a **strategic menu choice**.

### Engine / data changes (the schema-shaping step — do it carefully once)

- This is the **largest structural change** because `GameState.recipe` (singular)
  becomes per-product. Introduce:
  - `ProductId` widened beyond `"classic"` (add the new id).
  - `GameState.menu: ProductId[]` (active products; default `["classic"]`).
  - Move per-product mutable state into
    `products: Record<ProductId, { recipe; qualityScoreEMA; recipeFeedback; priceFeedback }>`.
    Keep a thin back-compat accessor so existing selectors that read
    `g.recipe`/`g.qualityScoreEMA` resolve to the **active/primary** product
    during the transition, then migrate call-sites.
  - `ItemId` gains `"tea"` (or the new product's unique ingredient); `STOCK_ITEMS`,
    `ITEM_COST`, `SLOT_COST`, spoilage rules updated (tea = non-perishable like
    sugar).
- `dayLoop.ts`: each arriving customer picks a product (by archetype/weather
  weighting), then the existing per-customer quality/price/satisfaction runs
  against **that product's** recipe. Pitcher pools become **per product**.
- `DayResult` gains a small `perProduct` breakdown (cups/revenue/avgStars) so the
  recap can show the menu mix.

### UI

- Planning gains a **Menu panel**: toggle which products are active (cap 2 in
  Phase 1), each with its own recipe sliders + price + feedback chip. Reuse the
  existing recipe-feedback "Apply" affordance per product.
- Sim view: pitcher pool readout per product; the live stock strip already
  generalizes (just more items).
- Recap: a tiny **menu-mix donut** (cups by product) + per-product ★.

### Balance, scope discipline & migration

- **Keep Phase 1 to exactly two products and no add-ons** — the goal here is to
  prove the multi-product engine path and ship variety, not to balance a full
  menu. E₊ (Phase 2) adds more products + snack add-ons on top of this foundation.
- Tune the second product so it's a **lateral** choice early (comparable margin),
  becoming a *strategic* one once locations/weather diverge (tea shines on cold
  days when lemonade demand craters — a hedge against weather variance).
- Migration **6→7**: wrap the existing singular `recipe`/`qualityScoreEMA`/
  `recipeFeedback`/`priceFeedback` into `products.classic`, set
  `menu = ["classic"]`. Fully neutral.

> **Why ship E₀ in Phase 1 even though it's the heaviest change?** Doing the
> singular→per-product refactor *once*, early, means D and the rest of E in
> Phase 2 are pure additions. Deferring it would force a second painful schema
> migration later. Pay the structural cost now while the surface area is smaller.

---

## Phase 1 build order

1. **A — reputation facets** first (engine-only, low UI risk; everything else
   reads rep). Ship blend + migration + diagnosis line. Re-green `balance`.
2. **B — supplier market** next (additive engine slice + buy-screen UI). The
   most player-visible day-1 depth; satisfying to land second.
3. **E₀ — second product** last in the phase (the structural refactor; do it when
   the other two are stable so the migration chain is clean: 4→5→6→7).

Each step: schema bump + migration + tests (determinism, migration round-trip,
the new mechanic's regression) + `balance` re-validation + a NOTES.md changelog
entry.

---

## Phase 1 — known limitations & future refinements

Honest accounting of where the shipped Phase 1 work is deliberately simplified,
where it's rough, and what we'd change next. None of these block play; they're
the seams Phase 2 (and small follow-ups) should tighten. Grouped by step.

### A — multi-facet reputation

- **Blend ≠ old satisfaction weights.** Overall ★ blends facets 0.35 / 0.25 /
  0.25 / 0.15 (taste/service/value/buzz), which doesn't exactly equal the old
  satisfaction weights (`W_QUALITY 0.45`, `W_PRICE 0.25`, `W_WAIT 0.30`). The
  *tilts* are neutral at uniformity, but the overall-rep **trajectory** drifts a
  few % from pre-A. Acceptable, not identical.
- **All event reputation shocks land on Buzz.** `EventEffect.repDelta` routes
  entirely to the Buzz (awareness) facet. Conceptually an inspection fail should
  hit Service/Value, a bad-recipe rumor should hit Taste. **Future:** facet-
  targeted event effects (planned in Phase 2 D's shock/recovery arcs).
- **Linear, lightly-bounded tilts.** Facet→lever effects are linear in
  `(facet − overall)` and only clamped; no diminishing returns or cross-facet
  interaction. Extreme divergence could over/under-shoot.
- **Word-of-mouth is a flat term.** `BUZZ_WOM_GAIN × delighted/served` nudges
  Buzz; the compounding organic-growth loop (great stretch → snowball past the
  cap) is explicitly Phase 2 D.
- **Weak-spot diagnosis is a fixed threshold** (flag the lowest facet once the
  spread > 8). It doesn't weigh a facet against how *binding* it is for the
  current location/strategy. **Future:** rank by marginal impact.
- **Regulars pool stays a single scalar**, not facet-aware (a Taste-driven
  regular vs a Value-driven one behave the same).

### B — supplier market & ingredient quality

- **Grade quality bonus is a day-level approximation.** `gradeQualityBonus`
  reads the **premium fraction of starting lemon+sugar inventory** and applies a
  uniform additive bonus to *every* sale that day — it does **not** follow FIFO
  consumption. If you carry premium but the day only consumes standard lots (or
  vice versa), the bonus is slightly mis-attributed. **Future:** track consumed
  grade per batch for exact attribution.
- **Bonus is global, not per-product.** Premium ingredients lift *both* drinks
  equally, even the one that didn't use them. Ties into E₀'s shared-stock model.
- **Grades only on lemon & sugar; no "organic" tier.** Ice/cup intentionally
  have no premium (the trap-avoidance lesson). The type allows a third tier but
  it isn't configured.
- **`maxBuyable` ignores bulk discounts** (uses the sticker price as a
  conservative bound), so "Max" can slightly under-buy when a bulk break would
  make more affordable.
- **Price walk is independent & strictly mean-reverting to 1.0.** No
  cross-item correlation, no seasonality, and no long-term drift/inflation — so
  the market can't trend expensive over a long game. **Future:** inflation /
  seasonal lemon prices (pairs with Phase 2 G).
- **Supply contracts not shipped** (deferred to Phase 2, gated by research) —
  there's no way to hedge volatility yet.

### E₀ — menu foundation

- **Top-of-funnel demand uses only the PRIMARY product's price.** The crowd size
  (`expectedCustomers`) applies price-acceptance to the primary/headline price; a
  customer who would balk at Pink's higher price can still arrive (counted via
  Classic's cheaper price) and then *choose* Pink. The forecast mirrors the sim,
  so it's internally **consistent**, but per-product price doesn't filter its own
  demand. **Future:** per-product demand & price acceptance (biggest single
  fidelity gap).
- **No product substitution.** A customer picks their drink on arrival and will
  wait/renege for *that* product (FIFO). They won't switch to the in-stock drink
  if their pick runs dry — so a single-product stockout can stall the line while
  the other product sits ready. **Future:** a "I'll take the other one" fallback
  weighted by how strong the preference was.
- **Demand split is an estimate.** `productSplit` uses base archetype weights ×
  appeal (with the current regulars snapshot); the live mix varies with the
  day's actual crowd, so the planning "~X% of sales" is a guide, not a promise.
- **Throughput forecast under-models batch-switching.** Running two products
  means priming two pools and more make/serve interleaving; the capacity estimate
  doesn't fully charge for that overhead, so a 2-product day's capacity ceiling is
  slightly optimistic.
- **Per-product avg ★ is noisy at low volume.** Recap stars come from sampled
  reviews; a drink with few cups has a high-variance average (we show "—" at
  zero, but small samples still wobble).
- **Shared ingredients only.** Pink reuses lemon/sugar/ice — no unique ingredient
  line, so there's no differentiated supply chain or storage pressure yet
  (Phase 2 E₊). Menu is capped at **2**.
- **`pitchersFromStock` (primary-only) lingers** beside the new menu-aware
  `servableCups` — minor redundancy kept for the single-product stock check.

### Cross-cutting

- **Determinism caveat:** a 1-product menu takes no product-pick RNG draw, so the
  classic path is byte-identical to pre-E₀ — but a 2-product run of the same seed
  is *not* comparable to a 1-product run (expected; the streams diverge by design).
- **Balance is validated single-product only.** `scripts/balance.ts` runs a
  one-drink baseline; a **multi-product balance sweep** (and premium-vs-standard,
  and a 40–50 day long-run) is still owed.
- **Reputation/quality interplay unswept.** Premium ingredients → higher Taste →
  higher price tolerance is a compounding loop we haven't stress-tested for a
  degenerate "all-premium, high-price" dominant strategy.

### Priority follow-ups (small, before or alongside Phase 2)

1. Per-product demand & price acceptance (closes the top-of-funnel gap).
2. Product substitution on stockout (removes the line-stall failure mode).
3. FIFO-accurate, per-product grade quality attribution.
4. Multi-product + premium balance sweep in `scripts/balance.ts`.
5. Facet-targeted event shocks (folds naturally into Phase 2 D).

---

# PHASE 2 — extended late-game headroom

Goal: give a mastered business **somewhere to grow** so it doesn't saturate.
Phase 2 leans entirely on Phase 1's seams (per-product menu, rep facets incl.
Buzz, supplier contracts) so it's mostly additive.

---

## E₊ — Full menu & complementary items

**Multiply the recipe-discovery loop and add average-ticket strategy.** Builds
straight on E₀'s per-product engine.

### Mechanics

- **More primary products** (limeade, fruit punch, hot cider for cold days…),
  each unlocked via progression (location, reputation, or research) so new
  "first-time tuning" beats recur deep in a run — resetting the discovery dopamine
  the late game otherwise loses.
- **Add-on / complementary items** (cookies 🍪, pretzels 🥨) that **raise average
  ticket** and serve specific archetypes (Kids want cookies; an add-on attach
  rate scales with satisfaction). Add-ons are a separate, simpler sale layered on
  a drink purchase — no queue cost, pure upside *if* you stocked them, with their
  own spoilage profile (baked goods spoil in ~2 days → a fresh inventory tension).
- **Menu-size pressure:** running many products dilutes make-batch focus and
  storage; a **wider menu needs better equipment/staff** to support — naturally
  coupling E₊ to C and the equipment trees.

### Touchpoints

- Pure data adds to `products.ts` + a new `addons.ts`; `ItemId` grows per unique
  ingredient. Engine path already exists from E₀ — the per-customer product pick
  extends to "and maybe an add-on." `DayResult.perProduct` extends to add-ons.
- UI: Menu panel scales to the full list (with unlock gating like the equipment
  shop); recap menu-mix donut already generalizes.

### Why it extends the game

Each unlock is fresh content using a loop the player already enjoys, and the
attach-rate/average-ticket layer rewards a well-run, high-satisfaction stand —
mastery keeps paying.

---

## D — Brand equity (marketing as a stock, not a faucet)

**Convert marketing from "pay rent for demand" into a portfolio you manage over
weeks.** The Phase-1 **Buzz** facet becomes the *reservoir* this fills.

### Mechanics

1. **Awareness reservoir.** Daily marketing spend fills a slow-filling,
   slow-decaying **awareness** stock; demand draws on the *level*, not the day's
   spend. Stop advertising and you coast on built awareness for a while, then
   fade — so marketing becomes an investment with momentum, not a daily toll.
   (Mechanically: awareness *is* the Buzz facet's stored value; daily spend eases
   it up, natural decay eases it down.)
2. **Channels with saturation + cooldown.** Flyers / social / radio / (later)
   sponsorship each **saturate** with repeated same-channel use and **recover**
   over a few days — rewarding a **media mix** instead of spamming one channel.
   Extends the existing `MARKETING_TIERS` with per-channel state.
3. **Word-of-mouth compounding.** Delighted days feed **organic** awareness that
   can push demand *past* the usual marketing cap — an explicit **anti-plateau**
   term: a great stretch snowballs, so late-game mastery is visibly rewarded
   rather than flattened.
4. **Negative shocks + recovery arcs.** A scandal / viral complaint / inspection
   fail event drops a facet (often Buzz or Value) sharply; rebuilding is a
   multi-day arc. Makes the reputation buffer you *earned* actually matter.

### Touchpoints

- `GameState`: `marketing: { awareness; channels: Record<string, {saturation}> }`.
- `economy.ts`: `expectedCustomers`'s Buzz/awareness term reads the reservoir;
  add `awarenessStep`, `channelEffectiveness(channel, saturation)`,
  `wordOfMouthGain(delightedCount)`.
- `events.ts`: add shock/recovery events (data-only; effects already pipe through
  `EventEffect` — extend it with `awarenessDelta`/`facetDelta`).
- UI: marketing panel shows the **awareness gauge** (fill/decay), per-channel
  saturation, and a word-of-mouth indicator on great days.

### Why it extends the game

Marketing stops being a solved per-day formula and becomes a weeks-long
investment with momentum, diversification, and risk — and the compounding term
specifically prevents the demand ceiling from going flat.

---

## C — Research & training trees (long money-sinks → permanent capability)

**Give late-game cash somewhere to go.** Once equipment is maxed, money has no
home; research and training are *long* sinks that keep the player choosing.

### Research tree

- Promote the existing **`research` equipment line** into a small **tech tree**
  (or a parallel `research` progression with prereqs). Nodes spend cash (and
  time — some take days to "complete") to unlock **permanent capabilities**, not
  just stat bumps:
  - Sharper **forecast confidence** / demand analytics (narrows the
    `salesForecast` band — extends the existing `forecastConfidence`).
  - **Supplier contracts** expansion from B (longer locks, more items, better
    rates) — research *is* the gate B reserved.
  - **Recipe presets / auto-tune** (save named recipes; quick-swap by weather) —
    a quality-of-life payoff for menu breadth.
  - **Menu unlocks** for E₊ products.
- Models cleanly as data: `ResearchNodeDef { id, cost, days, prereqs[], effect }`
  evaluated like goals/equipment. `GameState.research: { completed[]; inProgress }`.

### Staff training & XP

- Staff gain **experience** the more days they work; a **training spend**
  accelerates it. A trained Helper eventually rivals a fresh Barista, so
  **hire-vs-train** has real texture and **retaining a crew matters** (turnover
  cost / morale). Adds soft attachment ("my crew") pure stats don't.
- `Staff` gains `xp` / `level`; `derive()` folds level into the effective
  serve/batch bonuses (the Phase-1-already-fractional work model means small
  per-level gains actually register — we fixed the integer-rounding bug that
  would have erased them).
- A **training** spend line in planning; a small per-staff XP bar in the staff
  panel.

### Touchpoints

- `data/research.ts` (new), `engine/research.ts` (pure), `GameState.research`,
  `Staff.xp/level`, `tuning.ts` rates, a Research screen/panel + staff XP UI.

### Why it extends the game

Both are **deep, slow sinks** that convert money into durable capability —
exactly what a cash-rich late game needs. Training also makes staff a system you
*cultivate* rather than a slot you fill.

---

## Phase 2 build order

1. **D — brand equity** first (it activates the Buzz facet from Phase 1 and is
   mostly engine + marketing-panel UI; high felt impact).
2. **C — research & training** second (the cash sink; research also gates B's
   contract expansion and E₊'s product unlocks, so it wants to land before the
   full menu).
3. **E₊ — full menu & add-ons** last (pure content on the E₀ engine, gated by
   C's research nodes — the satisfying payoff layer).

---

## Cross-cutting concerns (apply to every step)

- **Determinism is sacred.** Any new randomness (supplier walk, training rolls,
  word-of-mouth variance) draws from `rngState` in a **fixed order at a fixed
  point** (day settlement, never mid-tick). Add/extend the determinism test:
  same `{seed, plan[]}` → byte-identical `DayResult`.
- **Migrations are mandatory and neutral.** Each schema bump (4→5→6→7→…) backfills
  new fields so a loaded save plays *identically on the next day*, then
  differentiates. Add a migration round-trip test per bump.
- **Keep forecasts honest.** Whenever a system changes demand/throughput/quality,
  thread it into `salesForecast`/`projectedCustomers`/`pricingHint` so the
  planning hints don't lie. A forecast that ignores the new system erodes trust.
- **Casual surfacing of depth.** Every new system needs a **one-line plain
  hint** (the rep diagnosis line, the market read, the awareness gauge label).
  Depth lives under the hood; the surface stays friendly. No raw numbers dumped
  on the player.
- **Re-balance each step.** Keep `scripts/balance.ts` green (6/6 seeds survive a
  reasonable strategy) and re-check the early-game profit curve — new systems
  must not trivialize survival *or* spike the difficulty wall.
- **Anti-saturation acceptance test.** For Phase 2 especially: a 40–50 day run by
  a strong player should still present **fresh, non-trivial decisions** in the
  back third (new product to tune, research to prioritize, awareness to defend,
  a shock to recover from) rather than auto-pilot. If a system goes flat, it
  needs a compounding or unlock term.

---

## Out of scope (deferred, not walled off)

- **F — Franchising / multi-stand** endgame (the big late-game genre-shift). The
  per-product/per-location structure here keeps it *possible* later, but it's a
  separate large effort.
- **G — Inflation / lease renegotiation / difficulty modes** beyond the shock
  events in D. Worth a pass once Phase 2 lands to keep very long runs honest.
- Seasons/holiday calendar, equipment wear/upkeep, cosmetic stand customization —
  noted in `NOTES.md` roadmap; data models above don't preclude them.

---

## Definition of done (per phase)

**Phase 1 done when:** day 1 presents a supplier decision (grade + timing + bulk);
reputation shows four diagnosable facets with a plain-language weak-spot hint; a
second product is fully playable with its own discovery loop; `balance` is green;
schema migrated 4→7 with round-trip tests; NOTES.md + this doc updated.

**Phase 2 done when:** marketing is a managed awareness portfolio with channels,
word-of-mouth, and recoverable shocks; a research tree + staff training give the
late game durable cash sinks; the full menu (multiple products + add-ons) is
unlockable content gated by progression; a 40–50 day expert run still surfaces
fresh decisions in its back third; `balance` green; migrations + tests updated.
