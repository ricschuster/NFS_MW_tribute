import { ROUTE_CELL, ROUTE_SMOOTHING } from '../constants';
import { groundAt, type Terrain } from './terrain';
import { type Water } from './water';
import type { Rect, Vec2 } from './types';

/**
 * Roads routed over the ground, rather than laid on lines (ADR-0008 rule 2).
 *
 * Every road in Kestrel Bay used to be drawn: arterials straight across the
 * map, streets straight across a superblock, boulevards a chain of segments
 * bowed by a random number. That was fine while the ground was a plane at zero.
 * With relief it is not, and no amount of extra wobble fixes it, because the
 * shape a road wants comes from the terrain and not from a random number.
 *
 * So a road is a **least-cost path**. The cost of a step is its length, times a
 * penalty that is the *square* of the gradient, plus a price per metre of
 * water. Squaring is the whole trick: it is what makes a road contour round a
 * hill rather than climb it, and switchback where it has no choice, because two
 * gentle kilometres beat one steep one.
 *
 * Three things this got wrong first, all of them cheap to get wrong again:
 *
 * - **Price only the gradient and every road pins itself to the beach.** The
 *   shore is the flattest ground on the map, because the land ramps up out of
 *   the water. A class of road needs a shyness of the waterline or the freeway
 *   becomes a coast road all the way round the island.
 * - **A destination left in the water makes the router bridge out to sea to
 *   reach it.** The road is not wrong; the target is. Waypoints are snapped to
 *   land before the search starts.
 * - **The cost array has to be `Float64`.** A `Float32Array` rounds the stored
 *   cost, so `next < cost[j]` passes again on the next visit, the node is
 *   pushed again, and the search relaxes for ever - four gigabytes of heap in
 *   about a minute.
 *
 * What falls out for free is the crossings. Price water per metre and a path
 * crosses at the narrowest place it can find, without anybody choosing a spot.
 */
export interface RoadProfile {
  /** The steepest grade this class of road will accept, as a fraction. */
  cap: number;
  /** What a metre of water costs, as a multiple of a metre of road. */
  water: number;
  /** How hard the gradient is priced against the cap. */
  climb: number;
  /** How close to the water this class is willing to run. */
  shore: number;
  /** How much it minds, at the waterline. */
  shyness: number;
}

export interface Router {
  /** A road from here to there, as a polyline. Empty if there is no way. */
  route(from: Vec2, to: Vec2, profile: RoadProfile): Vec2[];
}

/**
 * Build the router once and ask it many times: the height, the water and the
 * distance to the water are sampled into grids up front, because a search that
 * asks the water field a hundred thousand times is a search that costs more
 * than the city it is building.
 */
export function makeRouter(bounds: Rect, terrain: Terrain, water: Water): Router {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / ROUTE_CELL) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / ROUTE_CELL) + 1;
  const size = cols * rows;

  const atX = (c: number) => bounds.minX + c * ROUTE_CELL;
  const atZ = (r: number) => bounds.minZ + r * ROUTE_CELL;

  const height = new Float64Array(size);
  const wet = new Uint8Array(size);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      height[i] = groundAt(terrain, atX(c), atZ(r));
      wet[i] = water.isWater(atX(c), atZ(r)) ? 1 : 0;
    }
  }
  const gap = distanceToWater(wet, cols, rows);

  const cell = (at: Vec2): number => {
    let c = Math.min(cols - 1, Math.max(0, Math.round((at.x - bounds.minX) / ROUTE_CELL)));
    let r = Math.min(rows - 1, Math.max(0, Math.round((at.z - bounds.minZ) / ROUTE_CELL)));
    if (!wet[r * cols + c]) return r * cols + c;
    // Snapped to land, or the router bridges out to sea to reach a target that
    // is already in it.
    for (let ring = 1; ring < Math.max(cols, rows); ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (!wet[nr * cols + nc]) return nr * cols + nc;
        }
      }
    }
    return r * cols + c;
  };

  const route = (from: Vec2, to: Vec2, profile: RoadProfile): Vec2[] => {
    const start = cell(from);
    const goal = cell(to);
    if (start === goal) return [];

    const cost = new Float64Array(size).fill(Infinity);
    const came = new Int32Array(size).fill(-1);
    cost[start] = 0;
    const heap = new Heap();
    heap.push(0, start);

    while (heap.size > 0) {
      const [sofar, i] = heap.pop();
      if (i === goal) break;
      if (sofar > cost[i]) continue;
      const c = i % cols;
      const r = (i / cols) | 0;
      for (const [dc, dr, step] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        const run = step * ROUTE_CELL;
        let add: number;
        if (wet[j]) {
          add = run * profile.water;
        } else {
          const grade = Math.abs(height[j] - height[i]) / run;
          const shy =
            profile.shore > 0 && gap[j] * ROUTE_CELL < profile.shore
              ? 1 + profile.shyness * (1 - (gap[j] * ROUTE_CELL) / profile.shore)
              : 1;
          const climb =
            grade > profile.cap ? profile.climb * 40 : profile.climb * (grade / profile.cap) ** 2;
          add = run * (1 + climb) * shy;
        }
        const next = sofar + add;
        if (next < cost[j]) {
          cost[j] = next;
          came[j] = i;
          heap.push(next, j);
        }
      }
    }

    if (came[goal] === -1) return [];
    const path: Vec2[] = [];
    for (let at = goal; at !== -1; at = came[at]) {
      path.push({ x: atX(at % cols), z: atZ((at / cols) | 0) });
      if (at === start) break;
    }
    return smooth(path.reverse());
  };

  return { route };
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Chaikin, a few times over.
 *
 * An eight-connected grid can only turn in 45 degree steps, so a routed road
 * comes out as a staircase - which is an artefact of the search and not a fact
 * about the road. Cutting the corners turns it back into a line a car could
 * drive without moving it anywhere it did not go.
 */
function smooth(points: Vec2[]): Vec2[] {
  let out = points;
  for (let pass = 0; pass < ROUTE_SMOOTHING && out.length > 2; pass++) {
    const next: Vec2[] = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** Cells from the nearest water, by the same two-pass chamfer `terrain.ts` uses. */
function distanceToWater(wet: Uint8Array, cols: number, rows: number): Float32Array {
  const far = cols + rows;
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = wet[i] ? 0 : far;
  const q = Math.SQRT2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (r > 0) d[i] = Math.min(d[i], d[i - cols] + 1);
      if (c > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (r > 0 && c > 0) d[i] = Math.min(d[i], d[i - cols - 1] + q);
      if (r > 0 && c < cols - 1) d[i] = Math.min(d[i], d[i - cols + 1] + q);
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (r < rows - 1) d[i] = Math.min(d[i], d[i + cols] + 1);
      if (c < cols - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (r < rows - 1 && c < cols - 1) d[i] = Math.min(d[i], d[i + cols + 1] + q);
      if (r < rows - 1 && c > 0) d[i] = Math.min(d[i], d[i + cols - 1] + q);
    }
  }
  return d;
}

/**
 * A binary heap. A linear scan for the cheapest node over thirty thousand of
 * them, once per pop, is the difference between a second and a minute.
 */
class Heap {
  private readonly items: [number, number][] = [];

  get size(): number {
    return this.items.length;
  }

  push(cost: number, node: number): void {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop() as [number, number];
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let least = i;
        if (left < a.length && a[left][0] < a[least][0]) least = left;
        if (right < a.length && a[right][0] < a[least][0]) least = right;
        if (least === i) break;
        [a[least], a[i]] = [a[i], a[least]];
        i = least;
      }
    }
    return top;
  }
}
