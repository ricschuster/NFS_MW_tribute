# 3. Separate simulation from rendering for testability

- Status: accepted
- Date: 2026-09-04

## Context

Early on, all game state and logic lived in `Game`, alongside the canvas, the
keyboard `Input`, and the `requestAnimationFrame` loop. That coupling meant the
interesting behaviour — player physics, traffic collisions, the police pursuit,
the Blacklist race flow — could only be exercised by a human playing in a
browser. Unit tests could reach the pure helpers (`math`, `road` geometry) but
nothing that ties them together, so integration regressions were invisible to
CI and only caught by manual play.

## Decision

Split the simulation out of the presentation:

- **`world.ts`** owns all game state and a single pure entry point,
  `step(dt, input)`, with no canvas, `window`, or `requestAnimationFrame`. Input
  arrives as a plain `InputState` snapshot. `WorldOptions.traffic` lets tests
  run a deterministic, traffic-free road.
- **`game.ts`** is presentation only: it owns the canvas, `Input`, the animation
  loop, audio, touch controls, and all drawing, and advances a `World` it reads
  from. The top-level title/pause/restart state machine also lives here.

New *behaviour* goes in `World`; only *drawing* goes in `Game`.

This enables **playtests** (`world.playtest.test.ts`): a test constructs a
`World`, feeds scripted `InputState` over time via a small driver, and asserts
on the resulting state (reaches top speed, brakes and reverses, gets busted when
idle, escapes at full throttle, wins/loses a race, crashes into a placed car).
They run in `npm run test` and gate CI.

## Consequences

- Integration behaviour is covered headlessly and in CI, not just by manual
  play. The Blacklist race even surfaced a real bug during development (a
  throttle-only bot drifts off on curves and loses — the intended skill gate).
- A clear rule for where code goes; `Game` stays a thin renderer.
- The genuinely presentation-only parts — screens, input gating, audio, touch,
  the rear-view mirror — remain untested by playtests and are verified manually.
  That is an accepted limitation, not an oversight.
- Determinism note: gameplay randomness that would affect assertions (traffic
  placement) is disabled in playtests; the pursuit's only randomness (a cop's
  spawn lane) does not affect any asserted outcome.
