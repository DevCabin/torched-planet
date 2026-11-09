> **SUPERSEDED — the three rulings and their reasoning are recorded in
> [PROJECT.md](PROJECT.md) §18.** Delete it: `rm PLAN-settling-open-questions.md`.

# Plan — Settling the Three Open Questions (HANDOFF §4)

Written before execution per the Secret Lab Protocol (rule 2), so this sequence survives
an interrupted session.

## Context

`HANDOFF.md` §4 left three design questions open for Dr Featherstone. Direction received:
**settle all three.** Each has a default recommendation recorded in the handoff; this plan
turns them into decisions, implements them, and keeps the docs honest.

## Decisions

### 1. A lost duel pays salvage

**Decision:** pay `$60 × level` salvage on a loss. Keep the no-game-over model intact.

**Why not end the run:** §3 of the handoff locks "both outcomes advance the level" and
"there is no game-over state" — that was a direct instruction. Ending the run on a loss
would contradict it. So the real question was only *how much* a loss is worth, and a
literal `$0` makes a lost duel feel like a wasted level.

**Why `$60 × level`:** 24% of the `$250 × level` win bonus. Winning stays a 4:1 decision
(the CPU's wallet discipline and shield purchase are unaffected), but a loss still buys
roughly a medium shield, so the player is not dead-broke when the next duel starts. Both
payouts use the level *after* the increment, exactly as the old bonus did.

**Files:** `game.js` — `progression.salvage`, `nextLevel()`.

### 2. `ROUND` counts rounds within the duel, and resets

**Decision:** keep `ROUND` in the HUD, but reset it to `ROUND 01` in `nextLevel()`.

**Why reset instead of delete:** `LEVEL 02 · ROUND 17` read oddly only because the number
never reset — the field itself is useful (it tells you how long a duel has run). Deleting
it would also break the driver's contract: `tools/drive.js` parses
`$('turn').textContent.split(' · ')` into level and round and asserts *"a turn cycle bumps
ROUND only"*. Resetting keeps that assertion meaningful and needs no test rewrite, whereas
removing the field would force one.

**Files:** `game.js` — `nextLevel()`. Behaviour note: the CPU's `round % 2` repositioning
alternates per duel rather than globally — deliberate, and harmless.

### 3. Difficulty ceiling moves from level 8 to level 11

**Decision:** `skill: level => Math.min(1, (level - 1) / 10)`.

**Why:** at `/7` the CPU reaches 100% accuracy at level 8, which the handoff flags as
possibly unfair. `/10` reaches the ceiling at level 11 and stretches the whole curve.
Level 1 is untouched — `skill(1) === 0` under both divisors, so the friendly opening
(≈14% hit rate) and the README's headline number stay true.

**Consequence that must be documented:** every sampled figure in `DEVELOPERS.md` §11 was
measured on the `/7` curve, and **I cannot re-measure them** (see the blocker below). The
table is kept, relabelled as sampled on the older curve, and given the exact mapping
`old level ≈ 1 + 0.7 × (new level − 1)` so the shape stays checkable without inventing
numbers.

## Blocker at time of writing — verification is limited

The VS Code window is pointed at `/Users/george/GITHUB/torched-earth`, which does not
exist, so **every shell command fails** with *"The terminal's shell process has exited"*
(see `HANDOFF.md` §0). Consequence:

- **Cannot run** `node --check game.js` or the `tools/drive.js` harness.
- **Cannot** `git commit` / `git push`.
- Edits are therefore **local-only until the window is reopened** at
  `/Users/george/GITHUB/torched-planet`. Rule 1 of the protocol is outstanding, not waived.

Recovery: `code /Users/george/GITHUB/torched-planet`, then run §6 of the handoff. **Do not
recreate `torched-earth`.**

## Files

| File | Change |
| --- | --- |
| `game.js` | `progression.salvage`, `skill` divisor `/10`, `nextLevel()` salvage + `round = 1` |
| `tools/drive.js` | new assertion: a new duel resets `ROUND` to 01 |
| `README.md` | loss pays salvage; accuracy ceiling level 8 → 11 |
| `CHANGELOG.md` | three entries under `[Unreleased] → Changed` |
| `DEVELOPERS.md` | `progression` block, level-flow paragraph, §11 curve note, glossary, two stale `(round)` → `(level)` |
| `HANDOFF.md` | §1 tree state, §3 locked decisions, §4 questions resolved |

## Verification

1. `node --check game.js` — parse errors only.
2. `HANDOFF.md` §6 harness — expect `"errors":[]` and every `"pass":true`, including the
   new *"a new duel resets ROUND"* check.
3. By inspection: a win at level 1 pays `$500` (`250 × 2`); a loss pays `$120` (`60 × 2`).
4. Play one duel: the HUD must read `LEVEL 02 · ROUND 01` at the start of the new level.

## Rollback

Single commit. `git revert` restores all three behaviours; nothing is destructive and no
saved state exists to migrate.
