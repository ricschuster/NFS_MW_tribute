# Session handoff

Where the project stands, so a fresh session can pick it up without re-deriving
anything. This is a solo project: see [CONTRIBUTING](../CONTRIBUTING.md).

- **Repo:** github.com/ricschuster/NFS_MW_tribute · branch `main`
- **Play the game:** https://ricschuster.github.io/NFS_MW_tribute/
- **Drive the city:** [`?renderer=drive`](https://ricschuster.github.io/NFS_MW_tribute/?renderer=drive)
  · **Fly over it:** [`?renderer=city&view=aerial`](https://ricschuster.github.io/NFS_MW_tribute/?renderer=city&view=aerial)
  · the README lists every URL, its controls, and the named viewpoints
- **Status:** mid-rebuild, and deliberately so. Read ADR-0004, then ADR-0005.

## What this is

**Crosstown**, an open-world arcade street racer set in **Kestrel Bay**: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits that escalate through six heat
levels.

Original work. It takes its cues from the open-world street-racing genre, not
from any one game. No third-party names, places, cars or assets are in the repo,
and none should be added. If asked to model the map on a specific game's city,
the answer is the *structure* - waterfront, ring road, dense core, bridges as
chokepoints - and never that game's layout.

### The names are placeholders

*Crosstown* and *Kestrel Bay* were picked so the rename was not blocked on a
decision. `Crosstown` appears in `README.md`, `CLAUDE.md`, `index.html`,
`package.json` and the `crosstown.progress.v1` save key; `Kestrel Bay` in the
docs and issue text. The **GitHub slug was left alone on purpose** - renaming it
breaks the Pages URL and every link to it.

## The state of play

Three things run off one deployment, and the query string picks between them.

| | |
| --- | --- |
| `/` | The finished single-track racer: traffic, police, a rival ladder. Canvas. |
| `/?renderer=3d` | The same game drawn with three.js. Retired when the track is. |
| `/?renderer=drive` | **A car in Kestrel Bay**: free roam, traffic, a six-level pursuit, roadblocks, Enforcers, spike strips, a helicopter, takedowns, a camera with opinions, a HUD and a minimap. |
| `/?renderer=city` | A free camera over the city, for looking at the map rather than driving it. |

**There are two simulations, and that is deliberate.** `world.ts` is the track
model the shipped game still runs on. `cityworld.ts` is the same car in the
city. Traffic, police, collision, cameras and Rep have moved across; **races
and rivals have not**, which is the main thing left before `world.ts` can
retire.

The pinned city today: 5 x 4 km, 3084 roads, 2302 junctions, 589 blocks,
229 km of road, 19 km of boulevard, a 12.7 km elevated loop with 7 ramps and a
tunnel, and 3 river crossings.

## The decisions that shape everything

- [ADR-0003](decisions/0003-separate-simulation-from-rendering.md) - simulation
  split from rendering. The reason any of the rest was survivable.
- [ADR-0004](decisions/0004-webgl-free-roam-city.md) - a real 3D WebGL scene.
  Two hard gates forced it: roads over roads, and cameras that leave the car.
  **Both now exist and can be looked at** (`&view=overpass`, and the crash cut).
- [ADR-0005](decisions/0005-the-shape-of-kestrel-bay.md) - what the city is
  *shaped* like. Read before touching the generator. Rules 1-5 are built;
  landmarks (6) and terrain relief (7) are not.

## Architecture

```
src/game/
  world.ts        the track sim, still shipping
  game.ts         the Canvas renderer, HUD and state machine for that sim
  cityworld.ts    the car in the city: position, heading, height, collision
  impact.ts       what it takes to wreck a car: closing speed, angle, a wall
  rep.ts          the award table: what everything you do is worth
  citytraffic.ts  ambient traffic, kept around the player
  citypolice.ts   the pursuit: six heat levels, cooldown, a search area,
                  roadblocks, spike strips, a helicopter, and Enforcers that
                  come at you head on
  graphcar.ts     what it is to be a car on the street graph (traffic + police)
  city/           the generator: types, rng, water, generate, boulevards,
                  interstate, buildings, furniture, grid (spatial index)
  scene/          the renderer: cityscape, buildings, furniture, cameras, hud,
                  cityview, plus scene3d/ribbon/cars for the track
  road.ts, render.ts   the projected-segment track   <- retired with world.ts
tools/            screenshot, feelprobe, citymap, cityshot
```

**The city is data.** `city/` turns `CITY_SEED` into junctions, roads, blocks,
districts, water, buildings and street furniture as plain data - no renderer, no
`Math.random`. That is what lets `World` collide with it and the playtests build
one headlessly. The generator must never import three.js.

**Height is real.** Nodes carry a `y`, and node identity includes it, so two
roads at the same map position at different heights are two different places.
Anything asking "what is at this position" has to ask about a height too.

**Roads are segments, not axis-aligned lines.** `CityRoad.axis` used to exist
and every geometric test leant on it; boulevards and winding streets made it a
lie. Direction comes from the endpoints, and "is this point on this road" is a
distance to a segment.

**Traffic and police live on the graph.** A car is *which road, how far along,
which way*; its position is derived from that. The player is deliberately not
one of these - a player pinned to the graph could not cut across a car park.

## Commands

```bash
npm run dev        # http://localhost:5173
npm run typecheck  # run before considering anything done
npm run test       # 232 unit tests + playtests
npm run feel       # measure driving feel on the track sim
npm run city       # draw the generated city from above; --seed N for another
npm run cityshot   # screenshot the 3D city and the driving views
npm run shot       # screenshot the Canvas game
npm run build      # typecheck + static build
```

### Looking, and measuring

The single most useful thing to know about working here.

**Almost every real defect this session was invisible to tests that passed
throughout, and obvious in a picture** - buildings rendering black, water hidden
under the ground plane, a sky dome centred on the world origin, road markings
z-fighting into streaks, a camera sitting inside a wall, districts in a perfect
checkerboard, a waterfront that had swallowed a third of the map.

**And the converse: some defects are invisible in a picture and obvious in a
number** - traffic driving through itself, a pursuit that could never be
escaped, elite police cars at 105% of the player's top speed, a whole
neighbourhood's streets silently deleted. When a screenshot looks fine and
something still feels wrong, write a probe that prints numbers.

`npm run feel` has also been *wrong* twice, both times because its reference
driver was no longer a good driver. If a number looks strange, suspect the probe.

## Repo mechanics

- Branch, PR, `gh pr merge <n> --auto --squash`. **Auto-merge is a per-PR flag,
  not a repo default** - `allow_auto_merge` only permits it. Enable it in the
  same step as `gh pr create`, or the PR sits with green CI looking broken.
- `main` is protected and requires branches to be **up to date**, so a PR that
  falls behind reports `BEHIND` and stalls. Rebase onto `origin/main` and
  force-push with lease.
- Auto-delete of merged branches is on and works.
- Architectural decisions get an ADR. New runtime dependencies need one;
  three.js is still the only one.

## Where the work is

**M4: Kestrel Bay rebuild - 2 open, both partial.**

- **#86** - car-to-car and building collision are done, and #94 added damage
  and wrecks on top of them. What is left is whatever falls out of rivals.
- **#89** - the HUD and minimap are done. **Touch controls are not wired into
  the city**, so Kestrel Bay cannot be driven on a phone. They only exist in
  `game.ts`.

Done this session: #83 the generator, #84 geometry, #85 the elevated
interstate, #113 the car in world space, #115 bends/density/freeways, #87
traffic and police, #88 cameras, most of #89, and #58/#63/#94/#59/#61/#60/#62/#64
from M5.

**M5: Open-world systems - 15 open.** The pursuit is built: #58 (six heat
levels), #63 (cooldown), #94 (takedowns), #59 (roadblocks), #61 (Enforcers),
#60 (spike strips) and #62 (the helicopter). #64 gives all of it a currency.
That is the framework the rest keys off. Natural next ones, in order of
how much they use what already exists:

- **#91 the ladder of ten** - Rep exists now (#64), and the ladder is meant to
  be unlocked by a Rep total rather than by a count of wins. This is what
  turns the pursuit into a game.
- **#57 pursuit breakers** - the counterplay to spikes and the helicopter, and
  the last of the pursuit furniture.
- **#92 ambushes**, **#76 radio chatter** - both key off the pursuit as it now
  stands. **#93 collectibles** pays straight into Rep.
- **#64 Rep**, **#91 the ladder of ten**, **#70/#72 event types** - these move
  races into the city and are what let `world.ts` finally retire.

**M6: Beyond the browser - 5 open.** PWA then a desktop shell. Deliberately
last, but it is what lifts the download-size ceiling on asset quality.

Also open: **#14** (tune driving feel) and **#11** (art direction), both from
before the pivot and both still live.

## Known problems, not papered over

- **The city and the track have separate tuning, and mixing them causes bugs.**
  `CITY_HEAT_RISE`, `CITY_COP_LOSE` and `CITY_PURSUIT_RANGE` exist because the
  track's equivalents mean different things - one is a trail distance along a
  road, the other a distance between two points. Reusing them caused three
  separate bugs, one of which culled every cop the step after it spawned. Check
  which world a constant belongs to before reaching for it.
- **Races and rivals are still only on the track**, so `?renderer=drive` has
  nothing to *do* in it beyond driving, being chased, and earning Rep for it.
  That is now the single biggest gap: the pursuit is finished, the currency
  exists, and there is no ladder to spend it on. #91 is the next move.
- **The city has no sound.** `audio.ts` is wired to the Canvas game only, so
  none of the pursuit - sirens, the rotor, the spikes - is audible in Kestrel
  Bay. #62 assumed a rotor loop and did not get one.
- **Touch controls are track-only**, so the city is desktop-only.
- **Traffic does not resolve traffic-vs-traffic collisions** at junctions. One
  overlapping pair in ~2775 at last measurement: acceptable, not solved.
- **Blocks stay rectangles in winding quarters**, so they do not follow the
  curves. Reads acceptably; fixing it needs rotated or polygonal blocks.
- **`npm run cityshot -- --view pursuit` is unreliable.** The scripted drive
  tends to wedge the car against a building and the pursuit ends. The pursuit is
  verified by probes and playtests instead. `--view takedown` is *not* scripted
  by driving: it reaches into `globalThis.crosstown` and steps the sim by hand,
  which is the pattern to copy for anything else that needs an exact setup.
  Headless Chromium runs this scene at about two frames a second, so a rendered
  frame is fifteen physics steps and anything timed off `waitForTimeout` lands
  wherever it lands. The same rate is why the camera director is still running
  its opening orbit ten seconds in: wait on
  `view.director.mode === 'chase'`, not on a clock. And a cop pushed onto
  `police.cops` with a position but a `t` that does not match it is silently
  teleported onto its road on the next step, because the pursuit re-derives
  every cop's place from the graph.
- **#105: nitrous barely matters over a race** on the track. Unchanged.
- **There is no feel baseline for the city.** `npm run feel` only drives the
  track sim, which is a gap worth closing before tuning city driving by feel.
- **The rival ladder is tuned against the probe's reference driver** and will
  need retuning whenever the car changes. Expect it rather than treating it as a
  regression.

## If you are picking this up cold

Read `CLAUDE.md`, then ADR-0004 and ADR-0005. Open `?renderer=drive` and drive
for two minutes until the police escalate - that is most of the project in one
go. Then `npm run city` for the map, and `&view=overpass` for the reason the
renderer was rebuilt at all.

Then pick from M5. Keep behaviour in the sim and drawing in the renderer,
because that split is the only reason this rebuild has been survivable, and keep
the city's *descriptions* in `city/` for the same reason.
