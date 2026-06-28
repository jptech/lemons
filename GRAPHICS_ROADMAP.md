# Graphics Roadmap — follow-ups to the scene overhaul

Phase 1 (shipped) rebuilt the live stand scene in `src/ui/screens/stand/`:
procedurally drawn vector characters ("peeps", `peeps.ts`) replacing emoji
stickers; time-of-day blended skies + richer location art with a live animation
layer (`backdrop.ts`); a living booth — plank wood, shaded scallop awning,
glass pitcher whose fill tracks `snap.pitcherPool`, cup stack tied to cup
stock, tip jar that fills with `snap.tips`, menu chalkboard, string lights at
dusk (`structure.ts`); and new FX — coin-to-jar arcs, batch pour splashes,
awning rain drips, sun motes, park fireflies, passing birds, open confetti,
outlined money pops (`fx.ts`).

Verified in the dist preview: suburb + sunny at morning/midday/afternoon, busy
crowd, staff make/serve animations, pops, tip jar, menu board. Typecheck,
`bun test` (80 pass), and `bun run build` are green.

## Verification still outstanding

Drive each via the console (`window.__lemon`): patch
`game.currentLocationId` / `game.weatherToday.condition`, `goTo("simulation")`,
run at 4×, pause at the moment of interest.

- [ ] **Dusk beat** (tod > 0.7): string lights on + twinkle, evening sky blend,
      suburb/downtown windows lighting up progressively, evening wash alpha.
- [ ] **Closing ceremony**: CLOSED sign flip, queue dispersal, lighter scrim
      (kept light so the bulbs glow — confirm it reads).
- [ ] **Park**: fountain droplet arcs + pool shimmer, kite, bench, flower bed;
      fireflies after tod 0.68 (and during the closing beat).
- [ ] **Beach**: live foam lines + sun glint sparkles, boardwalk sidewalk,
      drawn umbrella/towel, dune grass, headland, sea bands at dusk.
- [ ] **Downtown**: dusk window glow, water tower, lemon billboard, crosswalk.
- [ ] **Stadium**: floodlight cones + live halo pulse at dusk, blimp, seat
      bands, entry arch.
- [ ] **Rainy**: awning drips (swell at scallop tips → fall → ground ripple),
      gradient puddles, 3-tone dark clouds, canopy sway boost.
- [ ] **Cold**: snow + suburb chimney smoke. **Heatwave**: shimmer + motes.
- [ ] **Queue close-up**: mood faces (smile/flat/frown + brows), impatient
      foot-tap + ⏳ bubble, regulars' heart shirts, zen closed eyes, kid scale,
      blink timing; serving-window customer drawn from behind.
- [ ] **Event FX**: coin arc landing plink at the jar, batch splash at the
      pitcher, 5★ drawn starburst, open confetti at the sign.
- [ ] **Settings paths**: reduced motion (frozen `animT`, no walk cycles, no
      waypoint walk-ups) and weather FX off — confirm nothing animates/spawns.
- [ ] **Perf**: 4× on a packed day; watch for GC churn from per-frame
      gradients (shadows, glows). If needed, bake the peep shadow to a sprite.

## Known nits (small, safe polish)

- "N ready" pill slightly crowds the pitcher handle at narrow widths — nudge
  right or drop below the counter lip.
- Sun disc reads a touch flat at midday; consider a subtle pulsing halo in the
  live layer (cheap, per-frame radial).
- Staff progress dial + make-bubble can overlap the hanging sign with 1
  station on narrow canvases — clamp bubble y to below the sign.
- Ambient walker thinning is a flat 60% — could scale with location
  `trafficBase` so the stadium still feels mobbed.
- Equipment props that are still emoji stickers (📋 🔬 🚰 📻 🛰️ 💳 🛋️ 🏬 🏭):
  redraw the high-visibility ones as vectors (dispenser, forecast radio).

## Phase 2 ideas (bigger swings)

- **Kid balloons + dogs**: kids occasionally hold a balloon (bobbing string);
  rare dog-walker ambient on the lane.
- **Camera life**: very subtle scene drift (±2px parallax between far/near
  layers) tied to `animT`; would need the backdrop split into two bakes.
- **Customer hand-off choreography**: when a serve completes, animate the
  window customer turning and merging into a departer walker (currently the
  departer spawns fresh) — one continuous person end-to-end.
- **Weather transitions**: crossfade between backdrop bakes when a mid-day
  event changes conditions (currently a hard swap on bucket change).
- **Night cap for late closes**: stars + moon past tod 1.0 during the closing
  scrim instead of the flat purple wash.
- **Location set-dressing from equipment**: e.g. cooler shed gets a puddle of
  melt on heatwaves; signage L2 neon reflects on the counter top at dusk.
- **Sound hooks**: the FX layer already has discrete moments (coin plink, pour
  splash, sign flip) — thread an optional tiny SFX bus through `Fx.spawn`.
