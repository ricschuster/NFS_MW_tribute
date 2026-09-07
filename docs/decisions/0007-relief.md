# 7. Relief: the ground has height

- Status: proposed
- Date: 2026-09-07
- Builds on: [0005](0005-the-shape-of-kestrel-bay.md)

## Context

ADR-0005 listed relief as rule 7 and deferred it in one sentence: *"The ground
plane gets height, which every earlier rule has to survive. Deliberately last:
it is the rule most likely to break the others, and the least missed if it never
happens."* Rules 1-5 are built. This is the decision to build rule 7, and one
sentence is not enough to build from.

What the city is today, looked at from outside: a flat rectangle of land with
sea drawn round it and a straight cliff where the land stops. The ground is one
`PlaneGeometry` the size of `bounds`. Every road sits at `y = 0` unless it is
the interstate. Two observations from play prompted this, and they turn out to
be the same observation:

- **The map is a square slab.** It is already an island; it just has straight
  edges, because the only water is a bay along the north edge and one river.
- **There is no topography.** The only height in the world is the interstate
  deck at 12 m and its tunnel at -9 m, which is a road property, not a
  landscape.

A third thing rides on the same decision. The genre uses tunnels as pursuit
geography, and we have exactly one - the interstate's. A tunnel through flat
ground is a road with a lid; a tunnel is only worth building where there is a
hill to go through.

### What makes this expensive

Not the height field. Three things:

1. **`y === 0` currently means two different things.** It means "at ground
   level" and it means "on the surface street network". Counted rather than
   guessed at: **ten places across nine modules** ask it the second way - where
   a park may go, where a lamp and a street sign go, where the police may spawn,
   which junctions an ambush may use and which a race may be routed over, where
   a workshop goes, where a breakable stands, and which junction can take a
   ramp. A street at 40 m on a hill makes all ten wrong.
2. **Terrain gradient is not road gradient.** A height field sampled along a
   street gives grades no car can climb. Real cities cut and fill; so must the
   generator. `npm run ramps` exists because unclimbable slopes are invisible
   until measured, and that was for ramps at 4-6%.
3. **A box on a slope floats or sinks.** Buildings are axis-aligned boxes on
   flat footprints, which is the whole reason `scene/buildings.ts` can instance
   them.

The sim, by contrast, is closer to ready than it looks. Only three places
assume the ground is flat: `surfaceAt`'s fallback returning `y: 0`, `settle()`'s
`supported = y <= 0` and the floor it falls to, and `hitsBuilding`'s
`y > CAR_RADIUS * 2` gate. All three become "relative to the ground here."

## Decision

Kestrel Bay gets a landscape. In build order, because the order is the decision
as much as the content is.

1. **Water still comes first, and the terrain is generated to agree with it.**
   ADR-0005 rule 1 stands: the water field is generated from the seed, the
   street network is cut against it. Terrain is then derived so that it is below
   sea level everywhere the water field says water, and rises from the shore.
   The alternative - carve terrain first and let water pool in it - reads better
   in theory and would invalidate rules 1-3, the connectivity repair, the bridge
   selection and the embankment, all of which are built and tested. Water first.

2. **The land is an island, not a slab, and it becomes one in the same sweep as
   the terrain.** The water field generalises from "a bay along the north edge
   plus one river" to something that may eat any edge: headlands, inlets, a
   second channel, a detached island. This is a change to `makeWater` and to the
   two places that assume the bay is north (`embankment.ts`'s `bankAt` and
   `midChannel`). Everything downstream already copes with arbitrary water,
   because everything downstream goes through the clip. The straight cliff edge
   stops existing: the land meets the sea at a shore on all four sides.

   Shipped *with* the terrain rather than before it, deliberately. Alone it is a
   small satisfying change; but it redraws the whole city, and so does the
   terrain, and a pinned city that changes twice means two rounds of
   re-recording the baseline and re-deriving the ladder for one result. One
   sweep, one re-tune.

   The coastline is also the thing that decides how much city there is left,
   and the answer came from finally running ADR-0005's own check. That ADR sized
   the map from a behaviour rather than a number - *"a pursuit should be able to
   cross the map in two to four minutes"* - explicitly because no verified
   published figure for any specific game's map exists to calibrate against.
   Nothing had ever measured it. Measured now, over the streets alone at the
   32% of top speed an expert actually holds in traffic:

   | crossing | by road | time |
   | --- | --- | --- |
   | corner to corner | 7.3 km | 4m 15s |
   | west to east | 5.0 km | 2m 55s |
   | south to north | 4.7 km | 2m 45s |

   The diagonal is *over* the band the rule asks for, and the rule turns out to
   be the thing that needs changing rather than the map. See rule 3.

   ADR-0005's claim that no verified figure exists to calibrate against was
   checked rather than assumed. No publisher ever gave one. The only area figure
   findable for the reference game's city is 72 km² and it is the description of
   a *fan-made port of the map into another engine*, whose terrain is a square
   heightmap extending well past the drivable city. But a community timing of
   the same map, driven end to end at a steady 65 mph, gives **9m 15s**, which
   is about **16 km of road**; divided by our own road-to-straight ratio of
   1.24 that is a 12.9 km diagonal, and at a 5:4 aspect a rectangle of about
   **10 x 8 km, 80 km²**. Two unrelated sources landing in the same place is
   worth more than either alone, and 80 km² is four times ours.

   Square kilometres are still the wrong unit to port between two games - what
   transfers is how long it takes to get somewhere - but the two agree, so the
   size is now known well enough to build against.

3. **The map grows to about 10 x 8 km, and the city inside it does not.**
   Four times the area, matching the reference game's measured crossing to
   within a rounding error, and *almost none of it is more grid*. What that map
   spends its extent on, read off a picture of its major roads, is periphery:
   a highway loop that leaves the city and comes back through the hills, canyon
   switchbacks, a long tail east into nothing, an island district across an
   inlet. The dense middle is perhaps a third of the frame. ADR-0005 already
   wrote the principle - *"a bigger city gets more sprawl, not more grid"* - and
   this is that, made specific: **the core keeps roughly the 245 km of street it
   has, and the new area is landscape with roads through it.**

   Two things fall out that are not in this ADR and need their own work. The
   generator has no idea what a rural road is: every road it makes is a street,
   an arterial, a boulevard, a ramp or an interstate, all of them laid on a grid
   of superblocks. And the interstate is a rectangle inset from the bounds,
   where the shape worth having is a circuit that leaves the built city
   entirely.

   ADR-0005's sizing rule - *"a pursuit should be able to cross the map in two
   to four minutes"* - is **rescoped rather than broken**: it now applies to the
   core, which is the part a pursuit is fought in, and the periphery is for free
   roam, races and being chased along at top speed. Rewriting it that way is
   honest; quietly letting a nine-minute map fail it would not be.

4. **Hills are about 60 m.** Tall enough to read as landscape against a
   19 m median building, short enough that downtown's towers still own the
   skyline, and - the reason for this number rather than a rounder one - 60 m
   over a kilometre of slope is 6%, which is exactly the grade cap rule 5 puts
   on an arterial. The terrain and the road rules are calibrated to each other
   rather than fighting: hills at this size are climbable by construction, and
   the ones that are not are the ones worth tunnelling through.

5. **The height field is baked, not a formula.** `groundAt(x, z)` reads a
   heightmap generated with the city - a regular grid at roughly 10 m,
   bilinearly sampled. A formula in the style of `water.ts` was the obvious
   choice and is the wrong one: cut and fill *displaces* terrain, and a pure
   formula cannot be displaced without becoming a formula plus a road lookup,
   which is a grid query in the hot loop. 500 x 400 floats is under a megabyte,
   O(1) to read, trivial to write into, and still a pure function of the seed.
   It is city *data*, like building footprints, and both the sim and the
   renderer read the same array.

6. **`y` stops carrying two meanings.** `CityNode` gains an explicit level -
   surface, elevated, tunnel - and the ten sites that test `y === 0` ask for
   that instead. This lands *before* any terrain exists, on its own, with no
   visible change: it is a prerequisite and it makes those modules honest either
   way. **Done** (#250): the level is derived from the height for now, so the
   two agree and the serialised city is byte-identical apart from the field
   itself - 2238 surface nodes, 203 elevated, 28 in the tunnel. The day they
   stop agreeing is the point of it, and `make()` in `interstate.ts` is the one
   line that stops being a derivation.

7. **Roads are cut and filled.** A road's height is the terrain smoothed along
   its length, subject to a grade cap, and the terrain is then displaced to meet
   the road. Junctions are levelled to one height so that turning is not a step.
   The caps: arterials and boulevards no steeper than 6%, streets no steeper
   than 10%. Enforced by a probe in the manner of `npm run ramps` - a gate, not
   an instrument - because a street the car cannot climb is a street that does
   not exist.

8. **Blocks are pads.** Each block is flattened to a single height and the drop
   at its edge is drawn as a retaining wall or a bank. Buildings stand on the
   pad, so a footprint stays flat and instancing survives untouched. A block
   whose corners differ by more than a storey is dropped and becomes parkland,
   the way #243 drops a building with no headroom under the deck.

9. **Slope changes the drive.** This is the point of doing it at all: a climb
   costs speed, a descent gives it back, and a crest unweights the car. Gravity
   resolves along the direction of travel in `CityWorld.drive()`, alongside the
   engine and drag terms. This is a change to the model tuned in #14, #46 and
   #82 and it is accepted knowingly: the alternative, terrain as scenery the car
   does not feel, is a hill you can see and not a hill you can drive.

10. **Tunnels and cuttings are what a hill is for.** Once there is relief, a
   street that meets one either climbs it, cuts through it, or goes under it,
   and the third is a tunnel. The mechanism already exists - height is a real
   property of the network (#85) and the interstate already tunnels - so this is
   generation, not new architecture. Separately and not dependent on any of the
   above: **a tunnel breaks the pursuit's line of sight.** #183 deleted cover
   along with the helicopter and left a note saying that if cover should mean
   something it needs a new thing to mean it against. A tunnel is that thing,
   and unlike a helicopter it is visible on the map.

11. **The interstate holds its height and lets the hills tunnel through it.**
    The deck stays 12 m above sea level rather than 12 m above whatever is
    underneath, which is what an elevated freeway does and what keeps #243's
    building-headroom rule and #244's water rule meaning what they say. Where a
    hill rises past the deck the freeway is in a tunnel, which is a tunnel
    nobody had to write: rule 9 gets some of its content for free from rule 3.
    Ramp feet land on terrain, so a ramp's grade is no longer a constant and
    `npm run ramps` becomes load-bearing rather than reassuring.

The generator stays a pure function of its seed, headless, outside the renderer.
The heightmap is data on `City` like everything else.

### What the extent is for

Asked of somebody who has actually driven the reference map, rather than
inferred from a picture of it, four things make it worth its size and all four
are things this ADR has to deliver rather than hope for:

- **the highway loop being long and fast**, and leaving the city rather than
  ringing it;
- **terrain**: canyon runs, switchbacks, and somewhere you can see the city
  from;
- **the water**: inlets deep enough that the shape of the land is the shape of
  the drive, and an island district reached by bridge;
- **density and shortcuts in the core**, which is the one item on the list that
  argues for *not* spreading the streets out to fill the new area.

The first three are the periphery earning its keep. The fourth is why the core
stays as it is.

### The issues this becomes

Milestone **M7: Relief**. Rules 1-2 and 5 are #249 and #251, which ship
together; rule 3's periphery is #260 and its freeway loop is #261; rule 6 is
#250; rule 7 is #252; rule 8 is #253; the renderer is #254; rule 9 is #255;
rule 10 is #256; and the half of rule 10 that depends on none of the rest - a
tunnel breaking the pursuit's line of sight - is #257.

Two more that are not rules of this ADR but are its consequences. #262 indexes
the block sweeps, because generation is 1.44 s and half of it is
`segmentToRect` called for every block against every road: worth doing before
the map is four times bigger, and provably a no-op on the output. #259 is
buildings you can drive into - height in a *building* rather than in the ground,
blocked by nothing here except rule 6's explicit node level.

## Consequences

- **The pinned city changes once, and completely.** Every figure in
  `docs/city-baseline.json` moves, the ladder has to be re-derived against the
  new routes, and every screenshot in the repo is of a different place. That is
  why the coastline and the terrain land together rather than one after the
  other. It should be a clean sweep rather than work interleaved with tuning,
  and `CITY_SEED` stays content.
- **The feel work is reopened.** Rule 7 puts a new term in the longitudinal
  model. `RIVAL_BASE_SPEED_FRAC`, `RIVAL_DIFF_SPEED_FRAC` and every constant
  derived from a lap time have to be re-derived afterwards, not before.
- **The renderer stops drawing flat quads.** The ground becomes a mesh, and
  carriageways, road markings and pavement slabs have to drape over it rather
  than sit at a height. `scene/worlduv.ts`'s trick of deriving UVs from instance
  scale still applies; the geometry under it does not.
- **`groundAt` is in the hot loop.** The sim asks per step, and so does every
  traffic car and every police unit. A bilinear read of a flat array is the
  cheapest thing that can answer, which is rule 5's real justification.
- **Generation time was a fixable cost, and it has been fixed** (#262). Kestrel
  Bay took 1.44 s to generate, which is the number a decision about a
  four-times-bigger map has to reckon with. Profiled rather than guessed at:
  `segmentToRect` was 34% of it and `distanceToSegment` another 13%, both from
  the block sweeps in `generate.ts` - `onBoulevard`, `underRamp`, `deckOver` -
  which scanned every road of a class for every block. `buildGraph`, the obvious
  suspect and the one blamed twice here before anybody measured, was 4%. Filing
  those roads in a `SegmentIndex` took generation to **485 ms with the
  serialised city byte-identical**, and the test suite from 22.7 s to 7.7 s.
  Nothing dominates the profile now, so the extent in rule 3 is a decision about
  design rather than about cost - which is the only reason it could be taken.
- **Off-road becomes three-dimensional.** #220 let a pursuit cut across open
  ground; with relief, "open ground" has a gradient, and a police unit driving
  up a bank is a thing that has to either work or be prevented.
- **New gates.** A grade probe joins `ramps` and `pace`. `citylap` becomes the
  instrument that says whether hills made the city slower in a way that matters.
- **Tests that assume flatness change.** Every test asserting `y === 0` for a
  surface road, and `city.test.ts`'s blocks-and-roads geometry checks, are
  written against a plane.
- **This ADR can be stopped after any numbered rule.** 1-6 leave a better city
  with no terrain in it at all; 7-8 leave a landscape you drive over; 9-11 are
  what make it a landscape you drive *in*. If the work has to stop, it should
  stop on a numbered boundary and the ADR should be amended to say where.
