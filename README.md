# Cube Labyrinth – browser game

A small 3D game where you rotate a cube that contains a maze. Inside the cube there is a glowing ball that reacts to gravity and collides with the maze walls. Most of the maze stays dark; only the area around the ball (and the green goal) is lit.

## Running the game

You don't need to install anything to try it – you can open the game directly in your browser:

1. Go to the `Peli` directory and open `index.html` (double-click it or drag it into a browser window).
2. In the browser:
   - drag with the left mouse button held down to tilt the cube
   - watch the ball roll through the corridors under gravity and collisions until it reaches the green goal

A modern browser is recommended (Chrome, Edge, Firefox, Safari).

## Option: lightweight dev server

If you prefer to run it through a small HTTP server:

```bash
cd Peli
npm install
npm run start
```

Then open in the browser the address printed by `serve` (usually something like `http://localhost:3000`).

## Difficulty levels

When you first open the game, you must choose a difficulty:

- **Easy**: smaller cube, fewer maze cells (3×3 grid per level) and shorter paths.
- **Medium**: default cube size and maze density (4×4 grid per level).
- **Hard**: larger cube with a denser maze (6×6 grid per level) and longer, more winding routes.

Each time you click **New level** after finishing, a new random maze is generated with the same difficulty.

## Technical notes

- **Three.js** is loaded directly from a CDN as an ES module, so no bundler or build step is required.
- The cube shell, maze walls and ball live in the same `Group`, which is rotated based on mouse movement.
- The ball:
  - moves under gravity
  - collides with the inner cube walls and maze walls (simple sphere-vs-AABB collision detection)
  - carries a small `PointLight` that illuminates only nearby surfaces
- The green goal is represented by a light-only cube with bright green outline edges and its own point light.

You are free to modify `main.js` to add a more advanced maze generator, extra mechanics (timers, score, hazards), or different kinds of goals and win conditions.

