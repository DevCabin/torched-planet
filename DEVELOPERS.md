# Torched Planet: Developer's Guide

Welcome to the development guide for **Torched Planet**, a minimalist, zero-dependency artillery duel engine. This document is designed to help new contributors understand the architecture and jump into making changes.

## 🏗 Architecture Overview

The entire game is implemented in three files. There is no framework, no bundler, and no external dependencies.

| File | Responsibility |
| :--- | :--- |
| `index.html` | **The DOM & Contract**: Contains the structure of the battlefield, HUD elements, and the element-ID contract that `game.js` uses to update the screen. |
| `style.css` | **Theme & Layout**: Defines the color palettes (via CSS variables), HUD grid, and responsive breakpoints for mobile/desktop. |
| `game.js` | **The Engine**: The core logic. It handles state, physics, rules, CPU AI, terrain generation, and rendering. |

### The Core Loop
The game uses a **fixed timestep** to ensure physics consistency. This is crucial so that the CPU's ballistic simulations match the player's actual experience.

```javascript
function frame(now) {
  accumulator += Math.min(.075, (now - (last || now)) / 1000);
  last = now;
  while (accumulator >= STEP) { update(STEP); accumulator -= STEP; }
  draw();
  requestAnimationFrame(frame);
}
```

- `update(STEP)`: Handles all mutation (movement, collisions, explosions).
- `draw()`: A **pure function** of state. It reads the state and paints it to the canvas. It never mutates anything.

---

## 🧠 State Model

The entire game state is stored as module-scope variables in `game.js`. This "Single Source of Truth" approach keeps the complexity low.

### Core Entities
- **`terrain`**: An array of numbers representing the height at each pixel column.
- **`tanks`**: Exactly two objects: `[player, cpu]`.
  - `hp`: Shield hit points (starts at 0 for standard tanks).
  - `armor`: Hull hit points (tank tiers I, II, or III).
  - `x, y`: Contact position (y is the ground level).
- **`shells`**: An array of active projectiles in flight.
- **`effects`**: Temporary objects for explosions and fire.

### The Phase Machine
The game progresses through a cycle managed by a state machine:
`reset()` ➔ `openShop()` ➔ `aim` ➔ `fire()` ➔ `flight` ➔ `finishShot()`

This ensures that events (like land/crash or tank death) are handled in a predictable sequence.

---

## 🚀 Physics & Ballistics

### Integration
The game uses **semi-implicit Euler integration** for shell movement:
1.  Calculate velocity: $v_{new} = v_{old} + (gravity + wind) \times dt$
2.  Calculate position: $p_{new} = p_{old} + v_{new} \times dt$

This is computationally cheap and, when paired with a fixed timestep, allows the CPU's 385-shot simulation to be perfectly accurate.

### Collision & Terrain
- **Terrain**: A heightmap array. `ground(x)` returns the exact height; `support(x)` returns the maximum height within a small radius to ensure tanks don't sink into cracks.
- **Collision**: Uses a combination of circle (for shields/bubbles), box (for hulls), and track contact checks.

---

## 🤖 The CPU (The AI)

The CPU opponent is not a simple heuristic. It uses a **brute-force ballistic search**:
1.  **Aims**: It calculates 385 possible trajectories (varying angle and power).
2.  **Simulates**: It runs the `launch()` and `advance()` routines for each candidate.
3.  **Scores**: It chooses the trajectory that minimizes the vertical error at the target's position.

The "skill" of the CPU is simulated by adding a **jitter** (spread) and a **miss chance** (flub) to the target point, which scales with the level.

---

## 🎨 Rendering & The Pixel Grid

To achieve a retro "pixel-art" look, the game uses a **logical coordinate system** (1000 × 520) and scales it using CSS.

- **Resolution**: The canvas is actually `500 × 260` pixels.
- **The `PIXEL` Constant**: Every logical unit is mapped to `PIXEL` (currently 2). This means 1 art pixel = 2 logical units.
- **Scaling**: CSS `image-rendering: pixelated` is used on the canvas to ensure edges remain sharp and blocky rather than blurry.

---

## 🛠 How to Contribute

1.  **Read the rules**: Check `PROJECT.md` for the absolute source of truth.
2.  **Don't add dependencies**: Keep the project "zero-dependency".
3.  **Test your changes**: Run the headless driver `node tools/drive.js` (or use the harness) to ensure your changes don't break the simulation.
4.  **Respect the grid**: When adding new art/elements, ensure they align with the `PIXEL` grid.
