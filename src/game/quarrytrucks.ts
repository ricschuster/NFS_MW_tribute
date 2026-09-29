import {
  TRAFFIC_LANE,
  TRUCK_COUNT,
  TRUCK_GAP,
  TRUCK_SPEED,
} from './constants';
import { haulRoad } from './city/haulroad';
import type { City, CityRoad } from './city/types';
import { advanceAlong, directionOf, exitsFrom, placeOnRoad, type GraphCar } from './graphcar';

/**
 * The quarry's haul trucks (#330): the traffic that belongs on the gravel roads
 * civilian traffic is kept off (#327).
 *
 * A handful of `GraphCar`s, not a crowd, and not tied to where the player is:
 * four trucks cost nothing to keep running, and a pit that is only busy while
 * you are looking at it is a set, not a workplace. They live on the graph like
 * every other car here, confined to the haul road: the spiral from the
 * loading point on the pit floor up to its junction with the rim loop, where a
 * truck turns round rather than going on. At the dead end on the pit floor
 * `advanceAlong` turns them round too.
 *
 * Not the rim loop, though it is gravel too. The Halloway Rim is raced, and a
 * truck at this scale fills the rim road: measured, 0.7 m to spare beside one
 * for a car 4.4 m across, so a race that met one was a race spent following
 * it at 30 km/h while the field, on its fixed line, drove through it. From the
 * rim you watch them work the pit below.
 *
 * Nothing here knows about the player, the police or the renderer. What a hit
 * costs is `CityWorld.contacts`'s to say, and what one looks like is
 * `scene/trucks.ts`'s.
 */
export class QuarryTrucks {
  readonly cars: GraphCar[] = [];
  private readonly roads: CityRoad[];

  constructor(private readonly city: City) {
    this.roads = haulRoad(city);
    // Spread along the road list rather than at random: it is ordered along
    // the haul, so an even stride puts the trucks on different turns of it.
    for (let i = 0; i < TRUCK_COUNT && this.roads.length > 0; i++) {
      const road = this.roads[Math.floor(((i + 0.5) * this.roads.length) / TRUCK_COUNT)];
      const car: GraphCar = {
        road,
        t: 0.5,
        forward: i % 2 === 0,
        speed: TRUCK_SPEED,
        x: 0,
        z: 0,
        y: 0,
        heading: 0,
        damage: 0,
      };
      placeOnRoad(city, car, TRAFFIC_LANE);
      this.cars.push(car);
    }
  }

  /**
   * Off the haul road while it is raced (#397). A truck fills the road - 0.7 m
   * to spare beside one - so a sprint that met one would be a sprint spent
   * following it at 30 km/h. They are taken off it for the race, knocking
   * off, as the owner of a quarry would have them do for an event through it,
   * and carry on from where they were once it is over.
   */
  standAside(aside: boolean): void {
    aside ||= this.keptOff;
    if (aside && this.cars.length > 0) {
      this.parked.push(...this.cars.splice(0));
    } else if (!aside && this.parked.length > 0) {
      this.cars.push(...this.parked.splice(0));
    }
  }
  private readonly parked: GraphCar[] = [];
  /** Off the road whatever is happening, for a probe driving the sprint outside a race. */
  keptOff = false;

  update(dt: number): void {
    for (const car of this.cars) {
      this.follow(car, dt);
      advanceAlong(this.city, car, dt, (c, node) => this.nextRoad(c, node), TRAFFIC_LANE);
    }
  }

  /** Hold back from a truck in front, and ease up to pace otherwise. */
  private follow(car: GraphCar, dt: number): void {
    const heading = directionOf(this.city, car);
    let ahead = false;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const distance = Math.hypot(dx, dz);
      if (distance > TRUCK_GAP || distance < 1) continue;
      if ((dx / distance) * heading.x + (dz / distance) * heading.z > 0.5) ahead = true;
    }
    const target = ahead ? 0 : TRUCK_SPEED;
    const ease = TRUCK_SPEED * 0.5 * dt;
    car.speed += Math.max(-ease * 2, Math.min(ease, target - car.speed));
  }

  /** Straight on where possible, and only ever onto the quarry's own roads. */
  private nextRoad(car: GraphCar, node: number): CityRoad | null {
    const heading = directionOf(this.city, car);
    let best: CityRoad | null = null;
    let bestScore = -Infinity;
    for (const road of exitsFrom(this.city, car, node)) {
      if (!this.roads.includes(road)) continue;
      const a = this.city.nodes[road.a].pos;
      const b = this.city.nodes[road.b].pos;
      const away = road.a === node ? { x: b.x - a.x, z: b.z - a.z } : { x: a.x - b.x, z: a.z - b.z };
      const length = Math.max(1, Math.hypot(away.x, away.z));
      const score = (away.x / length) * heading.x + (away.z / length) * heading.z;
      if (score > bestScore) {
        bestScore = score;
        best = road;
      }
    }
    return best;
  }
}
