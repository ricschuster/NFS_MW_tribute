# 10. Sketch shape before generating it, and sequence by what breaks backward

- Status: accepted
- Date: 2026-09-13
- Builds on: [0005](0005-the-shape-of-kestrel-bay.md),
  [0008](0008-a-landmass-and-routed-roads.md),
  [0009](0009-kestrel-bay-is-an-authored-map.md)

## Context

Three subsystems have independently gone through the same arc: built
procedurally, lived with, and then abandoned or frozen once it did not produce
the wanted shape.

- **Roads** started axis-aligned with an `axis` field. Boulevards needed
  curves, and splicing a curved road into a finished graph was tried first -
  it meant reimplementing water-clipping, junction-splitting and connectivity
  repair, badly (issue #115). The fix was to generalise the road type itself.
- **Land** started as a coastline ("north of a line"). Relief made that shape
  wrong, and ADR-0008 replaced it with lobes joined by channels - which in
  turn forced bridge selection (#247), parks (#185) and the embankment (#241)
  to be rebuilt against the new shape.
- **Districts** were three seeded anchors and three radii, tuned for four
  months. The result was a map its own author did not want (#269: "I am not
  very connected to what we have done so far"). ADR-0009 replaced it with a
  hand-drawn plan read as data.

Each time, the fix that stuck was found cheaply before it was built expensively:
`npm run sketch` - a disposable tool that touches nothing in `src/` - is where
ADR-0008's rules were found, and the district plan (#272) was drawn by hand in
an editor before `city/plan.ts` existed. Both are instances of the same move:
settle a shape question by looking at a picture of it, before writing the
generator code that assumes an answer.

The sequencing that produced the expensive version of each of these was ADR-0005
itself, which ordered its seven rules "roughly the order of how much each
changes the driving" and put relief last - while noting in the same sentence
that relief was "the rule most likely to break the others." That prediction
was correct: relief did not just add height on top of the finished map, it
invalidated the water shape (rule 1) and the "lay a grid" road algorithm,
which is what ADR-0008 spent itself undoing. Ordering by player-facing impact
is reasonable for a roadmap; it is backwards for engineering risk, because the
thing most likely to break earlier decisions is exactly the thing that should
be resolved before those decisions are built on top of.

## Decision

Two rules, going forward, for work on city shape (terrain, curvature, land,
district layout, and anything else geometric that later layers get built on):

1. **Sketch before generating.** Before wiring a shape question into
   `city/generate.ts` or any module downstream of it, answer the question in
   `npm run sketch` (or by hand-drawing over `npm run city -- --terrain`, the
   way #272 did) first. If the honest answer is "low volume, high judgement" -
   a handful of polygons or waypoints a person can place by eye - author it as
   data rather than building a procedural placer for it, per ADR-0009's test.
2. **Sequence subsystems by what they invalidate backward, not by what they
   are worth to the player.** A change that only adds detail (landmarks,
   collectible placement) can come whenever it is most valuable. A change that
   constrains the *shape* other systems assume (relief, curvature, land
   topology) goes as early as it can, because leaving it for last means every
   system built before it is a candidate for rework once it lands.

This does not mean every generator change needs a detour through `sketch` -
CLAUDE.md already says small, local, reversible choices don't need this
weight. It applies to the class of change that has, three times now, been
lived with for weeks or months before being found wrong.

## Consequences

- `npm run sketch` moves from "the tool that happened to be used" to the
  expected first step for shape and terrain questions. It stays out of `src/`
  and disposable, which is what makes it cheap enough to use before every such
  question rather than after one goes wrong.
- The open arterial-routing question (#268: blocks cannot follow a curved
  arterial) and the still-open beltway and landmark-placement work
  (ADR-0008's consequences) are the first candidates this applies to, while
  `CITY_STREET_GRID` and `CITY_FREEWAY` are already off and there is nothing
  running yet to be broken by trying it in `sketch` first.
- This is a process rule, not a reversal of ADR-0005 or ADR-0008: their
  decisions stand. It is a statement of what should have determined their
  *order*, so the next subsystem that constrains shape does not repeat the
  same four-months-then-rebuild cost.
