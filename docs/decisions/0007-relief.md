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
   level" and it means "on the surface street network". `interstate.ts` picks
   its ramp targets with it, and so do `ambushes.ts`, `breakables.ts` and
   `repairs.ts`. A street at 40 m on a hill makes all four wrong.
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

2. **The land is an island, not a slab.** The water field generalises from "a
   bay along the north edge plus one river" to something that may eat any edge:
   headlands, inlets, a second channel, a detached island. This is a change to
   `makeWater` and to the two places that assume the bay is north
   (`embankment.ts`'s `bankAt` and `midChannel`). Everything downstream already
   copes with arbitrary water, because everything downstream goes through the
   clip. The straight cliff edge stops existing: the land meets the sea at a
   shore on all four sides.

3. **The height field is baked, not a formula.** `groundAt(x, z)` reads a
   heightmap generated with the city - a regular grid at roughly 10 m,
   bilinearly sampled. A formula in the style of `water.ts` was the obvious
   choice and is the wrong one: cut and fill *displaces* terrain, and a pure
   formula cannot be displaced without becoming a formula plus a road lookup,
   which is a grid query in the hot loop. 500 x 400 floats is under a megabyte,
   O(1) to read, trivial to write into, and still a pure function of the seed.
   It is city *data*, like building footprints, and both the sim and the
   renderer read the same array.

4. **`y` stops carrying two meanings.** `CityNode` gains an explicit level -
   surface, elevated, tunnel - and the four modules that test `y === 0` ask for
   that instead. This lands *before* any terrain exists, on its own, with no
   visible change: it is a prerequisite and it makes those modules honest either
   way.

5. **Roads are cut and filled.** A road's height is the terrain smoothed along
   its length, subject to a grade cap, and the terrain is then displaced to meet
   the road. Junctions are levelled to one height so that turning is not a step.
   The caps: arterials and boulevards no steeper than 6%, streets no steeper
   than 10%. Enforced by a probe in the manner of `npm run ramps` - a gate, not
   an instrument - because a street the car cannot climb is a street that does
   not exist.

6. **Blocks are pads.** Each block is flattened to a single height and the drop
   at its edge is drawn as a retaining wall or a bank. Buildings stand on the
   pad, so a footprint stays flat and instancing survives untouched. A block
   whose corners differ by more than a storey is dropped and becomes parkland,
   the way #243 drops a building with no headroom under the deck.

7. **Slope changes the drive.** This is the point of doing it at all: a climb
   costs speed, a descent gives it back, and a crest unweights the car. Gravity
   resolves along the direction of travel in `CityWorld.drive()`, alongside the
   engine and drag terms. This is a change to the model tuned in #14, #46 and
   #82 and it is accepted knowingly: the alternative, terrain as scenery the car
   does not feel, is a hill you can see and not a hill you can drive.

8. **Tunnels and cuttings are what a hill is for.** Once there is relief, a
   street that meets one either climbs it, cuts through it, or goes under it,
   and the third is a tunnel. The mechanism already exists - height is a real
   property of the network (#85) and the interstate already tunnels - so this is
   generation, not new architecture. Separately and not dependent on any of the
   above: **a tunnel breaks the pursuit's line of sight.** #183 deleted cover
   along with the helicopter and left a note saying that if cover should mean
   something it needs a new thing to mean it against. A tunnel is that thing,
   and unlike a helicopter it is visible on the map.

The generator stays a pure function of its seed, headless, outside the renderer.
The heightmap is data on `City` like everything else.

### The issues this becomes

Milestone **M7: Relief**. Rules 1-2 are #249, rule 4 is #250, rule 3 is #251,
rule 5 is #252, rule 6 is #253, the renderer is #254, rule 7 is #255, rule 8 is
#256, and the half of rule 8 that depends on none of the rest is #257.

## Consequences

- **The pinned city changes twice**: once when the coast becomes irregular, and
  again when the ground gains height. Every figure in `docs/city-baseline.json`
  moves, the ladder has to be re-derived against the new routes, and every
  screenshot in the repo is of a different place. Both should be clean sweeps
  rather than work interleaved with tuning, and `CITY_SEED` stays content.
- **The feel work is reopened.** Rule 7 puts a new term in the longitudinal
  model. `RIVAL_BASE_SPEED_FRAC`, `RIVAL_DIFF_SPEED_FRAC` and every constant
  derived from a lap time have to be re-derived afterwards, not before.
- **The renderer stops drawing flat quads.** The ground becomes a mesh, and
  carriageways, road markings and pavement slabs have to drape over it rather
  than sit at a height. `scene/worlduv.ts`'s trick of deriving UVs from instance
  scale still applies; the geometry under it does not.
- **`groundAt` is in the hot loop.** The sim asks per step, and so does every
  traffic car and every police unit. A bilinear read of a flat array is the
  cheapest thing that can answer, which is rule 3's real justification.
- **Off-road becomes three-dimensional.** #220 let a pursuit cut across open
  ground; with relief, "open ground" has a gradient, and a police unit driving
  up a bank is a thing that has to either work or be prevented.
- **New gates.** A grade probe joins `ramps` and `pace`. `citylap` becomes the
  instrument that says whether hills made the city slower in a way that matters.
- **Tests that assume flatness change.** Every test asserting `y === 0` for a
  surface road, and `city.test.ts`'s blocks-and-roads geometry checks, are
  written against a plane.
- **This ADR can be stopped after any numbered rule.** 1-4 leave a better city
  with no terrain in it at all; 5-6 leave a landscape you drive over; 7-8 are
  what make it a landscape you drive *in*. If the work has to stop, it should
  stop on a numbered boundary and the ADR should be amended to say where.
