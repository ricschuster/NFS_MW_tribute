import {
  QUARRY_DIRT_REACH,
  TRAFFIC_LANE,
  TRUCK_COUNT,
  TRUCK_GAP,
  TRUCK_SPEED,
} from './constants';
import { PLAN_PLACES } from './city/plan';
import type { City, CityRoad } from './city/types';
import { advanceAlong, directionOf, exitsFrom, placeOnRoad, type GraphCar } from './graphcar';

/**
 * The quarry's haul trucks (#330): the traffic that belongs on the gravel roads
 * civilian traffic is kept off (#327).
 *
 * A handful of `GraphCar`s, not a crowd, and not tied to where the player is:
 * four trucks cost nothing to keep running, and a pit that is only busy while
 * you are looking at it is a set, not a workplace. They live on the graph like
 * every other car here, confined to the quarry's own gravel roads - the haul
 * spiral and the rim loop - so a truck that reaches the way in turns round
 * rather than driving out into the city. At the dead end on the pit floor
 * `advanceAlong` turns them round too, which is the loading point.
 *
 * Nothing here knows about the player, the police or the renderer. What a hit
 * costs is `CityWorld.contacts`'s to say, and what one looks like is
 * `scene/trucks.ts`'s.
 */
export class QuarryTrucks {
  readonly cars: GraphCar[] = [];
  private readonly roads: CityRoad[];

  constructor(private readonly city: City) {
    const pit = PLAN_PLACES.find((p) => p.kind === 'quarry');
    const reach = pit ? pit.radius * QUARRY_DIRT_REACH : 0;
    this.roads = pit
      ? city.roads.filter((road) => {
          if (road.surface !== 'gravel' || road.bridge) return false;
          const a = city.nodes[road.a].pos;
          const b = city.nodes[road.b].pos;
          return Math.hypot((a.x + b.x) / 2 - pit.at.x, (a.z + b.z) / 2 - pit.at.z) <= reach;
        })
      : [];
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
