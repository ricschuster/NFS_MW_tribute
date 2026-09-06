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

**It has been played, once, properly** (2026-09-06), and that is where most of
the open board came from. See "Where the work is".

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
                  roadblocks, spike strips, and Enforcers that come at you
                  head on
  graphcar.ts     what it is to be a car on the street graph (traffic + police)
  audio.ts        synthesized engine / siren / squelch
  touch.ts        on-screen controls; one reading, not a second control path
  city/           the generator: types, rng, water, generate, boulevards,
                  interstate, buildings, furniture, collectibles, streetfinds,
                  routes, ambushes, repairs, breakables, grid
  scene/          the renderer. cityscape assembles it - ground, carriageways,
                  water, pavements, markings, bridges, viaduct - while cameras,
                  hud and cityview drive it; buildings, furniture, collectibles
                  and breakables build the instanced geometry; worlduv, facades,
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
npm run citylap    # every route, empty and in traffic, then every rival on the
                   # ladder, clean and boosted; all of it vs. its baseline
npm run pace       # can the police be outrun? yours vs theirs, every heat level
npm run patrol     # twenty minutes with the police live: what started each
                   # pursuit, time to the first, and how much of it was free roam
npm run endings    # how a pursuit ends - busted, escaped, or neither - at each
                   # heat level, driving and stopped
npm run drivers    # the same routes driven by beginner / advanced / expert / perfect
npm run build      # typecheck + static build
npm run pwa        # serve dist/, cut the network, and check it still plays
npm run icons      # redraw the app icons from tools/icons.mjs
```

### Playing, looking, and measuring

The single most useful thing to know about working here. There are three ways to
find out something is wrong, and they find different things.

**Playing it beats both of the others and is the one that gets skipped.** On
2026-09-06 somebody drove the game for ten minutes and came back with twelve
comments; nine became issues and two were outright bugs. The test suite was
green, and so were five probes. It found things no probe can even be pointed at:
that you cannot tell where the road is, that a pursuit starts for no reason and
never ends, that the minimap points the wrong way, that nothing in the game
explains the Quick Wheel or the repair shops or why your car changed colour.
Do it first, do it often, and write down what you felt rather than what you
think caused it.

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

`npm run endings` came later and answers the one nobody had asked: *how does a
pursuit finish?* It found that cops reach a stopped car to within 0.0 m and
drive through it, and that a search had nobody in it - two things that were
invisible to every test and every screenshot, and that between them meant a
pursuit had one ending, the one that pays you.

Three tools came out of that, and they answer different questions.
`npm run drivers` runs the same routes at four skill levels, because `citylap`
measures a *perfect* driver - one that holds its lane exactly, looks the whole
braking window ahead and never stops paying attention - which is the right
control and the wrong target.
`npm run pace` is a *guard*: it compares your real top speed against the
quickest unit at every heat level and fails if an undamaged car cannot outrun
one, which is an invariant `HEAT_LEVELS` exists to hold and which has been
broken twice by accident without a test going red. `npm run patrol` is an
*instrument*: twenty minutes in the city with the police live, reporting what
the game did rather than asserting anything. It found #170, #171 and the shape
of the Rep curve on its first run - though note that the *playtest* found more,
faster, and none of it overlapped.

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

**Eight issues are open.** M4 (Kestrel Bay rebuild) and M5 (open-world systems)
are closed, and #165 closed the rebuild out by deleting the thing it replaced.

Most of what was open came from **one person playing the game for ten minutes**
on 2026-09-06, which is still the single most important fact on this page: the
test suite was green throughout, five probes were green throughout, and the
playtest found nine things. Six of those are now fixed - #179, #177, #178, #183,
#181 and the first half of #180.

The newest issue on the board, **#192**, is the other lesson: it was found by a
*probe*, on the day the probe was written, and it had been true and invisible
since #165. Play the game first; then point something at the part of it nothing
has ever measured.

### The pursuit works now: the cluster is closed

It was one problem in three issues - #177, #178 and #183 - and all three are
done. A pursuit starts because a unit saw you do something, it ends in an
escape or a bust, and the helicopter that held `seenBy` unconditionally true is
gone.

**#177 is fixed, and it changed the shape of the other two.** A pursuit now
starts because a unit *saw* you do something: `CityPolice.witness` runs the
provocation through the same line of sight the pursuit uses, and patrol cars
cruise the network before there is any pursuit at all, so the car that turns in
behind you was already in the street. `npm run patrol` reports 6.8 of 10
minutes in free roam where the answer used to be zero, and a first pursuit at
01:18 where it was always 00:12. Two things came out of doing it that matter
here. `recruit` had a hole its own comment describes - it refused to call cars
in on a pursuit that had lost you *unless the count was zero*, so shaking every
car spawned a replacement onto the street you had got away down, which is one
of the ways #178's pursuits never ended. And the old `chase` playtest helper
was driving a car that wedged itself against a building five seconds in: every
pursuit test in the suite was measuring a stationary car that cops drove to.

**#178 is fixed, and half of what it said was wrong.** `reset()` always set
`heat = 0`, so "heat carries on from where it was" was never true; and the
"1 bust in 54" was right for a reason nobody had guessed. Cops *can* reach a
stopped car - measured, to within **0.0 m** - and then drive straight through
and away, because a car on the graph has a target speed and no notion of
having arrived, so the bust timer was reset several times a second by their own
units sailing past the suspect. The other half was worse: a car that stopped
inside a search area was wanted indefinitely, because the clock did not run in
there and nothing was ever sent to look. At heat 6 that was **100% of stopped
pursuits**.

Three changes, and none of them works alone. The bust clock runs on how slow
you are rather than only on how close they are; a unit that has caught a
stopped car holds station; and a search sends units to sweep the area while its
clock keeps running, slowly, even with you sitting in the middle of it. The
stake is the pursuit's own Rep - `RepLedger.forfeit` takes back what that
pursuit paid and never reaches past where it started, so a bust cannot re-lock
a rival that was already earned.

`npm run endings` is the probe that settled it, and it is worth keeping
pointed at this: stopped under heat now ends in a bust 83 / 67 / 100% of the
time at heat 1 / 3 / 6, driving ends in an escape 67 / 67 / 83%, and the
stalemate is down from 100% (stopped, heat 6) to 0%. What is left is 17% of
heat 3 and 6 pursuits still running at three minutes for a driver who laps -
which is partly the probe, since a 3 km circuit sits mostly inside a 670 m
search area.

**#170 sits downstream** and should not be settled first. It asks whether a
wrecked car can escape, and measured under realistic conditions the answer is
*damage makes no difference* - see Known problems. But "can I end this" turned
out to be the more pressing question, and #177/#178 have now answered it.

### The game explains itself now (#181, done)

Five playtest comments, one missing layer, and the layer went in as one thing
rather than five hints. The Tab map carries a legend and the key list; a new car
gets a plate saying you are driving it now; damage points at the nearest
workshop and says that repairing during a search ends the search; the player is
a white ringed arrow drawn last. One hint is volunteered, `TAB - map, legend and
controls`, and it stops the first time the map is opened.

**The rule to keep**: no two things share a colour *and* a shape. Roadblocks
were the Enforcer's red and spike strips were the speed camera's yellow, so two
of six colours meant two things each; police barriers are white lines now and
ambushes are rings rather than dots. Adding a marker means checking that pair,
and adding a mechanic means deciding where it gets explained.

### The rest, roughly by how much they cost a player


- **#180's cheap half is done; time of day is not.** Traffic varies by district
  now (downtown 94 cars, industrial 38) and spawns favour the bigger roads. A
  day/night cycle with traffic that thins after dark is the other half, and it
  is a lighting problem as much as a traffic one - it belongs with #11, where
  night and weather are already named as the biggest visual step left. It has
  no issue of its own yet.
- **#192 the ladder is unwinnable, and #166 is what found it.** `npm run citylap`
  races all ten rivals now, and the reference driver comes seventh of seven
  against every one of them - including the rival the game opens with - by most
  of the race distance. The field runs at 82-93% of your top speed along the
  route line; a city lap holds 26% in traffic. `RIVAL_BASE_SPEED_FRAC` was
  calibrated by `npm run feel` against the track sim, where a reference lap
  averaged 91%, and that sim is deleted. Nothing went red when it happened,
  which is the whole argument for the probe. The calibration itself wants a
  person: see #192 for the two decisions.
- **#14 tune how the car feels.** Rescoped 2026-09-06 - every constant it
  originally named had been deleted. Now it names the ones that exist and
  carries three specific questions. Note it should be tuned against a *named
  driver tier* and against the *traffic* column, not against the perfect driver
  on empty roads, which is what `SPEEDRUN_TARGET` was derived from.

**M6: Beyond the browser - 3 open, and deliberately not started.** #98 made the
game installable and offline and #101 opened the storage seam a shell needs.
What is left is picking a desktop shell (#99), a release pipeline for it (#100)
and split asset budgets (#102). These were not attempted, for reasons that are
about the environment rather than the work: there is no Rust toolchain and no
display here, so a Tauri build cannot be compiled or run, and picking between
Electron and Tauri is a heavyweight runtime dependency plus a CI and signing
decision. Per the house rule that wants an ADR for a new dependency, that is a
choice for a person, not something to settle by picking one and shipping it.

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

1. ~~Signs and barriers are still plain boxes.~~ Done, and the barrier turned
   out to be a bug rather than an art problem: `add` rotates local x to be
   *across* the road - that is how a lamp arm reaches over the carriageway -
   and the parapet was passing its six-metre length as its width, so every
   bridge had ribs sticking out sideways from the deck every six metres. It is
   a wall with a coping now, running along the deck. Signs get a second, smaller
   plate and a face texture; note that at the distance a sign is actually seen
   from it is the *silhouette* that reads, not the face. `--view signage` is
   the framing, and it took four attempts to find - the first sign in the list
   is at the far corner of the map.
2. Buildings that are more than one or two boxes: podiums, canopies at street
   level, varied roof lines. A real modular kit, behind the same provider seam.
3. Night, weather and wet roads. A lighting problem rather than a geometry one,
   and probably the biggest single change left.
4. The HUD and menus, which have had no pass at all.

## Known problems, not papered over

- **A wrecked car cannot pull away from a heat 1 cruiser** (#170). At full damage the
  player tops out at 72% of reference; the slowest unit in the game runs at 84%,
  and heat 6 elites at 98%. `cityworld.ts:535` hands the pursuit `this.maxSpeed`,
  which is the *undamaged* figure, while damage is applied only to the player's
  own cap at `cityworld.ts:517`. So every fraction in `HEAT_LEVELS` is measured
  against a car you may not be driving any more, and the invariant those
  fractions exist to hold - "a pursuit you cannot outrun on speed alone is a
  pursuit with no answer" - is true for a clean car and inverted from heat 1 for
  a hurt one. Whether that is the design is a decision, not a fix: repair is
  drive-through and there are six shops, so "go to the workshop" may well be the
  intended answer. Note the clean-car margin at heat 6 is 2 percentage points,
  and that half damage is already caught from heat 3. `npm run pace` prints the
  whole table and is the guard on whichever way this is settled.

  **But speed turns out not to be how you escape.** `seenBy` needs a cop within
  `SEEN_RANGE` *with line of sight*, so turning a corner breaks contact whatever
  your top speed is. Measured with traffic on and an imperfect driver that runs
  rather than laps, damage makes no detectable difference: clean gets away 83 /
  67 / 50% at heat 1 / 3 / 6, wrecked 83 / 50 / 50%. Read that as *no effect*,
  not as "damage helps" - six runs a cell means one run is 17 points.

  **The docs half of that is now fixed.** The `HEAT_LEVELS` comment and
  `npm run pace` both said, or implied, that speed is how you get away; they
  say what the fractions actually buy now, which is a floor under the pursuit
  rather than the mechanic. And `npm run endings -- --damage 1` runs the whole
  measurement in a wrecked car, so the claim is checked rather than argued:
  driving, a wrecked car escapes 67 / 17 / 50% of the time at heat 1 / 3 / 6
  against a clean car's 50 / 17 / 67% - no consistent difference, and inside
  the noise at six runs a cell.
  
  What is left of #170 is a design question and only a person can answer it:
  *should* a wrecked car be able to pull away from a heat 1 cruiser on a
  straight? The mechanics work either way. The other half of the old note here
  - "the real problem is #178" - is settled: #178 is done, and a bust is now a
  thing that happens.
- **A stuck car has a way out, and it is deliberately narrow** (#179, fixed).
  Three seconds of asking the car to move without covering twelve metres earns
  a prompt; taking it puts the car on the *nearest* road, keeping heat, damage
  and whatever event is running, which is what stops a free reset being a way
  out of a pursuit. Two things it does not catch, both on purpose. A car
  scraping along a wall is covering ground, so the clock keeps resetting - it
  reads as driving because it is. And a car boxed in by traffic at a junction
  under throttle will be offered the reset, which is generous rather than
  wrong. What proved the first of those was a screenshot: `--view stuck` first
  tried to *drive* into a wall and hold the throttle, and the car bounced off
  and drove away every time, so the shot is a placed wedge instead.
- **The ladder is measured now, and it is unwinnable** (#166 built the probe,
  #192 is the finding). `npm run citylap`'s second table races every rival
  twice, clean and with the boost used on the straights, and records the result
  in the baseline. It reports rather than fails, because whether the ladder is
  right is a judgement - but it prints the two numbers a calibration has to
  reconcile side by side: what the field was configured to hold, and what the
  driver actually held.
- **Tarmac means drivable, and it did not used to** (#176, fixed). The ground
  was one asphalt plane with the road network showing through the gaps between
  block slabs. The gaps are not the roads - blocks are rectangles, roads bend
  and get clipped - so anywhere they disagreed was tarmac the sim caps you at a
  quarter of top speed on. Now the ground is paved-but-not-road and
  `Cityscape.carriageways` paints each road at exactly the width `onRoad`
  tests, rotated to its segment and extended half a width past each end, which
  approximates the capsule and fills junctions from both sides. One rule carries
  it: dark tarmac is drivable, anything lighter is not, green is a genuinely
  open block. Do not put the asphalt back on the ground plane to hide #185.
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
- **Pursuit Rep no longer dominates the economy, and the old note was right
  when it was written.** It used to say twenty minutes at heat 6 earned several
  times the whole ladder, because the helicopter held you seen and the heat
  never came down. Measured after #177, #178 and #183: fifteen minutes of
  `npm run patrol` earns **10,631** against a 65,000 ladder, across five
  pursuits, four escapes and two busts, with 8.5 of the 15 minutes in free
  roam. Three things moved it - pursuits have to be provoked, they end, and a
  bust takes that pursuit's earnings back. Whether that is now too *thin* is
  #14's to settle, and it should be settled against this number rather than
  against the old one. Beware short samples: a six-minute slice of the same run
  paid 575, because it happened to contain a bust and no long escape.
- **Cover is not a mechanic any more** (#183, and read this before adding one).
  The helicopter is deleted, and `coveredAt` with it: a deck overhead and the
  tunnel are geometry now, because there is nothing left that watches you from
  above. That was the one thing making map knowledge matter in a pursuit, so if
  cover should mean something again it needs a new thing to mean it against -
  and whatever that is has to be *visible*, which is the test the helicopter
  failed. It was about four pixels in a rendered frame while the HUD explained
  what it was doing, which is exactly what #62's own rationale said not to
  build.
- **The minimap is hard to read in daylight.** Its background is
  `rgba(8, 12, 18, 0.62)`, so a bright or busy scene shows through it and the
  roads lose contrast. It clips correctly - a building apparently spilling past
  the circle is the scene behind it, not a masking bug - but 62% is not enough
  over pale tarmac. Its *rotation* was wrong until #182 and is worth knowing
  about: it rotated by `+heading` where a heading-up map needs `-heading`, so
  the road in front of you was drawn behind you at 90 degrees of heading. Found
  by playing, settled by arithmetic - a screenshot could not, because the
  coloured line on the map was a boulevard crossing nearby rather than the
  street the car was on.
- **The lighting is flat.** `castShadow` and `receiveShadow` are set throughout
  `scene/`, and shadows still contribute almost nothing to a frame: everything
  reads as evenly lit midday. This is the strongest argument for #11's night,
  weather and wet roads being the biggest remaining visual step. The geometry is
  carrying the look on its own.
- **The city's sound is thin.** #76 wired `audio.ts` into Kestrel Bay - engine,
  siren and a radio squelch - but there is still nothing for a takedown or a
  spike strip, and no music.
- **The traffic column in `citylap` moved per route with #180, in both
  directions**, which is the point: routes through downtown got slower (Crosstown
  29% -> 25%) and routes through the quieter quarters faster (Bayside 24% ->
  29%). The average across the six is about where it was. Damage moved around a
  lot at the same time and not obviously in one direction - it was already
  anywhere from 0% to 100% route to route - so do not read a single route's
  damage figure as a signal.
- **Traffic does not resolve traffic-vs-traffic collisions** at junctions. One
  overlapping pair in ~2775 at last measurement: acceptable, not solved.
- **Blocks stay rectangles in winding quarters**, so they do not follow the
  curves. Reads acceptably; fixing it needs rotated or polygonal blocks. #185
  papered over the *consequence* rather than fixing this: the land a dropped or
  shrunken block leaves behind is parkland now, so it reads as somewhere rather
  than as an apron, but the blocks themselves are still rectangles and about a
  tenth of the map still belongs to nothing. That tenth is margin - a median of
  15 m from the nearest block - which is why it stopped being urgent.
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
- **`citylap`'s driver is perfect, and nobody is.** It holds its lane exactly,
  looks the whole braking window ahead, never misjudges a corner and never stops
  paying attention. `npm run drivers` runs the same routes at four skill levels,
  and the spread is large: in traffic a beginner holds 43-81% of the reference
  driver's average speed depending on the route, an advanced driver 72-86% and
  an expert 92-97%. Tune against the middle of that, not the top of it. **The
  tier calibration is a first pass and wants a person**: the numbers were fitted
  to make the gaps legible, not against anyone's actual play. Two things
  the model got wrong on the way in are worth not repeating: faults have to be
  square-rooted rather than linear, or an "expert" gets a 45 ms reaction time
  that no person has; and reaction time must lag the *steering* only, because a
  person brakes for a corner by anticipation and lagging that too turned the
  expert into a driver who crashed 358 times over six routes.
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

Read `CLAUDE.md`, then ADR-0004, ADR-0005 and ADR-0006.

**Then play the game for ten minutes.** Not the probes, not the tests - drive
it. On 2026-09-06 somebody did that for the first time in months and it produced
nine issues, including two outright bugs, while the test suite and five probes
stayed green throughout. It is by a wide margin the highest-yield thing anyone
can do here, and it is the thing that keeps not getting done because there is
always a number to go and look at instead.

Then read "Where the work is". The pursuit cluster (#177, #178) is the biggest
thing and wants a conversation before code, because what a bust costs is an
economy decision and `rep.ts` is a design document as much as a module. #181 is
the largest amount of player-visible improvement for the least architectural
risk.

Whatever you pick: keep behaviour in the sim and drawing in the renderer,
because that split is the only reason this rebuild has been survivable, and keep
the city's *descriptions* in `city/` for the same reason.

## What this session learned, since it keeps recurring

Two failure modes showed up repeatedly on 2026-09-06 and both are cheap to
repeat.

**A mechanism that would explain the symptom is not evidence that it does.**
#171 was filed saying head-on collisions were the problem; they were 10% of it,
and the fix implied by that diagnosis made things three times worse in
isolation. #170 was nearly answered from a probe that had run with traffic off -
the one condition where the thing being measured could not matter. Measure the
conditions, not just the number.

**Probes are wrong more often than the code is.** `npm run feel` was wrong three
times before it retired. This session, a probe reported "in their sights 0.0
min" because it read a field that did not exist, and reported top speed
unchanged at full damage because the cap is applied at the use site rather than
to `maxSpeed`. If a number looks strange, suspect the probe first.
