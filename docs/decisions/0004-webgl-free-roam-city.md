# 4. WebGL free-roam city, superseding pseudo-3D

- Status: accepted
- Date: 2026-09-05
- Supersedes: [0002](0002-pseudo-3d-rendering.md)

## Context

The project was built as a tribute to *Need for Speed: Most Wanted* (2005) -
Rockport, a Blacklist of fifteen, bounty and milestones. The intended target was
always *Most Wanted* (2012): Criterion's Fairhaven, a Most Wanted list of ten,
Speed Points, cars found parked in the world rather than bought, and no story.

The two games differ in a way that reaches the renderer. The 2005 game can be
approximated by a single road you drive along. The 2012 game cannot: its design
is load-bearing on free roam. EasyDrive (menus while driving, never pausing),
Jack Spots, the 123 billboards, speed cameras, security gates, and starting an
event by driving to it all assume a city you can go anywhere in.

ADR-0002 chose a pseudo-3D projected-segment renderer and explicitly rejected
WebGL as out of scope. That decision was right for a single-track racer and is
wrong for this target. Three options were weighed:

1. A street graph of ribbons, choosing a direction at junctions.
2. A mode-7 perspective ground plane, giving free roam on a flat map.
3. A real 3D scene in WebGL.

Two requirements settled it, and both are hard technical gates rather than
matters of taste:

- **Roads over roads.** Fairhaven's elevated I-92 crosses surface streets, with
  tunnels, ramps and jumps. A projected ribbon and a mode-7 ground plane can
  each represent only one surface at a given map position, so neither can
  express an overpass at all.
- **Camera freedom.** *Most Wanted* (2012) inherited Burnout's takedown and
  crash cameras, which cut to an angle away from the car. Both 2D approaches
  offer exactly one camera, fixed behind the car.

## Decision

Rebuild the renderer as a **real 3D scene in WebGL, using three.js**.

- The car has a position and orientation in a 3D world and can be driven
  anywhere, replacing "distance along a fixed track".
- Fairhaven is generated procedurally: a street network, extruded building
  blocks per district, and an elevated interstate. No modelled assets, so no
  asset pipeline and nothing licensed.
- Cameras become a first-class concept: chase, takedown, crash and event intro.
- three.js is accepted as the project's first runtime dependency, per the rule
  in CLAUDE.md that new dependencies are allowed with an ADR recording why.
  Raw WebGL was considered and rejected: shaders, buffers, matrices and culling
  written by hand is a large amount of work that buys nothing here.

ADR-0003, separating the simulation from rendering, is unaffected and becomes
more important rather than less. `world.ts` stays a headless `step(dt, input)`
with no renderer in it, and the playtests keep working against it.

## Consequences

- `road.ts` and `render.ts` are retired. The projected-segment technique, hill
  occlusion and the per-segment sprite scaling all go with them.
- `world.ts` keeps its fixed timestep, its pursuit, heat and race logic, but its
  motion model changes from one dimension along a track to a position and
  heading in the world. The `maxSpeed` cap tied to `SEGMENT_LENGTH / STEP`
  exists only to stop the car skipping a segment, and is no longer needed.
- The build stops being dependency-free. It still builds to static files and
  still deploys to GitHub Pages.
- The game will be less playable than it is today for as long as the renderer
  is being rebuilt. This was accepted deliberately.
- `npm run feel` keeps working, since it drives `World` and not the renderer,
  but every measurement that assumes a single track has to be reinterpreted.
  `npm run shot` keeps working, since it screenshots a canvas either way.
- Performance characteristics invert: WebGL is faster than Canvas 2D for this,
  which matters for the existing mobile touch support.
