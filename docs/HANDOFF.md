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

**It has been played twice, properly** (both 2026-09-06), and that is where
almost the whole board came from. Between the two playthroughs, twelve issues
were closed. See "Where the work is" - and read "How this went wrong twice"
before you trust a number in this file.

The pinned city today: 5 x 4 km, 3102 roads, 2314 junctions, 841 blocks of
which 312 are open ground and 252 of those are the parkland #185 laid over the
land the street grid never claimed. 231 km of road, 19 km of boulevard, a 13 km
elevated loop with 13 ramps and a tunnel, 3 river crossings, 3771 buildings,
5253 pieces of street furniture. 90 billboards, 24 speed cameras, 7 parked
cars, 6 events of 2.5 to 4 km - three circuits and three speed runs - 5 ambushes
at heat 2 through 6, 14 drive-through repair shops and 79 gates and pallet
stacks that come down. Eighteen cars: one you start in, seven parked around the
city, ten on the ladder. The city runs on a clock: a full day takes half an
hour of play and starts at 14:00, which is why every screenshot here is in
daylight.

## How this went wrong twice, and will again

Two failure modes account for most of what a very long session found, and both
are cheap to repeat.

**Almost every number in this game was calibrated against a world that no
longer exists.** `RIVAL_BASE_SPEED_FRAC` came from `npm run feel` racing on the
*track*, where a reference lap averaged 91% of top speed; a lap of Kestrel Bay
averages a quarter of that in traffic, so the entire ladder was unbeatable and
nothing went red when it happened. `SPEEDRUN_TARGET` had the same history.
`ROUTE_LAPS` was sized for "a two-and-a-half minute event at the pace the car
actually holds" - measured before #171 put traffic in the probes, so a race was
ten minutes. The helicopter's whole design rested on being visible. When you
find a constant with a confident comment, check what the comment was measured
*on*.

**The probe is wrong more often than the code.** In one session: `endings` grew
a `--skill` flag that changed nothing, because the skill model lives in
`driveRoute`'s hands and that probe drives the car directly. An impact probe
reported every crash as a low-speed scrape, because it read the speed *after*
the collision had reversed it. `citylap`'s ladder summary read the property
inverted, because `RIVALS` runs rank 10 first and the table is built backwards.
A weighted road pick was written, measured, found to do nothing, and replaced.
If a number looks strange, suspect the probe first - and when a probe tells you
something surprising, make it tell you *twice*, in two ways.

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
                   # heat level, driving and stopped; --damage 1 for a wreck
npm run playthrough # the whole game at every level it has one: four driver
                   # tiers, six heat levels, six events, five ambushes
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

**Eight issues are open**, and every one of them wants a person. That is the
state this session ended in and it is worth saying plainly: there is no longer
a queue of things that can be picked up and finished without a decision.

Twelve issues were closed in a day - #179, #177, #178, #183, #181, #166, #180,
#185, #192, #11's first item, and half each of #170 and #14 - and almost all of
them came from **two people-hours of actually playing the game**. The test suite
was green throughout. So were the probes.

### The four live ones

**#201 - a circuit is a six-minute race.** Nobody had seen it because until
#192 nobody had ever *finished* one: the field was three times faster than any
drivable pace, so the player was lapped and the race ended without them.
`ROUTE_LAPS` is 2 as a stopgap; the real fix is shorter routes, which
regenerates every start line. It carries the question underneath everything
else on this list: a quarter of top speed is 80 km/h in a game whose
speedometer reads to 320, and every number downstream is now calibrated around
a car that cannot get out of second gear in its own city.

**#204 - nitrous is a net loss on a city circuit**, 25% boosted against 30%
clean. #105's regression arriving on a road it was never measured on: a corner
every few hundred metres scrubs the overspeed off. It cost the ladder its
design property - "the boss is lost clean and won with the boost" is not
reachable - so the top of the ladder now wants a better *car* instead, which is
coherent but was arrived at rather than chosen.

**#14 - how the car feels.** Now has numbers under it rather than adjectives: a
good driver holds 24-31% of top speed in traffic and about half of it on an
empty road, three flat-out wall impacts wreck a car, and #201 and #204 are both
really this issue wearing a hat.

**#170 - should a wrecked car be able to pull away from a heat 1 cruiser?** The
measurable half is done and the docs that oversold speed are fixed; a wrecked
car escapes about as often as a clean one, because escaping is line of sight.
What is left is a preference.

### And the rest

**#11 - replace vector-drawn art.** The epic. Signs and bridge parapets are
done; night, weather and wet roads arrived in part with #180's day cycle. What
is left, in the order it would show: cars have no headlights, every lit window
is lit because the facade tile is one bay wide, nothing casts a moving shadow
as the sun goes round, buildings are still one or two boxes, and the HUD has
had one pass (#181) and no more.

**M6: beyond the browser - #99, #100, #102, deliberately not started.** There is
no Rust toolchain and no display here, so a Tauri build cannot be compiled or
run, and choosing between Electron and Tauri is a heavyweight dependency plus a
CI and signing decision. Per the house rule that wants an ADR for a new
dependency, that is a choice for a person.


## Known problems, not papered over

- **A wrecked car cannot pull away from a heat 1 cruiser** (#170). At full
  damage the player tops out at 72% of reference and the slowest unit runs at
  84%, so on a straight it cannot be done - the fractions in `HEAT_LEVELS` are
  measured against the *undamaged* top speed. **That is not how you escape, and
  the docs used to say it was.** `seenBy` needs a unit within `SEEN_RANGE` with
  line of sight, so a corner breaks contact at any speed, and
  `npm run endings -- --damage 1` measures a wrecked car getting away 67 / 17 /
  50% of the time at heat 1 / 3 / 6 against a clean car's 50 / 17 / 67% - no
  consistent difference, inside the noise at six runs a cell. What is left is a
  preference: *should* damage cost you the ability to break away? `npm run pace`
  guards whichever way it is settled, and its exit status covers the clean car
  only.
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
- **The ladder is measured, and every number in it was re-derived** (#166 built
  the probe, #192 was the finding). `npm run citylap`'s second table races every
  rival twice on one circuit, clean and boosted, driven by an *expert* rather
  than the perfect driver - this file's own rule for tuning - and records the
  result in the baseline. It reports rather than fails, because whether the
  ladder is right is a judgement, and it prints the two numbers a calibration
  has to reconcile: what the field was configured to hold, and what the driver
  actually held. The property it checks changed with #204 and the reason is in
  the constant's comment.
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
- **Both maps were mirrored east to west, and #182 is why it survived.** A map
  seen from above with +z up has -x to the *right*; both maps drew +x
  rightwards, and so did `npm run city`, so all three agreed with each other
  and disagreed with the 3D view. #182 found the minimap drawing the road ahead
  of you behind you, fixed it by flipping the rotation - which makes "ahead is
  up" true - and left the mirror. It took somebody playing to say "the map
  seems flipped". `scene/mapping.ts` is the one conversion now and
  `mapview.test.ts` proves it against a real camera. If you add a map, use
  `toMap`; if you add a marker to one, check it against the windscreen and not
  against the other markers.
- **The minimap is hard to read in daylight.** Its background is
  `rgba(8, 12, 18, 0.62)`, so a bright or busy scene shows through it and the
  roads lose contrast. It clips correctly - a building apparently spilling past
  the circle is the scene behind it, not a masking bug - but 62% is not enough
  over pale tarmac. Worse now than it was: the day cycle means the scene behind
  it is sometimes a white afternoon and sometimes a dark street, and one alpha
  cannot serve both.
- **The lighting is no longer flat, and shadows are still doing nothing.** #180
  put a clock in the sim and a palette on it, so the city runs from moonlight
  through sunrise, a long afternoon and a sunset - and the difference between
  three in the morning and half past eight is now the biggest thing in a frame.
  What has *not* changed is that `castShadow` and `receiveShadow` contribute
  almost nothing: the sun moves through the day and nothing casts a moving
  shadow, which at sunrise is the most conspicuous it has ever been. Wet roads
  and weather are still untouched, and both are #11.
- **Night is a fake, and knowing which parts is the point.** The lamps do not
  light anything: `lamp-glow` is an additive quad on the tarmac under each one,
  because four thousand point lights is a slideshow. Lit windows are an
  emissive map with *every* window lit - the tile is one bay wide, so "some
  windows dark" would repeat in a perfect grid across every building. Cars have
  no headlights at all. Each of those is a place the illusion ends, and the
  order to fix them in is probably headlights, then window variety, then real
  light from the lamps.
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

Read `CLAUDE.md`, then ADR-0004, ADR-0005 and ADR-0006, then "How this went
wrong twice" above.

**Then play the game for ten minutes.** Not the probes, not the tests - drive
it. Two people-hours of playing produced twelve closed issues in a day, while
the test suite and half a dozen probes stayed green throughout. It is by a wide
margin the highest-yield thing anyone can do here, and it is the thing that
keeps not getting done because there is always a number to go and look at
instead. `npm run playthrough` is the closest a machine gets - four driver
tiers, six heat levels, six events, five ambushes, reported as a session log -
and it is not close.

Then read "Where the work is", and expect to have a conversation rather than to
start typing: everything open now turns on a decision. #201 and #204 are the
two that block the most, and they are really the same question - **the car
holds a quarter of its top speed in its own city**, and the routes, the rivals,
the speed-run targets and the boost have all been calibrated around that rather
than anyone deciding it should be true.

Whatever you pick: keep behaviour in the sim and drawing in the renderer,
because that split is the only reason this rebuild has been survivable, and keep
the city's *descriptions* in `city/` for the same reason. If you change a
generator constant, remember it moves every seeded draw downstream of it - the
routes, the collectibles, the parked cars - so re-record the baseline and
re-shoot anything that framed a specific place.

## The probes, and what each is for

| | |
| --- | --- |
| `npm run test` | 479 unit tests and playtests |
| `npm run citylap` | every route, empty and in traffic, then every ladder rival; the only baseline, and the diff is the warning |
| `npm run playthrough` | the whole game at every level it has one, as a session log |
| `npm run endings` | how a pursuit ends - busted, escaped, or neither - driving and stopped, and `--damage 1` for a wrecked car |
| `npm run pace` | the one *gate*: can an undamaged car outrun every heat level |
| `npm run patrol` | twenty minutes with the police live, and what came of it |
| `npm run drivers` | the same routes at four skill levels |
| `npm run city` · `npm run cityshot` | look at it - the city is far easier to judge as a picture than as a test |

Every real defect in the *city* has been found by looking at a picture. Every
real defect in the *balance* has been found by a number. Neither finds what a
person driving finds.
