import {
  TURN_RATE,
  LATERAL_GRIP,
  SEGMENT_LENGTH,
  STEP,
  REVERSE_SPEED_FRAC,
  ESCAPED_FLASH,
  NITRO_SPEED_MULT,
  NITRO_ACCEL_MULT,
  NITRO_DRAIN,
  NITRO_RECHARGE,
  NITRO_MIN_ENGAGE,
  NITRO_BLEED_FRAC,
  CAR_RADIUS,
  HIT_SPEED_KEPT,
  SHUNT_SPEED_KEPT,
  SIM_SEED,
  CITY_BUST_HOLD,
  RIDE_RATE,
  GRAVITY,
  SPAWN_SEARCH,
  WRECK_LINGER,
  TAKEDOWN_FLASH,
  TAKEDOWN_SPEED_KEPT,
  TAKEDOWN_HEAT,
  COP_UNITS,
  ROADBLOCK_REACH,
  ROADBLOCK_GAP,
  ROADBLOCK_SPEED_KEPT,
  ROADBLOCK_SCATTER,
  ENFORCER_SPEED_KEPT,
  ENFORCER_TOUGHNESS,
  SPIKE_REACH,
  SHRED_TIME,
  SHRED_SPEED_FRAC,
  SHRED_GRIP,
  REP_PURSUIT_PER_SECOND,
  REP_PURSUIT_TICK,
  REP_NEAR_MISS_RANGE,
  REP_NEAR_MISS_SPEED,
  REP_SAVE_INTERVAL,
} from './constants';
import { RepLedger } from './rep';
import { Collectibles } from './collectibles';
import { loadProgress, saveProgress } from './progress';
import { accelerate } from './math';
import { kestrelBay } from './city/index';
import { Rng } from './city/rng';
import { CityTraffic } from './citytraffic';
import { CityPolice } from './citypolice';
import { CityGrid, surfaceAt, roadHeightAt, carriageway, inWater } from './city/grid';
import { impactDamage, touching } from './impact';
import type { Roadblock } from './citypolice';
import type { GraphCar } from './graphcar';
import type { City, CityRoad } from './city/types';
import type { InputState } from './world';

/**
 * A car that has been put out of play, left where it stopped (#94).
 *
 * A wreck is deliberately not a `GraphCar` any more. It has stopped
 * navigating, so keeping it on the graph would mean every pursuit and traffic
 * loop had to remember to skip it; lifting it out into a plain husk means they
 * cannot forget. It is still solid, because a wreck you can drive through is a
 * strange reward for having made it.
 */
export interface Wreck {
  x: number;
  y: number;
  z: number;
  heading: number;
  colour: string;
  scale: number;
  /** True for a police car: only those count as takedowns. */
  police: boolean;
  /** Which way it came to rest, so the street is not full of level cars. */
  roll: number;
  /** Seconds since it was wrecked. Cleared away at `WRECK_LINGER`. */
  age: number;
}

/**
 * The car, driving in Kestrel Bay (#113).
 *
 * `world.ts` puts the car on a track: a distance along it and an offset across
 * it. That frame cannot describe a city, so this is the same car in the frame
 * the city actually has - a position, a heading and a height.
 *
 * The motion model is deliberately the one from #82 and not a new one. Yaw is
 * limited by grip, so corners have to be taken slower; nitrous behaves exactly
 * as it does on the track. What changes is only the frame it resolves into:
 * where the track version split velocity onto along-road and across-road axes,
 * this one splits it onto x and z. The feel work in #14 and #46 carries over
 * because the physics did not move.
 *
 * Headless, like `World`, and for the same reason (ADR-0003): the playtests
 * drive it with scripted input and assert on where it ends up.
 *
 * This runs *alongside* the track `World` rather than replacing it. The
 * deployed game keeps playing while the systems move across in #87, exactly as
 * the two renderers ran side by side during #81.
 */
export interface CityWorldOptions {
  /** Populate the city with traffic (default true). Turn off for a still world. */
  traffic?: boolean;
  /** Run the police pursuit (default true). */
  police?: boolean;
}

export class CityWorld {
  readonly city: City;
  readonly grid: CityGrid;
  readonly traffic: CityTraffic;
  readonly police: CityPolice;

  /** Where the car is, on the map and above it. */
  x = 0;
  z = 0;
  y = 0;
  /** Which way it points, in radians. 0 is +z, and it can be pointed anywhere. */
  heading = 0;
  /** Along the heading, in world units per second. */
  speed = 0;

  nitro = 1;
  boosting = false;
  /** 1 immediately after hitting something, decaying to 0. */
  crashFlash = 0;
  /** The road under the car, or null out on open ground. */
  onRoad: CityRoad | null = null;
  /** Set while the car is off a deck with nothing under it. */
  falling = false;
  /** Frozen in the BUSTED state, holding the overlay before the pursuit resets. */
  busted = false;
  /** Seconds left on the ESCAPED banner. */
  escapedFlash = 0;

  /** Cars taken out of play, still sitting in the street (#94). */
  readonly wrecks: Wreck[] = [];
  /** How many police cars this drive has wrecked. */
  takedowns = 0;
  /** Seconds left on the TAKEDOWN banner, and where the camera should look. */
  takedownFlash = 0;
  lastTakedown: { x: number; y: number; z: number } | null = null;

  /**
   * Seconds left on shredded tyres (#60).
   *
   * A spike strip does not take your speed, it takes your car: while this is
   * running the top speed is capped hard and most of the steering is gone. It
   * is on the HUD as a clock because it has to be something you drive out of
   * rather than something that has already happened to you.
   */
  shredded = 0;

  /** Rep, the single progression currency (#64). */
  readonly rep = new RepLedger();
  /** Billboards and speed cameras: what is left to find (#93). */
  readonly collectibles: Collectibles;

  /**
   * Top speed. The old cap was `SEGMENT_LENGTH / STEP`, which existed only to
   * stop the car crossing two segments in a step; there are no segments now, so
   * the number is kept purely because the HUD and every feel measurement are
   * calibrated to it.
   */
  readonly maxSpeed = SEGMENT_LENGTH / STEP;

  private readonly accel = this.maxSpeed / 5;
  private readonly braking = -this.maxSpeed;
  private readonly decel = -this.maxSpeed / 5;
  private readonly offRoadDecel = -this.maxSpeed / 2;
  private readonly offRoadLimit = this.maxSpeed / 4;
  private readonly maxReverse = -this.maxSpeed * REVERSE_SPEED_FRAC;
  private fallSpeed = 0;

  /** Everything that moves draws from here, so a scripted drive repeats exactly. */
  private readonly rng = new Rng(SIM_SEED);
  /** Traffic already scored for a near miss: each car is worth one (#64). */
  private readonly grazed = new WeakSet<GraphCar>();
  private pursuitRep = 0;
  /** The hottest this pursuit got, which is what getting away is worth. */
  private peakLevel = 1;
  private sinceSave = 0;
  private savedAt = 0;
  private readonly withTraffic: boolean;
  private readonly withPolice: boolean;
  private bustHold = 0;

  constructor(city: City = kestrelBay(), options: CityWorldOptions = {}) {
    this.city = city;
    this.grid = new CityGrid(city);
    this.traffic = new CityTraffic(city, this.grid, this.rng);
    this.police = new CityPolice(city, this.grid, this.rng);
    this.withTraffic = options.traffic ?? true;
    this.withPolice = options.police ?? true;
    this.collectibles = new Collectibles(city);
    // Carried over from whatever this player has already earned, the same way
    // the track sim loads its rival count. Safe where there is no storage.
    const saved = loadProgress();
    this.rep.total = saved.rep;
    this.collectibles.load(saved.smashed, saved.clocked);
    this.spawn();
  }

  /** Put the car on a surface street near the middle of the city, pointing along it. */
  spawn(): void {
    const middle = {
      x: (this.city.bounds.minX + this.city.bounds.maxX) / 2,
      z: (this.city.bounds.minZ + this.city.bounds.maxZ) / 2,
    };

    let best: CityRoad | null = null;
    let bestGap = Infinity;
    for (const road of this.city.roads) {
      // A street, at street level, long enough to be somewhere rather than a stub.
      if (road.class !== 'street' && road.class !== 'arterial') continue;
      if (this.city.nodes[road.a].y !== 0 || road.length < SPAWN_SEARCH) continue;
      // Measured from the road's middle, not from one of its ends. A long
      // arterial can pass through the centre of the city while both its ends
      // are out at the coast, which is how the car came to start beside the
      // bay with a couple of hundred metres of road in front of it.
      const a = this.city.nodes[road.a].pos;
      const b = this.city.nodes[road.b].pos;
      const gap = Math.hypot((a.x + b.x) / 2 - middle.x, (a.z + b.z) / 2 - middle.z);
      if (gap < bestGap) {
        bestGap = gap;
        best = road;
      }
    }
    if (!best) return;

    const a = this.city.nodes[best.a].pos;
    const b = this.city.nodes[best.b].pos;
    this.x = (a.x + b.x) / 2;
    this.z = (a.z + b.z) / 2;
    this.y = 0;
    this.heading = Math.atan2(b.x - a.x, b.z - a.z);
    this.speed = 0;
    this.onRoad = best;
  }

  /** Advance the simulation by `dt` seconds under the held `input`. */
  step(dt: number, input: InputState): void {
    this.crashFlash = Math.max(0, this.crashFlash - dt * 2);
    this.escapedFlash = Math.max(0, this.escapedFlash - dt);
    this.takedownFlash = Math.max(0, this.takedownFlash - dt);
    this.shredded = Math.max(0, this.shredded - dt);
    this.rep.step(dt);
    this.clearWrecks(dt);

    // BUSTED freezes the world, holds the overlay, then clears the pursuit.
    if (this.busted) {
      this.bustHold -= dt;
      this.speed = 0;
      if (this.bustHold <= 0) {
        this.busted = false;
        this.police.reset();
      }
      return;
    }

    // Yaw is limited by grip rather than by the wheel: turning at rate w while
    // travelling at v costs v*w of lateral acceleration, so the faster the car
    // goes the wider it turns. Unchanged from the track model on purpose.
    const authority =
      Math.min(TURN_RATE, LATERAL_GRIP / Math.max(this.maxSpeed * 0.05, Math.abs(this.speed))) *
      (this.shredded > 0 ? SHRED_GRIP : 1);

    const charged = this.boosting ? this.nitro > 0 : this.nitro >= NITRO_MIN_ENGAGE;
    const boosting = input.nitro && charged && this.speed > this.maxSpeed * 0.15;
    this.boosting = boosting;
    this.nitro = boosting
      ? Math.max(0, this.nitro - dt * NITRO_DRAIN)
      : Math.min(1, this.nitro + dt * NITRO_RECHARGE);
    const throttle = boosting ? this.accel * NITRO_ACCEL_MULT : this.accel;

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // Subtracted, not added. Heading rotates the car's forward from +z toward
    // +x, but a driver facing +z has their right hand pointing at -x - the
    // right-handed cross product of forward and up. Adding here steers the car
    // the opposite way from the one the wheel is turned, which is exactly how
    // it felt: A went right and D went left.
    this.heading -= steer * authority * dt * Math.sign(this.speed || 1);
    // No limit on heading any more. On a track the car could only ever be
    // pointed roughly along it; here it can be turned round, which is the
    // whole point of free roam.

    if (input.up) {
      this.speed = accelerate(this.speed, throttle, dt);
    } else if (input.down) {
      this.speed = accelerate(this.speed, this.braking, dt);
    } else if (this.speed > 0) {
      this.speed = Math.max(0, accelerate(this.speed, this.decel, dt));
    } else if (this.speed < 0) {
      this.speed = Math.min(0, accelerate(this.speed, -this.decel, dt));
    }

    // Shredded tyres cap the top speed under everything, nitrous included:
    // lighting the boost on four ruined tyres does not make them work.
    const topSpeed = Math.min(
      boosting ? this.maxSpeed * NITRO_SPEED_MULT : this.maxSpeed,
      this.shredded > 0 ? this.maxSpeed * SHRED_SPEED_FRAC : Infinity,
    );
    if (this.speed > topSpeed) {
      this.speed = Math.max(topSpeed, this.speed - this.maxSpeed * NITRO_BLEED_FRAC * dt);
    } else if (this.speed < this.maxReverse) {
      this.speed = this.maxReverse;
    }

    this.move(dt);
    this.settle(dt);
    if (this.withTraffic) this.traffic.update(dt, this);
    if (this.withPolice) {
      this.police.update(dt, this, this.maxSpeed);
      if (this.police.busted) {
        this.busted = true;
        this.bustHold = CITY_BUST_HOLD;
        this.speed = 0;
      }
      if (this.police.justEscaped) {
        this.escapedFlash = ESCAPED_FLASH;
        // Paid at the level the pursuit reached, so shaking a heat-six chase
        // is worth what it cost to survive one.
        this.rep.award('escape', this.peakLevel);
        this.peakLevel = 1;
      }
    }
    // After both have moved, so a contact is judged where the cars actually
    // are this step rather than where they were before one of them drove off.
    this.contacts();
    this.earn(dt);
    this.persist(dt);
  }

  /**
   * What the last step was worth (#64).
   *
   * The two awards that are not events: threading traffic, and simply still
   * being at large. Everything else is paid where it happens, because a
   * takedown knows it is a takedown and this does not.
   */
  private earn(dt: number): void {
    this.nearMisses();
    this.collectibles.update(
      dt,
      this,
      Math.abs(this.speed) / this.maxSpeed,
      this.rep,
      this.level,
    );

    if (this.police.state !== 'pursuit') {
      this.pursuitRep = 0;
      return;
    }
    // What the escape is worth is what the pursuit *got to*, not what is left
    // of the heat by the time the search gives up - which is nearly nothing,
    // because a cooldown is heat decaying for half a minute.
    this.peakLevel = Math.max(this.peakLevel, this.police.level);

    // Surviving a pursuit pays by the second, but it is *shown* every few
    // seconds. A popup per frame is not feedback, it is a wall.
    this.pursuitRep += dt;
    if (this.pursuitRep < REP_PURSUIT_TICK) return;
    this.rep.award('pursuit', this.level, REP_PURSUIT_PER_SECOND * this.pursuitRep);
    this.pursuitRep = 0;
  }

  /**
   * Passing close to a car at speed, once per car.
   *
   * Once is the whole difficulty here. Without the record of who has already
   * been passed, sitting alongside a car in traffic pays out every frame, and
   * the highest-scoring thing in the game is not moving.
   */
  private nearMisses(): void {
    if (Math.abs(this.speed) < this.maxSpeed * REP_NEAR_MISS_SPEED) return;

    for (const car of this.traffic.cars) {
      if (this.grazed.has(car)) continue;
      if (Math.abs(car.y - this.y) > CAR_RADIUS * 2) continue;
      const gap = Math.hypot(car.x - this.x, car.z - this.z);
      // Close, but not *touching*: hitting somebody is not a near miss, and
      // paying for both would make the collision the better outcome.
      if (gap > REP_NEAR_MISS_RANGE || gap < CAR_RADIUS * 2.2) continue;
      this.grazed.add(car);
      this.rep.award('nearMiss', this.level);
    }
  }

  /** The heat level everything is scored at: 1 when nothing is chasing you. */
  private get level(): number {
    return this.police.state === 'pursuit' ? this.police.level : 1;
  }

  /** Write the total out now and then, rather than on every award. */
  private persist(dt: number): void {
    this.sinceSave += dt;
    if (this.sinceSave < REP_SAVE_INTERVAL) return;
    this.sinceSave = 0;
    if (this.rep.total === this.savedAt) return;
    this.savedAt = this.rep.total;
    saveProgress({
      ...loadProgress(),
      rep: this.rep.total,
      smashed: [...this.collectibles.smashed],
      clocked: [...this.collectibles.clocked],
    });
  }

  /**
   * Hitting other cars: a shunt, damage, and sometimes a takedown (#94).
   *
   * One loop over everything solid rather than one per kind, because a hit is
   * a hit: the only differences are how tough the thing is, whether wrecking
   * it counts for anything, and what has to be told about it afterwards.
   *
   * A car is still shoved down its own road rather than sideways off it -
   * traffic lives on the graph, and a car knocked off the graph has nowhere to
   * be. What is new is that the shove is now recorded, so a car shoved hard
   * enough stops being a car and becomes a wreck.
   */
  private contacts(): void {
    this.spikes();
    if (this.roadblock()) return;

    // Wrecks first: they are already dead, so they only cost you speed. A
    // wreck you can drive through is a strange reward for having made it.
    for (const wreck of this.wrecks) {
      if (!touching(this, wreck)) continue;
      this.speed *= SHUNT_SPEED_KEPT;
      this.crashFlash = 1;
      return;
    }

    for (const car of this.traffic.cars) {
      if (!touching(this, car)) continue;
      const hurt = impactDamage(this, car, this.maxSpeed, this.grid);
      this.hit(car, hurt, SHUNT_SPEED_KEPT);
      if (car.damage >= 1) {
        this.traffic.remove(car);
        this.wreck(car, car.colour, 1, false);
      }
      return;
    }

    for (const cop of this.police.cops) {
      if (!touching(this, cop)) continue;
      const unit = COP_UNITS[cop.kind];
      // An Enforcer is here to end the pursuit in one hit, so it hits far
      // harder than a cruiser and takes far more to put out. Taking one down
      // is meant to be a thing you did on purpose, not a thing you drove into.
      const enforcer = cop.role === 'enforcer';
      const toughness = enforcer ? unit.scale * ENFORCER_TOUGHNESS : unit.scale;
      const hurt = impactDamage(this, cop, this.maxSpeed, this.grid, toughness);
      this.hit(cop, hurt, enforcer ? ENFORCER_SPEED_KEPT : SHUNT_SPEED_KEPT);
      if (cop.damage >= 1) {
        this.police.remove(cop);
        this.wreck(cop, unit.colour, unit.scale, true);
      }
      return;
    }
  }

  /**
   * Going through a roadblock (#59).
   *
   * The barrier is a line with a hole in it rather than a row of circles,
   * because a wall built from circles has gaps between the circles and a
   * barrier you can slip through by accident is worse than no barrier.
   *
   * Hitting one is heavy but it is not a dead stop: you come out the far side
   * doing very little, which is the worst place to be with cops behind you.
   * Threading the gap is what the gap is for.
   */
  private roadblock(): boolean {
    for (const block of this.police.roadblocks) {
      if (Math.abs(block.y - this.y) > CAR_RADIUS * 2) continue;

      const dx = this.x - block.x;
      const dz = this.z - block.z;
      // Along the barrier, and through it.
      const along = dx * block.ax + dz * block.az;
      const through = dx * block.az - dz * block.ax;
      if (Math.abs(through) > ROADBLOCK_REACH || Math.abs(along) > block.half) continue;
      if (block.gap !== null && Math.abs(along - block.gap) < ROADBLOCK_GAP - CAR_RADIUS) continue;

      this.speed *= ROADBLOCK_SPEED_KEPT;
      this.crashFlash = 1;
      this.scatter(block, along);
      this.police.breach(block);
      this.rep.award('roadblock', this.level);
      return true;
    }
    return false;
  }

  /**
   * Running over a spike strip (#60).
   *
   * Deliberately not a collision. Nothing about the car's motion changes on
   * the step it happens, which is what makes it read as tyres rather than as
   * a wall: what changes is the next several seconds of driving.
   */
  private spikes(): void {
    for (const strip of this.police.spikes) {
      if (Math.abs(strip.y - this.y) > CAR_RADIUS * 2) continue;

      const dx = this.x - strip.x;
      const dz = this.z - strip.z;
      const along = dx * strip.ax + dz * strip.az;
      const through = dx * strip.az - dz * strip.ax;
      // Swept by how far the car travels in a step, not just by how deep the
      // strip is drawn. At top speed the car covers more ground in one step
      // than the strip is wide, and a hazard you can step over is not one.
      if (Math.abs(through) > SPIKE_REACH + Math.abs(this.speed) * STEP) continue;
      if (along < strip.from - CAR_RADIUS || along > strip.to + CAR_RADIUS) continue;

      this.shredded = SHRED_TIME;
      this.police.shred(strip);
      return;
    }
  }

  /**
   * Throw the barrier apart where it was hit.
   *
   * The cars become wrecks like any other, but shoved aside rather than left
   * where they were parked: the player is standing in that spot, and a wreck
   * dropped on top of them would be hit again on the very next step.
   *
   * They pay no takedown. Going through a parked car is not taking anyone
   * down, and what it should actually be worth is Rep, which is #64.
   */
  private scatter(block: Roadblock, at: number): void {
    for (const car of block.cars) {
      const offset = (car.x - block.x) * block.ax + (car.z - block.z) * block.az;
      const away = Math.sign(offset - at) || 1;
      this.wrecks.push({
        x: car.x + block.ax * away * ROADBLOCK_SCATTER,
        y: car.y,
        z: car.z + block.az * away * ROADBLOCK_SCATTER,
        heading: car.heading,
        colour: COP_UNITS[car.kind].colour,
        scale: COP_UNITS[car.kind].scale,
        police: true,
        roll: this.rng.range(-0.7, 0.7),
        age: 0,
      });
    }
  }

  /** Bleed both cars, shove theirs along its road, and record the damage. */
  private hit(car: GraphCar, damage: number, speedKept: number): void {
    this.speed *= speedKept;
    this.crashFlash = 1;
    car.damage = Math.min(1, car.damage + damage);
    car.speed *= 0.4;
    car.t = Math.min(1, car.t + (CAR_RADIUS * 2) / Math.max(1, car.road.length));
  }

  /**
   * Take a car out of play and leave the husk in the street.
   *
   * Only the police count as takedowns, and only they get the cut. Wrecking
   * traffic is something that happens to you at 300 km/h rather than something
   * you did, and a slow-motion camera every time you plough into a hatchback
   * would make the road impossible to read.
   */
  private wreck(car: GraphCar, colour: string, scale: number, police: boolean): void {
    this.wrecks.push({
      x: car.x,
      y: car.y,
      z: car.z,
      heading: car.heading,
      colour,
      scale,
      police,
      roll: this.rng.range(-0.5, 0.5),
      age: 0,
    });

    if (!police) {
      this.rep.award('wreck', this.level);
      return;
    }
    this.takedowns++;
    this.rep.award('takedown', this.level);
    this.takedownFlash = TAKEDOWN_FLASH;
    this.lastTakedown = { x: car.x, y: car.y, z: car.z };
    // A takedown is not free: it costs speed, and it makes them angrier. The
    // alternative is a pursuit you clear by driving through it.
    this.speed *= TAKEDOWN_SPEED_KEPT;
    this.police.provoke(TAKEDOWN_HEAT);
  }

  /** Wrecks are towed away eventually, or the city fills up with them. */
  private clearWrecks(dt: number): void {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      this.wrecks[i].age += dt;
      if (this.wrecks[i].age > WRECK_LINGER) this.wrecks.splice(i, 1);
    }
  }

  /** Travel along the heading, then answer for whatever that ran into. */
  private move(dt: number): void {
    const wasX = this.x;
    const wasZ = this.z;

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

    if (this.hitsBuilding()) {
      // Back out of it rather than resolving the overlap: a car that has stopped
      // against a wall must not be pushed through it by the next step.
      this.x = wasX;
      this.z = wasZ;
      this.speed *= -HIT_SPEED_KEPT;
      this.crashFlash = 1;
      return;
    }

    if (this.outOfBounds() || this.afloat()) {
      this.x = wasX;
      this.z = wasZ;
      this.speed = 0;
    }
  }

  /**
   * Over water with nothing under the wheels.
   *
   * A bridge or a viaduct counts as something under the wheels, which is the
   * whole reason the surface lookup takes a height: the deck crossing the river
   * is drivable and the river beside it is not.
   */
  private afloat(): boolean {
    if (!inWater(this.city, this.x, this.z)) return false;
    return surfaceAt(this.city, this.grid, this.x, this.z, this.y).road === null;
  }

  /**
   * Follow the surface: ride the road you are on, drop off the edge of one you
   * are not, and bleed speed over open ground.
   */
  private settle(dt: number): void {
    const surface = surfaceAt(this.city, this.grid, this.x, this.z, this.y);
    this.onRoad = surface.road;

    // Off the side of a deck with nothing under it at this height: fall.
    const supported = surface.road !== null || this.y <= 0;
    if (!supported) {
      this.falling = true;
      this.fallSpeed += GRAVITY * dt;
      this.y = Math.max(0, this.y - this.fallSpeed * dt);
      if (this.y === 0) {
        this.falling = false;
        this.fallSpeed = 0;
        this.speed *= HIT_SPEED_KEPT;
        this.crashFlash = 1;
      }
      return;
    }

    this.falling = false;
    this.fallSpeed = 0;
    // Ease onto the deck height rather than snapping, so a ramp is a climb.
    this.y += (surface.y - this.y) * Math.min(1, RIDE_RATE * dt);

    // Open ground is drivable but slow, which is what makes cutting a corner
    // across a block a decision instead of a free shortcut.
    if (!surface.road && this.speed > this.offRoadLimit) {
      this.speed = accelerate(this.speed, this.offRoadDecel, dt);
    }
  }

  /** Does the car overlap a building footprint? Buildings are solid. */
  private hitsBuilding(): boolean {
    // Only what is on the ground can be hit: the interstate flies over the
    // rooftops, and a deck at 12 m does not collide with a block at street level.
    if (this.y > CAR_RADIUS * 2) return false;

    for (const building of this.grid.buildingsNear(this.x, this.z)) {
      const f = building.footprint;
      const nearestX = Math.max(f.minX, Math.min(this.x, f.maxX));
      const nearestZ = Math.max(f.minZ, Math.min(this.z, f.maxZ));
      if (Math.hypot(this.x - nearestX, this.z - nearestZ) < CAR_RADIUS) return true;
    }
    return false;
  }

  /** The map ends at the coast, and the sea is not drivable. */
  private outOfBounds(): boolean {
    const b = this.city.bounds;
    return this.x < b.minX || this.x > b.maxX || this.z < b.minZ || this.z > b.maxZ;
  }

  /** How high the road under the car is, for the renderer to sit the car on. */
  groundHeight(): number {
    const surface = surfaceAt(this.city, this.grid, this.x, this.z, this.y);
    return surface.y;
  }
}

export { carriageway, roadHeightAt };
