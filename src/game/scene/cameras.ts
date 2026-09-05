import * as THREE from 'three';
import {
  UNITS_PER_METRE,
  CHASE_BACK,
  CHASE_HEIGHT,
  CHASE_LAG,
  CHASE_FOV,
  CHASE_FOV_FAST,
  CRASH_HOLD,
  CRASH_DISTANCE,
  INTRO_HOLD,
  INTRO_RADIUS,
  LOOK_BACK_HOLD,
  SHAKE_DECAY,
  SHAKE_STRENGTH,
} from '../constants';
import type { CityWorld } from '../cityworld';

const M = UNITS_PER_METRE;

/**
 * Which camera is running. Named, because the point of #88 is that the camera
 * stops being "behind the car" and becomes a thing with opinions.
 */
export type CameraMode = 'intro' | 'chase' | 'lookBack' | 'crash';

/** Where a camera wants to be this frame. */
export interface Shot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/**
 * The camera director (#88).
 *
 * The other half of why ADR-0004 exists. A projected renderer has exactly one
 * camera, fixed behind the car; the genre's cameras leave the car constantly -
 * a crash orbits the wreck, a pursuit glances behind, an event opens on a pass
 * over the start line.
 *
 * Modes decide where the camera *wants* to be, and everything smooths toward
 * that rather than cutting - except where a cut is the point, which is a crash.
 * Blending on a cut would show the camera flying across the city to get there.
 *
 * `prefers-reduced-motion` turns off the shake, the orbit and the automatic
 * cuts, leaving a plain chase camera. That is not a downgrade to be apologised
 * for: a fixed camera behind the car is a perfectly good way to play, and it
 * is the one the projected renderer had.
 */
export class CameraDirector {
  mode: CameraMode = 'intro';

  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private fov = CHASE_FOV;
  private started = false;

  private elapsed = 0;
  private shake = 0;
  private lookBack = 0;
  private wasCrashing = false;

  private readonly scratch = new THREE.Vector3();

  constructor(private readonly calm: boolean = false) {
    if (calm) this.mode = 'chase';
  }

  /** Ask for a look behind, held for a moment so a tap is readable. */
  glanceBack(): void {
    if (!this.calm) this.lookBack = LOOK_BACK_HOLD;
  }

  /**
   * Advance the director and hand back where the camera should be.
   *
   * `dt` is real time rather than simulation time on purpose: a camera that
   * slows down with the physics would make a crash cut feel like a stall.
   */
  update(dt: number, world: CityWorld): Shot {
    this.elapsed += dt;
    this.lookBack = Math.max(0, this.lookBack - dt);
    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);

    // A crash is an edge, not a level: crashFlash decays, so watching its value
    // would re-trigger every frame it is still above zero.
    const crashing = world.crashFlash > 0.9;
    if (crashing && !this.wasCrashing && !this.calm) {
      this.mode = 'crash';
      this.elapsed = 0;
      this.shake = SHAKE_STRENGTH;
    }
    this.wasCrashing = crashing;

    if (this.mode === 'intro' && (this.elapsed > INTRO_HOLD || this.calm)) this.mode = 'chase';
    if (this.mode === 'crash' && this.elapsed > CRASH_HOLD) this.mode = 'chase';
    if (this.mode === 'chase' && this.lookBack > 0) this.mode = 'lookBack';
    if (this.mode === 'lookBack' && this.lookBack <= 0) this.mode = 'chase';

    const want = this.shotFor(world);

    // A crash cuts; everything else eases. Blending into a crash camera would
    // show the camera travelling to the spot, which is the opposite of a cut.
    const cut = this.mode === 'crash' || !this.started;
    this.started = true;
    const ease = cut ? 1 : Math.min(1, dt * CHASE_LAG);

    this.position.lerp(want.position, ease);
    this.target.lerp(want.target, ease);
    this.fov += (want.fov - this.fov) * Math.min(1, dt * 2);

    if (this.shake > 0) {
      // Deterministic wobble rather than random: a shake that jitters randomly
      // reads as a broken frame, one that oscillates reads as an impact.
      const t = this.elapsed * 40;
      this.scratch.set(Math.sin(t * 1.7), Math.sin(t * 2.3), Math.sin(t * 1.1));
      this.position.addScaledVector(this.scratch, this.shake * 0.6 * M);
    }

    return { position: this.position, target: this.target, fov: this.fov };
  }

  /** Where this mode wants the camera, before any smoothing. */
  private shotFor(world: CityWorld): Shot {
    const car = new THREE.Vector3(world.x, world.y, world.z);
    const forward = new THREE.Vector3(Math.sin(world.heading), 0, Math.cos(world.heading));

    if (this.mode === 'intro') {
      // A slow pass around the car before you take control.
      const angle = world.heading + this.elapsed * 0.6;
      return {
        position: car
          .clone()
          .add(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(INTRO_RADIUS))
          .setY(world.y + 9 * M),
        target: car.clone().setY(world.y + 2 * M),
        fov: CHASE_FOV,
      };
    }

    if (this.mode === 'crash') {
      // Stand off to the side and watch, from wherever the car was pointing
      // when it stopped - so a crash into a wall does not put the camera in it.
      const side = new THREE.Vector3(-forward.z, 0, forward.x);
      return {
        position: car
          .clone()
          .addScaledVector(side, CRASH_DISTANCE)
          .addScaledVector(forward, -CRASH_DISTANCE * 0.4)
          .setY(world.y + 7 * M),
        target: car.clone().setY(world.y + 1.5 * M),
        fov: CHASE_FOV,
      };
    }

    if (this.mode === 'lookBack') {
      return {
        position: car.clone().addScaledVector(forward, CHASE_BACK).setY(world.y + CHASE_HEIGHT),
        target: car.clone().setY(world.y + 2 * M),
        fov: CHASE_FOV,
      };
    }

    // Chase. The field of view opens as you go faster, which is most of the
    // sensation of speed - more of it than the speed itself.
    const pace = Math.min(1, Math.abs(world.speed) / world.maxSpeed);
    return {
      position: car.clone().addScaledVector(forward, -CHASE_BACK).setY(world.y + CHASE_HEIGHT),
      target: car.clone().addScaledVector(forward, 12 * M).setY(world.y + 2 * M),
      fov: CHASE_FOV + (CHASE_FOV_FAST - CHASE_FOV) * pace,
    };
  }
}
