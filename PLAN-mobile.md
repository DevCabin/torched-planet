# Plan — Mobile Playability (immersive landscape)

Written before execution per the Secret Lab Protocol (rule 2).

Dr Featherstone's direction: **the game is desktop-oriented and must be playable on mobile.**
Approved approach: **landscape-first immersive, CSS only, with a portrait rotate hint.**

---

## Diagnosis

Touch scaffolding already existed (`.touch`, joystick, `[data-hold]` drive buttons,
`pointer:coarse`), but it does not survive a real viewport.

**Landscape is broken.** `canvas{width:100%;height:auto}` makes canvas height a function of
width. On an 844 × 390 phone:

| Element | Height |
| --- | --- |
| header | ~83 px |
| HUD (5 cols) | ~62 px |
| fieldbar | ~32 px |
| **canvas** | **794 × 0.52 = 413 px** — already taller than the viewport |
| status + controls | ~237 px |
| **total** | **~827 px in a ~340 px viewport** |

Rotating to landscape means scrolling past 2½ screens; the battlefield scrolls out from under
your thumbs.

**Portrait is legible but tiny.** 390 wide → canvas 372 × 193. A tank is 34 canvas px →
**12.6 CSS px**.

Smaller faults: the header overflows (377 px of content into 374 px); `select` is ~28 px tall
and drive buttons 38 px (both under the 44 px tap minimum); `min-height:100vh` instead of
`100dvh`; no safe-area insets; no `overscroll-behavior` (pull-to-refresh can hijack a drag);
no `touch-action:manipulation` (double-tap zoom can eat a rapid FIRE); `.catalog` is
`repeat(3,…)` at every width; and the gauge's left edge lands ~286 px on a 320 px screen, so
the CPU's barrel can slide under it.

---

## Key decision — side rails, not corner overlays

The first sketch was to float the joystick bottom-left and FIRE bottom-right over the canvas.
Rejected: the tanks sit at x = 115 and x = 875, i.e. **exactly** under those corners. And in
phone landscape *height* is always the binding constraint, so chrome is paid for in battlefield
pixels:

| Control placement | Battlefield height on 844 × 390 |
| --- | --- |
| Controls as a bottom bar | ~176 px |
| **Controls as side rails** | **~286 px** |

So landscape becomes a three-column grid — rails for the thumbs, full-height battlefield in
the middle.

```
┌──────────────────────────────────────────────┐
│ HUD — one slim row                            │ ~26 px
├────────┬────────────────────────────┬────────┤
│ L  R   │                            │ WEAPON │
│        │       BATTLEFIELD          │ select │
│ joystick                            ├────────┤
│        │   (height-fitted canvas)   │  FIRE  │
├────────┴────────────────────────────┴────────┤
│ status — one line, 2-line clamp                │ ~24 px
└──────────────────────────────────────────────┘
```

**`display:contents` is the enabling trick:** it removes `.controls`'s own box so its four
existing children (`.touch`, `label`, `.fire`) become grid items in three different areas.
No DOM restructuring, no JavaScript.

---

## Files

| File | Change |
| --- | --- |
| `index.html` | `.stage` wrapper around canvas + gauge; `.rotate` hint; header button shortened to `↻ New` (it overflows today) |
| `style.css` | The whole job: base hardening, immersive landscape block, portrait tuning, shop list |
| `game.js` | **Untouched** — the canvas keeps its 1000×520 backing store and is only CSS-scaled, so every coordinate, collision test, the CPU search and all tuned numbers are unchanged |
| `tools/drive.js` | Untouched |
| `PROJECT.md` | New "Mobile & layout" section recording the grid and the side-rail reasoning |
| `CHANGELOG.md` | Added / Changed entries |

**Why `.stage`:** the gauge is absolutely positioned. Inside a stretched flex cell it would
drift into the letterbox gutter when the viewport aspect mismatches 1000:520. A
`.stage{position:relative}` wrapper that hugs the canvas keeps the gauge glued to the
battlefield edge.

---

## Steps

1. `index.html`: `.stage` wrapper, `.rotate` hint, shorter header button + `aria-label`.
2. `style.css` base layer: `min-height:100dvh`, `overscroll-behavior:none`, safe-area padding,
   `touch-action:manipulation` on `button, select`, 44 px minimums, `viewport-fit=cover` in the
   meta tag.
3. Immersive landscape block:
   `@media (orientation:landscape) and (max-height:560px)` — grid areas
   `"hud hud hud" / "left field right1" / "left field right2" / "status status status"`,
   `header{display:none}`, `controls{display:contents}`, `canvas{object-fit:contain}`.
4. Portrait tuning: `.hud` → `repeat(3,…)`, camera-ready 44 px targets, gauge inset at ≤380 px,
   `.rotate` visible only on `(pointer:coarse) and (orientation:portrait)`.
5. Shop: `.catalog{grid-template-columns:1fr}` at ≤520 px, scrollable, sticky **DEPLOY**.
6. Verify, then docs.

## Verification

1. `node --check game.js` — must be a no-op. That is the proof no logic moved.
2. Harness at `--window-size=390,844` and `844,390` — no JS errors under a narrow viewport.
3. `--screenshot` at 390 × 844, 844 × 390 and 320 × 568 for a visual artifact of each layout.
4. Real handset, both orientations, safe area on the wrong side.
5. Device-verify by eye: gauge anchoring in the landscape gutter, and `-webkit-line-clamp`
   on `.status`.

## Rollback

One commit, CSS + markup only. `git revert` restores the desktop layout; nothing in `game.js`
is touched, so a rollback cannot affect gameplay.
