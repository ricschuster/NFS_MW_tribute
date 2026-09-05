import {
  CITY_BAY_DEPTH,
  CITY_BAY_WAVE,
  CITY_RIVER_WIDTH,
  CITY_RIVER_WANDER,
  CITY_RIVER_MOUTH,
  CITY_WATER_STEP,
} from '../constants';
import type { Rng } from './rng';
import type { Rect, Vec2, WaterBody } from './types';

const TAU = Math.PI * 2;

/**
 * Water comes before land (ADR-0005). The bay eats into the north edge with a
 * shoreline that wanders, and a river runs inland from it and cuts the city in
 * two. The street network is generated over the whole map and then clipped
 * against this, which is what turns a rectangle of streets into a coast.
 */
export interface Water {
  /** True where there is water instead of ground. */
  isWater(x: number, z: number): boolean;
  /** The shoreline at this x: the bay lies north of this z. */
  shoreAt(x: number): number;
  /** The outlines, for the renderer and the map tool. */
  bodies: WaterBody[];
}

/**
 * Two sines at unrelated frequencies, in [-1, 1]. Enough wander that a
 * coastline does not read as drawn with a ruler, still smooth enough that a
 * road meets it at a sane angle.
 */
function wobble(rng: Rng): (t: number) => number {
  const f1 = rng.range(1.1, 2.3);
  const p1 = rng.range(0, TAU);
  const f2 = rng.range(2.7, 4.6);
  const p2 = rng.range(0, TAU);
  return (t) => 0.62 * Math.sin(f1 * t * TAU + p1) + 0.38 * Math.sin(f2 * t * TAU + p2);
}

export function makeWater(rng: Rng, bounds: Rect): Water {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const coast = wobble(rng);
  const meander = wobble(rng);
  // Where the river meets the sea. Everything else about the river follows it.
  const mouth = rng.range(-0.3, 0.3) * width;

  const shoreAt = (x: number) =>
    bounds.maxZ - CITY_BAY_DEPTH + CITY_BAY_WAVE * coast((x - bounds.minX) / width);

  const riverX = (z: number) => mouth + CITY_RIVER_WANDER * meander((z - bounds.minZ) / depth);
  // The channel opens out as it reaches the bay, so the mouth is an estuary
  // rather than a canal that stops dead at the coast.
  const riverHalfWidth = (z: number) =>
    (CITY_RIVER_WIDTH * (1 + CITY_RIVER_MOUTH * ((z - bounds.minZ) / depth))) / 2;

  const isWater = (x: number, z: number) =>
    z > shoreAt(x) || Math.abs(x - riverX(z)) < riverHalfWidth(z);

  return { isWater, shoreAt, bodies: outlines(bounds, shoreAt, riverX, riverHalfWidth) };
}

/** Sample the two water bodies into closed outlines. They may overlap at the estuary. */
function outlines(
  bounds: Rect,
  shoreAt: (x: number) => number,
  riverX: (z: number) => number,
  riverHalfWidth: (z: number) => number,
): WaterBody[] {
  const bay: Vec2[] = [];
  for (let x = bounds.minX; x < bounds.maxX; x += CITY_WATER_STEP) {
    bay.push({ x, z: shoreAt(x) });
  }
  bay.push({ x: bounds.maxX, z: shoreAt(bounds.maxX) });
  bay.push({ x: bounds.maxX, z: bounds.maxZ });
  bay.push({ x: bounds.minX, z: bounds.maxZ });

  // Up the west bank and back down the east one.
  const river: Vec2[] = [];
  const back: Vec2[] = [];
  for (let z = bounds.minZ; z < bounds.maxZ; z += CITY_WATER_STEP) {
    river.push({ x: riverX(z) - riverHalfWidth(z), z });
    back.push({ x: riverX(z) + riverHalfWidth(z), z });
  }
  river.push(...back.reverse());

  return [
    { kind: 'bay', outline: bay },
    { kind: 'river', outline: river },
  ];
}
