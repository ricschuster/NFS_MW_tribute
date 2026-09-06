import {
  CLAIM_TIME,
  CLAIM_LOSE_RANGE,
  CLAIM_TOUGHNESS,
  CLAIM_SPEED,
  CLAIM_RESULT_HOLD,
  TRAFFIC_LANE,
  CAR_RADIUS,
} from './constants';
import { advanceAlong, exitsFrom, placeOnRoad, type GraphCar } from './graphcar';
import { impactDamage, touching } from './impact';
import type { CityGrid } from './city/grid';
import type { City, CityRoad } from './city/types';
import type { Rival } from './rivals';
import type { Rammer } from './impact';

/**
 * The second half of a ladder fight (#66).
 *
 * Beating a rival in the race gets you nothing. They run, and you have to
 * catch the car and wreck it to take it. That is what makes the ladder a fight
 * rather than a series of results, and it is what makes the takedown machinery
 * from #94 the point of the game rather than something you can do to traffic.
 *
 * The runner is a `GraphCar` like the police and the traffic, not a position
 * along a route like a race rival. That is the difference between the two
 * halves: in the race the rival has a line to run and its difficulty is a
 * number; out here it is a car in the city choosing junctions, and the chase
 * is a chase because it can get away from you down a street you did not take.
 */
export type ClaimState = 'idle' | 'running' | 'won' | 'lost';

export interface Runner extends GraphCar {
  rival: Rival;
}

export class CityClaim {
  state: ClaimState = 'idle';
  runner: Runner | null = null;
  /** Whose car is at stake. Survives the runner, so the result can name it. */
  rival: Rival | null = null;
  /** Seconds left before they are gone for good. */
  left = 0;
  /** Seconds the result banner has left. */
  hold = 0;
  /** True on the step it ends, so the world settles it once. */
  justEnded = false;

  constructor(
    private readonly city: City,
    private readonly grid: CityGrid,
  ) {}

  /** How beaten up their car is, 0..1. What the HUD bar is showing. */
  get damage(): number {
    return this.runner?.damage ?? 0;
  }

  /**
   * They run. Put them on the road nearest the player and let them go.
   *
   * Deliberately started *close*: they have just lost a race to you and the
   * chase begins where the race ended, not with a two-hundred-metre head start
   * that has to be closed before anything can happen.
   */
  begin(rival: Rival, at: Rammer): boolean {
    const roads = this.grid.roadsNear(at.x, at.z).filter((road) => road.length > road.width * 2);
    if (roads.length === 0) return false;

    const road = nearestRoad(this.city, roads, at.x, at.z);
    const runner: Runner = {
      rival,
      road,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: 0,
      z: 0,
      y: 0,
      heading: 0,
    };
    // Pointed away from the player from the first step, or they spend the
    // opening of the chase driving into the car that is chasing them.
    placeOnRoad(this.city, runner, TRAFFIC_LANE);
    if (facing(this.city, runner, at) > 0) {
      runner.forward = false;
      runner.t = 1 - runner.t;
      placeOnRoad(this.city, runner, TRAFFIC_LANE);
    }

    this.runner = runner;
    this.rival = rival;
    this.state = 'running';
    this.left = CLAIM_TIME;
    this.justEnded = false;
    return true;
  }

  abandon(): void {
    this.state = 'idle';
    this.runner = null;
    this.justEnded = false;
  }

  /**
   * Run, get hit, and be caught or get away.
   *
   * `maxSpeed` is the player's, because their pace is a fraction of it: a
   * runner priced in absolute units would be uncatchable in the starter car
   * and a sitting duck in the one you just took off Ghost.
   */
  update(dt: number, player: Rammer, maxSpeed: number): void {
    this.justEnded = false;

    if (this.state === 'won' || this.state === 'lost') {
      this.hold -= dt;
      if (this.hold <= 0) this.state = 'idle';
      return;
    }
    if (this.state !== 'running' || !this.runner) return;

    const runner = this.runner;
    runner.speed = maxSpeed * CLAIM_SPEED;
    advanceAlong(this.city, runner, dt, (car, node) => this.away(car, node, player), TRAFFIC_LANE);

    const gap = Math.hypot(runner.x - player.x, runner.z - player.z);
    // The clock runs faster while they are out of reach, so losing them is
    // losing them rather than a slow walk back to the same distance.
    this.left -= dt * (gap > CLAIM_LOSE_RANGE ? 3 : 1);

    if (touching(player, runner)) {
      const hurt = impactDamage(player, runner, maxSpeed, this.grid, CLAIM_TOUGHNESS);
      runner.damage = Math.min(1, runner.damage + hurt);
    }

    if (runner.damage >= 1) this.end('won');
    else if (this.left <= 0) this.end('lost');
  }

  /** At a junction, take whatever road gets furthest from the player. */
  private away(car: GraphCar, node: number, player: Rammer): CityRoad | null {
    const options = exitsFrom(this.city, car, node);
    if (options.length === 0) return null;

    let best: CityRoad | null = null;
    let bestGap = -Infinity;
    for (const road of options) {
      const far = road.a === node ? this.city.nodes[road.b] : this.city.nodes[road.a];
      const gap = Math.hypot(far.pos.x - player.x, far.pos.z - player.z);
      if (gap > bestGap) {
        bestGap = gap;
        best = road;
      }
    }
    return best;
  }

  private end(how: 'won' | 'lost'): void {
    this.state = how;
    this.hold = CLAIM_RESULT_HOLD;
    this.justEnded = true;
    this.runner = null;
  }
}

/** Whichever of these roads passes nearest the point. */
function nearestRoad(city: City, roads: CityRoad[], x: number, z: number): CityRoad {
  let best = roads[0];
  let bestGap = Infinity;
  for (const road of roads) {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const gap = Math.hypot((a.x + b.x) / 2 - x, (a.z + b.z) / 2 - z);
    if (gap < bestGap) {
      bestGap = gap;
      best = road;
    }
  }
  return best;
}

/** Positive when the car is pointed at the player rather than away from them. */
function facing(city: City, car: GraphCar, at: Rammer): number {
  const a = city.nodes[car.road.a].pos;
  const b = city.nodes[car.road.b].pos;
  const dx = (b.x - a.x) * (car.forward ? 1 : -1);
  const dz = (b.z - a.z) * (car.forward ? 1 : -1);
  const length = Math.max(1, Math.hypot(dx, dz));
  return ((at.x - car.x) * dx + (at.z - car.z) * dz) / length / Math.max(CAR_RADIUS, 1);
}
