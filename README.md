# NFS: Most Wanted — Tribute

A pseudo-3D, OutRun-style arcade racer paying tribute to *Need for Speed: Most
Wanted* (2005). Built with TypeScript + HTML5 Canvas + Vite — no game engine,
deploys anywhere as static files.

> Status: playable foundation. You can drive an endless track with hills,
> curves, rumble strips and distance fog. Traffic, pursuits, and the Blacklist
> are on the roadmap below.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Drive with the **arrow keys** or **WASD** — Up to accelerate, Down to brake.

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Vite dev server with hot reload     |
| `npm run build`     | Typecheck, then build a static bundle to `dist/` |
| `npm run preview`   | Serve the production build locally            |
| `npm run typecheck` | Run `tsc --noEmit` with no build              |

## How it works

The world is a flat list of **road segments** with fixed geometry, generated
once at startup (`src/game/road.ts`). Each frame we project every visible
segment from world space to the screen (`src/game/render.ts`) — farther
segments scale down, which produces the pseudo-3D depth. The player never
actually moves in 3D; the road is redrawn around a fixed camera. See
[docs/decisions/0002-pseudo-3d-rendering.md](docs/decisions/0002-pseudo-3d-rendering.md)
for the full rationale.

### Source layout

```
src/
  main.ts            entry point: sizes the canvas and starts the game
  style.css          page chrome around the canvas
  game/
    world.ts         headless simulation: step(dt, input) — physics, traffic, police, races
    game.ts          presentation: canvas, input, animation loop, rendering
    road.ts          track authoring (straights, curves, hills)
    traffic.ts       traffic cars attached to road segments
    police.ts        the pursuit: heat, bust, and escape
    blacklist.ts     the 15 rivals (name, car, difficulty)
    progress.ts      rank progression persisted to localStorage
    audio.ts         synthesized engine / siren / pad (WebAudio)
    render.ts        world→screen projection and sprite drawing
    input.ts         keyboard state (arrows + WASD + Enter + P/R/M)
    math.ts          easing, interpolation, fog, looping, overlap helpers
    constants.ts     tunable world/camera/physics constants
    types.ts         shared interfaces
```

The **simulation is split from rendering**: `world.ts` holds all game state and
a pure `step(dt, input)` with no canvas or DOM, and `game.ts` just drives and
draws it. That lets the *playtests* (`world.playtest.test.ts`) drive the real
game with scripted inputs and assert on outcomes (`npm run playtest`).

## Roadmap

Ordered roughly by build order — each item is a self-contained increment:

- [x] **Oncoming/parked traffic** — sprites projected like road segments
- [x] **Collisions** — crashing into traffic costs speed (shake + flash)
- [x] **Cop pursuit** — a chaser cop that hunts you, matches lane, can be outrun
- [x] **Heat + bust/escape** — heat meter, more/faster cops, getting busted, shaking pursuit
- [x] **The Blacklist** — sprint races against 15 rivals, ranked progression (saved)
- [x] **Nitrous + drift feel** — SHIFT boost with a meter, cornering slide, speed lines
- [x] **Sound** — synthesized engine (pitches with speed), pursuit siren, title pad, M to mute
- [ ] **Sprites over vector art** — replace drawn car/road with pixel art

## Docs

- [Project brief](docs/design/00_project_brief.md) — what we're building and why
- [Architecture decisions](docs/decisions/) — ADRs for the choices that stick

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).

This is a non-commercial fan tribute. *Need for Speed* and *Most Wanted* are
trademarks of Electronic Arts Inc. This project is not affiliated with or
endorsed by EA. No original game assets are included.
