# CLAUDE.md

Working rules for Claude Code in this repo. Keep this short and current.

## What this is

**Crosstown** is an open-world arcade street racer set in Kestrel Bay: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits with six heat levels.
TypeScript + Vite + three.js, no backend; it builds to static files.

Original work, and the line is about **what ships**, not about what may be
discussed. Nothing third-party appears in the game or its data: no names, no
places, no cars, no assets, no imported map, no ripped geometry. Kestrel Bay
comes out of a seed. None of that should ever be added.

**Influences are named openly in the documentation**, because a decision whose
reasoning has been anonymised is a decision nobody can check. The map's
structure was studied against *Need for Speed: Most Wanted* (2012) and its city
Fairhaven while ADR-0007 and ADR-0008 were written - its size measured from a
published drive across it, its districts and its two ring roads read off a wiki
page, its content density off a community map - and against the two real cities
it names as its own influences, Boston and Pittsburgh, one of which gave us the
number for how tall a hill should be. Where those ADRs say "the reference city",
that is what they mean; they were written under an earlier reading of this rule
that treated the two things as one.
The game itself was later studied from a recorded playthrough -
speeds, traffic, pursuits, radio - in
[docs/research/nfs-most-wanted-2012-gameplay.md](docs/research/nfs-most-wanted-2012-gameplay.md);
the footage lives in `reference/`, which is git-ignored.

Studying a map is not copying one. The test is whether anything third-party is
*in* what we ship, and the answer stays no.

**The target look is the reference game's**, and it is a question of assets,
not of engine: the reference is 2012 console tech, within WebGL2's reach, so
the recommendation is to stay in the browser. Discussion only, nothing decided;
[docs/design/03_the_look.md](docs/design/03_the_look.md) has what is in a
reference frame, why not Unreal or Godot, where the work is, and the first
step, so read it before #11 or any talk of an engine.

**There is one game and one simulation.** It used to be two - a pseudo-3D
projected-segment racer on a single closed track, and the city replacing it -
and the track was deleted in [ADR-0006](docs/decisions/0006-the-city-is-the-game.md)
once the city could do everything it could. `/` is Kestrel Bay. Read
[ADR-0004](docs/decisions/0004-webgl-free-roam-city.md) for why the renderer is
what it is, then [ADR-0005](docs/decisions/0005-the-shape-of-kestrel-bay.md) for
what the city is shaped like.

## Commands

Every tool in `tools/` opens with a comment saying what it measures, why it
exists and how to call it; read that before running one. A **guard** exits
non-zero and is a gate; a **report** asserts nothing.

Everyday:

- `npm run dev` - dev server with HMR (http://localhost:5173)
- `npm run typecheck` - `tsc --noEmit`; run before considering a change done
- `npm run test` - unit tests + playtests; `npm run playtest` is just the
  headless playtests (drive `CityWorld`, assert outcomes)
- `npm run build` - typecheck + production build to `dist/`
- `npm run pwa` - serve `dist/`, cut the network, check the game still loads

Looking (every real bug in the city so far was found by looking, not by a test):

- `npm run city` - the city from above to `screenshots/citymap.png`;
  `-- --terrain` is the land alone, `-- --seed N` another seed
- `npm run cityshot` - the 3D city from fixed viewpoints, own server;
  `-- --view at --at x,z,heading` stands the car anywhere
- `npm run sketch` - a *drawing* of a candidate map, touching nothing in
  `src/`; the cheapest place to answer a question about the city's shape

Driving and pursuit:

- `npm run citylap` - guard: a reference driver round every route, empty and
  with traffic, and against the ladder. The only driving baseline; compare to
  `docs/city-baseline.json` after touching `constants.ts`, re-record with
  `-- --out docs/city-baseline.json`. A route that comes back faster with
  traffic, or does not finish, fails it (#210)
- `npm run drivers` - report: the same routes for four driver tiers. Its route
  flag moves with the driver as much as the route; never read it as "this
  route is bad"
- `npm run playthrough` - report: the whole game at every level, through the
  only driver with the skill model (`patrol` and `endings` drive perfectly)
- `npm run pace` - guard: an undamaged car outruns every heat level
- `npm run endings` - report: busted / escaped / neither per heat level; watch
  "neither"
- `npm run patrol` - report: twenty minutes of free roam with the police live
- `npm run trafficview` - report: traffic on screen against the reference's
  0.60 a second
- `npm run mapfit` - report: the network's pace profile (ADR-0011 wants about
  60% of top speed); used for an area's pace check

Map guards and reports:

- `npm run ramps` - guard: every ramp can be climbed
- `npm run grades` - guard: no arterial or boulevard is steeper than
  `cutAndFill`'s cap
- `npm run plan` - guard: the authored plan (#272) still fits the generated
  ground; `-- --draw` over the relief
- `npm run groundfit` - report: how every set piece sits on the ground

Authoring (an editor loop: export, edit in the browser, sync back):

- `npm run roadexport` / `roadsync` - the road editor and
  `docs/roads-edited.json`
- `npm run freewayexport` / `freewaysync` - the freeway loop editor and
  `city/freeway.ts`
- `npm run propexport -- --place P` / `propsync -- --place P` - an area's
  editor (props, houses, roads, yards); places are the table in
  `tools/suburbs.mjs`
- Drafters, run once and then edited by hand: `suburbdraft` (streets),
  `housedraft` (houses, hedges, trees, downtown's buildings), `worksdraft`
  (Industrial and the railway), `quarrydraft`, `marrowdraft`, `marrowtracks`,
  `islanddraft`. Each replaces only its own ids on a re-run

## Architecture (read before touching game code)

**The car is a position, a heading and a height in a 3D world.** `cityworld.ts`
is the whole simulation: motion, collision against buildings over a uniform
spatial index (`city/grid.ts`), a height-aware surface lookup, and everything
built on top. Velocity resolves onto x and z, a yaw limited by
`LATERAL_GRIP / speed` means corners have to be taken slower, and the feel work
in #14 and #46 still applies because that model has not changed since #82 -
only the frame it resolves into did.

**The city is data.** `city/generate.ts` turns a seed into a street graph -
junctions, roads, blocks and districts - as a pure function with no renderer
and no `Math.random`, so the sim can use it for collision and the playtests can
build one headlessly. `CITY_SEED` is content: changing it publishes a different
city. ADR-0005 is what the city is *shaped* like and is worth reading before
changing the generator. Water is generated first and the streets are cut
against it, bridges are few on purpose because they are the pursuit
chokepoints, and generation ends by proving the city is drivable and bridging
until it is.

**A crossing is chosen for where it is, not for how cheap it is** (issue
#247, ADR-0005 rule 2). Bridges are the pursuit chokepoints, and "few" is
about distance-to-one, not count. `chooseBridges` in `city/generate.ts` has
the furthest-first algorithm and the reasoning; `CITY_BRIDGE_SPACING`, not
`CITY_BRIDGES`, is the constant that actually controls how many a city gets.

**Land belongs to something** (issue #185). A riverbank used to lose whole
blocks at a time to `pullClear`, leaving a fifth of the map neither block nor
road - #176 made that visible by painting the ground as not-road.
`city/parks.ts`'s doc comment has the fill algorithm and the two ways it went
wrong first (raised pavement over a carriageway, the water field vs. its
outline).

**The ground has height, and the water still comes first** (ADR-0007, issue
#251). `city/terrain.ts` bakes a height field with the city, read by
`groundAt(terrain, x, z)`; both the sim and the renderer read the same data.
ADR-0007 has the full reasoning, including why it's baked rather than a
formula and what the shore ramp does to the map's steepness.

**The water gets a road, not a hundred dead ends** (issue #241). Streets cut
against the water used to leave 106 of the network's 109 dead ends stopped at
the bank; railing them off was the wrong fix. `city/embankment.ts`'s doc
comments have the algorithm - walking the coastline in runs, tagging spans
before `trimWaterStubs` runs - and why the two obvious shortcuts didn't work.

**The city is drawn through a provider seam** (issue #84). `city/` emits
descriptions - blocks, buildings, water - and never constructs geometry or
imports three.js; `scene/buildings.ts` turns those into one `InstancedMesh` per
kind, and `scene/cityscape.ts` assembles the scene. Keep that seam: it is what
lets boxes become models later by swapping a provider, and it is also why the
sim can collide with buildings without a renderer in the room. Building
footprints and heights are city *data* for exactly that reason.

**Roads are segments, not axis-aligned lines** (issue #115). `CityRoad`'s doc
comment in `city/types.ts` has the reasoning for dropping the `axis` field;
`boulevards.ts` has why curved roads go through the same pipeline as
everything else rather than being spliced into a finished graph.

**A ramp is two roads, and its foot is set aside on purpose** (issue #212).
Laid straight at its junction, a ramp's climb runs down the street underneath
it and `surfaceAt` always picks the flat one. `footFor` in
`city/interstate.ts` has the full reasoning for `RAMP_OFFSET`; the other
half - blocks cleared along a low ramp's corridor, same as for a boulevard -
is in `generate.ts` next to where it happens.

**The deck is 12 m up and the city is taller than that.** Buildings are held
under the interstate rather than swept out from under it - the opposite trade
from a ramp's corridor (#212), because a ramp is low enough to be in the road
and the deck is high enough to be scenery. `DECK_HEADROOM`'s doc comment in
`constants.ts` has the measurement that forced this. The deck stands on pairs
of solid pillars under its edges (#487), city data so the sim hits what is
drawn, and none stands on a road: `city/pillars.ts`.

**The freeway is built last, so it is the one thing that can end up in the
bay** (issue #244). The rule isn't "keep the freeway off the water" - the
viaduct over the bay and the tunnel under the river are both wanted - it's
that the *transition* between them, a ramp or a tunnel mouth, may not land on
water. `addInterstate`'s doc comment in `city/interstate.ts` has the full
reasoning.

**Height is a real property of the network** (issue #85). Nodes have a `y`, so
two roads at the same map position and different heights are two different
places: the interstate crossing a street overhead shares no node with it, and
you cannot turn from one onto the other. That is the case ADR-0004 exists to
make possible, and it means anything asking "what is at this position" has to
ask about a height too. Tunnels are the same mechanism with the sign flipped.

**Traffic lives on the graph, not in the world** (issue #87). A traffic car is
"which road, how far along, which way", derived to a position each step.
`citytraffic.ts`'s class doc and its `follow` method have the two easy ways to
get this wrong: spreading cars over the whole map instead of keeping them
around the player, and comparing distance along a road instead of in world
space.

**The city keeps a clock, and the traffic reads it** (issue #180).
`CityWorld.hour` drives `TRAFFIC_BY_HOUR`, and the renderer reads the exact
same number - `scene/daylight.ts` is a pure function of the hour returning a
palette, so the sky and the traffic never disagree about what time it is.
Night is *moonlit* and not dark: what says "night" is the ground under a lamp
being bright (`lamp-glow`), not the lamp itself. A day takes `DAY_MINUTES` and
starts in the afternoon, which is why every screenshot in the repo needs no
comment about lighting.

**How much traffic depends on where you are** (issue #180). `TRAFFIC_DENSITY`
scales population by the district under the car, remembered when there's no
road under it so cutting across a car park doesn't thin traffic out.
`TRAFFIC_DENSITY` and `TRAFFIC_LANE_BIAS`'s doc comments in `constants.ts`
have the reasoning, including why lane bias rejects rather than weights.

**A hit is one thing, wherever it lands** (issue #94). `impact.ts` is the
whole damage model, a pure function of two cars and the buildings around
them so it can be asserted on rather than judged from a screenshot. A car at
full damage stops being a `GraphCar` and becomes a `Wreck` instead - both
doc comments (`impact.ts`, and `Wreck` in `cityworld.ts`) have the reasoning.

**A roadblock is a line, not a row of cars** (issue #59). A wall built out of
circles has holes between the circles, and a barrier you slip through by
accident is worse than no barrier: `Roadblock` is a segment across the road
with an optional hole in it, and the parked cruisers are drawn along it. They
only go on roads at least `ROADBLOCK_MIN_WIDTH` wide, because a cruiser is
nearly as wide as a lane at this scale and a block across a two-lane street is
a wall with no decision in it - which also leaves the side streets as the way
round.

**A pursuit has to be started by something** (issue #177). Patrol cars cruise
the network like traffic and take no interest in you until
`CityPolice.witness` - the whole trigger - sees you do something, through the
same line of sight the pursuit itself uses; a provocation nobody saw is free.
The patrol that saw it converts to `chase` and spends the same budget
`recruit` does, so a pursuit is always built from cars already on the street.
`witness`'s doc comment in `citypolice.ts` has the reasoning.

**A pursuit has to be able to end** (issue #178). A bust needs a unit within
`CITY_BUST_DISTANCE` for `BUST_TIME`, gated on how *slow* you are rather than
how close, and units holding a stopped car don't drive through it - both
needed to make the timer reachable at all. A search that finds nobody still
has to end one, so `SEARCH_UNITS` sweep the area and the clock runs even
while you sit inside it; their doc comments in `constants.ts` have the
reasoning and the measurement that forced it (100% of stopped pursuits
deadlocked at heat 6 before this). `RepLedger.forfeit` takes back what that
pursuit paid and never past where it started - a bust that can re-lock an
already-earned rival is progress going backwards. `npm run endings` is the
probe for all of it.

**A pursuit can step off the road, and only just** (issue #220). A chasing
unit may leave the road when the car it is after is off it and within
`COP_LEASH`, drive straight at it, and rejoin at the nearest road; open ground
costs it `COP_OFF_ROAD`, more than it costs you. "Is the car off the road" is
the sim's own `onRoad`, never a second surface test. `CityPolice.cutsCorner`
has the reasoning.

**Not every cop is chasing you** (issue #61). `Cop.role`'s doc comment in
`citypolice.ts` has the reasoning for `chase` vs. `enforcer` vs. `patrol`;
each role spends its own share of `HEAT_LEVELS`' budget rather than
`maxCops`, so an Enforcer arriving in front never thins the chase behind you.

**"Put something in front of them" is one question** (issues #59, #60).
`CityPolice.aheadOfThem` finds a spot on a road far enough ahead to be seen,
running the way the player is going and at their height; roadblocks and spike
strips both go through it. The lead is measured in *seconds at the speed the
car is doing*, not in metres, because a fixed distance is a warning at 80 km/h
and a wall out of the fog at 300.

**A spike strip is not a collision** (issue #60). Nothing about the car's
motion changes on the step it is run over: what changes is `CityWorld.shredded`
and therefore the next several seconds of steering and top speed. It is also
swept by how far the car travels in a step rather than tested against its drawn
depth, because at top speed the car covers more ground in one step than the
strip is wide.

**There is no helicopter** (issue #183, and #62 before it). One existed and
was cut, along with cover - `constants.ts` carries a standalone note with the
full reasoning for both. Nothing in the game watches you from above. Cover means something
again, against a tunnel (#257): `CityPolice.blocked` holds that nothing on
the street sees a car on the freeway under the ground, and nothing in a tunnel
sees out - `underground()` in `citypolice.ts` has why it asks about the
freeway only.

**Every map goes through `scene/mapping.ts`** (a playtest, after #182). One
conversion (`toMap`) for the minimap, the full map and `npm run city`, because
three maps that disagree about which way is up are worth less than any one of
them. Its own doc comment has the arithmetic and the history; `mapview.test.ts`
settles it by projecting a point through an actual camera rather than by
reasoning about it.

**The maps only show what you have found** (a playtest). `Collectibles.known`
and `Garage.seen` fill in as you drive past things, and both are saved. A map
that knows where all ninety billboards are from the first second of a new save
turns finding one from something you do into something you are told. The
*counts* stay honest - "57 billboards left" is a goal - and the map says out
loud that only what you have driven past is marked, or four pins under that
sentence reads as a broken map.

**The river takes you and gives you back** (a playtest). Water used to revert
the car and stop it dead, which made the one natural feature in the city behave
like a level boundary. `CityWorld.dunk` puts the car under for `DUNK_HOLD`,
costs damage and all of your speed, and then calls the same `recover` a stuck
car uses (#179): "put this car somewhere it can drive from" is one question,
and a river and a wedged corner are two ways of asking it. The pursuit carries
on, because being dredged out of the bay does not mean they have lost you.

**Rep is one currency and its own module** (issue #64). `rep.ts` holds the
award table, the heat multiplier and the popup feed, and knows nothing about
the renderer, storage or the pursuit. Its own doc comment has the reasoning,
including why the table counts as a design document and not just code.

**The ladder is a price, not a queue** (issue #91). `rivals.ts` has the
reasoning for unlocking by Rep total rather than by beating the rival below.
A rival race is its own event (#419): the start lines are ordinary races open
to anyone, which end at the finish, and the next rival races you from a line
of their own (`CityWorld.rivalRoute`) that only exists once `challengeReady`.
Only a rival race calls the police at the lights and ends in the claim.

**Collectibles are city data, and the collection is not** (issue #93).
`city/collectibles.ts` places billboards and speed cameras against the finished
street graph with a minimum spacing, so a seed always produces the same ninety
boards in the same places; `collectibles.ts` owns the half that belongs to a
player - which are gone, and what you have been clocked at - because that is
the half that gets saved. Ids are stable within a seed, which is what makes a
save file mean anything.

**A car is a set of multipliers, not a set of numbers** (issue #67). Every
figure in `cars.ts` is written against the reference car, which is what keeps
the police, the speedometer and the feel work honest across a change of car.
`cars.ts` and `maxSpeed`'s doc comment in `cityworld.ts` have the reasoning. The
roster (#434) is forty-four cars, each an original stand-in for one in the
reference game's roster; `docs/research/car-roster.md` has the real figures and
the one rule that turns them into multipliers, so change the rule, not a car.

**A race is checkpoints for you and a distance for the field** (issues #70,
#71, #72). `CityRace` scores the player on gates passed in order, because a
city has more than one way round a corner and a race scored on distance
travelled is a race won by driving in circles. The field is six positions along
the route polyline rather than cars navigating the graph, because a rival that
could get lost would have whatever difficulty the junction picker happened to
produce, and the ladder is tuned against a number. The rival being challenged
is always the quickest car in the field, so winning the race and beating them
are the same thing. A speed run is the same machinery with a different scoring
rule and no field: one lap, won on the average speed held over it, measured on
*route progress* rather than distance travelled - or the way to a good average
would be to drive in a straight line away from the route. Routes come out of
`city/routes.ts`: four corner junctions joined by Dijkstra over the surface
graph, so every metre of a lap is a road that exists.

**An ambush is a scoreboard over the pursuit** (issue #92). `CityAmbush` knows
nothing about how an escape works: it is told whether the pursuit is clear and
whether you are busted, and it calls it. That is the whole reason the event
type is worth having - the pursuit is the best thing the city has, and every
other event asks you to stop being chased in order to play it. It also updates
*before* the BUSTED early return in `step`, because being busted is one of the
two ways it ends and the frozen world still has to notice.

**Damage never ends the game** (issue #95). Being unable to drive is a bust
with extra steps; being *slow* is a pursuit you have to think your way out of,
so damage takes the top speed and the grip and stops there. The first fifth is
cosmetic, because a model where the opening shunt makes the car worse turns
every pursuit into a spiral from first contact. Repair is drive-through, and
taking it *during a search* ends the search - a car that goes in beaten up and
comes out straight is not the car they are looking for. It does nothing while
they still have eyes on you, which is what makes it a decision about when
rather than a button that cancels a pursuit.

**Being stuck is measured in ground covered, not in speed** (issue #179). A car
wedged nose-first into a corner rocks back and forth for as long as the
throttle is held, so any test on speed says it is moving. `CityWorld` watches
how far it has got from where it last made progress, and after `STUCK_TIME` of
being asked to move and not moving it offers a reset. The reset takes priority
over everything else confirm can mean, and puts the car on the *nearest* road
keeping heat, damage and any running event - which is what stops a free reset
being a way out of a pursuit.

**A ladder rival is two fights** (issue #66). Winning the race pays and
nothing else: the rival runs, and the ladder does not move until you have
caught the car and wrecked it. The runner is a `GraphCar` choosing junctions,
not a position along a route like a race rival - which is the whole difference
between the halves, because a car on the graph can get away from you down a
street you did not take. Claiming adds the car to the garage but does not put
you in it: being teleported into a different car mid-pursuit, having just
wrecked somebody, would be absurd, and #90 is where changing car on purpose
belongs.

**The Quick Menu never pauses** (issues #90, #420). The world keeps running
underneath it. It is laid out and driven the way the reference's in-drive menu
is: a path of branches you walk down on a D-pad of its own, I J K L, because
the arrows and WASD are busy driving - L opens, goes in and selects, J backs
out. `quickwheel.ts` (the class is still `QuickWheel`) has the reasoning. The
reference's name for its menu ships nowhere. A place is a marker, not a
teleport: quick travel that moved the car would make the pursuit a formality
and the city a menu of places rather than a place. The one jump is to a
parked car you have found (#352), and it is refused while you are wanted,
cooldown included, and during any event (`CityWorld.jumpRefused`).

**Parts are progress; a profile is content** (issue #68). `mods.ts` and
`garage.ts` have the reasoning - why parts live on the garage rather than on
`CarProfile`, and why every mod is a *trade* rather than a flat upgrade.

**The map is where the game explains itself** (issue #181). A playtest produced
five separate comments that were all one problem: every mechanic worked and
none of them said so. The decision was one layer rather than five hints, and
the layer has two halves. The Tab map carries a legend for every marker and the
full list of keys, because it is already the screen a lost player opens and a
legend you can only read while *not* driving is one you can actually read.
Everything else is said at the moment it matters: a new car gets a plate saying
you are driving it now, damage points at the nearest workshop and says a repair
during a search ends the search, and a stuck car gets #179's prompt. One hint
is volunteered - `TAB - map, legend and controls` - and it stops the first time
the map is opened, because a timer either goes before a lost player has read it
or nags one who is fine. The rule the legend has to keep holding: no two things
share a colour *and* a shape.

**Touch is one reading, not a second control path** (issue #89). The drive loop
asks `held(id, ...keys)` and never learns whether the answer came from a key or
a thumb. `TouchControls` takes its button set from the caller rather than
building one, and the Quick Wheel's rows are *published* by the HUD as touch
regions - the thing that knows where it drew them is the thing that says where
they are, and how many there are changes with what is in the wheel.

**A pursuit breaker is the one thing the city does to the police** (issue
#57). Spike strips, roadblocks and Enforcers are all things the police do to
you; a gate that comes down on the cars behind you is the counterplay, and it
turns knowing the map into an advantage rather than a convenience. It *gives*
rather than stopping - something you have to slow down for is not worth aiming
at while being chased - and what it does to a cop scales with how close they
were, because a flat number makes it either useless or a button that deletes a
pursuit.

**Post-processing goes through the renderer, not `EffectComposer`** (issue
#75). The legacy composer double-maps tone mapping and costs an hour of
head-scratching to find. `scene/cityview.ts`, where the renderer is built,
has the comment; `three/examples/jsm` ships inside the three.js package
already bought by ADR-0004.

**The radio watches; it is not told** (issue #76). `radio.ts`'s doc comment
has the reasoning for watching the pursuit rather than being told about it.
The lines are a table because they are content: the tone of a pursuit is in
them as much as it is in the heat curve. Subtitles and a synthesized squelch,
never recorded speech.

**`?renderer=city` is the only query string for looking** (ADR-0006). It flies
a free camera over the city with no car in it, and `&view=aerial|downtown|bridge|street|overpass`
picks a fixed viewpoint. `?debug` is the other one, and it is for tools: it
turns on the telemetry recorder (#347, F9 to start and stop, always on in dev),
which saves a sample a second of the car's speed and the traffic on screen as
JSON for `npm run telemetry`. Looking at the generator is a different job from
playing the game, and `npm run cityshot` depends on it. The README lists the
viewpoints - keep it current, since it is the only place a person is told the
URL exists.

In dev only, `/` hangs the running sim off `globalThis.crosstown`
(`{ world, view, city }`). That is how `npm run cityshot` sets up shots it
could otherwise only get by luck: `takedown`, `roadblock` and `enforcer` all
put the thing being photographed in front of the car rather than driving into
one. Three things bite when writing one: headless
renders this scene at about two frames a second (so a frame is fifteen physics
steps, and the camera director is still running its opening orbit ten seconds
in - wait on `director.mode === 'chase'`), a cop pushed in with a position and
a `t` is teleported onto its road on the next step unless the `t` matches, and
the police sweep up roadblocks the instant the pursuit stops.

**The map is authored, and finished.** Every area is done
(`docs/map-areas.md`, kept current in the same PR as any work on one). Read
[ADR-0009](docs/decisions/0009-kestrel-bay-is-an-authored-map.md) and
`docs/map-exploration.md` before touching the generator: the districts and
places are authored data in `city/plan.ts`, the landmass and terrain are
frozen (`CITY_LAND_STREAM`), and the freeway, its tunnels and ramps are
authored too (`city/freeway.ts`, joined to the roads by
`city/rampconnectors.ts`). `CITY_STREET_GRID` is off, a switch rather than a
deletion; its doc comment has why.

Look at what you changed with `npm run city` and `npm run cityshot` - the city
is much easier to judge as a picture than as a test, and every real bug in it
so far was found that way rather than by the tests, which passed throughout.

**Physics runs on a fixed timestep** (`STEP = 1/60`) with an accumulator, so
behaviour is frame-rate independent; rendering happens once per animation frame
after physics catches up.

**A jump is ground with a shape, and the air is its own state** (issue
#307). `city/jumps.ts` holds each kind's profile, and the sim rides it exactly
rather than easing onto it the way it does a deck - at speed the car is on a
twelve-metre ramp for a fifth of a second. Leaving the lip sets
`CityWorld.airborne`: no steering, no throttle, gravity only, until the car
comes down on the ground, a road, a deck or another jump. A landing is priced
on how *steeply* it comes down (`LAND_SOFT`), not how far it flew, because the
game's gravity is over twice the real thing. Set pieces are solid in height
bands (`SET_PIECE_SOLIDS`), which is what lets a car drive under the cargo
plane's wing and still catch it on a jump that comes up short.

**A hill moves the top speed, not the acceleration** (issue #255). The speed
model has a hard cap and no drag, so gravity alone could never make a climb
cost a car at full throttle anything. `slope.ts` shifts the cap by the grade
(`SLOPE_SPEED`), the cap eases toward it (`SLOPE_EASE`) so the existing
overspeed bleed follows gently, and gravity pulls along the road on top. Every
`GraphCar` covers ground at the same factor in `advanceAlong`, which is what
keeps `HEAT_LEVELS` outrunnable on a climb - a cop that did not feel the hill
you did would close on you up every one of them.

**Nitrous buys the way out of a corner** (issue #105). It used to be mostly
top speed, which had nowhere to go once #82 made corners grip-limited.
`NITRO_TAPER`'s doc comment in `constants.ts` has the reasoning for why the
acceleration multiplier tapers with speed instead.

Tune feel via `constants.ts` first - most "how it drives / how it looks" knobs
live there.

**Simulation is split from rendering** (ADR-0003). All game state and logic
live in `cityworld.ts` as a pure `step(dt, input)` with no canvas or DOM;
`scene/` only draws it. Keep it that way: put new *behaviour* in `CityWorld`
(so the playtests can cover it) and only *drawing* in the renderer. Playtests
(`cityworld.playtest.test.ts`) construct a `CityWorld`, feed scripted inputs,
and assert on state - use `new CityWorld(undefined, { traffic: false, police: false })`
for a deterministic city. That split is the only reason the renderer rebuild
was survivable, and it is why the track could be deleted without deleting the
game.

**A save is a format, not a place** (issue #101). `storage.ts`'s `Store` and
`progress.ts`'s versioned record have the reasoning - why the version lives
in the record rather than the key, and why every field is validated rather
than trusted.

The in-memory fallback keeps a save for as long as the process lives, which is
right for a browser tab with no storage and wrong for a test runner: `src/test-setup.ts`
gives every test a fresh one, or the first test's Rep is the second test's
starting total.

**The service worker is generated, not written** (issue #98). A plugin in
`vite.config.ts` lists the build's own output and emits `sw.js`, because Vite
hashes filenames and a hand-written list goes stale on the first change - its
doc comment has the reasoning. `npm run pwa` serves `dist/`, cuts the network
and checks the game still loads, including `?renderer=city`, whose query
string is a different cache entry than `./`.

## Conventions

- TypeScript is `strict`, with `noUnusedLocals`/`noUnusedParameters` and
  `verbatimModuleSyntax`. Import types with `import type { ... }`.
- Prefer small, single-purpose modules under `src/game/`. Keep rendering pure
  (draw from state; don't mutate game state inside render helpers).
- Match the surrounding comment density - explain *why*, not *what*.
- New runtime dependencies need an ADR saying why. three.js is accepted by
  ADR-0004; that is the bar, not a precedent for adding more.

## House style

- Do not use em dashes in prose or comments; use a plain hyphen or reword.
- **Do not run Prettier.** There is no `.prettierrc` and no Prettier
  dependency, but the codebase is consistently single-quoted, so
  `npx prettier --write` fetches it, formats with its *defaults*, and silently
  converts whatever it touches to double quotes. That cost a repair PR (#159).
- When a decision is architectural and hard to reverse, record it as an ADR in
  `docs/decisions/` (see `0001` for the format).

## Non-goals

- Not networked, not commercial. No third-party assets and no imported map:
  Kestrel Bay is generated from a seed, not ripped. Reading about another game's
  map, timing a drive across it and measuring a published picture of its roads
  is research and is done openly; downloading a port of it is not, and was
  declined for that reason.
- Asset *quality* is a separate axis and is not a non-goal. Geometry may be
  upgraded behind the generator's interface - textures on the boxes first,
  then cars, then a modular building kit - as long as everything shipped is
  original, generated, or CC0. The buildings, the tarmac, the pavements
  and the cars have all had a pass (#11). Anything instanced is textured
  through `scene/worlduv.ts`: one shared geometry across an `InstancedMesh`
  means baked UVs would size a window or a paving slab by whatever its
  instance is scaled to, so the UV is computed in the vertex shader from the
  instance's own scale. Roof detail is derived in `scene/roofs.ts` from the
  building's `variant`, which is what that field is for: a rooftop box is
  geometry, so it belongs on this side of the seam. Street furniture is still
  boxes, though the lamps have arms.
- Not the online social layer. The 2012 game's social layer is out of scope.
- Not the mid-2000s template it started as. The old city, the ladder of
  fifteen, bounty, its milestone career and impound strikes belong to the other
  game; see ADR-0004 and ADR-0006. One-off milestone bonuses popped up while
  driving are the 2012 game's and are wanted.
