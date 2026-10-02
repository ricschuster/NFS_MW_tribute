import type { BuildingCharacter, DistrictCharacter, DistrictKind } from './city/types';

/** Logical canvas resolution of the HUD layer. It is scaled to fit via CSS. */
export const WIDTH = 1024;
export const HEIGHT = 640;

/** Fixed physics timestep (seconds). */
export const STEP = 1 / 60;

/* ------------------------------------------------------------------ */
/* The car. How it drives, everywhere it drives.                       */
/* ------------------------------------------------------------------ */

/** Fastest the car can be turned at low speed, in radians per second. */
export const TURN_RATE = 2.2;
/**
 * Lateral acceleration the tyres can hold, in world units per second squared.
 *
 * This is what makes speed matter in a corner. Turning at yaw rate w while
 * travelling at v needs lateral acceleration v*w, so the fastest the car can be
 * turned is LATERAL_GRIP / v: the quicker you go, the wider you turn. Without
 * it the steering scales with speed and every bend can be taken flat out
 * however sharp it is.
 */
export const LATERAL_GRIP = 14400;

/** Top reverse speed as a fraction of forward max speed. */
export const REVERSE_SPEED_FRAC = 0.18;

/**
 * Dirt roads (#294): still a road - `onRoad` is true, the off-road decel in
 * `settle` never applies - just a worse one. Grip and top speed are cut by
 * these fractions while `onRoad.surface` is `'dirt'`, short of the off-road
 * penalty (`offRoadDecel`/`offRoadLimit` in `cityworld.ts`), because leaving
 * the network entirely should always cost more than staying on a bad road.
 */
export const DIRT_GRIP_FRAC = 0.8;
export const DIRT_SPEED_FRAC = 0.85;
/**
 * Gravel (#327): crushed stone, laid and graded, which is a better road than
 * packed earth and still a worse one than tarmac. Between the two, so the order
 * of the three surfaces is the order of how they drive.
 */
export const GRAVEL_GRIP_FRAC = 0.9;
export const GRAVEL_SPEED_FRAC = 0.92;
/**
 * Off-road tyres (a part, `mods.ts`): on dirt they take nothing off at all,
 * and open ground caps the car at this fraction of its top speed instead of
 * the quarter it is otherwise held to (`offRoadLimit`). Under half, so a
 * park is still slower than the road round it - a shortcut, not a second
 * road network - and cutting across one in a pursuit gains a lot rather than
 * everything; the police are held to `COP_OFF_ROAD` either way.
 */
export const OFFROAD_TYRE_LIMIT = 0.45;
/**
 * Paved ground that is not a road (#410, `city/aprons.ts`): Sablet Wharf's
 * yard. Concrete is a good surface, so the car keeps this fraction of its top
 * speed there - a shade under the road, which is laid and marked for it, and
 * nothing like the quarter open ground allows. The police drive it at the same
 * fraction of their pace rather than `COP_OFF_ROAD`, or the container rows
 * would be an escape nobody could follow into.
 */
export const APRON_SPEED_FRAC = 0.9;

/**
 * Nitrous (#45, #48, #105).
 *
 * The boost is an *acceleration* boost first and a top-speed boost second, and
 * #105 is why. When it was mostly top speed, the only way to spend it was on a
 * straight, and the charge bought overspeed that then had to be scrubbed off
 * before the next bend - measurably slower than never pressing it. Corners are
 * grip-limited since #82, so extra top speed has nowhere to go.
 *
 * What it buys now is the way out of a corner. `NITRO_TAPER` fades the
 * acceleration multiplier as the car approaches its top speed, so the boost is
 * worth most where the car is slowest and worth least where it was already
 * doing everything it could. That is also how the genre's nitrous reads.
 */
export const NITRO_SPEED_MULT = 1.13; // top speed multiplier while boosting (must stay < 2)
export const NITRO_ACCEL_MULT = 3.4; // acceleration multiplier while boosting, at rest
/**
 * How much of that multiplier is gone by the time the car is at top speed.
 *
 * At 0 the boost is flat and spamming it on a straight is the best use of it;
 * at 1 it does nothing at the top end at all, which makes holding it through a
 * straight a waste rather than a choice. Most of the way, not all of it.
 */
export const NITRO_TAPER = 0.8;
export const NITRO_DRAIN = 0.5; // charge/sec spent while boosting (~2s from full)
/**
 * Charge per second regained while not boosting, by waiting.
 *
 * Down from 0.16 (#351): the reference game fills most of its bar from driving
 * dangerously, and a passive rate that fills the bar in six seconds leaves
 * nothing for the risky line to buy. Ten seconds to full now, and the rest
 * comes from the sources below.
 */
export const NITRO_RECHARGE = 0.1;
/**
 * What driving dangerously refills (#351), each on top of the passive rate:
 * per near miss, and per second in the air, on the wrong side of the road, or
 * tucked in behind a car. A near miss is worth most because it is one moment
 * rather than a stretch; three of them are most of a boost.
 */
export const NITRO_FROM_NEAR_MISS = 0.08;
export const NITRO_FROM_AIR = 0.3;
export const NITRO_FROM_ONCOMING = 0.22;
export const NITRO_FROM_SLIPSTREAM = 0.18;
/**
 * Drifting (#351): the fifth nitrous source, and the slip model it needs.
 * On since the owner drove it; it changes how every car turns, so switching
 * it off (`DRIFT_ENABLED`) is a handling decision and not a tidy-up.
 *
 * The reference's rule is "tap brake to drift". With it on, a tap of the brake
 * while steering above `DRIFT_MIN_SPEED` of top starts one: the car turns
 * `DRIFT_YAW` times as fast as its grip allows, the way it is actually going
 * swings round after it at no more than `DRIFT_CATCH` radians a second, and
 * the angle between them - the slip - scrubs `DRIFT_SCRUB` of the speed per
 * radian per second. Letting go of the steering straightens it. Above
 * `DRIFT_MIN_SLIP` the slide fills the bar at `NITRO_FROM_DRIFT` a second.
 */
export const DRIFT_ENABLED = true;
export const DRIFT_MIN_SPEED = 0.35;
export const DRIFT_YAW = 1.7;
export const DRIFT_CATCH = 1.1;
export const DRIFT_SCRUB = 0.35;
export const DRIFT_MIN_SLIP = 0.15;
export const NITRO_FROM_DRIFT = 0.16;
/** The least speed, as a fraction of top, at which oncoming and slipstreaming count. The near miss's own. */
export const NITRO_RISK_SPEED = 0.35;
/** Seconds a refill counter stays on the HUD after its source last counted. */
export const NITRO_COUNTER_HOLD = 1.6;
export const NITRO_MIN_ENGAGE = 0.25; // charge needed to light the boost again once it runs dry
export const NITRO_BLEED_FRAC = 0.6; // overspeed shed per second (× maxSpeed) once boost ends

/** Car body width in world units: about half a lane. */
export const CAR_WIDTH_WORLD = 650;
/** Car body height as a fraction of its width. */
export const CAR_ASPECT = 0.7;
export const CAR_COLORS = [
  '#c94b4b',
  '#4b7bc9',
  '#d8a13a',
  '#3ca35a',
  '#9aa0aa',
  '#b0483f',
  '#6a4bc9',
];

/* ------------------------------------------------------------------ */
/* The pursuit clock. Distances and levels live in the city block.     */
/* ------------------------------------------------------------------ */

export const COP_RESPAWN = 20; // delay before a new pursuit after escaping
export const COP_BUST_COOLDOWN = 15; // delay before a new pursuit after a bust
export const COP_SPAWN_INTERVAL = 3; // seconds between adding cops within a pursuit
/**
 * Getting busted (#178).
 *
 * `BUST_TIME` is seconds pinned before BUSTED, and `BUST_SPEED_FRAC` is what
 * "pinned" means. It used to mean only *close* - a unit within
 * `CITY_BUST_DISTANCE` for three and a half unbroken seconds - and the
 * measured result was **0 busts in 24 pursuits**: a car being chased is
 * moving, and holding a bumper to within eleven metres of a moving car for
 * three and a half seconds is not something a graph-following cop does.
 *
 * So the clock runs on how *slow* you are. At a standstill with a unit on you
 * it runs at full rate; at `BUST_SPEED_FRAC` of your top speed it does not run
 * at all. That is the genre's answer and it is legible in one sentence: if
 * they box you in and you cannot move, you are done. It also gives the
 * roadblocks, the spike strips and the Enforcers a point - all three exist to
 * stop you moving, and until now none of them could actually finish anything.
 */
export const BUST_TIME = 3.5;
export const BUST_SPEED_FRAC = 0.22;
/** Seconds the ESCAPED banner lingers. */
export const ESCAPED_FLASH = 2.5;
/**
 * Seconds a pursuit banner holds (#356), and how many can wait behind it.
 * Long enough to read at speed without looking away from the road for it;
 * short enough that three queued behind each other are gone in five seconds.
 */
export const BANNER_TIME = 1.6;
/**
 * Seconds the card after a pursuit holds (#354). Longer than a banner: it is
 * four numbers rather than two words, and it is read on a straight after the
 * pursuit rather than in the middle of one.
 */
export const PURSUIT_CARD_TIME = 5;
export const BANNER_QUEUE = 3;

/* ------------------------------------------------------------------ */
/* The ladder. What a rival is worth chasing at.                       */
/* ------------------------------------------------------------------ */

/**
 * How fast a rival runs, as a fraction of *your top speed*, held along the
 * route line (#192, #204).
 *
 * These were 0.8 and 0.125, set by `npm run feel` against the track sim, where
 * a reference lap averaged 91% of top speed. That sim was deleted in #165 and
 * a lap of Kestrel Bay averages a quarter of top speed in traffic, because the
 * car has to corner and the road has other cars on it - so the same numbers
 * described a field three times faster than anything that could be driven, and
 * every rival on the ladder was unbeatable.
 *
 * #192 re-derived them and said it had done so against an expert. It had not:
 * `citylap`'s ladder table never passed `skill`, so it raced the *perfect*
 * driver while printing "driven by an expert", and these numbers were fitted
 * to a lap nobody can drive. Against the expert the header always claimed, the
 * same table put that driver behind eight of the ten rivals.
 *
 * Re-derived against the driver actually racing. Measured on Harbour Loop in
 * traffic, in the car you start in with no parts on it, an expert holds 32% of
 * top speed. These two put the field at 27.5% for #10 and 34% for the boss:
 * that driver takes #10 through #4 in the car the game opens with, and #3, #2
 * and the boss want a better one.
 *
 * One rank is about 82 m of gap over a lap, so whichever rival the line falls
 * between is close: #4 is won by 32 m and #3 lost by 50. That is the boundary
 * being a boundary rather than a number needing another decimal place - moving
 * it only moves which pair is the coin-flip.
 *
 * **Refitted after #347 and #348 (2026-09-28), to the same design.** The
 * gridded streets and Harbour Loop are gone; the only circuit is the Halloway
 * Rim (#398), gravel with no traffic, where an expert holds 59% of top speed.
 * Left at 27.5-34% the field was beaten by more than three kilometres, and the
 * owner, driving it wrecked, held 66%. At 0.495 and 0.14 the field runs 51%
 * for #10 to 63.5% for the boss; the expert takes #10 through #4 (#4 by
 * 140 m) and loses #3 (by 33 m), #2 and the boss. One rank is about 175 m
 * here. (0.483 before the Crest Kicker went on the rim's line (#323): taken
 * flat out it saves the expert a second and a half, and #3 fell to it.)
 * This is fitted to one circuit without traffic. When the map has street
 * circuits again, measure first: traffic is thinner than it was (#348), so
 * the old quarter-of-top-speed figure will not come back either.
 *
 * **Both figures move whenever the routes do**, and not only when
 * `ROUTE_RADIUS` changes. A route is four corner junctions joined over the
 * street graph, so *any* change to the network redraws it: the expert went from
 * 26% to 28% when #218 lengthened the routes, and from 28% to 32% when #241 put
 * a road along the water - a road nobody added for the racing, which the routes
 * then used. This is not a constant that survives a change to the map. It does
 * not follow that every map change needs new numbers: #244 moved the freeway's
 * ramps and its tunnel, which shifted Harbour Loop's traffic lap by ten
 * seconds and left the ladder reading as designed, so it was left alone.
 * Measure, then decide.
 *
 * A caution about the tier below. An advanced driver is nominally about four
 * points off an expert, and fitting the ladder to one tier alone put an
 * unwinnable race at whichever end the other one stood - which is #192's
 * defect, one tier down. But the advanced figure is not usable: `citydriver`
 * has no recovery from a wide line and grinds along buildings (see #210), and
 * on these routes that tier measured 9-10% against the expert's 32% - a third
 * of the pace, which is a broken driver rather than a slower one. Fitted to the
 * expert alone until #210 is fixed, and that is a known compromise, not an
 * oversight.
 *
 * It used to say "and won with the boost". That is not reachable and the
 * reason is not the one that was assumed: `npm run nitro` measures the share
 * of a lap spent above the speed the next bend allows at a flat 5-6% whether
 * the boost is pressed or not, so nothing is being scrubbed off in corners.
 * The boost buys a faster exit, and in traffic that is spent arriving at the
 * car in front sooner - it comes back as damage rather than as pace. On an
 * empty road the same policy is worth eight points. Nitrous is a free-roam
 * mechanic that a race cannot use, which is #204.
 */
export const RIVAL_BASE_SPEED_FRAC = 0.495;
/**
 * Extra rival pace at difficulty 1 (#48, #105, #204).
 *
 * The spread of the ladder, and the thing that decides how much of it the
 * starting car can have. With `difficulty` running 0.15 at #10 to 1.0 at the
 * boss, these two put the field at 27.5% and 34% of your top speed against an
 * expert's measured 32%: #10 through #4 are won in the car the game opens
 * with, and #3, #2 and #1 are not.
 *
 * Wider than this and the bottom of the ladder is a walkover; narrower and the
 * whole thing sits inside one lap, which is what the old 0.068 did - the boss
 * was beatable clean and the ladder was a formality. It is not set so the
 * boss "needs the boost" any more, because the boost buys nothing in traffic
 * (#204); the boss needs a car.
 *
 * The spread is kept wide enough that the ladder does not sit inside a single
 * driver's spread of lap times: six and a half points from #10 to the boss,
 * against an expert whose own laps move by two or three depending on what the
 * traffic does.
 */
export const RIVAL_DIFF_SPEED_FRAC = 0.14;

/* ------------------------------------------------------------------ */
/* Kestrel Bay (ADR-0004). The city is generated, so these are the map. */
/* ------------------------------------------------------------------ */

/**
 * The seed that produces *our* Kestrel Bay. Treat it as content, not as a
 * tuning knob: changing it is publishing a different city, so the map every
 * screenshot, playtest and event position assumes moves under them.
 */
export const CITY_SEED = 0x4b657374; // "Kest"

/**
 * World units per metre.
 *
 * The HUD calls `maxSpeed` (12000 units/s) 320 km/h, which is 88.9 m/s, so a
 * metre works out at about 135 units. City sizes are written below in metres
 * and converted, because "an 80 m block" is something you can picture and
 * "10800 units" is not.
 */
export const UNITS_PER_METRE = 135;
const m = (metres: number) => metres * UNITS_PER_METRE;
/** km/h in world units per second, on the same scale: kmh(320) is `maxSpeed`. */
const kmh = (speed: number) => (speed / 3.6) * UNITS_PER_METRE;

/**
 * How the car picks up speed, brakes and coasts (#14).
 *
 * Measured off the reference game rather than chosen
 * (`docs/research/nfs-most-wanted-2012-gameplay.md`, speed read once a second
 * over 47 minutes). Its best launches reach 100 km/h in 4-5 s, 150 in 6-9 s and
 * 200 in about 11 s, and the pull fades as the car gets quicker: about 25 km/h
 * a second off the line, about 10 near 200. Its hardest braking sheds 40-65
 * km/h a second. The owner's verdict on the old model, after watching it:
 * *"way too quick to get to top speed and to brake"*. It was a constant pull
 * to the top in 5 s and a stop from 320 km/h in one second, about 9 g.
 *
 * So acceleration tapers with the square of the fraction of top speed:
 * `a = (REFERENCE_TOP_SPEED / ACCEL_TIME) * (1 - (v / top)^2)`, which gives
 * the starter car 100 km/h in about 4 s, 200 in about 9.5 and 300 in about 21,
 * the same shape as the reference. `profile.accel` still scales it per car.
 */
export const ACCEL_TIME = 13;
/** Braking, in world units per second per second: 55 km/h shed each second. */
export const BRAKE_RATE = kmh(55);
/**
 * Lifting off, in the same units. Not measured - the recording never shows a
 * clean coast - so chosen gentle: a car rolls on rather than stopping as if
 * braked, which is what the old `maxSpeed / 5` did.
 */
export const COAST_RATE = kmh(20);

/**
 * Overall extent (ADR-0005, sized by ADR-0007 rule 3).
 *
 * It was 5 x 4 km, from a behaviour rather than a number: a pursuit should
 * cross the map in two to four minutes at the pace the car actually holds.
 * Measured, that rule was already being missed - corner to corner took 4m 15s
 * on the streets - and ADR-0007 rescoped it to the *core*, which is where a
 * pursuit is fought, leaving the periphery for free roam and being chased along
 * at top speed. 10 x 8 km is the reference city's own crossing measured back
 * into an area, and it is four times this map with the same amount of city in
 * it: the grid is bounded by `CITY_BUILT_UP` now, so a bigger map is more
 * country and not more blocks.
 *
 * It is also what makes the relief possible. A gentle coast is a shore ramp
 * `TERRAIN_SHORE` wide, and on a small island that ramp covers everything -
 * measured, the hills fell from 139 m to 40 m the moment the landmass became
 * lobes inside a 5 x 4 km rectangle, because nowhere was far enough from the
 * water to reach full height. Hills need an interior to stand in.
 */
export const CITY_WIDTH = m(10000);
export const CITY_DEPTH = m(8000);

/**
 * Arterials are laid first and cross the city, so every local street meets one
 * at both ends and the network cannot come out in pieces.
 *
 * A **spacing**, not a count. It was nine columns and seven rows, which was
 * 555 m apart on a 5 x 4 km map and 1.25 km apart once ADR-0007 doubled it -
 * and since the grid is now bounded to the town (rule 3), a 2.7 km wide
 * built-up area contained about four superblocks. Each district was therefore
 * one enormous rectangle, which is what "all the named areas are smooshed
 * together" was looking at. A distance survives a change of map size; a count
 * does not.
 */
export const CITY_ARTERIAL_SPACING = m(560);
/** How far an interior arterial may wander, as a fraction of the even spacing. */
export const CITY_ARTERIAL_JITTER = 0.16;
export const CITY_ARTERIAL_LANES = 4;
export const CITY_ARTERIAL_SPEED = kmh(90);

/**
 * One lane, in world units - just under five metres of carriageway.
 *
 * Written as a literal rather than derived, because every road width, junction
 * and collision test in the pinned city is measured against this exact value:
 * it is map geometry, not a knob. It used to be `ROAD_WIDTH / LANES` from the
 * track sim, which is where the odd number comes from.
 */
export const CITY_LANE_WIDTH = 2000 / 3;

/**
 * The water (ADR-0005, rule 1). The bay eats into the north edge and the river
 * runs inland from it and severs the city, which is what makes bridges worth
 * having.
 */
/**
 * The landmass (ADR-0008 rule 1). Land is a field summed from `CITY_LOBES`
 * overlapping blobs and cut at `CITY_LAND_LEVEL`, with `CITY_CHANNELS` straits
 * subtracted across the necks between them.
 *
 * The lobes are why the coast is irregular in every direction instead of being
 * a wavy line along one edge, and the channels are why there are bodies of land
 * facing each other rather than one blob with headlands. `CITY_CHANNEL_CUT` has
 * to be deep enough to sever: a channel that only dents the coast is an inlet,
 * and an inlet does not need a bridge, which is the whole point of having one.
 *
 * `CITY_LOBE_SPREAD` squashes the ring of lobes onto the map's own aspect, so a
 * wide map gets a wide landmass rather than a circular one with sea in the
 * corners.
 */
/**
 * The landmass is **authored, and therefore fixed** (ADR-0009 rule 2).
 *
 * `makeWater` draws from this stream rather than from `CITY_SEED`, the way
 * `makeTerrain` already draws from `TERRAIN_STREAM`. The map is a plan in world
 * metres (`city/plan.ts`) and a polygon pinned in metres over a coastline that
 * moves with the seed is two answers to where the coast is.
 *
 * The terrain is frozen by the same constant, because the plan was audited
 * against the *ground* as well as the coastline - the hill park is 87 m mean and
 * 122 m peak, and those numbers are the reason it is a park.
 *
 * The value is `CITY_SEED`'s own, because the land this plan was drawn on is the
 * land that seed produced. It is written out rather than referring to
 * `CITY_SEED` on purpose: the whole point is that changing the seed no longer
 * moves the coast.
 *
 * The seed still varies the *city* - which streets are inside a district, which
 * blocks are skipped, what stands on them, where the content lands. It no longer
 * varies where downtown is. Kestrel Bay is one place.
 */
export const CITY_LAND_STREAM = 0x4b657374;

/**
 * A stream of its own for Marrow Field's fence and weeds (#295), for the same
 * reason `CITY_LAND_STREAM` is: `airfieldFurniture` draws hundreds of times
 * from it (a post or a skip for every few metres of a ~5 km perimeter), and
 * drawing that many values from the *shared* seed would shift everything
 * generated after it - the collectibles among them, which place off the exact
 * sequence the shared stream is at when they run. The fence's own pattern is
 * cosmetic and does not need to vary with `CITY_SEED` either; keeping it on a
 * fixed stream means it does not.
 */
export const CITY_AIRFIELD_STREAM = 0x4d617272;

/**
 * A stream of its own for Highmoor Park's woods (#460), for the same reason
 * as the airfield's fence: the woods are a couple of thousand draws, and on
 * the shared seed every one of them would move the collectibles placed after.
 */
export const CITY_WOODS_STREAM = 0x486d6f72;

/**
 * The named places (#271, ADR-0009 rule 5), which are shaped into the ground
 * before any road is laid.
 *
 * `PLACE_BLEND` is how far a place grades back into the hillside around it. Too
 * short and every place has a retaining wall round it; too long and levelling a
 * runway flattens the island it is on.
 */
export const PLACE_BLEND = m(160);
/**
 * How finely the land is flood-filled into bodies.
 *
 * Its own number rather than `CITY_GRID_CELL`, which is 120 m and was too coarse
 * to see the straits: a channel narrower than one cell is never sampled as
 * water, so the fill walks straight across it and two bodies of land come back
 * as one. Measured, that merged the docks' island into the main body, which cost
 * it its link road, its bridge and its separateness - and let the downtown grid
 * lay 29 blocks on it, because a block may only cross onto another body if the
 * generator thinks there is no other body.
 */
export const CITY_BODY_CELL = m(40);

/**
 * Whether the street grid is laid at all.
 *
 * Off. The arterials were ruled straight across the map and the streets were a
 * grid inside each superblock, and between them they were everything that read
 * as drawn on a map rather than grown on the ground (#269). Routing the
 * arterials was tried; the blocks cannot follow a curved one, which is #268.
 *
 * So the map is being rebuilt from the roads that already work - the routed
 * boulevards, the quay, the embankment and the roads between the places - and
 * the grid comes back when there is something to lay that is not a ruler. A
 * switch rather than a deletion because `fillSuperblock` is the only thing that
 * knows how a district turns into blocks, and that will be wanted again.
 */
export const CITY_STREET_GRID = false;

/**
 * Which districts get real local streets and blocks from `city/localstreets.ts`,
 * rather than nothing.
 *
 * Not `CITY_STREET_GRID` turned back on, and not the same mechanism: that flag
 * is the old ruled arterial mesh plus a uniform lattice across the whole map,
 * and it is staying off (see above) rather than being revived. This is a
 * second, newer generator - local streets that branch off a district's own
 * authored major roads (`city/roads.ts`) instead of a synthetic grid, clipped
 * to that district's own plan polygon instead of a global lattice cell - built
 * and judged one district at a time. `waterfront` (Ashford Point) was the
 * pilot, and is off again (#293): its driveways stranded eight houses up to
 * 400 m from a road, and the areas since have been drafted once and edited by
 * hand instead (`npm run suburbdraft`, `housedraft`), which Ashford Point now
 * is too. Kept, empty, because it is the only thing that knows how a district
 * grows blocks off its own roads.
 */
export const CITY_LOCAL_STREETS_KINDS: DistrictKind[] = [];

/**
 * Whether the roads come from `city/roads.ts` rather than from the generator.
 *
 * On. The generator still makes a perfectly good *draft* - routed boulevards, a
 * quay, an embankment, a road to each body of land - and that draft is where
 * these came from. What it cannot do is decide which of them the city wants,
 * and that turned out to be most of the work: seventy-four roads survived out of
 * ninety-eight, thirty were deleted as fragments or duplicates, eight were drawn
 * and twelve moved.
 *
 * Generated-then-edited is the shape that fits here, and it fits because of the
 * *number*. Seventy-four is too many to draw from nothing and few enough to fix
 * by eye. The districts went the same way at ADR-0009 for the same reason.
 *
 * With this off, the generator lays its own roads again and `city/roads.ts` is
 * ignored - which is how a new draft gets made when the plan or the land moves.
 */
export const CITY_AUTHORED_ROADS = true;

/**
 * Cut and fill (#252): how wide a shelf a road cuts, and how far that shelf
 * grades back into the ground either side.
 *
 * The width is the carriageway and its shoulders and no more - this displaces
 * terrain, and terrain displaced further than a road needs is a scar. The blend
 * is what turns the edge of the shelf into a bank rather than a wall; too short
 * and every road in hill country has a kerb of rock beside it.
 *
 * `ROAD_CUT_STEP` is how finely the road is sampled before its profile is
 * computed. Finer than `TERRAIN_CELL`, because the profile is a filter over
 * distance and a filter fed uneven samples has a wobble in it.
 */
export const ROAD_CUT_WIDTH = m(24);
export const ROAD_CUT_BLEND = m(26);
export const ROAD_CUT_STEP = m(8);
/** How many times the grade constraints are relaxed before giving up on them. */
export const ROAD_CUT_RELAX = 400;
/**
 * How far inside the grade cap the earthworks aim.
 *
 * Grading exactly to the limit lands exactly on it, and a surface written to a
 * 10 m grid and read back through bilinear interpolation is not exact: the road
 * that forced cut and fill came out at precisely 13.0% against a 13% cap and
 * failed by a rounding error. Design to a margin, like anything else that has to
 * hold a tolerance after being built.
 */
export const ROAD_CUT_MARGIN = 0.88;




/**
 * Whether the elevated freeway is built.
 *
 * It was switched off with the grid, when it was a rectangle inset from the
 * map bounds - a shape chosen by two numbers and no landscape, and at 21 km the
 * largest and straightest thing in every picture of the city. ADR-0008 rule 6
 * wanted a ring following the ground instead (#261, #265).
 *
 * On again since #371, because nothing about it is chosen by a number any more:
 * the loop and its tunnels were drawn (#261, `city/freeway.ts`), and so were its
 * ramps, as markers joined to the drawn roads by `rampconnectors.ts`. Still a
 * switch, so the generator can be looked at without it.
 */
export const CITY_FREEWAY = true;

/**
 * How far a piece of leftover parkland (#185) will reach for a quarter to belong
 * to before it settles for being parkland.
 *
 * About a superblock and a half. It had no limit at all, which was harmless
 * while the city covered the whole map and became nonsense once the districts
 * were on five bodies of land: country on the far side of a channel took the
 * district of whatever quarter was nearest *across the water*, which put a
 * square kilometre of downtown on the eastern body.
 */
export const PARK_DISTRICT_REACH = m(850);
/** The strip itself. Wide, because a runway is - and because it is the one road in the city that is a straight 2.3 km. */
export const RUNWAY_WIDTH = m(46);
/** How far the taxiway sits off the runway's edge, making the pair a circuit rather than a dead end. */
export const TAXIWAY_OFFSET = m(64);
/** Level ground held either side of the pair, before the blend starts. */
export const RUNWAY_APRON = m(70);
/**
 * The one structure on Marrow Field (#295): a derelict hangar rather than an
 * active building, which is what tells the airfield apart from a working one
 * at a glance.
 *
 * `HANGAR_CLEAR` is measured, not derived from `TAXIWAY_OFFSET`: the taxiway
 * is authored/hand-traced (`CITY_AUTHORED_ROADS`, `city/roads.ts`) rather
 * than laid to `airfieldRoads()`'s exact line, and it wanders up to 113 m
 * from the runway's own centreline - a formula built from the ideal offset
 * put the hangar's block on top of it. 150 m clears that with margin and
 * still lands inside the gentle outer third of `RUNWAY_APRON`'s blend rather
 * than its flat plateau, which is not a cliff to build a foundation on.
 */
export const HANGAR_WIDTH = m(55);
export const HANGAR_DEPTH = m(35);
export const HANGAR_HEIGHT = m(11);
export const HANGAR_CLEAR = m(150);
/**
 * Halloway Quarry, a working one: the opposite call from Marrow Field's
 * disused airfield, so the two places do not read as the same place twice.
 *
 * `QUARRY_DIRT_REACH` is how far out, as a multiple of the place's radius, a
 * road counts as the quarry's own. Measured on `CITY_SEED`: the haul road and
 * the rim road end 701 m from the centre (1.17 x the 600 m radius), and the
 * next thing that is not the access road is past 850 m, so 1.2 sits in the gap.
 * The access road itself is found by `markDirtAccess` rather than by reach, for
 * the reason `markAirfieldDirt` says.
 *
 * The plant stands on the pit floor - the one place the haul road goes to -
 * and the yard on the rim beside the road in. `QUARRY_YARD_CLEAR` is the
 * clearance the yard's ground has to have from every road, measured against the
 * real hand-traced network rather than derived, for the reason `HANGAR_CLEAR`
 * gives.
 */
export const QUARRY_DIRT_REACH = 1.2;
export const QUARRY_PLANT_WIDTH = m(46);
export const QUARRY_PLANT_DEPTH = m(28);
export const QUARRY_PLANT_HEIGHT = m(26);
export const QUARRY_YARD_CLEAR = m(40);
/**
 * Settling ponds on the pit floor and the first bench (#329), from the
 * reference photographs of active quarries: standing water between the
 * workings and the haul road.
 *
 * Measured, not derived: found by searching the real generated city for ground
 * that is level, dry and clear of every road, building and placed prop, for the
 * reason `HANGAR_CLEAR` gives. One on the floor, three on the bench to the
 * west. `x`, `z` and `r` are metres from the map's origin. They are additions
 * to the finished city, so nothing is routed round them by accident: keeping
 * clear of them is the layout's job, and a test says it did.
 */
export const QUARRY_PONDS = [
  { x: -2724, z: -898, r: 18 },
  { x: -2850, z: -790, r: 18 },
  { x: -2826, z: -904, r: 22 },
  { x: -2814, z: -700, r: 18 },
].map((p) => ({ at: { x: m(p.x), z: m(p.z) }, radius: m(p.r) }));
/** How far a pond's surface sits above the ground under it, so the two do not fight for depth. */
export const POND_LIFT = m(0.12);
/**
 * The quarry's haul trucks (#330): a few of them, running the haul road and the
 * rim road all day, much bigger and slower than a car.
 *
 * The model is drawn `HAUL_TRUCK_GROWN` times its real size, about 9.6 m by
 * 15 m, and that box is what a car hits (`TRUCK_HALF_WIDTH`,
 * `TRUCK_HALF_LENGTH`); `TRUCK_RADIUS`, the circle round its middle, keeps
 * trucks apart. `TRUCK_GAP` is how far behind another truck
 * one holds, wide enough that a truck's own length is not the gap. A hit is a
 * wall rather than a shunt: it costs the car `TRUCK_HURT` times what the same
 * closing speed costs against a civilian car, and nearly all its speed
 * (`TRUCK_SPEED_KEPT`), while the truck itself takes nothing from it.
 */
export const TRUCK_COUNT = 4;
export const TRUCK_SPEED = kmh(30);
/**
 * How much bigger than its 6.4 m by 10 m model a haul truck is drawn, parked or
 * driving. It was 2.5 (#323), 16 m by 25 m, which made the machinery read as
 * machinery and made an oncoming truck on the Halloway Drop's 20 m spiral
 * impossible to pass on a bend: every driver tier wrecked on one. 1.5 is about
 * the width of a real one, and two of them meet on the haul road in their own
 * lanes (`TRUCK_LANE`) with nothing between them.
 */
export const HAUL_TRUCK_GROWN = 1.5;
export const TRUCK_RADIUS = m(6);
/**
 * The truck's body, half its width and half its length: what a car actually
 * hits. `TRUCK_RADIUS` is the circle round it, which is right for keeping
 * trucks apart and wrong for a car going past one, which it would hit a metre
 * and more out from the truck's side.
 */
export const TRUCK_HALF_WIDTH = m(3.2 * HAUL_TRUCK_GROWN);
export const TRUCK_HALF_LENGTH = m(5 * HAUL_TRUCK_GROWN);
/**
 * How far off the centre line a truck drives. Not `TRAFFIC_LANE`: a car's lane
 * is 3 m out, and two trucks meeting there overlapped by four metres. Half a
 * truck and a little more puts two side by side on the 20 m haul road with
 * 0.4 m between them and both still on the gravel.
 */
export const TRUCK_LANE = m(5);
export const TRUCK_GAP = m(70);
export const TRUCK_HURT = 3;
export const TRUCK_SPEED_KEPT = 0.15;
/**
 * Marrow Field's perimeter fence (#295): a line, not a wall around the whole
 * 700 m place radius - the field is the runway and the taxiway, so the fence
 * is drawn off *their* extent rather than off `PlanPlace.radius`, which would
 * put it far out over open ground the airfield never used.
 *
 * `FENCE_MARGIN` clears the taxiway loop; `FENCE_END_MARGIN` gives the strip
 * the same clearance past each runway end, where a real perimeter road runs
 * behind the overrun.
 */
export const FENCE_MARGIN = m(24);
export const FENCE_END_MARGIN = m(50);
export const FENCE_POST_SPACING = m(9);
export const FENCE_HEIGHT = m(1.9);
/**
 * How often the perimeter breaks, and for how long, once every
 * `FENCE_POST_SPACING` is offered the choice (#295: "breached... rather
 * than intact"). A run rather than a single missing post, because one gap in
 * a fence reads as a rendering error and a run of them reads as a fence
 * nobody has mended.
 */
export const FENCE_BREACH_CHANCE = 0.03;
export const FENCE_BREACH_MIN = 3;
export const FENCE_BREACH_SPAN = 5;
/** Weeds through the tarmac's seams (#295), scattered along the dirt strip. */
export const WEED_SPACING = m(14);
export const WEED_HEIGHT = m(0.5);
/**
 * How deep the quarry cuts below the ground it is in, and the height of one
 * bench.
 *
 * Benched rather than smooth: the floor is quantised to `QUARRY_BENCH`, so the
 * walls come out as terraces. That is what makes it read as worked ground rather
 * than as a crater, and it is where the road down gets its switchbacks.
 *
 * `QUARRY_FLOOR` is the hard bottom. Below sea level the pit would be a dry hole
 * under the sea - the water is a field and knows nothing about height - which
 * reads as a bug in the terrain rather than as a quarry.
 */
export const QUARRY_DEPTH = m(52);
export const QUARRY_BENCH = m(11);
export const QUARRY_FLOOR = m(6);
/**
 * The haul road down into the pit.
 *
 * `QUARRY_RAMP_TURNS` is what makes it drivable at all. The depth is fixed, so
 * the grade is the drop per turn over the length of that turn: 52 m in 1.75
 * turns of a bowl this size is already gentle on paper, and three turns puts it
 * near 1%. The road was never steep because of its *plan* - it was steep because
 * it crossed the benches, and an 11 m bench edge is a cliff whatever route you
 * take over it.
 *
 * So the ramp is **cut into the wall**: the terrain is displaced along the
 * spiral to meet the road, which is what a haul road is and the first piece of
 * cut and fill in the generator (#252 in miniature). `QUARRY_HAUL_WIDTH` is the
 * shelf it runs on and `QUARRY_HAUL_BLEND` is how far that shelf grades back
 * into the benches either side.
 */
export const QUARRY_RAMP_TURNS = 3;
export const QUARRY_HAUL_WIDTH = m(26);
export const QUARRY_HAUL_BLEND = m(34);
/** The wharf apron: level ground beside deep water, and the piers off it. */
export const DOCK_LEVEL = m(5);
export const DOCK_APRON = m(300);
export const DOCK_PIERS = 6;
export const DOCK_PIER_LENGTH = m(190);

export const CITY_LOBES = 5;
export const CITY_CHANNELS = 2;
export const CITY_LAND_LEVEL = 0.46;
export const CITY_LOBE_SPREAD = 0.8;
/**
 * How far back from the water the middle of downtown sits.
 *
 * The walk goes all the way to the shore and then steps back by this, so the
 * city is *on* the coast with a few hundred metres of quay and waterfront in
 * front of it rather than in the surf. This used to be a fraction of the lobe's
 * radius and a cap on the walk, which stopped it before it ever reached the sea
 * - the town came out 1.65 km inland.
 */
export const CITY_TOWN_INLAND = m(400);
/** How far off due south the town may sit, in radians. */
export const CITY_TOWN_SPREAD = 0.7;
/**
 * How wide a band of sea is kept at the map's edge, as a fraction of its width.
 * Land reaching the border has a coastline that never closes, and it puts the
 * cliff back that ADR-0008 removed.
 */
export const CITY_SEA_EDGE = 0.05;
/** Smaller than this and a body of land is scenery, not somewhere to build a road to. */
export const CITY_MIN_BODY = m(700) * m(700);

/**
 * How finely a routed road searches, and how hard its staircase is smoothed
 * (ADR-0008 rule 2).
 *
 * Fifty metres is a third of a block: fine enough that a road can find a way
 * round a hill, coarse enough that the whole map is thirty thousand nodes and a
 * search over it costs about as much as one more pass of the block sweeps.
 */
export const ROUTE_CELL = m(50);
export const ROUTE_SMOOTHING = 3;

/**
 * What each class of road will put up with (ADR-0008 rule 2).
 *
 * `cap` is the steepest grade it takes, `climb` how hard it prices gradient
 * against that cap, `water` what a metre of water costs as a multiple of a
 * metre of road, and `shore`/`shyness` how close to the waterline it is willing
 * to run and how much it minds.
 *
 * The shore terms are the ones nobody expects to need. The coast is the
 * flattest ground on the map, because the land ramps up out of the water, so a
 * router that prices only gradient pins every road to the beach - the first
 * freeway routed this way ran round the whole island at the waterline. Being
 * shy of the shore is what pushes it inland into the hills, where the corners
 * are.
 *
 * `water` prices a crossing rather than choosing one. High enough that going
 * round is usually cheaper, low enough that a short crossing beats a long
 * detour: the path then finds the narrows on its own.
 */
export const ROUTE_FREEWAY = { cap: 0.06, water: 30, climb: 26, shore: m(700), shyness: 2.2 };
export const ROUTE_ARTERIAL = { cap: 0.1, water: 55, climb: 16, shore: m(250), shyness: 0.8 };
export const ROUTE_COUNTRY = { cap: 0.13, water: 120, climb: 9, shore: m(900), shyness: 3 };
export const CITY_COAST_RIPPLE = 0.17;
/**
 * The last three are **fractions of the map's width**, not metres, because they
 * are shape and shape does not have a size.
 *
 * They were metres, tuned when the map was 5 x 4 km, and doubling the map to
 * 10 x 8 (ADR-0007 rule 3) quietly changed the shape rather than the scale: the
 * coast rippled twice as often across the island, and a 150 m strait stopped
 * severing a landmass twice as big, so three bodies of land became one blob
 * with an inlet. A ratio survives a change of size; a measurement does not.
 */
export const CITY_COAST_SCALE = 0.52;
export const CITY_CHANNEL_CUT = 0.9;
export const CITY_CHANNEL_WIDTH = 0.02;
export const CITY_CHANNEL_BOW = 0.07;

export const CITY_RIVER_WIDTH = m(160); // at its narrowest, upstream
export const CITY_RIVER_MOUTH = 1.7; // how much wider it is where it meets the bay
export const CITY_RIVER_WANDER = m(600); // how far the channel meanders off its mouth

/**
 * The roads that follow the water (#241).
 *
 * `EMBANKMENT_SETBACK` is how far inland the carriageway sits from the edge:
 * far enough that there is a strip of ground between the road and the drop -
 * a quay, which #185's parkland then fills - and near enough that the road
 * still reads as belonging to the water rather than as one more street that
 * happens to run parallel to it.
 *
 * `EMBANKMENT_STEP` is how often the curve is sampled. The bank is a pair of
 * sines, so this is the same trade the boulevards make: short enough to read
 * as a sweep, long enough that a 5 km coast is not ten thousand road segments.
 */
export const EMBANKMENT_SETBACK = m(30);
export const EMBANKMENT_STEP = m(90);
/**
 * Relief (ADR-0007). The ground stops being a plane at zero.
 *
 * `TERRAIN_RELIEF` is how tall a hill gets, and it is measured off the thing
 * this city is shaped after rather than picked. The reference city's stated
 * influences are Boston and Pittsburgh; in Pittsburgh the Duquesne Incline
 * climbs the Mount Washington bluff 122 m at thirty degrees, over a downtown
 * sitting on the river. Thirty degrees is 58%, which is why it is a funicular
 * and not a street - and what that city does instead is drive *through* the
 * hill. So: 120 m, and the grade caps do not move to accommodate it. Taller
 * hills against the same caps mean more of the map is too steep for a street,
 * which is the point - that is where the tunnels and the cuttings come from.
 *
 * It read 60 m first, chosen so that a hill was exactly climbable at an
 * arterial's 6% over a kilometre. That is a defensible number and it made a
 * landscape nobody would drive to look at (ADR-0008).
 *
 * `TERRAIN_CELL` is how finely the height field is stored. Ten metres is a
 * quarter of a block and half a carriageway: fine enough that a cutting has an
 * edge, coarse enough that the whole map is 500 x 400 floats.
 *
 * `TERRAIN_SHORE` is how far inland the land takes to reach its full height,
 * and it **scales with the relief**: it is the single biggest lever on how steep
 * the map is, because the shore ramp is a slope the whole length of the coast.
 * At 260 m against 60 m of relief the maximum grade on the map was 47%; at
 * 700 m it was 21%. Doubling the relief to 120 m (ADR-0008) doubled it again,
 * or the coast would be steeper than a street is allowed to be - which is the
 * opposite of the gentle coast it exists to make. Without it entirely, the coast
 * is a cliff wherever the noise happens to be high and #241's quay is a shelf a
 * hundred metres above the water it is beside.
 *
 * `TERRAIN_CORE_FLAT` and `TERRAIN_CORE_RADIUS` keep the middle of the map
 * flat: the dense grid is there, every metre of relief under it is cut and fill
 * somebody has to pay for, and a city in a bowl with hills round the rim is the
 * shape the genre uses.
 *
 * `TERRAIN_SEABED` is how far below the surface the bed of the water sits, so
 * the water has something under it rather than a hole in the mesh.
 *
 * `TERRAIN_STREAM` makes the landscape its own random stream. Drawing the hills
 * from the city's `Rng` would shift every number after them and reshuffle
 * streets that have nothing to do with the terrain, which would make "change
 * the hills" and "change the city" the same act.
 */
export const TERRAIN_RELIEF = m(120);
/**
 * The smallest piece of ground the road network can enclose and have it mean
 * something (#268).
 *
 * Below this a face is the sliver between two roads that nearly touch rather
 * than a block: the network is a chain of thirty-metre pieces and any two of
 * them that cross at a shallow angle leave a triangle. About a tenth of the
 * smallest block the city has ever had.
 */
export const FACE_MIN_AREA = m(60) * m(60);
/**
 * How far a local street may lean off the axis the face's own shape chose, in
 * radians.
 *
 * Small on purpose. The split is chosen by the shape of the ground being split,
 * which is what makes the result read as grown; the jitter only stops the
 * splits stacking into a perfect binary tree. More than this and the streets
 * read as noise rather than as streets.
 */
export const FACE_SPLIT_JITTER = 0.14;

export const TERRAIN_CELL = m(10);

/**
 * How finely the renderer draws the landscape (#254).
 *
 * Half a road's shelf, so the shelf exists in the drawn ground.
 *
 * It was 40 m, on the reasoning that a landscape is read at hundreds of metres.
 * That is true of a landscape and false of the things cut into it: a road's
 * shelf is `ROAD_CUT_WIDTH` wide, 24 m, so a 40 m mesh cannot see it at all.
 * Measured across nine thousand off-road points, the mean disagreement was 9 cm
 * and the worst was **15 m** - and the worst is what a player feels, because it
 * is exactly where the road is. Driving off a carriageway dropped the car into
 * the unshelved hillside the shelf had been cut out of.
 *
 * `TERRAIN_CELL` itself - 10 m, which would make the drawn ground and the ground
 * the car stands on the same surface rather than two approximations of one - is
 * eight hundred thousand vertices in one mesh, and the headless renderer times
 * out building it. 20 m is two hundred thousand, resolves a 24 m shelf, and
 * takes the worst disagreement from 15 m to something a car does not fall into.
 */
export const TERRAIN_RENDER_STEP = m(20);
export const TERRAIN_SHORE = m(1400);
/**
 * How far the land takes to climb out of *inland* water - a channel or the
 * river - as against the sea. A tenth of the shore ramp, because a strait cut
 * through a landmass has sides and a coast has beaches, and because a river
 * ramping as gently as the sea flattens the whole interior of an island.
 */
export const TERRAIN_BANK = m(140);
export const TERRAIN_CORE_FLAT = 0.8;
/** As a fraction of the town's own radius, so the basin is the city's and not the map's. */
export const TERRAIN_CORE_RADIUS = 0.85;
/** How much taller the rim is than the noise alone would make it. */
export const TERRAIN_RIM_LIFT = 0.9;
export const TERRAIN_SEABED = m(6);
export const TERRAIN_STREAM = 0x7e44a1;
/**
 * How many box-blur passes take the creases out of the height field. The shore
 * ramp is a function of a chamfer distance transform, and a chamfer transform
 * has a ridge down the middle of every strip of land where the fields from two
 * coasts meet; the ramp turns that into a straight crease. Only the artefact is
 * sharp, so blurring costs nothing real.
 */
export const TERRAIN_SOFTEN = 14;
/**
 * The height field's noise: how big the largest feature is, how many octaves
 * sit on top of it, and how big the lattice each is drawn from is.
 *
 * `TERRAIN_FEATURE` is the wavelength of the first octave and therefore the
 * size of a hill: 1200 m across the base is a hill you drive over the shoulder
 * of rather than one you drive round, at a map scale of five kilometres.
 */
export const TERRAIN_FEATURE = m(2000);
export const TERRAIN_LATTICE = 64;
export const TERRAIN_OCTAVES = 4;

/** How finely water outlines are sampled. */
export const CITY_WATER_STEP = m(40);
/** How far the sea is drawn beyond the map edge, so the bay reaches the horizon. */
export const CITY_SEA_MARGIN = m(2500);

/**
 * Crossings (ADR-0005, rule 2). Few, and deliberate: a city where half the
 * roads bridge the river has no chokepoints in it. Generation adds more only
 * if the network would otherwise come apart.
 *
 * `CITY_BRIDGES` is a cap and not a target, and for a long time it was not even
 * that: it read 4, every seed built two or three, and the constant that was
 * actually deciding was the spacing - eleven candidate gaps, eight of them
 * rejected for being near one already taken. Read the spacing as the number
 * that shapes the river and this as the ceiling over it.
 *
 * The quantity that matters is not how many crossings there are but how far you
 * are from one, and three across a 3.3 km river left a 2.7 km round trip at the
 * worst point of some seeds. Measured over fourteen seeds after #247, the
 * furthest any stretch of river sits from a bridge is 480-1010 m, median 200-360
 * m, on 3-5 bridges. The cap has not bound in any seed tried; it is there so a
 * map with a hundred narrow candidates cannot quietly become a city with a
 * hundred crossings.
 */
export const CITY_BRIDGES = 6;
/**
 * The longest gap a bridge will span. Wider than this and the road dead-ends.
 *
 * Not a lever worth pulling: raised to 1000 m as an experiment and *nothing
 * changed on any seed*, because no candidate gap falls between 654 m and a
 * kilometre. What limits the crossings is which arterials happen to meet the
 * river, not how wide it is where they do.
 */
export const CITY_MAX_BRIDGE = m(700);

/**
 * The lowest a surface road sits: this far above the water, whatever the
 * ground under it does.
 *
 * The terrain goes below sea level before `inWater` says the water has begun -
 * the shore ramps down to the bed - and the renderer draws the water over any
 * ground under zero. A road node took the ground's height, so every road ending
 * at a bank ended under the water, and a bridge, which is a straight run
 * between two such ends, was a road along the river bed: all seven bridges had
 * their decks 0.8 m to 2.7 m under the surface. Cars drove along it looking as
 * though they were on the water, and the deck drawn above them was nowhere any
 * car was. A road over low ground is a causeway instead.
 */
export const ROAD_ABOVE_WATER = m(0.5);

/**
 * The height the open sea is drawn at, under the whole map (#403).
 *
 * Wherever the ground is lower than this, what shows is the sea, whatever
 * `inWater` says: the terrain ramps below sea level along the coast before the
 * water's own outline begins, so a strip of the map is land to the water test
 * and sea to the eye. A car off the road there drove along under the drawn
 * surface. The sim reads the same number the renderer draws at, so the two
 * cannot disagree about where the sea is.
 */
export const SEA_SHEET = m(-1.5);
/**
 * Bridges are kept this far apart, so they are separate decisions to make.
 *
 * This is the constant that decides how many crossings a city gets. At 1200 m
 * it allowed three on a river four kilometres long; at 800 m it allows four or
 * five, which is enough that being on the wrong bank is a detour rather than a
 * journey, and still far enough that each one is a place a pursuit can be
 * waiting for you. Below about 600 m they stop being chokepoints and start
 * being a choice of chokepoints, which is not the same thing.
 */
export const CITY_BRIDGE_SPACING = m(800);
/** Sampling resolution when clipping a road against water. */
export const CITY_CLIP_STEP = m(15);
/** A stretch of road shorter than this is a stub, not a street. */
export const CITY_MIN_STREET = m(70);

/**
 * What each district is like to drive through, and a design document as much as
 * it is code. Block size and its variation do most of the work.
 *
 * **What three of the five mean changed with the authored plan** (#271,
 * ADR-0009). The old table described a city that was downtown in the middle,
 * docks on the water and sheds at the edge, at whatever size the radii happened
 * to produce.
 *
 * - **Downtown is small.** 1.5 km² of the map, and the only place with a tight
 *   regular grid on it. It was a third of the city.
 * - **Midtown is suburban** and is most of the built-up extent: bigger blocks,
 *   curving streets, low buildings. Three separate areas of it.
 * - **The waterfront is affluent**, not the port. Few roads, well spaced, large
 *   lots, deep setbacks and a lot of open ground. This is a reassignment rather
 *   than a tweak: it used to be 170 x 190 m blocks of sheds growing round a
 *   harbour, and the port is a *place* on island E now rather than a street
 *   pattern.
 * - **Industrial is unchanged**, and is the only one of the five that is.
 * - **Park is new.** It has no streets of its own worth the name - what it has
 *   is the road through it - so the blocks are enormous and almost everything is
 *   skipped. The hill park is 41% too steep for a street to climb, and what is
 *   left is the road up. Its streets are the drawn paths through Highmoor's
 *   woods (#460), and they are two lanes: one lane at this scale is 4.9 m, a
 *   hair wider than the car, and a path you cannot drive is not a way through.
 */
export const DISTRICTS: Record<DistrictKind, DistrictCharacter> = {
  downtown: { blockX: m(80), blockZ: m(80), jitter: 0.08, skip: 0.03, lanes: 2, speed: kmh(50), winding: 1 },
  midtown: { blockX: m(165), blockZ: m(145), jitter: 0.3, skip: 0.22, lanes: 2, speed: kmh(60), winding: 1 },
  waterfront: { blockX: m(280), blockZ: m(300), jitter: 0.34, skip: 0.5, lanes: 2, speed: kmh(60), winding: 1 },
  industrial: { blockX: m(250), blockZ: m(230), jitter: 0.18, skip: 0.3, lanes: 2, speed: kmh(70), winding: 1 },
  park: { blockX: m(420), blockZ: m(400), jitter: 0.35, skip: 0.8, lanes: 2, speed: kmh(50), winding: 1 },
};

/**
 * How much superblocks vary in how built up they are (#115). The point is
 * variation *between* places: a city thinned evenly everywhere is just a
 * smaller city, where a sparse quarter beside a dense one is two places.
 */
export const DENSITY_RANGE = 0.55;
/** Chance a whole block is left open - a park, a yard, a lot - at density 1. */
export const OPEN_BLOCK_CHANCE = 0.12;

/**
 * How far a winding street bows off the straight line it would otherwise have
 * been, as a fraction of the block size beside it. Kept under half a block, or
 * neighbouring streets bend into each other.
 */
export const WINDING_BOW = 0.42;
/** How finely a winding street is sampled into segments. */
export const WINDING_STEP = m(55);

/**
 * What stands on the blocks (#84). Heights are skewed low - most of a city is
 * not its tallest building - so `landmark` is what puts the occasional tower
 * above its neighbours and gives the skyline a shape.
 */
export const BUILDINGS: Record<DistrictKind, BuildingCharacter> = {
  downtown: { lot: m(38), setback: m(3), minHeight: m(28), maxHeight: m(115), empty: 0.07, landmark: 0.07, kind: 'tower' },
  midtown: { lot: m(38), setback: m(5), minHeight: m(10), maxHeight: m(34), empty: 0.2, landmark: 0.03, kind: 'block' },
  // `empty` used to thin a dense multi-lot block, where missing on one sub-lot
  // still leaves several others - Ashford Point's own lots (#268) are sized to
  // `divideLots` into exactly one sub-lot each, so this is now "how often a
  // driveway's own lot has no house on it at all", which wants to be rare: the
  // organic gaps between houses already come from where a driveway was placed
  // (`ASHFORD_LOT_SKIP`), not from a committed driveway leading to nothing.
  // The setback is most of the work here: `ASHFORD_LOT_SIDE` (95 m) inset by
  // only 16 m left a 63 m footprint standing right at spawn - a single house
  // reading as a warehouse. A big lot with a modest house and a lawn around
  // it is the point of "large lots"; a lot that is mostly house is not.
  waterfront: { lot: m(76), setback: m(28), minHeight: m(6), maxHeight: m(13), empty: 0.08, landmark: 0, kind: 'mansion' },
  industrial: { lot: m(72), setback: m(10), minHeight: m(6), maxHeight: m(18), empty: 0.36, landmark: 0.02, kind: 'shed' },
  park: { lot: m(90), setback: m(20), minHeight: m(4), maxHeight: m(9), empty: 0.93, landmark: 0, kind: 'shed' },
};
/** How much taller a landmark stands than the district's ordinary ceiling. */
export const BUILDING_LANDMARK_MULT = 1.9;
/** A lot smaller than this is a gap between buildings, not a plot. */
export const BUILDING_MIN_LOT = m(14);

/**
 * Ashford Point (issue #268): not a district of blocks at all, but houses on
 * their own driveways off the district's own major roads - the shape a real
 * low-density island reads as (a single road, a scatter of private lots off
 * it, and mostly nothing between them), not a city grid at a lower density.
 * A block-and-grid version of "large lots, well spaced" is still a grid.
 */
export const ASHFORD_LOT_SPACING = m(110);
/** How unevenly spaced the driveways are - real gaps, not a ruler. */
export const ASHFORD_LOT_JITTER = 0.45;
/** A candidate driveway position dropped anyway, for real gaps between houses. */
export const ASHFORD_LOT_SKIP = 0.3;
export const ASHFORD_DRIVE_MIN = m(25);
export const ASHFORD_DRIVE_MAX = m(70);
/** A house's own lot, square, centred on the driveway's end. */
export const ASHFORD_LOT_SIDE = m(95);
/** Never closer than this to another lot's own centre. */
export const ASHFORD_LOT_GAP = m(85);

/**
 * The village centre: a shrunk, denser cluster near wherever the district's
 * own road reaches this body of land from the rest of the city - the first
 * ground a bridge lands on is where a small centre reads as itself, not the
 * empty interior.
 */
export const ASHFORD_VILLAGE_RADIUS = m(380);
export const ASHFORD_VILLAGE_SPACING = m(42);
export const ASHFORD_VILLAGE_LOT_SIDE = m(55);
export const ASHFORD_VILLAGE_LOT_GAP = m(45);

/**
 * A handful of roads reaching off the coastal loop into the interior, so the
 * island is a driveable network rather than a ring with nothing inside it -
 * a lap needs somewhere to go, and a house needs some of them to open onto
 * besides the loop itself. Grown before any house is placed, and each new
 * branch reaches for whichever point of the network - the loop, or an
 * earlier branch - is already nearest, which is what gives the result its
 * fork rather than every branch running back to the coast individually.
 */
export const ASHFORD_INTERIOR_COUNT = 9;
/** Never closer than this to another interior branch's own target, or to the loop. */
export const ASHFORD_INTERIOR_SPACING = m(340);

/** Street furniture (#84), placed along the generated streets. */
export const LAMP_SPACING = m(32);
/**
 * How far a lamp's arm reaches out over the carriageway.
 *
 * Short of a full lane: the arm overhangs the kerb and the first metre of
 * road, which is what a street lamp does, without a lamp head hanging over
 * the middle of a two-lane street.
 */
export const LAMP_REACH = 2.2 * UNITS_PER_METRE;
/** How wide the pool of light under a lamp is at night (#180). */
export const LAMP_GLOW = 10 * UNITS_PER_METRE;
export const LAMP_KERB_GAP = m(1.2);
export const SIGN_KERB_GAP = m(1.6);
export const BARRIER_SPACING = m(6);
/**
 * How far past the end of a road to look for water before railing it off.
 *
 * A road clipped by the river ends a few metres from the bank - measured, a
 * median of 4 m - so this only has to reach far enough to tell "the water
 * stopped this road" from "this street just ends" (#241). Too far and every
 * cul-de-sac within sight of the bay grows a parapet it has no reason for.
 */
export const WATER_END_REACH = m(40);
/**
 * Headroom under the interstate: how far below the deck a building must stop.
 *
 * The deck sits at 12 m and the *median* building in Kestrel Bay is 21 m, so
 * without this the freeway runs straight through them - measured, 197 of the
 * 255 places it crosses a footprint had the building standing above the road
 * surface, the worst by 105 m.
 *
 * A building under a viaduct is a low one, so they are held under it rather
 * than swept out of the way: an elevated road over a city ought to have
 * something beneath it. Anything with too little room to fit is dropped, and
 * the ground it leaves becomes parkland like any other empty land (#185).
 */
export const DECK_HEADROOM = m(3);
/** Below this a capped building is a slab, not a building. Drop it instead. */
export const DECK_MIN_BUILDING = m(5);
export const LAMP_HEIGHT = m(8);
export const SIGN_HEIGHT = m(2.6);
export const BARRIER_HEIGHT = m(1.1);

/**
 * The elevated interstate (#85, ADR-0005 rule 5). A circuit rather than a
 * through route, so joining it is a decision: on the loop you go faster but
 * you can only leave it where there is a ramp.
 *
 * It has its own alignment, deliberately not on top of an arterial, so it
 * crosses the surface streets instead of shadowing them. Every one of those
 * crossings is an overpass, which is the case ADR-0004 exists to make possible.
 */
/**
 * How far in from the map's edges the loop sits.
 *
 * Wider, so the freeway is a ring round the city rather than a rectangle drawn
 * across the middle of it. It is still a rectangle, which is the thing actually
 * wrong with it: ADR-0008 rule 6 wants a ring round the whole city and a beltway
 * round downtown, and both of those are shapes that follow the land (#261,
 * #265). Stripping it back is not the same as fixing it.
 */
export const INTERSTATE_INSET = 0.16; // of the map, in from each edge
export const INTERSTATE_HEIGHT = m(12);
export const INTERSTATE_LANES = 6;
export const INTERSTATE_SPEED = kmh(140);
/** How often a pair of support pillars goes under the deck. */
export const INTERSTATE_PILLAR_SPACING = m(45);
/** A pillar's side: square, and as solid as a wall (#487). */
export const PILLAR_WIDTH = m(2.2);
/** How far in from the deck's edge a pillar stands. */
export const PILLAR_INSET = m(1.5);
/**
 * How far a pillar keeps from a road's kerb (#487). Solid pillars on a
 * street passing under the deck would be a wall across it, so one that would
 * stand closer than this is left out and the deck spans the gap.
 */
export const PILLAR_CLEAR = m(1.5);
/** Lower than this the deck is diving into a tunnel, and needs nothing under it. */
export const PILLAR_MIN_HEIGHT = m(2.2);
/** Deck resolution: short enough that a slope reads as a slope. */
export const INTERSTATE_SEGMENT = m(60);

/**
 * Freeway spurs (#115). The loop on its own is a circuit and nothing else, so
 * every long fast line in the city is the same line. Spurs run off it to the
 * map edges, which gives the network ends as well as a middle - and an end is
 * somewhere a pursuit can be pushed towards.
 *
 * **None, while the loop is authored** (#371). They were rolled, not drawn:
 * three straight decks at a flat 12 m in random directions from the loop to
 * the coast, with no ramps and a dead end at the shore. Switched on against
 * the authored map, one ran through Halloway Quarry with a tree's canopy up
 * through its deck and 20 m of hillside over it a little further on, and none
 * had ever been seen in the freeway editor, which only shows the loop. A spur
 * worth having is one somebody drew; the mechanism stays for when one is.
 */
export const FREEWAY_SPURS = 0;
/** A spur leaves the loop at a corner-ish point and heads for the nearest edge. */
export const FREEWAY_SPUR_MIN = m(700);

/**
 * Ramps: the only way between the levels.
 *
 * Two a side gave seven over a 12.7 km loop - one roughly every two
 * kilometres, which is sparse enough that a playtest never found one. Four a
 * side is one about every kilometre, which is what a ring road actually has
 * and few enough that the interstate is still a decision rather than a
 * shortcut you fall onto.
 *
 * The other half of "I never saw a ramp" was the map: the full map skipped
 * them entirely, so the interstate was drawn as a purple loop with no visible
 * way onto it.
 */
/**
 * Ramps per side of the loop.
 *
 * Two rather than four, with the street grid off: sixteen exits onto a road
 * network of a few dozen routed roads is a junction every few hundred metres of
 * freeway, which is what made the loop read as a piece of infrastructure laid
 * over the map rather than through it. An exit is worth something when there is
 * a reason to take it.
 */
export const RAMP_COUNT_PER_SIDE = 2;
export const RAMP_MIN_RUN = m(190);
export const RAMP_MAX_RUN = m(320);
/**
 * How far a ramp's foot is set aside from the junction it serves (#212).
 *
 * Zero was the old behaviour and it was the bug. A ramp descends to a surface
 * junction, and with no offset that descent runs *down an existing street* -
 * the interstate is axis-aligned, so is the grid, so the perpendicular between
 * them is a street. Two roads sharing one footprint is a place the car cannot
 * choose between: `surfaceAt` takes whichever road is nearest the height the
 * car is at, the street underneath is always flat and the ramp is always
 * rising, so the flat one won every step. The car drove the full length of its
 * own on-ramp at ground level - 11 of 13 ramps could not be climbed at all.
 *
 * Set aside by more than half a street plus half a ramp, the two carriageways
 * are adjacent instead of coincident and the question stops being ambiguous.
 * A short spur joins the foot back to the junction, which is what an on-ramp
 * looks like anyway: you turn off the street onto it.
 */
export const RAMP_OFFSET = m(14);
/**
 * The least angle an authored ramp's connector may leave its foot at, measured
 * from the ramp itself (#371).
 *
 * The connector runs from the foot to the nearest vertex of a drawn road, and
 * nearest is sometimes almost straight back under the ramp: two of the first
 * seven left at 18 and 21 degrees. That is #212's shared footprint again in a
 * new place, a flat road and a rising one side by side for their first fifty
 * metres. Thirty re-picks those two and leaves every other connector on the
 * vertex it had; sixty was tried and threw out the 45- and 57-degree ones as
 * well, sending one of them 1.1 km across the water instead.
 */
export const RAMP_CONNECTOR_ANGLE = Math.PI / 6;
/**
 * How much room a ramp needs cleared of blocks where it is still low enough to
 * hit (#212).
 *
 * `hitsBuilding` treats blocks as solid below `CAR_RADIUS * 2`, which is right
 * for a 12 m deck flying over rooftops and wrong for the first stretch of a
 * ramp: a car climbing at 2 m is walled in by anything the ramp passes over.
 * Blocks make way, the way they already do for a boulevard.
 */
export const RAMP_CLEARANCE = m(6);
export const RAMP_LANES = 2;
export const RAMP_SPEED = kmh(70);

/** One or more stretches of the loop dive instead of climbing, which is a tunnel. */
export const TUNNEL_DEPTH = m(9);
/**
 * How long one tunnel stretch is, absolute rather than a fraction of the
 * loop's own perimeter.
 *
 * It was a fraction - 12% of whatever the loop came out to be - while the
 * loop was a computed rectangle of a known size. #261 made it an authored
 * path instead, and a hand-drawn loop's length is not the generator's to
 * plan a fraction of: the same 12% is 400 m on a tight loop and several
 * kilometres on a wide one. A tunnel under a kilometre reads as a dive under
 * one obstacle; a several-kilometre one reads as a second road.
 */
export const TUNNEL_LENGTH = m(700);
/**
 * How many separate tunnel stretches the loop gets, spread round it rather
 * than one long dive. A loop that goes through real hills crosses low ground
 * more than once, and one short dive under each reads as the terrain doing
 * that; a single long one reads as a decision to go underground once and
 * stay there.
 */
export const TUNNEL_COUNT = 2;
/** How far apart two tunnels have to start, so they read as separate dives rather than one interrupted by a sliver of daylight. */
export const TUNNEL_SPACING = m(3000);
/**
 * How many places to try before settling for the driest (#244).
 *
 * The tunnel's mouths have to be on land, and where they land is a roll of the
 * dice against a coastline nobody drew on purpose. Enough tries that a seed
 * with one awkward quarter still finds a clean stretch; few enough that
 * generation is not measurably slower for it.
 */
export const TUNNEL_TRIES = 24;
/**
 * Run needed to get between the two levels, so the grade stays drivable.
 *
 * Sized for the *steepest* point rather than the average: the transition eases
 * in and out on a cosine, which is about 57% steeper in the middle than a
 * straight line over the same run. At 430 m a 21 m dive peaks near 8%, which
 * is a steep road rather than a wall.
 */
export const GRADE_RUN = m(430);

/** Driving in the city (#113). */
/** Spatial index cell. About a block: big enough to be cheap, small enough to be selective. */
export const CITY_GRID_CELL = m(120);
/** The car's collision radius, from its centre. */
export const CAR_RADIUS = m(2.2);
/**
 * How tall the car is, from its wheels. Only matters for what it can pass
 * under or over (#307): a wing four and a half metres up is clear, a
 * fuselage is not.
 */
export const CAR_HEIGHT = m(1.5);
/** Speed kept after hitting a building, as a fraction. */
export const HIT_SPEED_KEPT = 0.25;
/** How quickly the car settles onto the height of the road it is on. */
export const RIDE_RATE = 8;
/** Fall acceleration when the car leaves the deck, in world units per second squared. */
export const GRAVITY = m(22);

/**
 * Relief you can feel (#255, `slope.ts`).
 *
 * `SLOPE_SPEED` is how far a grade moves top speed: at 2.5, a 6% climb - the
 * steepest an arterial or boulevard is allowed (ADR-0007 rule 7) - tops out at
 * 85% and the same descent runs on to 115%, and `SLOPE_SPEED_MAX` caps it for
 * the few steeper stretches (the map's worst is 16%). Measured on `CITY_SEED`,
 * a fifth of the network is steeper than 2% and a tenth steeper than 4%, so
 * this is felt on a real drive without deciding every one.
 *
 * `SLOPE_EASE` is how fast the cap follows a change of grade, per second. The
 * cap moves and the existing overspeed bleed follows it, so a climb takes the
 * speed off over a second or so rather than like a wall - and the bleed after
 * a boost, which #105 depends on, is untouched.
 *
 * The grade is sampled `SLOPE_SAMPLE` either side of the car, and a crest over
 * `CREST_SAMPLE`: long enough that the kink where two road pieces meet does
 * not read as a crest at every junction, short enough that a real brow does.
 */
export const SLOPE_SPEED = 2.5;
export const SLOPE_SPEED_MAX = 0.3;
export const SLOPE_EASE = 0.15;
export const SLOPE_SAMPLE = m(6);
export const CREST_SAMPLE = m(15);
/** The least grip a car keeps going light over a crest. */
export const CREST_GRIP_MIN = 0.35;
/** Below this speed a car on a hill stays put rather than rolling. */
export const SLOPE_HOLD = m(2);
/**
 * How far above or below a road the car can be and still count as on it.
 * Without this, standing in the street under an overpass reports the deck 12 m
 * overhead as the surface, and being *under* a road becomes the same as being
 * *on* it - which is the exact distinction #85 exists to draw.
 */
export const SURFACE_REACH = m(3);
/**
 * How far past the map's own bounds the car may be.
 *
 * The perimeter arterial's *centreline* is the boundary, so its carriageway
 * straddles it and a car driving down it is legitimately outside. Without a
 * margin the out-of-bounds check reverts the car and zeroes its speed on every
 * step, and the coast road is a place you stop dead and cannot leave. Sized
 * for the widest carriageway there is, and the sea is kept undrivable by the
 * water check rather than by this one.
 */
export const CITY_EDGE_MARGIN = m(18);

/**
 * Going in the water.
 *
 * It used to be a wall: the car was reverted to where it was and stopped dead,
 * so the river was an invisible barrier you bumped into. The genre's answer is
 * better and is what a playtest asked for - you go in with a splash, and you
 * are lifted out and put back on the road a moment later, poorer for it but
 * driving.
 *
 * `DUNK_HOLD` is how long the car is under before it is fished out: long
 * enough to be a mistake you feel, short enough that it is not a loading
 * screen. The cost is the same shape as everything else that goes wrong -
 * damage and the speed you had - and the pursuit carries on, because being
 * dredged out of the bay does not mean they have lost you.
 */
export const DUNK_HOLD = 2.2;
export const DUNK_DAMAGE = 0.12;
/** How far under the surface the car sinks while it is down there. */
export const DUNK_DEPTH = m(2.4);

/**
 * How far the car may be above the ground before it is *falling* rather than
 * driving down a slope.
 *
 * `settle` decided this by asking whether the car was at or below the ground,
 * which is exact and wrong: drive downhill off-road and the ground under the
 * car is lower every step than the car was the step before, so the car was
 * falling continuously. It landed sixty times a second, took `DAMAGE_FALL`
 * each time and kept `HIT_SPEED_KEPT` of its speed each time - full damage in
 * two seconds and a car crawling at 0.4 km/h that read, from the driver's seat,
 * as being stuck on nothing.
 *
 * A metre and a half is more than any slope drops under a car in one step and
 * far less than the twelve-metre deck a fall is meant to be about.
 */
export const FALL_CLEARANCE = m(1.5);

/**
 * Landing a jump (#307).
 *
 * Priced on how *steeply* the car comes down - its vertical speed squared
 * over its whole speed - rather than on how fast it falls. The game's gravity
 * is over twice the real thing, so a jump taken quickly comes down hard in
 * absolute terms however well it is flown; what separates a good landing
 * from a bad one is the angle. A fast, flat landing carries on with
 * `LAND_SPEED_KEPT` of its speed; rolling off something tall and dropping
 * nearly straight down is what `DAMAGE_FALL` is for, reached in full at
 * `LAND_HARD`.
 *
 * Measured on Marrow Field's jumps: every one lands soft from 40 to 240
 * km/h on flat ground, and a car dropped from a standstill off four metres
 * does not.
 */
export const LAND_SOFT = m(11);
export const LAND_HARD = m(22);
export const LAND_SPEED_KEPT = 0.94;

/**
 * Parkland on the land the street grid never claimed (#185).
 *
 * A fifth of the map belonged to neither block nor road: blocks are laid on
 * lines and then pulled clear of the water, and one that will not fit is
 * dropped, so a riverbank loses whole blocks and leaves an apron behind. The
 * leftovers are covered at `PARK_CELL` and merged into rectangles.
 *
 * `PARK_MIN_SIDE` is what stops it producing a thousand slivers - a strip
 * narrower than this is a margin nobody looks at, and a park has to be
 * somewhere you could drive into. `PARK_ROAD_CLEAR` keeps the grass off the
 * tarmac: a pavement slab is raised, so a park laid over a carriageway is a
 * kerb across the road.
 */
export const PARK_CELL = m(20);
export const PARK_MIN_SIDE = m(40);
export const PARK_ROAD_CLEAR = m(2);

/** Where a new car is put: on the interstate ring is wrong, so a street it is. */
export const SPAWN_SEARCH = m(180);
/** How far short of the first event's start line a new game begins. */
export const SPAWN_LEAD = m(200);

/**
 * Getting unstuck (#179).
 *
 * Stuck means "not getting anywhere", not "not moving". A car wedged nose into
 * a corner rocks back and forth for as long as you hold the throttle, which
 * reads as moving to any speed test - the reference driver in
 * `tools/citydriver.mjs` learnt that the hard way and measures ground covered
 * instead. So does the car: `STUCK_PROGRESS` is how much of the city has to go
 * by to count as progress, and `STUCK_TIME` is how long it may not.
 *
 * Long enough that nudging a wall at a junction never offers a reset, short
 * enough that a wedged car is not a session over.
 */
export const STUCK_TIME = 3;
export const STUCK_PROGRESS = m(12);
/**
 * The other way of being stuck (#385): a box the car cannot leave, rather
 * than a step it cannot take. Rocking between an obstacle and whatever is
 * behind it covers more than `STUCK_PROGRESS` on every swing, so the clock
 * above restarts every few seconds and never offers anything - measured under
 * Marrow Field's cargo plane, it peaked at 2.7 s of 3 across four minutes and
 * 330 impacts. Asked to move for `STUCK_TRAPPED_TIME` without once getting
 * `STUCK_ROOM` from where it started is at best 18 km/h of going nowhere.
 */
export const STUCK_ROOM = m(40);
export const STUCK_TRAPPED_TIME = 8;

/**
 * Boulevards (#115): the roads that bend. Laid over the finished grid and
 * spliced into it, because a grid on its own has no sweeping line through it.
 */
export const BOULEVARD_COUNT = 5;
export const BOULEVARD_LANES = 4;
export const BOULEVARD_SPEED = kmh(80);
/** How finely the curve is sampled. Short enough that a bend reads as a bend. */
export const BOULEVARD_STEP = m(70);
/** How far the curve bows off a straight line between its ends. */
export const BOULEVARD_SWEEP = m(1400);
/** Blocks and buildings within this of a boulevard centreline make way for it. */
export const BOULEVARD_CLEARANCE = m(5);

/**
 * Traffic in the city (#87). Kept around the player rather than spread over
 * the whole map: two thousand roads of ambient cars would be simulating a city
 * nobody is looking at.
 */
/**
 * How many cars are kept around the player, before the district and the hour
 * have their say.
 *
 * Down from 52, and before that 75. Traffic is something you thread and score
 * off, not the thing that sets the pace (ADR-0011, #348): in the reference
 * game no other vehicle is on screen in 60% of driving seconds and three or
 * more in at most a tenth. The owner's recorded drive (#347) had about the
 * same share of empty seconds but twice as many cars when there were any -
 * 2.9 at a time against 1.5, three or more in 22% of seconds - and the owner's
 * word for it was "way too many cars on the road".
 *
 * Set with `npm run trafficview`, which counts what a chase camera sees the
 * way the telemetry recorder does. At 52 it read 1.27 vehicles on screen a
 * second and 36% empty; at 24, 0.58 and 59%, 1.4 at a time when there are
 * any and three or more in 3% of seconds, against the reference's 0.60, 60%,
 * 1.5 and at most 10%.
 */
export const TRAFFIC_IN_CITY = 24;
export const TRAFFIC_RADIUS = m(360);
/**
 * How much road within `TRAFFIC_RADIUS` counts as a full neighbourhood, so
 * `TRAFFIC_IN_CITY` is cars per that much road rather than cars per player.
 *
 * A flat count is the same thing only while every part of the city has about
 * the same amount of road in it, and that stopped being true when the map was
 * rebuilt around drawn roads: fifty-two cars sized for a dense grid were poured
 * onto the four or five roads now passing within 360 m.
 *
 * Six kilometres is about what a 360 m circle of gridded downtown holds, so the
 * old number still means what it meant where it was measured.
 */
export const TRAFFIC_ROAD_FULL = m(6000);
/**
 * How much of that each district gets (#180).
 *
 * It used to be exactly constant: the same seventy-five cars in a downtown
 * canyon and on an industrial back street, which is a large thing to have flat
 * given how much traffic decides the pace a good driver can hold. A playtest
 * asked both halves of the question in one breath - "traffic is too dense; is
 * it constant across the map?" - so these are centred a little under 1 rather
 * than on it: downtown gets more than it had, everywhere else gets less, and
 * the average across the city comes down.
 *
 * Read as multipliers on `TRAFFIC_IN_CITY`, chosen by the district of the road
 * under the car. Time of day is the other half of the issue and belongs with
 * #11's lighting work.
 */
export const TRAFFIC_DENSITY: Record<DistrictKind, number> = {
  downtown: 1.25,
  midtown: 1,
  waterfront: 0.6,
  industrial: 0.5,
  park: 0.3,
};
/**
 * The number of lanes a road needs before traffic will certainly spawn on it.
 *
 * A four-lane arterial carrying the same number of cars as the side street it
 * crosses is the other half of "density is flat". A candidate road is accepted
 * with probability `lanes / TRAFFIC_LANE_BIAS`, so a two-lane street is turned
 * down half the time and the retry lands somewhere else.
 *
 * Rejection rather than a weighted pick because a weighted pick measurably did
 * nothing: candidates come from one grid cell, and the roads in one cell are
 * few and much of a muchness. Turning a spawn down moves it across the map.
 */
export const TRAFFIC_LANE_BIAS = 4;

/**
 * Time of day (#180), the other half of "how much traffic, where".
 *
 * The city keeps a clock because the traffic reads it: a back street at three
 * in the morning is not a back street at half past eight. It is simulation
 * rather than decoration for exactly that reason, and the renderer reads the
 * same number to decide what the sky is doing.
 *
 * A full day in about half an hour of play. Fast enough that a session sees
 * more than one hour of it, slow enough that the light is not visibly
 * sliding while you drive down a street. It starts in the afternoon so a
 * player's first minute is in daylight, and so every screenshot in the repo is
 * taken at the same hour without having to say so.
 */
export const DAY_START = 14;
export const DAY_MINUTES = 32;

/**
 * How busy the city is through the day, as multipliers on the district's own
 * density. Hours between these are interpolated.
 *
 * Two peaks and a long trough, which is what traffic does. The night figure is
 * what makes a three-in-the-morning pursuit a different drive from a
 * six-o'clock one: the roads are yours, and so is every mistake.
 */
export const TRAFFIC_BY_HOUR: [number, number][] = [
  [0, 0.4],
  [3, 0.22],
  [6, 0.75],
  [8, 1.2],
  [11, 0.95],
  [13, 1],
  [17, 1.2],
  [20, 0.85],
  [22, 0.6],
  [24, 0.4],
];
/** Never spawn one closer than this, or cars appear out of nothing in view. */
export const TRAFFIC_SPAWN_MIN = m(95);
export const TRAFFIC_SPEED_MIN = 0.55;
export const TRAFFIC_SPEED_MAX = 0.95;
/** How far right of the centreline traffic sits. */
export const TRAFFIC_LANE = m(3);
/** Seed for everything that moves in the sim, so a playtest repeats exactly. */
export const SIM_SEED = 0x5eed1;
/** How much room a traffic car keeps behind the one in front. */
export const TRAFFIC_GAP = m(14);
/** Speed kept after hitting a traffic car - a shunt, not a wall. */
export const SHUNT_SPEED_KEPT = 0.55;

/**
 * The pursuit in world space (#87). The track version measures everything as a
 * trail distance along one road; here a cop is a car somewhere in the city, so
 * these are plain distances between two points.
 */
export const CITY_COP_SPAWN = m(260);
export const CITY_BUST_DISTANCE = m(11);
export const CITY_PURSUIT_RANGE = m(120);
/**
 * How far a cop can fall behind before it has lost you.
 *
 * A distance between two points, which is the only thing that means anything
 * in a city. The sim before this one measured it as a *trail* along a single
 * road, and reusing that number here culled every cop on the step after it
 * spawned - which is the whole reason this is written in metres.
 */
export const CITY_COP_LOSE = m(500);
/** Seconds the BUSTED state holds before the pursuit is cleared. */
export const CITY_BUST_HOLD = 3;

/**
 * Cameras (#88). The chase camera's numbers are most of how fast the game
 * feels: the field of view opening with speed does more for it than the speed.
 */
export const CHASE_BACK = m(15);
export const CHASE_HEIGHT = m(6);
/** How quickly the camera catches up. Lower lags more, which reads as weight. */
export const CHASE_LAG = 5;
/**
 * The line on the road along the route ahead (#443): how far ahead it runs,
 * how finely it is sampled and how wide it is. The reference draws two, a lane
 * apart; the owner asked for one, down the middle of the route.
 */
export const GUIDE_AHEAD = m(320);
export const GUIDE_STEP = m(6);
export const GUIDE_WIDTH = m(0.8);
export const CHASE_FOV = 58;
export const CHASE_FOV_FAST = 74;

/** The crash cut: how long it holds, and how far off it stands. */
export const CRASH_HOLD = 1.4;
export const CRASH_DISTANCE = m(13);
/** The opening pass around the car before you take control. */
export const INTRO_HOLD = 2.6;
export const INTRO_RADIUS = m(17);
/**
 * The pass over a circuit before its lights (#359). The reference flies the
 * course for about 25 seconds; this is shorter because it plays before every
 * ladder race rather than once, and confirm skips it either way. The time is
 * fixed and the speed follows the lap, so a long course is flown faster rather
 * than for longer.
 */
export const FLYOVER_TIME = 12;
/** How high over the road it flies, and how far ahead along the lap it looks. */
export const FLYOVER_HEIGHT = m(55);
export const FLYOVER_LEAD = m(160);
/**
 * The last part of the flyover is the camera coming down behind the car, with
 * the lights still held, so the countdown starts on the chase camera rather
 * than under a camera still dropping out of the sky.
 */
export const FLYOVER_SETTLE = 1.4;
/** How long a glance behind is held, so a tap is readable. */
export const LOOK_BACK_HOLD = 0.9;
/** Impact shake: how hard, and how fast it dies away. */
export const SHAKE_STRENGTH = 0.5;
export const SHAKE_DECAY = 2.2;

/**
 * The minimap (#89): how far it reaches, and how big it is drawn.
 *
 * The reach went up with #216. At 280 m it showed the street you were on and
 * little else - "not much to see", as a playtest put it - which cannot answer
 * the question a minimap exists for: which way is the thing I am heading for.
 * The circle is the same size on screen; it just holds more city.
 *
 * There is a limit the other way. Far enough out and the streets converge into
 * a grey hatch, and the marker line to where you said you were going stops
 * being a direction and becomes a scribble. This is about as far as the drawn
 * width of a street survives.
 */
export const MINIMAP_RANGE = m(430);
export const MINIMAP_SIZE = 190;

/**
 * The six heat levels (#58), and what each one sends after you.
 *
 * Escalation happens *within* a pursuit rather than being gated behind career
 * progress: the longer they have you, the heavier what arrives. That is the
 * framework the rest of the pursuit work hangs off - roadblocks, spike strips
 * and the Enforcers all key off a level rather than off a raw heat number.
 *
 * `speed` is a fraction of the player's top speed and stays under 1 at every
 * level, level six included. That is not a detail: a pursuit you cannot
 * outrun on speed alone is a pursuit with no answer, and it has been broken by
 * a car change before - a profile is a multiplier on `REFERENCE_TOP_SPEED`
 * precisely so these fractions keep meaning what they say.
 */
export type CopKind =
  | 'cruiser'
  | 'unmarked'
  | 'state'
  | 'suv'
  | 'federal'
  | 'elite'
  | 'enforcer';

export interface CopUnit {
  /** Body colour, so the threat can be read at a glance. */
  colour: string;
  /** Size against an ordinary car. Heavier units are visibly bigger. */
  scale: number;
  /** Multiplies the level's speed. */
  pace: number;
}

export const COP_UNITS: Record<CopKind, CopUnit> = {
  cruiser: { colour: '#1b2740', scale: 1, pace: 1 },
  unmarked: { colour: '#2a2a2f', scale: 1, pace: 1.04 },
  state: { colour: '#14304a', scale: 1.05, pace: 1.06 },
  suv: { colour: '#23282e', scale: 1.22, pace: 0.98 },
  federal: { colour: '#101820', scale: 1.08, pace: 1.09 },
  elite: { colour: '#2b0f14', scale: 1.16, pace: 1.11 },
  // The heavy Enforcer (#61). Slower than everything else and much bigger,
  // because it is not trying to follow you - it is trying to be where you are
  // about to be, and it only has to be right once.
  enforcer: { colour: '#171a1f', scale: 1.5, pace: 0.94 },
};

export interface HeatLevel {
  /** What can turn up at this level. */
  units: CopKind[];
  /** How many can be out at once. */
  maxCops: number;
  /** Base speed as a fraction of the player's top speed. Always under 1. */
  speed: number;
  /**
   * How many Enforcers come at you head on (#61), and which unit they are.
   *
   * A budget of their own rather than a share of `maxCops`: they are a
   * different threat, and spending the chase budget on them would thin out the
   * pursuit behind you every time one turned up in front of it.
   */
  enforcers: number;
  enforcerUnit: CopKind;
}

/**
 * Note the speeds: they are the level's base, and a unit's `pace` multiplies
 * it. The product has to stay under 1 for *every* unit the level can send, not
 * just the average one - the first version of this table looked fine per level
 * and put elite units at 105% of the player's top speed, which is a pursuit
 * with no answer. `npm run pace` is the guard on that.
 *
 * What these numbers are *not* is how you get away (#170). Being faster than
 * them stops a pursuit being hopeless; it is not the escape. `seenBy` needs a
 * unit within `SEEN_RANGE` with line of sight, so turning a corner breaks
 * contact whatever your top speed is - and measured, a car at full damage
 * escapes about as often as an undamaged one (67 / 17 / 50% against
 * 50 / 17 / 67% at heat 1 / 3 / 6, which is inside the noise). Damage takes
 * your speed and your grip and does not take the way out. Read the fractions
 * as a floor under the pursuit rather than as the mechanic:
 * `npm run endings -- --damage 1` is where that claim is checked.
 */
// maxCops is 2, 2, 2, 3, 3, 4 by level, down from 2, 3, 4, 4, 5, 6 (2026-09-28,
// with `PATROL_IN_CITY`): the chase is felt more than seen. Measured with
// `npm run endings`: a car that keeps driving is half busted and half away at
// every level, where heat 6 used to bust it every time; a car that stops is still busted
// at heat 6 every time and half the time lower down; nothing ends in a
// stalemate. `npm run pace` passes. Level 1 keeps two: with one, a car that
// stopped always got away.
export const HEAT_LEVELS: HeatLevel[] = [
  { units: ['cruiser'], maxCops: 2, speed: 0.84, enforcers: 0, enforcerUnit: 'suv' },
  { units: ['cruiser', 'unmarked'], maxCops: 2, speed: 0.85, enforcers: 0, enforcerUnit: 'suv' },
  { units: ['unmarked', 'state'], maxCops: 2, speed: 0.86, enforcers: 1, enforcerUnit: 'suv' },
  { units: ['state', 'suv'], maxCops: 3, speed: 0.87, enforcers: 1, enforcerUnit: 'enforcer' },
  { units: ['state', 'suv', 'federal'], maxCops: 3, speed: 0.875, enforcers: 2, enforcerUnit: 'enforcer' },
  { units: ['federal', 'elite', 'suv'], maxCops: 4, speed: 0.88, enforcers: 2, enforcerUnit: 'enforcer' },
];

/** How many heat levels there are. Six, as the genre has had for twenty years. */
export const HEAT_LEVEL_COUNT = HEAT_LEVELS.length;

/**
 * How fast heat builds and cools in the city.
 *
 * Slow on purpose. Ten seconds of contact filling the bar is right for a
 * pursuit that is over in a minute and wrong for six levels: escalation has to
 * be something you feel happening to you, not a number that saturates before
 * you have found a corner to lose them on. About a minute and a half of being
 * held to reach level six.
 */
export const CITY_HEAT_RISE = 0.012;
export const CITY_HEAT_DECAY = 0.045;

/**
 * Cooldown (#63): escaping in two stages rather than one.
 *
 * Break contact and the pursuit drops into a search - a circle centred where
 * they lost you, which they sweep. Stay in it or be seen and it resumes; get
 * out and stay out and you are clear. This is the part that makes free roam
 * matter: side streets and cover become an escape route instead of scenery.
 */
/** How close a cop has to be, with nothing between you, to have you in sight. */
export const SEEN_RANGE = m(150);
/**
 * How much ground has to be over a car for it to be underground, and out of
 * sight of anything that is not (#257). A car's height and a roof: 2.5 m.
 * Measured on the freeway: 67 of its 73 tunnel nodes have more than 3 m over
 * them, the river tunnel has exactly 3 m of riverbed, and the mouths have 2 m
 * or less - so the mouths are open and everything past them is not.
 */
export const TUNNEL_COVER = m(2.5);

/**
 * Patrols, and what starts a pursuit (#177).
 *
 * There used to be no trigger at all: a clock ran down from twelve seconds and
 * a pursuit began, whatever you were doing. That removed a whole state of the
 * game - free roam is what you do *between* pursuits, and #64's economy pays
 * more under heat precisely because heat is meant to be something you chose to
 * accept.
 *
 * So there are cars out there before there is a pursuit. A patrol drives the
 * street network like traffic and is scenery until it *sees* you do something,
 * which is why they are kept around the player the way traffic is: a city-wide
 * police force would be simulating a hundred cars nobody is looking at.
 */
//
// One, down from four (2026-09-28). The owner: "way too much police around".
// Four was set when fifty-two civilian cars were kept around the player; with
// traffic thinned to twenty-four (#348) it made about one car in seven a
// police car. The reference game's police are "felt, not seen" and no pursuit
// began in free roam in 47 minutes. Measured with `npm run patrol` over ten
// minutes of a driver that speeds everywhere: four patrols started seven
// pursuits and kept it wanted for half the session; two, still seven; one,
// three, wanted for a sixth of it.
export const PATROL_IN_CITY = 1;
export const PATROL_RADIUS = m(520);
/** Never spawn one closer than this, or a patrol appears out of nothing in view. */
export const PATROL_SPAWN_MIN = m(230);
/** How briskly a patrol cruises, against the road's own limit. */
/**
 * How far a pursuing unit may leave the road to cut a corner you cut (#220).
 *
 * Police are `GraphCar`s - which road, how far along, which way - and the
 * player deliberately is not, because "a player pinned to the graph could not
 * cut across a car park, and cutting across a car park is the point of free
 * roam". The other side of that decision is that a pursuit gave up at a kerb:
 * drive over a plaza, a car park or the parkland #185 laid down, and the cars
 * behind you had to go round.
 *
 * Bounded, and small. This is a unit stepping off the road to follow you over
 * open ground and back on again, not a unit that navigates open ground: past
 * this it has to be back on the network. Roughly a block.
 */
export const COP_LEASH = m(70);
/**
 * What open ground costs a police car, as a fraction of its pace.
 *
 * Harsher than the quarter of top speed the player is held to off-road, and
 * that is the point: following you across a car park has to be possible and
 * has to be *worse* than the road, or there is no reason to know the map. You
 * lose less by cutting than they do by following.
 */
export const COP_OFF_ROAD = 0.55;
/**
 * A unit that has got past the car it is chasing (#422).
 *
 * A chasing unit drives at its own target pace and only chooses at a
 * junction, and it cannot choose the road it came along. So one that got by
 * - the player braking for a corner the unit took faster - carried on to the
 * next junction and turned further away still. On the Halloway Rim that is a
 * long way, and the owner saw a cruiser overtake and drive off mid-pursuit.
 *
 * More than `COP_PASSED` ahead of the car along its own road, with the car
 * coming the same way and within `COP_HOLD_RANGE`, it holds station: no faster
 * than `COP_HOLD_PACE` of the car's speed, so it stays in sight rather than
 * lost. Matching and not slower, so a person can always drive past it: at
 * 0.85 of your speed it is a rolling roadblock. With the car gone the other
 * way, or further back than that, it turns round where it is and keeps
 * `COP_TURN_KEPT` of its speed.
 *
 * `npm run endings` reads heat 6 as busted every time with this on (half
 * before), and that is its driver: it never overtakes, follows any car in its
 * line at that car's speed, and treats a unit coming back at it head on the
 * same way. The escapes it had at heat 6 were units overshooting and leaving.
 */
export const COP_PASSED = m(10);
export const COP_HOLD_RANGE = m(70);
export const COP_HOLD_PACE = 1;
export const COP_TURN_KEPT = 0.3;
export const PATROL_PACE = 0.85;

/**
 * Speeding: what counts as provocative, against the limit on the road you are
 * on.
 *
 * Against the road rather than against your own top speed, because that is
 * what makes the interstate a place you can open it up and a downtown street a
 * place you cannot. A good driver averages about half of top speed on an empty
 * road and a quarter in traffic, which on a 50 km/h street is already well
 * over the limit - the game is arcade and the limits are not - so the
 * multiplier is high on purpose. What it has to separate is *getting somewhere*
 * from *showing off in front of a patrol car*.
 */
export const SPEEDING_OVER = 2.4;
/** Seconds over the limit, in view, before they take an interest. */
export const SPEEDING_TIME = 1.5;
/** Seconds out of sight before the pursuit drops into a search. */
export const LOSE_CONTACT_TIME = 4;
/** How long the search lasts at heat level one, and how much each level adds. */
export const SEARCH_TIME = 18;
export const SEARCH_TIME_PER_LEVEL = 7;
/** How big the search area is, and how much each heat level widens it. */
export const SEARCH_RADIUS = m(320);
export const SEARCH_RADIUS_PER_LEVEL = m(70);
/**
 * Units sent to sweep the area, as a share of the chase budget (#178).
 *
 * A search with nobody in it is not a search, and that is what this used to
 * be: contact broken, an area drawn on the map, and no car ever sent to look
 * in it. Stop inside one and the game deadlocked - the clock does not run
 * while you are in the area, nothing could see you, and nothing may be called
 * in on a pursuit that cannot see you, so the pursuit simply never ended.
 * Measured at heat 6 that was **100% of stopped pursuits**.
 *
 * They come in at the *edge of the area*, not at the player. That distinction
 * is the whole safety of it: a searcher spawned near you would re-find you
 * wherever you had run to, which is the bug #177 closed. Spawned where they
 * lost you, they sweep where they lost you - so running works and sitting
 * still does not.
 */
export const SEARCH_UNITS = 0.5;
/**
 * How fast the search clock runs while you are *inside* the area (#178).
 *
 * It used to be zero, and the comment for it - "sitting still in the middle of
 * where they are looking is not hiding" - was true only while something was
 * coming to look. Nothing was, so a car parked inside the net was wanted
 * indefinitely: at heat 6, 100% of stopped pursuits reached the end of a
 * three-minute clock still wanted, which is a stalemate rather than a game.
 *
 * Slow rather than stopped. The area is 320 m across at heat 1 and 670 m at
 * heat 6, and a unit can only see 150 m of that, so they can sweep it for a
 * long time without finding you - but they do eventually give up, and a
 * pursuit that always ends is the point of the issue.
 */
export const SEARCH_INSIDE_RATE = 0.3;
/** How near a searcher has to get to the spot it is checking before moving on. */
export const SEARCH_REACHED = m(60);

/**
 * Takedowns (#94).
 *
 * The genre's answer to "what do I do about the cop on my bumper": you put him
 * into something. A takedown is a hit hard enough to wreck another car, and
 * wrecking one is meant to be a decision rather than an accident - it costs
 * speed, it takes commitment, and doing it to the police makes them angrier.
 *
 * The thresholds are written as fractions of the player's top speed rather
 * than as absolute damage, so retuning the car does not silently retune what
 * it takes to wreck somebody.
 */
/** Below this closing speed a contact is a nudge and does no damage at all. */
export const TAKEDOWN_MIN_CLOSING = 0.09;
/** Closing speed that does a full car's worth of damage in one square hit. */
export const TAKEDOWN_KILL_CLOSING = 0.52;
/**
 * How much harder a hit lands when the car has a wall behind it.
 *
 * Traffic and police live on the street graph and cannot be knocked off it, so
 * "ram them into scenery" cannot be modelled by shoving them sideways into a
 * building. Pinning is the same idea from the other end: a car with a building
 * immediately behind it has nowhere to give, so the whole hit lands.
 */
export const TAKEDOWN_PINNED_MULT = 2.4;
/** How far behind the car a building has to be to count as pinning it. */
export const TAKEDOWN_PIN_REACH = m(6);
/** How much of a hit a heavier unit shrugs off, per unit of `scale` over one. */
export const TAKEDOWN_MASS_MULT = 1.6;
/** Speed the player keeps after wrecking somebody: a takedown is not free. */
export const TAKEDOWN_SPEED_KEPT = 0.62;
/** Heat a police takedown adds. Wrecking a cruiser is not a way to calm things. */
export const TAKEDOWN_HEAT = 0.06;

/** Seconds a wreck is left in the street before it is cleared away. */
export const WRECK_LINGER = 9;
/** Seconds the TAKEDOWN banner holds on the HUD. */
export const TAKEDOWN_FLASH = 2;
/** How long the takedown cut runs, in real seconds, and how slowly time runs. */
export const TAKEDOWN_HOLD = 1.5;
export const TAKEDOWN_SLOWMO = 0.35;
/** How far off the takedown camera stands, and how fast it swings round. */
export const TAKEDOWN_DISTANCE = m(15);
export const TAKEDOWN_ORBIT = 0.45;

/**
 * Roadblocks (#59).
 *
 * From heat two the police start putting cruisers across the road in front of
 * you. The point is that it is a decision made early: it is placed a few
 * seconds ahead at the speed you are actually doing, so you can see it coming
 * and choose - thread the gap, take a side street, or go through it and pay.
 *
 * They only go on the big roads. A cruiser is nearly as wide as a lane at this
 * scale, so a block across a two-lane street is a wall with no gap in it,
 * which is not a decision. Putting them on arterials, boulevards and the
 * interstate also means the side streets stay the way round, which is what
 * makes one worth having.
 */
export const ROADBLOCK_MIN_LEVEL = 2;
/** How many can be out at once, and how long between attempts to place one. */
export const ROADBLOCK_MAX = 2;
export const ROADBLOCK_INTERVAL = 13;
/** How far ahead: this many seconds at current speed, within these bounds. */
export const ROADBLOCK_LEAD_TIME = 3.2;
export const ROADBLOCK_MIN_LEAD = m(150);
export const ROADBLOCK_MAX_LEAD = m(650);
/** Kept apart, so two of them are two decisions rather than one long wall. */
export const ROADBLOCK_SPACING = m(420);
/** Forgotten once the pursuit has taken you this far from it. */
export const ROADBLOCK_FORGET = m(800);
/** How straight-on the road has to run to your heading to be worth blocking. */
export const ROADBLOCK_ALIGN = 0.7;
/**
 * Roadblocks on the race route (#340). The reference's Most Wanted race puts
 * them on the course, often just short of a gate, because the chase cars
 * cannot keep up at race pace: the player has to go that way, so each one is a
 * question of how to get through rather than whether to turn off. In a rival's
 * race they go on the route ahead rather than on whatever road the car is
 * pointing down, only from `RACE_ROADBLOCK_MIN_LEVEL`, and always with a gap:
 * a race walled off is a race nobody can finish. `RACE_ROADBLOCK_BEFORE_GATE`
 * is how far short of the gate one sits, when a gate is in reach.
 */
export const RACE_ROADBLOCK_MIN_LEVEL = 3;
export const RACE_ROADBLOCK_BEFORE_GATE = m(40);
/** Narrower than this and a block is a wall with no gap in it. */
export const ROADBLOCK_MIN_WIDTH = m(16);
/** How deep the barrier is, and how wide the gap is when there is one. */
export const ROADBLOCK_REACH = m(4);
export const ROADBLOCK_GAP = m(3.8);
/** Chance of a gap at level two, and how much each level above takes off it. */
export const ROADBLOCK_GAP_CHANCE = 0.85;
export const ROADBLOCK_GAP_FALLOFF = 0.17;
/** Speed kept after going through one. Heavy, but not a dead stop. */
export const ROADBLOCK_SPEED_KEPT = 0.22;
/** How much room each parked cruiser takes along the barrier. */
export const ROADBLOCK_CAR_SLOT = CAR_WIDTH_WORLD * 1.9;
/** How far the cars are thrown when somebody comes through the middle. */
export const ROADBLOCK_SCATTER = m(3);

/**
 * Enforcers (#61).
 *
 * Every other cop trails you and slides into your lane. An Enforcer is the
 * other thing: it comes from in front, holds the line you are on, and tries to
 * end the pursuit in one hit. Dodging it means committing late, which is why
 * it is placed close enough to be a reaction rather than a route change.
 *
 * Light ones (an SUV) from heat three, heavy ones from four - see
 * `HEAT_LEVELS`, which is where the counts live.
 */
export const ENFORCER_MIN_LEVEL = 3;
/** How far ahead one comes in, and how long between them. */
export const ENFORCER_SPAWN = m(300);
export const ENFORCER_INTERVAL = 11;
/** Speed the player keeps after being hit by one. It is meant to end you. */
export const ENFORCER_SPEED_KEPT = 0.12;
/** How much of a hit it shrugs off, on top of its size. It is built for this. */
export const ENFORCER_TOUGHNESS = 1.5;

/**
 * Spike strips (#60).
 *
 * From heat four the police start laying strips across part of the road. They
 * do not stop you and they are not a wall: they cover most of the carriageway
 * and leave a sliver, so the answer is a line rather than a decision about
 * which side to take.
 *
 * What they cost is the thing that makes them different from a roadblock. A
 * roadblock takes your speed and gives it straight back; a strip takes your
 * *car* for a while - top speed and steering both - which is a setback you
 * have to drive out of with a pursuit already on you.
 */
export const SPIKE_MIN_LEVEL = 4;
export const SPIKE_MAX = 2;
export const SPIKE_INTERVAL = 15;
/**
 * Less warning than a roadblock gets. A strip is a line on the road rather
 * than four cars with their lights on, so seeing it late is part of it.
 */
export const SPIKE_LEAD_TIME = 2.5;
export const SPIKE_MIN_LEAD = m(110);
export const SPIKE_MAX_LEAD = m(500);
export const SPIKE_SPACING = m(340);
/** How deep the strip is, and how wide the tape reads when drawn. */
export const SPIKE_REACH = m(1.6);
/** How much of the road it covers at level four, and per level above. */
export const SPIKE_COVER = 0.6;
export const SPIKE_COVER_PER_LEVEL = 0.1;

/**
 * Shredded tyres.
 *
 * Long enough to be a real setback and short enough that it is not simply a
 * delayed bust: the clock is on the HUD so it is something to drive out, not
 * something that has already happened to you.
 */
export const SHRED_TIME = 7;
/** Top speed while the tyres are gone, as a fraction of the usual. */
export const SHRED_SPEED_FRAC = 0.4;
/** How much of the steering is left. */
export const SHRED_GRIP = 0.55;
/**
 * How long a spike strip lasts on tyres that come back up (#68).
 *
 * A moment rather than the rest of the pursuit. That is the one mod that
 * argues with the police instead of with the stopwatch, and a counter that
 * only halved the penalty would not change the decision it is meant to.
 */
export const SHRED_REINFLATE = 0.18;

/*
 * The police helicopter is gone (#183).
 *
 * #62 built it to keep you *seen*, so the search never started while it was up
 * and shaking it was a different problem from outrunning the cars. Two things
 * finished it. It is about four pixels in a rendered frame - #62's own
 * rationale was that "a thing you can never see is a thing the HUD has to
 * explain", and the HUD was doing all the work - and it was airborne for more
 * than half of a high-heat session holding `seenBy` unconditionally true,
 * which made it a large part of why a pursuit never ended.
 *
 * Cover went with it: `coveredAt`, `COVER_MIN` and `COVER_MAX` existed only to
 * answer it, and there is now nothing to hide from. The tunnel and the decks
 * are geometry again. If cover should mean something, it needs a new thing to
 * mean it against.
 */

/**
 * Rep (#64).
 *
 * The single progression currency, earned from everything rather than from
 * winning races. That is the point of it: in a free-roam game the time between
 * events is most of the game, and a currency that only pays for events makes
 * driving around worth nothing.
 *
 * The numbers are round on purpose. They are a *scoring table*, and a table
 * whose entries are 287 and 412 tells a player nothing about which of two
 * things is worth doing.
 */
export const REP_TAKEDOWN = 300;
export const REP_ROADBLOCK = 250;
/** Wrecking a civilian car. Small: it is something that happened to you. */
export const REP_WRECK = 40;
export const REP_NEAR_MISS = 25;
/** Per second of an active pursuit, multiplied by the heat level. */
export const REP_PURSUIT_PER_SECOND = 10;
/** How often the running total from a pursuit is actually shown. */
export const REP_PURSUIT_TICK = 5;
/** Getting away, multiplied by the heat level you got away at. */
export const REP_ESCAPE = 400;

/**
 * How much more everything is worth while they are actually chasing you.
 *
 * This is the whole shape of the economy: a takedown in free roam is worth a
 * takedown, and the same takedown at heat five is worth two and a half of
 * them. Running is the multiplier.
 */
export const REP_HEAT_BONUS = 0.3;

/**
 * How close a car has to pass, and how fast, to count as a near miss.
 *
 * Written against `CAR_RADIUS` rather than in metres, because it has to be
 * wider than the range at which the two cars are *touching* (`CAR_RADIUS *
 * 2.2`). A near-miss band narrower than the collision band is a band that does
 * not exist, and the first version of this was exactly that.
 */
export const REP_NEAR_MISS_RANGE = CAR_RADIUS * 4;
export const REP_NEAR_MISS_SPEED = 0.35;
/** How far left of the centreline is "on the wrong side" for nitrous (#351): clear of it, not straddling it. */
export const NITRO_ONCOMING_MARGIN = m(1.5);
/** How close behind a car, in line with it, is a slipstream for nitrous (#351). */
export const NITRO_SLIPSTREAM_RANGE = m(16);

/**
 * What a race win is worth (#91).
 *
 * The base, plus the rival's difficulty, so beating the boss is worth roughly
 * three times beating the first one. Races are not the main earner and are not
 * meant to be: a good pursuit is worth several of them, which is what makes
 * free roam the game rather than the corridor between events.
 */
export const REP_RACE_WIN = 900;
export const REP_RACE_WIN_PER_DIFFICULTY = 1800;
/** Finishing outside the places still pays a little: the ladder should never be a hard wall. */
export const REP_RACE_LOSS = 200;
/**
 * What 1st, 2nd and 3rd pay, as fractions of a win (#357). The reference
 * game's purse is 12,000 / 8,000 / 4,000, and this is its shape: a place is
 * worth having without being worth settling for. A speed run has no field, so
 * only the first of these applies to one.
 */
export const REP_RACE_PLACES = [1, 2 / 3, 1 / 3];

/** How long an award stays on screen, and how many stack up at once. */
export const REP_POPUP_TIME = 2.6;
export const REP_POPUPS = 5;
/** Seconds between writes to storage. Every award would hammer it. */
export const REP_SAVE_INTERVAL = 4;

/**
 * Collectibles (#93).
 *
 * The main reason to drive around a city with no event running. Billboards are
 * smashed by driving into them; speed cameras clock whatever passes and keep
 * your best. Both pay Rep, which is what ties free roam to the ladder.
 *
 * Counts are targets rather than guarantees: they are placed against the
 * generated street network with a minimum spacing, and a city that cannot fit
 * that many gets fewer rather than a clump.
 */
export const BILLBOARD_COUNT = 90;
export const CAMERA_COUNT = 30;
/** How far apart they are kept, so finding one is not finding six. */
export const BILLBOARD_SPACING = m(340);
export const CAMERA_SPACING = m(700);
/**
 * How far a camera is kept from a billboard. The spacings above are per
 * kind, so a camera could land on a billboard, and driving past one then paid
 * for both: one find, scored twice. Far enough apart that they read as two
 * places, not just past a camera's range plus a billboard's hit.
 */
export const COLLECTIBLE_APART = m(120);
/** Clear of the kerb, and how big the board is. */
export const BILLBOARD_KERB_GAP = m(3);
export const BILLBOARD_WIDTH = m(11);
export const BILLBOARD_HEIGHT = m(5.5);
export const BILLBOARD_POST = m(5);
export const CAMERA_KERB_GAP = m(2);
export const CAMERA_HEIGHT_ABOVE = m(6);
/** How close the car has to get. A billboard is hit; a camera only watches. */
export const BILLBOARD_HIT = m(7);
export const CAMERA_RANGE = m(9);
/** Rep for a billboard, and for a camera at the player's full top speed. */
export const REP_BILLBOARD = 150;
export const REP_CAMERA = 220;
/** Below this fraction of top speed a camera is not worth photographing. */
export const CAMERA_MIN_SPEED = 0.3;
/** How far the minimap hints at what has not been found yet. */
export const COLLECTIBLE_HINT_RANGE = m(300);

/**
 * How far off the line to a marker you can stray before it is redrawn (#90).
 *
 * A route is a suggestion, not a rail: wandering a street off it should not
 * make it flicker, and taking a different road entirely should get you a new
 * one. `MARKER_REDRAW` throttles the recompute, which is a Dijkstra over two
 * thousand nodes and not something to run every frame.
 */
export const MARKER_STRAY = m(220);
export const MARKER_REDRAW = 2;

/**
 * Street Finds (#67).
 *
 * There is no dealership: every car other than the one you start in is parked
 * somewhere in the city. Finding one is the reward for exploring, so they are
 * spread wide and put where a car would actually be left - on the open lots
 * and yards rather than in the middle of a carriageway.
 */
export const FIND_SPACING = m(900);
/** How close you have to get. Generous: this is a reward, not a test of aim. */
export const FIND_RANGE = m(9);
/** How far off the carriageway a car parked by the road stands (#434). */
export const FIND_KERB_GAP = m(6);
/** Rep for finding one. */
export const REP_STREET_FIND = 800;
/** Seconds the "you have a new car" banner holds. */
export const FIND_FLASH = 4;

/**
 * The reference top speed every car profile is written against, in world
 * units per second. The HUD calls it 320 km/h.
 *
 * The same number the game has always had - it was the track sim's one
 * segment per physics step, which is where the round figure comes from.
 * `CityWorld.maxSpeed` is per-car now, so anything that wants "how fast is
 * this in km/h" has to divide by the reference rather than by the car, or
 * every car reads 320 km/h flat out.
 */
export const REFERENCE_TOP_SPEED = 12000;

/**
 * Races in Kestrel Bay (#70).
 *
 * The event type the genre runs most: a circuit, two or three laps of a loop
 * of real streets. Routes are generated off the road graph rather than
 * authored, for the same reason the city is - the map is a seed, and an
 * authored route would have to be redrawn every time the seed moved.
 */
export const ROUTE_COUNT = 6;
/**
 * How far across the city a lap reaches, and how many laps of it are run.
 *
 * Sized from how long a race should take rather than from how big the map is:
 * a two-and-a-half to three minute event at the pace the car actually holds.
 * The first version used a 900 m radius and produced a twelve-kilometre lap
 * round the harbour, which is a seven-minute race.
 *
 * It was 520 m, and the pace behind that number had been measured on an empty
 * road before #171 put traffic in the probes - so three laps of three and a
 * half kilometres was a *ten* minute race. #200 cut the laps to 2, which was
 * five, and #209 took the radius to 195 m, which was two and a half minutes
 * and which a playtest called "too short and corners very tight".
 *
 * 310 m and two laps is the answer to both halves of that. Laps of 1.8-2.4 km
 * and races of 145-191 seconds, which is the event this was always supposed to
 * be - and *fewer corners per kilometre*, which is the half that a shorter lap
 * made worse rather than better: at 195 m an advanced driver took 46.4 impacts
 * per kilometre against 31.9 here. A shorter lap in the same city is not a
 * scaled-down lap, it is the same junction spacing with less road between the
 * corners.
 *
 * Below about 250 m the *generator* becomes the constraint rather than the
 * geometry, because a smaller lap is a smaller target: four corners have to
 * land on four distinct junctions and four legs have to join them without
 * retracing. Check `ROUTE_COUNT` routes still come out before trusting a new
 * value, and read `routesFor` on why the search is shaped the way it is.
 */
export const ROUTE_RADIUS = m(310);
export const ROUTE_LAPS = 2;
/**
 * A lap outside this is not a circuit: it is a commute, or a car park.
 *
 * The band is also what keeps six events comparable: it is narrow enough that
 * the longest circuit is not twice the shortest, and wide enough that the
 * generator can still find six. Tightening it to 1800 m cost two routes.
 */
export const ROUTE_MIN_LENGTH = m(1800);
export const ROUTE_MAX_LENGTH = m(2900);
/**
 * The sharpest corner a lap may contain, in radians.
 *
 * A right angle is a junction and fine; anything approaching a half-turn is
 * the route doubling back on itself, which is an out-and-back rather than a
 * circuit. Every route in the city was one of those until a reference driver
 * tried to lap one and could not.
 */
export const ROUTE_MAX_TURN = 2.1;
/** Kept apart, so six events are six places rather than one crossroads. */
export const ROUTE_SPACING = m(850);
/** How close you have to be to a start line for the event to be offered. */
export const ROUTE_START_RANGE = m(28);
/**
 * Rival races (#419). A generated circuit has no difficulty of its own, so its
 * ordinary race gets this, a little above the first rival's. And a rival's
 * start line is this far round their circuit from its ordinary one, so the
 * two are different places on the map when they share the loop.
 */
export const ORDINARY_RACE_DIFFICULTY = 0.2;
export const RIVAL_START_ALONG = 0.5;
/**
 * The circuits the ladder's rivals race, by rank (#419). Named rather than
 * "every circuit" since Midtown north's two (#477): rivals are dealt round the
 * circuits by rank, so each new circuit moved four of them, and two landed on
 * a street circuit they could not finish. The ladder stays on these until the
 * race exploration (`docs/map-areas.md`, "Races wait for the map").
 */
export const RIVAL_CIRCUITS = ['Halloway Rim', 'Sablet Quay'];
/**
 * Events per car (M12). A car gets one event per route, up to this many, and
 * the design starts it at three; its field is the route's difficulty moved by
 * how much faster than the reference car it is, so a quick car on the same
 * roads is a harder event (`carevents.ts`). One event per route, on the
 * owner's word at the Highmoor Descent (#460): seven since Tidewater Drive
 * (#461), nine since Midtown north's two circuits (#477), ten since the
 * Promenade Sprint (#487), eleven since the Main Street Sprint (#488),
 * twelve with the Works Circuit (#489), fourteen with Ashford Point's
 * Coast Sprint and Estates Circuit (#293), sixteen with downtown's Harbour
 * Sprint and Old Town Circuit (#268), seventeen with the quarry island's
 * Halloway Coast Rally.
 */
export const CAR_EVENTS_MAX = 17;
export const EVENT_DIFFICULTY_PER_TOP_SPEED = 1.5;
/** How close you have to pass a checkpoint. Generous: this is not a test of aim. */
export const CHECKPOINT_RANGE = m(26);
/** How far apart the checkpoints are laid along the route. */
export const CHECKPOINT_SPACING = m(220);
/** Seconds of 3-2-1 before a city race goes. */
export const CITY_COUNTDOWN = 3;
/** How long the result banner holds before control comes back. */
export const CITY_RESULT_HOLD = 5;

/**
 * A full field (#71).
 *
 * A race against one car is a race with nothing happening in it. A field
 * changes how a race reads more than any other single thing: there are cars to
 * pass, a position to hold, and something going on ahead of you the whole way.
 */
export const FIELD_SIZE = 6;
/**
 * How much slower each car down the field is, as difficulty.
 *
 * The rival being challenged is always the quickest one in it, so winning the
 * race and beating them are the same thing - a field where you could come
 * second to somebody you have already beaten and still rank up would make the
 * ladder mean nothing.
 */
export const FIELD_SPREAD = 0.07;
/**
 * A rival that has been hit (#350) runs at this share of its pace for
 * `FIELD_SHAKEN_TIME`: contact shunts both cars, and theirs loses ground the
 * way yours loses speed. Its difficulty is still the number it was.
 */
export const FIELD_SHAKEN_PACE = 0.5;
export const FIELD_SHAKEN_TIME = 1.5;
/**
 * How much a car's pace wanders over the race.
 *
 * Without it every position is settled in the first corner and the rest of the
 * race is a procession. Kept small enough that the order still means what the
 * difficulties say it means, and small enough that no car in the field ever
 * goes quicker than the player's top speed.
 */
export const FIELD_WOBBLE = 0.06;
/**
 * How far apart the field runs across the road.
 *
 * The route is one line, and six cars driving down one line is one car drawn
 * six times. Each takes its own offset from it, which is also what makes a
 * pack look like a pack from behind.
 */
export const FIELD_LANE = m(3.2);
/**
 * The field gives a car coming through the middle of the road (#350's
 * playtest). Their lanes used to be fixed for the whole race, and two cars
 * `FIELD_LANE` either side of the line are closer together than two contact
 * circles (`CAR_RADIUS` each), so a pair running abreast was a wall: the owner
 * could not get past on the road and was busted leaving it.
 *
 * With the player within `FIELD_YIELD_RANGE` behind, a rival eases out to
 * `FIELD_LANE_OPEN` on its own side at `FIELD_LANE_EASE`, and back once they
 * are past. Open is wide enough that a pair leaves more than two contact
 * circles between them, and narrow enough to stay on the Halloway Rim, which
 * is 20 m kerb to kerb. They move out rather than over: a rival that moved
 * away from you could move into the car beside it.
 */
export const FIELD_LANE_OPEN = m(6);
export const FIELD_YIELD_RANGE = m(45);
export const FIELD_LANE_EASE = m(4);
/**
 * How far back each row of the field sits from the one in front (#217).
 *
 * The field used to be six cars *abreast*, `FIELD_LANE` apart, which is 19 m
 * of car across a road that is usually 10 m wide - so they overlapped, sat half
 * on the pavement, and moved as one object. A playtest called them "glued
 * together" and that is exactly what a row of six on a two-lane street is.
 *
 * Two columns and three rows is a starting grid: it fits the road, and the
 * staggering is what makes six cars read as six.
 *
 * Purely where they are *drawn*. Their scoring position is `dist` along the
 * route line and this does not touch it, so the ladder's calibration is
 * unaffected.
 */
export const FIELD_GRID = m(7);

/**
 * Speed Runs (#72).
 *
 * One lap, scored on your average speed over it rather than on where you
 * finished. It rewards a committed line and punishes every moment spent slow,
 * which makes traffic and corners cost far more than they do in a circuit: the
 * clock keeps running whatever you are doing, so a crash is unrecoverable in a
 * way it is not in a race you can claw back.
 *
 * The targets are set from measurement rather than from feel, and they were
 * set against the wrong measurement. 38% to 52% came from a reference driver
 * lapping at 57% to 68% - *on an empty road*, before #171 put traffic in the
 * probe. A race happens in traffic, nothing turns it off, and in traffic the
 * same driver holds a quarter of top speed. Every speed run in the game was
 * therefore unwinnable: `npm run playthrough` had an expert hold 19%, 23% and
 * 25% against a target of 40%.
 *
 * Re-derived against the traffic column, which is the one that describes a
 * game somebody plays: the easiest is a lap a competent driver completes, the
 * hardest wants a committed line and the boost.
 *
 * **And again after #347 (2026-09-28).** The owner averaged 192 km/h round the
 * Marrow Field Run against a target of 68 km/h, in a wrecked car: 0.44-0.50 of
 * top speed, where `citylap`'s perfect driver holds 0.41 in traffic. Now 0.347
 * for #10 - a clean lap by that driver clears it comfortably - rising to 0.50
 * for the boss, which is the owner's pace wrecked and so wants a committed
 * line in a car that is not.
 */
export const SPEEDRUN_TARGET = 0.32;
export const SPEEDRUN_TARGET_PER_DIFFICULTY = 0.18;
/** The average is meaningless in the first instants; hold it back until then. */
export const SPEEDRUN_SETTLE = 0.75;

/**
 * Ambushes (#92).
 *
 * You are dropped stationary, already surrounded, with one job: get out. It is
 * the purest expression of the pursuit system and it needs no route, no rivals
 * and no finish line - which is exactly why it is worth having, because the
 * pursuit is the best thing the city has and everything else asks you to stop
 * being chased in order to do it.
 *
 * Five of them, at rising heat, so the one you pick is the difficulty you
 * chose rather than the one the game decided you were ready for.
 */
export const AMBUSH_COUNT = 5;
export const AMBUSH_SPACING = m(1200);
/** How close you have to be for one to be offered. */
export const AMBUSH_RANGE = m(28);
/** The heat the first one starts at, and what each one after adds. */
export const AMBUSH_FIRST_LEVEL = 2;
/** How close the cars are when the trap springs, and how many there are. */
export const AMBUSH_RING = m(55);
export const AMBUSH_CARS = 4;
/** Rep for getting out of one, before the heat multiplier. */
export const REP_AMBUSH = 900;
/** How long the result holds before control comes back. */
export const AMBUSH_RESULT_HOLD = 5;
/**
 * The time to get out inside (#358), at heat one, and what each level adds.
 *
 * The reference game's ambush gives two and a half minutes; that is the top
 * of this range, at heat six. The floor is set by the pursuit itself: breaking
 * contact takes `LOSE_CONTACT_TIME` and a search at heat L lasts
 * `SEARCH_TIME + SEARCH_TIME_PER_LEVEL * (L - 1)`, so the quickest possible
 * escape is well inside the target at every level and a clean one has room.
 */
export const AMBUSH_TARGET = 75;
/**
 * A burnout (#360): stopped, throttle and brake held together. Held this long
 * on an event's marker, it starts the event - the reference game's "pull up
 * to the checkpoint and spin your wheels". Long enough not to happen by
 * accident while braking hard onto a start line, short enough to be a gesture
 * rather than a wait. Stopped means under this fraction of top speed.
 */
export const BURNOUT_TIME = 1;
export const BURNOUT_SPEED_FRAC = 0.04;
export const AMBUSH_TARGET_PER_LEVEL = 15;

/**
 * Car damage and repair (#95).
 *
 * Everything else in the city can be wrecked and the player cannot, which #94
 * made conspicuous. Damage accumulates from every impact and takes the car's
 * top speed and grip with it, so a long pursuit gets harder as it goes rather
 * than being the same pursuit for as long as you can stand it.
 *
 * It never ends the game. Being unable to drive is a bust with extra steps;
 * being *slow* is a pursuit you have to think your way out of.
 */
/** How much a flat-out hit on a building costs, as a fraction of the car. */
export const DAMAGE_PER_WALL = 0.35;
/** How much of a hit you dealt comes back at you. Ramming favours the rammer. */
export const DAMAGE_SHARE = 0.4;
/** Going through a roadblock, and dropping off a deck. */
export const DAMAGE_ROADBLOCK = 0.18;
export const DAMAGE_FALL = 0.22;
/** How much of the top speed and the grip a completely wrecked car has lost. */
export const DAMAGE_SPEED_LOSS = 0.28;
export const DAMAGE_GRIP_LOSS = 0.32;
/** Below this it is cosmetic: a scraped car should still drive like a car. */
export const DAMAGE_FREE = 0.2;
/**
 * The shortest gap between two hits that can both hurt you.
 *
 * Damage is charged per *impact*, not per step of contact, and without this it
 * was the second one. A car pressed against a building is reverted and bounced
 * by `move` every step and billed every step with it, so grinding along a wall
 * at 40 km/h cost more than driving into it at 300. Measured before this
 * existed: a lap of the Harbour Loop by the *perfect* driver spent 86% of a
 * car across 144 damaging steps, every one of them under 15% of top speed, and
 * every tier of driver finished every lap at 100%.
 *
 * Short enough that two real collisions a corner apart both land, long enough
 * that one collision is one collision.
 */
export const DAMAGE_HIT_GAP = 0.4;

/**
 * Drive-through repair (#95): no menu, no stopping.
 *
 * Six over a five-by-four kilometre city is one every couple of kilometres,
 * and a playtest said repairing was very hard - which it was, for a reason
 * that had nothing to do with the count: damage was being billed per frame of
 * contact, so a car arrived at 100% within a minute and stayed there. That is
 * fixed, and this is the other half. Fourteen is a shop somewhere in most
 * quarters rather than a pilgrimage, and the spacing keeps them from bunching.
 * Fifteen since Midtown south's, placed by hand (`PLACED_REPAIRS`, #487), so
 * the fourteen generated ones stay where they were.
 */
export const REPAIR_COUNT = 15;
export const REPAIR_SPACING = m(620);
/** How close you have to pass. A drive-through you have to aim at is a menu. */
export const REPAIR_RANGE = m(14);
/** Seconds the REPAIRED banner holds. */
export const REPAIR_FLASH = 2.5;

/**
 * Claiming a rival's car (#66).
 *
 * Beating them in the race is only the first half. They run, and you have to
 * catch and wreck the car to take it - which is what makes the ladder a fight
 * rather than a series of results, and what makes the takedown machinery from
 * #94 the point of the game rather than a thing you can do to traffic.
 */
/** How long you have before they are gone. */
export const CLAIM_TIME = 90;
/** Beyond this and they have lost you; stay there and the clock runs out fast. */
export const CLAIM_LOSE_RANGE = m(400);
/** How much tougher their car is than a police cruiser. It is the prize. */
export const CLAIM_TOUGHNESS = 2.6;
/** Their pace, as a fraction of *your* top speed. Always under 1. */
export const CLAIM_SPEED = 0.9;
/** How much heat a ladder rival brings with them. They draw the police too. */
export const CLAIM_HEAT = 0.45;
/**
 * Ladder races bring the police (#349, ADR-0011 decision 6). In the reference
 * game the Most Wanted race opens a pursuit two seconds in; the chase cannot
 * keep up at race pace, and the pressure is what it puts on the route and
 * what it leaves for after the finish.
 *
 * Called `RACE_CHASE_DELAY` after the lights, at a heat level that rises with
 * the rival: `RACE_CHASE_LEVEL` for the bottom of the ladder, plus
 * `RACE_CHASE_LEVEL_PER_DIFFICULTY` times their difficulty, so #10 opens at
 * level 2 and the boss at 4.
 */
export const RACE_CHASE_DELAY = 2;
export const RACE_CHASE_LEVEL = 1.7;
export const RACE_CHASE_LEVEL_PER_DIFFICULTY = 2.3;
/** Seconds the result holds before control comes back. */
export const CLAIM_RESULT_HOLD = 5;
/** Rep for taking one. It is the biggest single payment in the game. */
export const REP_CLAIM = 2500;

/**
 * The Quick Wheel (#90).
 *
 * The genre's entire menu system, and it never pauses. Held open with a key
 * while the world keeps running underneath, so there is never a screen between
 * the player and the city - which is a large part of why free roam feels
 * continuous rather than like a hub with menus attached.
 *
 * Nine entries a branch, picked by number rather than navigated to. Navigation
 * needs a cursor, a cursor needs direction keys, and the direction keys are
 * busy driving the car.
 */
export const WHEEL_ENTRIES = 9;

/**
 * Pursuit breakers (#57).
 *
 * Things in the city that break, and take whoever is behind you with them. A
 * gate across a yard entrance, a stack of pallets on an industrial kerb: you
 * go through it, it comes down, and the cars on your bumper are under it.
 *
 * That is the counterplay the pursuit was missing. Spike strips, roadblocks and
 * Enforcers are all things the police do to you; this is the one thing the
 * *city* does to them, and it turns knowing the map into an advantage rather
 * than a convenience.
 */
export const GATE_COUNT = 40;
/**
 * Where a gate goes (#361): the mouth of a shortcut. Two roads pass between
 * `GATE_GAP_MIN` (kerb to kerb) and `GATE_GAP_MAX` apart across dry, unbuilt
 * ground no steeper than `GATE_GRADE`, and the way round by road is at least
 * `GATE_DETOUR` times as far. Roads are sampled every `GATE_SAMPLE` to find
 * them. `breakables.ts` has the reasoning.
 */
export const GATE_GAP_MIN = m(12);
export const GATE_GAP_MAX = m(90);
export const GATE_GRADE = 0.2;
export const GATE_DETOUR = 3;
export const GATE_SAMPLE = m(40);
export const STACK_COUNT = 60;
/** Kept apart, so a corner is not four of them. */
export const BREAKER_SPACING = m(160);
/** How close the car has to be, and how fast, for one to come down. */
export const BREAKER_RANGE = m(7);
export const BREAKER_MIN_SPEED = 0.18;
/** Speed kept going through one. It gives, which is the whole difference. */
export const BREAKER_SPEED_KEPT = 0.86;
/** How much of the car it costs. Far less than a wall: it is meant to be used. */
export const BREAKER_DAMAGE = 0.05;
/**
 * How far the debris reaches, and what it does to a car caught in it.
 *
 * Scaled by how close the car was, so a cruiser on your bumper goes under it
 * and one at the edge of it comes out damaged and still driving. A flat number
 * would make the breaker either useless or a button that deletes the pursuit.
 */
export const BREAKER_BLAST = m(24);
export const BREAKER_BLAST_DAMAGE = 1.6;
/** Rep for property damage, and the heat it brings. */
export const REP_BREAKER = 120;
/**
 * Rep for a jump (#307), paid by the metre like a speed camera is paid by
 * the km/h: `REP_JUMP` for a jump of `REP_JUMP_DISTANCE`, in proportion
 * either side of it. Nothing under `REP_JUMP_MIN`, or a lifted slab taken
 * back and forth at walking pace would be the best-paid thing in the game,
 * and nothing for a hard landing - a jump you did not land is a crash.
 */
export const REP_JUMP = 200;
export const REP_JUMP_DISTANCE = m(100);
export const REP_JUMP_MIN = m(20);
export const BREAKER_HEAT = 0.02;
/** How long the wreckage lies there. */
export const BREAKER_DEBRIS = 7;

/**
 * The Kestrel Bay look (#75): bright, coastal, and blown out.
 *
 * Bloom is most of what makes the genre look the way it does. It is also the
 * one thing here that costs a real pass over the frame, so the numbers are
 * chosen to be readable rather than heavy: a threshold high enough that only
 * the sky, the water and the lit surfaces bleed, and a strength that reads as
 * sunlight rather than as a smeared lens.
 */
export const BLOOM_STRENGTH = 0.32;
export const BLOOM_RADIUS = 0.55;
export const BLOOM_THRESHOLD = 0.86;
/** Bloom is rendered at a fraction of the frame; it is a blur, not detail. */
export const BLOOM_SCALE = 0.5;

/**
 * Police radio chatter (#76).
 *
 * Most of why a pursuit feels alive, and not decoration: dispatch calls a
 * roadblock before you can see it and air support before you can hear it, so
 * the radio is a tell for hazards rather than atmosphere over the top of them.
 *
 * Subtitles and a squelch burst, no recorded speech. Voice assets are a whole
 * production the project does not have and would not be original if it did.
 */
/** Seconds between callouts, so a burst of events is a conversation not a wall. */
export const RADIO_GAP = 2.2;
/** How long a line stays on screen, and how many are shown at once. */
export const RADIO_HOLD = 7;
/**
 * The story's captions (#362): how long one stays up, and the least time
 * between two, so a claim that also finishes the ladder reads as two lines
 * rather than one replacing the other before it is read.
 */
export const STORY_HOLD = 6;
export const STORY_GAP = 1.5;
export const RADIO_LINES = 3;
/** Anything still queued after this is stale news and is dropped. */
export const RADIO_QUEUE = 4;
