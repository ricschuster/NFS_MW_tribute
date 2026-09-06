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

Crosstown spent most of its life mid-rebuild: [ADR-0004] replaced the renderer,
[ADR-0005] replaced the shape of the city under it, and [ADR-0006] deleted the
game they were replacing. The ground has stopped moving now, but this is still
one person's project with one person's plan, and coordinating a queue costs
more than it returns.

[ADR-0004]: docs/decisions/0004-webgl-free-roam-city.md
[ADR-0005]: docs/decisions/0005-the-shape-of-kestrel-bay.md
[ADR-0006]: docs/decisions/0006-the-city-is-the-game.md

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
  constraints.
- Keep behaviour in `cityworld.ts` and drawing in `scene/`. That split is the
  only reason the renderer could be swapped, and the old game deleted, without
  taking the game with it (ADR-0003, ADR-0006).
- The city generator emits descriptions, never geometry, and never imports
  three.js. That seam is what lets the art be upgraded without a rewrite.
- Tune game feel via `src/game/constants.ts` first.
- No new runtime dependencies without an ADR explaining why.
- No em dashes in prose or comments; use a hyphen or reword.

### Looking at things

These tools exist because whole classes of bug turned out to be invisible to
tests and obvious on sight.

```bash
npx playwright install chromium   # one-time, ~180 MB browser
npm run city                      # the generated city from above
npm run cityshot                  # the 3D city, and the driving views
```

`npm run city` draws the layout from above; `-- --seed N` tries another one.
`npm run cityshot` answers the different question of whether it looks like a
city, and starts its own server. Nearly every real defect in the generator so
far was found by one of these and none by its tests, which passed throughout.

### Feel checks

How the car *feels* is a judgement call, but most of what goes into it is
measurable. `npm run citylap` drives a headless reference driver round all six
generated routes and reports what it held on each: lap completed, time, average
speed as a fraction of top speed, crashes, damage taken, and how far off its
line it ever strayed. Every route runs twice, empty and in traffic - traffic
roughly halves the pace, so the empty number on its own describes a game nobody
plays.

```bash
npm run citylap                                      # print the table
npm run citylap -- --out docs/city-baseline.json     # re-record the baseline
TRACE='Old Quarter' npm run citylap                  # watch one drive
```

It asserts nothing (the playtests do that) - it exists so a change to
`constants.ts` is a before/after diff instead of a guess. Everything random is
seeded, so two runs of the same constants are identical. Re-record the baseline
in the same PR that changes the tuning, so the diff shows what moved.

Read the numbers as a floor, not a target: the driver holds a lane at a margin
under the grip limit, never takes a racing line and never touches nitrous, so a
player has headroom it does not. And the probe that came before this one was *wrong* three
times, every time because its reference driver had stopped being a good driver.
If a number looks strange, suspect the probe before the game.

Three more, which answer different questions:

```bash
npm run pace                      # can the police be outrun?
npm run patrol                    # twenty minutes with the police live
npm run patrol -- --minutes 5 --quiet
npm run drivers                   # the same routes at four skill levels
npm run drivers -- --driver beginner --route "Old Quarter"
```

`npm run pace` is a guard rather than a report. The police run at fractions of
*your* top speed and `HEAT_LEVELS` keeps every one under 1 on purpose, because a
pursuit you cannot outrun on speed alone has no answer in it. That invariant has
been broken twice by accident and neither time went red, because nothing
compared the two numbers. This does, and it exits non-zero if an undamaged car
cannot outrun a level. Damaged and shredded rows are reported and not asserted:
whether they are meant to hold is #170.

`npm run patrol` is the opposite - an instrument that asserts nothing. It puts
the reference driver in the city with the police live and reports what the game
did: when heat rose, what turned up, how many roadblocks and spikes, and what it
all paid. It found three issues on its first run. Two of its numbers are skewed
by the driver following a centreline and lapping one route rather than running
(#171), and the output labels the rows that affects.

`npm run drivers` exists because `citylap`'s driver is *perfect* - it holds its
lane exactly, looks the whole braking window ahead, never misjudges a corner and
never once stops paying attention. That is the right control and the wrong
target. The other three drivers add the four things a person does wrong, all
seeded so their mistakes land in the same places each run, and the gap between
the bottom row and the top is the part of the game's difficulty that comes from
the player rather than from the car.

What no probe covers is the ladder - see issue #166.
