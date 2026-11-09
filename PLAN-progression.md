> **SUPERSEDED — the decisions are recorded in [PROJECT.md](PROJECT.md) §18. Completed work;
> keep only for git history.** Delete it: `rm PLAN-progression.md`.

# Plan — Torched Planet: Endless Progression + Power Feel

Written before execution per the Secret Lab Protocol (rule 2). Approved direction from
Dr Featherstone: **endless progression** — `round` doubles as the level counter and
scales forever; CPU difficulty and rewards climb with it; destroying the CPU deploys a
new target instead of ending the run; the bank carries forward indefinitely.

## Problem 1 — power control is too sensitive

`game.js:384` integrates power at `dt * 48` (full 0–100 sweep in ~2.1 s). Because range
scales with the square of muzzle speed (`launch()`, `game.js:218`), one power point is
worth several pixels of impact drift. Fix in three layers:

- base rate 48/s → **16/s**
- ramp-in: `.35 → 1.0` multiplier over the first 0.65 s of a hold, so taps are precise
  and holds still travel
- **Shift** = quarter speed fine aim; a single non-repeat keypress nudges exactly 1 point
- last shot's power stamped on the power meter as a reference tick

## Problem 2 — no progression, no growing bank

`reset()` zeroed everything and the first kill ended the match permanently.

- `progression` config object holds every dial in one place
  (`reward`, `price`, `skill`, `flub`, `spread`, `cpuShield`, `cpuCash`, `waveBonus`).
- Rewards ×`1 + .30(level-1)`; shop prices ×`1 + .20(level-1)` — rewards outpace prices so
  the bank visibly swells.
- Wave bonus `$250 × level` on each CPU destroyed.
- CPU aim error `max(42, 150 - 18×level)`; CPU starts with `min(5, level-1)` shield HP and
  `40 + 45(level-1)` shopping allowance (level 1 ≈ present behaviour).
- Terrain amplitude and building heights swell mildly with level.
- Player keeps shield HP and ammo between levels; fuel refills to 100.
- Player death (or a draw) ends the run and reports level reached + banked total.

## Files

- `game.js` — progression config, `priceOf`, `reward`, `purchase`/`canBuy`, `updateShop`,
  `updateHud`, `aimBot`, `update` (power), `nudge`, `finishShot`, `nextWave`, `reset`,
  `openShop`, `makeMap`
- `index.html` — `BANK` cell + reward multiplier, power meter tick wrapper, no layout change
- `style.css` — ghost tick styling only
- `README.md` — controls (Shift, tap nudge) and endless rules
- `CHANGELOG.md` — entries

## Verification

- `node --check game.js`
- serve locally, confirm 200s and that the FIELD BAR reads `LEVEL 01`
- play path by inspection: power ramps from 5.6/s to 16/s, Shift quarters it
- after a CPU kill the level increments, bonus is added, new map + new CPU spawn
- player death shows level reached and banked total
