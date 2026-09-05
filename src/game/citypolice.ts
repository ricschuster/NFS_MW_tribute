import {
  COP_FIRST_SPAWN,
  COP_RESPAWN,
  COP_BUST_COOLDOWN,
  COP_SPAWN_INTERVAL,
  CITY_COP_LOSE,
  BUST_TIME,
  CITY_HEAT_RISE,
  CITY_HEAT_DECAY,
  CITY_COP_SPAWN,
  CITY_BUST_DISTANCE,
  CITY_PURSUIT_RANGE,
  SEEN_RANGE,
  LOSE_CONTACT_TIME,
  SEARCH_TIME,
  SEARCH_TIME_PER_LEVEL,
  SEARCH_RADIUS,
  SEARCH_RADIUS_PER_LEVEL,
  TRAFFIC_LANE,
  HEAT_LEVELS,
  HEAT_LEVEL_COUNT,
  COP_UNITS,
  type CopKind,
} from './constants';
import { lineBlocked, type CityGrid } from './city/grid';
import type { Rng } from './city/rng';
import type { City, CityRoad } from './city/types';
import { advanceAlong, directionOf, exitsFrom, placeOnRoad, type GraphCar } from './graphcar';

export interface Cop extends GraphCar {
  /** What kind of unit this is: decides its pace, and how it is drawn. */
  kind: CopKind;
}

/**
 * Escaping is two stages, not one (#63).
 *
 * `pursuit` is being chased. Break contact and it becomes `cooldown`: a search
 * area is drawn where they lost you and the cops sweep it. Be seen, or sit in
 * it, and the pursuit resumes; get out and stay out and you are `clear`.
 *
 * The one-number version - trail a cop past a distance for a fixed time - made
 * escaping close to binary. Two stages is what makes side streets and cover an
 * escape route rather than scenery.
 */
export type PursuitState = 'clear' | 'pursuit' | 'cooldown';

/** Where they think you went. */
export interface SearchArea {
  x: number;
  z: number;
  radius: number;
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

  /** Which of the three stages the pursuit is in. */
  state: PursuitState = 'clear';
  /** During a cooldown, where they are looking. Null otherwise. */
  search: SearchArea | null = null;
  /** Seconds of searching left, once you are out of the area. */
  searchLeft = 0;

  private sinceSpawn = 0;
  private cooldown = COP_FIRST_SPAWN;
  private pinned = 0;
  private unseen = 0;
  private seenNow = false;
  /** Where they last had eyes on you: the centre of any search that follows. */
  private readonly lastSeen = { x: 0, z: 0 };

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

  /** Heat, the bust timer, and the three-stage escape. */
  private judge(dt: number, player: Chased): void {
    const nearest = this.cops.reduce(
      (best, cop) => Math.min(best, this.gapTo(cop, player)),
      Infinity,
    );
    const seen = this.seenBy(player);
    this.seenNow = seen;

    // Only a pursuit that has *ended* is clear. Cops dropping out of range is
    // them losing you, not you being free: it has to lead into the search like
    // any other broken contact, or outrunning them skips the whole mechanic
    // and cooldown never happens to anyone who is actually fast.
    if (this.state === 'clear' && this.cops.length === 0) {
      this.heat = Math.max(0, this.heat - CITY_HEAT_DECAY * dt);
      this.search = null;
      this.unseen = 0;
      return;
    }

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

    if (this.state === 'cooldown') this.searching(dt, player, seen);
    else this.chasing(dt, nearest, seen);
  }

  /** Being chased: heat climbs, and losing them for long enough starts a search. */
  private chasing(dt: number, nearest: number, seen: boolean): void {
    this.state = 'pursuit';

    // Heat climbs while the pursuit is *running*, not only while a car is on
    // your bumper. Cops chasing from a hundred metres back have not lost you,
    // and an earlier version that only counted close contact left heat
    // oscillating around zero through a pursuit that never ended.
    const close = nearest < CITY_PURSUIT_RANGE;
    this.heat = Math.min(1, this.heat + CITY_HEAT_RISE * dt * (close ? 1 : 0.5));

    this.unseen = seen ? 0 : this.unseen + dt;
    if (this.unseen < LOSE_CONTACT_TIME) return;

    // Contact broken. They fall back on searching where they last had you.
    this.state = 'cooldown';
    this.searchLeft = SEARCH_TIME + SEARCH_TIME_PER_LEVEL * (this.level - 1);
    this.search = {
      x: this.lastSeen.x,
      z: this.lastSeen.z,
      radius: SEARCH_RADIUS + SEARCH_RADIUS_PER_LEVEL * (this.level - 1),
    };
  }

  /**
   * Being searched for.
   *
   * The clock only runs while you are outside the area, which is the whole
   * mechanic: sitting still in the middle of where they are looking is not
   * hiding. Heat carries over and decays slowly, so a hot pursuit takes longer
   * to shed than a cold one.
   */
  private searching(dt: number, player: Chased, seen: boolean): void {
    this.heat = Math.max(0, this.heat - CITY_HEAT_DECAY * dt * 0.5);

    if (seen) {
      this.state = 'pursuit';
      this.search = null;
      this.unseen = 0;
      return;
    }

    const area = this.search;
    if (!area) {
      this.state = 'pursuit';
      return;
    }

    const inside = Math.hypot(player.x - area.x, player.z - area.z) < area.radius;
    if (inside) return; // the clock does not run while you are in the net

    this.searchLeft -= dt;
    if (this.searchLeft > 0) return;

    this.cops.length = 0;
    this.justEscaped = true;
    this.state = 'clear';
    this.search = null;
    this.cooldown = COP_RESPAWN;
  }

  /**
   * Can any cop actually see you?
   *
   * Distance is not enough: a cop one street over with a block between you has
   * not got you, and pretending otherwise makes cover meaningless. The check
   * is a walk along the line between the two, looking for a building in the
   * way - which is why buildings are city data rather than renderer state.
   */
  private seenBy(player: Chased): boolean {
    for (const cop of this.cops) {
      if (this.gapTo(cop, player) > SEEN_RANGE) continue;
      if (this.blocked(cop, player)) continue;
      this.lastSeen.x = player.x;
      this.lastSeen.z = player.z;
      return true;
    }
    return false;
  }

  private blocked(cop: Cop, player: Chased): boolean {
    return lineBlocked(this.grid, cop, player);
  }

  /** Bring more cops in, up to the count heat allows. */
  private recruit(dt: number, player: Chased): void {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    // Nobody joins a pursuit that has lost you. Without this a new car appears
    // 260 m away the moment the last one drops behind, and there is no speed
    // at which you can ever break contact - the escape is not hard, it is
    // absent. They may only call in more while somebody has eyes on you.
    if (this.cops.length > 0 && !this.seenNow) return;

    const wanted = this.force.maxCops;
    this.sinceSpawn += dt;
    if (this.cops.length >= wanted || this.sinceSpawn < COP_SPAWN_INTERVAL) return;

    const cop = this.spawn(player);
    if (cop) {
      this.cops.push(cop);
      this.sinceSpawn = 0;
      // It has only just arrived; it has not lost you yet.
      this.unseen = 0;
      this.lastSeen.x = player.x;
      this.lastSeen.z = player.z;
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

    // During a search they do not know where you are, so they head for where
    // they lost you rather than driving straight at a car they cannot see.
    const aim = this.state === 'cooldown' && this.search ? this.search : player;

    let best: CityRoad | null = null;
    let bestGap = Infinity;
    for (const road of options) {
      const far = road.a === node ? this.city.nodes[road.b] : this.city.nodes[road.a];
      const gap = Math.hypot(far.pos.x - aim.x, far.pos.z - aim.z);
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
      damage: 0,
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

  /**
   * Take a wrecked cop out of the pursuit (#94).
   *
   * It leaves the array entirely rather than being flagged, so nothing in here
   * has to remember to skip it. The seeing, the bust timer and the heat all
   * read `cops`, and three places that each have to check a flag are three
   * places one of them can forget to.
   */
  remove(cop: Cop): void {
    const i = this.cops.indexOf(cop);
    if (i >= 0) this.cops.splice(i, 1);
  }

  /**
   * Make them angrier. Wrecking a cruiser raises heat rather than lowering it,
   * so a takedown buys room now and costs more later.
   */
  provoke(amount: number): void {
    this.heat = Math.min(1, this.heat + amount);
  }

  /** Clear the pursuit and start the cooldown. Called after a bust is served. */
  reset(): void {
    this.cops.length = 0;
    this.heat = 0;
    this.busted = false;
    this.pinned = 0;
    this.unseen = 0;
    this.state = 'clear';
    this.search = null;
    this.cooldown = COP_BUST_COOLDOWN;
  }
}
