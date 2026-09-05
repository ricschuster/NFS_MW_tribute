import { roadHeightAt } from './city/grid';
import type { City, CityRoad } from './city/types';

/**
 * A car that lives on the street graph rather than loose in the world.
 *
 * Traffic and police are both this: *which road, how far along, which way*,
 * with the world position derived each step. Keeping the graph as the truth is
 * what makes them follow streets instead of drifting across them, and it is
 * what lets a car be shoved along its road rather than knocked off it.
 *
 * The player is deliberately not one of these. A player pinned to the graph
 * could not cut across a car park, and cutting across a car park is the point
 * of free roam.
 */
export interface GraphCar {
  road: CityRoad;
  /** How far along the road, 0..1, in the direction of travel. */
  t: number;
  /** True when travelling from the road's `a` end toward its `b` end. */
  forward: boolean;
  speed: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  /**
   * How beaten up it is, 0..1 (#94). At 1 the car is wrecked and its owner
   * takes it out of play. Every car on the graph carries it, because a
   * takedown has to work the same way on a cruiser and on a hatchback.
   */
  damage: number;
}

/** The unit vector a car is travelling in. */
export function directionOf(city: City, car: GraphCar): { x: number; z: number } {
  const a = city.nodes[car.road.a].pos;
  const b = city.nodes[car.road.b].pos;
  const dx = (b.x - a.x) * (car.forward ? 1 : -1);
  const dz = (b.z - a.z) * (car.forward ? 1 : -1);
  const length = Math.max(1, Math.hypot(dx, dz));
  return { x: dx / length, z: dz / length };
}

/** The node a car is heading toward. */
export const nodeAhead = (car: GraphCar) => (car.forward ? car.road.b : car.road.a);

/** Derive the world position from where the car is on the graph. */
export function placeOnRoad(city: City, car: GraphCar, laneOffset: number): void {
  const a = city.nodes[car.road.a].pos;
  const b = city.nodes[car.road.b].pos;
  const from = car.forward ? a : b;
  const to = car.forward ? b : a;

  const x = from.x + (to.x - from.x) * car.t;
  const z = from.z + (to.z - from.z) * car.t;

  // Keep right of the centreline, so oncoming cars pass on the correct side
  // instead of through you.
  const heading = directionOf(city, car);
  const offset = Math.min(laneOffset, car.road.width / 4);
  car.x = x - heading.z * offset;
  car.z = z + heading.x * offset;
  car.y = roadHeightAt(city, car.road, x, z);
  car.heading = Math.atan2(heading.x, heading.z);
}

/**
 * Move a car along its road, taking whatever `choose` picks at each junction.
 *
 * The hop limit is not paranoia: a fast car on short road pieces really can
 * cross several in one step, and an unbounded loop here is a frozen tab the
 * first time a cop meets a chain of stubs.
 */
export function advanceAlong(
  city: City,
  car: GraphCar,
  dt: number,
  choose: (car: GraphCar, node: number) => CityRoad | null,
  laneOffset: number,
): void {
  car.t += (car.speed * dt) / Math.max(1, car.road.length);

  let hops = 0;
  while (car.t >= 1 && hops < 4) {
    hops++;
    const ahead = nodeAhead(car);
    const next = choose(car, ahead);
    if (!next) {
      // A dead end. Turn round rather than stop, or the street silts up.
      car.forward = !car.forward;
      car.t = 0;
      break;
    }
    car.t = (car.t - 1) * (car.road.length / Math.max(1, next.length));
    car.forward = next.a === ahead;
    car.road = next;
  }
  car.t = Math.min(car.t, 1);

  placeOnRoad(city, car, laneOffset);
}

/** The roads leaving `node`, other than the one the car is already on. */
export function exitsFrom(city: City, car: GraphCar, node: number): CityRoad[] {
  return city.nodes[node].roads.map((id) => city.roads[id]).filter((road) => road !== car.road);
}
