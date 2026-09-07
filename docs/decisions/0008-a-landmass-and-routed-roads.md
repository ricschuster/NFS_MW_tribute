# 8. A landmass, and roads that are routed rather than laid

- Status: accepted
- Date: 2026-09-07
- Supersedes: rule 2 of [0007](0007-relief.md); amends its rules 4 and 10
- Builds on: [0005](0005-the-shape-of-kestrel-bay.md), [0007](0007-relief.md)

## Context

ADR-0007 was accepted and then sketched. The sketch is what this ADR is about:
three of its eleven rules turned out to be wrong or short, and they were only
wrong once there was a picture to look at.

The sketch was built after the structure of the reference city, which is
described well enough to build from without touching it: a downtown in the
south on the waterfront; further districts across water, each reached by a
landmark bridge; an industrial quarter with a power station and a quarry full of
tunnels; a large park; a **beltway** boulevard looping the downtown *and* an
interstate looping the whole city with eleven exits; an abandoned airfield out
on the interstate's northern arc; hills behind. Its stated influences are Boston
and Pittsburgh.

Three findings.

**The land is not a rectangle with water taken out of it.** ADR-0007 rule 2 said
the water field generalises so that it "may eat any edge", which gives an
irregular island. An irregular island is not what the reference map is. It is
several bodies of land facing each other across channels, joined by bridges -
and that is *why* its bridges are landmarks. A coastline, however wiggly, cannot
produce that: a district on the far side of a channel is a different thing from
a headland.

**Roads laid on a grid ignore the ground they are on.** The first sketch drew
its roads as arcs and circles and it read exactly as that: lines on a map. The
generator does the same thing today - `fillSuperblock` lays a grid over a cell
and a boulevard is a bowed chain of segments - and it has never mattered because
the ground was flat. With relief it matters enormously, and no amount of
bowing or wobbling fixes it, because the shape a road wants comes from the
terrain and not from a random number.

**Sixty metres of relief is too little.** Measured against the influence rather
than guessed at: in Pittsburgh the Duquesne Incline climbs the Mount Washington
bluff **122 m at thirty degrees**, over a downtown that sits on the river. Thirty
degrees is 58%, which is why it is a funicular and not a street - and what the
city does instead is drive *through* the hill, in the Liberty and Fort Pitt
tunnels. A city shaped after that one wants about twice the relief ADR-0007
asked for, and it wants tunnels as part of how the network works rather than as
scenery.

## Decision

1. **The land is lobes joined by channels.** Land is a field summed from a
   handful of overlapping lobes and cut at a threshold, with channels subtracted
   across the necks between them. That gives: a coastline irregular in every
   direction with no straight edges anywhere; districts that face each other
   across water; and necks narrow enough that a bridge is a short structure in
   an obvious place. The water field keeps its river, and the sea stops being
   "north of a line".

   This **supersedes ADR-0007 rule 2**. Everything downstream of the water field
   is unaffected, because everything downstream already copes with arbitrary
   water: the clip, the bridge selection, the connectivity repair, the embankment
   and the parkland all ask `isWater` and none of them cares what shape the
   answer is.

2. **Roads are routed over the terrain, not laid on it.** A road is a least-cost
   path over the height field. The cost of a step is its length times a penalty
   that is the **square** of the gradient, plus a price per metre of water. Each
   class of road is a profile: how steep it tolerates, what water costs it, and
   how close to the shore it is willing to run.

   Squaring the gradient is the whole trick - it is what makes a road contour
   round a hill rather than climb it, and switchback where it has no choice.
   Three things the sketch found, all of which the generator will find too:

   - **Price only the gradient and every road pins itself to the beach.** The
     shore is the flattest ground on the map, because the land ramps up from it.
     A road class needs a shyness of the waterline or the freeway becomes a
     coast road.
   - **A waypoint left in the water makes the router bridge out to sea to reach
     it.** Snap destinations to land. The road was not wrong; the target was.
   - **Bridges choose themselves.** Price water per metre and the path crosses
     at the narrows on its own, which is a better answer than
     `chooseBridges` picking a spot against a spacing constant. #247's
     furthest-first selection stays for the surface network; a routed road brings
     its own crossing.

   The street grid over downtown stays a grid - that is what a downtown is - but
   it is laid only where the ground is flat enough to have laid one out.

3. **Relief goes to 120 m**, amending ADR-0007 rule 4. Measured off the
   influence, as above. The grade caps do not move: 6% for arterials and
   boulevards, 10% for streets. Taller hills and the same caps mean more of the
   map is too steep for a street, which is the point - that is where the tunnels
   and the cuttings come from.

4. **Tunnels are structural**, amending ADR-0007 rule 10. At 60 m they were
   somewhere a street could go under a hill. At 120 m with a 10% cap they are
   how the network crosses high ground at all, the way a real city of this shape
   drives through its bluff rather than over it.

5. **The land floor drops to 45%.** ADR-0007 put it at "about 60%, roughly
   12 km²" so that an irregular coast could not quietly eat the city. Severing a
   landmass costs far more water than an irregular coastline does - the sketch
   comes out at 49% - and the alternative is narrow channels, which are short
   bridges, which is the thing rule 1 exists to avoid. The floor is now what
   stops the map becoming an archipelago, not what preserves an area target.

6. **Two rings, not one.** A beltway *boulevard* around downtown at street
   level, and the interstate around the whole city. Today's loop is a rectangle
   inset from the map bounds, which is the second one built as a ring road round
   the middle. The inner one is where a pursuit is decided and it is a
   boulevard, which the generator already makes.

## Consequences

- **ADR-0007's issues change shape.** #249 stops being "let the water eat any
  edge" and becomes the lobed landmass; #251 carries the 120 m. #260 (roads that
  are not city) and #261 (the freeway leaves the city) both become applications
  of rule 2 rather than bespoke generators, which makes them smaller and makes
  them agree with each other. Two new ones: #265 for the beltway, #266 for
  content density.
- **The router is in the generator, not the sim.** It runs once per road at
  generation time. Kestrel Bay is 485 ms to build (#262); a few dozen searches
  over a 50 m grid is the same order, and it is the reason #262 was worth doing
  first.
- **A road can now fail to exist.** If no path under the grade cap reaches a
  place, there is no road to it. That is a new way for the city to come out
  wrong and it needs the same treatment ADR-0005 rule 3 gives connectivity:
  proved, not hoped for.
- **Content density has to follow the district, not the road.** Observed on a
  map of the reference city's collectibles and events: they cluster hard in the
  built-up part, and the periphery carries a thin line of them along the
  highway. `collectibles.ts` places 90 billboards and 26 cameras against the
  whole road graph at a minimum spacing, which on a map four times bigger
  spreads them evenly over everything.
- **Nothing here is imported.** The reference is read, measured and described -
  a wiki page, a published map of major roads, a timed drive, the elevation of a
  real hill in a real city. No geometry, no heightmap and no asset from any
  other work enters this repo, which is ADR-0004's rule and the reason Kestrel
  Bay comes out of a seed.
