# Plan — Replace the Mobile Joystick with Buttons (split thumbs)

Written before execution per the Secret Lab Protocol (rule 2). Approved by Dr Featherstone after
plan-mode review; his ruling was **option C — split thumbs**: aim and power buttons on the left,
drive L/R moved to the right rail beside FIRE.

---

## What the joystick was

One 102 px circle doing **four** jobs — aim ◀ ▶ and power ▲ ▼ — through `stickX` / `stickY`, which
`update()` subtracted from the keyboard contribution. It was also the only touch route to fine aim.

## Why buttons are cheap

`[data-hold]` buttons already exist: they write `held.set(pointerId, logicalKey)` and `update()`
samples `held` **by logical key**. Four buttons carrying `data-hold="arrowleft|arrowright|arrowup|
arrowdown"` therefore feed the same path the keyboard uses. No new state; `update()` gets *simpler*
(both subtraction terms go), and touch behaviour matches keyboard behaviour by construction.

## Steps

1. **`index.html`** — replace the `.joystick` div with a `.pad` of four buttons. Keep the `.drive`
   pair *inside* `.touch` so portrait still stacks the two clusters.
2. **`style.css`**
   - Base touch block: drop the five `.joystick` rules, add `.pad{grid-template-columns:repeat(2,44px)}`,
     a `:active` flash, and keep the 44 px minimum target.
   - Landscape: `main` gains a fifth row (`right3`) and the areas string repeats `left field` so the
     field spans three rows. `.touch{display:contents}` so `.pad` and `.drive` can claim separate
     grid areas; `.pad`→left, `.drive`→right2, weapon select→right1 (bottom-aligned), FIRE→right3.
   - Rail order bottom-up: **FIRE → L R → weapon picker**, so the resting thumb stays on FIRE and
     driving is isolated from it. A horizontal `[L][R][FIRE]` row was rejected: +58 px of rail width
     and an irreversible action (fuel) touching the fire button.
3. **`game.js`** — delete `joystick`, `stickPointer`, `stickX`, `stickY`, `moveStick()`, the three
   joystick listener blocks, the stick resets in `clearControls()`, the `--stick-x/y` writes and the
   two `- stickX` / `- stickY` terms. Extend `nudge()` to ±1° of angle, and call `nudge(key)` from the
   `[data-hold]` pointerdown handler so **a tap is exactly 1 % / 1° and a hold ramps or sweeps**.
   Guard `setPointerCapture` with `try/catch` (a released pointer can throw, and synthetic events in
   the harness cannot be captured).
4. **`tools/drive.js`** — assertions: six hold buttons with the expected keys, `#joystick` gone, a tap
   on ▲ steps power by exactly 1 %, a tap on ◀ steps angle by exactly 1°, a held button sweeps.
5. **Docs** — `README.md` controls table; `PROJECT.md` §5 (`stickX`/`stickY` rows out), §13 (input
   diagram, joystick bullets, the `getBoundingClientRect` sentence), §15 (rail rationale, gauge
   `pointer-events` note, the "tanks sit under a joystick" line); `CHANGELOG.md`.

## Known regression, stated openly

The joystick could change angle *and* power in one diagonal drag. Separate pairs cannot — you
alternate. In exchange, touch gains exact 1 % / 1° steps, which the joystick never had. Fine aim is
dropped on touch rather than adding a seventh button; desktop Shift is untouched.

## Verification

| Check | Method |
| --- | --- |
| Syntax | `node --check game.js` |
| Six hold buttons, correct keys, `#joystick` gone | harness |
| Tap = 1 % power / 1° angle; hold sweeps | harness |
| All existing checks still green | harness ×3 (randomness), then ×3 against the deployed build |
| Rails, tap targets ≥44 px, no gauge collision | screenshots at 844×390 **and** 390×844 |

**Verification caveat:** `@media (pointer:coarse)` does not match in headless Chrome, so a landscape
screenshot renders the desktop layout. First try `--blink-settings=primaryPointerType=…` and probe
`matchMedia('(pointer: coarse)')`; if it will not flip, screenshot a throwaway copy of the CSS with
that condition stripped, verify geometry there, and record the trigger as unverified by the harness.

## Retire

Fold the decisions into `PROJECT.md` §13/§18 and the `CHANGELOG`, then delete this file.
