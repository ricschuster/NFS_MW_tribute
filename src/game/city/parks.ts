import { PARK_CELL, PARK_MIN_SIDE, PARK_ROAD_CLEAR } from '../constants';
import { CityGrid, onRoad } from './grid';
import type { Water } from './water';
import type { City, CityBlock, DistrictKind, Rect } from './types';

/**
 * The land the street grid never claimed (#185).
 *
 * A fifth of Kestrel Bay belonged to neither block nor road. Blocks are laid on
 * the lines between arterials and then `pullClear`ed off the water, and one
 * that cannot be fitted is dropped entirely - so a riverbank loses whole blocks
 * at a time and what is left is an apron a hundred metres across. Measured:
 * 19.3% of the map, 88% of it inside the city rather than out at the edge, and
 * a median of 50 m from the nearest block. It is not a margin problem. Growing
 * block bounds to meet the kerb, which is the obvious cheap fix, closes 8% of
 * it.
 *
 * So this decides what that land *is*, which is what the issue asked for:
 * parkland. It reads as green rather than as pavement, which matters because
 * the sim caps you at a quarter of top speed off-road and #176 made that
 * visible - a large drivable-looking apron that is not road is a worse city
 * than one that says "this is a park".
 *
 * Rectangles rather than polygons, because a `CityBlock` is a rectangle and
 * everything that draws one assumes it. The city is covered at `PARK_CELL`
 * resolution and the free cells are merged greedily, so a park is as big as
 * the land allows and anything too small to notice is left alone.
 */
export function parksFor(city: City, water: Water): CityBlock[] {
  const grid = new CityGrid(city);
  const { bounds } = city;

  const cols = Math.ceil((bounds.maxX - bounds.minX) / PARK_CELL);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / PARK_CELL);
  const at = (i: number, j: number) => j * cols + i;
  const free = new Uint8Array(cols * rows);

  // Blocks are indexed by cell rather than scanned, because "is this point in
  // any of six hundred rectangles" runs once per cell and the honest version
  // of that took longer than the rest of generation put together.
  const claimed = new Set<number>();
  for (const block of city.blocks) mark(claimed, block.bounds, bounds, cols, rows);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (claimed.has(at(i, j))) continue;
      const cell = cellRect(i, j, bounds);
      if (!vacant(city, grid, water, cell)) continue;
      free[at(i, j)] = 1;
    }
  }

  // Greedy: take a free cell, run right as far as the row allows, then down as
  // far as the full width allows. Not the largest possible rectangle, and it
  // does not need to be - what it has to avoid is a thousand slivers, and a
  // run-and-drop does that.
  const parks: CityBlock[] = [];
  const min = Math.max(1, Math.round(PARK_MIN_SIDE / PARK_CELL));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!free[at(i, j)]) continue;

      // Both ways round, and keep the bigger: a wide strip that cannot grow
      // down and a tall one that cannot grow right are the same land, and
      // taking the first of them turns a 20 x 200 m riverbank into nothing.
      const wide = runRight(free, at, cols, rows, i, j);
      const tall = runDown(free, at, cols, rows, i, j);
      const [width, height] =
        wide.w * wide.h >= tall.w * tall.h ? [wide.w, wide.h] : [tall.w, tall.h];

      if (width < min || height < min) {
        // Only this cell. Clearing the whole run would spend land that a
        // rectangle starting one column over could still have used, which is
        // how the first version of this left a third of the leftovers behind.
        free[at(i, j)] = 0;
        continue;
      }
      for (let dj = 0; dj < height; dj++) {
        for (let di = 0; di < width; di++) free[at(i + di, j + dj)] = 0;
      }

      const from = cellRect(i, j, bounds);
      const to = cellRect(i + width - 1, j + height - 1, bounds);
      parks.push({
        bounds: { minX: from.minX, minZ: from.minZ, maxX: to.maxX, maxZ: to.maxZ },
        district: districtAt(city, (from.minX + to.maxX) / 2, (from.minZ + to.maxZ) / 2),
        open: true,
        // Not a lot inside the street grid, and the difference is content:
        // street finds and breakable gates go on lots, because a car parked in
        // a yard is a find and a car parked in a riverside park is litter.
        park: true,
      });
    }
  }
  return parks;
}

/** As far right as the row goes, then as far down as that full width goes. */
function runRight(
  free: Uint8Array,
  at: (i: number, j: number) => number,
  cols: number,
  rows: number,
  i: number,
  j: number,
): { w: number; h: number } {
  let w = 0;
  while (i + w < cols && free[at(i + w, j)]) w++;
  let h = 1;
  grow: while (j + h < rows) {
    for (let k = 0; k < w; k++) if (!free[at(i + k, j + h)]) break grow;
    h++;
  }
  return { w, h };
}

/** The same, the other way round. */
function runDown(
  free: Uint8Array,
  at: (i: number, j: number) => number,
  cols: number,
  rows: number,
  i: number,
  j: number,
): { w: number; h: number } {
  let h = 0;
  while (j + h < rows && free[at(i, j + h)]) h++;
  let w = 1;
  grow: while (i + w < cols) {
    for (let k = 0; k < h; k++) if (!free[at(i + w, j + k)]) break grow;
    w++;
  }
  return { w, h };
}

/** The rectangle a grid cell covers. */
function cellRect(i: number, j: number, bounds: Rect): Rect {
  return {
    minX: bounds.minX + i * PARK_CELL,
    minZ: bounds.minZ + j * PARK_CELL,
    maxX: bounds.minX + (i + 1) * PARK_CELL,
    maxZ: bounds.minZ + (j + 1) * PARK_CELL,
  };
}

/** Every cell a rectangle touches, so a block can claim its ground cheaply. */
function mark(into: Set<number>, r: Rect, bounds: Rect, cols: number, rows: number): void {
  const i0 = Math.max(0, Math.floor((r.minX - bounds.minX) / PARK_CELL));
  const i1 = Math.min(cols - 1, Math.floor((r.maxX - bounds.minX) / PARK_CELL));
  const j0 = Math.max(0, Math.floor((r.minZ - bounds.minZ) / PARK_CELL));
  const j1 = Math.min(rows - 1, Math.floor((r.maxZ - bounds.minZ) / PARK_CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) into.add(j * cols + i);
  }
}

/**
 * Is there nothing on this cell?
 *
 * Against the water *field* rather than the outlines on `City`. They are not
 * the same answer: the outline is a sampled polygon and the field is what the
 * blocks were fitted against, and three parks went into the river while
 * agreeing with the polygon. Everything upstream uses the field, so this does.
 *
 * Tested at the corners as well as the middle, and that is not belt and
 * braces: a pavement slab is *raised*, so a park laid over a carriageway is a
 * kerb across the road, and a cell whose centre is clear can still have a
 * quarter of itself on the tarmac. `PARK_ROAD_CLEAR` widens the road for the
 * test so the grass stops short of the kerb rather than at it.
 */
function vacant(city: City, grid: CityGrid, water: Water, cell: Rect): boolean {
  // The same three-by-three the city's own water invariant samples a block
  // with. Corners and centre alone let a river bend cross the middle of an
  // edge, and three parks went into the water that way.
  const points: { x: number; z: number }[] = [];
  for (const x of [cell.minX, (cell.minX + cell.maxX) / 2, cell.maxX]) {
    for (const z of [cell.minZ, (cell.minZ + cell.maxZ) / 2, cell.maxZ]) {
      points.push({ x, z });
    }
  }
  for (const p of points) {
    if (water.isWater(p.x, p.z)) return false;
    for (const road of grid.roadsNear(p.x, p.z)) {
      // Surface roads only. A park under the elevated interstate is a park, and
      // a deck twelve metres up is not something the grass is in the way of.
      if (city.nodes[road.a].y !== 0 || city.nodes[road.b].y !== 0) continue;
      if (onRoad(city, { ...road, width: road.width + PARK_ROAD_CLEAR * 2 }, p.x, p.z)) return false;
    }
  }
  return true;
}

/** Whichever quarter this land sits in, so a park belongs somewhere. */
function districtAt(city: City, x: number, z: number): DistrictKind {
  let best: DistrictKind = 'midtown';
  let bestGap = Infinity;
  for (const cell of city.superblocks) {
    const dx = Math.max(cell.bounds.minX - x, 0, x - cell.bounds.maxX);
    const dz = Math.max(cell.bounds.minZ - z, 0, z - cell.bounds.maxZ);
    const gap = Math.hypot(dx, dz);
    if (gap < bestGap) {
      bestGap = gap;
      best = cell.district;
    }
    if (gap === 0) break;
  }
  return best;
}
