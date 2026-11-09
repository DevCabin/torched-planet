# Changelog

All notable changes to this project are recorded here.

## [Unreleased]

### Added

- Endless progression: the level counter never stops climbing, destroying the CPU deploys a new target with a `$250 × level` bank bonus, and shot rewards scale 30% per level against 20% price scaling.
- Shift fine aim, single-keypress 1% power nudges, and a last-shot reference tick on the power meter.
- Terrain amplitude and rooftop heights swell with level.
- `DEVELOPERS.md`: a full technical architecture reference for new contributors — state model, phase machine, ballistics, terrain carving, economy, CPU search, input plumbing, DOM contract, house rules, six recipes, known limitations and a glossary.

### Changed

- Power aim is no longer twitchy: the rate dropped from a fixed 48 points/second to a 5.6 → 16 points/second ramp over the first 0.65 s of a hold.
- HUD now reports LEVEL and BANK with the live reward multiplier, and the shop header shows the level.
- Renamed the game to **Torched Planet** (previously *Blastline*) across the browser tab title, the in-game header wordmark, and the README. The name carries the *Scorched Earth* homage used in the project description.
