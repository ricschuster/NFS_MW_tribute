import {
  TRAFFIC_IN_CITY,
  TRAFFIC_RADIUS,
  TRAFFIC_SPAWN_MIN,
  TRAFFIC_SPEED_MIN,
  TRAFFIC_SPEED_MAX,
  TRAFFIC_LANE,
  TRAFFIC_GAP,
  CAR_COLORS,
} from './constants';
import type { CityGrid } from './city/grid';
import type { Rng } from './city/rng';
import type { City, CityRoad } from './city/types';
import {
  advanceAlong,
  directionOf,
  exitsFrom,
  placeOnRoad,
  type GraphCar,
} from './graphcar';

/** One car going about its business on the street network. */
export interface TrafficCar extends GraphCar {
  colour: string;
}

/**
 * Ambient traffic in Kestrel Bay (#87).
 *
 * A city has two thousand roads and the player can be anywhere on any of
 * them, so there is no fixed set of cars to keep: traffic is kept *around the
 * player* instead. Cars are spawned outside what can be seen, driven along the
 * network, and dropped once they are far enough behind that nobody will notice
 * them go.
 *
 * Headless and seeded, like everything else in the sim, so a playtest that
 * drives into traffic hits the same car twice.
 */
export class CityTraffic {
  readonly cars: TrafficCar[] = [];

  constructor(
    private readonly city: City,
    private readonly grid: CityGrid,
    private readonly rng: Rng,
  ) {}

  /** Take a car out of the traffic: wrecked, and no longer going anywhere (#94). */
  remove(car: TrafficCar): void {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  update(dt: number, at: { x: number; z: number }): void {
    for (const car of this.cars) this.follow(car);
    for (const car of this.cars) this.advance(car, dt);

    // Drop what has fallen behind, with hysteresis: cars are kept a little
    // past the radius they spawn within, so one hovering at the boundary is
    // not spawned and despawned on alternate frames.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (Math.hypot(car.x - at.x, car.z - at.z) > TRAFFIC_RADIUS * 1.35) {
        this.cars.splice(i, 1);
      }
    }

    let attempts = 0;
    while (this.cars.length < TRAFFIC_IN_CITY && attempts < 30) {
      attempts++;
      const car = this.spawn(at);
      if (car) this.cars.push(car);
    }
  }

  /**
   * Slow for whatever is in front.
   *
   * Measured in world space rather than along the road, which matters more
   * than it sounds: roads are split at every junction, so a street is a chain
   * of short pieces and the car in front is almost always on a *different*
   * road object. Comparing along one road only sees cars between the same two
   * junctions, which is nearly none of them, and the rest drive through each
   * other.
   */
  private follow(car: TrafficCar): void {
    const pace = this.paceLimit(car);
    const heading = this.direction(car);

    let gap = Infinity;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const distance = Math.hypot(dx, dz);
      if (distance > TRAFFIC_GAP * 2 || distance < 1) continue;

      // In front of me, and going roughly my way rather than passing the
      // other side of the road.
      if ((dx / distance) * heading.x + (dz / distance) * heading.z < 0.7) continue;
      const theirs = this.direction(other);
      if (theirs.x * heading.x + theirs.z * heading.z < 0.5) continue;

      if (distance < gap) gap = distance;
    }
    if (gap >= TRAFFIC_GAP) {
      // Ease back up to pace rather than snapping, so a car that has just been
      // let out does not leap forward.
      car.speed = Math.min(pace, car.speed + pace * 0.05);
      return;
    }
    car.speed = Math.max(0, pace * (gap / TRAFFIC_GAP) * 0.8);
  }

  /** The speed this car would hold on an empty road. */
  private paceLimit(car: TrafficCar): number {
    return car.road.speed * TRAFFIC_SPEED_MAX;
  }

  /** Move a car along its road, and pick a new one when it runs out. */
  private advance(car: TrafficCar, dt: number): void {
    advanceAlong(this.city, car, dt, (c, node) => this.nextRoad(c as TrafficCar, node), TRAFFIC_LANE);
  }

  /**
   * Which way to go at a junction: straight on where possible.
   *
   * Traffic that picks at random turns constantly and reads as lost. Weighting
   * toward the road that continues the current direction gives cars that look
   * like they are going somewhere, and it costs one dot product.
   */
  private nextRoad(car: TrafficCar, node: number): CityRoad | null {
    const heading = this.direction(car);
    const options = exitsFrom(this.city, car, node);
    if (options.length === 0) return null;

    let best: CityRoad | null = null;
    let bestScore = -Infinity;
    for (const road of options) {
      const a = this.city.nodes[road.a].pos;
      const b = this.city.nodes[road.b].pos;
      const away = road.a === node ? { x: b.x - a.x, z: b.z - a.z } : { x: a.x - b.x, z: a.z - b.z };
      const length = Math.max(1, Math.hypot(away.x, away.z));
      const straightness = (away.x / length) * heading.x + (away.z / length) * heading.z;
      // A little noise, so a junction is not always taken the same way.
      const score = straightness + this.rng.range(-0.35, 0.35);
      if (score > bestScore) {
        bestScore = score;
        best = road;
      }
    }
    if (best) car.speed = this.paceFor(best);
    return best;
  }

  private direction(car: TrafficCar) {
    return directionOf(this.city, car);
  }

  private place(car: TrafficCar): void {
    placeOnRoad(this.city, car, TRAFFIC_LANE);
  }

  private paceFor(road: CityRoad): number {
    return road.speed * this.rng.range(TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX);
  }

  /** Find a road near the player but out of sight, and put a car on it. */
  private spawn(at: { x: number; z: number }): TrafficCar | null {
    const angle = this.rng.range(0, Math.PI * 2);
    const distance = this.rng.range(TRAFFIC_SPAWN_MIN, TRAFFIC_RADIUS);
    const x = at.x + Math.sin(angle) * distance;
    const z = at.z + Math.cos(angle) * distance;

    const nearby = this.grid.roadsNear(x, z).filter((road) => road.length > road.width * 2);
    if (nearby.length === 0) return null;

    const road = nearby[this.rng.int(nearby.length)];

    // Put the car at the point on that road nearest where we were looking, not
    // at a random point along it. An arterial can be kilometres long, so a
    // random t drops the car anywhere on the map - it only has to *pass* near
    // the player to be picked.
    const a = this.city.nodes[road.a].pos;
    const b = this.city.nodes[road.b].pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = Math.max(1, dx * dx + dz * dz);
    const nearest = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
    const forward = this.rng.chance(0.5);

    const car: TrafficCar = {
      road,
      // `t` runs in the direction of travel, so it flips with `forward`.
      t: forward ? nearest : 1 - nearest,
      forward,
      speed: this.paceFor(road),
      colour: CAR_COLORS[this.rng.int(CAR_COLORS.length)],
      damage: 0,
      x: 0,
      z: 0,
      y: 0,
      heading: 0,
    };
    this.place(car);

    // Never spawn one on top of the player, whatever the geometry said.
    if (Math.hypot(car.x - at.x, car.z - at.z) < TRAFFIC_SPAWN_MIN * 0.6) return null;
    // Nor inside another car: two cars in one spot never separate, because
    // each is following the other.
    for (const other of this.cars) {
      if (Math.hypot(car.x - other.x, car.z - other.z) < TRAFFIC_GAP) return null;
    }
    return car;
  }
}
