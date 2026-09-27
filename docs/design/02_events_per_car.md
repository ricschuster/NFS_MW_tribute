# Events per car

- Status: **proposed**. The direction was decided on 2026-09-27 (each car you
  find comes with its own events); the questions below are the shape of it,
  and each ends in a recommendation for the owner.
- Evidence: [the gameplay review](../research/nfs-most-wanted-2012-gameplay.md).
- Touches: #66, #67, #68, #90, #91, #311, `docs/map-areas.md`,
  [ADR-0011](../decisions/0011-the-reference-games-pace.md).

## What the reference game does

Every car found in the world comes with its own short list of events. The
recording shows the first car's list at 04:00 and 06:15, and a later car's at
10:00 and 36:15: sprints, circuits, speed runs and an ambush. Each is
reached from the in-drive menu, with "set destination" to drive there. Each
pays by finishing place, and finishing first or second in that car unlocks
that car's parts. The ladder (the Most Wanted races) is a separate list, gated
by points, not by car.

So finding a car is not only a new ride. It is a new set of things to do in
it, and a reason to go and find the next one. That is the loop the recording
shows for most of its 47 minutes: find a car, run its events, earn its parts,
use the points to unlock the next Most Wanted race.

The recording is early game. It shows two or three cars' lists, not how many
events a late car has or how the lists grow.

## What Crosstown does today

- **18 cars** (`cars.ts`): the one you start in, seven parked around the city
  (#67), and ten taken off the ladder's rivals (#66).
- **Every race is a ladder challenge.** `startRace(route, rival)` needs a rival
  and `challengeReady`; there is no race that is not a rung of the ladder.
  Circuits and speed runs exist as scoring rules (#70, #72), not as events of
  their own.
- **Parts are already per car** (#68): `Garage.earn(carId)` gives the next part
  for the car you finished first or second in.
- **Routes** come from the generator's circuits (`routesFor`, none on the
  authored map yet) and from routes laid by hand per area (`placedRoutes`, the
  Marrow Field Run, #311).
- **Ambushes** are spots in the city (#92), not tied to a car.

## The change

A second kind of event beside the ladder: the **car event**. It is data like
`RIVALS` or `PLACED_ROUTES`: which car it belongs to, which route or spot, which
kind (sprint, circuit, speed run, ambush), a difficulty, and what each place
pays (decided separately: rewards by place, with the difficulty on the event
card). Ladder races stay what they are, and bring the police (ADR-0011).

## Questions

### 1. How many events per car?

The reference shows lists of about five to seven for its early cars. With 18
cars, five each is 90 events, which is a lot of routes for a map being
finished one area at a time.

**Recommendation:** three to five per car, starting at three. The starter
car and the parked cars get theirs first. A car's list can grow later without
changing anything else.

### 2. Where do the routes come from?

Hand-laid routes (`placedRoutes`) exist now and pass through finished areas;
generated circuits return with the street grid (#301).

**Recommendation:** a car event names a route, and routes are shared. Two
cars can race the same roads as different events (a sprint one way, a speed
run the other), which is how a road network gets many events out of few
routes. Each finished area contributes routes as part of its "content and
event" step in `docs/map-areas.md`, laid for the ADR-0011 pace target.

### 3. When is a car's list available?

In the reference, the list is available the moment you have the car.

**Recommendation:** the same. Finding a car is the unlock. Only the ladder is
gated by Rep (#91).

### 4. Who do you race against?

A ladder race's field is built around the challenged rival (`fieldFor`); a car
event has no rival.

**Recommendation:** a field of the same kind (positions along the route, with
bodies once design/01 question 4 is built), whose pace comes from the event's
difficulty instead of from a rival. The identities are generic, not the
ladder's rivals, so beating a car event never looks like beating a rival.

### 5. Do rival cars get events?

The recording shows a list for the first Most Wanted car after it was taken
(36:15).

**Recommendation:** yes. A claimed rival car gets its own list like any
other, which makes claiming it worth more than a trophy.

### 6. Do car events bring the police?

ADR-0011 brings the police into ladder races and leaves the rest police-free
for now. The recording shows an ordinary circuit race picking up a pursuit
halfway round.

**Recommendation:** no, for now, as ADR-0011 says. Revisit once ladder races
with police have been played.

### 7. How do you get to one?

The Quick Wheel (#90) sets destinations, and "jump to car" has been decided:
allowed from free roam, refused while wanted.

**Recommendation:** the Quick Wheel lists the current car's events, and
choosing one sets its start as the destination. To run another car's event,
jump to that car first.

### 8. What happens to the six generated circuits?

They are ladder routes today.

**Recommendation:** the ladder keeps using generated routes when they return.
Car events use both kinds. Nothing about the ladder changes.

## Order

1. The data and the event kind, with the starter car's first three events on
   hand-laid routes that already exist (the Marrow Field Run).
2. Rewards by place and the event card (a separate issue), since a car event
   needs them to mean anything.
3. The Quick Wheel list, and jump to car.
4. Each finished area adds routes, and cars get events on them.

## Decisions for the owner

1. Three to five events per car, starting at three?
2. Routes shared between cars, contributed area by area?
3. A car's list opens when you find the car?
4. A generic field, paced by the event's difficulty?
5. Claimed rival cars get lists too?
6. Car events stay police-free for now?
7. The Quick Wheel lists the current car's events; jump to a car to run its
   events?
