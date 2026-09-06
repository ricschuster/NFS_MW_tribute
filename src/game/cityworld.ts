import {
  TURN_RATE,
  LATERAL_GRIP,
  STEP,
  REVERSE_SPEED_FRAC,
  ESCAPED_FLASH,
  NITRO_SPEED_MULT,
  NITRO_ACCEL_MULT,
  NITRO_DRAIN,
  NITRO_RECHARGE,
  NITRO_MIN_ENGAGE,
  NITRO_BLEED_FRAC,
  NITRO_TAPER,
  CAR_RADIUS,
  HIT_SPEED_KEPT,
  SHUNT_SPEED_KEPT,
  SIM_SEED,
  CITY_BUST_HOLD,
  RIDE_RATE,
  GRAVITY,
  SPAWN_SEARCH,
  CITY_EDGE_MARGIN,
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
  SHRED_REINFLATE,
  SHRED_SPEED_FRAC,
  SHRED_GRIP,
  REP_PURSUIT_PER_SECOND,
  REP_PURSUIT_TICK,
  REP_NEAR_MISS_RANGE,
  REP_NEAR_MISS_SPEED,
  REP_SAVE_INTERVAL,
  REFERENCE_TOP_SPEED,
  ROUTE_START_RANGE,
  REP_RACE_WIN,
  REP_RACE_WIN_PER_DIFFICULTY,
  AMBUSH_RANGE,
  AMBUSH_CARS,
  AMBUSH_RING,
  DAMAGE_PER_WALL,
  DAMAGE_SHARE,
  DAMAGE_ROADBLOCK,
  DAMAGE_FALL,
  DAMAGE_SPEED_LOSS,
  DAMAGE_GRIP_LOSS,
  DAMAGE_FREE,
  REPAIR_RANGE,
  REPAIR_FLASH,
  CLAIM_HEAT,
  BREAKER_RANGE,
  BREAKER_MIN_SPEED,
  BREAKER_SPEED_KEPT,
  BREAKER_DAMAGE,
  BREAKER_BLAST,
  BREAKER_BLAST_DAMAGE,
  BREAKER_HEAT,
  BREAKER_DEBRIS,
} from './constants';
import { RepLedger } from './rep';
import { Collectibles } from './collectibles';
import { Garage } from './garage';
import { STARTER_CAR, type CarProfile } from './cars';
import { CityRace } from './cityrace';
import { CityAmbush } from './cityambush';
import { CityClaim } from './cityclaim';
import { Radio } from './radio';
import { RIVALS, nextRival, unlocked, type Rival } from './rivals';
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
import type { City, CityRoad, CityRoute } from './city/types';

/**
 * A snapshot of which controls are held this step.
 *
 * It lives with the sim rather than with anything that reads a keyboard,
 * because the sim is the only thing that has an opinion about what a control
 * means. A key, a thumb on the touch layer and a scripted playtest all arrive
 * here as the same six booleans (#89).
 */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Enter / Space: start an event, or dismiss a result. */
  confirm: boolean;
  /** Shift: nitrous boost. */
  nitro: boolean;
}

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
 * The car has a position, a heading and a height, which is the frame a city
 * actually has. The sim that came before it put the car on a single track - a
 * distance along it and an offset across it - and that frame could not
 * describe a place with more than one road in it. It is gone (#165); this is
 * the whole game.
 *
 * The motion model is deliberately the one from #82 and not a new one. Yaw is
 * limited by grip, so corners have to be taken slower. What changed when the
 * city arrived was only the frame it resolves into: where the older version
 * split velocity onto along-road and across-road axes, this one splits it onto
 * x and z. The feel work in #14 and #46 carries over because the physics did
 * not move.
 *
 * Headless, and deliberately so (ADR-0003): the playtests drive it with
 * scripted input and assert on where it ends up, with no renderer in the room.
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
  /** Things that have been brought down, by id, so they stay down (#57). */
  readonly broken = new Set<number>();
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
  /** The car being driven. Handling comes from its profile (#67). */
  car: CarProfile = STARTER_CAR;

  /**
   * How beaten up the car is, 0..1 (#95).
   *
   * It never ends the game: being unable to drive is a bust with extra steps.
   * What it does is take the top speed and the grip with it, so a long pursuit
   * gets harder as it goes rather than being the same pursuit for as long as
   * you can stand it.
   */
  damage = 0;
  /** Seconds left on the REPAIRED banner. */
  repairFlash = 0;
  /** Billboards and speed cameras: what is left to find (#93). */
  readonly collectibles: Collectibles;
  /** The cars parked around the city, and the one being driven (#67). */
  readonly finds: Garage;
  /** The circuit being raced, if any (#70). */
  readonly race = new CityRace();
  /** The ambush being escaped, if any (#92). */
  readonly ambush = new CityAmbush();
  /** The rival being run down for their car, if any (#66). */
  readonly claim: CityClaim;
  /** What the police are saying to each other about you (#76). */
  readonly radio = new Radio();
  /**
   * Somewhere the player has asked to be pointed at (#90).
   *
   * A marker and not a teleport. Quick travel that moves the car would make
   * the pursuit a formality and the city a menu of places rather than a place;
   * an arrow and a distance is what a five-by-four-kilometre map needs.
   */
  marker: { x: number; z: number; label: string } | null = null;
  /** How many ladder rivals have been beaten. Saved, so it survives a reload. */
  beaten = 0;

  /**
   * Top speed, and everything derived from it.
   *
   * Not `readonly` any more (#67): the car can change, and when it does all of
   * these move together. The reference is `REFERENCE_TOP_SPEED`, the number
   * the feel work and the HUD were calibrated against - a profile is a
   * multiplier on it rather than a figure of its own, which is what keeps the
   * police (who run at fractions of *your* top speed) and the lap baseline
   * honest across a change of car.
   */
  maxSpeed = REFERENCE_TOP_SPEED;

  private accel = this.maxSpeed / 5;
  private braking = -this.maxSpeed;
  private decel = -this.maxSpeed / 5;
  private offRoadDecel = -this.maxSpeed / 2;
  private offRoadLimit = this.maxSpeed / 4;
  private maxReverse = -this.maxSpeed * REVERSE_SPEED_FRAC;
  private grip = LATERAL_GRIP;
  private nitroSpeed = NITRO_SPEED_MULT;
  private nitroAccel = NITRO_ACCEL_MULT;
  /** Tyres that come back up: a spike strip is a moment, not the pursuit (#68). */
  private reinflating = false;
  private fallSpeed = 0;

  /** Everything that moves draws from here, so a scripted drive repeats exactly. */
  private readonly rng = new Rng(SIM_SEED);
  /** Traffic already scored for a near miss: each car is worth one (#64). */
  private readonly grazed = new WeakSet<GraphCar>();
  private pursuitRep = 0;
  private prevConfirm = false;
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
    this.finds = new Garage(city);
    this.claim = new CityClaim(city, this.grid);
    // Carried over from whatever this player has already earned. Safe where
    // there is no storage.
    const saved = loadProgress();
    this.rep.total = saved.rep;
    this.collectibles.load(saved.smashed, saved.clocked);
    this.finds.load(saved.cars, saved.car);
    this.finds.loadParts(saved.parts, saved.fitted);
    this.beaten = saved.beaten;
    this.drive(this.finds.car);
    this.spawn();
  }

  /**
   * Get into a different car (#67).
   *
   * Everything the physics reads is recomputed here rather than looked up per
   * step, so the profile is applied once instead of multiplied into eight
   * expressions in the hot loop - and so there is one place to be wrong.
   */
  drive(profile: CarProfile): void {
    this.car = profile;
    // Parts multiply the profile rather than replacing anything in it (#68),
    // so a tuned Kestrel is still recognisably a Kestrel and the roster stays
    // the thing that decides what a car is.
    const mods = this.finds.effect(profile.id);
    this.maxSpeed = REFERENCE_TOP_SPEED * profile.topSpeed * mods.topSpeed;
    // Acceleration is written against the reference top speed, not this car's:
    // otherwise a faster car would also be quicker to it for free, twice over.
    this.accel = (REFERENCE_TOP_SPEED / 5) * profile.accel * mods.accel;
    this.braking = -this.maxSpeed;
    this.decel = -this.maxSpeed / 5;
    this.offRoadDecel = -this.maxSpeed / 2;
    this.offRoadLimit = this.maxSpeed / 4;
    this.maxReverse = -this.maxSpeed * REVERSE_SPEED_FRAC;
    this.grip = LATERAL_GRIP * profile.grip * mods.grip;
    // Only the *excess* is scaled. `NITRO_SPEED_MULT` has to stay under 2 or
    // the car crosses more ground in a step than anything can react to.
    this.nitroSpeed = 1 + (NITRO_SPEED_MULT - 1) * profile.nitro * mods.nitro;
    this.nitroAccel = 1 + (NITRO_ACCEL_MULT - 1) * profile.nitro * mods.nitro;
    this.reinflating = mods.reinflating;
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

  /** The rival you would face next, or null once the ladder is cleared (#91). */
  get currentRival(): Rival | null {
    return nextRival(this.beaten);
  }

  /** Will they take the call? The ladder is gated on Rep, not on wins. */
  get challengeReady(): boolean {
    return unlocked(this.currentRival, this.rep.total);
  }

  /** How much more Rep the next challenge wants. Zero once it is unlocked. */
  get repToNext(): number {
    const rival = this.currentRival;
    return rival ? Math.max(0, rival.rep - this.rep.total) : 0;
  }

  /** The ambush the car is parked on, if any (#92). */
  get atAmbush() {
    for (const spot of this.city.ambushes) {
      if (Math.hypot(spot.at.x - this.x, spot.at.z - this.z) < AMBUSH_RANGE) return spot;
    }
    return null;
  }

  /** The circuit whose start line the car is sitting on, if any (#70). */
  get atStartLine() {
    for (const route of this.city.routes) {
      if (Math.hypot(route.start.x - this.x, route.start.z - this.z) < ROUTE_START_RANGE) {
        return route;
      }
    }
    return null;
  }

  /** Advance the simulation by `dt` seconds under the held `input`. */
  step(dt: number, input: InputState): void {
    const confirmPressed = input.confirm && !this.prevConfirm;
    this.prevConfirm = input.confirm;
    this.crashFlash = Math.max(0, this.crashFlash - dt * 2);
    this.escapedFlash = Math.max(0, this.escapedFlash - dt);
    this.takedownFlash = Math.max(0, this.takedownFlash - dt);
    this.shredded = Math.max(0, this.shredded - dt);
    this.repairFlash = Math.max(0, this.repairFlash - dt);
    this.rep.step(dt);
    // Before the BUSTED early return, because being busted is one of the two
    // ways an ambush ends and the frozen world still has to notice it.
    this.ambush.update(dt, this.police.state === 'clear', this.busted);
    if (this.ambush.justEnded) this.settleAmbush();
    // Watched rather than told (#76): every system that could raise a callout
    // already says what it is doing, and asking them here is one place that
    // can be wrong instead of eight places that can forget to speak.
    this.radio.update(dt, {
      level: this.police.level,
      cops: this.police.cops.length,
      roadblocks: this.police.roadblocks.length,
      spikes: this.police.spikes.length,
      enforcers: this.police.cops.reduce((n, c) => n + (c.role === 'enforcer' ? 1 : 0), 0),
      helicopter: this.police.helicopter !== null,
      state: this.police.state,
      busted: this.busted,
      takedowns: this.takedowns,
      broken: this.broken.size,
    });
    this.clearWrecks(dt);

    // Lining up: the car is held on the grid while the lights run down.
    if (this.race.state === 'countdown') {
      this.speed = 0;
      this.race.update(dt, this, this.maxSpeed);
      return;
    }

    const rival = this.currentRival;
    if (confirmPressed && this.race.state === 'idle' && this.ambush.state === 'idle') {
      const route = this.atStartLine;
      const spot = this.atAmbush;
      if (route && rival && this.challengeReady) this.startRace(route, rival);
      // An ambush asks nothing of the ladder. It is the pursuit, and the
      // pursuit is available to anyone who can drive.
      else if (spot) this.startAmbush(spot.level);
    }

    // BUSTED freezes the world, holds the overlay, then clears the pursuit.
    if (this.busted) {
      this.bustHold -= dt;
      this.speed = 0;
      if (this.bustHold <= 0) {
        this.busted = false;
        this.police.reset();
      }
      // Whatever you were racing or running down, you are not now.
      this.race.abandon();
      this.claim.abandon();
      return;
    }

    // Yaw is limited by grip rather than by the wheel: turning at rate w while
    // travelling at v costs v*w of lateral acceleration, so the faster the car
    // goes the wider it turns.
    const authority =
      Math.min(
        TURN_RATE,
        (this.grip * (1 - this.hurt * DAMAGE_GRIP_LOSS)) /
          Math.max(this.maxSpeed * 0.05, Math.abs(this.speed)),
      ) * (this.shredded > 0 ? SHRED_GRIP : 1);

    const charged = this.boosting ? this.nitro > 0 : this.nitro >= NITRO_MIN_ENGAGE;
    const boosting = input.nitro && charged && this.speed > this.maxSpeed * 0.15;
    this.boosting = boosting;
    this.nitro = boosting
      ? Math.max(0, this.nitro - dt * NITRO_DRAIN)
      : Math.min(1, this.nitro + dt * NITRO_RECHARGE);
    // The boost fades as the car approaches its top speed (#105): what it buys
    // is the way out of a corner, not another two per cent at the top end.
    const pace = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
    const throttle = boosting
      ? this.accel * (1 + (this.nitroAccel - 1) * (1 - pace * NITRO_TAPER))
      : this.accel;

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
      (boosting ? this.maxSpeed * this.nitroSpeed : this.maxSpeed) *
        (1 - this.hurt * DAMAGE_SPEED_LOSS),
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
    // No pursuit during a sanctioned event: a race you have to win while
    // being rammed by a heat-six Enforcer is not a race, it is a pursuit with
    // a lap counter on it.
    if (this.withPolice && this.race.state === 'idle') {
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
    this.race.update(dt, this, this.maxSpeed);
    if (this.race.justFinished) this.settleRace();
    this.claim.update(dt, this, this.maxSpeed);
    if (this.claim.justEnded) this.settleClaim();
    this.earn(dt);
    this.persist(dt);
  }

  /** Spring the trap: stopped, surrounded, and already at heat (#92). */
  private startAmbush(level: number): void {
    this.speed = 0;
    this.escapedFlash = 0;
    this.police.ambush(this, level, AMBUSH_CARS, AMBUSH_RING);
    this.ambush.begin(level);
  }

  /** Pay for an ambush that has ended, one way or the other. */
  private settleAmbush(): void {
    if (this.ambush.state !== 'escaped') return;
    this.rep.award('ambush', this.ambush.level);
    this.savedAt = -1;
  }

  /** Line up for a circuit. No pursuit during a sanctioned event. */
  private startRace(route: CityRoute, rival: Rival): void {
    this.race.begin(route, rival);
    this.speed = 0;
    this.x = route.start.x;
    this.z = route.start.z;
    this.police.reset();
    this.escapedFlash = 0;
  }

  /**
   * Pay for the race that just ended, and move the ladder if it was won.
   *
   * `beaten` is saved rather than derived, because the ladder is progress and
   * a reload must not put a rival back at the bottom of it.
   */
  private settleRace(): void {
    const rival = this.race.challenger;
    // A part for a good result, in the car that got it (#68). Second counts:
    // the point is to reward driving the car, not only winning in it.
    if (this.race.won || this.race.position <= 2) this.finds.earn(this.car.id);
    if (this.race.won) {
      const bonus = rival ? Math.round(REP_RACE_WIN_PER_DIFFICULTY * rival.difficulty) : 0;
      this.rep.award('raceWin', 1, (REP_RACE_WIN + bonus) / REP_RACE_WIN);
      // Winning the race is the first half (#66). They run, and the ladder
      // does not move until the car is actually taken off them.
      if (rival) this.startClaim(rival);
    } else {
      this.rep.award('raceLoss');
    }
    this.savedAt = -1; // force the next save, win or lose
  }

  /** They run for it, and the police come out for both of you. */
  private startClaim(rival: Rival): void {
    if (!this.claim.begin(rival, this)) return;
    // A ladder rival draws heat of their own. Running one down while being
    // chased yourself is the point of the second half.
    this.police.heat = Math.max(this.police.heat, CLAIM_HEAT);
  }

  /**
   * Pay for a claim that has ended.
   *
   * The ladder moves here and nowhere else in the city: beating them in the
   * race is a result, and taking the car is the thing that counts.
   */
  private settleClaim(): void {
    const rival = this.claim.rival;
    if (this.claim.state !== 'won' || !rival) return;

    this.beaten = Math.min(RIVALS.length, this.beaten + 1);
    this.rep.award('claim', this.level);
    this.finds.claim(rival.carId);
    this.savedAt = -1;
  }

  /**
   * What the last step was worth (#64).
   *
   * The two awards that are not events: threading traffic, and simply still
   * being at large. Everything else is paid where it happens, because a
   * takedown knows it is a takedown and this does not.
   */
  private earn(dt: number): void {
    this.repairs();
    this.breakThings();
    this.nearMisses();
    this.collectibles.update(
      dt,
      this,
      // Measured against the reference car, not this one, so a camera reads
      // the same speed whatever you turned up in.
      Math.abs(this.speed) / REFERENCE_TOP_SPEED,
      this.rep,
      this.level,
    );
    const swapped = this.finds.update(dt, this, this.rep, this.level);
    if (swapped) this.drive(swapped);

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

  /**
   * How much of the damage is actually costing you anything.
   *
   * The first fifth is cosmetic: a scraped car should still drive like a car,
   * and a model where the very first shunt makes the car worse turns every
   * pursuit into a slow spiral from the opening contact.
   */
  private get hurt(): number {
    return Math.max(0, (this.damage - DAMAGE_FREE) / (1 - DAMAGE_FREE));
  }

  /** Take some, and never more than a whole car's worth. */
  private takeDamage(amount: number): void {
    this.damage = Math.max(0, Math.min(1, this.damage + amount));
  }

  /**
   * Bring something down, and take whoever is behind you with it (#57).
   *
   * This is the counterplay the pursuit was missing. Spike strips, Enforcers
   * and a helicopter are all things the police do to you; this is the one
   * thing the *city* does to them, and it turns knowing the map into an
   * advantage rather than a convenience.
   *
   * It gives rather than stops: you come out the far side barely slower, which
   * is what makes it worth aiming at while being chased instead of a wall with
   * a different texture.
   */
  private breakThings(): void {
    if (Math.abs(this.speed) < this.maxSpeed * BREAKER_MIN_SPEED) return;

    for (const thing of this.city.breakables) {
      if (this.broken.has(thing.id)) continue;
      if (Math.abs(thing.y - this.y) > CAR_RADIUS * 4) continue;
      if (Math.hypot(thing.at.x - this.x, thing.at.z - this.z) > BREAKER_RANGE + thing.half) {
        continue;
      }

      this.broken.add(thing.id);
      this.speed *= BREAKER_SPEED_KEPT;
      this.takeDamage(BREAKER_DAMAGE);
      this.crashFlash = 1;
      this.rep.award('breaker', this.level);
      // Property damage is noticed. Using the city against them is not free.
      this.police.provoke(BREAKER_HEAT);
      this.bury(thing);
      return;
    }
  }

  /**
   * Whatever came down lands on whoever was close behind.
   *
   * Measured from the thing rather than from the car, because the debris is
   * where the gate was: driving through one and *then* being caught by a cop
   * at the same spot is the mechanic working, not a bug.
   */
  private bury(thing: { at: { x: number; z: number }; y: number }): void {
    for (let i = this.police.cops.length - 1; i >= 0; i--) {
      const cop = this.police.cops[i];
      if (Math.abs(cop.y - thing.y) > CAR_RADIUS * 4) continue;
      const gap = Math.hypot(cop.x - thing.at.x, cop.z - thing.at.z);
      if (gap > BREAKER_BLAST) continue;

      // Scaled by how close they were: right behind you and it is over, at the
      // edge of it and they come out damaged and still driving.
      cop.damage = Math.min(1, cop.damage + BREAKER_BLAST_DAMAGE * (1 - gap / BREAKER_BLAST));
      if (cop.damage < 1) continue;
      const unit = COP_UNITS[cop.kind];
      this.police.remove(cop);
      this.wreck(cop, unit.colour, unit.scale, true);
    }

    // The wreckage itself, left where it fell and solid like any other.
    this.wrecks.push({
      x: thing.at.x,
      y: thing.y,
      z: thing.at.z,
      heading: this.heading,
      colour: '#6b5a44',
      scale: 0.9,
      police: false,
      roll: this.rng.range(-0.9, 0.9),
      age: WRECK_LINGER - BREAKER_DEBRIS,
    });
  }

  /**
   * Drive through a repair shop (#95).
   *
   * No menu and no stopping. Doing it during a *search* also ends the search:
   * a car that goes in beaten up and comes out straight is not the car they
   * are looking for. It does nothing while they still have eyes on you, which
   * is what makes it a decision about when to take the run rather than a
   * button that cancels the pursuit.
   */
  private repairs(): void {
    for (const shop of this.city.repairs) {
      if (Math.abs(shop.y - this.y) > CAR_RADIUS * 4) continue;
      if (Math.hypot(shop.at.x - this.x, shop.at.z - this.z) > REPAIR_RANGE) continue;
      if (this.damage === 0 && this.police.state !== 'cooldown') return;

      this.damage = 0;
      this.repairFlash = REPAIR_FLASH;
      if (this.police.state === 'cooldown') this.police.giveUp();
      return;
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
      cars: [...this.finds.owned],
      car: this.car.id,
      parts: this.finds.partsSave,
      fitted: this.finds.fittedSave,
      beaten: this.beaten,
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
      this.takeDamage(DAMAGE_ROADBLOCK);
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

      this.shredded = SHRED_TIME * (this.reinflating ? SHRED_REINFLATE : 1);
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
    // A share of what you dealt comes back. Ramming favours the rammer, which
    // is what makes a takedown a thing worth doing rather than a trade.
    this.takeDamage(damage * DAMAGE_SHARE);
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
      this.takeDamage((Math.abs(this.speed) / this.maxSpeed) * DAMAGE_PER_WALL);
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
        this.takeDamage(DAMAGE_FALL);
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

  /**
   * The map ends at the coast, and the sea is not drivable.
   *
   * With a margin, because the perimeter arterial's centreline *is* the
   * boundary: its carriageway straddles it, and without the margin a car
   * driving down the coast road is reverted and stopped on every step. What
   * keeps the sea undrivable is `afloat`, not this.
   */
  private outOfBounds(): boolean {
    const b = this.city.bounds;
    const edge = CITY_EDGE_MARGIN;
    return (
      this.x < b.minX - edge ||
      this.x > b.maxX + edge ||
      this.z < b.minZ - edge ||
      this.z > b.maxZ + edge
    );
  }

  /** How high the road under the car is, for the renderer to sit the car on. */
  groundHeight(): number {
    const surface = surfaceAt(this.city, this.grid, this.x, this.z, this.y);
    return surface.y;
  }
}

export { carriageway, roadHeightAt };
