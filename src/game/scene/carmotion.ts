import type * as THREE from 'three';

/**
 * What a car's body and wheels do on the way round a corner (#584).
 *
 * The simulation treats the car as a point with a heading, so nothing in it
 * leans, dives or turns a wheel; drawn as it is, the car slides along the road
 * like a model on a rail. This is the view's answer: it reads what the sim
 * already says (speed and heading, frame to frame) and moves the mesh, and
 * writes nothing back. The sim, the RNG and the citylap baselines never see it.
 *
 * Signs, because this world is mirrored from the way a car is usually
 * drawn: the car faces +z, a larger heading turns it toward +x, so steering
 * right *lowers* the heading. A positive turn about x tips the nose down and a
 * positive turn about z leans the roof toward -x.
 */

/** Largest lean, in radians: three or four degrees, enough to read, not enough to tip. */
const MAX_ROLL = 0.07;
const MAX_PITCH = 0.045;
/** Front wheel lock at a standstill and at top speed, radians. */
const LOCK_SLOW = 0.5;
const LOCK_FAST = 0.16;
/**
 * The most a wheel is drawn turning in one frame. Faster than the wheel's own
 * symmetry and a spinning wheel reads as turning backwards or standing still;
 * capped, it just reads as turning.
 */
const MAX_SPIN_STEP = 0.5;

/** A critically damped spring, stepped semi-implicitly and safe at any `dt`. */
class Spring {
  value = 0;
  private velocity = 0;
  constructor(private readonly stiffness: number) {}

  step(dt: number, target: number): number {
    const damping = 2 * Math.sqrt(this.stiffness) * 0.85;
    // Sub-stepped so a slow frame cannot make the spring explode.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.velocity += (this.stiffness * (target - this.value) - damping * this.velocity) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

export interface MotionInput {
  /** Forward speed in world units a second, negative in reverse. */
  speed: number;
  /** The car's heading, radians. */
  heading: number;
  /** -1 left, +1 right: what the driver is asking for. */
  steer: number;
  /** In the air the car has nothing to lean on. */
  airborne: boolean;
  /** The speed that counts as flat out for this car. */
  maxSpeed: number;
}

export class CarMotion {
  /** About the car's own z axis: lean in a corner. */
  roll = 0;
  /** About its x axis, added to the ramp's pitch: squat and dive. */
  pitch = 0;
  /** Front wheel yaw, radians. */
  steerAngle = 0;
  /** Distance rolled in tyre radii, which is the wheel's turn. */
  spin = 0;

  private readonly rollSpring = new Spring(90);
  private readonly pitchSpring = new Spring(70);
  private readonly steerSpring = new Spring(260);
  private lastSpeed: number | null = null;
  private lastHeading = 0;

  /** Forget the last frame, so a teleport or a new car is not read as a lurch. */
  reset(): void {
    this.lastSpeed = null;
    this.roll = this.pitch = this.steerAngle = this.spin = 0;
    this.rollSpring.value = this.pitchSpring.value = this.steerSpring.value = 0;
  }

  update(dt: number, i: MotionInput): void {
    if (dt <= 0) return;
    let accel = 0;
    let yawRate = 0;
    if (this.lastSpeed !== null) {
      accel = (i.speed - this.lastSpeed) / dt;
      let d = i.heading - this.lastHeading;
      // Heading is an angle, so a wrap is not a spin.
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yawRate = d / dt;
    }
    this.lastSpeed = i.speed;
    this.lastHeading = i.heading;

    // Lateral load is speed times yaw rate. Normalised on top speed, so a car
    // in a hairpin and a car in a sweeper both lean in proportion to how hard
    // they are being asked. A crash makes a spike in either; clamped.
    const lateral = (i.speed * yawRate) / (i.maxSpeed * 1.2);
    const longitudinal = accel / (i.maxSpeed * 0.8);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    const live = i.airborne ? 0 : 1;
    this.roll = this.rollSpring.step(dt, clamp(lateral) * MAX_ROLL * live);
    // Throttle squats the nose up (negative about x), braking dives it.
    this.pitch = this.pitchSpring.step(dt, -clamp(longitudinal) * MAX_PITCH * live);

    const lock = LOCK_SLOW + (LOCK_FAST - LOCK_SLOW) * Math.min(1, Math.abs(i.speed) / i.maxSpeed);
    this.steerAngle = this.steerSpring.step(dt, -i.steer * lock);
  }

  /** Advance the wheel's turn by the road it covered, in tyre radii. */
  advanceWheel(dt: number, speed: number, radius: number): void {
    const turn = (speed * dt) / radius;
    this.spin += Math.max(-MAX_SPIN_STEP, Math.min(MAX_SPIN_STEP, turn));
  }
}

/** The tyre's radius, read off the wheel mesh `carshape` built. */
export function tyreRadius(wheel: THREE.Mesh): number {
  return (wheel.geometry as THREE.CylinderGeometry).parameters.radiusTop;
}

/**
 * Pose a car's four wheels: spin on all, steer on the front pair.
 * `wheels` is the order `carParts` makes them in: side -1 then 1, each rear
 * (z < 0) then front.
 */
export function poseWheels(wheels: readonly THREE.Mesh[], steerAngle: number, spin: number): void {
  for (const wheel of wheels) {
    // Yaw first, then spin about the axle that yaw carries with it.
    wheel.rotation.order = 'YXZ';
    wheel.rotation.x = spin;
    wheel.rotation.y = wheel.position.z > 0 ? steerAngle : 0;
  }
}
