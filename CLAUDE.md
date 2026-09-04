# CLAUDE.md

Working rules for Claude Code in this repo. Keep this short and current.

## What this is

A pseudo-3D, OutRun-style arcade racer — a fan tribute to *Need for Speed:
Most Wanted* (2005). TypeScript + HTML5 Canvas + Vite. No game engine, no
backend; it builds to static files.

## Commands

- `npm run dev` — dev server with HMR (http://localhost:5173)
- `npm run typecheck` — `tsc --noEmit`; run before considering a change done
- `npm run test` — unit tests + playtests
- `npm run playtest` — just the headless playtests (drive the World, assert outcomes)
- `npm run build` — typecheck + production build to `dist/`

## Architecture (read before touching game code)

The renderer is a classic **pseudo-3D projected-segment** road (à la Jake
Gordon's "How to build a racing game"). Key ideas:

- The track is a fixed list of `Segment`s built once in `road.ts`. Segment
  world geometry never changes at runtime.
- Each frame, `game.ts` projects visible segments via `render.ts::project`,
  drawing back-to-front with hill occlusion. The camera is fixed; the world
  scrolls past it.
- Physics runs on a **fixed timestep** (`STEP = 1/60`) with an accumulator, so
  behaviour is frame-rate independent. Rendering happens once per animation
  frame after physics catches up.
- `maxSpeed` is deliberately capped at `SEGMENT_LENGTH / STEP` so the car can
  never travel more than one segment per physics step (which would skip
  collision/curve logic).

Tune feel via `constants.ts` first — most "how it drives / how it looks" knobs
live there.

**Simulation is split from rendering.** All game state and logic live in
`world.ts` as a pure `step(dt, input)` with no canvas or DOM; `game.ts` only
drives and draws it. Keep it that way: put new *behaviour* in `World` (so the
playtests can cover it) and only *drawing* in `Game`. Playtests
(`world.playtest.test.ts`) construct a `World`, feed scripted inputs, and assert
on state — use `new World({ traffic: false })` for a deterministic road.

## Conventions

- TypeScript is `strict`, with `noUnusedLocals`/`noUnusedParameters` and
  `verbatimModuleSyntax`. Import types with `import type { ... }`.
- Prefer small, single-purpose modules under `src/game/`. Keep rendering pure
  (draw from state; don't mutate game state inside render helpers).
- Match the surrounding comment density — explain *why*, not *what*.
- No new runtime dependencies without a note in an ADR; the whole point is a
  dependency-light static build.

## House style

- Do not use em dashes in prose or comments; use a plain hyphen or reword.
- When a decision is architectural and hard to reverse, record it as an ADR in
  `docs/decisions/` (see `0001` for the format).

## Non-goals

- Not a true 3D engine, not networked, not commercial. No original EA assets in
  the repo — everything is drawn or original.
