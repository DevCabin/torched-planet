> **SUPERSEDED — the gauge and wind designs are recorded in [PROJECT.md](PROJECT.md) §8, §14,
> §15 and §18.** Delete it: `rm PLAN-enemy-gauge-and-wind.md`.

# Plan — Enemy Shield Gauge + Mild Wind

Written before execution per the Secret Lab Protocol (rule 2). Two features requested by
Dr Featherstone in one pass:

1. a vertical bar on the **right edge of the battlefield** showing the **enemy's shield
   strength** and the **hit strength** of the loaded weapon;
2. a **mild wind**, rolled at level start, announced on screen with direction and strength,
   that bends every shell.

## Blocker at time of writing

The VS Code window is still pointed at `/Users/george/GITHUB/torched-earth`, which does not
exist, so **every shell command fails** (*"The terminal's shell process has exited"*). I can
read and write files but **cannot** run `node --check`, the `tools/drive.js` harness, or
`git commit`/`push`. Everything below is therefore **unverified and local-only** until the
window is reopened at `/Users/george/GITHUB/torched-planet` (`HANDOFF.md` §0 — do **not**
recreate the old folder).

---

## Feature 1 — Enemy shield gauge (right edge)

### Decision: DOM overlay, not canvas painting

`draw()` is a pure function of state and must stay that way; an overlay drawn inside `draw()`
would also cover the battlefield pixels at x ≈ 960–1000 where terrain and the CPU's own
position live. The gauge is an **absolutely positioned DOM panel** inside a new
`.board` wrapper, so it gets real text (accessible to `role`/`aria`) and obeys the existing
house rule: **`updateHud()` is the only HUD writer**.

Markup goes inside `<div class="board">`, which wraps the canvas, so the gauge is positioned
against the canvas box exactly — no fiddling with the field-bar height across breakpoints.

### What it shows

| Element | Meaning | Source |
| --- | --- | --- |
| `#gauge-hp` | Shield HP, `0`…`5` | `tanks[1].hp` |
| `#gauge-fill` | Lime column filled to `hp / 5` | `--level` custom property |
| `#gauge-threat` | Red hatched band sitting **on top of** the fill, height = damage the loaded weapon would strip | `weapons[selected].damage` |
| `#gauge-hit` | The damage number, or `—` while the CPU is down | `weapons[selected].damage` |

Scale is **0–5**, matching `progression.cpuShield`'s ceiling and the existing
`shield-meter max="5"` — one number, one meaning. The threat band is clamped to the shield
(`min(damage, hp)`), so a Nuke against a 1 HP shield reads as "the whole bar goes", not as an
overflowing bar.

`pointer-events: none` so the gauge can never eat a tap meant for the joystick or canvas.

### Golden path check

At level 1 the CPU has `cpuShield(1) === 0` → empty bar, `0`, threat band absent. Buy
nothing, fire a Basic: `-1` still shows, so the player learns "1 damage, no shield to take
it" before shields ever appear at level 2.

---

## Feature 2 — Mild wind

### Model

One new physics term, `wind` (px/s², signed; **+ pushes shells right**), integrated in
`advance()`:

```js
vy += GRAVITY * step
vx += wind * step        // ← new
x  += vx * step
```

`advance()` is the same function the CPU's search uses, so **the CPU feels the wind too** —
it does not need a separate correction and its `spread`/`flub` curve keeps its meaning. This
is the whole reason to put the term there rather than in `launch()`.

### Magnitude — the "mild" requirement, quantified

`WIND_MAX = 14` px/s². Drift is `½·a·t²`:

| Shot | Flight time | Drift at full wind |
| --- | --- | --- |
| Typical (power 63, 53°) | ≈ 2.95 s | ≈ 61 px — about one blast radius |
| Longest (power 100, 45°) | ≈ 3.79 s | ≈ 100 px — a tenth of the map |

Enough to force a compensating shot, never enough to make skill irrelevant. Tunable in one
place, beside `GRAVITY`.

### Rolling and announcing

- `rollWind()` sets `wind = Math.round((Math.random() * 2 - 1) * WIND_MAX)`, so the wind is
  an **integer** and `0` is reachable — calm duels happen.
- Called from **`reset()`** and **`nextLevel()`**, immediately after `makeMap()`: exactly
  once per duel, both entry points, explicitly greppable. Not hidden inside `makeMap()`,
  which is terrain's job.
- Shown in the field bar (top of the battlefield, next to `LEVEL`/`ROUND`):
  `WIND ◀ 7`, `WIND ▶ 12`, `WIND · CALM`. Written by `updateHud()` so it can never go stale.
- The 4th field-bar item can wrap on narrow screens — `.fieldbar` gets `flex-wrap: wrap` in
  the ≤520 px breakpoint only.

---

## Files

| File | Change |
| --- | --- |
| `index.html` | `.board` wrapper, `.gauge` overlay markup, `#wind` in the field bar |
| `style.css` | `.board`, `.gauge`, `.gauge-track` fill/threat, field-bar wrap at ≤520 px |
| `game.js` | `WIND_MAX`, `SHIELD_MAX`, `wind` state, `rollWind()`, wind term in `advance()`, calls in `reset()`/`nextLevel()`, gauge + wind writes in `updateHud()` |
| `tools/drive.js` | two new assertions: wind is announced and within `WIND_MAX`; gauge mirrors `tanks[1].hp` |
| `README.md` | Rules: wind, and reading the enemy gauge |
| `CHANGELOG.md` | two `Added` entries |
| `DEVELOPERS.md` | §4 state row, §7 integral + constants, §14 DOM contract rows, glossary |

## Verification

1. `node --check game.js`.
2. `HANDOFF.md` §6 harness — expect `"errors":[]` and all `"pass":true`, including
   *"wind is announced and mild"* and *"enemy gauge mirrors shield HP"*.
3. By hand, one duel: the field bar shows a wind value that does not change mid-duel; a full
   power shot downwind lands visibly further than the same shot upwind; the right-hand bar
   empties as the CPU's shield absorbs hits.

## Rollback

One commit; `git revert` removes both features. No persisted state, no migration.
