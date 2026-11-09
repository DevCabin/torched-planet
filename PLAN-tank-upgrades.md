# Plan — Hull Armour Upgrades (Tank II / Tank III) and CPU Tiers

Written before execution per the Secret Lab Protocol (rule 2). Approved by Dr Featherstone after
plan-mode review; the one amendment he added was **CPU armour tiers at high levels so the late game
stays a fight**, which is folded in below.

---

## The ask

Expensive upgrades under **Defense**: **Tank II** with 2 hit points and no shield for **$2000**, and
**Tank III** with 3 hit points for **$5000**, each with a new tank icon colour. Plus CPU tiers at
high level.

## What the code forced

| Finding | Consequence |
| --- | --- |
| `tank.hp` is the **shield**, `alive` is the death flag | Hull points must be a **new stat** (`armor` / `armorMax`). Overloading `hp` would break `collision()`'s shield-bubble test, the enemy gauge and `shield-meter` |
| `nextLevel()` rebuilds only `tanks[1]`; `tanks[0]` is repaired in place | An upgrade on the player tank persists across duels for free — no carry-over plumbing |
| `aimBot()` does `catalog[1][1].slice().reverse().find(item => canBuy(bot, item))` | Any affordable item in `Defense` is bought by the CPU. Armour must be filtered out of that search |
| `.hud` is `repeat(5,1fr)` desktop / `repeat(3,1fr)` phones | Show the tier as a suffix in the SHIELD cell; do not add a sixth cell |
| `color` is a `makeTank()` argument | Recolouring a tier is one assignment |

## Design

```js
const armorTiers = [
  { tier: 1, name: 'Tank I',   color: '#d5fa71' },   // today's lime
  { tier: 2, name: 'Tank II',  color: '#ffd166' },   // signal amber
  { tier: 3, name: 'Tank III', color: '#c79bff' }    // violet
];
```

- **Hull damage = 1 hit point per hit**, whatever the shell. A direct hit or `lethalSplash` contact
  consumes one point; at zero the tank is destroyed ($100). A surviving hull hit pays **$40** and
  counts in a new `report.armor` / "hull hit ×n" tag.
- **Standard tanks are `1/1`, so unupgraded behaviour is bit-identical** — the existing harness
  assertions keep their meaning.
- **Ladder enforced:** `canBuy` requires `armorMax === item.armor - 1`, so Tank III needs Tank II.
  Total base cost $7000, in two purchase moments.
- **Restored each duel:** `nextLevel()` sets `armor = armorMax`; `reset()` returns to tier 1.
- **CPU tiers** by level, a few levels behind the player's purchase arc:
  `cpuArmor: level => level >= 16 ? 3 : level >= 9 ? 2 : 1`.
- **Display:** SHIELD cell suffix (`OFF · II`), `#enemy` gains `· HULL n` at tier 2+, and
  `drawTank()` draws hull pips above both tanks when `armorMax > 1`. The gauge is untouched.
- Shop buttons for armour tiers carry a colour swatch so the shop teaches the icon.

## Steps

1. `game.js` — `armorTiers` + `armorColor()`, catalogue entries, `progression.cpuArmor`, `makeTank`,
   `blast` hull branch, `report.armor`, `finishShot` tag, `canBuy` ladder, `purchase` armour branch,
   `shieldFor()` extracted from `aimBot`, `reset`/`nextLevel` wiring, `updateHud` labels,
   `drawTank` pips, shop swatch.
2. `style.css` — `.catalog button i` swatch rule only.
3. `tools/drive.js` — the seven assertions below.
4. `README.md` — direct-hit rule, gauge paragraph, depot prices.
5. `PROJECT.md` §5, §10, §11, §12, §15, §18, §19, §21; `CHANGELOG.md` under `[Unreleased]`.

## Verification

| Assertion | Guards |
| --- | --- |
| Tank II grants `armor 2/2` and recolours | Purchase + icon colour |
| A Basic hit strips one point from Tank II and it survives | Hull branch |
| The same hit still kills a standard tank | Unupgraded behaviour unchanged |
| `shieldFor()` never returns armour at `$1e9` | CPU cannot buy tiers |
| `cpuArmor(1/9/16)` = 1/2/3 | Tier curve |
| `nextLevel()` deploys the CPU with `cpuArmor(level)` | Wiring, not just the formula |
| `reset()` returns the player to tier 1 and lime | ↻ New battlefield clears it |

Plus `node --check game.js`, the full headless harness (expecting 21 green), and a live check that
Vercel's push-to-deploy serves the new `game.js`.

## Retire

Once green and pushed, fold the decisions into `PROJECT.md` §18 and the `CHANGELOG`, then delete
this file — the workflow `PROJECT.md` §1 now documents.
