# 6. The city is the game: retiring the track sim

- Status: accepted
- Date: 2026-09-06
- Completes the migration begun in [0004](0004-webgl-free-roam-city.md)

## Context

ADR-0004 replaced the projected-segment renderer with a real 3D scene and
Kestrel Bay. It did so *without* deleting anything: the track sim (`world.ts`)
and its Canvas renderer (`game.ts`) kept running, and the city was reached at
`?renderer=drive`. That was a deliberate hedge. The rebuild was going to take
months, and shipping a broken game for those months in order to reach a better
one later is a bad trade for a project whose only player can also just open the
old URL.

The hedge has been paid off. Every system the game has now runs in
`cityworld.ts`: traffic, six heat levels, cooldown and a search area,
roadblocks, Enforcers, spike strips, the helicopter, takedowns, damage and
repair, pursuit breakers, ambushes, radio chatter, collectibles, cars found in
the world, mods, the Quick Wheel, circuits, speed runs and both halves of a
ladder fight. Rep is one currency, saved in one record, and the ladder spans
both sims because `world.ts` was made to pay into it.

So what was left was not work. It was a decision, and keeping it undecided was
costing something real:

- **Two answers to every question.** `CITY_HEAT_RISE`, `CITY_COP_LOSE` and
  `CITY_PURSUIT_RANGE` exist only because the track's equivalents meant
  something different, and reusing one caused three separate bugs. Every new
  constant had to be asked "which world is this for?".
- **Two games in every document.** The README, CLAUDE.md and the handoff each
  had to describe a finished game and its replacement, and say which sentence
  applied to which.
- **A default that was not the game.** `/` served the single-track racer.
  Anyone opening the link - including the person who owns it - got the thing
  being retired unless they knew a query string.
- **Divergence with no owner.** The two sims already disagreed about what
  winning a race means (#66). Nothing was going to reconcile that, because the
  answer was always "delete the track".

## Decision

**Kestrel Bay is the game, at `/`, with no query string.** The track sim, its
renderer and its measurement tools are deleted rather than deprecated.

Deleted: `world.ts`, `game.ts`, `road.ts`, `render.ts`, `traffic.ts`,
`police.ts`, `scenery.ts`, `types.ts`, `input.ts`, `scene/scene3d.ts`,
`scene/ribbon.ts` and their tests; `tools/screenshot.mjs`,
`tools/feelprobe.mjs` and `docs/feel-baseline.json`.

One query string survives: `?renderer=city` still flies a free camera over the
map with no car in it, and `&view=` still picks a named viewpoint. Looking at
the generator is a different job from playing the game, the screenshot tool
depends on it, and it costs one branch in `main.ts`.

`InputState` moves from `world.ts` to `cityworld.ts`. It was the only thing the
city imported from the track, and it belongs to whichever sim reads it.

## Consequences

- There is one simulation. A constant is for the city because there is nowhere
  else for it to be, and the `CITY_` prefix on the pursuit constants is now
  history rather than a distinction.
- ADR-0003 is **not** superseded. Its rule is the reason this was survivable at
  all and it still holds; only the module names in it are gone. Read `world.ts`
  as `cityworld.ts`, `game.ts` as `scene/`, and `world.playtest.test.ts` as
  `cityworld.playtest.test.ts`. Behaviour goes in the sim so the playtests can
  cover it; only drawing goes in the renderer.
- ADR-0002 now describes code that no longer exists. It stays as the record of
  why the project started where it did.
- **The ladder loses its end-to-end measurement.** `npm run feel` raced a
  reference driver against all ten rivals, and that is how
  `RIVAL_DIFF_SPEED_FRAC` was set to the value that makes the boss need
  nitrous. It drove `World`, so it could not survive. `npm run citylap` gets a
  reference driver round all six routes and is the only driving baseline left;
  it does not race a field. This is a real gap and it is tracked, not papered
  over.
- The bundle everyone downloads is the city. It was already the biggest chunk
  and was already dynamically imported; now it is not optional, so the offline
  check exercises it on the first load rather than on a second navigation.
- `?renderer=3d`, `?renderer=drive` and every link to them stop working.
  Nothing outside this repo links to them.
