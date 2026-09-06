import {
  CHECKPOINT_RANGE,
  CITY_COUNTDOWN,
  CITY_RESULT_HOLD,
  RIVAL_BASE_SPEED_FRAC,
  RIVAL_DIFF_SPEED_FRAC,
} from './constants';
import { pointAt } from './city/routes';
import type { CityRoute } from './city/types';
import type { Rival } from './rivals';

/**
 * A race in Kestrel Bay (#70).
 *
 * The event type the genre runs most: a circuit, three laps of a loop of real
 * streets, against a rival off the ladder. This is what `?renderer=drive` was
 * missing - somewhere for the Rep to go and something to do between pursuits -
 * and it is the last system that has to come across before `world.ts` can
 * retire.
 *
 * Two things are worth knowing about how it works.
 *
 * The player is tracked by **checkpoints**, not by distance. A city has more
 * than one way round a corner, and a race scored on distance travelled is a
 * race won by driving in circles; a race scored on gates passed in order is a
 * race that has to be driven round the route.
 *
 * The rival is tracked by **distance along the line**, exactly as the track
 * rival is. It is not a car navigating the graph, and that is deliberate: a
 * rival that could get lost would be a rival whose difficulty is whatever the
 * junction picker happened to do, and the ladder is tuned against a number.
 */
export type CityRaceState = 'idle' | 'countdown' | 'racing' | 'finished';

/** The rival, as a position along the route. */
export interface RaceRival {
  rival: Rival;
  /** How far round the lap, cumulative over laps. */
  dist: number;
  x: number;
  z: number;
  heading: number;
}

export interface Racer {
  x: number;
  z: number;
}

export class CityRace {
  state: CityRaceState = 'idle';
  route: CityRoute | null = null;
  rival: RaceRival | null = null;

  countdown = 0;
  /** Laps completed. */
  lap = 0;
  /** The checkpoint being driven at, within the current lap. */
  checkpoint = 0;
  /** How far round, cumulative over laps: what the position is judged on. */
  playerDist = 0;
  /** Set once the race is over, and true when it was won. */
  won = false;
  /** Seconds the result banner has left. */
  resultHold = 0;
  /** True on the step a race finishes, so the world can pay for it once. */
  justFinished = false;

  /** Where the next gate is, for the HUD to point at. Null outside a race. */
  get target(): { x: number; z: number } | null {
    if (this.state !== 'racing' || !this.route) return null;
    return this.route.checkpoints[this.checkpoint] ?? null;
  }

  /** 1 while you are ahead, 2 while you are not. */
  get position(): number {
    if (!this.rival) return 1;
    return this.playerDist >= this.rival.dist ? 1 : 2;
  }

  /** How far round one lap each gate is. */
  private get spacing(): number {
    const route = this.route;
    return route ? route.length / route.checkpoints.length : 1;
  }

  /** Line up for a lap of `route` against `rival`. */
  begin(route: CityRoute, rival: Rival): void {
    this.route = route;
    this.state = 'countdown';
    this.countdown = CITY_COUNTDOWN;
    this.lap = 0;
    this.checkpoint = 0;
    this.playerDist = 0;
    this.won = false;
    this.justFinished = false;
    this.rival = {
      rival,
      dist: 0,
      x: route.start.x,
      z: route.start.z,
      heading: 0,
    };
  }

  /** Give up on it: a bust, or a new event started somewhere else. */
  abandon(): void {
    this.state = 'idle';
    this.route = null;
    this.rival = null;
    this.justFinished = false;
  }

  update(dt: number, player: Racer, maxSpeed: number): void {
    this.justFinished = false;
    const route = this.route;
    if (!route) return;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.state = 'racing';
      return;
    }

    if (this.state === 'finished') {
      this.resultHold -= dt;
      if (this.resultHold <= 0) this.abandon();
      return;
    }

    if (this.state !== 'racing' || !this.rival) return;

    this.advancePlayer(route, player);
    this.advanceRival(route, dt, maxSpeed);

    const target = route.length * route.laps;
    if (this.playerDist >= target) this.finish(true);
    else if (this.rival.dist >= target) this.finish(false);
  }

  /** Gates passed, plus how far it is to the next one. */
  private advancePlayer(route: CityRoute, player: Racer): void {
    const gate = route.checkpoints[this.checkpoint];
    const gap = Math.hypot(gate.x - player.x, gate.z - player.z);
    if (gap < CHECKPOINT_RANGE) {
      this.checkpoint++;
      if (this.checkpoint >= route.checkpoints.length) {
        this.checkpoint = 0;
        this.lap++;
      }
    }

    // The partial is only for the position readout, so a straight-line guess
    // at how far past the last gate you are is exactly good enough.
    const toNext = Math.hypot(
      route.checkpoints[this.checkpoint].x - player.x,
      route.checkpoints[this.checkpoint].z - player.z,
    );
    const partial = Math.max(0, Math.min(1, 1 - toNext / this.spacing));
    this.playerDist =
      this.lap * route.length + this.checkpoint * this.spacing + partial * this.spacing;
  }

  private advanceRival(route: CityRoute, dt: number, maxSpeed: number): void {
    const car = this.rival;
    if (!car) return;

    const pace = maxSpeed * (RIVAL_BASE_SPEED_FRAC + car.rival.difficulty * RIVAL_DIFF_SPEED_FRAC);
    const was = { x: car.x, z: car.z };
    car.dist += pace * dt;

    const at = pointAt(route.points, route.length, car.dist);
    car.x = at.x;
    car.z = at.z;
    // Pointed the way it is actually going, taken from where it just was: the
    // route is a polyline and its direction is whatever the last step did.
    const dx = car.x - was.x;
    const dz = car.z - was.z;
    if (Math.hypot(dx, dz) > 1) car.heading = Math.atan2(dx, dz);
  }

  private finish(won: boolean): void {
    this.state = 'finished';
    this.won = won;
    this.justFinished = true;
    this.resultHold = CITY_RESULT_HOLD;
  }
}
