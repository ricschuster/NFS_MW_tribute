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
  SURFACE_REACH,
  ROADBLOCK_MIN_LEVEL,
  ROADBLOCK_MAX,
  ROADBLOCK_INTERVAL,
  ROADBLOCK_LEAD_TIME,
  ROADBLOCK_MIN_LEAD,
  ROADBLOCK_MAX_LEAD,
  ROADBLOCK_SPACING,
  ROADBLOCK_FORGET,
  ROADBLOCK_ALIGN,
  ROADBLOCK_MIN_WIDTH,
  ROADBLOCK_GAP,
  ROADBLOCK_GAP_CHANCE,
  ROADBLOCK_GAP_FALLOFF,
  ROADBLOCK_CAR_SLOT,
  ENFORCER_MIN_LEVEL,
  ENFORCER_SPAWN,
  ENFORCER_INTERVAL,
  SPIKE_MIN_LEVEL,
  SPIKE_MAX,
  SPIKE_INTERVAL,
  SPIKE_LEAD_TIME,
  SPIKE_MIN_LEAD,
  SPIKE_MAX_LEAD,
  SPIKE_SPACING,
  SPIKE_COVER,
  SPIKE_COVER_PER_LEVEL,
  type CopKind,
} from './constants';
import { lineBlocked, type CityGrid } from './city/grid';
import type { Rng } from './city/rng';
import type { City, CityRoad } from './city/types';
import { advanceAlong, directionOf, exitsFrom, placeOnRoad, type GraphCar } from './graphcar';

export interface Cop extends GraphCar {
  /** What kind of unit this is: decides its pace, and how it is drawn. */
  kind: CopKind;
  /**
   * What it is here to do (#61).
   *
   * A `chase` unit follows you and sits in the lane beside yours. An
   * `enforcer` comes in from in front and holds *your* line, which is a
   * different job rather than a harder version of the same one: it is spawned
   * ahead instead of behind, and it steers toward you rather than alongside.
   */
  role: 'chase' | 'enforcer';
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
  /**
   * Which way they are pointing. Needed since #59: a roadblock goes where you
   * are *going*, and a position on its own does not say that.
   */
  heading: number;
}

/** One parked cruiser in a roadblock, for the renderer to put a car on. */
export interface BlockCar {
  x: number;
  z: number;
  y: number;
  heading: number;
  kind: CopKind;
}

/**
 * Cruisers across the road, ahead of you (#59).
 *
 * Held as a line rather than as a set of cars, and that is not a shortcut: a
 * wall built out of circles has holes between the circles, and a barrier you
 * can slip through by accident is worse than no barrier. The cars are drawn
 * along the line; the line is what you hit.
 */
/**
 * A spike strip across part of the road (#60).
 *
 * Held the same way a roadblock is - a line across the carriageway - but the
 * span is what varies rather than the hole in it. A strip covers most of the
 * road and leaves a sliver at one edge, which makes it a line to find rather
 * than a side to pick.
 */
export interface SpikeStrip {
  road: CityRoad;
  x: number;
  z: number;
  y: number;
  /** Unit vector across the road: the strip runs along this. */
  ax: number;
  az: number;
  /** The span it covers, as offsets across the road from the centreline. */
  from: number;
  to: number;
}

export interface Roadblock {
  road: CityRoad;
  /** The middle of the barrier. */
  x: number;
  z: number;
  y: number;
  /** Unit vector across the road: the barrier runs along this. */
  ax: number;
  az: number;
  /** Half the barrier's length. */
  half: number;
  /** Where the gap is along the barrier, or null for a solid wall. */
  gap: number | null;
  cars: BlockCar[];
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
  /** Cruisers parked across the road ahead of you (#59). */
  readonly roadblocks: Roadblock[] = [];
  /** Strips laid across most of the road ahead of you (#60). */
  readonly spikes: SpikeStrip[] = [];
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
  private sinceBlock = 0;
  private sinceEnforcer = 0;
  private sinceSpike = 0;
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
      // An Enforcer aims at the line you are on rather than sitting in the
      // lane beside it. Everything else keeps right, so oncoming traffic and
      // oncoming police pass on the correct side.
      const lane = cop.role === 'enforcer' ? this.aimingLane(cop, player) : TRAFFIC_LANE;
      advanceAlong(this.city, cop, dt, (c, node) => this.toward(c, node, player), lane);
    }

    // Anything that has fallen a long way behind has lost you.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      if (this.gapTo(this.cops[i], player) > CITY_COP_LOSE) this.cops.splice(i, 1);
    }

    this.judge(dt, player);
    this.recruit(dt, player);
    this.summon(dt, player);
    this.blockade(dt, player);
    this.lay(dt, player);
  }

  /**
   * Put cruisers across the road in front of them (#59).
   *
   * Only while a pursuit is actually running: a roadblock during a cooldown
   * would be the police blocking a road they have lost you on, and it would
   * give away that they still know where you are.
   */
  private blockade(dt: number, player: Chased): void {
    // Forget the ones the chase has left behind, so they are not still sitting
    // there when the pursuit comes back round the block ten minutes later.
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const block = this.roadblocks[i];
      if (Math.hypot(block.x - player.x, block.z - player.z) > ROADBLOCK_FORGET) {
        this.roadblocks.splice(i, 1);
      }
    }
    if (this.state !== 'pursuit') {
      this.roadblocks.length = 0;
      return;
    }

    this.sinceBlock += dt;
    if (this.level < ROADBLOCK_MIN_LEVEL) return;
    if (this.roadblocks.length >= ROADBLOCK_MAX) return;
    if (this.sinceBlock < ROADBLOCK_INTERVAL) return;

    const block = this.setUp(player);
    if (!block) return;
    this.roadblocks.push(block);
    this.sinceBlock = 0;
  }

  /**
   * Lay spike strips ahead of them (#60).
   *
   * Same shape as the roadblock rules and for the same reasons: only while a
   * pursuit is actually running, on their own clock, and forgotten once the
   * chase has left them behind.
   */
  private lay(dt: number, player: Chased): void {
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const strip = this.spikes[i];
      if (Math.hypot(strip.x - player.x, strip.z - player.z) > ROADBLOCK_FORGET) {
        this.spikes.splice(i, 1);
      }
    }
    if (this.state !== 'pursuit') {
      this.spikes.length = 0;
      return;
    }

    this.sinceSpike += dt;
    if (this.level < SPIKE_MIN_LEVEL) return;
    if (this.spikes.length >= SPIKE_MAX) return;
    if (this.sinceSpike < SPIKE_INTERVAL) return;

    const spot = this.aheadOfThem(player, SPIKE_LEAD_TIME, SPIKE_MIN_LEAD, SPIKE_MAX_LEAD, 0);
    if (!spot) return;
    for (const other of this.spikes) {
      if (Math.hypot(other.x - spot.x, other.z - spot.z) < SPIKE_SPACING) return;
    }

    // The hotter it is, the less road is left clean. The strip is laid from
    // one kerb, so what is left is a sliver at the other one.
    const cover = Math.min(
      0.94,
      SPIKE_COVER + SPIKE_COVER_PER_LEVEL * (this.level - SPIKE_MIN_LEVEL),
    );
    const half = spot.road.width / 2;
    const side = this.rng.chance(0.5) ? 1 : -1;
    const from = -half * side;
    const to = from + half * 2 * cover * side;

    this.spikes.push({
      road: spot.road,
      x: spot.x,
      z: spot.z,
      y: spot.y,
      ax: spot.ax,
      az: spot.az,
      from: Math.min(from, to),
      to: Math.max(from, to),
    });
    this.sinceSpike = 0;
  }

  /** Take a strip out of play once it has been run over. */
  shred(strip: SpikeStrip): void {
    const i = this.spikes.indexOf(strip);
    if (i >= 0) this.spikes.splice(i, 1);
  }

  /** Take a roadblock out of play once somebody has been through it. */
  breach(block: Roadblock): void {
    const i = this.roadblocks.indexOf(block);
    if (i >= 0) this.roadblocks.splice(i, 1);
  }

  /**
   * A spot on a road far enough ahead to be seen, and running the way you are.
   *
   * Shared by roadblocks (#59) and spike strips (#60), because "put something
   * in front of them" is one question and two answers to it would drift apart.
   *
   * The lead is measured in *seconds at the speed you are doing* rather than
   * in metres. A fixed distance is a warning at 80 km/h and a wall out of the
   * fog at 300.
   */
  private aheadOfThem(
    player: Chased,
    leadTime: number,
    minLead: number,
    maxLead: number,
    minWidth: number,
  ): { road: CityRoad; x: number; z: number; y: number; ax: number; az: number } | null {
    const lead = Math.min(maxLead, Math.max(minLead, Math.abs(player.speed) * leadTime));
    const aimX = player.x + Math.sin(player.heading) * lead;
    const aimZ = player.z + Math.cos(player.heading) * lead;

    let best: CityRoad | null = null;
    let bestGap = Infinity;
    for (const road of this.grid.roadsNear(aimX, aimZ)) {
      if (road.width < minWidth || road.bridge) continue;
      // At your level: anything on the deck overhead is not in your way.
      if (Math.abs(this.city.nodes[road.a].y - player.y) > SURFACE_REACH) continue;

      const a = this.city.nodes[road.a].pos;
      const b = this.city.nodes[road.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(1, Math.hypot(dx, dz));
      // Running the way you are going, either direction: a road you are about
      // to cross is not a road you are about to drive down.
      const along = Math.abs(
        (dx / length) * Math.sin(player.heading) + (dz / length) * Math.cos(player.heading),
      );
      if (along < ROADBLOCK_ALIGN) continue;

      const gap = Math.hypot((a.x + b.x) / 2 - aimX, (a.z + b.z) / 2 - aimZ);
      if (gap < bestGap) {
        bestGap = gap;
        best = road;
      }
    }
    if (!best) return null;

    const a = this.city.nodes[best.a].pos;
    const b = this.city.nodes[best.b].pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.max(1, Math.hypot(dx, dz));
    const t = Math.max(0, Math.min(1, ((aimX - a.x) * dx + (aimZ - a.z) * dz) / (length * length)));
    const x = a.x + dx * t;
    const z = a.z + dz * t;

    // In front, and far enough in front to be a warning rather than a surprise.
    const ahead = (x - player.x) * Math.sin(player.heading) + (z - player.z) * Math.cos(player.heading);
    if (ahead < minLead) return null;

    return { road: best, x, z, y: this.city.nodes[best.a].y, ax: -dz / length, az: dx / length };
  }

  /** Build a barrier on a road wide enough for the gap to be a real choice. */
  private setUp(player: Chased): Roadblock | null {
    const spot = this.aheadOfThem(
      player,
      ROADBLOCK_LEAD_TIME,
      ROADBLOCK_MIN_LEAD,
      ROADBLOCK_MAX_LEAD,
      ROADBLOCK_MIN_WIDTH,
    );
    if (!spot) return null;

    for (const other of this.roadblocks) {
      if (Math.hypot(other.x - spot.x, other.z - spot.z) < ROADBLOCK_SPACING) return null;
    }

    // Higher heat means fewer ways through.
    const chance = ROADBLOCK_GAP_CHANCE - ROADBLOCK_GAP_FALLOFF * (this.level - ROADBLOCK_MIN_LEVEL);
    const half = spot.road.width / 2;
    const room = half - ROADBLOCK_GAP;
    const gap = room > 0 && this.rng.chance(chance) ? this.rng.range(-room, room) : null;

    const block: Roadblock = {
      road: spot.road,
      x: spot.x,
      z: spot.z,
      y: spot.y,
      ax: spot.ax,
      az: spot.az,
      half,
      gap,
      cars: [],
    };
    this.park(block);
    return block;
  }

  /** Fill the barrier with cruisers, leaving whatever gap it has. */
  private park(block: Roadblock): void {
    const slots = Math.max(2, Math.round((block.half * 2) / ROADBLOCK_CAR_SLOT));
    const slot = (block.half * 2) / slots;
    // Parked across the road, so the wall reads as a wall from a long way off.
    const heading = Math.atan2(block.ax, block.az);

    for (let i = 0; i < slots; i++) {
      const offset = -block.half + slot * (i + 0.5);
      if (block.gap !== null && Math.abs(offset - block.gap) < ROADBLOCK_GAP) continue;
      block.cars.push({
        x: block.x + block.ax * offset,
        z: block.z + block.az * offset,
        y: block.y,
        heading,
        kind: this.rng.pick(this.force.units),
      });
    }
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
  /** How many are here to follow you, rather than to meet you (#61). */
  private chasers(): number {
    return this.cops.reduce((n, cop) => n + (cop.role === 'chase' ? 1 : 0), 0);
  }

  private enforcers(): number {
    return this.cops.length - this.chasers();
  }

  /**
   * Send something at you from in front (#61).
   *
   * On its own budget and its own clock, so an Enforcer arriving never thins
   * out the pursuit behind you. It needs eyes on you like any other call-in:
   * the police cannot put a unit in front of a car they have lost.
   */
  private summon(dt: number, player: Chased): void {
    this.sinceEnforcer += dt;
    if (this.state !== 'pursuit') return;
    if (this.level < ENFORCER_MIN_LEVEL) return;
    if (!this.seenNow) return;
    if (this.enforcers() >= this.force.enforcers) return;
    if (this.sinceEnforcer < ENFORCER_INTERVAL) return;

    const cop = this.spawn(player, 'enforcer');
    if (!cop) return;
    this.cops.push(cop);
    this.sinceEnforcer = 0;
  }

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
    if (this.chasers() >= wanted || this.sinceSpawn < COP_SPAWN_INTERVAL) return;

    const cop = this.spawn(player, 'chase');
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

  /**
   * The lane offset that puts an Enforcer on the player's line.
   *
   * Offsets are measured across the road from its centreline, so this is the
   * player's own distance off that centreline, clamped to the carriageway. The
   * effect is that the thing coming at you tracks across the road as you move,
   * and the only way past it is to move late.
   */
  private aimingLane(cop: Cop, player: Chased): number {
    const a = this.city.nodes[cop.road.a].pos;
    const b = this.city.nodes[cop.road.b].pos;
    const from = cop.forward ? a : b;
    const to = cop.forward ? b : a;
    const centreX = from.x + (to.x - from.x) * cop.t;
    const centreZ = from.z + (to.z - from.z) * cop.t;

    const heading = directionOf(this.city, cop);
    // `placeOnRoad` offsets along (-heading.z, heading.x), so measure there.
    const offset = (player.x - centreX) * -heading.z + (player.z - centreZ) * heading.x;
    const limit = cop.road.width / 2;
    return Math.max(-limit, Math.min(limit, offset));
  }

  private gapTo(cop: Cop, player: Chased): number {
    return Math.hypot(cop.x - player.x, cop.z - player.z);
  }

  /**
   * Put a cop on a road near the player, out of sight but not out of reach.
   *
   * Where "near" is depends on what it is for. A chaser comes in anywhere
   * around you, because it only has to catch up. An Enforcer comes in on the
   * road you are driving *at*, because the whole point of it is that it is
   * already there when you arrive.
   */
  private spawn(player: Chased, role: Cop['role']): Cop | null {
    let x: number;
    let z: number;
    if (role === 'enforcer') {
      x = player.x + Math.sin(player.heading) * ENFORCER_SPAWN;
      z = player.z + Math.cos(player.heading) * ENFORCER_SPAWN;
    } else {
      const angle = this.rng.range(0, Math.PI * 2);
      x = player.x + Math.sin(angle) * CITY_COP_SPAWN;
      z = player.z + Math.cos(angle) * CITY_COP_SPAWN;
    }

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
      kind: role === 'enforcer' ? this.force.enforcerUnit : this.rng.pick(this.force.units),
      role,
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
    this.roadblocks.length = 0;
    this.spikes.length = 0;
    this.sinceEnforcer = 0;
    this.sinceSpike = 0;
    this.heat = 0;
    this.busted = false;
    this.pinned = 0;
    this.unseen = 0;
    this.state = 'clear';
    this.search = null;
    this.cooldown = COP_BUST_COOLDOWN;
  }
}
