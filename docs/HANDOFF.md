# Session handoff

Where the project stands, so a fresh session can pick it up without re-deriving
anything. This is a solo project: see [CONTRIBUTING](../CONTRIBUTING.md).

- **Repo:** github.com/ricschuster/NFS_MW_tribute · branch `main`
- **Play (live):** https://ricschuster.github.io/NFS_MW_tribute/
- **Status:** mid-rebuild, and deliberately so. Read ADR-0004, then ADR-0005.

## What this is

**Crosstown**, an open-world arcade street racer set in **Kestrel Bay**: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits that escalate through six heat
levels.

Original work. It takes its cues from the open-world street-racing genre, not
from any one game. No third-party names, places, cars or assets are in the repo,
and none should be added.

### The names are placeholders

*Crosstown* and *Kestrel Bay* were picked so the rename was not blocked on a
decision. Both are one find-and-replace away from anything better:

- `Crosstown` appears in `README.md`, `CLAUDE.md`, `index.html` (title and `h1`),
  `package.json`, and the `crosstown.progress.v1` save key in `progress.ts`.
- `Kestrel Bay` appears in `README.md`, `CLAUDE.md`, ADR-0004, and issue text.

**The GitHub repository slug was left alone on purpose.** Renaming it would
break the published Pages URL and every link pointing at it. If you want it
renamed, `gh repo rename` does it, then update the Pages URL in `README.md` and
this file, and expect old links to die.

## The state of play, honestly

Two renderers currently run against the same simulation:

| | |
| --- | --- |
| `/` | the original pseudo-3D projected-segment racer. Complete and polished. |
| `/?renderer=3d` | the three.js scene that replaces it. Playable, plain-looking. |

The 3D path draws the same track, traffic, rival and HUD, and is the one being
built on. The 2D path keeps the game playable while that happens; it is retired
by ADR-0004 and disappears once the city lands.

**The game will get worse before it gets better**, and that was accepted
deliberately when the direction was set. The deployed build is a finished
single-track racer; the destination is an open city that currently has neither
traffic, police, nor events in it.

## The decision that shapes everything

[ADR-0004](decisions/0004-webgl-free-roam-city.md) supersedes ADR-0002 and moves
the renderer to a real 3D WebGL scene using three.js, with the city generated
procedurally. Two requirements forced it, both hard technical gates rather than
matters of taste:

- **Roads over roads.** An elevated interstate crossing surface streets cannot
  be expressed by a projected ribbon or a mode-7 ground plane at all - each can
  only represent one surface at a given map position.
- **Cameras that leave the car**, for takedowns and crashes. Both 2D approaches
  offer exactly one camera, fixed behind the car.

[ADR-0003](decisions/0003-separate-simulation-from-rendering.md), the
simulation/rendering split, is untouched and matters more than ever. It is the
reason the renderer can be swapped at all: `world.ts` has no DOM in it, so the
playtests kept passing through both #81 and #82.

## Architecture

```
src/game/
  world.ts        headless sim: step(dt, input). All behaviour goes here.
  game.ts         presentation: canvas, input, loop, HUD, the 2D renderer
  scene/          the three.js renderer (scene3d, ribbon, cars)
  road.ts         the authored track            <- retired by #83
  render.ts       world -> screen projection    <- retired by #83
  traffic, police, rivals, progress, audio, touch, scenery, input, math,
  constants, types
spike/city.html   throwaway 3D city spike; not part of the build
tools/            screenshot.mjs, feelprobe.mjs
```

**The car already moves like a free-roam car** (#82), in a road-relative frame:
distance along the track, distance across it, and a real `heading`. Motion is
velocity along the heading split onto those two axes; a bend rotates the frame
under the car; yaw is limited by `LATERAL_GRIP / speed`, which is what makes
corners need a lift. That is the same physics a free-roam car has, written in
the frame the track still provides - so **#83 swaps the frame for a city without
touching the motion model.**

## Commands

```bash
npm run dev        # http://localhost:5173  (add ?renderer=3d for the 3D path)
npm run typecheck  # run before considering anything done
npm run test       # 88 unit tests + playtests
npm run feel       # measure driving feel; --baseline docs/feel-baseline.json
npm run shot       # headless screenshots -> screenshots/*.png
npm run city       # draw the generated city from above; --seed N for another
npm run cityshot   # screenshot the 3D city from fixed viewpoints
npm run build      # typecheck + static build
```

### Three tools worth knowing about

**`npm run feel`** drives the headless `World` with scripted inputs and reports
the numbers behind driving feel: acceleration, lane-change times, the fastest
speed that holds each bend, nitrous, time-to-bust at a given pace, and every
race margin. It asserts nothing - the playtests own the invariants - so tuning
`constants.ts` is a before/after diff rather than a guess. Re-record
`docs/feel-baseline.json` in the same PR that changes tuning.

It has repeatedly caught what reasoning missed: infinite nitrous, a pursuit with
no middle, cornering that cancelled out mathematically. It has also been *wrong*
twice, both times because its reference driver was no longer a good driver. If a
number looks strange, suspect the probe's controllers before the game.

**`npm run shot`** screenshots the game headlessly. Every renderer bug in #81 -
back-face-culled road, an invisible car, a missing ground plane - was found by
looking at a PNG, not by reasoning. Use it.

**`npm run city`** draws the generated city from above. Same lesson again:
every real defect in the generator so far was found by looking at the map and
none by the 34 tests, which passed throughout. A city that is wrong is usually
wrong in a way that is obvious in a picture and invisible in an assertion -
districts in a perfect checkerboard, a waterfront that swallowed a third of the
map, hundreds of metres of nothing along a river.

## The city exists, as data

`src/game/city/` turns `CITY_SEED` into Kestrel Bay: junctions, roads, blocks,
districts and water, as plain data with no renderer in it and no `Math.random`.
The pinned city is 5 x 4 km, 2124 roads, 1288 junctions, 883 blocks, 228 km of
road and 3 water crossings.

[ADR-0005](decisions/0005-the-shape-of-kestrel-bay.md) is what it is *shaped*
like and is worth reading before changing the generator. Water is generated
first and the streets are cut against it; bridges are few on purpose because
they are the pursuit chokepoints; and generation ends by proving the city is
drivable and bridging until it is. Its rules 1-3 are built. Rules 4-7 - curved
residential streets, the interstate loop, landmarks, relief - are not, and are
written down so they get designed together rather than discovered one at a time.

Nothing is wired into `World` or the renderer yet. That is #84 and #86.

## Repo mechanics

- Branch, PR, `gh pr merge --auto --squash`. Auto-merge and branch deletion are on.
- `main` is protected; the `build` check (typecheck + test + build) must pass.
- `.github/workflows/deploy.yml` publishes to Pages on every push to `main`.
- After a merge, poll `gh pr view <n> --json mergedAt` until non-null before pulling.
- Architectural decisions get an ADR in `docs/decisions/`. New runtime
  dependencies need one saying why; three.js is the only one, via ADR-0004.

## Where the work is

36 open issues across three milestones.

**M4: Kestrel Bay rebuild (6 open)** - the renderer, in dependency order:

- **#84 city geometry** <- mostly done. The city is visible at
  `?renderer=city`: extruded buildings instanced per kind, water, bridges and
  lane markings. What is left of it is street furniture (lamps, signs,
  barriers). LOD and frustum culling were dropped on measurement rather than
  built: the whole city is about 9 draw calls and 103k triangles, so the
  premise that it needs them does not hold while buildings are boxes
- #85 the elevated interstate - the feature that decided ADR-0004, and worth
  building early enough to prove the decision was right
- #86 collision against the network, #87 traffic and police in world space,
  #88 the camera system, #89 HUD and minimap

Done: #81 (three.js scene alongside the Canvas one), #82 (the car's heading),
#83 (the city generator, plus ADR-0005's first three rules).

**M5: Open-world systems (23 open)** - heat levels and pursuit tactics,
cooldown, Rep, Street Finds, mods, the Quick Wheel, event types, takedowns,
damage and repair. Most of it waits on free roam.

**M6: Beyond the browser (5 open)** - PWA, then a desktop shell. Deliberately
last, but it is what lifts the download-size ceiling on asset quality, so the
art ladder and the packaging ladder are the same conversation.

Also open: **#14** (tune driving feel) and **#11** (art direction), both from
before the pivot and both still live.

## Known problems, not papered over

- **#105: nitrous barely matters over a race.** It works on a straight (+15.9%
  over four seconds) but the track is corner-limited enough that a lap barely
  benefits, and boosting into a corner lift actively costs time. The obvious
  fixes are wrong: a stronger boost re-creates #45, easier corners undo #82
  and #46.
- **The 3D camera does not follow the car's heading**, so a hard turn slides the
  car across the frame. That is #88.
- **Cops are placed behind the car in 3D**, which is correct, so they are out of
  shot in a forward view. The HUD mirror still shows them until #88.
- **The rival ladder has been retuned twice** and will need it again. It is
  tuned against the probe's reference driver, and every change to how the car
  drives changes what that driver can do. Expect it rather than treating it as
  a regression.
- **The feel baseline's meaning shifts as the world model does.** Lane-change
  times and corner-hold speeds survived #82; they will not survive free roam
  unchanged, because "across the road" stops being a coordinate.
- **The city's roads are axis-aligned, and that ends.** It is what keeps blocks
  rectangular and "which road am I on" cheap today. ADR-0005 rule 4 (curved
  residential streets) breaks it, so #86 cannot be written as a grid lookup.
  The cost is recorded in the ADR rather than left to be discovered.
- **228 km of road is dense** for a 5 x 4 km city. It is a tuning number rather
  than a structural one, and it is much easier to judge once there is traffic
  in it than by argument now.

## If you are picking this up cold

Read `CLAUDE.md`, then ADR-0004 and ADR-0005, then run both renderers side by
side and `npm run city` to see the map. Start on **#84**. Keep behaviour in
`world.ts` and drawing in the renderer, because that split is the only reason
this rebuild is survivable - and keep the city's *descriptions* (footprints,
heights) in the generator for the same reason.
