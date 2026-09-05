import {
  TURN_RATE,
  LATERAL_GRIP,
  SEGMENT_LENGTH,
  STEP,
  REVERSE_SPEED_FRAC,
  NITRO_SPEED_MULT,
  NITRO_ACCEL_MULT,
  NITRO_DRAIN,
  NITRO_RECHARGE,
  NITRO_MIN_ENGAGE,
  NITRO_BLEED_FRAC,
  CAR_RADIUS,
  HIT_SPEED_KEPT,
  RIDE_RATE,
  GRAVITY,
  SPAWN_SEARCH,
} from './constants';
import { accelerate } from './math';
import { kestrelBay } from './city/index';
import { CityGrid, surfaceAt, roadHeightAt, carriageway } from './city/grid';
import type { City, CityRoad } from './city/types';
import type { InputState } from './world';

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
export class CityWorld {
  readonly city: City;
  readonly grid: CityGrid;

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

  constructor(city: City = kestrelBay()) {
    this.city = city;
    this.grid = new CityGrid(city);
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
      const a = this.city.nodes[road.a].pos;
      const gap = Math.hypot(a.x - middle.x, a.z - middle.z);
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

    // Yaw is limited by grip rather than by the wheel: turning at rate w while
    // travelling at v costs v*w of lateral acceleration, so the faster the car
    // goes the wider it turns. Unchanged from the track model on purpose.
    const authority = Math.min(
      TURN_RATE,
      LATERAL_GRIP / Math.max(this.maxSpeed * 0.05, Math.abs(this.speed)),
    );

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

    const topSpeed = boosting ? this.maxSpeed * NITRO_SPEED_MULT : this.maxSpeed;
    if (this.speed > topSpeed) {
      this.speed = Math.max(topSpeed, this.speed - this.maxSpeed * NITRO_BLEED_FRAC * dt);
    } else if (this.speed < this.maxReverse) {
      this.speed = this.maxReverse;
    }

    this.move(dt);
    this.settle(dt);
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

    if (this.outOfBounds()) {
      this.x = wasX;
      this.z = wasZ;
      this.speed = 0;
    }
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
