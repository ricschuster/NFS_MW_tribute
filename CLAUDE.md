# CLAUDE.md

Working rules for Claude Code in this repo. Keep this short and current.

## What this is

A fan tribute to *Need for Speed: Most Wanted* (2012) - Criterion's Fairhaven:
a free-roam city, a Most Wanted list of ten, Speed Points, cars found parked in
the world, and police pursuits with six heat levels. TypeScript + Vite, no
backend; it builds to static files.

**The renderer is being rebuilt.** What exists today is a pseudo-3D
projected-segment racer on a single closed track, built against the 2005 game.
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

**Next (ADR-0004).** A three.js scene: the car has a position and heading in a
3D world, Fairhaven is generated procedurally (street network, extruded blocks
per district, elevated interstate), and cameras become a first-class concept.
`road.ts` and `render.ts` are retired.

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

- Not networked, not commercial. No original EA assets in the repo, and no
  modelled city either: Fairhaven is generated, not imported. Everything is
  drawn, generated, or original.
- Not Autolog. The 2012 game's social layer is out of scope.
- Not *Most Wanted* (2005). Rockport, the Blacklist of fifteen, bounty,
  milestones and impound strikes belong to the other game; see ADR-0004.
