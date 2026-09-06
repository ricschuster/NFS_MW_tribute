import {
  CHECKPOINT_RANGE,
  CITY_COUNTDOWN,
  CITY_RESULT_HOLD,
  RIVAL_BASE_SPEED_FRAC,
  RIVAL_DIFF_SPEED_FRAC,
  FIELD_SIZE,
  FIELD_SPREAD,
  FIELD_WOBBLE,
  FIELD_LANE,
} from './constants';
import { pointAt } from './city/routes';
import type { CityRoute } from './city/types';
import { RIVALS, type Rival } from './rivals';

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
 * The field is tracked by **distance along the line**, exactly as the track
 * rival is. They are not cars navigating the graph, and that is deliberate: a
 * rival that could get lost would be a rival whose difficulty is whatever the
 * junction picker happened to do, and the ladder is tuned against a number.
 */
export type CityRaceState = 'idle' | 'countdown' | 'racing' | 'finished';

/** One car in the field, as a position along the route. */
export interface RaceRival {
  rival: Rival;
  /** How far round the lap, cumulative over laps. */
  dist: number;
  x: number;
  z: number;
  heading: number;
  /** Where in its own pace wobble it is, so the field is not in lockstep. */
  phase: number;
  /** How quickly that wobble cycles. */
  rate: number;
  /** How far off the route line it runs, so a pack reads as a pack. */
  lane: number;
}

/**
 * The field for a challenge (#71).
 *
 * The rival being challenged is always the quickest car in it, and the rest
 * are that rival's difficulty stepped down. The *identities* are borrowed from
 * further along the roster only so the field has names and colours in it;
 * their pace comes from the challenge. Using those rivals' own difficulties
 * would make the first event on the ladder a race against five people you have
 * not earned yet.
 */
export function fieldFor(challenge: Rival): Rival[] {
  const from = Math.max(0, RIVALS.indexOf(challenge));
  const field: Rival[] = [challenge];
  for (let i = 1; i < FIELD_SIZE; i++) {
    const donor = RIVALS[(from + i) % RIVALS.length];
    field.push({ ...donor, difficulty: Math.max(0.05, challenge.difficulty - i * FIELD_SPREAD) });
  }
  return field;
}

export interface Racer {
  x: number;
  z: number;
}

export class CityRace {
  state: CityRaceState = 'idle';
  route: CityRoute | null = null;
  /** Everyone else on the road. The first is the rival being challenged. */
  readonly field: RaceRival[] = [];

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

  /** Seconds since the lights went. Drives the field's pace wobble. */
  private elapsed = 0;

  /** Where the next gate is, for the HUD to point at. Null outside a race. */
  get target(): { x: number; z: number } | null {
    if (this.state !== 'racing' || !this.route) return null;
    return this.route.checkpoints[this.checkpoint] ?? null;
  }

  /** The rival whose defeat moves the ladder: the quickest car in the field. */
  get challenger(): Rival | null {
    return this.field[0]?.rival ?? null;
  }

  /** Where you are running, 1 for the lead. */
  get position(): number {
    return 1 + this.field.reduce((n, car) => n + (car.dist > this.playerDist ? 1 : 0), 0);
  }

  /** How many cars are in the race, you included. */
  get runners(): number {
    return this.field.length + 1;
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
    this.elapsed = 0;

    this.field.length = 0;
    const grid = fieldFor(rival);
    for (let i = 0; i < grid.length; i++) {
      this.field.push({
        rival: grid[i],
        dist: 0,
        x: route.start.x,
        z: route.start.z,
        heading: 0,
        // Spread round the circle and given different rates, so the field
        // drifts against itself instead of surging as one car.
        phase: (i / grid.length) * Math.PI * 2,
        rate: 0.35 + i * 0.07,
        lane: (i - (grid.length - 1) / 2) * FIELD_LANE,
      });
    }
  }

  /** Give up on it: a bust, or a new event started somewhere else. */
  abandon(): void {
    this.state = 'idle';
    this.route = null;
    this.field.length = 0;
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

    if (this.state !== 'racing' || this.field.length === 0) return;

    this.elapsed += dt;
    this.advancePlayer(route, player);
    for (const car of this.field) this.advanceRival(route, car, dt, maxSpeed);

    const target = route.length * route.laps;
    // Over when you cross the line - your result is where you were standing -
    // or when the whole field has, which is you finishing last.
    if (this.playerDist >= target) this.finish(this.position === 1);
    else if (this.field.every((car) => car.dist >= target)) this.finish(false);
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

  private advanceRival(route: CityRoute, car: RaceRival, dt: number, maxSpeed: number): void {
    const base = maxSpeed * (RIVAL_BASE_SPEED_FRAC + car.rival.difficulty * RIVAL_DIFF_SPEED_FRAC);
    // Wandering pace, so positions actually change: without it every place is
    // settled in the first corner and the rest of the race is a procession.
    const pace = base * (1 + FIELD_WOBBLE * Math.sin(this.elapsed * car.rate + car.phase));
    const was = { x: car.x, z: car.z };
    car.dist += pace * dt;

    const at = pointAt(route.points, route.length, car.dist);
    // A little way ahead on the line, so the offset is taken across the road
    // rather than across whatever direction the last step happened to be.
    const ahead = pointAt(route.points, route.length, car.dist + 200);
    const dirX = ahead.x - at.x;
    const dirZ = ahead.z - at.z;
    const length = Math.max(1, Math.hypot(dirX, dirZ));
    car.x = at.x - (dirZ / length) * car.lane;
    car.z = at.z + (dirX / length) * car.lane;

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
