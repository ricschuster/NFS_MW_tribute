import type { ColorSet } from './types';

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

/** How hard curves push the player toward the outside of a bend. */
export const CENTRIFUGAL = 0.24;

/** Steering authority kept when nearly stopped, so you can peel off after a crash. */
export const MIN_STEER = 0.3;
/**
 * Steering authority left at top speed, as a fraction. Below 1 the car goes
 * light at the top end, so a fast bend has to be taken with a lift rather than
 * a flick of the wheel.
 */
export const HIGH_SPEED_GRIP = 0.7;
/** Top reverse speed as a fraction of forward max speed. */
export const REVERSE_SPEED_FRAC = 0.18;

/** Nitrous + drift. */
export const NITRO_SPEED_MULT = 1.28; // top speed multiplier while boosting (must stay < 2)
export const NITRO_ACCEL_MULT = 2.6; // acceleration multiplier while boosting
export const NITRO_DRAIN = 0.5; // charge/sec spent while boosting (~2s from full)
export const NITRO_RECHARGE = 0.16; // charge/sec regained while not boosting
export const NITRO_MIN_ENGAGE = 0.5; // charge needed to light the boost again once it runs dry
export const NITRO_BLEED_FRAC = 0.6; // overspeed shed per second (× maxSpeed) once boost ends
export const DRIFT_SLIDE = 0.35; // extra lateral slide when cornering hard at speed

/** Fixed physics timestep (seconds). */
export const STEP = 1 / 60;

export const COLORS: Record<'LIGHT' | 'DARK', ColorSet> = {
  LIGHT: { road: '#6b6b6b', grass: '#12902c', rumble: '#e9e9e9', lane: '#ffffff' },
  DARK: { road: '#606060', grass: '#0f7f26', rumble: '#c0392b' },
};

/** Traffic. */
export const TRAFFIC_COUNT = 40;
/** Car body width in world units (road half-width is ROAD_WIDTH, so this spans ~1 lane). */
export const CAR_WIDTH_WORLD = 1000;
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
export const COP_FIRST_SPAWN = 3; // seconds before the first pursuit
export const COP_RESPAWN = 5; // delay before a new pursuit after escaping
export const COP_BUST_COOLDOWN = 6; // delay before a new pursuit after a bust
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

/** Blacklist races. */
export const RACE_DISTANCE = 400000; // world units from start to finish
export const COUNTDOWN_TIME = 3; // seconds of 3-2-1 before GO
export const RIVAL_BASE_SPEED_FRAC = 0.85; // rival speed vs player max at difficulty 0
export const RIVAL_DIFF_SPEED_FRAC = 0.12; // extra at difficulty 1; the top rival (0.97) needs nitrous to beat
export const RIVAL_LANE = 0.4; // lane the rival lines up in
export const RIVAL_NEAR_LEAD = 420; // render lead when the rival is just ahead (bigger = keeps it on-screen at the line)
export const RIVAL_FAR_LEAD = 1500; // render lead when the rival is far ahead
export const RIVAL_VIEW_RANGE = 4000; // race-distance gap mapped across near..far lead

/** Roadside scenery (purely visual). */
export const PROP_SPACING = 9; // a roadside prop every N segments
export const PROP_WORLD = 1150; // base prop size in world units
export const PROP_OFFSET = 1.55; // lateral offset; >1 places it beyond the road edge
