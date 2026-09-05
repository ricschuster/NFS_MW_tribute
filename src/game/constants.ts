import type { ColorSet } from './types';
import type { DistrictCharacter, DistrictKind } from './city/types';

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

/** Overall extent. Water is off the north (+z) edge; the city is the land. */
export const CITY_WIDTH = m(3000);
export const CITY_DEPTH = m(2400);

/**
 * Arterials are laid first and cross the whole city, so every local street
 * meets one at both ends and the network cannot come out in pieces. Counts
 * include both edges, which is what gives the city a perimeter road.
 */
export const CITY_ARTERIAL_COLS = 6;
export const CITY_ARTERIAL_ROWS = 5;
/** How far an interior arterial may wander, as a fraction of the even spacing. */
export const CITY_ARTERIAL_JITTER = 0.16;
export const CITY_ARTERIAL_LANES = 4;
export const CITY_ARTERIAL_SPEED = kmh(90);

/** One lane, matching the road the car already drives on (ROAD_WIDTH over LANES). */
export const CITY_LANE_WIDTH = ROAD_WIDTH / LANES;

/** How far the districts reach from their anchors. */
export const CITY_DOWNTOWN_RADIUS = m(620);
export const CITY_INDUSTRIAL_RADIUS = m(700);
/**
 * How far the waterfront spreads either side of the harbour. Less than half
 * the city width on purpose: a shore that is waterfront from end to end reads
 * as a band drawn on a map rather than as a port with a city behind it.
 */
export const CITY_WATERFRONT_REACH = m(900);

/**
 * What each district is like to drive through. Block size and its variation do
 * most of the work: a tight regular grid downtown, long shallow blocks facing
 * the water, and sprawling lots with few streets out on the industrial edge.
 */
export const DISTRICTS: Record<DistrictKind, DistrictCharacter> = {
  downtown: { blockX: m(80), blockZ: m(80), jitter: 0.08, skip: 0.03, lanes: 2, speed: kmh(50) },
  midtown: { blockX: m(120), blockZ: m(100), jitter: 0.22, skip: 0.1, lanes: 2, speed: kmh(60) },
  waterfront: { blockX: m(150), blockZ: m(170), jitter: 0.18, skip: 0.12, lanes: 2, speed: kmh(70) },
  industrial: { blockX: m(190), blockZ: m(180), jitter: 0.14, skip: 0.15, lanes: 2, speed: kmh(70) },
};
