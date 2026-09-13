/**
 * The shared scaffolding for building a road network before it becomes a
 * `City` - a `Span` (a road centreline before it is cut at its crossings),
 * the rect/water helpers that decide what a block can fit around, and
 * `layRoute`, which turns a routed polyline into spans with its water
 * crossings recorded as bridge candidates.
 *
 * Split out of `generate.ts` so a second generator working on its own area of
 * the map - `localstreets.ts` is the first - can reuse exactly the same
 * primitives rather than a second copy of them.
 */
import { CITY_MIN_STREET } from '../constants';
import type { Rng } from './rng';
import type { Water } from './water';
import type { Axis, DistrictKind, Rect, RoadClass, RoadSurface, Vec2 } from './types';

/**
 * A road centreline before it is cut at its crossings.
 *
 * A segment between two points, not a coordinate on an axis. That is what lets
 * a boulevard go through the same pipeline as a street: cut against the water,
 * split at every crossing, repaired if it strands anything. `axis` survives
 * only as a fast path - most spans really are axis-aligned, and knowing it
 * turns a crossing test into two comparisons.
 */
export interface Span {
  from: Vec2;
  to: Vec2;
  class: RoadClass;
  district: DistrictKind;
  bridge?: boolean;
  /**
   * This span is not optional: neither its crossing nor the runs either side.
   *
   * `chooseBridges` picks crossings for where they are (#247), which is right
   * for the ones inside the city and wrong for the one road that reaches a body
   * of land. A link route is the *only* way onto its island, so a spacing rule
   * that declines it does not thin the crossings out - it deletes a district,
   * and `prune` then deletes every road on it. Measured: the waterfront, the
   * quarry and the docks all vanished at once when the routed arterials stopped
   * leaving spare gaps for the chooser to find.
   */
  required?: boolean;
  embankment?: boolean;
  axis?: Axis;
  /** What it is paved with (#294). Undefined means asphalt, same as everywhere else. */
  surface?: RoadSurface;
}

export const centre = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/** The nine points that stand in for a rectangle when asking about the water. */
function probes(r: Rect): Vec2[] {
  const xs = [r.minX, (r.minX + r.maxX) / 2, r.maxX];
  const zs = [r.minZ, (r.minZ + r.maxZ) / 2, r.maxZ];
  const out: Vec2[] = [];
  for (const x of xs) for (const z of zs) out.push({ x, z });
  return out;
}

export const allWater = (r: Rect, water: Water) => probes(r).every((p) => water.isWater(p.x, p.z));
export const anyWater = (r: Rect, water: Water) => probes(r).some((p) => water.isWater(p.x, p.z));

/** Move one edge of a rectangle inward by `t` of its span. */
function pullIn(r: Rect, edge: 'minX' | 'maxX' | 'minZ' | 'maxZ', t: number): Rect {
  const span = edge === 'minX' || edge === 'maxX' ? r.maxX - r.minX : r.maxZ - r.minZ;
  const by = span * t;
  return {
    ...r,
    [edge]: edge === 'minX' || edge === 'minZ' ? r[edge] + by : r[edge] - by,
  };
}

const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);

/**
 * Pull a block back off whatever is in the way, instead of deleting it.
 *
 * Used for both the water and the boulevards, and for the same reason in each:
 * deleting a whole block because something clips its corner takes a hundred
 * metres of city out for the sake of ten. A diagonal boulevard clips a corner
 * off every block it passes, so without this it carves a staircase-shaped hole
 * far wider than the road.
 *
 * Whatever it is almost always arrives from one side, so each edge is tried in
 * turn and the roomiest clear result wins. A block reached from two sides is a
 * sliver, not a plot, and is dropped.
 */
export function pullClear(block: Rect, blocked: (r: Rect) => boolean): Rect | null {
  if (!blocked(block)) return block;

  let best: Rect | null = null;
  for (const edge of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
    for (let t = 0.1; t <= 0.7; t += 0.05) {
      const pulled = pullIn(block, edge, t);
      if (blocked(pulled)) continue;
      if (!best || area(pulled) > area(best)) best = pulled;
      break;
    }
  }
  return best && area(best) >= area(block) * 0.3 ? best : null;
}

/**
 * Divide [min, max] at its district's spacing, and hand back the cut positions.
 * The walk stops while there is still most of a block left, so the last block
 * is a block and not a sliver.
 */
export function divide(rng: Rng, min: number, max: number, target: number, jitter: number): number[] {
  const cuts: number[] = [];
  let at = min;
  for (;;) {
    const next = at + target * (1 + rng.range(-jitter, jitter));
    if (next > max - target * 0.6) break;
    cuts.push(next);
    at = next;
  }
  return cuts;
}

function reachBack(line: Vec2[], at: number, step: number): number {
  let run = 0;
  let i = at;
  while (i + step >= 0 && i + step < line.length && run < CITY_MIN_STREET * 1.5) {
    run += Math.hypot(line[i + step].x - line[i].x, line[i + step].z - line[i].z);
    i += step;
  }
  return i;
}

/**
 * Put a routed road into the generator as spans.
 *
 * Not simply one span per pair of points, which is what a boulevard does. A
 * routed road bends, so it arrives as a chain of thirty-metre pieces - and
 * `clip` looks for a gap *inside* a span, so a crossing that falls between two
 * pieces is never offered as a bridge candidate. Measured: the router found the
 * narrows at 243 m and 183 m, comfortably inside `CITY_MAX_BRIDGE`, and the
 * city came out with **zero** bridges and the districts pruned away.
 *
 * So where the line crosses water, the crossing is laid as **one straight
 * span** from the last dry point to the first dry point on the far side. That
 * span contains land, water and land, which is exactly the shape `clip` knows
 * how to turn into a gap - and from there the crossing goes through the same
 * selection (#247) and the same repair pass as every other one.
 */
export function layRoute(
  line: Vec2[],
  water: Water,
  laid: Span[],
  kind: RoadClass = 'boulevard',
  district: DistrictKind = 'midtown',
  required = false,
  surface?: RoadSurface,
): void {
  if (line.length < 2) return;
  const wet = (a: Vec2, b: Vec2) => water.isWater((a.x + b.x) / 2, (a.z + b.z) / 2);

  let i = 0;
  while (i < line.length - 1) {
    if (!wet(line[i], line[i + 1])) {
      laid.push({ from: line[i], to: line[i + 1], class: kind, district, required, surface });
      i++;
      continue;
    }
    // A crossing. Laid as one piece from well back on this bank to well past
    // the far one, because `clip` throws away a dry run shorter than
    // `CITY_MIN_STREET` - and a span that reaches only one point onto land has
    // a twelve-metre stub at each end, so both runs are discarded and the gap
    // between them is never recorded. Measured: crossings of 243 m and 183 m,
    // both inside the bridge limit, and no bridge built.
    let j = i + 1;
    while (j < line.length - 1 && wet(line[j], line[j + 1])) j++;
    const back = reachBack(line, i, -1);
    const on = reachBack(line, Math.min(j + 1, line.length - 1), 1);
    laid.push({ from: line[back], to: line[on], class: kind, district, required, surface });
    // Resume where the crossing ended, not where the water did. Resuming at the
    // far bank leaves the span's far end joined to nothing, so the bridge is its
    // own two-node island and `prune` deletes it - a chosen crossing that never
    // appears in the city.
    i = on;
  }
}
