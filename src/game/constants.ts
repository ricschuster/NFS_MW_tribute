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
export const CENTRIFUGAL = 0.3;

/** Steering authority kept when nearly stopped, so you can peel off after a crash. */
export const MIN_STEER = 0.3;
/** Top reverse speed as a fraction of forward max speed. */
export const REVERSE_SPEED_FRAC = 0.18;

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

/** Distance from the camera to the player car; also the pursuit reference gap. */
export const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;

/** Police pursuit. */
export const COP_TARGET_LEAD = 900; // world units the cop tries to hold ahead of the player
export const COP_SPAWN_LEAD = 1700; // spawns further ahead, then closes in
export const COP_MAX_SPEED_FRAC = 0.7; // cop top speed vs player max (base)
export const COP_HEAT_SPEED_FRAC = 0.28; // extra cop top speed at full heat (<1 total, so always outrunnable)
export const COP_LEAD_KP = 1.5; // station-keeping gain on the lead error
export const COP_LANE_KP = 1.4; // how quickly the cop slides into your lane
export const COP_FIRST_SPAWN = 3; // seconds before the first cop appears
export const COP_RESPAWN = 5; // seconds between cops
export const HEAT_RISE = 0.05; // heat gained per second while a cop is active
export const HEAT_DECAY = 0.12; // heat lost per second while clear
