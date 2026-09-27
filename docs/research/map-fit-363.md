# Does the map fit? An audit (#363)

- Date: 2026-09-27
- Asked by the project's owner before any more map work: *"figure out if the
  map as we have it now will work with the updates and what we have learned.
  Most important part to me."*
- Measured with `npm run mapfit` (`tools/mapfit.mjs`); the numbers are in
  [`mapfit.json`](mapfit.json). Everything is on the live network the game
  builds today, with the game's own car physics after #365.

## The answer

**The frame fits.** Nothing about the land, the district plan, the main roads
as drawn or the freeway sketch has to change to carry what the gameplay review
and ADR-0011 asked for. What falls short today is the *fill*, the roads not yet
built, and that was expected.

The owner's framing, given during the audit, is what the verdicts below are
read against: *"the road network is not finished yet (still many roads to
come). We did the main roads roughly so far. Freeway is a sketch. Nothing is
really connected yet."* So every question is answered twice:

- **Frame:** what more roads cannot change. The land, the terrain, the
  districts, where the main roads and the freeway run.
- **Fill:** what will change as roads are added. Route counts, connections,
  tunnels.

| # | Question | Frame | Fill today |
|---|---|---|---|
| 1 | Can it be driven at the reference pace? | **Fits**: routes allow a median 70% of top on a careful line, against a 60% target | Marrow Field Run is 52% |
| 2 | Is there anywhere for a fast car to be fast? | **Fits**, on the freeway: the fastest car laps 16% quicker | The freeway is not built; on today's roads, only one run over 2 km |
| 3 | Wide enough for roadblocks? | **Fits**: 96% of the network is 20 m | - |
| 4 | The right size at race pace? | **Fits**: 3.0 min across the districts | Longest crossings are longer than they will be, because nothing is connected |
| 5 | Room for the events? | **Fits**: most routes meet the target | 12 distinct target routes today against about 54 wanted |
| 6 | Pursuit geography? | **Fits**: the freeway passes through downtown, and there is room for a railway beside 97% of it | No tunnels built; 7 bridge segments |
| 7 | How it compares | Network is boulevard-heavy (96%) | 74 km of surface road |

**Recommendation: resume area work (M7)**, with two things added to how an
area is finished, and three things to watch (end of this document).

## How it was measured

The question each time is what the *road* allows, so the tool models a
driver, not a network statistic. Along any path it takes the corner speed at
every point from the road's shape and the car's grip, then runs the car
forward on the game's acceleration curve (`ACCEL_TIME`, #365) and backward on
its braking (`BRAKE_RATE`), and reads the time. Grade is included the way the
game does it (`slopeSpeed`, `slopePull`, over `SLOPE_SAMPLE`), and so are dirt
and gravel caps.

Two versions bracket what a person does:

- **Physics:** all of the car's grip, the full width of the road.
- **Human:** half the grip, one side of the road.

**Corners are read at the scale a driver sees them.** The first version took a
corner from every vertex of the road's centreline, and on hand-drawn roads
that counted each small kink as a corner: 8 slow corners per km on a
boulevard. On a 20 m road a driver goes straight through a kink. The model now
looks at the road over 10 m to 320 m either side of each point, and only the
part of a bend that is bigger than the room the driver has forces a turn.
That is one rule for a junction and a gentle bend, and it took slow corners to
0.4 per km.

**Validated against the game.** On the one route that exists, the Marrow Field
Run, the game's own test driver (`npm run citylap`, empty road) averages
**53%** of top speed. The model's human line says **52%**. The model can be
trusted for "what this road allows a careful driver", and that is the number
the target is set in.

What the model cannot see: traffic, a person's reaction time, and roads that
are not built. #347 measures a real person and should re-check the "human"
line against them.

## 1. Pace: fits

| | Physics | Human |
|---|---|---|
| 160 sampled routes of 2-9 km (median) | 75% | **70%** |
| 10th to 90th percentile (human) | | 55% to 83% |
| Routes at or above the 60% target | | 128 of 160 |
| Slow corners (under half of top), per km | | 0.4 |
| Marrow Field Run | 57% | 52% (168 km/h) |

The routes are shortest paths between random points, which is not how race
routes will be chosen; a route laid for pace (ADR-0011) will do better than
the median. The main roads as drawn allow the reference pace with room to
spare, and hills cost almost nothing: 70% with them against 71% without,
because cut-and-fill holds the main roads' grades down.

**Marrow Field Run is below the target**, at 52%. It is a speed run over an
airfield: the runway and taxiway are dirt, capped at 85% of top speed by
design (#294), and the route turns on and off it. Either accept that as the
character of that event, or re-lay it with more of its length on the
boulevards. That is a decision about one event, not about the map.

## 2. Fast roads: fits, once the freeway is built

The fastest car in the garage (Nightfall, 390 km/h) needs about 1.1 km from
rest to reach 90% of its top and 1.6 km for 95%. The starter needs 1.0 and
1.3.

| Freeway loop as authored, one lap (15.0 km) | Physics | Human |
|---|---|---|
| Kestrel (starter, 320 km/h) | 2.81 min, 320 km/h | 2.93 min, 307 km/h |
| Nightfall (fastest, 390 km/h) | 2.30 min, 390 km/h | 2.46 min, 366 km/h |

On the authored loop the fastest car is **16% quicker per lap** and holds
94% of its top. That is exactly what ADR-0011 decision 2 asks for: somewhere
the top of the garage is measurably better.

On today's surface roads the longest stretch a fast car can hold without
lifting is 2.4 km, and only seven are over 1 km. `npm run pace` separately
reports the longest *straight* road as 410 m, reached at 71% of top. The
surface network alone would not make fast cars matter; the freeway does. So the
freeway has to be built, not just drawn, and its ramps are the open question
already on record (#261, #301).

## 3. Widths: fits

| Width | Length | Share |
|---|---|---|
| 20 m | 70.6 km | 96% |
| 10 m | 3.3 km | 4% |

`ROADBLOCK_MIN_WIDTH` is 16 m, so 96% of the network can take a roadblock, and
the median sampled route is 100% eligible. Roadblocks on race routes (#340)
have somewhere to go on every route that uses the main roads. The 10 m roads
are local streets (Ashford Point's driveways), which is where the side
streets "stay the way round", as `ROADBLOCK_MIN_WIDTH`'s comment intends.

## 4. Size at race pace: fits

| Longest crossing (shortest path) | Distance | At 190 km/h | Human profile |
|---|---|---|---|
| Whole network | 16.3 km | 5.1 min | 3.7 min (262 km/h) |
| Inside the plan's districts | 12.7 km | 4.0 min | 3.0 min (252 km/h) |

ADR-0011 restated ADR-0005's "two to four minutes" at race pace, and the
districts come in at 3.0 minutes. The distances by road are long because the
network is not connected yet: a shortest path today detours round gaps that
will be filled. They will shrink, not grow.

## 5. Room for events: fits in the frame, short in the fill

Choosing greedily among the sampled routes that meet the target, and allowing
at most half of a route's roads to be shared with one already chosen, gives
**12 distinct routes** on today's network. Events per car
(`docs/design/02_events_per_car.md`) wants about three for each of 18 cars,
54 in all, on shared routes. So there is room for about a fifth of that today.
But 128 of 160 sampled routes already meet the pace target, so the shortfall
is connections, not the kind of road. Every road an area adds makes more
routes.

## 6. Pursuit geography: fits

- **A covered freeway downtown** is possible as drawn. The loop runs 1.7 km
  inside downtown's polygon and passes within 100 m of its middle. By
  district: 8.2 km periphery, 2.0 midtown, 1.8 industrial, 1.7 downtown, 1.2
  park.
- **A railway beside the freeway** has room. Along 97% of the loop there is
  land 25-45 m out on one side or the other with a cross-fall under 8%, and
  the longest unbroken stretch is 7.5 km.
- **Bridges:** 7 bridge segments, 1.2 km in all, on today's network. The
  handoff's known gap (1795 m at worst between crossings, against an 800 m
  promise) is a fill problem: it closes as roads reach the water.
- **Tunnels:** none on today's network. The freeway sketch has four tunnel
  anchors, and street tunnels are #256. Both are fill.

## 7. How it compares

The network today is 73.9 km of surface road, 96% boulevard. By plan
district: periphery 51%, midtown 20%, waterfront 12%, downtown 7%, industrial
5%, park 4%. In the reference recording, the interstate was about 28% of
driving time and downtown the second-fastest district. Crosstown's freeway,
when built, would be 15 km against today's 74 km of surface road. It would be
the fast road the network needs, and nothing about it is short.

## What changes for area work

Two things are added to how an area is finished (`docs/map-areas.md`), both
already decided:

1. **The pace check** (added under ADR-0011) now has a tool: `npm run mapfit`
   measures any route. An area's event route should meet about 60% on the
   human line.
2. **"What the rebuild should include"** is confirmed as buildable in the
   frame: the railway corridor and the covered freeway downtown both fit where
   the freeway is drawn.

## Three things to watch

1. **Traffic breaks the test driver.** With traffic on, `citylap`'s driver
   did not finish the Marrow Field Run: 279 collisions and 5% of top speed.
   It wrecked itself. Thinning traffic (#348) matters for more than pace.
2. **The freeway has to be built for fast cars to matter.** The surface roads
   alone do not give a 390 km/h car anywhere to use it. That puts #261 and
   #301 higher than their place in the map order suggests.
3. **The "human" line is a model.** It matches the test driver on the one
   route that exists, and it should be checked against a person (#347) before
   anything is tuned to it.
