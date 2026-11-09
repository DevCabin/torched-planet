# Torched Planet

A turn-based artillery duel built with HTML, CSS, and vanilla JavaScript — an homage to Scorched Earth. Play as the left tank against a CPU opponent across randomized salt flats, hills, and city rooftops.

Working on the code? [`PROJECT.md`](PROJECT.md) is the single source of truth — current state, architecture, the state model and phase machine, ballistics, wind, terrain carving, economy, the CPU search, the DOM contract, a decision log, step-by-step recipes, known traps and a roadmap.

## Play

**https://torched-planet.vercel.app**

A desktop keyboard and a touch screen both work; turn the phone sideways for the full-height battlefield.

## Run locally

Open `index.html` in a modern browser. You can also serve this directory with `python3 -m http.server 8000` and open http://localhost:8000.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Aim turret | Left / Right or A / D | Drag joystick sideways |
| Change power | Up / Down or W / S — hold to accelerate, tap for 1% steps | Drag joystick vertically |
| Fine aim | Hold Shift while adjusting power | Drag joystick gently |
| Move tank | Z / X | Hold L / R |
| Fire | Space | Tap Fire |

## Rules

- Both tanks start with unlimited Basic shells, three Large shells, full fuel, and an empty wallet. A shop opens before every player turn. The CPU can spend its own earnings on supplies.
- **Levels are duels, not turns.** A round is one full exchange of shots, and the HUD's `ROUND` counter restarts with each duel; the level advances only when a tank is destroyed — yours or the CPU's. The next round is then played at the next level, on a new battlefield, with both tanks fresh and your bank intact. Destroying the CPU pays a $250 × level duel bonus; losing a duel still advances the level and pays a $60 × level salvage.
- **Rising bank.** Shot rewards scale 30% per level while shop prices scale 20% per level, so the wallet slowly outgrows the market. The CPU gains `level - 1` shield HP and a growing shopping allowance, and its marksmanship climbs from genuinely sloppy at level 1 (roughly a 14% chance of hitting you) to near-perfect by level 11.
- **Wind.** Each duel is fought in a wind rolled when the level starts, shown in the field bar as `WIND ▶ 12` (blowing right), `WIND ◀ 7` (left) or `WIND · CALM`. It is deliberately mild — at full strength it drifts a typical shot by about one blast radius, and a maximum-range shot by roughly 100 px. The CPU simulates the same wind, so it aims into it.
- **Enemy gauge.** The vertical bar on the right edge of the battlefield is the CPU's shield: the lime fill is its remaining HP out of 5, and the red hatched band at the top of that fill is how much of the shield your loaded weapon would strip. An empty bar with a `0` means no shield — one clean hit destroys a *standard* tank, and from level 9 the enemy readout adds `· HULL n` because the CPU has hull points of its own.
- A direct Basic hit destroys an exposed standard tank. Shields absorb a hit using their remaining HP, and any excess damage on that hit is absorbed. Nuke and Napalm can also destroy an exposed tank with splash.
- **Hull upgrades.** The depot sells **Tank II** ($2000, two hull hit points) and **Tank III** ($5000, three), one rung at a time. Once the shield is gone, each hit takes one hull point — whatever the shell — and the hull is repaired at the start of every duel, so the upgrade lasts the whole run. It changes the chassis colour (lime → amber → violet) and adds pips above your tank; the SHIELD readout gains a tier, like `3 HP · III`. From level 9 the CPU fields two hull points of its own, and three from level 16.
- The same wallet acts as score and spending money. Earn $100 for destroying the opposing tank, $50 for a shield hit, $25 for a near miss, and $35 if an opponent survives a drop caused by your shot — each multiplied by the level reward rate shown in the HUD.
- Fuel is spent by distance, with up to 45 battlefield units of travel per turn. A Fuel Can adds up to 45 percentage points. Craters can block travel, and drops never damage a tank.
- The supply depot stocks Nuke ($160), 5 Spread ($85), Napalm ($105), Weak Shield (1 HP, $50), Medium Shield (3 HP, $115), Strong Shield (5 HP, $175), Tank II (2 hull hit points, $2000), Tank III (3 hull hit points, $5000) and Fuel Can ($35). These are base prices; the depot scales them 20% per level.

## GitHub and Vercel

Push the contents of this directory to a GitHub repository, then import that repository in Vercel. Keep the repository root as the project root. The included `vercel.json` configures a static deployment from that directory. There are no dependencies, build steps, or environment variables.
