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
  `islanddraft`, `downtowndraft` (downtown's trees, furniture, plazas and lawns),
  `tidewaterdraft` (Tidewater Park's once-over), `highmoordraft` (Highmoor Park's), `industrialdraft` (Industrial's once-over: culls rail yards). Each replaces only its own ids on a re-run

## Architecture (read before touching game code)

One line per rule. The reasoning for each is in
[docs/architecture.md](docs/architecture.md), and usually in the doc comment
the line names: read it before changing what a rule covers. A new rule gets a
paragraph there and a line here, in the same PR.

**Three that apply to everything:**

- **Simulation is split from rendering** (ADR-0003). All game state and logic
  live in `cityworld.ts` as a pure `step(dt, input)`; `scene/` only draws it.
  New *behaviour* goes in `CityWorld`, so the playtests can cover it. Playtests
  use `new CityWorld(undefined, { traffic: false, police: false })` for a
  deterministic city, and `src/test-setup.ts` gives every test a fresh save.
- **The city is data**, and `city/` never imports three.js (the provider seam,
  #84). `city/generate.ts` is a pure function of the seed with no
  `Math.random`; `CITY_SEED` is content. Physics is a fixed `STEP = 1/60`.
- **Look at what you changed** with `npm run city` and `npm run cityshot`.
  Every real bug in the city so far was found from a picture while the tests
  passed. Tune feel in `constants.ts` first.

**The world:**

- The car is a position, heading and height; `cityworld.ts` is the whole sim,
  colliding over `city/grid.ts`
- The map is authored and finished: ADR-0009, `city/plan.ts`, frozen
  landmass, authored freeway; `docs/map-areas.md` and `map-exploration.md`
- A crossing is chosen for where it is (#247) - `chooseBridges`,
  `CITY_BRIDGE_SPACING`
- Land belongs to something (#185) - `city/parks.ts`
- The ground has height and the water comes first (ADR-0007, #251) -
  `groundAt`, `city/terrain.ts`
- The water gets a road, not dead ends (#241) - `city/embankment.ts`
- Roads are segments, not axis-aligned lines (#115) - `CityRoad`
- A ramp is two roads, its foot set aside (#212) - `footFor`
- The deck is 12 m up; buildings are held under it, pillars on no road -
  `DECK_HEADROOM`, `city/pillars.ts`
- The freeway is built last; no ramp or tunnel mouth on water (#244) -
  `addInterstate`
- Height is a property of the network: same x,z at two heights is two places
  (#85)
- A jump is ground with a shape; the air is its own state (#307) -
  `city/jumps.ts`, `LAND_SOFT`, `SET_PIECE_SOLIDS`
- A hill moves the top speed, not the acceleration (#255) - `slope.ts`; every
  `GraphCar` feels it too
- Nitrous buys the way out of a corner (#105) - `NITRO_TAPER`

**Traffic:**

- Traffic lives on the graph, around the player (#87) - `citytraffic.ts`
- The city keeps a clock and the traffic and sky read it (#180) -
  `CityWorld.hour`, `scene/daylight.ts`
- Traffic depends on where you are (#180) - `TRAFFIC_DENSITY`,
  `TRAFFIC_LANE_BIAS`

**Pursuit:**

- A pursuit has to be started by something seen (#177) - `CityPolice.witness`
- A pursuit has to be able to end (#178): busts gate on slowness, searches end
  on the clock, and `RepLedger.forfeit` never goes past the start - `npm run
  endings`
- A pursuit can step off the road, only just (#220) - `cutsCorner`, using the
  sim's own `onRoad`
- Not every cop is chasing you (#61) - `Cop.role`, each role its own budget
- A roadblock is a line, not a row of cars, only on wide roads (#59) -
  `Roadblock`, `ROADBLOCK_MIN_WIDTH`
- "Put something in front of them" is one question, led in seconds
  (#59, #60) - `aheadOfThem`
- A spike strip is not a collision (#60) - `CityWorld.shredded`, swept per step
- There is no helicopter (#183) - the note in `constants.ts`; a tunnel is cover
  (#257) - `underground()`
- A pursuit breaker is the one thing the city does to the police (#57); it
  gives rather than stops
- The radio watches; it is not told (#76) - `radio.ts`; subtitles, never
  recorded speech
- An ambush is a scoreboard over the pursuit (#92), updated before the BUSTED
  early return

**Damage and recovery:**

- A hit is one thing, wherever it lands (#94) - `impact.ts`, `Wreck`
- Damage never ends the game (#95): it takes top speed and grip and stops
  there; the first fifth is cosmetic; a repair during a search ends it, never
  while they can see you
- Being stuck is measured in ground covered, not speed (#179) - `STUCK_TIME`;
  the reset keeps heat, damage and the event
- The river takes you and gives you back - `CityWorld.dunk`, the same
  `recover` a stuck car uses

**Progress and events:**

- Rep is one currency and its own module (#64) - `rep.ts`
- The ladder is a price, not a queue (#91, #419) - `rivals.ts`,
  `CityWorld.rivalRoute`
- A ladder rival is two fights: the race, then catching and wrecking the
  runner (#66); claiming does not put you in the car
- A race is checkpoints for you and a distance for the field (#70-#72) -
  `CityRace`, `city/routes.ts`
- A car is a set of multipliers (#67, #434) - `cars.ts`,
  `docs/research/car-roster.md`
- Parts are progress; a profile is content (#68) - `mods.ts`, `garage.ts`
- Collectibles are city data; the collection is not (#93) -
  `city/collectibles.ts`, `collectibles.ts`
- A save is a format, not a place (#101) - `storage.ts`, `progress.ts`

**Interface:**

- The Quick Menu never pauses; a place is a marker, not a teleport
  (#90, #420) - `quickwheel.ts`, `CityWorld.jumpRefused`
- The map is where the game explains itself (#181); no two legend entries
  share a colour *and* a shape
- The maps only show what you have found - `Collectibles.known`,
  `Garage.seen`; the counts stay honest
- Every map goes through `scene/mapping.ts` (#182) - `toMap`
- Touch is one reading, not a second control path (#89) - `held`,
  `TouchControls`
- Post-processing goes through the renderer, not `EffectComposer` (#75) -
  `scene/cityview.ts`
- `?renderer=city` (`&view=...`), `?look=...` (look-development switches,
  #579) and `?debug` are the only query strings; keep the README's list current. In dev, `globalThis.crosstown` exposes the sim
  for `cityshot`; its gotchas are in docs/architecture.md
- The service worker is generated, not written (#98) - `vite.config.ts`,
  `npm run pwa`

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
