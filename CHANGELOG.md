# Changelog

All notable changes to this project are recorded here.

## [Unreleased]

### Added

- **A power gauge on your side of the battlefield.** The left edge now carries the mirror of the enemy shield gauge: a lime fill for your current shot power, a red line at the power of your last shot, and the number above. Because it is `.gauge` with a `.mine` modifier, both bars share one set of rules and scale together at every breakpoint.
- **Fullscreen**, where the browser allows it: a **⛶** button in the header, plus a second one at the top of the right rail in the landscape layout — the header is hidden there, and that is exactly where a phone most wants the browser chrome gone. Both are removed on platforms without the Fullscreen API (iOS Safari) rather than left as dead controls, and any rejection is swallowed so a missing user gesture cannot break the frame loop.
- **A pixel-art look.** The canvas now renders into a **500 × 260** raster — a quarter of the logical surface — which CSS upscales with `image-rendering: pixelated`, so arcs go blocky, diagonals staircase and every gradient steps. `PIXEL = 2` is the dial. Crucially this is a **transform, not a rescale**: `W`/`H` stay 1000 × 520, so physics, blast radii, terrain generation and the CPU's 385-shot search are byte-for-byte unchanged.
- **A space backdrop.** Every battlefield now has a starfield (96 seeded stars) and **at least one planet or moon**, sometimes two — blocky discs with a shaded crescent, craters and an optional ring, coloured per map. In their place: a gradient sky, a sun blob and a hairline grid.
- Square chrome: border radii to 0, 2 px borders, flat fills instead of gradients, and a two-layer bevel on the primary buttons.
- **Hull upgrades under Defense: Tank II ($2000) and Tank III ($5000)**, worth 2 and 3 hull hit points. A hull point absorbs one hit — any shell — once the shield is gone, and the hull is repaired at the start of every duel, so the purchase lasts the run. Armour is a strict ladder (Tank III needs Tank II), and each tier recolours the chassis: **lime → amber → violet**.
- **Hull pips** above each tank (one per tier, filled while the hull holds, at y = -77 so they clear the label), the tier in the SHIELD cell (`3 HP · III`), and a colour swatch on the armour buttons in the depot — the shop teaches the colour before you buy it.
- **CPU hull tiers**, level-driven rather than bought: `progression.cpuArmor` gives the opponent 2 hull points from level 9 and 3 from level 16, a few levels behind the player's likely purchase arc so a paid upgrade stays an edge instead of being cancelled.
- A `$40` payout and a `hull hit ×n` tag for a hit that strips a hull point without destroying the tank.

### Changed

- **Every detail was re-sized to the pixel grid.** Anything thinner than one art pixel vanishes at this raster, so the terrain stipple (4×1 → 8×2), the hull pips (6×5 → 8×6), the bullet trails (3×3 → 4×4), the explosion rings (2 px → 4 px), the labels (12 px → 16 px) and the tank sprite (rounded rects → snapped rectangles, square-cap barrel) were all rebuilt. The shield ring became a chunky force-field box, because a 1.25-pixel ring just looked ragged.
- **The sky is state, not a paint.** `stars` and `celestial` are rolled in `makeMap()` with the terrain and never again, so the starfield cannot crawl while you aim — and `drawBody()` derives blocky discs from ordinary arcs, letting the raster do the pixelation rather than hand-plotting every crater.
- **Large shells moved from Weapons to Utilities** ($35 each), balancing the depot to 5 / 5 / 2 instead of 6 / 5 / 1. Behaviour-preserving by construction: they are appended *after* the fuel can — `aimBot()` refuels by position (`catalog[2][1][0]`), so a shell at index 0 would have silently stopped the CPU refuelling — and the CPU's resupply search became `ammoFor()`, which spans Weapons and Utilities, keeps only real shells, and still prefers the biggest it can afford before falling back to the cheap one. Five harness checks now guard that contract.
- `blast()`'s lethal branch now spends a hull point instead of destroying outright. A standard tank carries `1/1`, so behaviour at tier 1 is unchanged — the original harness assertions still mean what they said.
- The gauge's "empty bar means one clean hit destroys the tank" promise is now qualified: the enemy readout appends `· HULL n` from level 9, and `README.md` says *standard* tank. The gauge itself is untouched — hull is a hull, not a shield.
- `aimBot()`'s defensive purchase moved into `shieldFor(tank)`, a pure helper that filters `!item.armor` so the CPU can never buy a tier that `makeTank()` would wipe next duel.
- **Touch controls are buttons now, not a joystick.** Aim and power (◀ ▶ ▲ ▼) sit in the left rail; drive L/R in the right rail, directly above FIRE. They are ordinary `[data-hold]` buttons writing the *same logical keys the keyboard does*, so `held` and one expression in `update()` serve both inputs. Splitting the thumbs means `.touch` dissolves into `display:contents` in the landscape grid so `.pad` and `.drive` can claim separate rails, while portrait keeps them stacked; the grid gains a fifth row (`right3`) and the battlefield keeps its width.

### Removed

- The mobile joystick — one 102 px circle doing four jobs under a single thumb. `moveStick()`, `stickPointer`, `stickX`, `stickY`, the `--stick-x` / `--stick-y` properties and the five `.joystick` CSS rules are all deleted.

### Fixed

- **The harness renders, too.** It never called `draw()` before — `requestAnimationFrame` does not advance under `--virtual-time-budget`, so the entire render path was untested, and this change is nothing *but* render path. It now draws clean, draws again with a shell and an explosion in flight, and asserts two consecutive draws are pixel-identical so the sky cannot start crawling unnoticed. 45 checks total.
- `tools/drive.js` declared local `level`/`round` helpers that shadowed the game's numeric state; assigning to them threw *"Assignment to constant variable"*. Renamed `levelText`/`roundText`, which is what made the new armour assertions possible.
- **The harness is deterministic now, and about three times faster.** Two assertions secretly depended on CPU marksmanship: the single-cycle check assumed the level-1 CPU would miss, and the "a destruction advances LEVEL" check fired 1%-power shots for up to 40 turns hoping the CPU would land the kill. It often doesn't — a level-1 CPU can be *structurally* unable to hit, because those scripted shots carve a crater under the player and a ridge does the rest (one probe run sat at level 1 for 150 turns; another reached level 8 in the same span). The duel is now ended deliberately through the real `finishShot() → nextLevel()` path, and the one cycle the harness does play is played behind a temporary shield. 20 consecutive runs came back 30/30.
- **Precision where the joystick had none:** a tap now steps exactly 1 % of power or 1° of angle, and a hold ramps or sweeps. `nudge()` handles angle as well as power, and the `[data-hold]` handler calls it before recording the hold, so touch and keyboard behave identically. Fine aim is dropped on touch — 1 %/1° taps are finer than the Shift ramp was. `setPointerCapture` is guarded against a pointer that has already been released.

## [1.0.0] — 2026-11-09

First public deployment: **https://torched-planet.vercel.app**. Everything below shipped in it.

### Added

- **Live deployment** on Vercel — a static build of the repo root from `vercel.json` (no build step, no output directory). The GitHub repository is connected, so pushes to `main` redeploy automatically.
- `tools/drive.js`: a headless smoke test driver that steps `update()` directly, so behaviour can be verified in a real browser without `requestAnimationFrame`.
- Endless progression: the level counter never stops climbing, destroying the CPU deploys a new target with a `$250 × level` bank bonus, and shot rewards scale 30% per level against 20% price scaling.
- Shift fine aim, single-keypress 1% power nudges, and a last-shot reference tick on the power meter.
- Terrain amplitude and rooftop heights swell with level.
- `PROJECT.md`: a full technical reference for new contributors — state model, phase machine, ballistics, terrain carving, economy, CPU search, input plumbing, DOM contract, house rules, step-by-step recipes, known limitations and a glossary (assembled from the two reference documents this release then retired).
- An **enemy shield gauge** down the right edge of the battlefield: the lime fill is the CPU's shield HP out of 5, and a red hatched band at the top of that fill shows how much of it the loaded weapon would strip.
- **Wind**, rolled at the start of every duel and announced in the field bar with direction and strength (`WIND ▶ 12`, `WIND ◀ 7`, `WIND · CALM`). It is capped at 14 px/s² — mild by design — and the CPU's search simulates it, so the opponent aims into it.
- **A mobile layout.** On touch devices held sideways the game switches to an immersive grid: joystick and drive buttons in a left rail, weapon picker and FIRE in a right rail, battlefield occupying the full height between them — about 286 px on an 844 × 390 phone, where the old layout overflowed by two and a half screens. Portrait keeps the stacked layout, compacted, with a rotate hint.
- **Two more weapons**: **Nuke Mini** (52 px blast, 3 shield damage, $95) and **Napalm XL** (46 px blast, nine burning pools spread ±88 px, $175). Napalm's fire pools are now declared on the weapon (`burns` / `burnStep`) instead of hardcoded in `impact()`, so a wider napalm is data, not another branch.
- **Large shells are restockable** for $35 each — the cheapest item in the depot — so a run can be sustained on mid-tier shells instead of hoarding specials.

### Fixed

- A minimum-power shot detonated on your own tank: the shell never cleared the hull radius before the 16-tick grace period expired. `collision()` now skips the shooter outright.
- A lost duel was reported as "Draw." because the outcome ternary treated any player death as a draw; "CPU wins the duel." is reachable again.
- Startup crash introduced with endless progression: `reset()` built the tanks before `makeMap()`, so `makeTank()` → `support()` read an undefined `terrain` and the game never booted. The map is now generated before any tank exists.

### Changed

- Levels count duels, not turns: `round` now counts turn cycles, while `level` advances only when a tank is destroyed — either side. The next round is played at the new level with both tanks fresh and the bank carried over. The game-over state is gone, and the duel bonus is paid only on a win.
- CPU marksmanship is a real curve now. Level 1 misses by ~106 px on average (about a 14% hit rate) and sticks to Basic shells; accuracy improves every level until it is lethal at level 8. This replaces the old flat jitter that connected roughly 70% of shots at level 1.
- Power aim is no longer twitchy: the rate dropped from a fixed 48 points/second to a 5.6 → 16 points/second ramp over the first 0.65 s of a hold.
- HUD now reports LEVEL and BANK with the live reward multiplier, and the shop header shows the level.
- Renamed the game to **Torched Planet** (previously *Blastline*) across the browser tab title, the in-game header wordmark, and the README. The name carries the *Scorched Earth* homage used in the project description.
- A lost duel pays **salvage** — `$60 × level` — instead of nothing. The win bonus keeps its `$250 × level` rate, so winning a duel is still worth roughly four losses.
- `ROUND` counts rounds *within* the current duel and resets to `ROUND 01` when a new level begins, so `LEVEL 02 · ROUND 01` now reads as a fresh duel rather than an ever-climbing tally.
- The CPU's marksmanship ceiling moved from level 8 to level 11 (`skill` divisor `/ 7` → `/ 10`). Level 1 is untouched at roughly 14% accuracy; the climb is simply slower, so the mid-game is no longer near-lethal.
- Documentation consolidated into **`PROJECT.md`**, now the single source of truth. It absorbs `HANDOFF.md`, `DEVELOPERS.md` and the four `PLAN-*.md` files that existed at the time (launch, progression, the three open questions, and the gauge/wind work), all of which were superseded and have since been deleted from the tree. Stale `phase = 'over'` references in the old recipes and diagrams were corrected while merging.
- Touch hardening across the board: `100dvh` instead of `100vh`, safe-area insets with `viewport-fit=cover`, `overscroll-behavior:none` so pull-to-refresh cannot hijack a drag, `touch-action:manipulation` so double-tap zoom cannot eat a FIRE tap, and a 44 px minimum tap target on every control (the weapon picker was ~28 px).
- The header no longer overflows on narrow phones: the reset button collapses to `↻ New` below 520 px, keeping its full accessible label.
- The shop becomes a single scrollable column below 520 px with a sticky **DEPLOY**, instead of three ~110 px columns.

### Removed

- **Eight superseded documents retired.** `HANDOFF.md`, `DEVELOPERS.md`, `PLAN-torched-planet-launch.md`, `PLAN-progression.md`, `PLAN-settling-open-questions.md`, `PLAN-enemy-gauge-and-wind.md`, `PLAN-mobile.md` and `PLAN-weapons.md` are gone; every decision they held is in `PROJECT.md`, and §1 records which section absorbed which file. `PLAN-mobile.md` and `PLAN-weapons.md` never carried a `SUPERSEDED` banner, so the deletion record is now explicit rather than inferred.
- Documentation drift corrected while retiring them: `PROJECT.md` §1 said "six" files and quoted stale sizes (`game.js` ≈750 → 756, `index.html` ≈51 → 54, `style.css` ≈73 → 101), the top banner still told the reader to delete files, and `CHANGELOG.md` claimed "all four `PLAN-*.md` files" when there were six superseded ones. `tools/drive.js` now cites `PROJECT.md` §2 for the harness recipe instead of the deleted `HANDOFF.md` §6.
