# 11. The reference game's pace, and police in ladder races

- Status: accepted
- Date: 2026-09-27
- Amends: the sizing rationale of [0005](0005-the-shape-of-kestrel-bay.md) and
  [0007](0007-relief.md) rule 3 (the map's size stands)
- Reverses: the police-free rule for races added with circuits (#70)
- From: [design/01](../design/01_pace_traffic_and_the_police.md), questions 1
  and 3; evidence in [the gameplay review](../research/nfs-most-wanted-2012-gameplay.md)

## Context

A 47-minute recording of *Need for Speed: Most Wanted* (2012) was measured
second by second. The project's owner has ruled that the recording is
authoritative for how the game should play. Two of its findings contradict
decisions Crosstown made by measurement rather than by choice.

**Pace.** The reference game's races average 180-200 km/h, about 0.75 of its
cars' top speed, and its downtown is the second-fastest district. Crosstown's
ladder is fitted to what the `citydriver` bot holds in traffic, 0.32 of top,
which puts the field at 88-109 km/h. That figure is partly the bot (#14,
#210), and the rest is traffic (#180) and tight race routes (#204). The car is
not the limit: `LATERAL_GRIP` holds a 30 m corner at 200 km/h.

ADR-0005 sized the map so a pursuit crosses it in two to four minutes, and
ADR-0007 calibrated that against the reference city driven "at a steady 65
mph". Both assume a cruising pace. At the recording's pursuit pace of 180 km/h,
ADR-0007's 16 km end-to-end drive takes 5.3 minutes and the core's 7.3 km
diagonal takes 2.4.

**Cars get faster.** The reference game's early cars top out around 260-270
km/h and its best at about 400. Crosstown's span is similar: 320 km/h for the
starter and 1.22 of that, about 390, for the fastest, before parts.

**Police in races.** `startRace` clears the pursuit and the police do not run
during a race, because *"a race you have to win while being rammed by a
heat-six Enforcer is not a race, it is a pursuit with a lap counter on it"*
(#70). In the recording every Most Wanted race brings a pursuit, and the
police are not rammers: at race pace the chase cannot keep up, so the pressure
is roadblocks on the route, and the pursuit carries on into the rival's
shutdown. No pursuit began in free roam, which confirms #177.

## Decision

1. **The target is the reference game's pace, reached through roads and
   routes, not through the car.** A human in the starter car averages about
   **0.6 of top speed** in a race, around 190 km/h. The car's grip and top
   speed are not raised to get there.

2. **Fast cars need fast roads.** Better cars must be worth having. The
   interstate and the periphery have straights long enough that a 400 km/h car
   is measurably faster than the starter. A race route is judged by the
   average pace it allows the starter car. A fast road is judged by whether the
   top of the garage can use its speed there.

3. **It is built area by area.** In the order `docs/map-areas.md` sets,
   downtown last, each area's event route is sketched and measured against
   the target before it is wired in (ADR-0010). The pace check is part of what
   "done" means for an area. The generator's circuits meet the same target when
   they return (#301).

4. **A human is measured before the bot is trusted.** The target is a human's.
   `citylap` gets a bot target only once the bot has been checked against a
   recorded human drive, using the review's tools.

5. **The map's size stands, restated at race pace.** ADR-0005's "two to four
   minutes" is a crossing at the pace the game is played at, and at that pace
   the 10 x 8 km map of ADR-0007 still fits: the core is a 2.4-minute pursuit,
   and the periphery is where the fast cars go.

6. **Ladder races bring the police.** A Most Wanted race opens a pursuit at the
   start. Chase units cannot catch a car at race pace, and `npm run pace`
   already guards that. Roadblocks go on the route (#340). The pursuit
   outlives the race and carries into the claim, where the police can stop the
   runner (#341). A bust in a race ends it as a loss, with the stake
   `RepLedger.forfeit` already applies. The starting heat may scale with the
   rival's difficulty. Circuits and speed runs stay police-free for now.
   Free-roam pursuits stay provocation-only (#177).

## Consequences

- **The ladder is re-fitted to the new target**, not to the bot's 0.32. This
  was already owed (since #255) and still waits for a city full of routes, as
  ADR-0007 expected: one sweep, one re-tune.
- **`RIVAL_BASE_SPEED_FRAC` and `RIVAL_DIFF_SPEED_FRAC` become wrong the moment
  the first area is built to the target.** Their comments say so already
  ("both figures move whenever the routes do"). Measure, then decide.
- **Nitrous matters again.** #204's finding, that the boost is a net loss on a
  city circuit, is a consequence of today's pace, and it is expected to reverse
  on routes built to this target. Re-measure with `npm run nitro` once one
  exists.
- **Thinner traffic is part of reaching the target.** Design/01 question 2
  decided that separately. Traffic is thinned toward the reference's
  on-screen rate, measured with the same detector, and CLAUDE.md's "traffic
  roughly halves the pace" stops being a description of the game.
- **The police-free rule's comment in `cityworld.ts` is replaced** with this
  ADR's reasoning when question 3 is built. The worry it recorded is answered,
  not dismissed: a pursuit you can outrun, with roadblocks on the route, is a
  race with a hazard in it.
- **`npm run pace` becomes load-bearing for races.** Police in races only work
  if the chase cannot catch a car at race pace, so a change that makes it able
  to is a design regression, not a tuning note.
