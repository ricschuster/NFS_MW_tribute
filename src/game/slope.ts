import { CREST_GRIP_MIN, GRAVITY, SLOPE_SPEED, SLOPE_SPEED_MAX } from './constants';

/**
 * What a hill does to a car (#255, ADR-0007 rule 9), as pure functions of the
 * ground, so the player and every car on the graph feel the same hill.
 *
 * The speed model has a hard top speed and no drag - acceleration is flat all
 * the way up to the cap (#14, #46, #82) - so gravity alone cannot make a climb
 * cost speed: full throttle would still reach the cap, just a little later.
 * What a hill moves is the cap itself. Uphill the car tops out lower, downhill
 * it runs on past its flat top speed, and `SLOPE_SPEED` is how much per unit
 * of grade.
 */

/**
 * How a grade changes top speed, as a multiplier. `grade` is rise over run
 * *along the direction of travel*: positive is uphill.
 */
export function slopeSpeed(grade: number): number {
  return Math.max(1 - SLOPE_SPEED_MAX, Math.min(1 + SLOPE_SPEED_MAX, 1 - SLOPE_SPEED * grade));
}

/**
 * The pull of gravity along the road, in world units per second squared,
 * against the direction of travel for a positive (uphill) grade.
 */
export function slopePull(grade: number): number {
  return (GRAVITY * grade) / Math.sqrt(1 + grade * grade);
}

/**
 * How much of its grip a car keeps going over a crest at `speed`. `bend` is
 * the road's vertical curvature (the second derivative of height along the
 * way it is going): negative over a crest, where the ground falls away from
 * under the car and it goes light. At `speed * speed * -bend === GRAVITY` it
 * would leave the ground altogether; well short of that it has less to steer
 * with, and `CREST_GRIP_MIN` is the least it keeps.
 */
export function crestGrip(speed: number, bend: number): number {
  const lift = (speed * speed * Math.max(0, -bend)) / GRAVITY;
  return Math.max(CREST_GRIP_MIN, Math.min(1, 1 - lift));
}
