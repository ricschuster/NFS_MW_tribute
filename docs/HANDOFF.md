# Session handoff

Where the project stands, so a fresh session can pick it up without re-deriving
anything. This is a solo project: see [CONTRIBUTING](../CONTRIBUTING.md).

- **Repo:** github.com/ricschuster/NFS_MW_tribute · branch `main`
- **Play the game:** https://ricschuster.github.io/NFS_MW_tribute/
- **Look at the map:** [`?renderer=city&view=aerial`](https://ricschuster.github.io/NFS_MW_tribute/?renderer=city&view=aerial)
  · the README lists the named viewpoints
- **Status:** the rebuild is finished. One game, one sim, one URL.

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

**`/` is Kestrel Bay.** There used to be two games behind one deployment - the
finished single-track racer at `/`, and the city at `?renderer=drive` - and
[ADR-0006](decisions/0006-the-city-is-the-game.md) deleted the track. There is
one simulation (`cityworld.ts`), one renderer (`scene/`), and one query string
left: `?renderer=city` flies a free camera over the map with no car in it, for
judging the generator rather than playing it.

The pinned city today: 5 x 4 km, 3084 roads, 2302 junctions, 589 blocks,
229 km of road, 19 km of boulevard, a 12.7 km elevated loop with 7 ramps and a
tunnel, 3 river crossings, 90 billboards, 25 speed cameras, 7 parked cars and
6 events of 2.5 to 4 km - three circuits and three speed runs - and 5 ambushes
at heat 2 through 6, and 6 drive-through repair shops, 40 gates and 43 pallet
stacks that come down. Eighteen cars: one you start in, seven parked around the
city, ten on the ladder.

## The decisions that shape everything

- [ADR-0003](decisions/0003-separate-simulation-from-rendering.md) - simulation
  split from rendering. The reason any of the rest was survivable, and the
  reason the track could be deleted without deleting the game. Read it as being
  about `cityworld.ts` and `scene/`; the modules it names are gone.
- [ADR-0004](decisions/0004-webgl-free-roam-city.md) - a real 3D WebGL scene.
  Two hard gates forced it: roads over roads, and cameras that leave the car.
  Both exist and can be looked at (`&view=overpass`, and the crash cut).
- [ADR-0005](decisions/0005-the-shape-of-kestrel-bay.md) - what the city is
  *shaped* like. Read before touching the generator. Rules 1-5 are built;
  landmarks (6) and terrain relief (7) are not.
- [ADR-0006](decisions/0006-the-city-is-the-game.md) - the city is the game,
  and the track sim is deleted. What went, and what it cost.

## Architecture

```
src/game/
  cityworld.ts    the sim: position, heading, height, collision, step(dt, input)
  impact.ts       what it takes to wreck a car: closing speed, angle, a wall
  rep.ts          the award table: what everything you do is worth
  collectibles.ts what has been found: smashed billboards, clocked cameras
  cars.ts         the roster, as handling profiles against a reference car
  rivals.ts       the ladder of ten, as a price rather than a queue
  garage.ts       what the player owns: cars, parts earned, parts fitted
  mods.ts         the parts catalogue, as trades rather than upgrades
  cityrace.ts     events: circuits against a field, speed runs against a number
  cityambush.ts   the trap: surrounded, stopped, and a clock
  cityclaim.ts    the second half of a ladder fight: run them down, take the car
  quickwheel.ts   the menu that never pauses: cars, parts, somewhere to go
  radio.ts        what the police say about you, and when
  storage.ts      where a save lives: a seam a desktop shell fills in
  progress.ts     the save format, versioned, validated field by field
  citytraffic.ts  ambient traffic, kept around the player
  citypolice.ts   the pursuit: six heat levels, cooldown, a search area,
                  roadblocks, spike strips, a helicopter, and Enforcers that
                  come at you head on
  graphcar.ts     what it is to be a car on the street graph (traffic + police)
  audio.ts        synthesized engine / siren / squelch
  touch.ts        on-screen controls; one reading, not a second control path
  city/           the generator: types, rng, water, generate, boulevards,
                  interstate, buildings, furniture, collectibles, streetfinds,
                  routes, ambushes, repairs, breakables, grid
  scene/          the renderer. cityscape assembles it; cameras, hud and
                  cityview drive it; buildings, furniture, collectibles and
                  breakables build the instanced geometry; worlduv, facades,
                  surfaces, roofs and carshape are the art pass (#11)
tools/            citylap + citydriver (the reference driver), citymap,
                  cityshot, pwacheck, icons
```

**The city is data.** `city/` turns `CITY_SEED` into junctions, roads, blocks,
districts, water, buildings and street furniture as plain data - no renderer, no
`Math.random`. That is what lets the sim collide with it and the playtests build
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
npm run test       # 436 unit tests + playtests
npm run playtest   # just the playtests: drive CityWorld, assert outcomes
npm run city       # draw the generated city from above; --seed N for another
npm run cityshot   # screenshot the 3D city and the driving views
npm run citylap    # every route, empty and in traffic; vs. its baseline
npm run pace       # can the police be outrun? yours vs theirs, every heat level
npm run patrol     # twenty minutes with the police live, and what came of it
npm run build      # typecheck + static build
npm run pwa        # serve dist/, cut the network, and check it still plays
npm run icons      # redraw the app icons from tools/icons.mjs
```

### Looking, and measuring

The single most useful thing to know about working here.

**Almost every real defect in the city has been invisible to tests that passed
throughout, and obvious in a picture** - buildings rendering black, water hidden
under the ground plane, a sky dome centred on the world origin, road markings
z-fighting into streaks, a camera sitting inside a wall, districts in a perfect
checkerboard, a waterfront that had swallowed a third of the map.

**And the converse: some defects are invisible in a picture and obvious in a
number** - traffic driving through itself, a pursuit that could never be
escaped, elite police cars at 105% of the player's top speed, a whole
neighbourhood's streets silently deleted. When a screenshot looks fine and
something still feels wrong, write a probe that prints numbers.

The clearest case of that is `npm run citylap`. Nothing had ever tried to
*drive* a generated race route end to end - the tests only checked the routes
existed - and the first thing a reference driver found was that every one of
them doubled back on itself, because four independent shortest paths between
four corners share streets and the "circuit" was an out-and-back with U-turns
in it. The second was that the perimeter arterial stopped the car dead, its
centreline being the map boundary exactly. Both had been shipped for months and
both are obvious the moment something drives them. If a system has never been
exercised end to end, that is where the bugs are.

Two tools came out of that, and they answer different questions.
`npm run pace` is a *guard*: it compares your real top speed against the
quickest unit at every heat level and fails if an undamaged car cannot outrun
one, which is an invariant `HEAT_LEVELS` exists to hold and which has been
broken twice by accident without a test going red. `npm run patrol` is an
*instrument*: twenty minutes in the city with the police live, reporting what
the game did rather than asserting anything. It found #170, #171 and the shape
of the Rep curve on its first run.

The probes themselves have been wrong more often than the code has. The track's
`npm run feel` was wrong three times, every time because its reference driver
had stopped being a good driver, or because the world had grown a gate the
probe did not know to pay for. If a number looks strange, suspect the probe.

And the third case: **a change that is obviously wrong in a picture and has no
obvious cause.** #75's first attempt went through `EffectComposer` and came out
with a pale sky and dark buildings; the answer was that three.js r185 applies
tone mapping in its own compositing step, so the composer's `OutputPass` was
mapping an already-mapped frame. An A/B of the same scene with the composer
bypassed found it in one shot, and guessing at it did not.

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
- **Do not run Prettier.** There is no `.prettierrc` and no Prettier
  dependency, but the codebase is consistently single-quoted, so
  `npx prettier --write` fetches it, formats with its *defaults*, and silently
  converts whatever it touches to double quotes. That cost a repair PR (#159).
  Match the surrounding style by hand.

## Where the work is

**Eight issues are open, and nothing else is.** M4 (Kestrel Bay rebuild) and M5
(open-world systems) are both closed, and #165 closed the rebuild out by
deleting the thing it replaced.

**Three of them came out of one drive test** - #170, #171 and the ladder probe
below - which is the argument for doing another one. Put the reference driver in
the city with the police live for twenty minutes and read what comes out; that
is how all three were found, and the test suite was green throughout.

**#170: a wrecked car cannot outrun a heat 1 cruiser.** A decision rather than a
fix, and the sharpest thing on the board: it changes how the game plays. See
Known problems below for the numbers.

**#171: the reference driver follows the centreline**, so traffic can never be
in the baseline. Small, and it unblocks measuring the system that is always on.

**#166: the ladder has no probe.** This is the debt #165 took on knowingly and
it is the first thing to look at. `npm run feel` raced a reference driver
against all ten rivals and reported which it beat clean and which needed
nitrous; that is how `RIVAL_DIFF_SPEED_FRAC` was set to 0.125, and how "beating
the boss needs nitrous" was known to be true. It drove `World`, so it could not
survive the deletion. `npm run citylap` gets a reference driver round all six
routes and is the only driving baseline left, but it races nobody. Until
something replaces it, a change to the car can move the whole ladder silently.
The pieces are all there: `tools/citydriver.mjs` can drive a route, `CityRace`
runs the field, and `citylap` already has the table and the baseline diff.

**M6: Beyond the browser - 3 open, and deliberately not started.** #98 made the
game installable and offline and #101 opened the storage seam a shell needs.
What is left is picking a desktop shell (#99), a release pipeline for it (#100)
and split asset budgets (#102). These were not attempted, for reasons that are
about the environment rather than the work: there is no Rust toolchain and no
display here, so a Tauri build cannot be compiled or run, and picking between
Electron and Tauri is a heavyweight runtime dependency plus a CI and signing
decision. Per the house rule that wants an ADR for a new dependency, that is a
choice for a person, not something to settle by picking one and shipping it.

**#14 tune driving feel** still wants a person. Its acceptance criterion is
"propose values that feel better", and better is not something a probe reports.
Two of the constants it named are gone with the track (`CENTRIFUGAL` was
already gone; `FIELD_OF_VIEW` and `FOG_DENSITY` were the pseudo-3D renderer's),
so it needs rescoping to the city or closing for a new one. Re-record
`docs/city-baseline.json` in whatever PR moves a constant.

**#11 replace vector-drawn art with sprites** was written for the track
renderer, so read it as "the city is still boxes". Seven PRs did a pass:
windows on the buildings, cars with an actual silhouette and wheels, aggregate
on the tarmac, joints on the pavements and grass on the open blocks, plant and
masts on the roofs, lamps that reach out over the carriageway, and towers that
step back partway up.

**The one thing to understand before adding to it** is `scene/worlduv.ts`.
Everything large here is instanced - thousands of buildings in a handful of
meshes, one slab per block - so one geometry and one material are shared by
instances that differ only by scale. A UV baked into that geometry therefore
sizes a window or a paving slab by whatever its instance happens to be
stretched to, which is the opposite of what a texture is for. `worldUvs`
computes the UV in the vertex shader from the instance's own scale instead, so
a three-metre floor is three metres on a tower and on a shed. Use it for
anything instanced and textured. It is a string patch against three.js's shader
chunks, so a three.js upgrade can break it silently and leave every test green;
`worlduv.test.ts` is the alarm.

Nothing in that pass moved `city/` except one field - `StreetProp.reach`,
because a prop knows where it stands but not what it stands beside, and only
the generator knows which way the road is. Everything else is derived on the
renderer's side from `Building.variant`, which is what that field is for.

What is left, roughly in the order it would show:

1. Signs and barriers are still plain boxes.
2. Buildings that are more than one or two boxes: podiums, canopies at street
   level, varied roof lines. A real modular kit, behind the same provider seam.
3. Night, weather and wet roads. A lighting problem rather than a geometry one,
   and probably the biggest single change left.
4. The HUD and menus, which have had no pass at all.

## Known problems, not papered over

- **A wrecked car cannot outrun a heat 1 cruiser** (#170). At full damage the
  player tops out at 72% of reference; the slowest unit in the game runs at 84%,
  and heat 6 elites at 98%. `cityworld.ts:535` hands the pursuit `this.maxSpeed`,
  which is the *undamaged* figure, while damage is applied only to the player's
  own cap at `cityworld.ts:517`. So every fraction in `HEAT_LEVELS` is measured
  against a car you may not be driving any more, and the invariant those
  fractions exist to hold - "a pursuit you cannot outrun on speed alone is a
  pursuit with no answer" - is true for a clean car and inverted from heat 1 for
  a hurt one. Whether that is the design is a decision, not a fix: repair is
  drive-through and there are six shops, so "go to the workshop" may well be the
  intended answer. If it is, two docs need correcting and the HUD needs to say
  so. Note the clean-car margin at heat 6 is 2 percentage points, and that
  half damage is already caught from heat 3. `npm run pace` prints the whole
  table and is the guard on whichever way this is settled.
- **The ladder is unmeasured.** See #166 above. It is the one regression #165
  shipped on purpose, and the reason `RIVAL_DIFF_SPEED_FRAC` carries a comment
  saying where its value came from.
- **The `CITY_` prefix is history, not a distinction.** `CITY_HEAT_RISE`,
  `CITY_COP_LOSE` and `CITY_PURSUIT_RANGE` are named that way because the track
  had different constants meaning different things, and reusing one caused three
  separate bugs - one of which culled every cop the step after it spawned. There
  is only one world now, so the prefix is a scar. Leave it: renaming it touches
  every pursuit file for nothing.
- **Traffic halves the pace, and the baseline now says so** (#171, fixed). The
  reference driver holds a lane, brakes for the car in front, and corners on the
  radius its own line actually has, so `npm run citylap` runs every route twice
  and records both. A good driver holds around 50% of top speed on an empty
  road and around 26% in traffic. Tune against the traffic number: the empty one
  describes a game nobody plays.

  Worth knowing how that fix went, because two of the three measurements said
  the opposite of what was expected. Classifying impacts, the centreline driver
  met oncoming traffic head on in only **10%** of them - it rear-ended
  same-direction traffic in 47% and hit buildings in 43%. So a lane on its own
  made things *worse*, tripling building impacts. Only once it braked for the
  car in front did head-ons become 59% of what was left, and only once
  `cornerSpeed` knew about the offset did holding a lane stop costing corners.
  Three changes, none of which works alone, and the issue as originally written
  named the smallest of the three.
- **Pursuit Rep dominates the economy.** Twenty minutes at heat 6 earns roughly
  what the whole ten-rival ladder costs (65,000) several times over;
  `REP_PURSUIT_PER_SECOND` alone is about 28 Rep/s once the heat bonus is in,
  so about forty minutes of being chased unlocks every rival without racing,
  smashing or finding anything. #91 wants everything to pay into the ladder and
  it does, but at high heat one activity pays for all of it. Not filed as an
  issue: it wants a judgement about the curve rather than a fix, and it belongs
  with #14.
- **The helicopter is about four pixels.** #62 flies it low and ahead
  deliberately, on the grounds that "a thing you can never see is a thing the
  HUD has to explain" - but in a rendered frame it is an indistinct speck
  against the buildings and the HUD is still explaining it. Worth either making
  it read at distance or accepting that the callout is the mechanic.
- **The minimap is hard to read in daylight.** Its background is
  `rgba(8, 12, 18, 0.62)`, so a bright or busy scene shows through it and the
  roads lose contrast. It clips correctly - a building apparently spilling past
  the circle is the scene behind it, not a masking bug - but 62% is not enough
  over pale tarmac.
- **The lighting is flat.** `castShadow` and `receiveShadow` are set throughout
  `scene/`, and shadows still contribute almost nothing to a frame: everything
  reads as evenly lit midday. This is the strongest argument for #11's night,
  weather and wet roads being the biggest remaining visual step. The geometry is
  carrying the look on its own.
- **The city's sound is thin.** #76 wired `audio.ts` into Kestrel Bay - engine,
  siren and a radio squelch - but there is still no rotor for the helicopter,
  nothing for a takedown or a spike strip, and no music.
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
- **The city feel baseline is a driver's, not a player's.** `npm run citylap`
  gets a reference driver round all six routes, and the average-speed column is
  the only measurement of how fast Kestrel Bay can be driven. Read it as a floor
  rather than a target: the driver follows the centreline at a margin under the
  grip limit and never touches nitrous, so a player has headroom it does not.
  Getting it there found five bugs, two in the city and three in the driver, and
  the test suite passed through every one of them.
- **One speed run may not be winnable at the top difficulty.** The speed-run
  target is `SPEEDRUN_TARGET` 0.38 rising to 0.52 with difficulty, and the
  reference driver holds 39%, 57% and 62% on the three speed runs. Foundry
  Mile at 39% clears the easiest target and nothing above it. That is not
  proof it is unwinnable - nitrous and a line that cuts corners are both
  available to a player and not to the driver - but it is the one number in
  the table that looks like a difficulty cliff, and it is #14's to settle.

  The obvious fix was tried and does not work, which is worth knowing before
  trying it again: scale the target by what each route's own geometry allows,
  derived from `sqrt(LATERAL_GRIP * R)` with a forward and backward pass over
  the polyline the way a racing-line solver does. The answer comes out nearly
  flat - 75% to 83% across all six routes - because braking from top speed
  takes only about 45 m in this sim, so a right-angle junction costs almost
  nothing and corner density barely registers. The spread in the lap table is
  the *driver*, not the routes. If the targets should vary per route, the
  number to vary them by has to come from somewhere other than the geometry.

## If you are picking this up cold

Read `CLAUDE.md`, then ADR-0004, ADR-0005 and ADR-0006. Open the game and drive
for two minutes until the police escalate - that is most of the project in one
go. Then `npm run city` for the map, and `?renderer=city&view=overpass` for the
reason the renderer was rebuilt at all.

Then read "Where the work is" above. Two things are worth doing before anything
else, and they are cheap: **#170**, because it is a decision about how the game
plays and everything downstream of the damage model waits on it, and **#171**,
because it is a small change to the driver that unblocks measuring traffic.
After those, **#166** gives the ladder back the probe it lost - the pieces are
all in `tools/`, and until it exists nobody can tell whether a change to the car
has quietly made the boss unbeatable.

All three exist because somebody drove the game and wrote down what happened.
That remains the highest-yield thing anyone can do here.

Whatever you pick: keep behaviour in the sim and drawing in the renderer,
because that split is the only reason this rebuild has been survivable, and keep
the city's *descriptions* in `city/` for the same reason.
