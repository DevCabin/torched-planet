# PROJECT.md — Torched Planet

> **The one definitive document.** It supersedes `HANDOFF.md`, `DEVELOPERS.md` and every
> `PLAN-*.md`. Player-facing material lives in `README.md`, history in `CHANGELOG.md`, and the
> AI working protocol in `cline_instructions.md`. If you read only one file to get up to
> speed, read this one.
>
> Last consolidated: 2026-11-09. **If any of those six superseded files are still on disk,
> delete them** — see §1.

---

## 0. Start here — the folder trap

The project lives at **`/Users/george/GITHUB/torched-planet`**. That is the only copy.

```bash
code /Users/george/GITHUB/torched-planet
pwd      # must print /Users/george/GITHUB/torched-planet
git status
```

If `pwd` prints anything else — or commands fail with *"The terminal's shell process has
exited"* — the VS Code window is stale and pointing at a folder that no longer exists.
**Fix the window, not the filesystem:** close it and reopen the project. Do not recreate the
old directory to appease the shell; that leaves phantom paths behind.

*This has now burned three separate sessions. It is the most expensive recurring problem in
the project's history.*

Two workarounds while a shell is briefly broken: git works from anywhere with an explicit
path (`git -C /Users/george/GITHUB/torched-planet status -sb`), and so does everything else
(`node --check /Users/.../game.js`). Avoid `cd` in that case — the shell's working directory
is the broken part.

---

## 1. Status at a glance

| | |
| --- | --- |
| Repo | `github.com/DevCabin/torched-planet` (public), branch `main` |
| Stack | vanilla JS + canvas. No dependencies, no build step, no assets |
| Size | `game.js` ≈750 lines · `index.html` ≈51 · `style.css` ≈73 |
| Live URL | **none yet** — the Vercel deploy is the last unfinished launch step (§21) |
| Play locally | `open index.html` — that is a complete dev environment |

**Always check the working tree before trusting this file.** If `git status` is dirty, read
`CHANGELOG.md` → `[Unreleased]` first: that section describes work that exists on disk but
may never have been verified, committed, or pushed. A dirty tree is the normal state during a
session and an emergency after one.

Play it:

```bash
open /Users/george/GITHUB/torched-planet/index.html
# or
python3 -m http.server 8000      # from the project folder, then http://localhost:8000
```

**A blank page is a script error, not a hosting problem.** Open DevTools; the console names the
line. Then hard-refresh (`Cmd+Shift+R`), because `game.js` caches aggressively.

### Superseded files to delete

Consolidating the docs left six files behind. Each carries a `SUPERSEDED` banner at the top and
nothing else needs salvaging from them:

```bash
cd /Users/george/GITHUB/torched-planet
git rm HANDOFF.md DEVELOPERS.md PLAN-torched-planet-launch.md \
       PLAN-progression.md PLAN-settling-open-questions.md \
       PLAN-enemy-gauge-and-wind.md
```

After that the repo root holds exactly: `README.md`, `PROJECT.md`, `CHANGELOG.md`,
`cline_instructions.md`, `index.html`, `style.css`, `game.js`, `vercel.json`, plus
`tools/` and `.gitignore`. Git history keeps the old files if you ever want them back.

---

## 2. Verify, then ship

Run this before every push. Step 2 is not optional.

```bash
cd /Users/george/GITHUB/torched-planet

# 1. syntax — catches parse errors only, NOT ordering bugs
node --check game.js

# 2. behaviour, in a real browser, headless
cat index.html | sed 's#</body>#<script src="tools/drive.js"></script></body>#' > harness.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-sandbox --user-data-dir=/tmp/tp-harness --virtual-time-budget=9000 \
  --dump-dom "file:///Users/george/GITHUB/torched-planet/harness.html" 2>/dev/null | grep -o 'RESULT:.*'
rm harness.html

# 3. ship — chain it, never batch it
git add -A && git commit -m "Clear, small message" && git push
```

Green means every entry `"pass":true` and `"errors":[]` on the `RESULT:` line.

**Why a harness instead of clicking:** `requestAnimationFrame` does not advance under
`--virtual-time-budget`, so `tools/drive.js` calls `update(1/120)` in a loop instead. That
makes the run deterministic and fast, and it has caught a startup crash, a self-kill and a
wrong outcome label that reading the code did not. The harness is generated from the real
`index.html` so it cannot drift, and `harness.html` is gitignored.

**Never batch `commit` and `push` as separate shell commands** — batched calls can run
concurrently, and the push races the commit with *"src refspec main does not match any"*.

---

## 3. Architecture: three files, one script

```
index.html     → the DOM: canvas, HUD, controls, shop dialog, enemy gauge
style.css      → theme tokens, HUD grid, responsive breakpoints
game.js        → all state, physics, rules and rendering (one file)
tools/drive.js → headless smoke test driver (§2)
```

`game.js` loads with `defer` and runs top to bottom as one classic script: no framework, no
bundler, no module system, no TypeScript. Everything lives at module scope
(`let tanks, phase, …`) and one `requestAnimationFrame` loop drives it.

| Path | Responsibility |
| --- | --- |
| `index.html` | DOM structure and the **element-ID contract** (§15) |
| `style.css` | Theme, HUD layout, touch breakpoints. One rule per line, deliberately compact |
| `game.js` | State, terrain, physics, rules, CPU, rendering, input — the entire game |
| `tools/drive.js` | Headless driver, loaded by a generated `harness.html` |
| `vercel.json` | Static host config: no build, output is the repo root |
| `README.md` | Player-facing: controls, rules, how to run |
| `CHANGELOG.md` | Change log, newest first |
| `PROJECT.md` | This file — the single source of truth |
| `cline_instructions.md` | AI working protocol. Not part of the game |

Nothing in `game.js` is imported by anything else, and nothing else contains game logic.
**If a behaviour is surprising, it is in `game.js`.**

---

## 4. The mental model

Five moving parts, in dependency order:

```
 ┌──────────────┐   heights per pixel column
 │   TERRAIN    │──────────────────────────┐
 │ (heightmap)  │                          │
 └──────────────┘                          ▼
 ┌──────────────┐   x/y, angle, power   ┌──────────────┐    hits    ┌────────────┐
 │    TANKS     │──────────────────────▶│  BALLISTICS  │───────────▶│   RULES    │
 │  [0] = you   │                       │ launch()     │            │ blast()    │
 │  [1] = CPU   │◀──────────────────────│ advance()    │            │ reward()   │
 └──────────────┘  damage, cash, fall   └──────────────┘            └────────────┘
         ▲                                                                │
         │                     ┌──────────────────┐                       │
         └─────────────────────│  PHASE MACHINE   │◀──────────────────────┘
                               │ shop/aim/bot/    │
                               │ flight           │
                               └──────────────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │  HUD PROJECTION  │  updateHud(), setStatus()
                               │   (DOM writes)   │
                               └──────────────────┘
```

The mental shortcut: **the canvas is a pure function of state.** `draw()` reads state and
paints; it never mutates. All mutation happens in `update()` or in event handlers, and every
mutation a player can see is followed by a call to `updateHud()`.

---

## 5. State: the single source of truth

All module scope in `game.js`. No class, no store, no observer.

| Variable | Shape | Meaning |
| --- | --- | --- |
| `terrain` | `number[]`, length `W` (1000) | Ground **height** (y) per pixel column. Lower value = higher ground |
| `map` | `string` | `'Salt Flats' \| 'Iron Hills' \| 'Rooftop District'` |
| `palette` | `[sky1, sky2, groundTop, groundEdge]` | Colours chosen per map |
| `tanks` | `[player, cpu]` | Exactly two; index 0 is always you |
| `shells` | `Shell[]` | Shells in flight; empty means no shot is airborne |
| `effects` | `{x,y,radius,color,age}[]` | Explosion rings, self-expiring at `.58 s` |
| `burns` | `{x,age,delay,spent}[]` | Napalm pools waiting to detonate |
| `round` | `number` | Round **within** the duel: `+1` per completed cycle, reset to `1` by `nextLevel()` |
| `level` | `number` | **Duel counter.** Advances only when a tank is destroyed; drives all scaling |
| `wind` | `number` | Wind acceleration in px/s², signed (**+** = right). Rolled once per duel by `rollWind()` |
| `active` | `0 \| 1` | Whose shot is in progress |
| `phase` | `'shop' \| 'aim' \| 'bot' \| 'flight'` | See §6 |
| `report` | `{earned, hits, shields, near, falls, initialY}` | Per-shot tally, rebuilt by `fire()` |
| `previousSummary` | `string` | Sentence carried into the next shop dialog |
| `held` | `Map<string, string>` | Held controls: `event.code` or pointerId → logical key |
| `stickX`, `stickY` | `number` (-1…1) | Normalised joystick deflection |
| `selected` | `string` | Currently selected weapon id |
| `powerHold` | `number` | Seconds the power key has been held (drives the ramp) |
| `fineAim` | `boolean` | Shift held |
| `lastPower` | `number \| null` | Last shot's power, drawn as the meter tick |
| `settling` | `number` | Counts up once the board is quiet, debouncing `finishShot()` |
| `botDelay` | `number` | Countdown before the CPU fires |
| `accumulator`, `last` | `number` | Fixed-timestep bookkeeping |

**A tank**, built by `makeTank()`:

```js
{
  x, y,            // y is the ground contact point (bottom of the tracks)
  color,           // '#d5fa71' player, '#ff927a' CPU
  angle,           // barrel elevation in degrees, 1…179 (0 = right, 180 = left)
  power,           // 1…100 → muzzle speed
  fuel,            // 0…100
  travel,          // distance moved this turn, capped at 45
  hp,              // shield hit points; 0 means "no shield", NOT "dead"
  cash,            // the bank: score and spending money are the same number
  alive,           // false once destroyed
  vy,              // vertical velocity, for falling after terrain changes
  ammo: { basic: Infinity, large: 3, nuke: 0, spread: 0, napalm: 0 }
}
```

Two subtleties that confuse newcomers:

- **`hp === 0` does not mean destroyed.** It means unshielded. `alive` is the death flag.
- **`y` is a contact point, not a centre.** Everything that draws or hits a tank measures from
  `(x, y)` with negative offsets going up — the hull centre is `y - 12`.

---

## 6. The phase machine

Four phases. Every transition is explicit and greppable.

```
 reset() ─▶ openShop() ─▶ SHOP ─deploy()─▶ AIM ─fire()─▶ FLIGHT ─finishShot()
                                                             │
              ┌──────────────────────────────────────────────┴──────────────┐
              │                                                             │
       a tank was destroyed                                        both still alive
              │                                                             │
        nextLevel():                                        ┌───────────────┴────────┐
          round = 1                                         you fired          CPU fired
          level++                                               │                  │
          fresh tanks, bank kept                                ▼                  ▼
              │                                    BOT ─aimBot()─▶ FLIGHT  round++ ─▶ SHOP
              ▼                                             │
            SHOP ◀────────── finishShot() ◀─────────────────┘
```

| Phase | Entered by | What `update()` does | Exit |
| --- | --- | --- | --- |
| `shop` | `openShop()` | nothing (the `<dialog>` is modal) | **DEPLOY** → `deploy()` |
| `aim` | `deploy()` | samples input, adjusts angle/power/fuel | `fire()` (button or Space) |
| `bot` | `finishShot()` after your shot | counts down `botDelay`, may reposition, then `aimBot()` | `aimBot()` → `fire()` |
| `flight` | `fire()` | integrates shells, burns, explosions, settling | `finishShot()` |

**Levels are duels, not turns.** `round` increments on every completed turn cycle and by
itself never changes the level; `nextLevel()` also resets it to `1`, so `ROUND` counts rounds
*within* the current duel. Only a destroyed tank — yours or the CPU's — calls `nextLevel()`,
which bumps `level`. Both tanks come back fresh; your bank and ammo survive.
**There is no game-over state.**

Guards you must not break:

- `fire()` refuses unless `phase` is `aim` or `bot` — this is what stops rapid-fire spam.
- `update()` returns early unless `phase === 'flight'`, so shell physics never runs while
  aiming or shopping.
- `finishShot()` is called only from the settling branch, and that branch requires **no
  shells, no burns, and every tank resting on the ground**, plus a `.5 s` debounce via
  `settling`. That is why a Nuke can chain explosions without ending your turn early.
- The shop's Escape key is intercepted (`cancel` → `deploy()`), so the dialog can never be
  dismissed into an invalid state.

---

## 7. The frame loop

```js
function frame(now) {
  accumulator += Math.min(.075, (now - (last || now)) / 1000);  // clamped catch-up
  last = now;
  while (accumulator >= STEP) { update(STEP); accumulator -= STEP; }
  draw();
  requestAnimationFrame(frame);
}
```

- `STEP = 1/120` — physics runs at a **fixed** 120 Hz regardless of display refresh.
- `Math.min(.075, …)` caps a single catch-up at 75 ms, so a backgrounded tab doesn't teleport
  shells through terrain when it resumes.
- `update()` may run 0, 1 or several times per frame; `draw()` runs exactly once.

**Why fixed timestep matters here:** the CPU aims by simulating trajectories with the same
`launch()` + `advance()` pair the real shell uses. Fixed steps make the simulation identical
for both, so a "perfect" CPU shot actually lands. Variable `dt` would make CPU aim drift away
from reality.

---

## 8. Physics, ballistics and wind

Muzzle position (`muzzle()`), 32 px out along the barrel from `(x, y - 15)`:

```js
{ x: tank.x + cos(angle)*32, y: tank.y - 15 - sin(angle)*32 }
```

Launch (`launch()`) — power becomes muzzle speed:

```js
speed = 85 + power * 4.65      // power 1 → 89.6 px/s ; power 100 → 550 px/s
vx = cos(angle) * speed
vy = -sin(angle) * speed       // negative = upward (canvas y grows downward)
```

Integration (`advance()`) — semi-implicit Euler, one call per simulation step:

```js
vy += GRAVITY * step           // GRAVITY = 205 px/s²
vx += wind * step              // wind = ±WIND_MAX (14) px/s², rolled per duel
x  += vx * step
y  += vy * step
ticks++
// out of play if off-screen or ticks > 1400 (prevents runaway loops)
```

**Wind** is the only horizontal force, and it lives *inside* `advance()` on purpose: that is
the same routine the CPU's 385-shot search calls, so the opponent feels the wind and
compensates for it for free — the difficulty curve in §12 keeps its meaning. Drift is
`½·a·t²`, so at `WIND_MAX` a typical shot (power 63, 53°, ≈2.95 s aloft) lands ≈61 px
downwind and a maximum-range shot ≈100 px — roughly one blast radius, which is what keeps it
mild. `rollWind()` runs once per duel from `reset()` and `nextLevel()`; `0` is a legal roll
and reads as `WIND · CALM`. Retune by editing `WIND_MAX`, next to `GRAVITY`.

`advance()` **mutates the shell passed to it and returns what it hit**: `null` (still
flying), `'ground'`, `'out'`, or a tank object.

Collision (`collision()`) is deliberately generous in three ways:

| Test | Shape | Purpose |
| --- | --- | --- |
| `hypot(dx, dy) <= 24` | circle | Only when `hp > 0` — the shield bubble |
| `abs(dx) <= 17 && -7 <= dy <= 11` | box | The hull |
| `hypot(dx, dy + 4) <= 9` | circle | The track run |

`dx`/`dy` are measured from `(tank.x, tank.y - 12)`. `collision()` skips the shooter
entirely, so a shell can never detonate on your own hull — at minimum power a slow shell
would otherwise never clear the 24 px radius. Splash from your own impact can still cost you
shield HP, because `blast()` is applied to both tanks.

---

## 9. Terrain: a destructible heightmap

`terrain` is a plain array of heights, one entry per pixel column:

```js
terrain[437] = 352   // at x = 437 the ground surface is 352 px from the top
```

Two accessors, and the difference matters:

- `ground(x)` → `terrain[clamp(floor(x), 0, W-1)]` — the exact surface.
- `support(x)` → the **minimum** height over `x ± 14` — the highest ground under the tank's
  footprint, so a tank straddles a ridge instead of sinking into it.

Rendering draws the array as a polyline, fills below it with a gradient, then clips and
stipples texture inside the filled region — which is why strata look continuous even after
craters are carved.

**Carving** happens at the end of `blast()`. For each column within the radius:

```js
depth = sqrt(radius² - (col - x)²)                        // half-chord of the circle
if (y - depth <= terrain[col] && y + depth > terrain[col])
  terrain[col] = min(BEDROCK, y + depth)                  // push the surface DOWN
```

A heightmap cannot express a cave, so a blast only carves when it actually spans the current
surface — an explosion in mid-air leaves terrain untouched. `BEDROCK` (`H - 24`) is the hard
floor; nothing digs below it.

**The cascade that follows:** carving can remove ground from under a tank. `settleTank()` then
applies gravity (`620 px/s²`) until `y >= support(x)`, and that fall is what triggers the fall
bonus in `finishShot()`. Terrain changes are never cached — `support()` is recomputed on
demand, so there is nothing to invalidate.

`makeMap()` also swells terrain amplitude and rooftop heights with `level`, rolls the map
name, and picks the `palette`. `rollWind()` is called beside it, not inside it.

---

## 10. Damage and rewards

`blast(x, y, weapon, direct, carve = true)` runs one decision tree per tank:

```
for each tank:
  contact = (tank === direct) || hullWithinBlast || shieldBubbleOverlaps
  if contact && tank.hp > 0:  → shield absorbs: hp -= damage, reward $50
  else if direct || (contact && weapon.lethalSplash):
                              → tank.alive = false, reward $100
  else if not the shooter && hullWithinBlast + 42:
                              → near miss, reward $25
```

**The weapon table** (`weapons` in `game.js`) — the `radius` is the blast radius in px:

| id | radius | damage | Notes |
| --- | --- | --- | --- |
| `basic` | 13 | 1 | Unlimited |
| `large` | 29 | 2 | 3 to start; **restockable for $35** |
| `nuke` | 107 | 5 | `lethalSplash` |
| `nukeMini` | 52 | 3 | `lethalSplash` — half a Nuke's footprint |
| `spread` | 16 | 1 | Fires five shells in a fan |
| `napalm` | 24 | 2 | `lethalSplash`, 5 burn pools at ±45 px |
| `napalmXL` | 46 | 2 | `lethalSplash`, 9 burn pools at ±88 px |

**Burn pools are fixed at 15 px / 1 damage** (`update()`, `carve: false`). A napalm's own
`radius` governs only its initial blast and crater; its area denial comes from the `burns`
offset list and the `burnStep` cadence, so "a wider napalm" is *more pools further apart* —
data, not a new branch in `impact()`.

- `weapon.damage` applies on a direct hit or a hull-touching blast; a blast that only clips the
  shield bubble does `1` damage.
- `lethalSplash` (Nuke, Napalm) is what lets a near miss kill an **unshielded** tank.
- `carve = false` is used by napalm burns, so fire doesn't excavate the map.

Payouts, all multiplied by `progression.reward(level)` inside `reward()`:

| Event | Base |
| --- | --- |
| Destroy the opposing tank | $100 |
| Damage a shield | $50 |
| Near miss (within radius + 42) | $25 |
| Opponent survives a drop your shot caused | $35 |

`report` is rebuilt at the top of `fire()` and accumulates `earned` plus the counters (`hits`,
`shields`, `near`, `falls`); `finishShot()` turns it into the status sentence.
**`report` must exist before any `blast()` call** — that is why `fire()` creates it first.

---

## 11. Economy and progression

`progression` is the single tuning surface for difficulty and money. Change numbers here, not
inside the rules.

```js
const progression = {
  reward:    level => 1 + .3 * (level - 1),          // shot payouts grow 30%/level
  price:     level => 1 + .2 * (level - 1),          // shop prices grow 20%/level
  skill:     level => Math.min(1, (level - 1) / 10),     // marksmanship 0 → 1 by level 11
  flub:      level => .5 * (1 - progression.skill(level)), // chance of a wild shot
  spread:    level => 210 - 180 * progression.skill(level), // aim jitter in px
  cpuShield: level => Math.min(5, level - 1),        // free shield HP for the CPU
  cpuCash:   level => 40 + 45 * (level - 1),         // CPU starting wallet
  waveBonus: level => 250 * level,                   // duel bonus, paid when you win
  salvage:   level => 60 * level                     // paid when you lose the duel
};
```

Because rewards outpace prices, the bank grows in real terms — that is the "rising bank"
feel. The HUD shows the live multiplier (`updateHud()` writes `#multiplier`).

**Shop plumbing:**

| Function | Role |
| --- | --- |
| `catalog` | Static data: 3 sections of items `{id, name, price, hp?, detail}` |
| `priceOf(item)` | `item.price × progression.price(level)`, rounded |
| `canBuy(tank, item)` | Affordability **plus** rules: shields only if upgrading, fuel only under 100 |
| `purchase(tank, item)` | Deducts, then sets shield HP, adds fuel, or adds ammo |
| `updateShop()` | Rewrites every button's `disabled` state and price label from `priceOf()` |

The catalog DOM is built **once** at load from `catalog`; `updateShop()` keeps the displayed
prices in sync each level. Add an item to the data and it appears automatically.

**Catalogue order is load-bearing.** `aimBot()` buys
`catalog[0][1].find(item => canBuy(bot, item))` — the *first affordable* weapons item — so a
cheap resupply must sit **last**, or the CPU will stop reaching for Nuke/Spread/Napalm. The
category indices are positional too (`catalog[1][1]` shields, `catalog[2][1][0]` fuel):
**append items within a section, never insert a new category.**

**Level flow** lives in `nextLevel()`, called from `finishShot()` when either tank is gone:
`round = 1`, `level++`, then pay `waveBonus` (`$250 × level`) if you won the duel or `salvage`
(`$60 × level`) if you lost it, revive and refuel your tank, regenerate the map, reposition you
to x=115, build a fresh CPU with scaled shield and cash, clear shells and burns, then reopen
the shop. Ammo and bank carry over. Because the level advances on *any* destruction, losing a
duel costs you most of the payout but not the run. `round` restarts each duel, so the HUD's
`ROUND` counts rounds *within* the current level — that is what keeps `LEVEL 02 · ROUND 01`
readable instead of an ever-climbing tally.

---

## 12. The CPU opponent

`aimBot()` is a shopping step followed by a brute-force search.

1. **Shop** — buys the most expensive affordable shield (`catalog[1][1]` reversed), a fuel can
   if below 30, and a special weapon if it has no Large/Nuke left.
2. **Pick a weapon** — Basic only at levels 1–2, then the first available of
   `['nuke','large','napalm','spread','basic']`. Early levels therefore can't one-shot you
   through splash.
3. **Pick a target** — `aimTarget()` chooses a deliberately wrong point: with probability
   `flub` it misses by 150–290 px, otherwise it jitters by `spread`. The CPU then aims
   perfectly at *that* point, so the jitter is the whole difficulty curve. Measured over
   4,000 samples per level, with the player at x = 115:

   | Level | Mean miss | Inside a Basic blast (±30 px) |
   | --- | --- | --- |
   | 1 | 106 px | 14% |
   | 2 | 93 px | 19% |
   | 4 | 69 px | 33% |
   | 6 | 38 px | 65% |
   | 8 | 7 px | 100% |

   **These rows were sampled on the old `/ 7` curve** and have not been re-measured since
   `skill` moved to `/ 10`. The shape still holds: level 1 is untouched (`skill(1)` is `0`
   either way), and every other row now sits roughly where old level
   `1 + .7 × (level − 1)` did, so the curve only reaches 100% at level 11.
   **Re-measure `aimTarget()` before quoting a number from this table.**

4. **Search** — 11 elevations (25…75, step 5) × 35 powers (32…100, step 2) = **385 candidate
   trajectories**. Each is simulated with the real `launch()` + `advance()` until it hits
   something, then scored by distance to the target (vertical error weighted 0.65). Hitting
   itself and leaving the map both score `Infinity`.
5. **Fire** — assigns the best angle/power and calls `fire(id)`.

Cost: 385 simulations in one synchronous call. Fast enough today, but if you add expensive
per-tick work to `collision()`, this is where it will show up as a hitch.

**Why the search is safe:** `advance()` only mutates the shell it is given, and `collision()`
only reads. Nothing in the simulation blasts, rewards, or carves. Keep it that way — any side
effect inside `collision()` would corrupt the real board during aim.

**Wind is included** because it lives in `advance()` (§8), so the CPU compensates
automatically. Do not move the wind term into `launch()` — that would silently make the CPU
wind-blind and hand the player a free advantage.

---

## 13. Input plumbing

Three input sources, one destination.

```
keyboard   ──keydown/keyup──▶ held: Map<code, key>          ─┐
joystick   ──pointermove───▶ stickX, stickY                 ─┼──▶ update() samples them
touch L/R  ──pointerdown───▶ held: Map<pointerId, 'z'|'x'>  ─┘    every physics step
```

`update()` reads them once per step:

```js
turn  = clamp(left - right - stickX, -1, 1)     // -1…1
power = clamp(up - down - stickY, -1, 1)
move  = right - left
```

- **Input is sampled, not event-driven.** A keydown only records state; movement happens in
  `update()`. Behaviour is therefore identical at 60, 120 or 144 fps.
- `held` is keyed by `event.code` for the keyboard and by `pointerId` for touch buttons, so
  simultaneous keys and multi-touch never collide.
- `clearControls()` wipes everything and is called from `fire()` and on window `blur`. If you
  add a phase change, call it — otherwise a stuck key keeps turning the turret.
- **Fine aim:** Shift sets `fineAim`, quartering the power rate. A single non-repeat keypress
  calls `nudge()` for an exact ±1% step, so precision doesn't depend on timing.
- **Joystick:** `moveStick()` normalises deflection to -1…1 with a 29 px limit and a 5 px
  deadzone, and pushes `--stick-x` / `--stick-y` CSS variables so the knob follows your thumb
  without extra JavaScript repaints.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Aim turret | ← → or A D | Drag joystick sideways |
| Change power | ↑ ↓ or W S — hold to accelerate, tap for 1% steps | Drag joystick vertically |
| Fine aim | Hold Shift | Drag joystick gently |
| Move tank | Z X | Hold L / R |
| Fire | Space | Tap FIRE |

The power integrator, in full:

```js
powerHold = power ? powerHold + dt : 0;                    // ramp timer
const ramp = .35 + Math.min(1, powerHold / .65) * .65;     // 0.35 → 1.0 over 0.65 s
player.power = clamp(player.power + power * dt * 16 * ramp * (fineAim ? .25 : 1), 1, 100);
```

Net effect: 5.6 %/s for the first fraction of a second, 16 %/s once held, 4 %/s with Shift.
Angle is a flat `53 °/s` and is intentionally untouched by the ramp.

---

## 14. Rendering

`draw()` is immediate-mode and stateless between frames — no offscreen buffers, no sprites, no
images. Order:

1. `drawBackdrop()` — sky gradient, sun, two parallax hill/skyline layers, grid
2. `drawTerrain()` — surface polyline, gradient fill, clipped stipple texture, bedrock bar
3. `drawTank()` per tank — shield ring, barrel, hull, wheels, `YOU`/`CPU` label, turn arrow
4. Shells and their 15-point trails
5. Explosion rings from `effects`

`drawTank()` uses `ctx.save()` → `translate(x, y)` → draw in **local coordinates** →
`ctx.restore()`. Inside that transform the tank sits at the origin, so all the `roundRect` and
wheel maths are local numbers.

The canvas is a fixed **1000 × 520** surface stretched to container width by CSS. All game
coordinates are canvas units; CSS pixels appear only in pointer input, which uses
`getBoundingClientRect()` in the joystick.

**The enemy shield gauge is deliberately NOT drawn on the canvas.** It is a DOM overlay inside
`.stage` (see §15): `draw()` must stay a pure function of state, and canvas painting at
x ≈ 960–1000 would sit on the terrain the CPU actually stands on.

---

## 15. HUD and the DOM contract

`game.js` reaches into the DOM by ID. These are the wiring points, with the single writer for
each:

| ID | Written by | Purpose |
| --- | --- | --- |
| `power`, `angle`, `fuel`, `shield` | `updateHud()` | Numeric readouts |
| `power-meter`, `angle-meter`, `fuel-meter`, `shield-meter` | `updateHud()` | `<meter>` values (max must match scale) |
| `power-tick` | `updateHud()` | Last-shot reference tick (`--at` custom property) |
| `cash` | `updateHud()` | The bank |
| `multiplier` | `updateHud()` | `1.0× REWARDS` |
| `turn` | `updateHud()` | `LEVEL nn · ROUND nn` |
| `enemy` | `updateHud()` | `CPU / 3 HP`, `NO SHIELD`, or `CPU / DOWN` |
| `wind` | `updateHud()` | `WIND ▶ 12` / `WIND ◀ 7` / `WIND · CALM` |
| `gauge-hp`, `gauge-hit` | `updateHud()` | Enemy shield HP, and the loaded weapon's damage |
| `gauge-fill`, `gauge-threat` | `updateHud()` | Gauge geometry via `--level`, `--from`, `--size` |
| `map` | `reset()`, `nextLevel()` | Map name |
| `status` | `setStatus()` | The one-line narration |
| `fire`, `weapon` | `updateHud()` | Disabled unless `phase === 'aim'` |
| `weapon` options | `updateWeapons()` | Rebuilt after any ammo change |
| `shop`, `shop-turn`, `shop-cash`, `catalog`, `shop-note` | `openShop()`, `updateShop()` | Modal shop |
| `reset`, `deploy`, `fire` | event handlers at the bottom of `game.js` | — |
| `joystick`, `[data-hold]` | input section at the bottom of `game.js` | — |

**Rule:** `updateHud()` is the only function that writes the HUD, and it is cheap enough to
call freely. Add a field there rather than sprinkling DOM writes through game logic.

### The enemy shield gauge

The markup lives in `index.html` inside `.stage`, which wraps the canvas inside `.board` — so the
overlay is positioned against the canvas box, not against the field bar or a stretched flex cell:

```html
<aside class="gauge" aria-label="Enemy shield strength and incoming damage">
<b id="gauge-hp">0</b>
<div class="gauge-track" aria-hidden="true"><i id="gauge-fill"></i><em id="gauge-threat"></em></div>
<small id="gauge-hit">-1</small>
</aside>
```

- Scale is **0–5**, matching `progression.cpuShield`'s ceiling, `SHIELD_MAX`, and
  `shield-meter max="5"`. One number, one meaning.
- `#gauge-fill` is bottom-anchored lime, height `hp / 5`.
- `#gauge-threat` is the **hit strength**: `min(damage, hp)` tall, sitting on top of the fill,
  showing how much of the shield the loaded weapon would strip. It never overflows the bar.
- `pointer-events: none`, so it can never eat a tap meant for the joystick.
- At level 1 the CPU has `cpuShield(1) === 0`, so the bar is empty and reads `0` — the player
  learns "1 damage, nothing to absorb it" before shields appear at level 2.
- `.fieldbar` gets `flex-wrap: wrap` at ≤520 px because `WIND` made it a four-item row.

### Mobile and the layout contract

Three layouts, chosen by media query. All of it is CSS — `game.js` never learns about
viewports, because the canvas keeps its 1000 × 520 backing store and is only ever CSS-scaled.

| Viewport | Layout |
| --- | --- |
| Tall (≥ 561 px), or a fine pointer | Desktop stack: header → HUD (5 cols) → field → status → controls |
| Touch, portrait | Same stack, compacted: header button collapses to `↻ New`, HUD wraps to 3 columns, single-column shop, `.rotate` hint shown |
| Touch, landscape, ≤ 560 px tall | **Immersive grid**, below |

The immersive grid, gated on
`(orientation:landscape) and (max-height:560px) and (pointer:coarse)`:

```
"hud hud hud"
"left field right1"
"left field right2"
"status status status"
```

- `.controls{display:contents}` is the enabling trick: it removes the controls' own box so
  `.touch`, `label` and `.fire` become grid items in three different areas.
  **No DOM restructuring, no JavaScript.**
- The rails exist because the tanks sit at x = 115 and x = 875 — exactly under a bottom-left
  joystick and a bottom-right FIRE button. Rails also buy vertical space, the scarce axis on a
  phone: **~286 px of battlefield versus ~176 px** with a bottom control bar.
- `canvas{object-fit:contain}` fills the field without distortion. In landscape the field is not
  1000:520-shaped, so the canvas letterboxes rather than stretches — which is why the gauge
  lands in the side gutter, beside the battlefield instead of over it.
- `.stage{position:absolute;inset:0}` gives the gauge a canvas-shaped containing block in the
  normal layout and a full-field one in landscape. Never give `.stage` both a parent-derived
  `height` and an `aspect-ratio` — that distorts.

Hardening that must survive future changes: `100dvh` (not `100vh`), `env(safe-area-inset-*)`
with `viewport-fit=cover`, `overscroll-behavior:none`, `touch-action:manipulation` on every
control, and a **44 px minimum tap target**.

---

## 16. House rules

- 2-space indent, semicolons, single quotes, `'use strict'` at the top.
- No dependencies, no build step, no assets. Keep it openable with a double-click.
- State lives in module-scope `let`; helpers are hoisted `function` declarations.
- Small pure helpers are arrows: `const clamp = (v, min, max) => …`, `const byId = id => …`.
- Functions are verbs (`fire`, `settleTank`); data is nouns (`terrain`, `shells`).
- One CSS rule per line, grouped by concern. Theme values live in `:root` custom properties —
  don't hard-code a colour that already has a variable.
- Tunable numbers belong in `progression`, `weapons`, `catalog`, or the constants block
  (`GRAVITY`, `WIND_MAX`, `SHIELD_MAX`, `STEP`) — not inline.
- Comment the *why*, not the *what*. The existing comments are load-bearing.

---

## 17. Recipes

### Add a weapon

1. `weapons` — add `{ name, radius, damage, color }`, plus `lethalSplash: true` if splash
   should kill unshielded tanks.
2. `catalog[0][1]` — add `{ id, name, price, detail }` so it can be bought.
3. `makeTank().ammo` — add the key with a starting count (`0` unless it is a freebie).
4. `fire()` — only if it needs custom launching (see how `spread` maps offsets).
5. a `burns` offset list (plus optional `burnStep`) if it should leave fire behind, or other
   custom behaviour in `impact()`.

**Trap:** skipping step 3 leaves `ammo[id] === undefined`, so `fire()` treats the weapon as
empty and `updateWeapons()` silently marks it disabled.

### Add a shop item

Add it to the right `catalog` section; `updateShop()` and the DOM pick it up automatically.
`purchase()` handles exactly three kinds: `hp` items, `id === 'fuel'`, and everything else as
ammo. A new *kind* of item needs a branch in `purchase()` **and** a rule in `canBuy()`.

### Add a map

1. `makeMap()` — add the name to the array and give it a terrain formula.
2. `palette` — add a four-colour entry keyed by the same name (sky top, sky bottom, ground
   top, ground edge).
3. `drawBackdrop()` — optionally branch the skyline the way `Rooftop District` does.

**Trap:** a map name with no `palette` entry leaves `palette` undefined and blanks the canvas.

### Add a HUD field

Add the element to `.hud` in `index.html`, write it in `updateHud()`, and remember `.hud` is a
**5-column grid** — a sixth cell needs a `grid-template-columns` change. Meters need their
`max` to match the scale (power 100, angle 180, shield 5).

### Add a bar on the battlefield

Follow the enemy gauge (§15): put the element inside `.stage` (not `.field`), absolutely
position it, give it `pointer-events: none`, and drive it from `updateHud()` using CSS custom
properties rather than inline styles. Never paint it in `draw()`.

### Make the gun gentler (or snappier)

Only three numbers: the `16` rate, the `.65` ramp window, and the `.25` Shift factor in
`update()` (§13). Changing power's effect on *range* instead means editing `launch()`'s
`85 + power * 4.65`, which moves everything, including the CPU's search range.

### Make the wind stronger (or remove it)

`WIND_MAX` in the constants block. Drift scales linearly with it (`½·a·t²`). Set it to `0` to
disable wind entirely — `updateHud()` then always prints `WIND · CALM`, and the CPU's search
still works because the term is simply zero.

### Persist a best level

There is no storage layer today. The smallest honest version: read `localStorage` in `reset()`
and write it in `nextLevel()` where `level` increases. (Note: there is no `phase = 'over'`
branch any more — the old recipe that referenced it was stale.)

---

## 18. Decision log — locked choices

These were argued over. Don't undo them casually; each row carries the *why*.

| Decision | Rationale |
| --- | --- |
| **Level = duel, `round` = turn cycle** | A level advances only when a tank is destroyed — either side. `round` restarts at `1` with each duel. |
| **Both outcomes advance the level** | Direct instruction from Dr Featherstone ("after *one of us* is destroyed"). The player is revived with bank and ammo intact. |
| **No game-over state** | Follows from the row above. `level` always rises; there is no `'over'` phase, so any doc or recipe that mentions one is stale. |
| **Duel bonus only on a win** | `$250 × level`. Losing still levels you up, just with a smaller payout. |
| **A lost duel pays salvage** | `$60 × level` — 24% of the win bonus, so winning stays a 4:1 decision while a loss still buys a shield. Rejected: ending the run (contradicts "both outcomes advance the level") and a literal `$0` (made a lost duel feel wasted). |
| **`ROUND` resets rather than being dropped** | Deleting the field would have broken `tools/drive.js`, which parses `#turn` on ` · ` and asserts "a turn cycle bumps ROUND only". Resetting keeps that assertion meaningful. |
| **Accuracy ceiling at level 11, not 8** | `skill` divides by `10`. 100% accuracy at level 8 was judged unfair; level 1 is identical under either divisor (`skill(1) === 0`). |
| **CPU skill is a curve, not one jitter** | `progression.skill/flub/spread`. Level 1 lands ~14% of shots, so the opening is genuinely forgiving. |
| **Power is ramped, not linear** | A full-sweep power rate was twitchy (§13). Rate ramps 5.6 → 16 %/s over 0.65 s; Shift quarters it; one keypress is exactly 1 point. |
| **`collision()` skips the shooter** | A minimum-power shell otherwise detonated on your own hull before clearing the 24 px radius. Splash from your own blast can still cost shield HP. |
| **Wind lives in `advance()`** | So the CPU's 385-shot search feels it and compensates for free. In `launch()` it would make the CPU wind-blind. |
| **Wind is mild: ±14 px/s²** | ≈61 px of drift on a typical shot — about one blast radius. Enough to demand compensation, never enough to make skill irrelevant. |
| **The gauge is DOM, not canvas** | `draw()` stays a pure function of state, and painting at x ≈ 960–1000 would cover terrain the CPU stands on. |
| **`makeMap()` before `makeTank()` in `reset()`** | Tanks read `support()` at construction, which reads `terrain`. |

---

## 19. Known limitations

- **No `npm test`-style suite.** Verification is `node --check`, the headless harness (§2), and
  playing it.
- **One global mutable namespace.** No encapsulation; a typo can silently clobber state.
- **No persistence** — level and bank vanish on reload.
- **The CPU search is synchronous** (385 simulated shots in a single tick).
- **The canvas is not DPR-scaled**, so it looks soft on high-density displays.
- **No audio.**
- **Napalm splash never carves** (`carve = false`), so fires burn on top of terrain.
- **The heightmap cannot represent caves**; blasts only carve when they span the surface.
- **No game-over state** — a destroyed tank ends the duel, not the run. `level` always rises.
- **`waveBonus` only pays on a win**; a loss pays `salvage`, deliberately smaller.
- **The §12 hit-rate table is stale** — it was sampled on the old `/ 7` curve.
- **Napalm burn pools pay full shield-hit money, each.** Every pool that contacts a shielded
  tank calls `reward(50, 'shields')`, so a Napalm XL ($175) landing beside a full 5 HP shield
  pays up to $250 *before* the reward multiplier — more than it costs. Pre-existing for plain
  Napalm's five pools; the nine-pool variant widens it. The `burns` array length is the dial.

---

## 20. Traps that have already cost time

1. **`reset()` must call `makeMap()` before `makeTank()`.** Tanks read `support()` at
   construction, which reads `terrain`. Get the order wrong and the page silently dies at load
   with an empty HUD (`Cannot read properties of undefined`). `node --check` will not catch it.
2. **Don't batch `commit` and `push` as separate commands.** Batched shell calls can run
   concurrently; the push raced the commit and failed with *"src refspec main does not match
   any"*. Chain them: `git add -A && git commit -m "…" && git push`.
3. **`updateHud()` is the only HUD writer.** After any ammo change call `updateWeapons()`; after
   a phase change call `clearControls()`, or a stuck key keeps turning the turret.
4. **zsh expands globs in flags.** Write `--include='*.md'`, not `--include=*.md`.
5. **A blank page is a script error, not a hosting problem.** Open DevTools; the console names
   the line. Then hard-refresh, because `game.js` caches aggressively.
6. **Adding a fourth `.fieldbar` item needs `flex-wrap` on narrow screens** — done, but remember
   it if you add a fifth.
7. **Docs rot silently.** Three separate recipes and diagrams in this project described a
   `phase = 'over'` that no longer exists. When you change behaviour, grep the docs for the old
   name before you push.

---

## 21. Roadmap

In rough priority order.

1. **Verify and ship whatever is uncommitted.** If `git status` is dirty, run §2 before anything
   else. Nothing on disk is trusted until the harness is green.
2. **Deploy to Vercel.** `vercel.json` is already correct (static, `framework: null`,
   `outputDirectory: "."`) and the CLI is logged in as `devcabin` under `devcabins-projects`:

   ```bash
   vercel link --yes --project torched-planet
   vercel --prod
   ```

   Then record the URL in `README.md`, in `CHANGELOG.md`, and on the repo:

   ```bash
   gh repo edit DevCabin/torched-planet --homepage https://torched-planet.vercel.app
   ```

3. **Re-measure the §12 hit-rate table** on the current `/ 10` curve.
4. **Persist the best level** with `localStorage` — recipe in §17.
5. **Polish backlog** (pick, don't batch): DPR-scale the canvas (soft on retina), sound, CPU
   remembering your last position.

---

## 22. Glossary

| Term | Meaning |
| --- | --- |
| **Bank** | `tank.cash` — score and spending money are the same number |
| **Round** | Turn-cycle counter *within* a duel; resets to `1` at each duel |
| **Level** | Duel counter; increments only when a tank is destroyed |
| **Duel** | One level's battle; ends in destruction, then `nextLevel()` starts the next |
| **Duel bonus** | `$250 × level`, paid when you win one |
| **Salvage** | `$60 × level`, paid when you lose one |
| **Wind** | `wind` — horizontal acceleration applied to every shell each step; `+` blows right |
| **Hit strength** | The damage of the loaded weapon, drawn as the red band on the enemy gauge |
| **Support** | Highest ground under the tank's footprint (`support()`), vs raw surface (`ground()`) |
| **Carve** | Lowering `terrain[col]` to create a crater |
| **Direct** | The tank object a shell actually struck (`blast(x, y, weapon, direct)`) |
| **`lethalSplash`** | Weapon flag letting splash kill an *unshielded* tank |
| **Phase** | One of `shop`, `aim`, `bot`, `flight` |
