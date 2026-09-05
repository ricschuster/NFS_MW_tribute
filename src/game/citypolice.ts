import {
  COP_FIRST_SPAWN,
  COP_RESPAWN,
  COP_BUST_COOLDOWN,
  COP_SPAWN_INTERVAL,
  CITY_COP_LOSE,
  BUST_TIME,
  ESCAPE_TIME,
  CITY_HEAT_RISE,
  CITY_HEAT_DECAY,
  CITY_COP_SPAWN,
  CITY_BUST_DISTANCE,
  CITY_PURSUIT_RANGE,
  TRAFFIC_LANE,
  HEAT_LEVELS,
  HEAT_LEVEL_COUNT,
  COP_UNITS,
  type CopKind,
} from './constants';
import type { CityGrid } from './city/grid';
import type { Rng } from './city/rng';
import type { City, CityRoad } from './city/types';
import { advanceAlong, directionOf, exitsFrom, placeOnRoad, type GraphCar } from './graphcar';

export interface Cop extends GraphCar {
  /** What kind of unit this is: decides its pace, and how it is drawn. */
  kind: CopKind;
}

/** What the pursuit reacts to. */
export interface Chased {
  x: number;
  z: number;
  y: number;
  speed: number;
}

/**
 * The police pursuit, in world space (#87).
 *
 * The track version tracks a cop as a single number - how far it trails the
 * player - because a projected renderer cannot draw anything behind you, so a
 * cop only ever needed a distance and a lane. Here a cop is a car in the city
 * with a place of its own, which means it can be beside you, cutting a corner,
 * or coming the other way up a street you were about to turn into.
 *
 * Cops navigate the graph rather than steering straight at the player: at each
 * junction they take whichever road most reduces the distance. That is greedy
 * and will sometimes send one the wrong way round a block, which is the right
 * failure - a pursuit that never makes a mistake is a pursuit you cannot lose,
 * and the ones that get it right feel like they read the street.
 */
export class CityPolice {
  readonly cops: Cop[] = [];
  /** 0..1. Rises while a cop is close, and drives the heat *level*. */
  heat = 0;
  busted = false;
  /** True on the step the last cop is shaken off. */
  justEscaped = false;

  private sinceSpawn = 0;
  private cooldown = COP_FIRST_SPAWN;
  private pinned = 0;
  private clear = 0;

  constructor(
    private readonly city: City,
    private readonly grid: CityGrid,
    private readonly rng: Rng,
  ) {}

  /**
   * Which of the six levels the pursuit is at, 1 to 6.
   *
   * Derived from continuous heat rather than stored, so there is one number to
   * get wrong instead of two that can disagree. Heat rises while they have you
   * and falls while they do not, which means escalation happens *within* a
   * pursuit - the longer they hold you the heavier what turns up.
   */
  get level(): number {
    return Math.min(HEAT_LEVEL_COUNT, 1 + Math.floor(this.heat * HEAT_LEVEL_COUNT));
  }

  /** The units, speed and cop count this level brings. */
  private get force() {
    return HEAT_LEVELS[this.level - 1];
  }

  update(dt: number, player: Chased, maxSpeed: number): void {
    this.justEscaped = false;
    if (this.busted) return;

    const speed = maxSpeed * this.force.speed;
    for (const cop of this.cops) {
      cop.speed = speed * COP_UNITS[cop.kind].pace;
      advanceAlong(this.city, cop, dt, (c, node) => this.toward(c, node, player), TRAFFIC_LANE);
    }

    // Anything that has fallen a long way behind has lost you.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      if (this.gapTo(this.cops[i], player) > CITY_COP_LOSE) this.cops.splice(i, 1);
    }

    this.judge(dt, player);
    this.recruit(dt, player);
  }

  /** Heat, the bust timer, and the escape timer. */
  private judge(dt: number, player: Chased): void {
    const nearest = this.cops.reduce(
      (best, cop) => Math.min(best, this.gapTo(cop, player)),
      Infinity,
    );

    if (this.cops.length === 0) {
      // Nothing to shake off, so nothing is being shaken off. Without this the
      // escape timer runs while you are alone, and the first cop to arrive -
      // which necessarily arrives from outside pursuit range - is declared
      // escaped on the step after it spawns.
      this.heat = Math.max(0, this.heat - CITY_HEAT_DECAY * dt);
      this.clear = 0;
      return;
    }

    // Heat climbs while the pursuit is *running*, not only while a car is on
    // your bumper. Cops chasing from a hundred metres back have not lost you,
    // and an earlier version that only counted close contact left heat
    // oscillating around zero through a pursuit that never ended.
    const close = nearest < CITY_PURSUIT_RANGE;
    this.heat = Math.min(1, this.heat + CITY_HEAT_RISE * dt * (close ? 1 : 0.5));
    this.clear = close ? 0 : this.clear + dt;

    // Pinned: a cop on your bumper for long enough ends it.
    if (nearest < CITY_BUST_DISTANCE) {
      this.pinned += dt;
      if (this.pinned >= BUST_TIME) {
        this.busted = true;
        this.cooldown = COP_BUST_COOLDOWN;
      }
    } else {
      this.pinned = 0;
    }

    if (this.cops.length > 0 && this.clear >= ESCAPE_TIME) {
      this.cops.length = 0;
      this.justEscaped = true;
      this.heat = 0;
      this.cooldown = COP_RESPAWN;
    }
  }

  /** Bring more cops in, up to the count heat allows. */
  private recruit(dt: number, player: Chased): void {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    const wanted = this.force.maxCops;
    this.sinceSpawn += dt;
    if (this.cops.length >= wanted || this.sinceSpawn < COP_SPAWN_INTERVAL) return;

    const cop = this.spawn(player);
    if (cop) {
      this.cops.push(cop);
      this.sinceSpawn = 0;
      // It has only just arrived; it has not lost you yet.
      this.clear = 0;
    }
  }

  /**
   * At a junction, take the road that gets closest to the player.
   *
   * Judged on where the road *ends*, not where it points: a road curving back
   * on itself points the right way and goes the wrong place.
   */
  private toward(cop: GraphCar, node: number, player: Chased): CityRoad | null {
    const options = exitsFrom(this.city, cop, node);
    if (options.length === 0) return null;

    let best: CityRoad | null = null;
    let bestGap = Infinity;
    for (const road of options) {
      const far = road.a === node ? this.city.nodes[road.b] : this.city.nodes[road.a];
      const gap = Math.hypot(far.pos.x - player.x, far.pos.z - player.z);
      if (gap < bestGap) {
        bestGap = gap;
        best = road;
      }
    }
    return best;
  }

  private gapTo(cop: Cop, player: Chased): number {
    return Math.hypot(cop.x - player.x, cop.z - player.z);
  }

  /** Put a cop on a road behind the player, out of sight but not out of reach. */
  private spawn(player: Chased): Cop | null {
    const angle = this.rng.range(0, Math.PI * 2);
    const x = player.x + Math.sin(angle) * CITY_COP_SPAWN;
    const z = player.z + Math.cos(angle) * CITY_COP_SPAWN;

    const nearby = this.grid.roadsNear(x, z).filter((road) => road.length > road.width * 2);
    if (nearby.length === 0) return null;

    const road = nearby[this.rng.int(nearby.length)];
    const a = this.city.nodes[road.a].pos;
    const b = this.city.nodes[road.b].pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = Math.max(1, dx * dx + dz * dz);
    const nearest = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));

    // Point it at the player from the start, rather than letting it drive away
    // and turn round at the next junction.
    const cop: Cop = {
      road,
      t: nearest,
      forward: true,
      speed: 0,
      x: 0,
      z: 0,
      y: 0,
      heading: 0,
      kind: this.rng.pick(this.force.units),
    };
    placeOnRoad(this.city, cop, TRAFFIC_LANE);
    const facing = directionOf(this.city, cop);
    const toPlayer = { x: player.x - cop.x, z: player.z - cop.z };
    if (facing.x * toPlayer.x + facing.z * toPlayer.z < 0) {
      cop.forward = false;
      cop.t = 1 - cop.t;
      placeOnRoad(this.city, cop, TRAFFIC_LANE);
    }

    if (this.gapTo(cop, player) < CITY_BUST_DISTANCE * 2) return null;
    return cop;
  }

  /** Clear the pursuit and start the cooldown. Called after a bust is served. */
  reset(): void {
    this.cops.length = 0;
    this.heat = 0;
    this.busted = false;
    this.pinned = 0;
    this.clear = 0;
    this.cooldown = COP_BUST_COOLDOWN;
  }
}
