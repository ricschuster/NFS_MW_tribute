# 9. Kestrel Bay is an authored map on generated land

- Status: accepted
- Date: 2026-09-08
- Supersedes: rule 3 of [0008](0008-a-landmass-and-routed-roads.md); the district
  half of rule 4 of [0005](0005-the-shape-of-kestrel-bay.md)
- Builds on: [0005](0005-the-shape-of-kestrel-bay.md), [0007](0007-relief.md),
  [0008](0008-a-landmass-and-routed-roads.md)

## Context

Every district in Kestrel Bay has been placed by rule since the city was first
generated. `assignDistricts` picks three seeded anchors - downtown pulled toward
the water, a harbour along the shore, an industrial edge in a far corner - and
gives every superblock the nearest one inside a radius. `CITY_DOWNTOWN_RADIUS`
is 850 m, the waterfront's is 1350 m, industrial's 1250 m.

That is a reasonable way to place districts and it has produced, over four
months, a map its author does not want. #269 records the verdict in his own
words: *"I am not very connected to what we have done so far, so happy to
rebuild as much as needed"*, and, of the hand-drawn sketch against the generated
map, *"I very much prefer sketch.png"*.

So the map was **drawn**. #272 is the result: nine district polygons and four
named places, traced by hand in an editor over the generated relief at seed
`0x4b657374`, then audited against the ground underneath (#271). Downtown is
1.5 km² and 75% land at 3 m above the sea. The hill park is 0.84 km², 87 m mean,
122 m peak, and 41% of it too steep for any street to climb. The airfield's
runway is 2300 m at 68 degrees because that is the longest line that fits on
that island.

The question this ADR answers is what the generator does with that drawing.

### Three ways to consume a drawing, and why two of them lose

**Derive the districts from the ground and measure against the plan.** This is
what `assignDistricts` already does. Anchors and radii over a height field
cannot produce the outline of the plan's downtown, or midtown 3 curling round
the northern bay, because those are shapes a person chose and a distance field
has no way to want. Choosing this is choosing more of the thing that produced
the map #269 is about, and it comes with an acceptance number that would sit at
some percentage forever with nobody able to say whether it was good.

**Pin the places, derive the districts.** The places need exact ground - the
runway fits one island in one orientation - so this looks like a way to keep
what matters and stay procedural. It is not: a pinned place is world
coordinates against this landmass exactly as a pinned district is. It takes the
coupling of authoring and the character loss of deriving, and saves only the
retracing of the districts, which is the half that was drawn in an afternoon.

**Author it.** The plan is data, like `RIVALS` or `DISTRICTS`. This is the one
that produces the map that was asked for.

### What authoring actually commits to

The polygons are metres against the water field `makeWater` produces. This
branch moved that field in all four of its commits, so the honest precondition
is that **the landmass is finished**. It is, as of this ADR, and `npm run plan`
exists to catch a move: it re-measures every polygon against the ground the
generator makes today and reproduces #271's audit, so "the plan still fits" is a
number rather than a memory.

## Decision

1. **The plan in #272 is the map.** District polygons and named places are city
   *data*, in `city/plan.ts`, in world metres. `assignDistricts` is deleted.

2. **The land is authored too, and therefore fixed.** `makeWater` draws from its
   own constant stream rather than from the city's seed, the way `makeTerrain`
   already does (ADR-0007). Kestrel Bay is one place: one coastline, five bodies
   of land, one relief. A plan pinned in world coordinates is only coherent if
   the coordinates mean the same thing every time, and a seeded landmass under an
   authored plan is two answers to where the coast is.

   **`CITY_SEED` still varies the city**, which is the point of keeping it: the
   streets inside a district, which blocks are skipped, what stands on them,
   where the collectibles and the parked cars are, and which junctions the routes
   run through. It no longer varies where downtown is. The four seeds in
   `city.test.ts` keep their job, which was always to prove the street generator
   copes rather than to prove the coastline does.

3. **`CITY_BUILT_UP` is deleted; the city is where the plan says it is.** The
   grid was bounded to 0.62 of the main lobe's radius around `water.town`
   (ADR-0008 rule 3, which this supersedes). That is why four of the five bodies
   of land have no city on them. A district polygon is the bound now, per body,
   and the built-up area roughly doubles - about 11.3 km² against today's 5.

4. **`water.town` keeps one job: the centre of the terrain's basin.** It had
   four. The other three - bounding the grid, naming the home body of land, and
   starting the roads that reach the other shores - are the plan's now, and the
   plan does them better. It is not "where the city is" and never should have
   been called that: measured, it sits 2566 m from the middle of the plan's
   downtown, inside the *industrial* polygon, and the name is what let it drift
   there unnoticed.

   The basin is deliberately **not** re-centred on downtown. The relief is part
   of the land this plan was traced on, and moving the basin 2.5 km re-cuts every
   height on the main body with the hill park - the best feature on the map -
   inside the blast radius. The audit says the present arrangement works:
   downtown comes out 3 m mean and 6% too steep, industrial 4 m and 1%, because
   the basin is wide enough to cover both. Moving it later is a deliberate
   re-bake with a re-audit, not a tidy-up.

5. **A district says how streets are laid; a place is what they go to** (#271).
   `park` joins the four `DistrictKind`s, because the plan has parkland in it
   that is chosen rather than left over - which is a different thing from #185's
   parks, and both should exist. The four places (docks, airfield, quarry,
   lookout) get their own geometry and a road in, and are not districts.

6. **Island E is the docks.** The plan gave the 0.7 km² south-east island to
   both a coastal park and the port; the audit found it, because a polygon drawn
   in one pass over one picture can cover ground another polygon already has.
   The port wins: it needs a home now that the waterfront is affluent, and one
   bridge to a small island is the best pursuit geography the map can offer -
   somewhere you can be *trapped* is worth more than somewhere you drive through.
   The first coastal park is dropped.

## Consequences

- **The generator stops being a pure function of a seed for layout, and stays
  one for everything else.** It is still pure, still has no `Math.random`, and
  still builds headlessly; what changed is that some of its input is a constant
  rather than a roll. CLAUDE.md's "`CITY_SEED` is content: changing it publishes
  a different city" is now "a different city on the same land".

- **The map can be edited.** This is the underrated half. A district that reads
  wrong is a polygon somebody moves, in an editor, in a minute - rather than a
  constant somebody tunes, a city somebody regenerates, and a picture somebody
  judges. Every other thing on the M7 list gets cheaper for the same reason.

- **`npm run plan` becomes a guard rather than a probe.** It already reproduces
  the audit; once the plan is loaded from `city/plan.ts` it is checking the
  shipped data against the shipped land, and it should fail rather than report
  if a polygon leaves the land.

- **Generation cost stops being deferrable.** It is 10.9 s for a city that
  occupies a fifth of the map, and this roughly doubles the built-up area. The
  test suite's default timeout is 5 s and a large part of the 60 failures on this
  branch are already timeouts rather than assertions.

- **Two seeded features have to be re-pointed rather than deleted**: the roads
  to the other shores, which bundle into one corridor today because they share
  `water.town` as a start, and the interstate, which is still a rectangle inset
  from the land (ADR-0008 rule 6 wants a ring round the city and a beltway round
  downtown - #265, #261).

- **What this does not decide**: whether the plan's polygons are the final
  shape. They are data now, so that question is answered by looking at the map
  and moving one, which is the whole point.
