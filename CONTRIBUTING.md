# Working on Crosstown

**This is a solo project and is not open to contributions right now.** The repo
is public so the work can be read and the game can be played, not because help
is wanted yet. Please do not open pull requests; they will be
closed politely but quickly, and that is not a comment on the work in them.

Issues are used as the author's own planning board rather than as a queue for
anyone else to pick from. Bug reports on the deployed build are genuinely
welcome, and so is anything you think is wrong about the driving. Offers to
implement something are not, for now.

## Why

Crosstown is mid-rebuild and most of it is in flux. [ADR-0004] replaced the
renderer, [ADR-0005] then replaced the shape of the city under it, and the
issues in M4 will change the motion model, collision and the camera in turn.
Coordinating that with anyone else costs more than it returns, and a PR written
against this week's architecture would very likely be against last week's by the
time it landed. That changes once the city is drivable and the ground stops
moving; this file gets rewritten then.

[ADR-0004]: docs/decisions/0004-webgl-free-roam-city.md
[ADR-0005]: docs/decisions/0005-the-shape-of-kestrel-bay.md

## How the repo works

The rest of this file is the author's own working notes, kept here because it is
where anyone reading the code would look for them.

### Workflow

1. Branch from `main`: `type/short-description` (`feat/traffic`, `fix/offroad-decel`).
2. Run `npm run typecheck` and `npm run test` before considering a change done.
3. PR against `main`, linking the issue (`Closes #NN`). CI must pass.
4. Squash-merge once green; `main` is protected and the `build` check gates it.

### Ground rules

- Read [`CLAUDE.md`](CLAUDE.md) and the [ADRs](docs/decisions/) before touching
  the renderer, the city generator or the physics. All three have non-obvious
  constraints, and two of them are being actively replaced.
- Keep behaviour in `world.ts` and drawing in the renderer. That split is the
  only reason the renderer can be swapped at all (ADR-0003).
- The city generator emits descriptions, never geometry, and never imports
  three.js. That seam is what lets the art be upgraded without a rewrite.
- Tune game feel via `src/game/constants.ts` first.
- No new runtime dependencies without an ADR explaining why.
- No em dashes in prose or comments; use a hyphen or reword.

### Looking at things

Three tools exist because three classes of bug turned out to be invisible to
tests and obvious on sight.

```bash
npx playwright install chromium   # one-time, ~180 MB browser
npm run dev                       # serve the game
npm run shot                      # screenshots of a few game states
npm run city                      # the generated city from above
```

`npm run shot` drives the game with scripted keys and screenshots the canvas at
the title, driving, pursuit, countdown and race states. Every renderer bug in
issue #81 was found this way.

`npm run city` draws the generated city from above; `-- --seed N` tries another
one. Every real defect in the generator so far was found this way, and none by
its tests, which passed throughout.

### Feel checks

How the car *feels* is a judgement call, but most of what goes into it is
measurable. `npm run feel` drives the headless `World` with scripted inputs and
prints the numbers behind it: 0-to-top-speed, braking distance, how long a lane
change takes at each speed, the fastest speed that still holds the sharpest
bend, nitrous duration and payoff, how quickly a cop busts you at a given pace,
and how long each Ladder race runs.

```bash
npm run feel                                         # print the table
npm run feel -- --baseline docs/feel-baseline.json   # show only what moved
npm run feel -- --out docs/feel-baseline.json        # re-record the baseline
```

It asserts nothing (the playtests do that) - it exists so a change to
`constants.ts` is a before/after diff instead of a guess. Everything random is
seeded, so two runs of the same constants are identical. Re-record the baseline
in the same PR that changes the tuning, so the diff shows what moved.

It has also been *wrong* twice, both times because its reference driver was no
longer a good driver. If a number looks strange, suspect the probe before the
game.
