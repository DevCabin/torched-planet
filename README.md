# Torched Planet

A turn-based artillery duel built with HTML, CSS, and vanilla JavaScript — an homage to Scorched Earth. Play as the left tank against a CPU opponent across randomized salt flats, hills, and city rooftops.

Working on the code? [`DEVELOPERS.md`](DEVELOPERS.md) documents the architecture — state model, phase machine, ballistics, terrain carving, economy, the CPU search, input plumbing, the DOM contract, and step-by-step recipes for adding weapons, maps and HUD fields.

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
- **Levels are duels, not turns.** A round is one full exchange of shots; the level advances only when a tank is destroyed — yours or the CPU's. The next round is then played at the next level, on a new battlefield, with both tanks fresh and your bank intact. Destroying the CPU pays a $250 × level bonus; losing a duel still advances the level but pays nothing.
- **Rising bank.** Shot rewards scale 30% per level while shop prices scale 20% per level, so the wallet slowly outgrows the market. The CPU gains `level - 1` shield HP and a growing shopping allowance, and its marksmanship climbs from genuinely sloppy at level 1 (roughly a 14% chance of hitting you) to near-perfect by level 8.
- A direct Basic hit destroys an exposed tank. Shields absorb a hit using their remaining HP, and any excess damage on that hit is absorbed. Nuke and Napalm can also destroy an exposed tank with splash.
- The same wallet acts as score and spending money. Earn $100 for destroying the opposing tank, $50 for a shield hit, $25 for a near miss, and $35 if an opponent survives a drop caused by your shot — each multiplied by the level reward rate shown in the HUD.
- Fuel is spent by distance, with up to 45 battlefield units of travel per turn. A Fuel Can adds up to 45 percentage points. Craters can block travel, and drops never damage a tank.
- The supply depot stocks Nuke ($160), 5 Spread ($85), Napalm ($105), Weak Shield (1 HP, $50), Medium Shield (3 HP, $115), Strong Shield (5 HP, $175), and Fuel Can ($35). These are base prices; the depot scales them 20% per level.

## GitHub and Vercel

Push the contents of this directory to a GitHub repository, then import that repository in Vercel. Keep the repository root as the project root. The included `vercel.json` configures a static deployment from that directory. There are no dependencies, build steps, or environment variables.
