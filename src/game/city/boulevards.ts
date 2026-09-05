import { BOULEVARD_COUNT, BOULEVARD_STEP, BOULEVARD_SWEEP } from '../constants';
import type { Rng } from './rng';
import type { Rect, Vec2 } from './types';

/**
 * Boulevards: the roads that bend (#115, ADR-0005 rule 4).
 *
 * The street grid is generated axis-aligned and stays that way, because that
 * is what keeps blocks rectangular and downtown looking like a downtown. What
 * a pure grid has none of is a line that sweeps - the avenue that cuts across
 * it and lets you cross the city without turning twenty times.
 *
 * This module only decides where the curves go. They are handed to the
 * generator as ordinary routes and go through the same pipeline as everything
 * else - cut against the water, split at every crossing, repaired if they
 * strand anything. Trying to splice them into a finished graph instead was the
 * obvious approach and the wrong one: it meant reimplementing all of that, and
 * getting it subtly wrong in four separate ways.
 */
export function boulevardRoutes(rng: Rng, bounds: Rect): Vec2[][] {
  const routes: Vec2[][] = [];
  for (let i = 0; i < BOULEVARD_COUNT; i++) routes.push(sweep(rng, bounds, i));
  return routes;
}

/**
 * A curve across the city: a quadratic through a control point pushed off to
 * one side, which is the cheapest thing that reads as a sweep rather than as a
 * diagonal. Alternating sides so the boulevards do not all bow the same way.
 */
function sweep(rng: Rng, bounds: Rect, index: number): Vec2[] {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  // Start and end on opposite edges, at a seeded point along each.
  const vertical = index % 2 === 0;
  const from = vertical
    ? { x: bounds.minX + width * rng.range(0.15, 0.85), z: bounds.minZ }
    : { x: bounds.minX, z: bounds.minZ + depth * rng.range(0.15, 0.85) };
  const to = vertical
    ? { x: bounds.minX + width * rng.range(0.15, 0.85), z: bounds.maxZ }
    : { x: bounds.maxX, z: bounds.minZ + depth * rng.range(0.15, 0.85) };

  // Push the control point perpendicular to the chord to bow the curve.
  const midX = (from.x + to.x) / 2;
  const midZ = (from.z + to.z) / 2;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const bow = rng.range(0.4, 1) * BOULEVARD_SWEEP * (rng.chance(0.5) ? 1 : -1);
  const control = { x: midX + (-dz / length) * bow, z: midZ + (dx / length) * bow };

  const steps = Math.max(8, Math.round(length / BOULEVARD_STEP));
  const points: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      z: inverse * inverse * from.z + 2 * inverse * t * control.z + t * t * to.z,
    });
  }
  return points;
}

