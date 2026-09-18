# Session handoff

Where the project stands, so a fresh session can pick it up without re-deriving
anything. This is a solo project: see [CONTRIBUTING](../CONTRIBUTING.md).

- **Repo:** github.com/ricschuster/NFS_MW_tribute · branch `main`. PR #273 (the
  map rebuild) merged into `main` already; everything below describes `main`
  itself, not a branch waiting to land. `origin/feat/landmass`, the stale
  leftover branch this used to flag, is gone - deleted.
- **Marrow Field, since:** the airfield went from dressed to playable in one
  run of PRs. #312 added a prop editor on the road editor's pattern
  (`npm run propexport`, the **Marrow Field Props** artifact, `npm run
  propsync` into `city/marrowprops.ts`) and 108 hand-placed props: gates and
  stacks as `Breakable`s, everything else a new `SetPiece` with a
  height-banded solid footprint. #313 fixed a bug that surfaced then rather
  than one it caused: collision measured the car's height from sea level, so
  26 of 41 buildings and nearly every prop on raised ground were not solid.
  #314 gave the car a real airborne state (#307 closed): jumps as shaped
  ground, landings priced on how steeply they come down, and the Cargo Plane
  Jump laid onto the east taxiway where a run-up can reach the ~150 km/h it
  takes. #316 pays Rep for a landed jump, #317 made billboards placeable and
  stacked four behind the Hangar Ramp, #315 added Off-road Tyres as a third
  set in the tyre slot, and #318 put dirt on the field's access roads up to
  their bridges, closing #295. #311 then gave the field an event: the
  Marrow Field Run, a 6 km speed run laid by hand through it
  (`placedRoutes` in `city/routes.ts`), the first route the rebuilt city has
  had - which is also what brought the speed-run tests back. Finding its
  shape found two things about the map: the land past the south-west gate,
  a sixth of the city's road, reaches everything else only through the
  airfield; and a gate placed across a road used to pin the car behind its
  own debris for seven seconds (`Wreck.debris` now lets you through once). Then #255: slope changes the drive
  (see "the ground has height" below). The lap-time baselines it invalidates
  (`docs/city-baseline.json`, the rival pace fractions) cannot be re-derived
  while the city has no routes, so they wait on #268 along with everything
  else that needs a race.
- **Since this file was last written:** [ADR-0010](decisions/0010-sketch-shape-before-generating-it.md)
  names a pattern this rebuild kept paying for - roads, the land shape and the
  districts were each built procedurally, tuned for a while, then found wrong
  once judged against a picture - as two rules: sketch a shape question before
  wiring it into `generate.ts`, and sequence work by what it invalidates
  backward rather than by what it's worth to the player. Issue housekeeping
  caught up with the code: #271 and #272 (districts and places as authored
  data) are closed - `city/plan.ts` and `city/places.ts` are the shipped
  answer - and #249 (the land as lobes, not a slab) is closed too, its loose
  `water.town` thread fixed in #274. None of the three are the thing gating
  the grid any more; see "Where the work is" below for what is. And
  `npm run grades` closes out #252's own acceptance criterion (a probe "in the
  manner of `npm run ramps`"): every arterial and boulevard is within the
  grade `cutAndFill` actually cuts and fills to, and it surfaced one small,
  unforced finding along the way - five of Ashford Point's 519 driveways run
  steeper than that cap (10.5-16%), which is expected rather than a bug, since
  `cutAndFill` runs before `localStreetsFor` lays a driveway and never
  promised them anything; reported, not gated.
  `road.embankment` survives the road editor now, too: `markEmbankment` finds
  the quay by the same coastline geometry `embankmentRoutes` is built from and
  tags it on the *spans*, before `clip`/`connect` rather than after. Tagging
  it after (the first attempt) was too late to matter: `trimWaterStubs` reads
  the flag to protect the quay's own legitimate ends while it runs, and it
  runs as part of building that same graph, so a flag that arrives afterward
  protects nothing. Finding that also found a second, older bug in the same
  function: its trim loop was capped at 4 passes, and a stub chain near
  (-2722,-2722) was 5 deep, so the last link always survived as a stub with
  nothing upstream of it left to blame. Both are fixed - the cap is now the
  network's own size, which is always enough to reach the fixed point the
  loop already looks for - and the two previously-skipped embankment tests in
  `city.test.ts` pass along with everything else (441 of 543, 102 skipped).
- **Play the game:** https://ricschuster.github.io/NFS_MW_tribute/ - this is
  `main`, which now ships the rebuilt map: real terrain, a landmass, authored
  districts, no street grid and no interstate yet (both are switched off, see
  below).
- **Look at the map:** [`?renderer=city&view=aerial`](https://ricschuster.github.io/NFS_MW_tribute/?renderer=city&view=aerial)
  · the README lists the named viewpoints
- **Status:** mid-rebuild, and this is the second one. The first rebuild
  (ADR-0004 through ADR-0006) replaced a closed-track racer with a flat,
  densely gridded free-roam city and finished cleanly - that is the "finished"
  this file used to describe. This rebuild (ADR-0007 through ADR-0009) is
  replacing *that* city's ground with real terrain and its street grid with an
  authored map, and it is not finished: the grid is still switched off on
  purpose while the map is rebuilt from routed roads outward, which means
  today's city has no blocks and no buildings. The interstate loop itself is
  no longer missing - it is authored data now (#261, PRs #274-284) - but it
  is still switched off too, because the ramps it needs have nowhere to land
  until the grid comes back. Read `docs/map-exploration.md` for the
  day-by-day log and [ADR-0009](decisions/0009-kestrel-bay-is-an-authored-map.md)
  for the rule that is currently in force.

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

**What `main` generates today**, measured with `npm run city` against the
pinned seed: **4682 roads, 4661 junctions, 73.9 km of road** - 4167 boulevard
(70.6 km) plus 515 `street`-class driveways at Ashford Point, and no
`arterial`-class roads at all, since `CITY_STREET_GRID` is off and that is the
only thing that lays one. **7 water crossings, 1.24 km of bridge.** **1044
blocks**, of which all but 41 are open ground - `parksFor`
still covers whatever the road network does not claim, and almost nothing
claims anything yet, but it is no longer *literally* nothing: Ashford Point's
driveway houses (#268's pilot, `localstreets.ts`) and Marrow Field's one
hangar (#295, `places.ts`) are real, non-open blocks with real buildings on
them. **41 buildings** as a result - 40 houses plus the hangar - **still 0
interstate, 0 ramps**, because the two flags that build the grid and the
freeway (`CITY_STREET_GRID`, `CITY_FREEWAY` in `constants.ts`) are both
`false`. Their own comments say why: they are a switch, not a deletion, and
`fillSuperblock` and `interstate.ts` are the only code that knows how a
district becomes blocks and how a deck is built - both are wanted back, just
not laid with a ruler (ADR-0009). This describes the city ADR-0007 through
ADR-0009 built. The gridded, buildinged city ADR-0004 through ADR-0006 built
(3102 roads, 841 blocks, 3771 buildings) is what `main` played *before* PR
#273 merged, and nothing about it is true of `main` any more.

Underneath that, four things are real and new since the last time this file
was written. The **ground has height** (ADR-0007): `groundAt` samples a baked
terrain field, and roads are cut and filled into it (`cutfill.ts`, #252), and
since #255 the car feels it (`slope.ts`): a climb lowers top speed and a
descent raises it, gravity pulls along the road, and a crest takes grip away.
Every car on the graph feels the same hill, so the police's fraction of your
top speed holds uphill and down. The **water is one sea with the land as holes in
it** (ADR-0008) rather than a bay-and-river pair drawn over a slab, which is
what let the coastline stop being an edge-to-edge wall and become six separate
bodies of land joined by routed river crossings. **Downtown, the harbour, the
industrial edge and the four places (docks, airfield, quarry, lookout) are
authored polygons** in `city/plan.ts` (ADR-0009) rather than a seeded radius
pick - `npm run plan` checks the polygons still agree with whatever ground the
generator draws for the pinned seed, and today they do (`nothing overlaps`),
though the water model's own idea of where downtown is sits 2.6 km from the
plan's downtown and inside the plan's industrial district, which is one of the
"where the work is" items below. And **the interstate loop is authored data
too now** (#261, `city/freeway.ts`): a hand-drawn 26-point path and 4 tunnel
anchors (downtown, a water crossing, west, north), worked out interactively
against the real terrain/grade/water rules and written by `npm run
freewaysync` from `docs/freeway-edited.json`, replacing the old computed
rectangle. It is real, merged, and still switched off - `rampsFor` finds a
real surface junction near only a handful of this 13.6 km loop's edges while
the grid is off, so flipping `CITY_FREEWAY` on today gets the loop and its
tunnels but almost nowhere to get on or off it. That is expected to open up
once #268 brings the grid back, not a bug in the loop.

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
below: `npm run pace` failed hard, and it turned out to be the probe, not the
car.

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
- [ADR-0010](decisions/0010-sketch-shape-before-generating-it.md) - names the
  pattern behind ADR-0008 and ADR-0009 both: sketch a shape question before
  wiring it into `generate.ts`, and sequence subsystems by what they
  invalidate backward rather than by what they're worth to the player. #268
  is the current live case it applies to.

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
                  interstate, freeway (the authored loop and tunnel anchors),
                  buildings, furniture, collectibles, streetfinds, routes,
                  ambushes, repairs, breakables, grid, navigate, faces
  scene/          the renderer. cityscape assembles it - ground, carriageways,
                  water, pavements, markings, bridges, viaduct - while cameras,
                  hud and cityview drive it; buildings, furniture, collectibles
                  and breakables build the instanced geometry; worlduv, facades,
                  surfaces, roofs, carshape and daylight are the art pass (#11)
tools/            citylap + citydriver (the reference driver), citymap,
                  cityshot, pwacheck, icons, plan, sketch, and three editor
                  chains: roadexport/roaddiff/roadcheck/roadfix/roadsync for
                  the surface network, freewayexport/freewaysync for the
                  interstate loop, propexport/propsync for Marrow Field's
                  hand-placed props
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
npm run freewayexport # write the freeway loop + tunnel anchors for its editor
npm run freewaysync   # write src/game/city/freeway.ts from the edited loop
npm run propexport # write the Marrow Field prop editor page, field inlined
npm run propsync   # write src/game/city/marrowprops.ts from the placed props
npm run cityshot   # screenshot the 3D city and the driving views
npm run citylap    # every route, empty and in traffic, then every rival on the
                   # ladder, clean and boosted; all of it vs. its baseline
npm run pace       # can the police be outrun? yours vs theirs, every heat level
npm run ramps      # can every ramp be climbed? currently vacuous (0 of 0),
                   # because CITY_FREEWAY is off and there are no ramps to check
npm run grades     # can every arterial/boulevard actually be climbed? a guard
                   # on cutAndFill (#252); Ashford Point's driveways and ramps
                   # are excluded and reported instead, not gated
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
visible in a screenshot: `npm run pace` said a clean, undamaged car topped out
at 78% of reference speed on the pinned city, against 100% on `main` and every
heat level's cop being faster - which turned out to mean the probe's "hold the
throttle on an empty straight" assumption had stopped being true the day the
network stopped being a grid full of long straights, not that the car could no
longer be outrun; see "known problems" for the fix. And a stationary car under
a live pursuit gets a cop to a stable 50-52 m and no closer, for as long as the
simulation was allowed to run - checked to 180 s - which reads as a navigation
stall rather than a design choice, because nothing about *choosing* to hold
station should look the same at every distance from 11 m to 70 m. That one is
still undiagnosed, in "known problems" below rather than fixed under pressure,
because it sits on a mechanism ("a pursuit can always end") the rest of the
game depends on.

The clearest historical case of "obvious in a number" is `npm run citylap`:
the first time anything *drove* a generated race route end to end, every one
of them turned out to double back on itself, because four independent
shortest paths between four corners shared streets. If a system has never been
exercised end to end, that is where the bugs are - and `routesFor` finding
zero routes on today's pinned city (see "known problems") means the race,
speed-run and claim events have not been exercised end to end on `main` at
all yet.

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

**Downtown goes last, and the checklist is [`docs/map-areas.md`](map-areas.md).**
Decided 2026-09-18: every other area of the map is finished first, one at a
time, the way Marrow Field was, and #268 comes last. That reverses the
ordering the paragraphs below were written under - they call #268 the gate -
so read them for what each issue is, and `map-areas.md` for the order, what
"done" means for an area, and which areas are.

**The map rebuild is not finished, and the gate moved.** #271 (districts
describe streets; places are what streets go to) and #272 (the district plan
as data) are both closed and done: `city/plan.ts` and `city/places.ts` are the
authored data they asked for. What's missing now is not that data but a
decision about how to use it. `CITY_STREET_GRID` - the old ruled arterial mesh
plus a uniform lattice across the whole map - is not coming back; its own
comment in `constants.ts` says so plainly. In its place is a second, newer
generator, `city/localstreets.ts`, gated per district by
`CITY_LOCAL_STREETS_KINDS`: local streets that branch off a district's own
authored major roads and clip to its plan polygon, built and judged one
district at a time. `waterfront` (Ashford Point) is the only entry in that
list today; downtown, midtown and industrial stay without blocks or buildings
until each earns its own pass. Until then there are no street finds, no
roadside breakables, and `routesFor` cannot find the four-corner circuits and
speed runs need - which is why an entire slice of the test suite is `it.skip`
on "zero routes today" rather than failing.
[#301](https://github.com/ricschuster/NFS_MW_tribute/issues/301) tracks the
specific dependency this creates for the freeway loop's ramps.

**[#268](https://github.com/ricschuster/NFS_MW_tribute/issues/268) - downtown
should feel grown, not planned.** This is what has to be answered before
downtown gets its own entry in `CITY_LOCAL_STREETS_KINDS`. Partly landed
already (the parkland-vs-lot foundation, the traffic-density rescale that now
reads the road actually there instead of a fixed count, and Ashford Point
itself as a pilot for "grown, not planned" on the easy case - large lots on
driveways). Downtown is the hard case the issue is actually about:
`fillSuperblock`'s grid versus something that reads as grown. Per ADR-0010,
this wants a `npm run sketch` pass before another attempt goes into
`generate.ts` - routing arterials over terrain was already tried and reverted
once for exactly this reason (`docs/map-exploration.md`, "3. Routing the
arterials").

**[#266](https://github.com/ricschuster/NFS_MW_tribute/issues/266),
[#265](https://github.com/ricschuster/NFS_MW_tribute/issues/265),
[#260](https://github.com/ricschuster/NFS_MW_tribute/issues/260),
[#259](https://github.com/ricschuster/NFS_MW_tribute/issues/259),
[#257](https://github.com/ricschuster/NFS_MW_tribute/issues/257),
[#256](https://github.com/ricschuster/NFS_MW_tribute/issues/256),
[#253](https://github.com/ricschuster/NFS_MW_tribute/issues/253)** - content
density by district, a beltway ring, a periphery of non-city road, buildings
you can drive into, a tunnel breaking pursuit line of sight, street tunnels
and cuttings, and blocks that sit as pads on a hillside rather than boxes. All
of them are things the generator will want once downtown and the rest have
real blocks again (#268); none of them are startable before that.

**[#261](https://github.com/ricschuster/NFS_MW_tribute/issues/261) - the
freeway loop leaving the city proper.** Further along than the rest of this
list: the loop itself is drawn (`city/freeway.ts`, PRs #274-284), a 26-point
path with 4 authored/found tunnel mouths, checked interactively against real
grade and water rules. What is left is not drawing but *connecting* it -
`rampsFor` needs real surface junctions near the loop's edges to place ramps
on, and the current authored network only offers a handful, so this stays
open until #268 gives downtown (and the rest) a real grid to land ramps on.
Re-check the ramp count after that, not before - a low count today is the
known gap, not a regression.

**[#249](https://github.com/ricschuster/NFS_MW_tribute/issues/249) - the land
is lobes joined by channels.** Closed. ADR-0008 is this issue's outcome, and
today's pinned city has six bodies of land, not a slab. The loose thread
`npm run plan` found while checking it - the water model's own notion of
where "downtown" is sitting 2.6 km from the plan's authored downtown and
inside the plan's industrial polygon instead - is fixed too (#274): the
terrain's flat core now centres on the plan's downtown rather than on
`water.town`.

**[#210](https://github.com/ricschuster/NFS_MW_tribute/issues/210) - the
reference driver cannot recover from a wide line.** Closed (PR #297):
`citylap` now fails the run if a route comes back faster with traffic than
empty (traffic can only ever cost a lap time, never buy one back) or does
not finish at all - the guard Foundry Mile needed. Unverified against a real
bad route so far, because `routesFor` finds none on today's map (see
directly below); dormant until routes come back.

**[#295](https://github.com/ricschuster/NFS_MW_tribute/issues/295) - Marrow
Field should be a disused airfield, not an active one.** Partly landed (PR
#298): the runway and taxiway are `surface: 'dirt'` now, found by distance
from `PLAN_RUNWAY` rather than trusted from whichever code path laid the
road (`markAirfieldDirt`, `places.ts`) - it has to work that way because
`CITY_AUTHORED_ROADS` routes the live geometry through `city/roads.ts`'s
hand-drawn network, which carries no `surface` of its own once synced, same
as `embankment` below. One derelict hangar stands beside it. Still open:
weeds, a breached fence, rust, and the access road (routed separately,
stays asphalt) - closer to the iterative editor workflow than a one-shot
change, on purpose.

**[#14](https://github.com/ricschuster/NFS_MW_tribute/issues/14) - tune how
the car feels**, and **[#11](https://github.com/ricschuster/NFS_MW_tribute/issues/11)
- replace vector-drawn art with sprites** (its title is stale; the live
reading, per its own comment, is "everything is boxes" - a running asset-pass
issue, most recently signs and bridge parapets in #198). Both predate this
rebuild and both want the map finished before their old numbers (lap pace,
event length, the ladder's calibration) mean anything again: they were
measured against a grid that no longer exists, and re-measuring them now
would be measuring a city with no buildings and no findable race routes. #14
also has an upstream dependency worth knowing about: #255 (slope changes the
drive) will re-derive `docs/city-baseline.json` and the `HEAT_LEVELS` police
fractions when it lands, so tuning #14 against today's numbers risks redoing
that work.

## Known problems, not papered over

- ~~`npm run pace` fails, and it is not yet known whether that is the car or
  the probe.~~ **Resolved: it was the probe.** It held the throttle from the
  default spawn, which used to sit on a long gridded arterial and on this
  branch's authored map can land within sight of a bend - the car measured 78%
  of top speed and went off-road 3.9 s in, matching a linear 5 s ramp cut
  short at exactly that point. `pace.mjs` now places the car on the longest
  straight `CityRoad` segment in the city instead of trusting the spawn point;
  clean top speed measured 100% again at the time, matching `main`, and the
  gate passed. **It broke a second time since, the same way**: the airfield
  and the quarry access road (#294, #295) gave the network its two longest
  straights, and both are dirt - `DIRT_SPEED_FRAC` caps a car at 85% of its
  top speed there by design, so the probe measured the surface instead of the
  car, clean read CAUGHT at heat 3 through 6, and nothing in the physics was
  wrong. `pace.mjs` now excludes dirt the same way it excludes bridges and
  ramps, places the car a few metres past the *start* of the chosen road
  rather than its midpoint (so the whole length is ahead of it, not half),
  and excludes a road within reach of a repair shop too - `CityWorld.repairs`
  zeroes damage every step a car sits near one (#95), which the previous fix's
  road happened not to be close enough to matter, and the new one was. Clean
  measures 100% again and the gate passes; the damaged rows, still reported
  rather than asserted (#170), are 90/72/81/40% for half-damaged, wrecked,
  wrecked+nitrous and shredded - sensibly different from each other again,
  where the repair-shop bug had them reading identically to clean. No change
  was needed in the car's physics or `HEAT_LEVELS` either time.
- **A stationary car under pursuit cannot be busted, and the search never
  reaches it.** Instrumented directly (`cop.x/y/z`, `cop.offRoad`, frame by
  frame) rather than guessed at, which ruled out the first suspect: `onRoad()`
  inside `cutsCorner` was checking for a road at a hardcoded sea level instead
  of the cop's own height, which is a real bug against #85's own rule ("height
  is a real property of the network") and is fixed, but it made no measurable
  difference to this stall, because the area it was reproduced in is close to
  sea level already. The actual mechanism: `cutsCorner` is designed as a short
  nudge off the road and back, not a second navigator, and a unit rejoins the
  instant `onRoad()` finds *any* nearby road - which in a normally-gridded area
  is almost always true one step after it leaves, so on today's network it
  contributes a single frame of real progress before control passes
  back to ordinary on-road `toward()` navigation for the rest of every cycle.
  Traced on the pinned city: the chaser gets to within 30 m purely on that
  on-road greedy hill-climb, and once no adjacent junction is any closer - the
  car is stopped in the interior of a block, off every road - the heuristic has
  nothing better to offer and is carried onto a road that curves away, gaining
  altitude, never to return. That may be a real design gap rather than a bug:
  `cutsCorner` was built for shortcutting a corner between two roads, and
  nothing today lets a unit close a "stranded in the middle of a block" gap
  the road network never comes within `CITY_BUST_DISTANCE` of. Whether the
  fix is a longer or repeatable cut, a widened search that gives up on the
  road entirely near a stationary target, or something else, is a design
  question and still wants real investigation, not a fix made under the
  pressure that found it (`cityworld.playtest.test.ts`, "closes on a car that
  is standing still, and ends it", currently `it.skip`).
- **`routesFor` finds zero routes on the pinned city.** It searches for four
  corner junctions scattered round a candidate centre, and the authored
  network does not have that kind of junction density near most of the map
  yet. Every circuit, speed run, claim-after-winning-a-race and the Quick
  Wheel's mid-race lock is currently untestable as a result - skipped in the
  test suite, not deleted, and it will come back once #268 lands and more
  districts get real blocks.
- **Bridge spacing is 1795 m at its worst point, against an 800 m promise.**
  `chooseBridges` has no dense arterial candidate set left to spread crossings
  across on the current authored network - a known, measured gap, not a
  loosened test.
- **The freeway loop has almost nowhere to put a ramp yet.** `city/freeway.ts`
  (#261) is a real, merged, 13.6 km authored loop with 4 tunnel anchors, but
  `rampsFor` finds a real surface junction near only a handful of its edges
  while `CITY_STREET_GRID` is off - flipping `CITY_FREEWAY` on locally against
  the real generator produces about one drivable ramp across the whole loop.
  Expected, not a regression: it is the same "no blocks, no buildings" gap as
  everything else on this list, and it closes once #268 lands. Don't chase it
  as a bug before then.
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
- **Blocks stay rectangles wherever they exist**, which today is only
  Ashford Point, but the underlying limitation (#253) survives the rebuild and
  will matter again once #268 brings blocks back to more of the map.

## If you are picking this up cold

Read `CLAUDE.md`, then ADR-0007, ADR-0008 and ADR-0009 in order, then
`docs/map-exploration.md` for the log of how the rebuild actually went - it is
more detailed and more current than this file's summary of it.

**Then look at the city and drive it.** `npm run city` and `npm run cityshot`
first, because a generator change is far easier to judge as a picture than as
a test; then `npm run dev` and drive it, because playing has found more real
defects than every probe and test combined, on both rebuilds.

Then read "Where the work is" above: #268 is where a session should start if
it wants to move the map forward - sketch it first, per ADR-0010 - and the
remaining unresolved probe finding (the stationary bust) is where a session
should start if it wants to make the current branch trustworthy before
anything is built on top of it further.

## The probes, and what each is for

| | |
| --- | --- |
| `npm run test` | unit tests and playtests: 439 passed, 104 skipped, 0 failed as of the last full run on `main` |
| `npm run citylap` | every route, empty and in traffic, then every ladder rival; the only baseline, and the diff is the warning. Also a guard now (#210): fails on a route that never finishes or comes back faster with traffic than empty. Untested against a real route on today's map - see `routesFor` above |
| `npm run playthrough` | the whole game at every level it has one, as a session log |
| `npm run endings` | how a pursuit ends - busted, escaped, or neither - driving and stopped, and `--damage 1` for a wrecked car |
| `npm run pace` | the one *gate*: can an undamaged car outrun every heat level. Passes; measures from the longest straight, not the default spawn - see known problems |
| `npm run grades` | can every arterial/boulevard be climbed - a guard on `cutAndFill` (#252). Passes (4168 of 4168); Ashford Point's driveways (519, never passed to `cutAndFill`) are reported, not gated, and five of those exceed the surface-street cap at 10.5-16% |
| `npm run plan` | does the authored plan still fit the ground the generator makes for the pinned seed - a guard, not a probe |
| `npm run patrol` | twenty minutes with the police live, and what came of it |
| `npm run drivers` | the same routes at four skill levels |
| `npm run city` · `npm run cityshot` | look at it - the city is far easier to judge as a picture than as a test |

Every real defect in the *city* has been found by looking at a picture. Every
real defect in the *balance* has been found by a number. Neither finds what a
person driving finds.
