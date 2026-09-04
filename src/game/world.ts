import { Road } from './road';
import { Traffic } from './traffic';
import { Police } from './police';
import {
  SEGMENT_LENGTH,
  CAMERA_HEIGHT,
  CAMERA_DEPTH,
  CENTRIFUGAL,
  STEP,
  CAR_WIDTH_OFFSET,
  MIN_STEER,
  REVERSE_SPEED_FRAC,
  BUST_HOLD,
  ESCAPED_FLASH,
} from './constants';
import { accelerate, limit, increase, overlap } from './math';

/** A snapshot of which drive controls are held this step. */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface WorldOptions {
  /** Populate the track with traffic (default true). Turn off for deterministic tests. */
  traffic?: boolean;
}

/**
 * The headless game simulation: player physics, traffic, and the police
 * pursuit, with no canvas or DOM. `step(dt, input)` advances the world, so the
 * same logic drives the render loop (see Game) and the playtests.
 */
export class World {
  position = 0; // world-z along the track
  playerX = 0; // -1..1 = road edges; beyond = off-road
  speed = 0;
  crashFlash = 0; // 1 right after a crash, decays to 0
  busted = false; // frozen in the BUSTED state
  escapedFlash = 0; // seconds left on the ESCAPED banner

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

  constructor(options: WorldOptions = {}) {
    this.road.build();
    if (options.traffic ?? true) this.traffic.build(this.road, this.maxSpeed);
  }

  /** Advance the simulation by `dt` seconds under the held `input`. */
  step(dt: number, input: InputState): void {
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

    const playerSegment = this.road.findSegment(this.position + this.playerZ);
    const speedPercent = this.speed / this.maxSpeed;
    // curve push scales with actual speed; steering keeps a floor so you can
    // peel out of a lane even when stopped (e.g. right after a crash)
    const curveDx = dt * 2 * speedPercent;
    const steerDx = dt * 2 * Math.max(Math.abs(speedPercent), MIN_STEER);

    this.position = increase(this.position, dt * this.speed, this.road.trackLength);

    if (input.left) this.playerX -= steerDx;
    if (input.right) this.playerX += steerDx;

    // curves fling the car toward the outside of the bend
    this.playerX -= curveDx * speedPercent * playerSegment.curve * CENTRIFUGAL;

    if (input.up) {
      this.speed = accelerate(this.speed, this.accel, dt);
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
    this.speed = limit(this.speed, this.maxReverse, this.maxSpeed);

    this.traffic.update(dt, this.road);
    this.checkCollisions();

    this.police.update(
      dt,
      { z: this.position + this.playerZ, offset: this.playerX, speed: this.speed },
      this.maxSpeed,
      this.road.trackLength,
    );

    if (this.police.busted) {
      this.busted = true;
      this.bustHold = BUST_HOLD;
      this.speed = 0;
    }
    if (this.police.justEscaped) this.escapedFlash = ESCAPED_FLASH;

    this.crashFlash = Math.max(0, this.crashFlash - dt * 2);
    this.escapedFlash = Math.max(0, this.escapedFlash - dt);
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
