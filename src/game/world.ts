import { Road } from './road';
import { Traffic } from './traffic';
import { Police } from './police';
import { BLACKLIST, type Rival } from './blacklist';
import { loadProgress, saveProgress } from './progress';
import {
  SEGMENT_LENGTH,
  CAMERA_HEIGHT,
  CAMERA_DEPTH,
  CURVE_TO_HEADING,
  TURN_RATE,
  HEADING_LIMIT,
  ROAD_WIDTH,
  STEP,
  CAR_WIDTH_OFFSET,
  PROP_HIT_OFFSET,
  PROP_DEFLECT,
  LATERAL_GRIP,
  REVERSE_SPEED_FRAC,
  BUST_HOLD,
  ESCAPED_FLASH,
  NITRO_SPEED_MULT,
  NITRO_ACCEL_MULT,
  NITRO_DRAIN,
  NITRO_RECHARGE,
  NITRO_MIN_ENGAGE,
  NITRO_BLEED_FRAC,
  RACE_DISTANCE,
  COUNTDOWN_TIME,
  RIVAL_BASE_SPEED_FRAC,
  RIVAL_DIFF_SPEED_FRAC,
  RIVAL_LANE,
  RIVAL_NEAR_LEAD,
} from './constants';
import { accelerate, limit, increase, overlap } from './math';
import { propAt } from './scenery';

/** A snapshot of which controls are held this step. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Enter / Space: start a race, or dismiss a result. */
  confirm: boolean;
  /** Shift: nitrous boost. */
  nitro: boolean;
}

export interface WorldOptions {
  /** Populate the track with traffic (default true). Turn off for deterministic tests. */
  traffic?: boolean;
}

export type RaceMode = 'cruise' | 'countdown' | 'racing' | 'result';
export type RaceResult = 'won' | 'lost';

/** The rival racer during a Blacklist event. */
export interface RivalCar {
  /** Distance the rival has covered this race, in world units. */
  dist: number;
  offset: number;
  /** Render position: world-z ahead of the player. */
  z: number;
}

/**
 * The headless game simulation: player physics, traffic, the police pursuit,
 * and Blacklist races — with no canvas or DOM. `step(dt, input)` advances the
 * world, so the same logic drives the render loop (Game) and the playtests.
 */
export class World {
  position = 0; // distance travelled along the track
  playerX = 0; // -1..1 = road edges; beyond = off-road
  /**
   * Where the car points, in radians relative to the road direction. Positive
   * is toward +playerX. Steering changes this rather than sliding the car
   * sideways, so the car goes where it is aimed.
   */
  heading = 0;
  speed = 0; // along the heading, not along the road
  crashFlash = 0; // 1 right after a crash, decays to 0
  busted = false; // frozen in the BUSTED state
  escapedFlash = 0; // seconds left on the ESCAPED banner
  nitro = 1; // nitrous charge, 0..1
  boosting = false; // nitrous active this step

  // Blacklist / race state.
  raceMode: RaceMode = 'cruise';
  countdown = 0; // seconds left in the 3-2-1
  playerRaceDist = 0; // distance covered by the player this race
  rivalCar: RivalCar | null = null;
  raceRival: Rival | null = null; // the rival currently being raced
  raceResult: RaceResult | null = null;
  beaten: number; // rivals defeated so far

  readonly road = new Road();
  readonly traffic = new Traffic();
  readonly police = new Police();

  readonly maxSpeed = SEGMENT_LENGTH / STEP; // cap so we never skip a segment
  readonly playerZ = CAMERA_HEIGHT * CAMERA_DEPTH; // camera-to-car distance

  private readonly accel = this.maxSpeed / 5;
  private readonly braking = -this.maxSpeed;
  private readonly decel = -this.maxSpeed / 5;
  private readonly offRoadDecel = -this.maxSpeed / 2;
  private readonly offRoadLimit = this.maxSpeed / 4;
  private readonly maxReverse = -this.maxSpeed * REVERSE_SPEED_FRAC;

  private bustHold = 0;
  private prevConfirm = false;

  constructor(options: WorldOptions = {}) {
    this.road.build();
    if (options.traffic ?? true) this.traffic.build(this.road, this.maxSpeed);
    this.beaten = loadProgress().beaten;
  }

  /** The rival the player would race next, or null once the Blacklist is cleared. */
  get currentRival(): Rival | null {
    return this.beaten < BLACKLIST.length ? BLACKLIST[this.beaten] : null;
  }

  /** Advance the simulation by `dt` seconds under the held `input`. */
  step(dt: number, input: InputState): void {
    const confirmPressed = input.confirm && !this.prevConfirm;
    this.prevConfirm = input.confirm;

    switch (this.raceMode) {
      case 'cruise':
        this.stepCruise(dt, input, confirmPressed);
        break;
      case 'countdown':
        this.stepCountdown(dt);
        break;
      case 'racing':
        this.stepRacing(dt, input);
        break;
      case 'result':
        if (confirmPressed) {
          this.raceMode = 'cruise';
          this.rivalCar = null;
          this.raceResult = null;
        }
        break;
    }
  }

  /** Free-drive: traffic, the police pursuit, and the option to start a race. */
  private stepCruise(dt: number, input: InputState, confirmPressed: boolean): void {
    // BUSTED: freeze the world, hold the overlay, then clear the pursuit
    if (this.busted) {
      this.bustHold -= dt;
      if (this.bustHold <= 0) {
        this.busted = false;
        this.speed = 0;
        this.police.reset();
      }
      return;
    }

    const ds = this.drive(dt, input);

    // the pursuit closes along the road, so what matters is how fast the player
    // is covering it - pointing the car sideways is not an escape
    this.police.update(
      dt,
      { z: this.position + this.playerZ, offset: this.playerX, speed: ds / dt },
      this.maxSpeed,
      this.road.trackLength,
    );

    if (this.police.busted) {
      this.busted = true;
      this.bustHold = BUST_HOLD;
      this.speed = 0;
    }
    if (this.police.justEscaped) this.escapedFlash = ESCAPED_FLASH;
    this.escapedFlash = Math.max(0, this.escapedFlash - dt);

    if (confirmPressed && this.currentRival) this.startRace();
  }

  /** Lined up at the start: hold the player still and tick 3-2-1. */
  private stepCountdown(dt: number): void {
    this.speed = 0;
    this.countdown -= dt;
    if (this.rivalCar) {
      this.rivalCar.z = increase(this.position + this.playerZ + RIVAL_NEAR_LEAD, 0, this.road.trackLength);
    }
    if (this.countdown <= 0) {
      this.raceMode = 'racing';
      this.playerRaceDist = 0;
      if (this.rivalCar) this.rivalCar.dist = 0;
    }
  }

  /** The sprint: drive, advance the rival, and check the finish line. */
  private stepRacing(dt: number, input: InputState): void {
    // race progress is distance along the route, not distance travelled
    this.playerRaceDist += Math.max(0, this.drive(dt, input));

    const rival = this.raceRival;
    const car = this.rivalCar;
    if (!rival || !car) return;

    const rivalSpeed = this.maxSpeed * (RIVAL_BASE_SPEED_FRAC + rival.difficulty * RIVAL_DIFF_SPEED_FRAC);
    car.dist += rivalSpeed * dt;

    // Put the rival where it actually is. A lead that stopped growing kept it
    // pinned just ahead of the player's bumper however far up the road it
    // really was, so losing time to a crash or a lift looked like the rival
    // slowing down as well. RIVAL_NEAR_LEAD only keeps it off the camera at
    // the start line, where the gap is zero.
    const gap = car.dist - this.playerRaceDist;
    car.z = increase(this.position + this.playerZ + Math.max(gap, RIVAL_NEAR_LEAD), 0, this.road.trackLength);

    if (this.playerRaceDist >= RACE_DISTANCE) this.finishRace('won');
    else if (car.dist >= RACE_DISTANCE) this.finishRace('lost');
  }

  /**
   * Shared driving physics: steering, throttle, off-road, traffic, collisions.
   * Returns the distance covered *along* the road this step, which is not the
   * same as the distance travelled once the car is pointed across it.
   *
   * The car is tracked in a road-relative frame: how far along the track it is,
   * how far across, and which way it points. Motion is velocity along the
   * heading, split into those two axes. That is the same physics a free-roam
   * car has, written in the frame the track still provides - so issue #83 can
   * swap the frame for a city without touching the model.
   */
  private drive(dt: number, input: InputState): number {
    const playerSegment = this.road.findSegment(this.position + this.playerZ);
    // Yaw is limited by grip rather than by the wheel: turning at rate w while
    // travelling at v costs v*w of lateral acceleration, so the faster the car
    // goes the wider it has to turn. TURN_RATE caps it at low speed, which also
    // leaves a stopped car free to be aimed away from whatever it just hit.
    const authority = Math.min(TURN_RATE, LATERAL_GRIP / Math.max(this.maxSpeed * 0.05, Math.abs(this.speed)));

    // nitrous: rechargeable boost to top speed and acceleration. Relighting it
    // takes a real charge, not the sliver one frame of recharge puts back at
    // empty - without that, holding the key boosts forever.
    const charged = this.boosting ? this.nitro > 0 : this.nitro >= NITRO_MIN_ENGAGE;
    const boosting = input.nitro && charged && this.speed > this.maxSpeed * 0.15;
    this.boosting = boosting;
    this.nitro = boosting
      ? Math.max(0, this.nitro - dt * NITRO_DRAIN)
      : Math.min(1, this.nitro + dt * NITRO_RECHARGE);
    const throttle = boosting ? this.accel * NITRO_ACCEL_MULT : this.accel;

    // point the car; reversing pivots it the other way, as a real car does
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.heading += steer * authority * dt * Math.sign(this.speed || 1);

    // travel along the heading, split into along-road and across-road motion
    const along = this.speed * Math.cos(this.heading);
    const ds = along * dt;
    this.position = increase(this.position, ds, this.road.trackLength);
    this.playerX += (this.speed * Math.sin(this.heading) * dt) / ROAD_WIDTH;

    // A bend rotates the road under the car, so a straight heading runs wide on
    // its own. This is what the old centrifugal fudge was standing in for, and
    // unlike that fudge it is symmetric: steering into the corner cancels it
    // exactly.
    this.heading -= playerSegment.curve * CURVE_TO_HEADING * ds;
    this.heading = limit(this.heading, -HEADING_LIMIT, HEADING_LIMIT);

    if (input.up) {
      this.speed = accelerate(this.speed, throttle, dt);
    } else if (input.down) {
      // brake, then reverse once stopped
      this.speed = accelerate(this.speed, this.braking, dt);
    } else if (this.speed > 0) {
      this.speed = Math.max(0, accelerate(this.speed, this.decel, dt));
    } else if (this.speed < 0) {
      // coast a reversing car back up toward a standstill
      this.speed = Math.min(0, accelerate(this.speed, -this.decel, dt));
    }

    // off-road: bleed speed hard
    if ((this.playerX < -1 || this.playerX > 1) && this.speed > this.offRoadLimit) {
      this.speed = accelerate(this.speed, this.offRoadDecel, dt);
    }

    this.playerX = limit(this.playerX, -2, 2);
    const topSpeed = boosting ? this.maxSpeed * NITRO_SPEED_MULT : this.maxSpeed;
    if (this.speed > topSpeed) {
      // bleed overspeed (e.g. after a boost ends) smoothly back to the cap
      this.speed = Math.max(topSpeed, this.speed - this.maxSpeed * NITRO_BLEED_FRAC * dt);
    } else if (this.speed < this.maxReverse) {
      this.speed = this.maxReverse;
    }

    this.traffic.update(dt, this.road);
    this.checkCollisions();
    this.checkScenery();

    this.crashFlash = Math.max(0, this.crashFlash - dt * 2);
    return ds;
  }

  private startRace(): void {
    this.raceRival = this.currentRival;
    this.raceMode = 'countdown';
    this.countdown = COUNTDOWN_TIME;
    this.playerRaceDist = 0;
    this.raceResult = null;
    this.speed = 0;
    this.heading = 0; // lined up straight on the grid
    this.escapedFlash = 0;
    this.police.reset(); // no pursuit during a sanctioned race
    this.rivalCar = {
      dist: 0,
      offset: RIVAL_LANE,
      z: increase(this.position + this.playerZ + RIVAL_NEAR_LEAD, 0, this.road.trackLength),
    };
  }

  private finishRace(result: RaceResult): void {
    this.raceResult = result;
    this.raceMode = 'result';
    this.speed = 0;
    if (result === 'won') {
      this.beaten = Math.min(BLACKLIST.length, this.beaten + 1);
      saveProgress({ beaten: this.beaten });
    }
  }

  /**
   * Stop the player dead against a tree, billboard or lamp post. Props stand
   * beyond the road edge, so this only bites once you have already left the
   * tarmac - the off-road drag is the warning, the scenery is the penalty.
   */
  private checkScenery(): void {
    if (this.speed <= 0) return;
    if (Math.abs(this.playerX) < 1) return; // still on the road; nothing out there to hit

    const baseZ = this.position + this.playerZ;
    for (let s = 0; s < 2; s++) {
      const segment = this.road.findSegment(baseZ + s * SEGMENT_LENGTH);
      const prop = propAt(segment.index);
      if (!prop) continue;
      if (!overlap(this.playerX, CAR_WIDTH_OFFSET, prop.offset, PROP_HIT_OFFSET, 0.8)) continue;

      this.speed = 0; // a tree does not give
      // settle just short of it, so we are not parked inside the trunk, and
      // glance back toward the road - otherwise the car wedges against the
      // prop and every attempt to pull away hits it again
      this.position = increase(segment.p1.world.z, -this.playerZ - SEGMENT_LENGTH, this.road.trackLength);
      this.playerX -= prop.side * PROP_DEFLECT;
      this.crashFlash = 1;
      return;
    }
  }

  /**
   * Crash the player into any overlapping traffic. Scans the player's segment
   * and the next one (closing speeds can exceed one segment per step), bleeds
   * speed on impact, and settles the player behind the car.
   */
  private checkCollisions(): void {
    if (this.speed <= 0) return;
    const road = this.road;
    const baseZ = this.position + this.playerZ;

    for (let s = 0; s < 2; s++) {
      const segment = road.findSegment(baseZ + s * SEGMENT_LENGTH);
      for (const car of segment.cars) {
        if (this.speed <= car.speed) continue; // only when closing on it
        if (!overlap(this.playerX, CAR_WIDTH_OFFSET, car.offset, CAR_WIDTH_OFFSET, 0.8)) continue;

        const shared = Math.max(car.speed, 0);
        this.speed = shared * (shared / this.speed); // drop below the car's speed (0 for parked/oncoming)
        // settle a little behind the car so we're not glued to its bumper
        this.position = increase(car.z, -this.playerZ - SEGMENT_LENGTH, road.trackLength);
        this.crashFlash = 1;
        return;
      }
    }
  }
}
