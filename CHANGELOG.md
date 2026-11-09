# Changelog

All notable changes to this project are recorded here.

## [Unreleased]

### Added

- Endless progression: the level counter never stops climbing, destroying the CPU deploys a new target with a `$250 × level` bank bonus, and shot rewards scale 30% per level against 20% price scaling.
- Shift fine aim, single-keypress 1% power nudges, and a last-shot reference tick on the power meter.
- Terrain amplitude and rooftop heights swell with level.
- `DEVELOPERS.md`: a full technical architecture reference for new contributors — state model, phase machine, ballistics, terrain carving, economy, CPU search, input plumbing, DOM contract, house rules, six recipes, known limitations and a glossary.

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
