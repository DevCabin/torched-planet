# Plan — Documentation Housekeeping, then First Public Deploy

Written before execution per the Secret Lab Protocol (rule 2).

Dr Featherstone's direction: **A then B** — retire the superseded docs and fix the drift, then
deploy to Vercel production and record the live URL.

Baseline before any change (verified this session):

- `main` at `89650f3`, working tree clean, level with `origin/main`.
- `node --check game.js` clean; harness green — 14/14 checks, `"errors":[]`.
- `vercel` 49.2.0 installed; `gh` authenticated as `DevCabin`.

---

## Part A — Housekeeping (docs only, no gameplay change)

### The problem

`PROJECT.md` §1 says consolidating the docs left **six** files behind and that root will then
hold *exactly* the source files. Reality:

| File | Banner | Status |
| --- | --- | --- |
| `HANDOFF.md` | SUPERSEDED | absorbed into `PROJECT.md` |
| `DEVELOPERS.md` | SUPERSEDED | absorbed into `PROJECT.md` |
| `PLAN-torched-planet-launch.md` | SUPERSEDED | absorbed into `PROJECT.md` §18/§21 |
| `PLAN-progression.md` | SUPERSEDED | absorbed into `PROJECT.md` §18 |
| `PLAN-settling-open-questions.md` | SUPERSEDED | absorbed into `PROJECT.md` §18 |
| `PLAN-enemy-gauge-and-wind.md` | SUPERSEDED | absorbed into `PROJECT.md` §8/§14/§15/§18 |
| `PLAN-mobile.md` | **none** | shipped in `89650f3`, not yet flagged |
| `PLAN-weapons.md` | **none** | shipped in `89650f3`, not yet flagged |

Further drift:

- `CHANGELOG.md` says "all four `PLAN-*.md` files" — there are eight.
- `PROJECT.md` §1 sizes are stale: `game.js` ≈750 → **756**, `index.html` ≈51 → **54**,
  `style.css` ≈73 → **101** (style.css grew with the mobile grid).
- `tools/drive.js` line 3 cites `HANDOFF.md §6` for the harness recipe; that section now lives in
  `PROJECT.md` §2.

### Steps

1. Add a `SUPERSEDED` banner to `PLAN-mobile.md` and `PLAN-weapons.md` pointing at the `PROJECT.md`
   sections that absorbed them, so the deletion is explained in git history.
2. `git rm` all eight files in one command.
3. `PROJECT.md` §1: six → eight, set the deletion command, correct the "root holds exactly" list,
   refresh the three size figures, and close the "superseded files to delete" subsection.
4. `PROJECT.md` top banner: "six superseded files" → eight, and drop the delete instruction once
   done.
5. `CHANGELOG.md`: correct the "all four `PLAN-*.md`" sentence; add `[Unreleased]` entries.
6. `tools/drive.js`: retarget the comment from `HANDOFF.md §6` to `PROJECT.md §2`.
7. Grep for surviving references to any deleted file name across the whole repo.

### Verification

- `node --check game.js`; harness must stay 14/14 green (a comment edit must not disturb it).
- `grep -rn 'HANDOFF.md\|DEVELOPERS.md\|PLAN-' --include='*.md' --include='*.js' .` returns only
  historical `CHANGELOG.md` mentions and this plan file.
- Root listing matches the list documented in `PROJECT.md` §1.

### Rollback

`git revert` the housekeeping commit — no code path changes, so the game is unaffected either way.

---

## Part B — First public deploy

1. `vercel link --yes --project torched-planet`, then `vercel --prod --yes`.
2. Verify with `curl -sI` (expect 200) and `curl -s` for the `TORCHED PLANET` wordmark plus a 200
   on `/game.js` — a static host returning HTML for a missing JS file is the classic blank-page
   trap from `PROJECT.md` §20.5.
3. Record the URL in `README.md` (a Live row), `CHANGELOG.md`, `PROJECT.md` §1 status row, and mark
   `PROJECT.md` §21 item 2 complete.
4. `gh repo edit DevCabin/torched-planet --homepage <url>`.
5. Commit + push; then retire this plan file, since both parts are recorded in `PROJECT.md` §21 and
   the `CHANGELOG`.

### Verification

Live URL returns 200, serves the game, and `game.js` is fetchable. Hard-refresh advice already
documented in `PROJECT.md` §0.
