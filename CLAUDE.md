# CLAUDE.md

Working rules for Claude Code in this repo. Keep this short and current.

## What this is

**Crosstown** is an open-world arcade street racer set in Kestrel Bay: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits with six heat levels.
TypeScript + Vite, no backend; it builds to static files.

Original work. It takes its cues from the genre, not from any one game: no
third-party names, places, cars or assets appear anywhere in the repo, and none
should be added.

**The renderer is being rebuilt.** What exists today is a pseudo-3D
projected-segment racer on a single closed track, built for a single track.
[ADR-0004](docs/decisions/0004-webgl-free-roam-city.md) moves it to a real 3D
WebGL scene (three.js) so the city can be driven freely, with overpasses and
cameras that leave the car. Read that ADR before touching the renderer.

## Commands

- `npm run dev` — dev server with HMR (http://localhost:5173)
- `npm run typecheck` — `tsc --noEmit`; run before considering a change done
- `npm run test` — unit tests + playtests
- `npm run playtest` — just the headless playtests (drive the World, assert outcomes)
- `npm run feel` — measure driving feel (accel, steering, pursuit, race length);
  compare against `docs/feel-baseline.json` after touching `constants.ts`
- `npm run city` — draw the generated city from above to `screenshots/citymap.png`;
  `-- --seed N` tries another one
- `npm run cityshot` — screenshot the 3D city from fixed viewpoints; starts its
  own server, so nothing else needs running
- `npm run build` — typecheck + production build to `dist/`

## Architecture (read before touching game code)

Two things are true at once here: what the code is now, and where ADR-0004 is
taking it. Check which one your change belongs to before starting.

**Now (being retired).** A classic pseudo-3D projected-segment road (à la Jake
Gordon's "How to build a racing game"):

- The track is a fixed list of `Segment`s built once in `road.ts`. Segment
  world geometry never changes at runtime.
- Each frame, `game.ts` projects visible segments via `render.ts::project`,
  drawing back-to-front with hill occlusion. The camera is fixed; the world
  scrolls past it.
- `maxSpeed` is capped at `SEGMENT_LENGTH / STEP` so the car cannot cross more
  than one segment per physics step. This cap exists only to protect
  per-segment logic and goes away with the segments.

**The car already moves like a free-roam car** (issue #82), in a road-relative
frame: how far along the track it is, how far across, and a real `heading` it
can be pointed with. Motion is velocity along the heading split onto those two
axes, a bend rotates the frame under the car, and yaw is limited by
`LATERAL_GRIP / speed` so corners have to be taken slower. That is the same
physics a free-roam car has, written in the frame the track still provides, so
issue #83 swaps the frame for a city without touching the model.

**Next (ADR-0004).** A three.js scene: the car has a position and heading in a
3D world, Kestrel Bay is generated procedurally (street network, extruded blocks
per district, elevated interstate), and cameras become a first-class concept.
`road.ts` and `render.ts` are retired.

**The city is data, and it exists already** (issue #83). `city/generate.ts`
turns a seed into a street graph - junctions, roads, blocks and districts - as
a pure function with no renderer and no `Math.random`, so `World` can use it
for collision and the playtests can build one headlessly. `CITY_SEED` is
content: changing it publishes a different city.

[ADR-0005](docs/decisions/0005-the-shape-of-kestrel-bay.md) is what the city is
*shaped* like, and it is worth reading before changing the generator. Water is
generated first and the streets are cut against it, bridges are few on purpose
because they are the pursuit chokepoints, and generation ends by proving the
city is drivable and bridging until it is. Rules 4-7 of that ADR (curved
residential streets, the interstate loop, landmarks, relief) are not built yet.

**The city is drawn through a provider seam** (issue #84). `city/` emits
descriptions - blocks, buildings, water - and never constructs geometry or
imports three.js; `scene/buildings.ts` turns those into one `InstancedMesh` per
kind, and `scene/cityscape.ts` assembles the scene. Keep that seam: it is what
lets boxes become models later by swapping a provider, and it is also why #86
can collide with buildings without a renderer in the room. Building footprints
and heights are city *data* for exactly that reason.

**Roads are segments, not axis-aligned lines** (issue #115). `CityRoad` used
to carry an `axis` and every geometric test leant on it; boulevards bend, so it
is gone. Direction comes from the two endpoints, and "is this point on this
road" is a distance to a segment. The street grid is still generated
axis-aligned - that is what keeps blocks rectangular - but nothing may assume
it. Boulevards go through the same pipeline as everything else rather than
being spliced into a finished graph: that was tried first and meant
reimplementing water-clipping, junction-splitting and the connectivity repair,
badly.

**Height is a real property of the network** (issue #85). Nodes have a `y`, so
two roads at the same map position and different heights are two different
places: the interstate crossing a street overhead shares no node with it, and
you cannot turn from one onto the other. That is the case ADR-0004 exists to
make possible, and it means anything asking "what is at this position" has to
ask about a height too. Tunnels are the same mechanism with the sign flipped.

**Traffic lives on the graph, not in the world** (issue #87). A traffic car is
"which road, how far along, which way"; its position is derived from that each
step. That is what makes it follow streets instead of drifting across them.
Two things about it are easy to get wrong: it is kept *around the player*
rather than spread over the map, and cars look for the one in front in **world
space**, because roads are split at every junction so the car ahead is almost
always on a different road object.

**A hit is one thing, wherever it lands** (issue #94). `impact.ts` is the whole
damage model: closing speed along the line between the two cars, how square the
hit is, and whether the car has a wall behind it. It is a pure function of two
cars and the buildings around them, so it can be asserted on in numbers rather
than judged from a screenshot. A car that reaches full damage stops being a
`GraphCar` and becomes a `Wreck` on `CityWorld` - lifted out of traffic and out
of the pursuit entirely, so nothing in either has to remember to skip it.

**A roadblock is a line, not a row of cars** (issue #59). A wall built out of
circles has holes between the circles, and a barrier you slip through by
accident is worse than no barrier: `Roadblock` is a segment across the road
with an optional hole in it, and the parked cruisers are drawn along it. They
only go on roads at least `ROADBLOCK_MIN_WIDTH` wide, because a cruiser is
nearly as wide as a lane at this scale and a block across a two-lane street is
a wall with no decision in it - which also leaves the side streets as the way
round.

**Not every cop is chasing you** (issue #61). A `Cop` has a `role`: a `chase`
unit is spawned behind you, navigates to close the distance and keeps right; an
Enforcer is spawned *ahead* of you and steers to the lane you are actually in,
so dodging it means committing late. They have their own budget in
`HEAT_LEVELS` rather than a share of `maxCops`, because spending the chase
budget on them would thin out the pursuit behind you every time one arrived in
front of it.

**There are two sims, and that is deliberate.** `world.ts` is the track model
that the deployed game still runs on. `cityworld.ts` is the same car in the
city: a position, a heading and a height, with a height-aware surface lookup
and building collision over a uniform spatial index (`city/grid.ts`). The
motion model was carried over unchanged from #82 rather than rewritten, so the
feel work in #14 and #46 still applies - only the frame it resolves into moved,
from along/across-track to x/z. Traffic, police and races come across in #87,
and `world.ts` retires when they have.

`?renderer=city` flies a camera around the city and `?renderer=drive` puts a
car in it; `&view=aerial|downtown|bridge|street|overpass` picks a fixed
viewpoint. The README lists them with controls - keep it current, since it is
the only place a person is told these URLs exist.

In dev only, `?renderer=drive` hangs the running sim off `globalThis.crosstown`
(`{ world, view, city }`). That is how `npm run cityshot` sets up shots it
could otherwise only get by luck: `takedown`, `roadblock` and `enforcer` all
put the thing being photographed in front of the car rather than driving into
one. Three things bite when writing one, all of them in the handoff: headless
renders this scene at about two frames a second (so a frame is fifteen physics
steps, and the camera director is still running its opening orbit ten seconds
in - wait on `director.mode === 'chase'`), a cop pushed in with a position and
a `t` is teleported onto its road on the next step unless the `t` matches, and
the police sweep up roadblocks the instant the pursuit stops.

Look at what you changed with `npm run city` and `npm run cityshot` - the city
is much easier to judge as a picture than as a test, and every real bug in it
so far was found that way rather than by the tests, which passed throughout.

**Unchanged either way.** Physics runs on a **fixed timestep** (`STEP = 1/60`)
with an accumulator, so behaviour is frame-rate independent; rendering happens
once per animation frame after physics catches up.

Tune feel via `constants.ts` first — most "how it drives / how it looks" knobs
live there.

**Simulation is split from rendering.** All game state and logic live in
`world.ts` as a pure `step(dt, input)` with no canvas or DOM; `game.ts` only
drives and draws it. Keep it that way: put new *behaviour* in `World` (so the
playtests can cover it) and only *drawing* in `Game`. Playtests
(`world.playtest.test.ts`) construct a `World`, feed scripted inputs, and assert
on state — use `new World({ traffic: false })` for a deterministic road.

This split is what makes the renderer swap survivable: `world.ts` and the
playtests are meant to come through ADR-0004 largely intact, so keep behaviour
out of the renderer even while the renderer is in flux.

## Conventions

- TypeScript is `strict`, with `noUnusedLocals`/`noUnusedParameters` and
  `verbatimModuleSyntax`. Import types with `import type { ... }`.
- Prefer small, single-purpose modules under `src/game/`. Keep rendering pure
  (draw from state; don't mutate game state inside render helpers).
- Match the surrounding comment density — explain *why*, not *what*.
- New runtime dependencies need an ADR saying why. three.js is accepted by
  ADR-0004; that is the bar, not a precedent for adding more.

## House style

- Do not use em dashes in prose or comments; use a plain hyphen or reword.
- When a decision is architectural and hard to reverse, record it as an ADR in
  `docs/decisions/` (see `0001` for the format).

## Non-goals

- Not networked, not commercial. No EA assets and no imported map: Kestrel Bay
  is generated from a seed, not ripped.
- Asset *quality* is a separate axis and is not a non-goal. Geometry may be
  upgraded behind the generator's interface - textures on the boxes first,
  then cars, then a modular building kit - as long as everything shipped is
  original, generated, or CC0.
- Not the online social layer. The 2012 game's social layer is out of scope.
- Not the mid-2000s template. the old city, the Ladder of fifteen, bounty,
  milestones and impound strikes belong to the other game; see ADR-0004.
