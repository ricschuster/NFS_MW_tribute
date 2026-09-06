# CLAUDE.md

Working rules for Claude Code in this repo. Keep this short and current.

## What this is

**Crosstown** is an open-world arcade street racer set in Kestrel Bay: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits with six heat levels.
TypeScript + Vite + three.js, no backend; it builds to static files.

Original work. It takes its cues from the genre, not from any one game: no
third-party names, places, cars or assets appear anywhere in the repo, and none
should be added.

**There is one game and one simulation.** It used to be two - a pseudo-3D
projected-segment racer on a single closed track, and the city replacing it -
and the track was deleted in [ADR-0006](docs/decisions/0006-the-city-is-the-game.md)
once the city could do everything it could. `/` is Kestrel Bay. Read
[ADR-0004](docs/decisions/0004-webgl-free-roam-city.md) for why the renderer is
what it is, then [ADR-0005](docs/decisions/0005-the-shape-of-kestrel-bay.md) for
what the city is shaped like.

## Commands

- `npm run dev` — dev server with HMR (http://localhost:5173)
- `npm run typecheck` — `tsc --noEmit`; run before considering a change done
- `npm run test` — unit tests + playtests
- `npm run playtest` — just the headless playtests (drive `CityWorld`, assert
  outcomes)
- `npm run city` — draw the generated city from above to `screenshots/citymap.png`;
  `-- --seed N` tries another one
- `npm run cityshot` — screenshot the 3D city from fixed viewpoints; starts its
  own server, so nothing else needs running
- `npm run citylap` — drive a reference driver round every generated route and
  report what it held; compare against `docs/city-baseline.json` after touching
  `constants.ts`, and re-record with `-- --out docs/city-baseline.json`. This is
  the only driving baseline; the track's `npm run feel` retired with the track.
- `npm run pwa` — serve `dist/`, cut the network, check the game still loads
- `npm run build` — typecheck + production build to `dist/`

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
until it is. Rules 4-7 of that ADR (curved residential streets, the interstate
loop, landmarks, relief) are partly built: landmarks and relief are not.

**The city is drawn through a provider seam** (issue #84). `city/` emits
descriptions - blocks, buildings, water - and never constructs geometry or
imports three.js; `scene/buildings.ts` turns those into one `InstancedMesh` per
kind, and `scene/cityscape.ts` assembles the scene. Keep that seam: it is what
lets boxes become models later by swapping a provider, and it is also why the
sim can collide with buildings without a renderer in the room. Building
footprints and heights are city *data* for exactly that reason.

**Roads are segments, not axis-aligned lines** (issue #115). `CityRoad` used
to carry an `axis` and every geometric test leant on it; boulevards bend, so it
is gone. Direction comes from the two endpoints, and "is this point on this
road" is a distance to a segment. The street grid is still generated
axis-aligned - that is what keeps blocks rectangular - but nothing may assume
it. Boulevards go through the same pipeline as everything else rather than
being spliced into a finished graph: that was tried first and meant
reimplementing water-clipping, junction-splitting and the connectivity repair,
badly.

**Height is a real property of the network** (issue #85). Nodes have a `y`, so
two roads at the same map position and different heights are two different
places: the interstate crossing a street overhead shares no node with it, and
you cannot turn from one onto the other. That is the case ADR-0004 exists to
make possible, and it means anything asking "what is at this position" has to
ask about a height too. Tunnels are the same mechanism with the sign flipped.

**Traffic lives on the graph, not in the world** (issue #87). A traffic car is
"which road, how far along, which way"; its position is derived from that each
step. That is what makes it follow streets instead of drifting across them.
Two things about it are easy to get wrong: it is kept *around the player*
rather than spread over the map, and cars look for the one in front in **world
space**, because roads are split at every junction so the car ahead is almost
always on a different road object.

**A hit is one thing, wherever it lands** (issue #94). `impact.ts` is the whole
damage model: closing speed along the line between the two cars, how square the
hit is, and whether the car has a wall behind it. It is a pure function of two
cars and the buildings around them, so it can be asserted on in numbers rather
than judged from a screenshot. A car that reaches full damage stops being a
`GraphCar` and becomes a `Wreck` on `CityWorld` - lifted out of traffic and out
of the pursuit entirely, so nothing in either has to remember to skip it.

**A roadblock is a line, not a row of cars** (issue #59). A wall built out of
circles has holes between the circles, and a barrier you slip through by
accident is worse than no barrier: `Roadblock` is a segment across the road
with an optional hole in it, and the parked cruisers are drawn along it. They
only go on roads at least `ROADBLOCK_MIN_WIDTH` wide, because a cruiser is
nearly as wide as a lane at this scale and a block across a two-lane street is
a wall with no decision in it - which also leaves the side streets as the way
round.

**Not every cop is chasing you** (issue #61). A `Cop` has a `role`: a `chase`
unit is spawned behind you, navigates to close the distance and keeps right; an
Enforcer is spawned *ahead* of you and steers to the lane you are actually in,
so dodging it means committing late. They have their own budget in
`HEAT_LEVELS` rather than a share of `maxCops`, because spending the chase
budget on them would thin out the pursuit behind you every time one arrived in
front of it.

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

**The helicopter is not a cop** (issue #62). It does not navigate the graph,
cannot be rammed and never busts anyone: what it does is keep you *seen*, which
means the cooldown from #63 never starts while it is up. The answer to it is
cover, and `coveredAt` says what cover is - a deck overhead, or being below
street level, which is the tunnel. Buildings deliberately do not count, because
a street between two towers is not being under anything. It flies low and
*ahead* of the car rather than high and behind, because the chase camera looks
roughly level and a thing you can never see is a thing the HUD has to explain.

**Rep is one currency and its own module** (issue #64). `rep.ts` holds the
award table, the heat multiplier and the popup feed, and knows nothing about
the renderer, storage or the pursuit: it is told what happened and at what heat
and decides what that is worth. The table is a design document as much as it is
code - it is the answer to "is a takedown worth more than getting away?" - and
races, collectibles and rivals all pay into it without reaching into the car's
physics. Everything is worth more while a pursuit is running, which is the
whole shape of the economy.

**The ladder is a price, not a queue** (issue #91). Ten rivals, and each one
takes the call at a Rep total rather than after you beat the one below.
`CityWorld` gates a race start on `challengeReady`, so the thing that moves you
up the ladder is everything you do rather than only the last race you won.

**Collectibles are city data, and the collection is not** (issue #93).
`city/collectibles.ts` places billboards and speed cameras against the finished
street graph with a minimum spacing, so a seed always produces the same ninety
boards in the same places; `collectibles.ts` owns the half that belongs to a
player - which are gone, and what you have been clocked at - because that is
the half that gets saved. Ids are stable within a seed, which is what makes a
save file mean anything.

**A car is a set of multipliers, not a set of numbers** (issue #67). Every
figure in `cars.ts` is written against the reference car, and
`REFERENCE_TOP_SPEED` is the number the feel work was done against. That is
what keeps three things honest at once across a change of car: the police run
at fractions of *your* top speed, so they stay outrunnable in a slow car and
catchable in a fast one; the speedometer divides by the reference, so a
hypercar reads faster rather than reading 320 km/h like everything else; and
`CityWorld.drive()` applies the profile once instead of multiplying it into
eight expressions in the hot loop.

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

**A ladder rival is two fights** (issue #66). Winning the race pays and
nothing else: the rival runs, and the ladder does not move until you have
caught the car and wrecked it. The runner is a `GraphCar` choosing junctions,
not a position along a route like a race rival - which is the whole difference
between the halves, because a car on the graph can get away from you down a
street you did not take. Claiming adds the car to the garage but does not put
you in it: being teleported into a different car mid-pursuit, having just
wrecked somebody, would be absurd, and #90 is where changing car on purpose
belongs.

**The Quick Wheel never pauses** (issue #90). It is held open with a key while
the world keeps running underneath, and entries are picked by *number* rather
than navigated to - navigating needs a cursor, a cursor needs direction keys,
and the direction keys are busy driving. Its "go to" branch sets a marker
rather than teleporting: quick travel that moved the car would make the pursuit
a formality and the city a menu of places rather than a place.

**Parts are progress; a profile is content** (issue #68). `mods.ts` is the
catalogue and `garage.ts` owns which car has earned what and what is bolted on,
because two cars of the same model have the same profile and different parts -
and the day the roster is edited nobody should lose an engine. Every mod is a
*trade*: a part that is better at everything is an upgrade with a menu in front
of it rather than a decision about what kind of car you want.

**Touch is one reading, not a second control path** (issue #89). The drive loop
asks `held(id, ...keys)` and never learns whether the answer came from a key or
a thumb. `TouchControls` takes its button set from the caller rather than
building one, and the Quick Wheel's rows are *published* by the HUD as touch
regions - the thing that knows where it drew them is the thing that says where
they are, and how many there are changes with what is in the wheel.

**A pursuit breaker is the one thing the city does to the police** (issue
#57). Spike strips, Enforcers and a helicopter are all things the police do to
you; a gate that comes down on the cars behind you is the counterplay, and it
turns knowing the map into an advantage rather than a convenience. It *gives*
rather than stopping - something you have to slow down for is not worth aiming
at while being chased - and what it does to a cop scales with how close they
were, because a flat number makes it either useless or a button that deletes a
pursuit.

**Post-processing goes through the renderer, not `EffectComposer`** (issue
#75). three.js r185 has its own effect pipeline: build the renderer with
`outputBufferType: HalfFloatType` and hand it passes with `setEffects`. The
legacy `EffectComposer` path applies tone mapping in its `OutputPass` *and*
leaves the renderer applying it too, so the frame is ACES-mapped twice - a pale
sky, dark buildings and no obvious cause. That cost an hour and is why the
comment is there. `three/examples/jsm` ships inside the three.js package, so
using its passes is not a new dependency; ADR-0004 already bought it.

**The radio watches; it is not told** (issue #76). Every system that could
raise a callout - the roadblocks, the spikes, the helicopter, the Enforcers -
already says what it is doing, so `Radio` compares a report of the pursuit
against the last step and queues what changed. One place that can be wrong
beats eight places that can forget to speak. The lines are a table because they
are content: the tone of a pursuit is in them as much as it is in the heat
curve. Subtitles and a synthesized squelch, never recorded speech.

**`?renderer=city` is the only query string left** (ADR-0006). It flies a free
camera over the city with no car in it, and `&view=aerial|downtown|bridge|street|overpass`
picks a fixed viewpoint. Looking at the generator is a different job from
playing the game, and `npm run cityshot` depends on it. The README lists the
viewpoints - keep it current, since it is the only place a person is told the
URL exists.

In dev only, `/` hangs the running sim off `globalThis.crosstown`
(`{ world, view, city }`). That is how `npm run cityshot` sets up shots it
could otherwise only get by luck: `takedown`, `roadblock` and `enforcer` all
put the thing being photographed in front of the car rather than driving into
one. Three things bite when writing one, all of them in the handoff: headless
renders this scene at about two frames a second (so a frame is fifteen physics
steps, and the camera director is still running its opening orbit ten seconds
in - wait on `director.mode === 'chase'`), a cop pushed in with a position and
a `t` is teleported onto its road on the next step unless the `t` matches, and
the police sweep up roadblocks the instant the pursuit stops.

Look at what you changed with `npm run city` and `npm run cityshot` - the city
is much easier to judge as a picture than as a test, and every real bug in it
so far was found that way rather than by the tests, which passed throughout.

**Physics runs on a fixed timestep** (`STEP = 1/60`) with an accumulator, so
behaviour is frame-rate independent; rendering happens once per animation frame
after physics catches up.

**Nitrous buys the way out of a corner** (issue #105). It used to be mostly
top speed, and since #82 made corners grip-limited that had nowhere to go: the
charge bought overspeed that had to be scrubbed off before the next bend, and a
lap with the boost was measurably *slower* than one without. The acceleration
multiplier tapers with speed now, so it is worth most where the car is slowest.

Tune feel via `constants.ts` first — most "how it drives / how it looks" knobs
live there.

**Simulation is split from rendering** (ADR-0003). All game state and logic
live in `cityworld.ts` as a pure `step(dt, input)` with no canvas or DOM;
`scene/` only draws it. Keep it that way: put new *behaviour* in `CityWorld`
(so the playtests can cover it) and only *drawing* in the renderer. Playtests
(`cityworld.playtest.test.ts`) construct a `CityWorld`, feed scripted inputs,
and assert on state — use `new CityWorld(undefined, { traffic: false, police: false })`
for a deterministic city. That split is the only reason the renderer rebuild
was survivable, and it is why the track could be deleted without deleting the
game.

**A save is a format, not a place** (issue #101). `storage.ts` is a three-method
`Store`; `progress.ts` encodes and decodes a versioned record through whichever
one the host installed. `setStore` is the seam a desktop shell uses at startup
to put a file in the user's app data directory behind it. The version lives
*in the record* rather than in the key, because a versioned key orphans every
older save where a versioned record can be read and brought forward - and every
field is validated rather than trusted, so a save written before Rep existed is
a save with no `rep` in it and not a corrupt one.

The in-memory fallback keeps a save for as long as the process lives, which is
right for a browser tab with no storage and wrong for a test runner: `src/test-setup.ts`
gives every test a fresh one, or the first test's Rep is the second test's
starting total.

**The service worker is generated, not written** (issue #98). Vite hashes every
filename it emits, so a hand-written precache list is stale the first time
anything changes: a small plugin in `vite.config.ts` lists the bundle plus the
handful of stable files in `public/` and emits `sw.js` at build time. It runs
`enforce: 'post'`, or `index.html` is not in the bundle yet and the one file
every player asks for is the one not cached. `npm run pwa` serves `dist/`,
cuts the network and checks the game still loads - including `?renderer=city`,
because a navigation with a query string is not the same cache entry as `./`
and that is the case that breaks.

## Conventions

- TypeScript is `strict`, with `noUnusedLocals`/`noUnusedParameters` and
  `verbatimModuleSyntax`. Import types with `import type { ... }`.
- Prefer small, single-purpose modules under `src/game/`. Keep rendering pure
  (draw from state; don't mutate game state inside render helpers).
- Match the surrounding comment density — explain *why*, not *what*.
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
  Kestrel Bay is generated from a seed, not ripped.
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
  fifteen, bounty, milestones and impound strikes belong to the other game; see
  ADR-0004 and ADR-0006.
