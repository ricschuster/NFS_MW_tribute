import {
  CAR_RADIUS,
  TAKEDOWN_MIN_CLOSING,
  TAKEDOWN_KILL_CLOSING,
  TAKEDOWN_PINNED_MULT,
  TAKEDOWN_PIN_REACH,
  TAKEDOWN_MASS_MULT,
} from './constants';
import type { CityGrid } from './city/grid';
import type { GraphCar } from './graphcar';

/**
 * What it takes to wreck a car (#94).
 *
 * Kept as a pure function of two cars and the buildings around them, for the
 * usual reason: it is the part of a takedown that is worth asserting on, and a
 * number is the only way to tell "a solid hit" from "a hit that happened to
 * look good". Nothing here knows about the police, the pursuit or the renderer.
 *
 * The model is three multiplied terms, and each one is a decision the player
 * makes rather than a number that happens to them:
 *
 *  - **Closing speed.** Not the speedometer: the speed the two cars are
 *    approaching along the line between them. Sitting on a cop's bumper at
 *    300 km/h does nothing, because you are not closing.
 *  - **How square it is.** A hit straight off the nose puts everything into
 *    the other car; a parallel graze puts almost none of it.
 *  - **Whether it is pinned.** A car with a wall behind it has nowhere to give.
 */

/** Anything that can do the ramming: the player, and later a rival. */
export interface Rammer {
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
}

/** Are these two close enough to be touching? Both are cars, so both have a radius. */
export function touching(a: { x: number; z: number; y: number }, b: { x: number; z: number; y: number }): boolean {
  // Height first: a car on the street and a deck 12 m above it are not in
  // contact however close they look from overhead.
  if (Math.abs(a.y - b.y) > CAR_RADIUS * 2) return false;
  return Math.hypot(a.x - b.x, a.z - b.z) < CAR_RADIUS * 2.2;
}

/**
 * How much damage `rammer` does to `car` in this contact, 0..1.
 *
 * `toughness` is the unit's `scale`: a heavy SUV takes a hit that would put a
 * hatchback out of the pursuit. Zero when the two are not actually closing,
 * which is what stops a car being ground down by resting against you.
 */
export function impactDamage(
  rammer: Rammer,
  car: GraphCar,
  maxSpeed: number,
  grid: CityGrid | null = null,
  toughness = 1,
): number {
  const dx = car.x - rammer.x;
  const dz = car.z - rammer.z;
  const gap = Math.hypot(dx, dz);
  if (gap < 1e-6) return 0;
  const nx = dx / gap;
  const nz = dz / gap;

  const forwardX = Math.sin(rammer.heading);
  const forwardZ = Math.cos(rammer.heading);

  const closing =
    (forwardX * rammer.speed - Math.sin(car.heading) * car.speed) * nx +
    (forwardZ * rammer.speed - Math.cos(car.heading) * car.speed) * nz;
  if (closing <= 0) return 0;

  const fraction = closing / Math.max(1, maxSpeed);
  if (fraction < TAKEDOWN_MIN_CLOSING) return 0;
  const force = Math.min(
    1,
    (fraction - TAKEDOWN_MIN_CLOSING) / (TAKEDOWN_KILL_CLOSING - TAKEDOWN_MIN_CLOSING),
  );

  const square = Math.abs(nx * forwardX + nz * forwardZ);
  const pinned = grid && pinnedAgainst(grid, car, nx, nz) ? TAKEDOWN_PINNED_MULT : 1;
  const mass = 1 + (toughness - 1) * TAKEDOWN_MASS_MULT;

  return (force * square * pinned) / Math.max(0.1, mass);
}

/**
 * Is there a building immediately behind the car, along the direction of the hit?
 *
 * This is how "ram them into scenery" is modelled. Traffic and police live on
 * the street graph and cannot be shoved off it, so they cannot be pushed
 * sideways into a wall; what can be asked is whether the wall is already there.
 */
function pinnedAgainst(grid: CityGrid, car: GraphCar, nx: number, nz: number): boolean {
  const x = car.x + nx * TAKEDOWN_PIN_REACH;
  const z = car.z + nz * TAKEDOWN_PIN_REACH;
  for (const building of grid.buildingsNear(x, z)) {
    const f = building.footprint;
    if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
    // Only what is on the ground pins anything: the deck of the interstate is
    // not a wall to a car in the street under it.
    if (car.y < building.height) return true;
  }
  return false;
}
