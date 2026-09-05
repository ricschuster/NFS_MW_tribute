import { CITY_GRID_CELL, SURFACE_REACH } from '../constants';
import type { Building, City, CityRoad, Rect } from './types';

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

/** The rectangle a road's carriageway covers on the map. */
export function carriageway(city: City, road: CityRoad): Rect {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const half = road.width / 2;
  return {
    minX: Math.min(a.x, b.x) - (road.axis === 'x' ? 0 : half),
    maxX: Math.max(a.x, b.x) + (road.axis === 'x' ? 0 : half),
    minZ: Math.min(a.z, b.z) - (road.axis === 'z' ? 0 : half),
    maxZ: Math.max(a.z, b.z) + (road.axis === 'z' ? 0 : half),
  };
}

/** How high a road is at a point along it, interpolating between its ends. */
export function roadHeightAt(city: City, road: CityRoad, x: number, z: number): number {
  const a = city.nodes[road.a];
  const b = city.nodes[road.b];
  if (a.y === b.y) return a.y;

  const span = road.axis === 'x' ? b.pos.x - a.pos.x : b.pos.z - a.pos.z;
  if (Math.abs(span) < 1) return a.y;
  const along = road.axis === 'x' ? x - a.pos.x : z - a.pos.z;
  const t = Math.max(0, Math.min(1, along / span));
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
    const r = carriageway(city, road);
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;

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
