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
  TAKEDOWN_HOLD,
  TAKEDOWN_SLOWMO,
  TAKEDOWN_DISTANCE,
  TAKEDOWN_ORBIT,
} from '../constants';
import type { CityWorld } from '../cityworld';

const M = UNITS_PER_METRE;

/**
 * Which camera is running. Named, because the point of #88 is that the camera
 * stops being "behind the car" and becomes a thing with opinions.
 */
export type CameraMode = 'intro' | 'chase' | 'lookBack' | 'crash' | 'takedown';

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

  /**
   * How fast time should run for the sim this frame (#94).
   *
   * The slow motion on a takedown belongs here rather than in `CityWorld`,
   * because it is a property of watching rather than of the world: the cut
   * runs on real seconds, so it lasts the same length whatever the physics is
   * doing. The loop multiplies its accumulator by this and keeps stepping at
   * the fixed `STEP`, which is how slow motion works without touching physics.
   */
  timeScale = 1;

  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private fov = CHASE_FOV;
  private started = false;

  private elapsed = 0;
  private shake = 0;
  private lookBack = 0;
  private wasCrashing = false;
  private wasTakedown = false;
  /** Where the wreck was when the cut started; the car drives away from it. */
  private readonly wreckAt = new THREE.Vector3();

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

    // A takedown outranks the crash it arrived with: putting a cruiser into a
    // wall sets `crashFlash` too, and the wreck is the shot worth having.
    const took = world.takedownFlash > 0;
    if (took && !this.wasTakedown && !this.calm && world.lastTakedown) {
      this.mode = 'takedown';
      this.elapsed = 0;
      this.shake = SHAKE_STRENGTH;
      const at = world.lastTakedown;
      this.wreckAt.set(at.x, at.y, at.z);
    }
    this.wasTakedown = took;

    if (this.mode === 'intro' && (this.elapsed > INTRO_HOLD || this.calm)) this.mode = 'chase';
    if (this.mode === 'crash' && this.elapsed > CRASH_HOLD) this.mode = 'chase';
    if (this.mode === 'takedown' && this.elapsed > TAKEDOWN_HOLD) this.mode = 'chase';
    // Reduced motion gets no slow motion either: it is the same request.
    this.timeScale = this.mode === 'takedown' ? TAKEDOWN_SLOWMO : 1;
    if (this.mode === 'chase' && this.lookBack > 0) this.mode = 'lookBack';
    if (this.mode === 'lookBack' && this.lookBack <= 0) this.mode = 'chase';

    const want = this.shotFor(world);
    want.position.copy(this.unblock(want.position, want.target, world));

    // A crash cuts; everything else eases. Blending into a crash camera would
    // show the camera travelling to the spot, which is the opposite of a cut.
    const cut = this.mode === 'crash' || this.mode === 'takedown' || !this.started;
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

  /**
   * Pull the camera out of anything solid, toward the car.
   *
   * A camera that only knows where it wants to be will happily want to be
   * inside a wall - which is not a rare case but the common one, since the
   * moments the camera leaves the car are crashes, and a crash is usually
   * against something. Walking back toward the car finds the nearest clear
   * spot along the line the shot was framed on, so the framing survives.
   */
  private unblock(want: THREE.Vector3, car: THREE.Vector3, world: CityWorld): THREE.Vector3 {
    if (!world.grid) return want; // a stand-in world in a test has no city
    for (let t = 0; t <= 1.0001; t += 0.125) {
      const at = want.clone().lerp(car, t);
      if (!this.solidAt(at, world)) return at;
    }
    // Every point along the line is inside something: sit above the car, which
    // is the one place that is reliably clear.
    return car.clone().setY(car.y + 8 * M);
  }

  private solidAt(at: THREE.Vector3, world: CityWorld): boolean {
    for (const building of world.grid.buildingsNear(at.x, at.z)) {
      const f = building.footprint;
      if (at.x < f.minX || at.x > f.maxX || at.z < f.minZ || at.z > f.maxZ) continue;
      if (at.y < building.height) return true;
    }
    return false;
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

    if (this.mode === 'takedown') {
      // Swing round the wreck rather than round the player: the wreck is what
      // the shot is of, and the car that caused it is usually still leaving.
      //
      // The swing starts along the street rather than across it. A takedown
      // happens where the cars were, which in this city is usually a street
      // with a building either side, and a camera thrown out sideways lands in
      // one of them - `unblock` then drags it back onto the wreck's bumper and
      // the shot is of nothing. Down the line of the ram there is room.
      const angle = world.heading - 0.3 + this.elapsed * TAKEDOWN_ORBIT;
      return {
        position: this.wreckAt
          .clone()
          .add(
            new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(
              TAKEDOWN_DISTANCE,
            ),
          )
          .setY(this.wreckAt.y + 5 * M),
        target: this.wreckAt.clone().setY(this.wreckAt.y + 1.5 * M),
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
