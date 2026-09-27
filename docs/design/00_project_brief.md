# Project brief: Crosstown

## The pitch

An open-world arcade street racer in the browser. You drive around Kestrel Bay
with nothing telling you where to go, earn Rep from everything you do, and the
police get progressively less reasonable about it. A ladder of ten rivals sits
over the top: beat one in a race, then run them down and take their car.

## Form

A real 3D scene in three.js, procedurally generated from a seed, deployed as
static files with no backend and no asset pipeline. It started as a pseudo-3D
projected-segment racer on a single closed track; that was the right shape for
a solo project until the design turned out to be load-bearing on free roam, and
it was retired once the city could do everything it could
([ADR-0004](../decisions/0004-webgl-free-roam-city.md),
[ADR-0006](../decisions/0006-the-city-is-the-game.md)).

## Why this form

The whole design assumes somewhere you can go anywhere in. A menu you use while
driving without pausing, cars found parked in the world rather than bought,
collectibles scattered across a city, an event you start by driving to it, and
a pursuit you escape by knowing the map - none of those mean anything on one
road. Generating the city rather than authoring it is what keeps that
buildable by one person: the map is a seed, so there is nothing to model,
nothing to license and nothing to download.

## What it is made of

- **A free-roam city.** About 10 x 8 km of land with relief
  ([ADR-0007](../decisions/0007-relief.md)): an authored plan of districts and
  places ([ADR-0009](../decisions/0009-kestrel-bay-is-an-authored-map.md)),
  roads routed over the terrain, an interstate loop that leaves the city.
  Bridges are few on purpose, because they are the chokepoints a pursuit turns
  on.
- **A pursuit worth escaping.** Six heat levels that escalate *within* a
  chase, not across a career: roadblocks, Enforcers that come at you head on,
  and spike strips. (A helicopter and cover were built and cut, #183.) Plus
  the one thing the city does back - gates and pallet stacks that come down on
  whoever is behind you.
- **Rep as one currency.** Everything pays, everything pays more while you are
  being chased, and the ladder is a price rather than a queue: a rival takes
  the call at a Rep total, so what moves you up is everything you do.
- **Cars found, not bought.** Eighteen of them, each a set of multipliers on a
  reference car. Seven are parked around the city; ten are taken off the
  rivals who were driving them.

## Aesthetic north star

Dusk into night, warm horizon glow, wet-looking tarmac, readable at speed.
Everything shipped is original, generated, or CC0.

## Explicit non-goals

- Not networked, not commercial, no backend.
- No third-party names, places, cars or assets. The city is generated from a
  seed, not ripped, and if the answer to "make it like game X" is a specific
  map, the answer is no; if it is *structure* - waterfront, ring road, dense
  core, bridges as chokepoints - that is fair game.
- Not the online social layer, and not the mid-2000s single-track template it
  started as: the old city, a ladder of fifteen, bounty and impound strikes
  belong to a different game. (Milestones were on this list until 2026-09-27:
  the 2012 game has them too, as one-off bonuses popped up while driving, and
  those are wanted. The 2005 game's milestone career is still not.)

## Open questions

- Night, weather and wet roads are the biggest art change left, and it is a
  lighting problem rather than a geometry one.
- Buildings are still boxes with textures on them. A modular kit behind the
  same provider seam is the next step up, and the seam is what makes it a swap
  rather than a rewrite.
- Whether the desktop shell (#99) is worth its dependency at all.
