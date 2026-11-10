# Plan — Pixel Art Pass and the Space Backdrop

Written before execution per the Secret Lab Protocol (rule 2). Approved by Dr Featherstone:
**2× raster (500 × 260) + the art pass + space sky + squared UI**, keeping the tank a readable
16-pixel sprite.

---

## Why a raster change and not a coordinate change

Every tuned number lives in a fixed **1000 × 520 logical space** — blast radii 13–107, tanks at
x = 115/875, `GRAVITY` 205, `WIND_MAX` 14, the CPU's 385-shot search. So the art is produced by
rendering that space into a smaller raster and letting CSS scale it back with nearest-neighbour:

```js
const PIXEL = 2;                  // one art pixel = 2 logical units — the chunkiness dial
const W = 1000, H = 520;          // logical space: physics never learns about this
canvas.width = W / PIXEL;         // 500
canvas.height = H / PIXEL;        // 260
ctx.imageSmoothingEnabled = false;
ctx.setTransform(1 / PIXEL, 0, 0, 1 / PIXEL, 0, 0);
```

Physics, terrain generation, radii and the CPU search are untouched, so all 42 harness assertions
keep their meaning. This also closes §19's "canvas is not DPR-scaled, so it looks soft" limitation by
making the softness deliberate.

## The cost that makes this an art pass

Anything thinner than one art pixel disappears. At `PIXEL = 2`:

| Element | Today | Becomes | Fix |
| --- | --- | --- | --- |
| Terrain stipple | 4×1 rect | 2×0.5 — invisible | 6×2 |
| Backdrop grid | 1 px strokes | 0.5 px hairlines | retire for the starfield |
| Wheels | 3×2 rects | 1.5×1 | 4×2 |
| Shield ring | 2.5 px arc | 1.25 px ragged | square force-field outline |
| Hull pips | 6×5 | 3×2.5 | 8×6 |
| Bullet trails | 3×3 | 1.5×1.5 | 4×4 |
| `YOU`/`CPU` labels | 12 px text | 6 px | 16 px (8 art px) |
| Explosion rings | 2 px stroke | 1 px | 3–4 px |
| Barrel | 6 px round cap | 3 px | square cap, snapped |

## Steps

1. `PLAN-pixel-art.md` (this file).
2. **Raster gate** — constants, backing store, transform, `imageSmoothingEnabled`, CSS
   `image-rendering`. Verify the game boots and the harness stays green before any art changes.
3. **Palette → object** per map (sky bands, ridges, strata, star tint); **seeded sky** in
   `makeMap()` — `stars[]` and `celestial[]`, deterministic so nothing shimmers between frames.
4. `drawBackdrop()` rewrite: starfield, **at least one** blocky planet/moon (limb shading, craters),
   parallax ridges recoloured, sun blob and hairline grid retired.
5. **Terrain art pass**: flat strata, stipple 6×2, 2 px surface edge.
6. **Tank art pass**: square-cap barrel, rect hull/turret, 4×2 wheels, square force field, 8×6 pips,
   16 px labels.
7. Shells (4×4 trails) and explosion rings (3–4 px).
8. **CSS pass**: radius 0–2 px, flat fills, 2 px borders, bevel on FIRE, `pixelated`,
   deep-space `.field` background.
9. **Harness render checks**: `draw()` smoke per state, and *two consecutive draws are pixel
   identical* — the harness has never called `draw()`, so this closes a real hole.
10. Screenshots: three maps × aim/explosion, desktop + landscape mobile; iterate on legibility.
11. Docs (`PROJECT.md` §5, §9, §14, §15, §18, §19, §21), `CHANGELOG`, commit, verify deploy, retire
    this file.

## Decisions to settle by looking, not guessing

- Whether 16 px labels survive as 8-art-pixel glyphs.
- Whether a ringed planet reads at this resolution, or a plain cratered one is better.

## Verification

| Check | Method |
| --- | --- |
| Boots after the raster gate, before any art | harness, 42/42 |
| `draw()` never throws, per phase | harness render smoke |
| No per-frame randomness in the sky | identical pixels across consecutive draws |
| Legibility, silhouette, gauge contrast | screenshots, 3 maps, desktop + landscape |
| Nothing regressed | harness ×3, then ×3 against the deployed build |
