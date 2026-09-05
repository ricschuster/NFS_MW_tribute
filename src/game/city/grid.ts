import { CITY_GRID_CELL, SURFACE_REACH } from '../constants';
import type { Building, City, CityRoad, Rect, Vec2 } from './types';

/**
 * A uniform grid over the city, so "what is near the car" is a lookup rather
 * than a scan of two thousand roads and eight thousand buildings.
 *
 * Uniform rather than a quadtree because the city is uniform: blocks are all
 * within a factor of three of each other, so the cheap structure is also the
 * right one. Built once and shared, like the city itself.
 */
export class CityGrid {
  private readonly roadCells = new Map<string, number[]>();
  private readonly buildingCells = new Map<string, number[]>();

  constructor(private readonly city: City) {
    city.roads.forEach((road, id) => insert(this.roadCells, carriageway(city, road), id));
    city.buildings.forEach((building, id) => insert(this.buildingCells, building.footprint, id));
  }

  roadsNear(x: number, z: number): CityRoad[] {
    return (this.roadCells.get(cellKey(x, z)) ?? []).map((id) => this.city.roads[id]);
  }

  buildingsNear(x: number, z: number): Building[] {
    return (this.buildingCells.get(cellKey(x, z)) ?? []).map((id) => this.city.buildings[id]);
  }
}

const cellKey = (x: number, z: number) =>
  `${Math.floor(x / CITY_GRID_CELL)}|${Math.floor(z / CITY_GRID_CELL)}`;

/** Put `id` in every cell the rectangle touches. */
function insert(cells: Map<string, number[]>, r: Rect, id: number): void {
  for (let gx = Math.floor(r.minX / CITY_GRID_CELL); gx <= Math.floor(r.maxX / CITY_GRID_CELL); gx++) {
    for (let gz = Math.floor(r.minZ / CITY_GRID_CELL); gz <= Math.floor(r.maxZ / CITY_GRID_CELL); gz++) {
      const key = `${gx}|${gz}`;
      const cell = cells.get(key);
      if (cell) cell.push(id);
      else cells.set(key, [id]);
    }
  }
}

/**
 * A box that certainly contains a road's carriageway. Good enough to bucket it
 * in the grid; not the shape of the road, which for a road at an angle is a
 * long thin band across a much larger box. Use `distanceToRoad` to actually
 * ask whether a point is on it.
 */
export function carriageway(city: City, road: CityRoad): Rect {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const half = road.width / 2;
  return {
    minX: Math.min(a.x, b.x) - half,
    maxX: Math.max(a.x, b.x) + half,
    minZ: Math.min(a.z, b.z) - half,
    maxZ: Math.max(a.z, b.z) + half,
  };
}

/** Shortest distance from a point to a line segment. */
export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** How far a point is from a road's centreline, whatever direction it runs. */
export function distanceToRoad(city: City, road: CityRoad, x: number, z: number): number {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  return distanceToSegment(x, z, a.x, a.z, b.x, b.z);
}

/**
 * Where two segments cross, or null if they do not. Needed as soon as roads
 * stop being axis-aligned: a crossing used to be "one road's x, the other's z".
 */
export function segmentIntersection(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
): Vec2 | null {
  const d1x = p2.x - p1.x;
  const d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x;
  const d2z = p4.z - p3.z;

  const denominator = d1x * d2z - d1z * d2x;
  if (Math.abs(denominator) < 1e-9) return null; // parallel

  const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / denominator;
  const u = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return { x: p1.x + d1x * t, z: p1.z + d1z * t };
}

/**
 * Distance from a segment to a rectangle, and 0 if they touch.
 *
 * Sampling a few points along the segment is not good enough for this: a road
 * crossing the corner of a block passes every sample test and still runs
 * through the block.
 */
export function segmentToRect(from: Vec2, to: Vec2, r: Rect): number {
  const inside = (p: Vec2) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
  if (inside(from) || inside(to)) return 0;

  const corners: Vec2[] = [
    { x: r.minX, z: r.minZ },
    { x: r.maxX, z: r.minZ },
    { x: r.maxX, z: r.maxZ },
    { x: r.minX, z: r.maxZ },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentIntersection(from, to, corners[i], corners[(i + 1) % 4])) return 0;
  }

  let best = Infinity;
  for (const corner of corners) {
    best = Math.min(best, distanceToSegment(corner.x, corner.z, from.x, from.z, to.x, to.z));
  }
  for (const end of [from, to]) {
    const x = Math.max(r.minX, Math.min(end.x, r.maxX));
    const z = Math.max(r.minZ, Math.min(end.z, r.maxZ));
    best = Math.min(best, Math.hypot(end.x - x, end.z - z));
  }
  return best;
}

/** Is the point on the carriageway? */
export const onRoad = (city: City, road: CityRoad, x: number, z: number) =>
  distanceToRoad(city, road, x, z) <= road.width / 2;

/** How high a road is at a point along it, interpolating between its ends. */
export function roadHeightAt(city: City, road: CityRoad, x: number, z: number): number {
  const a = city.nodes[road.a];
  const b = city.nodes[road.b];
  if (a.y === b.y) return a.y;

  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1) return a.y;
  const t = Math.max(0, Math.min(1, ((x - a.pos.x) * dx + (z - a.pos.z) * dz) / lengthSquared));
  return a.y + (b.y - a.y) * t;
}

/** What the car is standing on. */
export interface Surface {
  /** The road under this point, or null for open ground. */
  road: CityRoad | null;
  /** Ground height here: the deck if on a road, otherwise street level. */
  y: number;
}

/**
 * What is at this point, at about this height (#86).
 *
 * The height argument is the whole reason this is not a plain 2D lookup. Since
 * #85 there can be two roads at one map position, and driving *under* an
 * overpass has to be different from driving *on* it - so the answer is the road
 * whose deck is nearest the height asked about, not simply the first one found.
 */
export function surfaceAt(city: City, grid: CityGrid, x: number, z: number, near: number): Surface {
  let best: CityRoad | null = null;
  let bestY = 0;
  let bestGap = Infinity;

  for (const road of grid.roadsNear(x, z)) {
    if (!onRoad(city, road, x, z)) continue;

    const y = roadHeightAt(city, road, x, z);
    const gap = Math.abs(y - near);
    // A road far above or below is not the road you are on. This is what makes
    // driving under an overpass different from driving on it.
    if (gap > SURFACE_REACH) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = road;
      bestY = y;
    }
  }

  return best ? { road: best, y: bestY } : { road: null, y: 0 };
}
