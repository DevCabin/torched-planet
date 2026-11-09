# Plan — Weapon Shop Expansion

Written before execution per the Secret Lab Protocol (rule 2).

Three requests from Dr Featherstone:

1. buy **more Large shells**, relatively cheap;
2. a **large napalm** with a wider spread;
3. a **small nuke** with a tighter spread.

---

## What the code already does

Reading the shop and firing path first changed the shape of this job:

- **`canBuy()` has no ammo cap** — `tank.cash >= priceOf(item) && …`. And `purchase()`'s else
  branch is `tank.ammo[item.id]++`. So **restocking Large shells needs only a catalogue entry**
  with `id: 'large'`; no engine change at all.
- **Burn pools are fixed**: `update()` detonates each burn with a hardcoded
  `{ radius: 15, damage: 1, lethalSplash: true }`, `carve: false`. So a "wider napalm" is
  precisely *more pools, further apart* — the weapon's own `radius` only governs the initial
  blast and crater.
- `impact()` hardcodes the pool offsets: `if (id === 'napalm')` with `[-45, -23, 0, 23, 45]`.
  That must become data-driven, or every new napalm needs another `if`.
- **The documented trap applies**: `updateWeapons()` reads `tanks[0].ammo[id]` and disables an
  option only when `count === 0`. A weapon added to `weapons` without an `ammo` key yields
  `undefined`, which is *not* `=== 0`, so the option looks selectable but `fire()` refuses it.

---

## The additions

| Weapon | id | Radius | Damage | Notes | Price |
| --- | --- | --- | --- | --- | --- |
| Large shell *(restock)* | `large` | 29 | 2 | +1 shell per purchase. Cheapest thing in the shop | **$35** |
| Nuke Mini | `nukeMini` | 52 | 3 | `lethalSplash`, half a Nuke's footprint | **$95** |
| Napalm XL | `napalmXL` | 46 | 2 | `lethalSplash`, **9 burn pools** spread ±88 px | **$175** |

Existing Napalm (24 / 2 / 5 pools / $105) and Nuke (107 / 5 / $160) are untouched.

**Why these numbers:** Nuke Mini must sit clearly between Large (29/2/$35) and Nuke (107/5/$160),
so 52/3/$95. Napalm XL is the area weapon — its damage stays at 2 like plain napalm because its
identity is *denial*, not alpha, and nine pools at 1 damage each already threaten a tank that
doesn't move. $175 makes it the most expensive thing on the shelf, which is right for a weapon
that can strip 9 shield HP across a crater field.

**Burn cadence:** plain napalm keeps its exact timing (`.22 + index × .13`, five pools,
finishing at `.74 s`). Napalm XL gets a tighter step (`.075`) so nine pools resolve by `.82 s`
instead of dragging the turn to 1.8 s. Hence a per-weapon `burnStep`, defaulting to `.13`.

---

## Catalogue ordering — deliberate

`aimBot()` buys `catalog[0][1].find(item => canBuy(bot, item))`, i.e. **the first affordable
weapons item**. Appending in this order keeps the CPU's shopping behaviour closest to today's:

```
nuke · spread · napalm · nukeMini · napalmXL · large
```

`large` goes **last** so a cash-rich CPU still reaches for Nuke/Spread/Napalm first and only
falls back to cheap shells when broke. Its weapon preference list gains the new ids *after* the
existing favourites: `['nuke', 'large', 'napalm', 'nukeMini', 'napalmXL', 'spread', 'basic']` —
the CPU uses what it buys, but its opening behaviour is unchanged.

---

## Files

| File | Change |
| --- | --- |
| `game.js` | `weapons` (+2 entries, `burns`/`burnStep` on napalms); `makeTank().ammo` (+2 keys); `catalog[0][1]` (+3 items); `impact()` reads `weapon.burns` / `weapon.burnStep`; `aimBot()` preference list |
| `tools/drive.js` | three assertions: every weapon has an ammo count, a Large shell can be bought, the new weapons are stocked |
| `PROJECT.md` | §10 weapon table, §11 catalogue ordering note |
| `CHANGELOG.md` | Added entries |

## Verification

1. `node --check game.js`.
2. Harness: all `"pass":true`, `"errors":[]`, including the new
   *"every weapon has an ammo count"*, *"Large shells can be restocked"* and
   *"new weapons are stocked"*.
3. By hand: buy a Large shell in the depot and confirm the select shows `Large shell · 4`;
   fire a Napalm XL at open ground and count nine burning pools spreading outward.

## Rollback

One commit; `git revert` removes all three items. No persistence, no migration.
