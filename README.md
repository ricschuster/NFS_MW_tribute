# CROSSTOWN

**Crosstown** is an open-world arcade street racer set in Kestrel Bay: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits that escalate through six
heat levels. Built with TypeScript + Vite, deploys anywhere as static files.

Original work. It takes its cues from the open-world street-racing genre, but
the city, the cars, the rivals and every asset in it are its own.

> **Status: mid-rebuild.** What is deployed today is *two* things at once - the
> finished single-track racer, and the generated city that is replacing it.
> Both are live, at different URLs. See
> [ADR-0004](docs/decisions/0004-webgl-free-roam-city.md).

## Where to go

Everything runs from the one deployment; the query string picks what you get.

| | |
| --- | --- |
| **[▶ Play the game](https://ricschuster.github.io/NFS_MW_tribute/)** | The finished pseudo-3D racer: one closed track, traffic, police, a rival ladder. This is the game. |
| **[▶ Drive in Kestrel Bay](https://ricschuster.github.io/NFS_MW_tribute/?renderer=drive)** | A car in the generated city: free roam, traffic, a six-level police pursuit, roadblocks, and takedowns. |
| **[▶ Fly over the city](https://ricschuster.github.io/NFS_MW_tribute/?renderer=city&view=aerial)** | A free camera over Kestrel Bay, for looking at the map rather than driving it. |
| [The 3D renderer on the old track](https://ricschuster.github.io/NFS_MW_tribute/?renderer=3d) | The same game as the first link, drawn with three.js instead of Canvas. Kept side by side while the renderer is swapped. |

**Driving** (`?renderer=drive`): WASD or arrows to drive, **shift** for
nitrous, **B** to glance behind. Speed, nitrous, heat, Rep, takedowns and a
heading-up minimap are drawn over the world. Rep is earned from everything -
takedowns, roadblocks gone through, cars threaded at speed, and every second
you stay at large - and everything is worth more while they are chasing you. The camera opens on a pass around
the car, chases it with a field of view that widens with speed, and cuts away
when you hit something. Ram a cop hard enough and squarely enough and you wreck
it: time slows and the camera swings round the wreck. From heat two the police
start parking cruisers across the road in front of you, sometimes with a gap
and, the hotter it gets, more often without. From heat three they also send
Enforcers: heavy units that come at you head on and steer for the lane you are
in rather than the one beside it. From heat four they lay spike strips across
most of the road, and running over one takes your top speed and most of your
steering for a few seconds. From five a helicopter joins in: it never touches
you, it keeps you *seen*, so the search never starts while it is up there and
the way out is cover rather than speed. All of that is off under
`prefers-reduced-motion`, which leaves a plain camera behind the car.

**Flying** (`?renderer=city`): WASD or arrows to move, **Q**/**E** down and up,
**drag** the mouse to look, **hold ctrl** for four times the speed. Speed
scales with altitude, so climb to cross the map quickly.

Add `&view=` to the flying URL to start at a fixed viewpoint. They exist so
screenshots are comparable between runs, and they are the quickest tour of the
city:

| `&view=` | What it shows |
| --- | --- |
| `overpass` | The interstate crossing over a street on its pillars. This is the thing the old renderer could not draw at all, and the reason for the rebuild. |
| `aerial` | The whole 5 x 4 km island: districts, the river, the bay, the freeway loop. |
| `downtown` | The towers, with the water behind them. |
| `street` | Street level, looking down a downtown block to the bay. |
| `bridge` | One of the three river crossings. |

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

**Today**, the world is a flat list of **road segments** with fixed geometry,
generated once at startup (`src/game/road.ts`). Each frame we project every
visible segment from world space to the screen (`src/game/render.ts`) — farther
segments scale down, which produces the pseudo-3D depth. The player never
actually moves in 3D; the road is redrawn around a fixed camera. See
[ADR-0002](docs/decisions/0002-pseudo-3d-rendering.md) for the original
rationale.

**Where it is going**, per
[ADR-0004](docs/decisions/0004-webgl-free-roam-city.md): a real 3D scene in
three.js, where the car has a position and heading in the world and can be
driven anywhere. Kestrel Bay is generated procedurally — a street network,
extruded building blocks per district, and an elevated interstate — so there is
no asset pipeline and nothing licensed. That is what buys overpasses, and
cameras that can leave the car for a takedown or a crash.

The reason the rebuild is survivable is the split below: `world.ts` and the
playtests are meant to come through it largely intact.

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
    rivals.ts     the 15 rivals (name, car, difficulty)
    progress.ts      rank progression persisted to localStorage
    audio.ts         synthesized engine / siren / pad (WebAudio)
    touch.ts         on-screen touch controls for mobile
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
- [x] **The Ladder** — sprint races against 15 rivals, ranked progression (saved)
- [x] **Nitrous + drift feel** — SHIFT boost with a meter, cornering slide, speed lines
- [x] **Sound** — synthesized engine (pitches with speed), pursuit siren, title pad, M to mute
- [x] **Roadside scenery** — trees, billboards, and lamp posts projected alongside the road
- [ ] **Sprites over vector art** — replace drawn car/road with pixel art

## Docs

- [Project brief](docs/design/00_project_brief.md) — what we're building and why
- [Architecture decisions](docs/decisions/) — ADRs for the choices that stick

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).

This is a non-commercial fan tribute. *the genre* and *the ladder* are
trademarks of Electronic Arts Inc. This project is not affiliated with or
endorsed by EA. No original game assets are included.
