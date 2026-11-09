# HANDOFF.md

Pick-up notes for the next session. Read this first, then `DEVELOPERS.md` for the
architecture and `CHANGELOG.md` for history.

---

## 0. Session start — get the folder right first

The project lives at **`/Users/george/GITHUB/torched-planet`**. That is the only copy.
Do not create, rename, or recreate any other path for it.

Open exactly that folder:

```bash
code /Users/george/GITHUB/torched-planet
```

Then confirm the terminal is healthy before doing anything else:

```bash
pwd     # must print /Users/george/GITHUB/torched-planet
git status
```

If `pwd` prints a different path — or the shell spits `getcwd: cannot access parent
directories` and commands fail with *"The terminal's shell process has exited"* — the
VS Code window is stale and pointing at a folder that no longer exists. **Fix the
window, not the filesystem:** close it and reopen the project with the command above
(or File → Open Folder). Do not recreate the old directory to appease the shell; that
leaves phantom paths behind and caused a whole detour last session.

Fallback if a shell is briefly broken: every git command works from anywhere with an
explicit path, e.g.

```bash
git -C /Users/george/GITHUB/torched-planet status -sb
```

and absolute paths work for everything else (`node --check /Users/.../game.js`). Avoid
`cd` in that case, since the shell's working directory is the broken part.

---

## 1. Where things stand

| | |
| --- | --- |
| Repo | `github.com/DevCabin/torched-planet` (public), branch `main` |
| HEAD | `0199efa` — *Levels count duels not turns; fix self-hit and loss label* |
| Working tree | clean, in sync with `origin/main` |
| Stack | vanilla JS + canvas. No dependencies, no build, no assets |
| Size | `game.js` 727 lines · `index.html` 44 · `style.css` 63 |
| Live URL | **none yet** — Vercel deploy is still outstanding (§5.3) |

Play it locally:

```bash
open /Users/george/GITHUB/torched-planet/index.html
# or
python3 -m http.server 8000     # from the project folder, then http://localhost:8000
```

Hard-refresh (`Cmd+Shift+R`) when a tab might be holding an older `game.js` — a blank
page is nearly always a cached or broken script, not a server problem.

---

## 2. What shipped this session

| Commit | What changed |
| --- | --- |
| `1a9d8fd` | First commit: Blastline renamed to Torched Planet, endless progression, calmer power control |
| `f014a65` | `DEVELOPERS.md` — full architecture reference for newcomers |
| `1289e90` | Fixed startup crash: `reset()` built tanks before the map existed |
| `72223e5` | Removed a stale folder reference from the launch plan |
| `3ced822` | CPU skill curve: sloppy at level 1, lethal by level 8 |
| `0199efa` | Levels now count duels not turns; fixed self-hit and the loss label |

---

## 3. Decisions locked in (don't undo these casually)

| Decision | Rationale |
| --- | --- |
| **Level = duel, round = turn cycle** | A level advances only when a tank is destroyed — either side. `finishShot()` calls `nextLevel()`; ordinary cycles only bump `round`. |
| **Both outcomes advance the level** | Direct instruction ("after *one of us* is destroyed"). The player is revived with bank and ammo intact. There is no game-over state. |
| **Duel bonus only on a win** | `$250 × level`. Losing still levels you up, just without income. Easy to change — see §4.1. |
| **CPU skill is a curve, not one jitter** | `progression.skill/flub/spread`. Level 1 lands ~14% of shots and fires Basic only; level 8 is near-perfect. Measured table is in `DEVELOPERS.md` §11. |
| **Power control ramps** | 16%/s base, `.35 → 1.0` over 0.65 s, Shift quarters it, a tap is exactly 1%. The old flat 48%/s was the "too twitchy" complaint. |
| **`collision()` skips the shooter** | Otherwise a minimum-power shell detonates on your own hull before it clears the 24 px radius. Splash from your own blast can still cost shield HP. |

All tunables sit in `progression` (`game.js`, near the top) and the power integrator in
`update()`. Nothing else needs editing to retune difficulty.

---

## 4. Open questions for Dr Featherstone

1. **Lost duel:** pay a consolation bonus, or end the run? Right now a loss pays nothing
   and play continues. Change is in `nextLevel()` (`const bonus = won ? ... : 0`).
2. **`ROUND` in the HUD:** `LEVEL 02 · ROUND 17` reads oddly because rounds never reset.
   Either reset `round` on each level, or drop it from `updateHud()` and show level only.
3. **Top-end difficulty:** level 8 hits ~100% of the time. If that feels unfair, change
   `skill: level => Math.min(1, (level - 1) / 7)` to `/ 10` and it ceilings at level 11.

---

## 5. Next steps, in order

1. **Playtest the duel model.** Highest value by far — nobody has played this build yet.
   Get to about level 5 and judge: is level 1 fair? Is `LEVEL 02 · ROUND 17` confusing?
   Only `progression` should need touching.
2. **Settle the three open questions in §4.** Small edits, big clarity win.
3. **Deploy to Vercel** — the last unchecked steps of `PLAN-torched-planet-launch.md`.
   `vercel.json` is already correct (static, `framework: null`, `outputDirectory: "."`),
   and the CLI is logged in as `devcabin` under the `devcabins-projects` team.

   ```bash
   vercel link --yes --project torched-planet
   vercel --prod
   ```

   Or import `DevCabin/torched-planet` in the dashboard for push-to-deploy. Then record
   the URL in `README.md`, in the CHANGELOG, and on the repo:

   ```bash
   gh repo edit DevCabin/torched-planet --homepage https://torched-planet.vercel.app
   ```
4. **Persist the best level** — `localStorage`, no storage layer exists yet. Recipe is in
   `DEVELOPERS.md` §17 ("Persist a best level").
5. **Polish backlog** (pick, don't batch): DPR-scale the canvas (it's soft on retina),
   sound, CPU remembering your last position, and ticking or archiving the stale
   checkboxes in the two `PLAN-*.md` files.

---

## 6. Verification recipe — run this before every push

```bash
cd /Users/george/GITHUB/torched-planet

# 1. syntax (catches parse errors only — not ordering bugs)
node --check game.js

# 2. behaviour, in a real browser, headless
cat index.html | sed 's#</body>#<script src="tools/drive.js"></script></body>#' > harness.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-sandbox --user-data-dir=/tmp/tp-harness --virtual-time-budget=9000 \
  --dump-dom "file:///Users/george/GITHUB/torched-planet/harness.html" 2>/dev/null | grep -o 'RESULT:.*'
rm harness.html

# 3. ship
git add -A && git commit -m "Clear, small message" && git push
```

Green looks like every entry `"pass":true` and `"errors":[]` at the end of the RESULT
line. The harness is generated from the real `index.html` (so it can't drift) and is
gitignored; `tools/drive.js` is the committed driver.

**Why a harness and not just clicks:** `requestAnimationFrame` does not advance under
`--virtual-time-budget`, so the driver calls `update(1/120)` in a loop instead. That makes
the test deterministic and fast — it caught a startup crash, a self-kill and a wrong
outcome label this session that no amount of reading the code would have found.

---

## 7. Traps that already cost time — don't repeat them

1. **`reset()` must call `makeMap()` before `makeTank()`.** Tanks read `support()` at
   construction, which reads `terrain`. Get the order wrong and the page silently dies at
   load with an empty HUD (`Cannot read properties of undefined`). `node --check` will not
   catch it.
2. **Don't batch `commit` and `push` as separate commands.** Batched shell calls can run
   concurrently; the push raced the commit and failed with *"src refspec main does not
   match any"*. Chain them: `git add -A && git commit -m "…" && git push`.
3. **`updateHud()` is the only HUD writer.** After any ammo change call `updateWeapons()`;
   after a phase change call `clearControls()`, or a stuck key keeps turning the turret.
4. **zsh expands globs in flags.** Write `--include='*.md'`, not `--include=*.md`.
5. **A blank page is a script error, not a hosting problem.** Open DevTools; the console
   names the line. Then hard-refresh, because `game.js` caches aggressively.

---

## 8. Working agreement

From `cline_instructions.md`, still in force:

- Multi-step work gets a `PLAN-*.md` on disk **before** implementation.
- After meaningful edits: commit with a small clear message and push — never leave work
  only on this machine.
- `CHANGELOG.md` gets an entry for anything significant.
- Keep user-facing updates short.


