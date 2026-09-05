import type { ColorSet } from './types';
import type { BuildingCharacter, DistrictCharacter, DistrictKind } from './city/types';

/** Logical canvas resolution. The canvas is scaled to fit via CSS. */
export const WIDTH = 1024;
export const HEIGHT = 640;

/** World geometry, in arbitrary world units. */
export const ROAD_WIDTH = 2000;
export const SEGMENT_LENGTH = 200;
export const RUMBLE_LENGTH = 3; // segments per rumble-strip colour band
export const LANES = 3;

/** Camera / projection. */
export const FIELD_OF_VIEW = 100; // degrees
export const CAMERA_HEIGHT = 1000;
export const CAMERA_DEPTH = 1 / Math.tan((FIELD_OF_VIEW / 2) * (Math.PI / 180));

/** How many segments ahead to draw, and how quickly they fade into fog. */
export const DRAW_DISTANCE = 300;
export const FOG_DENSITY = 5;
export const FOG_COLOR = '#0d2417';

/**
 * How sharply an authored `curve` value bends the road, in radians of heading
 * per world unit travelled. The car's heading is real now, so a bend rotates
 * the road under it rather than shoving it sideways: hold a straight heading
 * through a corner and you run wide on your own.
 */
export const CURVE_TO_HEADING = 2.42e-5;
/** Fastest the car can be turned at low speed, in radians per second. */
export const TURN_RATE = 2.2;
/**
 * Lateral acceleration the tyres can hold, in world units per second squared.
 *
 * This is what makes speed matter in a corner. Turning at yaw rate w while
 * travelling at v needs lateral acceleration v*w, so the fastest the car can be
 * turned is LATERAL_GRIP / v: the quicker you go, the wider you turn. Without
 * it, both the steering and the road's own curvature scale with speed, they
 * cancel, and every bend can be taken flat out however sharp it is.
 */
export const LATERAL_GRIP = 14400;
/**
 * How far the car may point away from the road direction. The track model can
 * only describe a car going forwards along it, so it cannot turn around; the
 * limit goes away with the track itself in issue #83.
 */
export const HEADING_LIMIT = 0.9;

/** Top reverse speed as a fraction of forward max speed. */
export const REVERSE_SPEED_FRAC = 0.18;

/** Nitrous + drift. */
export const NITRO_SPEED_MULT = 1.28; // top speed multiplier while boosting (must stay < 2)
export const NITRO_ACCEL_MULT = 2.6; // acceleration multiplier while boosting
export const NITRO_DRAIN = 0.5; // charge/sec spent while boosting (~2s from full)
export const NITRO_RECHARGE = 0.16; // charge/sec regained while not boosting
export const NITRO_MIN_ENGAGE = 0.25; // charge needed to light the boost again once it runs dry
export const NITRO_BLEED_FRAC = 0.6; // overspeed shed per second (× maxSpeed) once boost ends

/** Fixed physics timestep (seconds). */
export const STEP = 1 / 60;

export const COLORS: Record<'LIGHT' | 'DARK', ColorSet> = {
  LIGHT: { road: '#6b6b6b', grass: '#12902c', rumble: '#e9e9e9', lane: '#ffffff' },
  DARK: { road: '#606060', grass: '#0f7f26', rumble: '#c0392b' },
};

/** Traffic. */
export const TRAFFIC_COUNT = 24;
/** Car body width in world units (road half-width is ROAD_WIDTH, so this spans about half a lane). */
export const CAR_WIDTH_WORLD = 650;
/** Car sprite height as a fraction of its drawn width. */
export const CAR_ASPECT = 0.7;
/** Car width in offset units (-1..1 across the road), used for collision tests. */
export const CAR_WIDTH_OFFSET = CAR_WIDTH_WORLD / ROAD_WIDTH;
export const CAR_COLORS = [
  '#c94b4b',
  '#4b7bc9',
  '#d8a13a',
  '#3ca35a',
  '#9aa0aa',
  '#b0483f',
  '#6a4bc9',
];

/** Distance from the camera to the player car. */
export const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;

/** Police pursuit. Cops are tracked by how far they trail the player (world units). */
export const COP_MAX_SPEED_FRAC = 0.9; // cop top speed vs player max (base)
export const COP_HEAT_SPEED_FRAC = 0.08; // extra at full heat (<1 total, so always outrunnable)
export const COP_LANE_KP = 1.4; // how quickly the cop slides into your lane
export const COP_FIRST_SPAWN = 12; // seconds before the first pursuit
export const COP_RESPAWN = 20; // delay before a new pursuit after escaping
export const COP_BUST_COOLDOWN = 15; // delay before a new pursuit after a bust
export const COP_SPAWN_INTERVAL = 3; // seconds between adding cops within a pursuit
export const COP_SPAWN_DISTANCE = 1600; // how far back a cop enters
export const COP_OUTRUN_DISTANCE = 5000; // trail farther than this and the cop is lost
export const COP_PIN_LEAD = 220; // render lead when on your bumper (large / near)
export const COP_FAR_LEAD = 1400; // render lead when far behind (small / up-screen)
export const PURSUIT_RANGE = 3000; // a cop trailing within this counts as "engaged"
export const BUST_DISTANCE = 200; // this close (or closer) builds the bust timer
export const BUST_TIME = 3.5; // seconds pinned before BUSTED
export const ESCAPE_TIME = 4; // seconds clear of cops before ESCAPED
export const MAX_COPS = 3; // spawn-count cap at high heat
export const MAX_HEAT_LEVEL = 3; // discrete heat levels for the HUD
export const HEAT_RISE = 0.1; // heat/sec while a cop is close
export const HEAT_DECAY = 0.12; // heat/sec while clear

/** Seconds the BUSTED overlay holds before the pursuit resets. */
export const BUST_HOLD = 3;
/** Seconds the ESCAPED banner lingers. */
export const ESCAPED_FLASH = 2.5;

/** Ladder races. */
export const RACE_DISTANCE = 400000; // world units from start to finish
export const COUNTDOWN_TIME = 3; // seconds of 3-2-1 before GO
export const RIVAL_BASE_SPEED_FRAC = 0.8; // rival speed vs player max at difficulty 0
export const RIVAL_DIFF_SPEED_FRAC = 0.068; // extra at difficulty 1; the top rival (0.97) needs nitrous to beat
export const RIVAL_LANE = 0.4; // lane the rival lines up in
export const RIVAL_NEAR_LEAD = 420; // minimum render lead, so the rival is off the camera at the start line

/** Roadside scenery (purely visual). */
export const PROP_SPACING = 9; // a roadside prop every N segments
export const PROP_WORLD = 1150; // base prop size in world units
export const PROP_OFFSET = 1.55; // lateral offset; >1 places it beyond the road edge
/** Collision width of a prop in world units: narrower than it is drawn, so grazing the foliage is free. */
export const PROP_HIT_WIDTH = 700;
export const PROP_HIT_OFFSET = PROP_HIT_WIDTH / ROAD_WIDTH;
/** Sideways nudge back toward the road on impact, so a car cannot wedge against a prop. */
export const PROP_DEFLECT = 0.12;

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
 * Overall extent (ADR-0005). Sized from what the game needs rather than from a
 * remembered figure: a pursuit should be able to cross the map in two to four
 * minutes at the pace the car actually holds, which is a city about this big.
 */
export const CITY_WIDTH = m(5000);
export const CITY_DEPTH = m(4000);

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

/** One lane, matching the road the car already drives on (ROAD_WIDTH over LANES). */
export const CITY_LANE_WIDTH = ROAD_WIDTH / LANES;

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
export const CITY_BAY_DEPTH = m(750); // how far inland the bay reaches on average
export const CITY_BAY_WAVE = m(380); // how far the coastline wanders either side of that
export const CITY_RIVER_WIDTH = m(160); // at its narrowest, upstream
export const CITY_RIVER_MOUTH = 1.7; // how much wider it is where it meets the bay
export const CITY_RIVER_WANDER = m(600); // how far the channel meanders off its mouth
/** How finely water outlines are sampled. */
export const CITY_WATER_STEP = m(40);
/** How far the sea is drawn beyond the map edge, so the bay reaches the horizon. */
export const CITY_SEA_MARGIN = m(2500);

/**
 * Crossings (ADR-0005, rule 2). Few, and deliberate: a city where half the
 * roads bridge the river has no chokepoints in it. Generation adds more only
 * if the network would otherwise come apart.
 */
export const CITY_BRIDGES = 4;
/** The longest gap a bridge will span. Wider than this and the road dead-ends. */
export const CITY_MAX_BRIDGE = m(700);
/** Bridges are kept this far apart, so they are separate decisions to make. */
export const CITY_BRIDGE_SPACING = m(1200);
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
export const LAMP_KERB_GAP = m(1.2);
export const SIGN_KERB_GAP = m(1.6);
export const BARRIER_SPACING = m(6);
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

/** Ramps: the only way between the levels. */
export const RAMP_COUNT_PER_SIDE = 2;
export const RAMP_MIN_RUN = m(190);
export const RAMP_MAX_RUN = m(320);
export const RAMP_LANES = 2;
export const RAMP_SPEED = kmh(70);

/** One stretch of the loop dives instead of climbing, which is a tunnel. */
export const TUNNEL_DEPTH = m(9);
/** How much of the loop is tunnel, as a fraction of its perimeter. */
export const TUNNEL_LENGTH = 0.12;
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
/** Where a new car is put: on the interstate ring is wrong, so a street it is. */
export const SPAWN_SEARCH = m(180);

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
export const TRAFFIC_IN_CITY = 75;
export const TRAFFIC_RADIUS = m(360);
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
 * Deliberately its own constant rather than the track's `COP_OUTRUN_DISTANCE`,
 * which is a *trail* distance along one road and works out at about 37 m in
 * world units. Reusing it culled every cop on the step after it spawned.
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

/** The minimap (#89): how far it reaches, and how big it is drawn. */
export const MINIMAP_RANGE = m(280);
export const MINIMAP_SIZE = 190;

/**
 * The six heat levels (#58), and what each one sends after you.
 *
 * Escalation happens *within* a pursuit rather than being gated behind career
 * progress: the longer they have you, the heavier what arrives. That is the
 * framework the rest of the pursuit work hangs off - roadblocks, spike strips
 * and the helicopter all key off a level rather than off a raw heat number.
 *
 * `speed` is a fraction of the player's top speed and stays under 1 at every
 * level, level six included. That is not a detail: a pursuit you cannot
 * outrun on speed alone is a pursuit with no answer, and `npm run feel` exists
 * partly to keep checking it.
 */
export type CopKind = 'cruiser' | 'unmarked' | 'state' | 'suv' | 'federal' | 'elite';

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
};

export interface HeatLevel {
  /** What can turn up at this level. */
  units: CopKind[];
  /** How many can be out at once. */
  maxCops: number;
  /** Base speed as a fraction of the player's top speed. Always under 1. */
  speed: number;
}

/**
 * Note the speeds: they are the level's base, and a unit's `pace` multiplies
 * it. The product has to stay under 1 for *every* unit the level can send, not
 * just the average one - the first version of this table looked fine per level
 * and put elite units at 105% of the player's top speed, which is a pursuit
 * with no answer.
 */
export const HEAT_LEVELS: HeatLevel[] = [
  { units: ['cruiser'], maxCops: 2, speed: 0.84 },
  { units: ['cruiser', 'unmarked'], maxCops: 3, speed: 0.85 },
  { units: ['unmarked', 'state'], maxCops: 4, speed: 0.86 },
  { units: ['state', 'suv'], maxCops: 4, speed: 0.87 },
  { units: ['state', 'suv', 'federal'], maxCops: 5, speed: 0.875 },
  { units: ['federal', 'elite', 'suv'], maxCops: 6, speed: 0.88 },
];

/** How many heat levels there are. Six, as the genre has had for twenty years. */
export const HEAT_LEVEL_COUNT = HEAT_LEVELS.length;

/**
 * How fast heat builds and cools in the city.
 *
 * Its own constants rather than the track's, which fill the bar in ten seconds
 * of contact. That is right for a single-track pursuit that is over in a
 * minute and wrong for six levels: escalation has to be something you feel
 * happening to you, not a number that saturates before you have found a corner
 * to lose them on. About a minute and a half of being held to reach level six.
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
/** Seconds out of sight before the pursuit drops into a search. */
export const LOSE_CONTACT_TIME = 4;
/** How long the search lasts at heat level one, and how much each level adds. */
export const SEARCH_TIME = 18;
export const SEARCH_TIME_PER_LEVEL = 7;
/** How big the search area is, and how much each heat level widens it. */
export const SEARCH_RADIUS = m(320);
export const SEARCH_RADIUS_PER_LEVEL = m(70);

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
