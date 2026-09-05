# 5. The shape of Kestrel Bay

- Status: accepted
- Date: 2026-09-05
- Builds on: [0004](0004-webgl-free-roam-city.md)

## Context

ADR-0004 decided that Kestrel Bay is generated from a seed rather than
modelled. Issue #83 delivered that: a seeded generator producing a connected
street graph with districts, blocks and junctions, 3.0 x 2.4 km, 119 km of
road, all of it tested and none of it drawn by hand.

Looking at it from above (`npm run city`) it is plainly a grid. Not a bad grid
- the arterials wander, block sizes vary by district, streets drop out - but a
grid, and a rectangle of one. Every district is a rectangle, the coast is a
straight line along one edge, and no part of the map is anywhere in particular.
A city like that is somewhere to drive, not somewhere to explore, and free roam
is the whole reason for ADR-0004.

The genre solved this a long time ago, and the moves are common to all of it -
Burnout Paradise, Midnight Club, the Forza Horizon and Crew games. They are
structural and they are about how a city plays, not how it looks:

- **Water that cuts into the map, crossed by a few bridges.** Bridges are
  chokepoints, and chokepoints are what make a pursuit a decision rather than a
  test of top speed. This is the single most load-bearing one.
- **Districts with different street geometry**, not just different block sizes:
  a tight downtown grid, curving residential streets that dead-end, a sparse
  industrial edge with long straights.
- **A high-speed loop** around or through the city, so there is always a fast
  way and a clever way to get somewhere.
- **Landmarks** you navigate by, so you learn the city by sight instead of by
  minimap.
- **Relief**: a hill or canyon run, so not every road is flat.

None of this is any one game's map. What follows is a decision about the
*structure* of our city and it is generated, as ADR-0004 requires: no imported
layout, no traced street plan, nothing licensed. Kestrel Bay stays original
work in the sense that matters, which is that it comes out of a seed.

### On size

The target is a city comparable to a 2010s open-world racer, which puts it in
the region of 20 km². We do not have a verified published figure for any
specific game's map to calibrate against, so the number is derived from what
the game needs instead: **a pursuit should be able to cross the map in two to
four minutes.** At the pace the car actually holds in traffic, that is a city
about **5 x 4 km**, and it happens to land in the same region as the genre.
That is a requirement `npm run feel` can check once free roam exists, which a
remembered square-kilometre figure would not be.

Road *density* falls as the map grows rather than staying fixed. 119 km of road
in 7.2 km² scaled up unchanged would be well over 300 km, which is more content
than can be made to matter. A bigger city gets more sprawl, not more grid.

## Decision

Kestrel Bay is generated to these rules. They are listed in the order they are
worth building, which is roughly the order of how much each changes the driving.

1. **Water first, land second.** A bay along the north edge with an irregular
   shoreline, and a river running inland from it that severs the city. The
   street network is generated and then cut against the water, rather than the
   water being painted on afterwards.

2. **Bridges are deliberate and few.** Arterials that meet water dead-end at
   the bank; only a chosen handful cross. A city half of whose roads bridge the
   river has no chokepoints. The number of crossings is a tuning constant and
   is expected to be small.

3. **The city must be drivable, and that is enforced rather than hoped for.**
   Cutting a network against water can strand a district. Generation therefore
   ends with a connectivity pass that promotes further crossings to bridges
   until the whole graph is reachable, and the invariant is a test.

4. **Districts get geometry, not just spacing.** Downtown a tight regular grid;
   residential curving streets and cul-de-sacs; industrial long straights and
   large lots; waterfront blocks facing the water. Any district touching water
   reads as waterfront, riverside included, not only the coast.

5. **A high-speed loop.** The elevated interstate of #85 is routed as a circuit
   with a small number of on- and off-ramps, so committing to it is a choice.

6. **Landmarks are generated, placed and named** at a handful of junctions, so
   the map has places in it. Names are ours.

7. **Relief last.** The ground plane gets height, which every earlier rule has
   to survive. Deliberately last: it is the rule most likely to break the
   others, and the least missed if it never happens.

The generator stays a pure function of its seed, headless, outside the
renderer, and the pinned `CITY_SEED` stays content. Rules 1-3 are implemented
now; 4-7 are what the rest of M4 builds, and are recorded here so they are
designed together rather than discovered one at a time.

## Consequences

- The city stops being a rectangle of streets, and roads stop being purely
  axis-aligned once rule 4 lands. Collision (#86) has to handle a road that is
  not axis-aligned, so it cannot be written as a grid lookup. This is the
  cost of the decision and it is accepted here rather than found in #86.
- Generation gains a repair pass and stops being a single forward sweep. It is
  still pure and still deterministic; it just may run the graph build more than
  once.
- The map roughly triples in area. Block and road counts grow with it, so #84
  cannot draw the city as one mesh per building and needs instancing, which it
  already planned for.
- `City` gains water bodies as outlines and roads gain a `bridge` flag. Both
  are plain data, so the renderer, collision and the map tool all read the same
  city.
- Tests that compare every block against every road become quadratic in a
  bigger city. They stay, and get bucketed by superblock if they get slow.
- The seed changes what the city *is*, so any event, landmark or Street Find
  position pinned to coordinates has to come after the layout settles. Nothing
  should be pinned to a coordinate until rules 4-7 are in.
