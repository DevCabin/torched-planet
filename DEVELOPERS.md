# DEVELOPERS.md

Technical architecture of **Torched Planet** — a turn-based artillery duel.
Written so a junior developer can read this one file and safely change the game.

---

## 1. The 60-second version

Three files, no dependencies, no build step, no assets:

```
index.html   → the DOM: canvas, HUD, controls, shop dialog
style.css    → theme tokens, HUD grid, responsive breakpoints
game.js      → all game state, physics, rules and rendering (one file)
```

`game.js` is loaded with `defer` and runs top to bottom as one script. There is no
framework, no bundler, no module system, no TypeScript. Everything lives at module scope
(`let tanks, phase, ...`) and one `requestAnimationFrame` loop drives it.

Deployment is a static file host (Vercel) — `vercel.json` sets `framework: null` and
`outputDirectory: "."`. There is nothing to compile, so **opening `index.html` in a
browser is a complete, valid dev environment.**

---

## 2. File map

| Path | Responsibility | Notes |
| --- | --- | --- |
| `index.html` | DOM structure and the **element-ID contract** | ~44 lines, all markup inline |
| `style.css` | Visual theme, HUD layout, touch/mobile breakpoints | One rule per line, deliberately compact |
| `game.js` | State, terrain, physics, rules, CPU, rendering, input | ~717 lines; the entire game |
| `vercel.json` | Static host config | No build; output is the repo root |
| `README.md` | Player-facing: controls, rules, how to run | |
| `CHANGELOG.md` | Change log, newest first | Update for every significant change |
| `PLAN-*.md` | Design documents written *before* multi-step work | Historical intent, useful context |
| `cline_instructions.md` | Working protocol for the AI assistant | Not part of the game |

Nothing in `game.js` is imported by anything else, and nothing else contains game logic.
If a behaviour is surprising, it is in `game.js`.

---

## 3. The mental model

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
                               │ flight/over      │
                               └──────────────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │  HUD PROJECTION  │  updateHud(), setStatus()
                               │   (DOM writes)   │
                               └──────────────────┘
```

The mental shortcut: **the canvas is a pure function of state.** `draw()` reads state and
paints; it never mutates. All mutation happens in `update()` or in event handlers, and
every mutation a player can see is followed by a call to `updateHud()`.

---

## 4. State: the single source of truth

All of this is module scope in `game.js`. There is no class, no store, no observer.

| Variable | Shape | Meaning |
| --- | --- | --- |
| `terrain` | `number[]`, length `W` (1000) | Ground **height** (y) per pixel column. Lower value = higher ground. |
| `map` | `string` | `'Salt Flats' \| 'Iron Hills' \| 'Rooftop District'` |
| `palette` | `[sky1, sky2, groundTop, groundEdge]` | Colours chosen per map |
| `tanks` | `[player, cpu]` | Exactly two; index 0 is always you |
| `shells` | `Shell[]` | Shells in flight; empty means no shot is airborne |
| `effects` | `{x,y,radius,color,age}[]` | Explosion rings, self-expiring at `.58 s` |
| `burns` | `{x,age,delay,spent}[]` | Napalm pools waiting to detonate |
| `round` | `number` | **Doubles as the level counter.** Starts at 1; only `reset()` returns it |
| `active` | `0 \| 1` | Whose shot is in progress |
| `phase` | `'shop' \| 'aim' \| 'bot' \| 'flight' \| 'over'` | See §5 |
| `report` | `{earned, hits, shields, near, falls, initialY}` | Per-shot tally, rebuilt by `fire()` |
| `previousSummary` | `string` | Sentence carried into the next shop dialog |
| `held` | `Map<string, string>` | Held controls: key is `event.code` or a pointerId, value is the logical key |
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
- **`y` is a contact point, not a centre.** Everything that draws or hits a tank measures
  from `(x, y)` with negative offsets going up — a hull centre is `y - 12`.

---

## 5. The state machine

Five phases. Every transition is explicit and greppable.

```
 reset()
   └─▶ openShop() ──▶ SHOP ──deploy()──▶ AIM ──fire()──▶ FLIGHT
                                                          │
                                                     finishShot()
                                                          │
            ┌─────────────────────────────────────────────┼──────────────────────┐
            │                                             │                      │
      CPU tank dead                               nobody dead              player dead
            │                                             │                      │
      nextWave() ──▶ SHOP                    BOT ──aimBot()──▶ FLIGHT           OVER
                                                  │                                │
                                             finishShot() ──▶ SHOP            reset() only
```

| Phase | Entered by | What `update()` does | Exit |
| --- | --- | --- | --- |
| `shop` | `openShop()` | nothing (the `<dialog>` is modal) | **DEPLOY** → `deploy()` |
| `aim` | `deploy()` | samples input, adjusts angle/power/fuel | `fire()` (button or Space) |
| `bot` | `finishShot()` after your shot | counts down `botDelay`, may reposition, then `aimBot()` | `aimBot()` → `fire()` |
| `flight` | `fire()` | integrates shells, burns, explosions, settling | `finishShot()` |
| `over` | `finishShot()` when you are destroyed | nothing | `reset()` (New battlefield) |

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

## 6. The frame loop

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
- `Math.min(.075, …)` caps a single catch-up at 75 ms, so a backgrounded tab doesn't
  teleport shells through terrain when it resumes.
- `update()` may run 0, 1 or several times per frame; `draw()` runs exactly once.

**Why fixed timestep matters here:** the CPU aims by simulating trajectories with the same
`launch()` + `advance()` pair the real shell uses. Fixed steps make the simulation
identical for both, so a "perfect" CPU shot actually lands. Variable `dt` would make CPU
aim drift away from reality.

---

## 7. Physics and ballistics

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
x  += vx * step
y  += vy * step
ticks++
// out of play if off-screen or ticks > 1400 (prevents runaway loops)
```

`advance()` **mutates the shell passed to it and returns what it hit**: `null` (still
flying), `'ground'`, `'out'`, or a tank object.

Collision (`collision()`) is deliberately generous in three ways:

| Test | Shape | Purpose |
| --- | --- | --- |
| `hypot(dx, dy) <= 24` | circle | Only when `hp > 0` — the shield bubble |
| `abs(dx) <= 17 && -7 <= dy <= 11` | box | The hull |
| `hypot(dx, dy + 4) <= 9` | circle | The track run |

`dx`/`dy` are measured from `(tank.x, tank.y - 12)`. The shooter is immune for its first
16 ticks, so a shell cannot detonate on its own barrel.

---

## 8. Terrain: a destructible heightmap

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

A heightmap cannot express a cave, so a blast only carves when it actually spans the
current surface — an explosion in mid-air leaves terrain untouched. `BEDROCK` (`H - 24`) is
the hard floor; nothing digs below it.

**The cascade that follows:** carving can remove ground from under a tank. `settleTank()`
then applies gravity (`620 px/s²`) until `y >= support(x)`, and that fall is what triggers
the fall bonus in `finishShot()`. Terrain changes are never cached — `support()` is
recomputed on demand, so there is nothing to invalidate.

---

## 9. Damage and reward rules

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

- `weapon.damage` applies on a direct hit or a hull-touching blast; a blast that only clips
  the shield bubble does `1` damage.
- `lethalSplash` (Nuke, Napalm) is what lets a near miss kill an **unshielded** tank.
- `carve = false` is used by napalm burns, so fire doesn't excavate the map.

Payouts, all multiplied by `progression.reward(round)` inside `reward()`:

| Event | Base |
| --- | --- |
| Destroy the opposing tank | $100 |
| Damage a shield | $50 |
| Near miss (within radius + 42) | $25 |
| Opponent survives a drop your shot caused | $35 |

`report` is rebuilt at the top of `fire()` and accumulates `earned` plus the counters
(`hits`, `shields`, `near`, `falls`); `finishShot()` turns it into the status sentence.
**`report` must exist before any `blast()` call** — that is why `fire()` creates it first.

---

## 10. Economy and progression

`progression` is the single tuning surface for difficulty and money. Change numbers here,
not inside the rules.

```js
const progression = {
  reward:    level => 1 + .3 * (level - 1),          // shot payouts grow 30%/level
  price:     level => 1 + .2 * (level - 1),          // shop prices grow 20%/level
  aimError:  level => Math.max(42, 150 - 18*level),  // CPU target jitter, floor 42
  cpuShield: level => Math.min(5, level - 1),        // free shield HP for the CPU
  cpuCash:   level => 40 + 45 * (level - 1),         // CPU starting wallet
  waveBonus: level => 250 * level                    // paid when the CPU is destroyed
};
```

Because rewards outpace prices, the bank grows in real terms — that is the "rising bank"
feel. The HUD shows the live multiplier (`updateHud()` writes `#multiplier`).

**Shop plumbing:**

| Function | Role |
| --- | --- |
| `catalog` | Static data: 3 sections of items `{id, name, price, hp?, detail}` |
| `priceOf(item)` | `item.price × progression.price(round)`, rounded |
| `canBuy(tank, item)` | Affordability **plus** rules: shields only if upgrading, fuel only under 100 |
| `purchase(tank, item)` | Deducts, then sets shield HP, adds fuel, or adds ammo |
| `updateShop()` | Rewrites every button's `disabled` state and price label from `priceOf()` |

The catalog DOM is built **once** at load from `catalog`; `updateShop()` keeps the displayed
prices in sync each level. Add an item to the data and it appears automatically.

**Level flow** lives in `nextWave()`: `round++`, pay `waveBonus`, refill the player's fuel,
regenerate the map, reposition the player to x=115, build a fresh CPU with scaled shield and
cash, clear shells and burns, then reopen the shop. Player ammo and remaining shield HP carry
over on purpose; the run ends only when the **player** is destroyed.

---

## 11. The CPU opponent

`aimBot()` is a shopping step followed by a brute-force search.

1. **Shop** — buys the most expensive affordable shield (`catalog[1][1]` reversed), a fuel
   can if below 30, and a special weapon if it has no Large/Nuke left.
2. **Pick a weapon** — first available of `['nuke','large','napalm','spread','basic']`.
3. **Pick a target** — `player.x + (random - .5) * aimError(round)`. This jitter *is* the
   difficulty: the CPU always aims perfectly at a slightly wrong place.
4. **Search** — 11 elevations (25…75, step 5) × 35 powers (32…100, step 2) = **385 candidate
   trajectories**. Each is simulated with the real `launch()` + `advance()` until it hits
   something, then scored by distance to the target (vertical error weighted 0.65). Hitting
   itself and leaving the map both score `Infinity`.
5. **Fire** — assigns the best angle/power and calls `fire(id)`.

Cost: 385 simulations in one synchronous call. Fast enough today, but if you add expensive
per-tick work to `collision()`, this is where it will show up as a hitch.

**Why the search is safe:** `advance()` only mutates the shell it is given, and
`collision()` only reads. Nothing in the simulation blasts, rewards, or carves. Keep it that
way — any side effect inside `collision()` would corrupt the real board during aim.

---

## 12. Input plumbing

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
  calls `nudge()` for an exact ±1 % step, so precision doesn't depend on timing.
- **Joystick:** `moveStick()` normalises deflection to -1…1 with a 29 px limit and a 5 px
  deadzone, and pushes `--stick-x` / `--stick-y` CSS variables so the knob follows your thumb
  without extra JavaScript repaints.

The power integrator, in full:

```js
powerHold = power ? powerHold + dt : 0;                    // ramp timer
const ramp = .35 + Math.min(1, powerHold / .65) * .65;     // 0.35 → 1.0 over 0.65 s
player.power = clamp(player.power + power * dt * 16 * ramp * (fineAim ? .25 : 1), 1, 100);
```

Net effect: 5.6 %/s for the first fraction of a second, 16 %/s once held, 4 %/s with Shift.
Angle is a flat `53 °/s` and is intentionally untouched by the ramp.

---

## 13. Rendering

`draw()` is immediate-mode and stateless between frames — no offscreen buffers, no sprites, no
images. Order:

1. `drawBackdrop()` — sky gradient, sun, two parallax hill/skyline layers, grid
2. `drawTerrain()` — surface polyline, gradient fill, clipped stipple texture, bedrock bar
3. `drawTank()` per tank — shield ring, barrel, hull, wheels, `YOU`/`CPU` label, turn arrow
4. Shells and their 15-point trails
5. Explosion rings from `effects`

`drawTank()` uses `ctx.save()` → `translate(x, y)` → draw in **local coordinates** →
`ctx.restore()`. Inside that transform the tank sits at the origin, so all the `roundRect`
and wheel maths are local numbers.

The canvas is a fixed **1000 × 520** surface stretched to container width by CSS. All game
coordinates are canvas units; CSS pixels appear only in pointer input, which uses
`getBoundingClientRect()` in the joystick.

---

## 14. DOM contract

`game.js` reaches into the DOM by ID. These are the wiring points, with the single writer for
each:

| ID | Written by | Purpose |
| --- | --- | --- |
| `power`, `angle`, `fuel`, `shield` | `updateHud()` | Numeric readouts |
| `power-meter`, `angle-meter`, `fuel-meter`, `shield-meter` | `updateHud()` | `<meter>` values (max must match scale) |
| `power-tick` | `updateHud()` | Last-shot reference tick (`--at` custom property) |
| `cash` | `updateHud()` | The bank |
| `multiplier` | `updateHud()` | `1.0× REWARDS` |
| `turn` | `updateHud()` | `LEVEL nn` |
| `enemy` | `updateHud()` | CPU shield status |
| `map` | `reset()`, `nextWave()` | Map name |
| `status` | `setStatus()` | The one-line narration |
| `fire`, `weapon` | `updateHud()` | Disabled unless `phase === 'aim'` |
| `weapon` options | `updateWeapons()` | Rebuilt after any ammo change |
| `shop`, `shop-turn`, `shop-cash`, `catalog`, `shop-note` | `openShop()`, `updateShop()` | Modal shop |
| `reset`, `deploy`, `fire` | event handlers at the bottom of `game.js` | |
| `joystick`, `[data-hold]` | input section at the bottom of `game.js` | |

**Rule:** `updateHud()` is the only function that writes the HUD, and it is cheap enough to
call freely. Add a field there rather than sprinkling DOM writes through game logic.

---

## 15. House rules

- 2-space indent, semicolons, single quotes, `'use strict'` at the top.
- No dependencies, no build step, no assets. Keep it openable with a double-click.
- State lives in module-scope `let`; helpers are hoisted `function` declarations.
- Small pure helpers are arrows: `const clamp = (v, min, max) => …`, `const byId = id => …`.
- Functions are verbs (`fire`, `settleTank`); data is nouns (`terrain`, `shells`).
- One CSS rule per line, grouped by concern. Theme values live in `:root` custom properties —
  don't hard-code a colour that already has a variable.
- Tunable numbers belong in `progression`, `weapons` or `catalog` — not inline.
- Comment the *why*, not the *what*. The existing comments are load-bearing.

---

## 16. Run, check, ship

```bash
# play it
open index.html                       # or:
python3 -m http.server 8000           # then http://localhost:8000

# sanity check before committing — catches syntax errors instantly
node --check game.js

# ship
git status
git commit -am "Your change"
git push                              # origin: github.com/DevCabin/torched-planet
```

Vercel treats this as a static site: no build command, no output directory override, no
environment variables. Pushing to `main` is the deploy trigger once the project is linked.

---

## 17. Recipes

### Add a weapon

1. `weapons` — add `{ name, radius, damage, color }`, plus `lethalSplash: true` if splash
   should kill unshielded tanks.
2. `catalog[0][1]` — add `{ id, name, price, detail }` so it can be bought.
3. `makeTank().ammo` — add the key with a starting count (`0` unless it is a freebie).
4. `fire()` — only if it needs custom launching (see how `spread` maps offsets).
5. `impact()` — only if it needs an on-hit behaviour (see how `napalm` seeds `burns`).

**Trap:** skipping step 3 leaves `ammo[id] === undefined`, so `fire()` treats the weapon as
empty and `updateWeapons()` silently marks it disabled.

### Add a shop item

Add it to the right `catalog` section. `updateShop()` and the DOM pick it up automatically.
`purchase()` handles exactly three kinds: `hp` items, `id === 'fuel'`, and everything else as
ammo. A new *kind* of item needs a branch in `purchase()` **and** a rule in `canBuy()`.

### Add a map

1. `makeMap()` — add the name to the array and give it a terrain formula.
2. `palette` — add a four-colour entry keyed by the same name (sky top, sky bottom, ground top,
   ground edge).
3. `drawBackdrop()` — optionally branch the skyline the way `Rooftop District` does.

**Trap:** a map name with no `palette` entry leaves `palette` undefined and blanks the canvas.

### Add a HUD field

Add the element to `.hud` in `index.html`, write it in `updateHud()`, and remember `.hud` is a
**5-column grid** — a sixth cell needs a `grid-template-columns` change. Meters need their
`max` to match the scale (power 100, angle 180, shield 5).

### Make the gun gentler (or snappier)

Only three numbers: the `16` rate, the `.65` ramp window, and the `.25` Shift factor in
`update()` (§12). Changing power's effect on *range* instead means editing `launch()`'s
`85 + power * 4.65`, which moves everything, including the CPU's search range.

### Persist a best level

There is no storage layer today. The smallest honest version: read `localStorage` in
`reset()`, and write it in `finishShot()` where the run ends (`phase = 'over'`).

---

## 18. Known limitations

- **No automated tests.** Verification is `node --check` plus playing it.
- **One global mutable namespace.** No encapsulation; a typo can silently clobber state.
- **No persistence** — level and bank vanish on reload.
- **The CPU search is synchronous** (385 simulated shots in a single tick).
- **The canvas is not DPR-scaled**, so it looks soft on high-density displays.
- **No audio.**
- **Napalm splash never carves** (`carve = false`), so fires burn on top of terrain.
- **The heightmap cannot represent caves**; blasts only carve when they span the surface.
- **`round` is overloaded** — it is both turn counter and level. Splitting "rounds within a
  level" out would need a second variable.

---

## 19. Glossary

| Term | Meaning |
| --- | --- |
| **Bank** | `tank.cash` — score and spending money are the same number |
| **Level / round** | The same counter (`round`); increments after each completed cycle |
| **Wave** | A level transition: CPU destroyed, new target deployed (`nextWave()`) |
| **Support** | Highest ground under the tank's footprint (`support()`), vs raw surface (`ground()`) |
| **Carve** | Lowering `terrain[col]` to create a crater |
| **Direct** | The tank object a shell actually struck (`blast(x, y, weapon, direct)`) |
| **`lethalSplash`** | Weapon flag letting splash kill an *unshielded* tank |
| **Phase** | One of `shop`, `aim`, `bot`, `flight`, `over` |







