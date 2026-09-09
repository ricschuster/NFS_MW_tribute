/**
 * Cut and fill: roads a car can actually climb (#252).
 *
 * A road drawn on a map is a line. A road on the ground is a **shelf** - cut
 * into the hillside where the ground is above it, built up on fill where the
 * ground is below - and that is the only reason roads in hill country have
 * grades a vehicle can manage at all. Until now Kestrel Bay had roads laid on
 * whatever the terrain happened to be doing, and the terrain does not care.
 *
 * The case that forced it: a 320 m connector from the quarry's rim to the top of
 * its haul road, redrawn three times by hand and coming out at 28%, 31% and 32%
 * within six metres of the same point every time. The ground there steps 15 m in
 * 40 - it is the pit's own outermost bench - and no line across a step like that
 * is drivable. The road was never the problem.
 *
 * Two things this is not:
 *
 * - **Not the router.** `ROUTE_CELL` is 50 m, so an 11 m bench edge sits inside
 *   one cell and the router cannot see the thing it would need to avoid. Asked
 *   to reroute that connector it returned a 42% line, worse than the hand-drawn
 *   one. Routing chooses *where* a road goes; this decides what the ground under
 *   it does.
 * - **Not a flattening pass.** The profile starts as the ground's own and is
 *   only pulled toward the limit where the limit is broken, so a road over
 *   gentle country displaces nothing at all. What gets moved is the few tens of
 *   metres either side of a step.
 */
import {
  ROAD_CUT_BLEND,
  ROAD_CUT_MARGIN,
  ROAD_CUT_RELAX,
  ROAD_CUT_STEP,
  ROAD_CUT_WIDTH,
  ROUTE_COUNTRY,
} from '../constants';
import { groundAt, type Terrain } from './terrain';
import type { Vec2 } from './types';

/** A road to grade: just its shape, so this works on authored and generated alike. */
export interface Gradeable {
  points: Vec2[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Resample a road at a fixed step, so a long segment is not one sample and a
 * short one is not fifty. The profile below is a filter over distance, and a
 * filter over unevenly spaced samples is a filter with a wobble in it.
 */
function walk(points: Vec2[], step: number): { at: Vec2; along: number }[] {
  const out: { at: Vec2; along: number }[] = [];
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(span / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ at: { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) }, along: along + span * t });
    }
    along += span;
  }
  out.push({ at: points[points.length - 1], along });
  return out;
}

/**
 * The height every point of the network wants, given the height the ground has.
 *
 * A constraint relaxation over the whole network rather than a filter along one
 * road, and that difference is the entire problem. Grading a road on its own
 * leaves its **ends** wherever they land: free, the profile drifts from the
 * ground it joins and the shelf stops in a lip; pinned to the natural ground, it
 * pins itself to whatever made the ground steep in the first place. Measured on
 * one 320 m connector: 32% ungraded, 18% graded free, 23% graded pinned. The
 * steep bit had moved into the last few metres and no amount of work on the
 * middle of that road was ever going to shift it.
 *
 * So the samples of every road are one mesh: neighbours along a road are linked,
 * and so are samples of *different* roads that pass within a carriageway of each
 * other. Then each link is relaxed until no two linked points are further apart
 * in height than the grade allows over the distance between them. A junction is
 * a link like any other, so a profile now carries through one instead of
 * stopping at it, and two roads that meet agree about the height they meet at.
 *
 * Where nothing is violated nothing moves, so a road over gentle country still
 * displaces no ground at all.
 */
function relax(
  samples: { x: number; z: number; h: number }[],
  links: { a: number; b: number; d: number }[],
  cap: number,
): void {
  for (let pass = 0; pass < ROAD_CUT_RELAX; pass++) {
    let worst = 0;
    for (const link of links) {
      const limit = link.d * cap;
      const diff = samples[link.b].h - samples[link.a].h;
      const over = Math.abs(diff) - limit;
      if (over <= 0) continue;
      worst = Math.max(worst, over);
      // Both ends give, so a cut is shared between the high side and the low
      // rather than being paid for entirely by whichever end came first.
      const shift = (Math.sign(diff) * over) / 2;
      samples[link.a].h += shift;
      samples[link.b].h -= shift;
    }
    if (worst < 0.01) break;
  }
}

/**
 * Cut and fill the ground under these roads.
 *
 * Runs after the places have been dug (a road to the quarry is graded against
 * the quarry, not the hill it replaced) and before anything is laid, so the
 * street network, the blocks and the sim's own `groundAt` all see the shelf.
 */
export function cutAndFill(terrain: Terrain, roads: Gradeable[], cap = ROUTE_COUNTRY.cap): void {
  const { cells, cols, rows, cell, bounds } = terrain;
  const half = ROAD_CUT_WIDTH / 2;
  const reach = half + ROAD_CUT_BLEND;

  // Every road, sampled, as one mesh.
  const samples: { x: number; z: number; h: number }[] = [];
  const natural: number[] = [];
  const links: { a: number; b: number; d: number }[] = [];
  for (const road of roads) {
    if (road.points.length < 2) continue;
    const walked = walk(road.points, ROAD_CUT_STEP);
    const first = samples.length;
    for (const s of walked) {
      const h = groundAt(terrain, s.at.x, s.at.z);
      samples.push({ x: s.at.x, z: s.at.z, h });
      natural.push(h);
    }
    for (let i = 1; i < walked.length; i++) {
      links.push({ a: first + i - 1, b: first + i, d: Math.max(1e-6, walked[i].along - walked[i - 1].along) });
    }
  }
  if (samples.length === 0) return;

  // Bucketed once, and used twice: to find the samples of other roads that a
  // sample meets, and to find the samples near a terrain cell.
  const bucket = new Map<number, number[]>();
  const key = (bx: number, bz: number) => bx * 100003 + bz;
  const bucketOf = (x: number, z: number) => key(Math.floor(x / reach), Math.floor(z / reach));
  for (let i = 0; i < samples.length; i++) {
    const k = bucketOf(samples[i].x, samples[i].z);
    const at = bucket.get(k);
    if (at) at.push(i);
    else bucket.set(k, [i]);
  }

  // A junction is wherever two roads pass within a carriageway of each other.
  // Linked rather than merged, because they are still two roads and the shelf
  // only has to agree about its height where they touch.
  const seen = new Set<number>();
  for (let i = 0; i < samples.length; i++) {
    const bx = Math.floor(samples[i].x / reach);
    const bz = Math.floor(samples[i].z / reach);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of bucket.get(key(bx + dx, bz + dz)) ?? []) {
          if (j <= i) continue;
          const d = Math.hypot(samples[j].x - samples[i].x, samples[j].z - samples[i].z);
          if (d > ROAD_CUT_WIDTH) continue;
          const pair = i * samples.length + j;
          if (seen.has(pair)) continue;
          seen.add(pair);
          links.push({ a: i, b: j, d: Math.max(1e-6, d) });
        }
      }
    }
  }

  relax(samples, links, cap * ROAD_CUT_MARGIN);

  // Nothing moved means no earthworks: terrain displaced where a road did not
  // need it is a scar.
  let moved = 0;
  for (let i = 0; i < samples.length; i++) moved = Math.max(moved, Math.abs(samples[i].h - natural[i]));
  if (moved < cell * 0.05) return;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = bounds.minX + col * cell;
      const z = bounds.minZ + row * cell;
      const bx = Math.floor(x / reach);
      const bz = Math.floor(z / reach);
      // **Weighted by distance, not taken from the nearest.**
      //
      // Nearest-sample makes the shelf a Voronoi diagram of the samples, and its
      // seams are steps: two roads passing within a carriageway of each other
      // may legitimately differ by a couple of metres, and a cell on the seam
      // takes one of them while its neighbour takes the other. Measured, a road
      // whose own profile was inside the cap read 17% where it ran beside
      // another - the step it was climbing was the seam, not the ground.
      //
      // Inverse square, so a sample a metre away dominates one twenty metres
      // off and the road still sits on its own profile, but the surface between
      // two roads is continuous.
      let best = Infinity;
      let sum = 0;
      let weight = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const i of bucket.get(key(bx + dx, bz + dz)) ?? []) {
            const d = Math.hypot(samples[i].x - x, samples[i].z - z);
            if (d > reach) continue;
            if (d < best) best = d;
            const w = 1 / (d * d + cell * cell * 0.25);
            sum += samples[i].h * w;
            weight += w;
          }
        }
      }
      if (best > reach || weight === 0) continue;
      const want = sum / weight;
      const at = row * cols + col;
      cells[at] = best <= half ? want : lerp(want, cells[at], (best - half) / ROAD_CUT_BLEND);
    }
  }
}
