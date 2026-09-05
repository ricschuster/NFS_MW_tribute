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
import { roadHeightAt, type CityGrid } from './city/grid';
import type { Rng } from './city/rng';
import type { City, CityRoad } from './city/types';

/**
 * One car going about its business on the street network.
 *
 * It is described by where it is on the graph - which road, how far along,
 * which way - rather than by a position, because that is what makes it follow
 * the streets rather than drift across them. The world position is derived
 * from that each step, not the other way round.
 */
export interface TrafficCar {
  road: CityRoad;
  /** How far along the road, 0..1, in the direction of travel. */
  t: number;
  /** True when travelling from the road's `a` end toward its `b` end. */
  forward: boolean;
  speed: number;
  colour: string;
  x: number;
  z: number;
  y: number;
  heading: number;
}

/**
 * Ambient traffic in Kestrel Bay (#87).
 *
 * The track version keeps a fixed set of cars at fixed offsets on an endless
 * loop, which works because the track is one road and the player can only be
 * on it. A city has two thousand roads and the player can be anywhere, so
 * traffic is kept *around the player* instead: cars are spawned outside what
 * can be seen, driven along the network, and dropped once they are far enough
 * behind that nobody will notice them go.
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
    car.t += (car.speed * dt) / Math.max(1, car.road.length);

    let hops = 0;
    while (car.t >= 1 && hops < 4) {
      hops++;
      const ahead = car.forward ? car.road.b : car.road.a;
      const next = this.nextRoad(car, ahead);
      if (!next) {
        // A dead end. Turn round rather than stop, or the street silts up.
        car.forward = !car.forward;
        car.t = 0;
        break;
      }
      car.t = (car.t - 1) * (car.road.length / Math.max(1, next.length));
      car.forward = next.a === ahead;
      car.road = next;
      car.speed = this.paceFor(next);
    }
    car.t = Math.min(car.t, 1);

    this.place(car);
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
    const options = this.city.nodes[node].roads
      .map((id) => this.city.roads[id])
      .filter((road) => road !== car.road);
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
    return best;
  }

  /** The unit vector a car is travelling in. */
  private direction(car: TrafficCar): { x: number; z: number } {
    const a = this.city.nodes[car.road.a].pos;
    const b = this.city.nodes[car.road.b].pos;
    const dx = (b.x - a.x) * (car.forward ? 1 : -1);
    const dz = (b.z - a.z) * (car.forward ? 1 : -1);
    const length = Math.max(1, Math.hypot(dx, dz));
    return { x: dx / length, z: dz / length };
  }

  /** Derive the world position from where the car is on the graph. */
  private place(car: TrafficCar): void {
    const a = this.city.nodes[car.road.a].pos;
    const b = this.city.nodes[car.road.b].pos;
    const from = car.forward ? a : b;
    const to = car.forward ? b : a;

    const x = from.x + (to.x - from.x) * car.t;
    const z = from.z + (to.z - from.z) * car.t;

    // Keep right of the centreline, so oncoming traffic passes on the correct
    // side instead of through you.
    const heading = this.direction(car);
    const offset = Math.min(TRAFFIC_LANE, car.road.width / 4);
    car.x = x - heading.z * offset;
    car.z = z + heading.x * offset;
    car.y = roadHeightAt(this.city, car.road, x, z);
    car.heading = Math.atan2(heading.x, heading.z);
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
