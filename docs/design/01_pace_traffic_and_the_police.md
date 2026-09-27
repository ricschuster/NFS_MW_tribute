# Pace, traffic and the police: what the reference game asks of Crosstown

- Status: **proposed**. Each question below ends in a decision for the
  project's owner; nothing here is decided until that is answered.
- Date: 2026-09-27
- Evidence: [the gameplay review](../research/nfs-most-wanted-2012-gameplay.md)
  and its per-second data.
- Touches: [ADR-0005](../decisions/0005-the-shape-of-kestrel-bay.md),
  [ADR-0007](../decisions/0007-relief.md), #14, #70, #177, #180, #204, #210.

## Why this document exists

A 47-minute recording of *Need for Speed: Most Wanted* (2012) was measured
second by second: speed off the speedometer, district and street off the
minimap, traffic counted, pursuit state from the HUD, the police radio
recovered from under the music. Five findings became issues (#338-#342),
because they add to Crosstown without contradicting anything it has decided.

Four did not. Each of them runs into a decision already on record, and the
owner of the project has said which way the weight falls: **the recording is
authoritative for how the game should play**, because it is the game this one
is emulating. It is not authoritative for everything. The originality rule is
untouched, and the recording is one player on one evening, so where it could
be showing the player rather than the game, this document says so.

What follows is four questions. Each one gives the evidence, what Crosstown
does today and why, what the earlier decision was protecting, the options, and
a recommendation. The recommendations are meant to fit together, and the last
section explains how.

## What was surveyed

The project brief; ADRs 0001-0010; `docs/HANDOFF.md`; `docs/map-exploration.md`;
#269 (the map's goal, in the owner's words); the issues that set pursuit, traffic,
race and feel behaviour (#14, #70, #72, #166, #177, #180, #204, #210); and the
code those decisions live in (`constants.ts`, `cityworld.ts`, `citypolice.ts`,
`cityrace.ts`, `cityclaim.ts`, `radio.ts`, `scene/hud.ts`).

Three things found along the way that are simply out of date:

- **The project brief promises a helicopter** "that keeps you seen so the
  answer is cover rather than speed". The helicopter was cut in #183 and cover
  with it; `docs/HANDOFF.md` records why.
- **The brief sizes the city at 5 x 4 km.** ADR-0007 took it to about 10 x 8 km.
- **CLAUDE.md says traffic "roughly halves the pace"** and treats that as the
  game. It is a true measurement of today's game. Question 2 asks whether it
  should stay true.

The first two are corrected in the same change as this document.

## Question 1: how fast is the game?

### The evidence

The reference game is driven at 70-80% of top speed when it matters:

| | Reference game | Crosstown (`docs/city-baseline.json`) |
|---|---|---|
| Race average | 180-200 km/h, about 0.75 of top | Expert bot 0.22-0.48 of top on an empty road, 0.24-0.35 in traffic |
| Pursuit average | 181 km/h | Not measured |
| Free roam | median 130 km/h | Not measured |
| Ladder rival pace | Level with the player at 180-200 km/h | 0.275 of top (#10) to 0.34 (the boss), about 88-109 km/h |
| Nitrous | Used constantly, in races and pursuits | A net loss in a city race: 25% boosted against 30% clean (#204) |

The fastest district in the reference game is not the interstate. It is
downtown, with a mean of 154 km/h and 244 at the 90th percentile, because its
streets are four to six lanes with long straights and few forced stops.

### Why Crosstown is where it is

Nobody chose a slow game; it was measured into one, one reasonable step at a
time:

1. **The ladder is fitted to the bot.** `RIVAL_BASE_SPEED_FRAC` and
   `RIVAL_DIFF_SPEED_FRAC` put the field either side of what `citydriver`'s
   expert holds *in traffic*, which is 32%. A slow bot therefore makes a slow
   ladder.
2. **The bot is known to be slow for its own reasons.** #14: *"The spread is
   the driver, not the routes."* #210: it has no recovery from a wide line, and
   its advanced tier measured a third of the expert's pace. The 32% is partly
   the driver.
3. **Traffic sets the pace.** #180, and `TRAFFIC_IN_CITY`'s own comment: *"it
   is the single biggest thing deciding how fast the game is"*.
4. **Race routes are tight.** Four corner junctions within `ROUTE_RADIUS`
   (310 m), laps of 1.8-2.9 km, over whatever streets connect them. #204 found
   the result: *"a city circuit has a corner every few hundred metres, so
   whatever overspeed the boost buys is scrubbed off by the grip limit in the
   next bend"*.

The car is not the limit. `LATERAL_GRIP` allows about 11 g, so a 30 m radius
corner is a 200 km/h corner. The pace is lost to the road, the traffic and the
driver.

### What depends on the answer

- **The map's size.** ADR-0005 sized the city so that *"a pursuit should be
  able to cross the map in two to four minutes"*, measured at the 32% an
  expert holds in traffic. ADR-0007 calibrated against a community timing of
  the reference city *"driven end to end at a steady 65 mph"*, about 105 km/h.
  Both use a cruising pace. The recording shows pursuits run at 180. At that
  speed ADR-0007's 16 km end-to-end drive takes 5.3 minutes, not 9, and the
  core's 7.3 km diagonal takes 2.4 minutes. **The 10 x 8 km map is still the
  right size at reference pace**: the core crossing lands inside ADR-0005's two
  to four minutes, and the periphery becomes what ADR-0007 said it was for,
  being *"chased along at top speed"*. Nothing about the map's extent needs to
  move, but the reasoning behind it should be restated at the pace the game is
  actually played at.
- **What #268 and the race routes are built for.** Downtown is being rebuilt
  (#268), and `routesFor` finds no routes at all on the authored map yet
  (`docs/HANDOFF.md`, "Known problems"). Both are going to be decided in the
  next stretch of work, and both decide pace.
- **Nitrous.** #204's finding is a consequence of pace. On roads that can be
  driven at 75% of top, the boost has somewhere to go again.

### Options

- **A. Keep today's pace.** Crosstown is a different game at a different
  speed, and the ladder stays fitted to the bot.
- **B. Make the reference pace the target, and get there through roads and
  routes, not the car.** Race routes run along arterials, boulevards and the
  interstate, with long legs and few forced stops; a route is judged by its
  average pace, not only its length. Downtown's main streets are wide enough
  to be driven fast, as #268's "grown, not planned" allows: a grown city still
  has main streets. The ladder is re-fitted afterwards.
- **C. Get there through the car:** more grip, more top speed. This is
  cheaper, but it does not work on its own. The limit is not the car, and a
  faster car on the same roads meets the same traffic and the same corners
  sooner.

### Recommendation: B, starting with a measurement

1. **Measure a human, not only the bot.** Record a person driving the
   existing routes and read their pace the way the review read the reference
   game's (the tools are in `docs/research/nfs-mw-2012/tools/`). Until that
   number exists, "Crosstown is half the reference pace" is partly a claim
   about `citydriver`.
2. **Set a target as a fraction of top speed for a human in a race**, around
   0.6-0.7, and give `citylap` a corresponding bot target once the bot has
   been checked against the human.
3. **Build the race routes to the target**, as the network returns (#268,
   #301). Following ADR-0010: sketch candidate routes over the authored map
   and measure them with the grip model before wiring anything into
   `routesFor`.
4. **Re-fit the ladder last**, as ADR-0007 already expected (*"one sweep, one
   re-tune"*).

## Question 2: how much traffic?

### The evidence

In 60% of the reference game's driving seconds, no other vehicle is on screen.
Three or more are visible in at most 10% of seconds, in its busiest district,
and 0-5% elsewhere. Traffic there is an occasional obstacle and a source of
points (ONCOMING and NEAR MISS counters run almost constantly), not a density
that sets the pace.

### Crosstown today

`TRAFFIC_IN_CITY = 52` cars within 360 m, scaled by district and by hour
(#180). It was cut from 75 after a playtest said *"traffic is too dense"*, and
its comment says what traffic still costs: *"a good driver holds a quarter of
top speed in traffic against half on an empty road"*. CLAUDE.md builds on the
same fact: *"tuning against the empty number alone is tuning against a game
nobody plays"*.

### What the earlier decisions were protecting

Traffic is what makes a city feel lived in, and it is the hazard that makes
driving fast a skill rather than holding a key down. #87 kept it near the
player for performance; #180 added place and time. None of that is in
question. Only the *amount* is.

### Options

- **A. Keep today's density.**
- **B. Thin it toward the reference's**, measured the same way: count what is
  on screen with the same detector on Crosstown frames (`npm run cityshot`, or
  a recorded drive), and set `TRAFFIC_IN_CITY` and `TRAFFIC_DENSITY` against
  that number rather than against a feeling.
- **C. Thin it on race routes only.** This is cheaper, but it makes races
  play differently from free roam, and the reference game does not do it.

### Recommendation: B

Keep the district and hour variation; lower the total until Crosstown's
on-screen traffic rate is in the reference's range. Re-record `citylap`'s
traffic column afterwards, and change CLAUDE.md's sentence: traffic should be
something you thread, not the thing that decides the pace. The owner's own
playtest already asked for this once (#180).

This is the cheapest of the four questions to act on, and it moves Question 1
by itself.

## Question 3: do races bring the police?

### The evidence

Every pursuit in the recording was started by an event: an ambush, the Most
Wanted race (*"CHASE INITIATED"* two seconds in), and an ordinary circuit race,
halfway round. Each outlived its event, by up to two and a half minutes. No
pursuit began in free roam in 47 minutes.

In a race, the police are almost never on screen. At 200+ km/h the chase cars
cannot keep up, so the pressure arrives as **roadblocks on the race route**:
four in one race, roughly every 20-40 seconds, often right at a checkpoint,
each paying +250 on the way through. After the race the pursuit carries on,
through the rival's shutdown.

### Crosstown today

`startRace` calls `police.reset()`, and the police do not run while a race is
on. The reasoning is in `cityworld.ts`, added with circuits (#70): *"No pursuit
during a sanctioned event: a race you have to win while being rammed by a
heat-six Enforcer is not a race, it is a pursuit with a lap counter on it."*
The ambush's doc comment makes the same point from the other side: *"every
other event asks you to stop being chased in order to play it"*.

Free-roam pursuits need a witnessed provocation (#177), which came from the
owner's own playtest: *"In the original game cops only chase if triggers are
met (e.g. too fast, crashing into them)."*

### What the earlier decision was protecting, and why the recording answers it

The worry in #70 is real: a race decided by being rammed is not a race. The
recording shows how the reference game avoids it. **The police in a race are
not rammers; they cannot catch you.** They are roadblocks ahead that you have
to get through at speed. That is a race with a hazard on the route, which is
exactly what a race should be.

#177 is **confirmed**, not contradicted. Nothing in 47 minutes of free roam
provoked a pursuit, because the player never did anything in view that would.

### Options

- **A. Keep races police-free.**
- **B. Ladder races bring heat, the reference way.** A Most Wanted race opens
  a pursuit at the start. The chase units cannot catch a car at race pace
  (`npm run pace` already guards "can the police be outrun"). Roadblocks go on
  the route (#340). The pursuit continues after the finish, into the claim,
  where the police can stop the runner (#341). Losing them afterwards is part
  of the event, as it is in the reference.
- **C. Every race can bring heat**, as the circuit race in the recording did.

### Recommendation: B now, C later

Ladder races are where the recording is unambiguous and where #341 and #340
pay off. Whether an ordinary circuit or speed run should draw heat is a
smaller question and can follow once B has been played. Keep #177 exactly as
it is for free roam.

Two things B has to settle, which are design rather than tuning:

- **Can you be busted in a race?** The recording does not show it. The safe
  answer is that a bust ends the race as a loss, which is the same stake
  `RepLedger.forfeit` already applies to a pursuit.
- **Does the race's heat start at 1 or higher?** The ambush started at heat 2.
  A ladder race could scale its starting heat with the rival's difficulty.

## Question 4: are the other racers cars?

### The evidence

In the circuit race the player takes down rival racers (SLAM TAKEDOWN +275,
twice). The field is physical: it can be hit, and hitting it well pays.

### Crosstown today

The field is six positions along the route line, by design (#70-#72,
`cityrace.ts`): *"a rival that could get lost would be a rival whose
difficulty is whatever the junction picker happened to produce"*. That
argument is about navigation, and it is right.

### Options

- **A. Keep the field as positions.**
- **B. The field keeps its positions, and gains bodies.** Each rival still
  advances along the route line at its tuned pace, so difficulty stays a
  number and nobody gets lost. It also becomes something you can collide with
  through `impact.ts`, and a takedown knocks it out of the race. The
  navigation argument stands; only "untouchable" goes.
- **C. The field becomes `GraphCar`s** that drive the route. This reverses
  #70-#72 and brings back the problem they solved.

### Recommendation: B, after Question 1

This is the smallest of the four, and it depends on races existing again.
Leave it until the routes return. Once they do, B keeps what #70 was
protecting and adds what the recording shows.

## How the recommendations fit together

They are one change seen from four sides: **a game played at the reference
game's pace, with traffic you thread and police you outrun rather than
outwait.**

- Thinner traffic (Q2) is most of the pace (Q1), and it is the cheapest move.
- Faster routes (Q1) make nitrous matter again (#204) and make race-time
  roadblocks (Q3, #340) a decision at speed rather than a stop.
- Police in ladder races (Q3) only work if the chase cannot keep up, which is
  true at reference pace and doubtful at today's.
- A physical field (Q4) matters more when races are fast enough to make
  contact costly.

### Proposed order

1. **Measure.** Human pace on the existing routes, and Crosstown's on-screen
   traffic rate with the review's detector. Cheap, and it turns two of these
   questions from judgement into numbers.
2. **Traffic (Q2).** A constants change and a re-recorded baseline.
3. **Police in ladder races (Q3), with #340 and #341.** Independent of the map.
4. **Pace through routes and roads (Q1)**, as part of #268 and the route
   rebuild, sketched first under ADR-0010. Then re-fit the ladder.
5. **Bodies for the field (Q4)**, once races exist again.

Q1 and Q3 change recorded decisions (ADR-0005's sizing rationale; #70's
police-free races). Once the owner has answered, those two become an ADR, and
the rest become issues.

## Decisions for the owner

1. **Pace:** adopt the reference game's race pace, about 0.6-0.7 of top speed
   for a human, as the target, reached through roads and routes? (Recommended.)
2. **Traffic:** thin traffic toward the reference's on-screen rate, measured
   rather than felt? (Recommended.)
3. **Police in races:** ladder races bring heat, with roadblocks on the route
   and a pursuit that carries into the claim; free roam stays
   provocation-only? (Recommended; other races later.)
4. **The field:** rivals keep their positions and gain bodies you can take
   down, once races return? (Recommended, and last.)
