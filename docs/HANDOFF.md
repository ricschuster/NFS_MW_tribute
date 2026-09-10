# Session handoff

Where the project stands, so a fresh session can pick it up without re-deriving
anything. This is a solo project: see [CONTRIBUTING](../CONTRIBUTING.md).

- **Repo:** github.com/ricschuster/NFS_MW_tribute · branch `main`, with
  `feat/landmass` (37 commits) open against it as a pull request
- **Play the game:** https://ricschuster.github.io/NFS_MW_tribute/ (this is
  `main`, which still ships the *old* gridded city - the branch has not merged)
- **Look at the map:** [`?renderer=city&view=aerial`](https://ricschuster.github.io/NFS_MW_tribute/?renderer=city&view=aerial)
  · the README lists the named viewpoints
- **Status:** mid-rebuild, and this is the second one. The first rebuild
  (ADR-0004 through ADR-0006) replaced a closed-track racer with a flat,
  densely gridded free-roam city and finished cleanly - that is the "finished"
  this file used to describe. This rebuild (ADR-0007 through ADR-0009) is
  replacing *that* city's ground with real terrain and its street grid with an
  authored map, and it is not finished: the grid and the elevated interstate
  are switched off on purpose while the map is rebuilt from routed roads
  outward, which means today's pinned city has no blocks, no buildings and no
  interstate. Read `docs/map-exploration.md` for the day-by-day log and
  [ADR-0009](decisions/0009-kestrel-bay-is-an-authored-map.md) for the rule
  that is currently in force.

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

**`/` is Kestrel Bay.** One simulation (`cityworld.ts`), one renderer
(`scene/`), one query string: `?renderer=city` flies a free camera over the map
with no car in it, for judging the generator rather than playing it.
[ADR-0006](decisions/0006-the-city-is-the-game.md) is why there is only one of
each.

**What `main` still plays:** the city ADR-0004 through ADR-0006 built - flat
ground, a seeded street grid, 3102 roads, 841 blocks, 3771 buildings. That
snapshot is real but it describes a deleted city: nothing about it is true of
`feat/landmass` any more, and it will stop being true of `main` too the day
that branch merges.

**What `feat/landmass` generates today**, measured with `npm run city` against
the pinned seed: **4181 roads, 4162 junctions, 71.3 km of road**, all of it
`boulevard`-class because `CITY_STREET_GRID` is off - there is no arterial
grid, so there are no arterial-only roads either. **7 water crossings, 1.24 km
of bridge.** **926 blocks, and every one of them is open ground** - `parksFor`
still covers whatever the road network does not claim, but nothing claims
anything right now, so the entire pinned city is parkland. **0 buildings, 0
interstate, 0 ramps**, because the two flags that build them
(`CITY_STREET_GRID`, `CITY_FREEWAY` in `constants.ts`) are both `false`. Their
own comments say why: they are a switch, not a deletion, and `fillSuperblock`
and `interstate.ts` are the only code that knows how a district becomes blocks
and how a deck is built - both are wanted back, just not laid with a ruler
(ADR-0009).

Underneath that, three things are real and new since the last time this file
was written. The **ground has height** (ADR-0007): `groundAt` samples a baked
terrain field, roads are cut and filled into it (`cutfill.ts`, #252), and the
car's own physics read real grade now - a slope changes drive and grip rather
than being invisible tarmac. The **water is one sea with the land as holes in
it** (ADR-0008) rather than a bay-and-river pair drawn over a slab, which is
what let the coastline stop being an edge-to-edge wall and become six separate
bodies of land joined by routed river crossings. And **downtown, the harbour,
the industrial edge and the four places (docks, airfield, quarry, lookout) are
authored polygons** in `city/plan.ts` (ADR-0009) rather than a seeded radius
pick - `npm run plan` checks the polygons still agree with whatever ground the
generator draws for the pinned seed, and today they do (`nothing overlaps`),
though the water model's own idea of where downtown is sits 2.6 km from the
plan's downtown and inside the plan's industrial district, which is one of the
"where the work is" items below.

## How this went wrong twice, and will again

Two failure modes accounted for most of what the first rebuild's very long
session found, and a third showed up finishing this one. All three are cheap
to repeat.

**Almost every number in this game was calibrated against a world that no
longer exists.** `RIVAL_BASE_SPEED_FRAC` came from `npm run feel` racing on a
track that was later deleted; `SPEEDRUN_TARGET` had the same history. When you
find a constant with a confident comment, check what the comment was measured
*on* - and now check whether the ground that comment was measured on still has
a street grid, because a second thing has since started going stale the same
way: `docs/HANDOFF.md`'s own numbers, if nobody updates them when the city
changes shape again.

**The probe is wrong more often than the code.** In one session: `endings`
grew a `--skill` flag that changed nothing, because the skill model lives in
`driveRoute`'s hands and that probe drives the car directly. An impact probe
reported every crash as a low-speed scrape, because it read the speed *after*
the collision had reversed it. If a number looks strange, suspect the probe
first - and when a probe tells you something surprising, make it tell you
*twice*, in two ways. This rebuild's own instance is under "known problems"
below: `npm run pace` currently fails hard, and it has not yet been decided
whether that is the car or the probe.

**A long branch drifts red without anyone noticing, because nobody runs the
whole suite against a moving world.** `feat/landmass` reached 37 commits and
128 failing tests before anything counted them, and none of that was a fresh
regression from the commits doing the counting: a disposable worktree at a
commit five back showed the same 38 failures in `city.test.ts` that a run at
HEAD showed. Watching only the files you are touching, on a branch that is
reshaping the ground everything else stands on, means the rest of the suite
can go red under you silently. Run `npm run test` in full every so often on a
branch like this, not just the file you last edited.

## The decisions that shape everything

- [ADR-0003](decisions/0003-separate-simulation-from-rendering.md) - simulation
  split from rendering. The reason any of the rest was survivable, and the
  reason the track could be deleted without deleting the game. Read it as being
  about `cityworld.ts` and `scene/`; the modules it names are gone.
- [ADR-0004](decisions/0004-webgl-free-roam-city.md) - a real 3D WebGL scene.
  Two hard gates forced it: roads over roads, and cameras that leave the car.
- [ADR-0005](decisions/0005-the-shape-of-kestrel-bay.md) - what the city is
  *shaped* like. Rules 1-5 were built as a flat grid; rule 7 (relief) is now
  built differently than this ADR expected it (see ADR-0007) and rule 6
  (landmarks) is still not built.
- [ADR-0006](decisions/0006-the-city-is-the-game.md) - the city is the game,
  and the track sim is deleted.
- [ADR-0007](decisions/0007-relief.md) - the ground gets height. Accepted, then
  sketched (`npm run sketch`), and the sketch found rule 2 wrong before any of
  it was built on real code - see ADR-0008 for what changed as a result.
- [ADR-0008](decisions/0008-a-landmass-and-routed-roads.md) - a landmass
  instead of a slab, and roads that are routed over the ground rather than
  swept across it as curves. Supersedes ADR-0007 rule 2 and amends its rules 4
  and 10.
- [ADR-0009](decisions/0009-kestrel-bay-is-an-authored-map.md) - the districts
  and the four named places are authored data (`city/plan.ts`), not a seeded
  radius pick, and the street grid and elevated interstate are switched off
  while the map is rebuilt from the routed roads outward. This is the decision
  in force right now; read it before touching `generate.ts`.

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
                  roadblocks, spike strips, and Enforcers that come at you
                  head on
  graphcar.ts     what it is to be a car on the street graph (traffic + police)
  audio.ts        synthesized engine / siren / squelch
  touch.ts        on-screen controls; one reading, not a second control path
  city/           the generator: water, terrain, bodies (which lobe of land a
                  point is on), plan (authored districts and places), roads
                  (the authored network itself), routing (a router that prices
                  water and grade), places, cutfill, embankment, boulevards,
                  interstate, buildings, furniture, collectibles, streetfinds,
                  routes, ambushes, repairs, breakables, grid, navigate, faces
  scene/          the renderer. cityscape assembles it - ground, carriageways,
                  water, pavements, markings, bridges, viaduct - while cameras,
                  hud and cityview drive it; buildings, furniture, collectibles
                  and breakables build the instanced geometry; worlduv, facades,
                  surfaces, roofs, carshape and daylight are the art pass (#11)
tools/            citylap + citydriver (the reference driver), citymap,
                  cityshot, pwacheck, icons, plan, sketch, and the road-editor
                  chain: roadexport, roaddiff, roadcheck, roadfix, roadsync
```

**The city is data.** `city/` turns a seed into junctions, roads, blocks,
districts, water, buildings and street furniture as plain data - no renderer, no
`Math.random`. That is what lets the sim collide with it and the playtests build
one headlessly. The generator must never import three.js. Right now that data
has no blocks and no buildings in it, by the same rule: `CITY_STREET_GRID` and
`CITY_FREEWAY` are read inside `generate.ts` and nowhere else, so turning either
back on is a one-line change whose consequences are everywhere else in the
file.

**Height is real, everywhere, not just on the interstate.** ADR-0004 already
meant two roads at the same map position and different heights were two
different places; ADR-0007 means the *ground* itself has a height at every
point, sampled from a baked field rather than computed as a formula, because
roads get cut and filled into it before anything else is laid. Anything asking
"what is at this position" has to ask about a height, and anything driving on
it now feels the grade.

**Roads are segments, not axis-aligned lines.** `CityRoad.axis` used to exist
and every geometric test leant on it; boulevards and routed roads made it a
lie. Direction comes from the endpoints, and "is this point on this road" is a
distance to a segment.

**Traffic and police live on the graph.** A car is *which road, how far along,
which way*; its position is derived from that. The player is deliberately not
one of these - a player pinned to the graph could not cut across a car park.

## Commands

```bash
npm run dev        # http://localhost:5173
npm run typecheck  # run before considering anything done
npm run test       # unit tests + playtests
npm run playtest   # just the playtests: drive CityWorld, assert outcomes
npm run city       # draw the generated city from above; --seed N for another;
                   # --terrain for the land alone, hill-shaded, with no city on it
npm run sketch     # a candidate landmass/terrain/road network from scratch,
                   # touching nothing in src/ - the cheapest place to answer
                   # the next question about the city's shape
npm run plan       # does the authored plan still fit the ground the generator
                   # makes? a guard: a polygon that leaves the land is a failure
npm run roadexport # write the road network + relief + plan for the road editor
npm run cityshot   # screenshot the 3D city and the driving views
npm run citylap    # every route, empty and in traffic, then every rival on the
                   # ladder, clean and boosted; all of it vs. its baseline
npm run pace       # can the police be outrun? yours vs theirs, every heat level.
                   # currently FAILING - see known problems
npm run ramps      # can every ramp be climbed? currently vacuous (0 of 0),
                   # because CITY_FREEWAY is off and there are no ramps to check
npm run patrol     # twenty minutes with the police live: what started each
                   # pursuit, time to the first, and how much of it was free roam
npm run endings    # how a pursuit ends - busted, escaped, or neither - at each
                   # heat level, driving and stopped; --damage 1 for a wreck
npm run playthrough # the whole game at every level it has one: four driver
                   # tiers, six heat levels, six events, five ambushes
npm run drivers    # the same routes driven by beginner / advanced / expert / perfect
npm run build      # typecheck + static build
npm run pwa        # serve dist/, cut the network, and check it still plays
npm run icons      # redraw the app icons from tools/icons.mjs
```

### Playing, looking, and measuring

The single most useful thing to know about working here. There are three ways
to find out something is wrong, and they find different things.

**Playing it beats both of the others and is the one that gets skipped.**
Nine of twelve issues from the first rebuild's one long playtest session were
outright bugs the test suite and five green probes had missed entirely: you
could not tell where the road was, a pursuit started for no reason and never
ended, the minimap pointed the wrong way, nothing in the game explained the
Quick Wheel or the repair shops. Do it first, do it often, and write down what
you felt rather than what you think caused it.

**Almost every real defect in the city has been invisible to tests that passed
throughout, and obvious in a picture** - buildings rendering black, water
hidden under the ground plane, districts in a perfect checkerboard, a
waterfront that had swallowed a third of the map. `npm run city` and
`npm run cityshot` are cheap; use them after any change to the generator.

**And the converse: some defects are invisible in a picture and obvious in a
number.** Two live examples from finishing this rebuild's test suite, neither
visible in a screenshot: `npm run pace` says a clean, undamaged car tops out at
78% of reference speed on the pinned city today, against 100% on `main` and
every heat level's cop being faster - which either means the car cannot be
outrun any more or means the probe's "hold the throttle on an empty straight"
assumption stopped being true the day the network stopped being a grid full of
long straights. And a stationary car under a live pursuit gets a cop to a
stable 50-52 m and no closer, for as long as the simulation was allowed to run
- checked to 180 s - which reads as a navigation stall rather than a design
choice, because nothing about *choosing* to hold station should look the same
at every distance from 11 m to 70 m. Neither is diagnosed. Both are in "known
problems" below rather than fixed under pressure, because both sit on a
mechanism ("you can always be outrun" and "a pursuit can always end") the rest
of the game depends on.

The clearest historical case of "obvious in a number" is `npm run citylap`:
the first time anything *drove* a generated race route end to end, every one
of them turned out to double back on itself, because four independent
shortest paths between four corners shared streets. If a system has never been
exercised end to end, that is where the bugs are - and `routesFor` finding
zero routes on today's pinned city (see "known problems") means the race,
speed-run and claim events have not been exercised end to end on this branch
at all yet.

## Repo mechanics

- Branch, PR, `gh pr merge <n> --auto --squash`. **Auto-merge is a per-PR flag,
  not a repo default** - `allow_auto_merge` only permits it. Enable it in the
  same step as `gh pr create`, or the PR sits with green CI looking broken.
  A branch the size of `feat/landmass` (37 commits, a generator rewrite) is the
  exception: open it for review rather than auto-merging, even with green CI.
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

**The map rebuild is not finished, and two open issues gate almost everything
else on this list.** [#271](https://github.com/ricschuster/NFS_MW_tribute/issues/271)
(districts describe streets; places are what streets go to) and
[#272](https://github.com/ricschuster/NFS_MW_tribute/issues/272) (the district
plan as data) are what stand between today's roads-and-terrain-only city and
turning `CITY_STREET_GRID` back on: `fillSuperblock` needs to know how a piece
of authored ground becomes blocks, and it currently only knows how to do that
for a seeded radius pick, which ADR-0009 just retired. Until those land there
are no blocks, no buildings, no street finds, no roadside breakables, and
`routesFor` cannot find the four-corner circuits and speed runs need - which
is why an entire slice of the test suite is `it.skip` on "zero routes today"
rather than failing.

**[#268](https://github.com/ricschuster/NFS_MW_tribute/issues/268) - downtown
should feel grown, not planned.** Partly landed already (the parkland-vs-lot
foundation, and the traffic-density rescale that now reads the road actually
there instead of a fixed count) but the harder half - what a grown-looking
downtown's blocks and lots actually look like - is downstream of #271/#272.

**[#266](https://github.com/ricschuster/NFS_MW_tribute/issues/266),
[#265](https://github.com/ricschuster/NFS_MW_tribute/issues/265),
[#261](https://github.com/ricschuster/NFS_MW_tribute/issues/261),
[#260](https://github.com/ricschuster/NFS_MW_tribute/issues/260),
[#259](https://github.com/ricschuster/NFS_MW_tribute/issues/259),
[#257](https://github.com/ricschuster/NFS_MW_tribute/issues/257),
[#256](https://github.com/ricschuster/NFS_MW_tribute/issues/256),
[#253](https://github.com/ricschuster/NFS_MW_tribute/issues/253)** - content
density by district, a beltway ring, the freeway loop leaving the city proper,
a periphery of non-city road, buildings you can drive into, a tunnel breaking
pursuit line of sight, street tunnels and cuttings, and blocks that sit as pads
on a hillside rather than boxes. All of them are things the generator will
want once #271/#272 give it real blocks again; none of them are startable
before that.

**[#249](https://github.com/ricschuster/NFS_MW_tribute/issues/249) - the land
is lobes joined by channels.** Largely built - ADR-0008 is this issue's
outcome, and today's pinned city has six bodies of land, not a slab - but the
issue is still open, and `npm run plan` found one loose thread while checking
it: the water model's own notion of where "downtown" is sits 2.6 km from the
plan's authored downtown polygon and inside the plan's industrial polygon
instead. Worth resolving before it causes something to be built in the wrong
place.

**[#210](https://github.com/ricschuster/NFS_MW_tribute/issues/210) - the
reference driver cannot recover from a wide line.** Unrelated to the map
rebuild and unblocked by it; still open.

**[#14](https://github.com/ricschuster/NFS_MW_tribute/issues/14) - tune how
the car feels**, and **[#11](https://github.com/ricschuster/NFS_MW_tribute/issues/11)
- replace vector-drawn art with sprites.** Both predate this rebuild and both
want the map finished before their old numbers (lap pace, event length, the
ladder's calibration) mean anything again: they were measured against a grid
that no longer exists, and re-measuring them now would be measuring a city
with no buildings and no findable race routes.

## Known problems, not papered over

- **`npm run pace` fails, and it is not yet known whether that is the car or
  the probe.** A clean, undamaged car measures 78% of reference top speed on
  the pinned city today; every heat level's slowest unit outruns that; `main`
  measures 100% and passes. The probe holds the throttle for 120 s on an empty
  straight starting from the default spawn, which used to be a safe assumption
  on a gridded arterial and may no longer be one on a sparse, curved authored
  network - the drive-view screenshot at the default spawn shows a bend within
  sight of the start. Investigate `pace.mjs`'s assumption before touching
  `HEAT_LEVELS` or the car's own physics; whichever one is wrong, this gate
  should stay red until it is understood; it is not safe to merge past it
  silently.
- **A stationary car under pursuit cannot be busted, and the search never
  reaches it.** The nearest cop closes to a stable 50-52 m from a car that
  never moves and holds there indefinitely - checked to 180 s, well past
  `CITY_BUST_DISTANCE` (11 m) and still inside `COP_LEASH` (70 m, the off-road
  "drive straight at them" reach) - so this reads as navigation stalling near
  the target rather than the search failing to converge on it. Wants real
  investigation in `citypolice.ts`/`graphcar.ts`, not a fix made under the
  pressure that found it (`cityworld.playtest.test.ts`, "closes on a car that
  is standing still, and ends it", currently `it.skip`).
- **`routesFor` finds zero routes on the pinned city.** It searches for four
  corner junctions scattered round a candidate centre, and the authored
  network does not have that kind of junction density near most of the map
  yet. Every circuit, speed run, claim-after-winning-a-race and the Quick
  Wheel's mid-race lock is currently untestable on this branch as a result -
  skipped in the test suite, not deleted, and it will come back with
  #271/#272.
- **The `embankment` flag does not survive the road editor.** `AuthoredRoad`
  in `city/roads.ts` carries `kind`, `district`, `bridge` and `deadEnd` but no
  `embankment` field, so no road in the generated network is tagged one today,
  even though the physical quay road is still there (it was in the draft that
  became the authored roads) and `waterEnds` still rails off every dead end at
  the water on its own geometry - measured, 13 of 13 - independent of the tag.
  The player-facing guarantee holds; the network-level "which roads are these"
  question cannot be asked of the data any more.
- **Bridge spacing is 1795 m at its worst point, against an 800 m promise.**
  `chooseBridges` has no dense arterial candidate set left to spread crossings
  across on the current authored network - a known, measured gap, not a
  loosened test.
- **The `CITY_` prefix is history, not a distinction.** `CITY_HEAT_RISE`,
  `CITY_COP_LOSE` and `CITY_PURSUIT_RANGE` are named that way because the
  deleted track had different constants meaning different things, and reusing
  one caused three separate bugs. There is only one world now, so the prefix
  is a scar. Leave it: renaming it touches every pursuit file for nothing.
- **Cover is not a mechanic.** The helicopter and `coveredAt` were both
  deleted (#183): a deck overhead and the tunnel are geometry now, and nothing
  watches you from above. If cover should mean something again it needs a new
  thing to mean it against, and that thing has to be *visible* - the test the
  helicopter failed.
- **Both maps agree with each other and the windscreen, and it took a person
  playing to find out they didn't used to.** `scene/mapping.ts` is the one
  conversion (`toMap`), proved against a real camera in `mapview.test.ts`. If
  you add a map, use `toMap`; if you add a marker, check it against the
  windscreen and not against the other markers.
- **The minimap is hard to read in daylight**, and the lighting is not flat
  any more (#180 put a clock in the sim and a palette on it) while shadows
  still do nothing as the sun moves through the day.
- **Blocks stay rectangles wherever they exist**, which today is nowhere, but
  the underlying limitation (#253) survives the rebuild and will matter again
  the day #271/#272 bring blocks back.

## If you are picking this up cold

Read `CLAUDE.md`, then ADR-0007, ADR-0008 and ADR-0009 in order, then
`docs/map-exploration.md` for the log of how the rebuild actually went - it is
more detailed and more current than this file's summary of it.

**Then look at the city and drive it.** `npm run city` and `npm run cityshot`
first, because a generator change is far easier to judge as a picture than as
a test; then `npm run dev` and drive it, because playing has found more real
defects than every probe and test combined, on both rebuilds.

Then read "Where the work is" above: the two-issue gate (#271, #272) is where
a session should start if it wants to move the map forward, and the two
unresolved probe findings (`pace`, the stationary bust) are where a session
should start if it wants to make the current branch trustworthy before
anything is built on top of it further.

## The probes, and what each is for

| | |
| --- | --- |
| `npm run test` | unit tests and playtests: 428 passed, 101 skipped, 0 failed as of the last full run on `feat/landmass` |
| `npm run citylap` | every route, empty and in traffic, then every ladder rival; the only baseline, and the diff is the warning. Untested on this branch - see `routesFor` above |
| `npm run playthrough` | the whole game at every level it has one, as a session log |
| `npm run endings` | how a pursuit ends - busted, escaped, or neither - driving and stopped, and `--damage 1` for a wrecked car |
| `npm run pace` | the one *gate*: can an undamaged car outrun every heat level. Currently failing - see known problems |
| `npm run plan` | does the authored plan still fit the ground the generator makes for the pinned seed - a guard, not a probe |
| `npm run patrol` | twenty minutes with the police live, and what came of it |
| `npm run drivers` | the same routes at four skill levels |
| `npm run city` · `npm run cityshot` | look at it - the city is far easier to judge as a picture than as a test |

Every real defect in the *city* has been found by looking at a picture. Every
real defect in the *balance* has been found by a number. Neither finds what a
person driving finds.
