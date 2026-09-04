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

/** Fixed physics timestep (seconds). */
export const STEP = 1 / 60;

export const COLORS: Record<'LIGHT' | 'DARK', ColorSet> = {
  LIGHT: { road: '#6b6b6b', grass: '#12902c', rumble: '#e9e9e9', lane: '#ffffff' },
  DARK: { road: '#606060', grass: '#0f7f26', rumble: '#c0392b' },
};
