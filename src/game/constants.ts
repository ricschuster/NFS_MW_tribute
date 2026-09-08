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
export const NITRO_RECHARGE = 0.16; // charge/sec regained while not boosting
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
export const RIVAL_BASE_SPEED_FRAC = 0.2635;
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
export const RIVAL_DIFF_SPEED_FRAC = 0.0765;

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
 * Arterials are laid first and cross the whole city, so every local street
 * meets one at both ends and the network cannot come out in pieces. Counts
 * include both edges, which is what gives the city a perimeter road.
 */
export const CITY_ARTERIAL_COLS = 9;
export const CITY_ARTERIAL_ROWS = 7;
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

/** How far the districts reach from their anchors. */
export const CITY_DOWNTOWN_RADIUS = m(850);
export const CITY_INDUSTRIAL_RADIUS = m(1250);
/**
 * How far the docks reach from the harbour. The waterfront is a port, not
 * every square metre that happens to touch water: a city whose whole coast and
 * both riverbanks are wharves has no city behind them.
 */
export const CITY_WATERFRONT_RADIUS = m(1350);

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
 * How much of a body of land is city, as a fraction of its own radius
 * (ADR-0007 rule 3).
 *
 * The street grid used to cover every cell of the map's rectangle, which is
 * what made Kestrel Bay one even sprawl from coast to coast: as dense at the
 * water as it was downtown, and nowhere that was not city. Measured from each
 * lobe's own middle, so a big body of land carries a city and a small one
 * carries a town.
 *
 * This is the number that decides how much of the map is streets, and therefore
 * how much of it is left for the roads that are not city (#260).
 */
export const CITY_BUILT_UP = 0.62;

export const CITY_LOBES = 4;
export const CITY_CHANNELS = 2;
export const CITY_LAND_LEVEL = 0.46;
export const CITY_LOBE_SPREAD = 0.8;
export const CITY_COAST_RIPPLE = 0.17;
export const CITY_CHANNEL_CUT = 0.9;
export const CITY_CHANNEL_WIDTH = m(150);
export const CITY_CHANNEL_BOW = m(350);

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
export const TERRAIN_CELL = m(10);
export const TERRAIN_SHORE = m(1400);
export const TERRAIN_CORE_FLAT = 0.8;
/** As a fraction of the map's half-diagonal, so the basin scales with the map. */
export const TERRAIN_CORE_RADIUS = 0.55;
/** How much taller the rim is than the noise alone would make it. */
export const TERRAIN_RIM_LIFT = 0.9;
export const TERRAIN_SEABED = m(6);
export const TERRAIN_STREAM = 0x7e44a1;
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
 * What each district is like to drive through. Block size and its variation do
 * most of the work: a tight regular grid downtown, long shallow blocks facing
 * the water, and sprawling lots with few streets out on the industrial edge.
 */
export const DISTRICTS: Record<DistrictKind, DistrictCharacter> = {
  downtown: { blockX: m(80), blockZ: m(80), jitter: 0.08, skip: 0.03, lanes: 2, speed: kmh(50), winding: 0 },
  midtown: { blockX: m(150), blockZ: m(130), jitter: 0.26, skip: 0.2, lanes: 2, speed: kmh(60), winding: 0.45 },
  waterfront: { blockX: m(170), blockZ: m(190), jitter: 0.2, skip: 0.24, lanes: 2, speed: kmh(70), winding: 0.35 },
  industrial: { blockX: m(250), blockZ: m(230), jitter: 0.18, skip: 0.3, lanes: 2, speed: kmh(70), winding: 0.2 },
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
  waterfront: { lot: m(58), setback: m(7), minHeight: m(7), maxHeight: m(20), empty: 0.3, landmark: 0.02, kind: 'shed' },
  industrial: { lot: m(72), setback: m(10), minHeight: m(6), maxHeight: m(18), empty: 0.36, landmark: 0.02, kind: 'shed' },
};
/** How much taller a landmark stands than the district's ordinary ceiling. */
export const BUILDING_LANDMARK_MULT = 1.9;
/** A lot smaller than this is a gap between buildings, not a plot. */
export const BUILDING_MIN_LOT = m(14);

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
export const INTERSTATE_INSET = 0.23; // of the map, in from each edge
export const INTERSTATE_HEIGHT = m(12);
export const INTERSTATE_LANES = 6;
export const INTERSTATE_SPEED = kmh(140);
/** How often a support pillar goes under the deck. */
export const INTERSTATE_PILLAR_SPACING = m(45);
/** Deck resolution: short enough that a slope reads as a slope. */
export const INTERSTATE_SEGMENT = m(60);

/**
 * Freeway spurs (#115). The loop on its own is a circuit and nothing else, so
 * every long fast line in the city is the same line. Spurs run off it to the
 * map edges, which gives the network ends as well as a middle - and an end is
 * somewhere a pursuit can be pushed towards.
 */
export const FREEWAY_SPURS = 3;
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
export const RAMP_COUNT_PER_SIDE = 4;
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

/** One stretch of the loop dives instead of climbing, which is a tunnel. */
export const TUNNEL_DEPTH = m(9);
/** How much of the loop is tunnel, as a fraction of its perimeter. */
export const TUNNEL_LENGTH = 0.12;
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
/** Speed kept after hitting a building, as a fraction. */
export const HIT_SPEED_KEPT = 0.25;
/** How quickly the car settles onto the height of the road it is on. */
export const RIDE_RATE = 8;
/** Fall acceleration when the car leaves the deck, in world units per second squared. */
export const GRAVITY = m(22);
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
 * Down from 75. A playtest said there was too much traffic in general, and the
 * numbers agree with the feeling: a good driver holds a quarter of top speed
 * in traffic against half on an empty road, so traffic is not a hazard among
 * others - it is the single biggest thing deciding how fast the game is. It is
 * also now multiplied twice, by district and by hour, and 75 was set when it
 * was multiplied by neither.
 */
export const TRAFFIC_IN_CITY = 52;
export const TRAFFIC_RADIUS = m(360);
/**
 * How much of that each district gets (#180).
 *
 * It used to be exactly constant: the same seventy-five cars in a downtown
 * canyon and on an industrial back street, which is a large thing to have flat
 * given traffic roughly halves the pace a good driver can hold. A playtest
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
  waterfront: 0.75,
  industrial: 0.5,
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
export const CHASE_FOV = 58;
export const CHASE_FOV_FAST = 74;

/** The crash cut: how long it holds, and how far off it stands. */
export const CRASH_HOLD = 1.4;
export const CRASH_DISTANCE = m(13);
/** The opening pass around the car before you take control. */
export const INTRO_HOLD = 2.6;
export const INTRO_RADIUS = m(17);
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
export const HEAT_LEVELS: HeatLevel[] = [
  { units: ['cruiser'], maxCops: 2, speed: 0.84, enforcers: 0, enforcerUnit: 'suv' },
  { units: ['cruiser', 'unmarked'], maxCops: 3, speed: 0.85, enforcers: 0, enforcerUnit: 'suv' },
  { units: ['unmarked', 'state'], maxCops: 4, speed: 0.86, enforcers: 1, enforcerUnit: 'suv' },
  { units: ['state', 'suv'], maxCops: 4, speed: 0.87, enforcers: 1, enforcerUnit: 'enforcer' },
  { units: ['state', 'suv', 'federal'], maxCops: 5, speed: 0.875, enforcers: 2, enforcerUnit: 'enforcer' },
  { units: ['federal', 'elite', 'suv'], maxCops: 6, speed: 0.88, enforcers: 2, enforcerUnit: 'enforcer' },
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
export const PATROL_IN_CITY = 4;
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
/** Finishing second still pays: the ladder should never be a hard wall. */
export const REP_RACE_LOSS = 200;

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
 */
export const SPEEDRUN_TARGET = 0.2;
export const SPEEDRUN_TARGET_PER_DIFFICULTY = 0.08;
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
 */
export const REPAIR_COUNT = 14;
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
export const RADIO_LINES = 3;
/** Anything still queued after this is stale news and is dropped. */
export const RADIO_QUEUE = 4;
