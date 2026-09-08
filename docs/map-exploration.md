# Rebuilding the map: a running log

What is being tried, what happened, and what it cost. Kept because this is
exploration rather than delivery: the decisions that survive get an ADR, and
this is where the ones that did not survive are written down so they are not
tried twice by accident.

Read [ADR-0009](decisions/0009-kestrel-bay-is-an-authored-map.md) first for the
decision the whole rebuild rests on, and [#269](https://github.com/ricschuster/NFS_MW_tribute/issues/269)
for the standard it is trying to meet, in the words of the person who wants it.

## Where it stands

The map is **stripped back to the routed roads**. `CITY_STREET_GRID` and
`CITY_FREEWAY` are both off, so what remains is: the routed boulevards, the
quay along the water, the embankment, one road to each body of land, the three
places and their own geometry, and the road from Kestrel Head to Halloway
Quarry. 98 editable roads, 78 km, eight water crossings.

That is a deliberately small thing. It is also the first version of this map
where every road on it is a road somebody would draw.

## The order things were tried in

### 1. The plan is the map (worked, kept)

Districts had been placed by three seeded anchors and three radii since the city
was first generated. Four months of that produced a map its author did not want.
So the map was drawn by hand over the generated relief (#271, #272) and the
generator now reads it as data.

What made this work is that a plan is **low volume and high judgement**: nine
polygons and four places. Hand-drawing is what judgement looks like, and there
were few enough of them to draw.

Consequences that were not obvious going in:

- The landmass had to be authored too. A polygon in world metres over a
  coastline that moves with the seed is two answers to where the coast is.
  `CITY_LAND_STREAM` freezes both the water and the terrain.
- `CITY_BUILT_UP` - a radius round `water.town` - had to go. It was why four of
  the five bodies of land had no city on them.
- `water.town` turned out to be doing four jobs under a name that described one
  of them, and had drifted 2566 m from the middle of the plan's downtown without
  anything noticing.

### 2. The places (worked, kept)

Docks, airfield and quarry are generated: the ground is shaped first, then the
place's own roads go in as ordinary spans. The order is the design - a runway is
flat or it is not a runway. This is the terrain displacement ADR-0007 said the
height field was baked rather than computed *for*.

### 3. Routing the arterials (worked, reverted, will be tried again)

The ruled arterial grid was the most conspicuous thing on the map. Routing them
over the terrain works - they come out bending round the hills, and the picture
is better.

It was reverted for one real reason and one wrong one.

**The real reason: blocks cannot follow a curved arterial.** They are measured
off the superblock's rectangle and inset by half an arterial's width, which is
exact while the road runs along that edge and meaningless once it wanders. That
is #268's job and not a parameter on the arterial loop.

**The wrong one:** the map also lost five of its seven water crossings and that
was attributed to the routing. It was not. See below.

Also written and not kept: `ARTERIAL_WANDER`, waypoints that push a routed
arterial off its line so it bends over flat ground too - the router returns the
cheapest path, and over flat ground the cheapest path is straight, so routing
alone does not remove a straight road.

### 4. Stripping the grid and the freeway (current)

Rather than keep a layer that does not work, the map is being rebuilt from the
layer that does. Both are switches rather than deletions: `fillSuperblock` is
the only thing that knows how a district becomes blocks, and `interstate.ts` is
the only thing that knows how a deck, its ramps, its pillars and its tunnel are
built. All of that is wanted. A ruled grid and a rectangle are not.

## The bridge count, and four wrong explanations for it

Worth its own section, because it cost most of a session and every explanation
offered along the way was wrong.

The number of water crossings kept swinging between two and eight. In order,
the explanations offered and discarded:

1. **The routed arterials avoid water.** They do, and it is not the cause. An
   arterial run is bounded to the built-up area anyway, so it rarely spanned a
   channel even when ruled.
2. **The bridge chooser was reseeded.** Making required crossings the seed of
   the furthest-first spread instead of the shortest gap did change the count -
   but reverting it changed nothing.
3. **Two cosmetic jitter constants.** Nudging downtown's jitter 0.08 -> 0.16 and
   industrial's 0.18 -> 0.22 took the map from six crossings to two. This one is
   *true* and still not the cause: every seeded draw after a changed constant
   moves, so the boulevards, the link roads and the freeway all reshuffle. The
   crossings did not get worse; a different city got generated.
4. **The actual mechanism**, found only once the grid was stripped and two named
   places came out with no roads at all: `clip` discards a dry run shorter than
   `CITY_MIN_STREET`. That is right for a stub and wrong for the only road onto
   a body of land, where the run on the far bank is whatever is left between the
   water and the place the road was going to - often a few metres, because the
   place's own roads take over from there. Discard it and the bridge lands on
   nothing, the island stays its own component, and `prune` deletes the island
   and the bridge together. A `required` span now keeps every run it has.

Two lessons. **The street grid was propping up the bridges** - it put real road
on every bank, which hid the bug for as long as it existed. And a number that
swings by a factor of four on an unrelated constant is not a designed number; it
is whatever the draw gave.

## Hand-edited roads, and what checking them taught

The first round of editing: 10 roads deleted, 8 drawn, 56.5 -> 69.6 km. Read
back out of the artifact's store with `roaddiff` and checked against the ground
with `roadcheck`, then corrected with `roadfix`, which applies named operations
(`--join`, `--reland`, `--reroute`, `--trim`, `--deadend`) rather than
hand-edited JSON, so a correction is repeatable and the ids stay stable.

**Two of the three defects that round were in the probe, not the map**, which is
this repo's oldest lesson arriving again.

The first: a road with one loose end was reported as "joins nothing and would be
pruned". `prune` drops disconnected *components*, and a road that touches the
network anywhere along its length is connected. A loose end is a dead end, which
is a different thing and sometimes deliberate - a pier is a dead end on purpose.
Three good roads were about to be called broken.

The second was worse and nearly became an instruction. The check reported 44% on
a hand-drawn crossing and said **ten** generated roads broke the 13% grade cap,
and the conclusion drawn from that was that the cap was an aspiration nothing
met and cut and fill (#252) had to come before any more drawing. Measuring the
banks directly said the opposite: every dry point within 30 m of water, stepping
60 m inland, over the whole map - **100% under 13%**, channels and coast alike.

The height field puts the seabed 6 m below the water and `groundAt` interpolates
bilinearly, so within one `TERRAIN_CELL` of any shoreline the ground runs down to
-6 m. Every one of those readings was a road touching the waterline and the
check reading the bed of the channel as a hill.

What survived the correction was real and was ours: the road to Halloway Quarry
was routed to `place.at`, which for a quarry is the *floor of the pit*, so it
drove down the workings at 110%. A road to a place stops where the place's own
roads begin - `placeApproach` sends it to the rim now, and the haul road does
the descending, which is what it is for.

Still open from that: the haul road itself reads at 110%, because it crosses the
11 m bench edges `QUARRY_BENCH` cuts. A benched wall is a flight of small cliffs
and a road over one is a cliff. That wants either a road that follows the bench
surfaces or the cut and fill of #252.

## The standing question: procedural, authored, or both

The thing this rebuild keeps running into is not "procedural versus authored".
It is **terrain-blind versus terrain-aware**.

Everything that reads as drawn on a map was written when the ground was flat and
assumes it still is: an axis-aligned arterial grid, blocks as rectangles, a
freeway inset from the map bounds by a fraction. Every one of those is a
generator that never asks what the ground is doing. The router is just as
procedural and reads as honest, because a routed road bends where the hill is.

So the working rule is about **volume and judgement**, not about technique:

- **Author what a person would notice individually.** Where downtown is. Which
  island the port is on. Where the coast road runs. There are tens of these,
  and each one is a judgement somebody has to make.
- **Generate what is only noticed in aggregate.** The fortieth cul-de-sac in a
  suburb. Which block has a gap in it. There are thousands of these, and nobody
  will ever look at one.
- **Route, rather than lay, anything in between.** A road between two authored
  points, over real ground, is the shape neither a person nor a grid produces on
  its own.

"By section or defined area" follows from that and is probably right: the plan
already divides the map into areas, and an area is the natural unit to say *how*
its streets are made - a grid here, something organic there, nothing at all in
the park. That makes each generator small, bounded and judgeable on its own,
which is the opposite of the situation where one constant reshuffles the whole
city.

The road editor exists to test the first bullet at road scale. 98 roads is
enough to edit by hand and too many to have drawn from nothing, which is exactly
the range where "generate a draft, then edit it" beats either extreme.
