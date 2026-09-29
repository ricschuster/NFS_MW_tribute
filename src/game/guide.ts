import { GUIDE_AHEAD, GUIDE_STEP } from './constants';
import { routeAt } from './city/routes';
import type { Vec2 } from './city/types';
import type { CityWorld } from './cityworld';

/**
 * The way ahead, for the lines painted on the road (#443).
 *
 * The reference game draws two glowing lines along the route in front of the
 * car during a race, a lane apart, on the tarmac itself: the minimap says where
 * the route goes, and the lines say it where you are actually looking. This is
 * the half of that the sim can answer - which points lie ahead - so the
 * renderer only has to drape something over them, and a test can ask the
 * question without one.
 *
 * During a race it is the race's own route, from how far round you are;
 * otherwise the way to wherever the Quick Menu pointed you (`markerPath`), from
 * the nearest point of it. Nothing, when there is neither.
 */
export function guidePath(world: CityWorld): Vec2[] {
  const race = world.race;
  const route = race.route;
  if (route && (race.state === 'racing' || race.state === 'countdown')) {
    const start = race.playerDist % route.length;
    const out: Vec2[] = [];
    for (let along = 0; along <= GUIDE_AHEAD; along += GUIDE_STEP) {
      // A sprint stops at its finish rather than running on past it.
      if (route.kind === 'sprint' && race.playerDist + along > route.length) break;
      out.push(routeAt(route, start + along));
    }
    return out;
  }

  const path = world.markerPath;
  if (path.length < 2) return [];
  // From the point of the path nearest the car, not its first point: the path
  // is worked out once and kept until you stray from it, so its start is
  // wherever you were when you asked.
  let best = 0;
  let bestGap = Infinity;
  let bestAt: Vec2 = path[0];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const at = { x: a.x + dx * t, z: a.z + dz * t };
    const gap = Math.hypot(at.x - world.x, at.z - world.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
      bestAt = at;
    }
  }
  // Walk on from there, a point every `GUIDE_STEP`, until `GUIDE_AHEAD` is used.
  const out: Vec2[] = [bestAt];
  let left = GUIDE_AHEAD;
  let from = bestAt;
  for (let i = best + 1; i < path.length && left > 0; i++) {
    const to = path[i];
    const span = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(Math.min(span, left) / GUIDE_STEP));
    const reach = Math.min(1, left / Math.max(1e-6, span));
    for (let k = 1; k <= steps; k++) {
      const t = (k / steps) * reach;
      out.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t });
    }
    left -= span;
    from = to;
  }
  return out;
}
