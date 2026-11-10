# Plan — Player Power Gauge and Fullscreen

Written before execution per the Secret Lab Protocol (rule 2).

Dr Featherstone's request: **"add a power meter on my side as well, and lets add the option to play
the game full screen."**

---

## 1. The power gauge ("on my side")

The battlefield already has an **enemy gauge** down the right edge (§15): shield HP plus a red band
showing what the loaded weapon would strip. "On my side" therefore means the **left edge**, mirroring
it. The reading implemented is **shot power**, because that is the thing the player tunes and the one
number the HUD shows only as a thin horizontal bar in a five-cell row — the enemy's bar answers "how
much punishment is left", yours answers "how hard am I about to hit".

- Markup inside `.stage`, mirroring `.gauge`: value, track, and a **last-shot mark**.
- `updateHud()` stays the only writer: `#power-gauge` (number), `#power-fill` (`--level`),
  `#power-mark` (`--at`, the same `lastPower` the HUD tick uses).
- CSS reuses `.gauge` with a `.mine` modifier (`left` instead of `right`), so there is one set of
  gauge rules and both bars scale together at every breakpoint.
- Kept clear of the tanks: the player sits at x = 115 of 1000, the bar occupies the first ~4 %.

**If the intent was a mirror of the *shield* bar instead, it is a colour/label swap** — recorded here
so the decision is revisitable without re-deriving it.

## 2. Fullscreen

- `document.documentElement.requestFullscreen()` / `exitFullscreen()`, with the vendor fallback.
- **Two buttons, one handler**, because the header is hidden by the landscape immersive layout and
  that is exactly where a phone needs fullscreen most:
  - `#fullscreen` in the header (desktop, portrait),
  - `#fullscreen-rail` in the `.controls` block, shown **only** in the immersive query at
    `grid-area:right1`, top-aligned above the existing bottom-aligned weapon picker — no new grid
    row, no new area.
- Both are removed from the DOM when the browser has no Fullscreen API (`fullscreenEnabled` false —
  iOS Safari), rather than being shown dead.
- `fullscreenchange` keeps `aria-pressed` / `aria-label` in sync; the glyph stays constant.
- Requests are wrapped so a rejection (e.g. no user gesture, or headless) can never throw into the
  frame loop.

## Steps

1. This file.
2. `index.html` — the gauge aside, the header button, the rail button.
3. `style.css` — `.gauge.mine`, `.mark`, `.head-actions`, `.rail-only` (hidden except in landscape),
   `[aria-pressed]` state, narrow-screen label collapse.
4. `game.js` — three `updateHud()` writes; `toggleFullscreen()` + `syncFullscreen()` + capability
   gate + listeners.
5. `tools/drive.js` — the gauge mirrors power and the last-shot mark; the fullscreen control exists
   exactly when the platform supports it; toggling never throws.
6. Docs: `PROJECT.md` §15 (contract rows + gauge section), §18 decision log, `README.md` controls,
   `CHANGELOG`.
7. Verify: `node --check`, harness ×3 then ×3 against the deploy, screenshots desktop + landscape +
   portrait, commit, push.

## Verification

| Check | Method |
| --- | --- |
| Gauge tracks power and the last-shot mark | harness |
| Fullscreen control matches platform support | harness |
| Toggling cannot throw | harness |
| Both bars readable, nothing overlapping a tank or a rail | screenshots, 3 layouts |
| Nothing regressed | 45 existing checks ×3, then ×3 live |
