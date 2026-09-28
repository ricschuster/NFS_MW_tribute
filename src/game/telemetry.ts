import { CAR_ASPECT, CAR_WIDTH_WORLD, COP_UNITS, REFERENCE_TOP_SPEED, UNITS_PER_METRE } from './constants';
import type { CityWorld } from './cityworld';
import { SET_PIECE_SOLIDS } from './city/setpieces';

/**
 * A recording of a person driving, read off the sim rather than the screen
 * (#347).
 *
 * The reference game could only be measured from its video: a vision model
 * reading the speedometer, a detector counting cars. Crosstown can be asked
 * directly, so it is. A sample a second of what the car is doing and how many
 * other vehicles the camera can see, which is what #347 wants - a human's pace
 * as a fraction of top speed, to set beside `citylap`'s expert, and an
 * on-screen traffic rate, to set beside the reference's 0.60 vehicles a frame.
 *
 * Nothing here touches the DOM or the renderer: how big a vehicle is on screen
 * is a question for whoever holds the camera, so it is asked in through a
 * `Sizer`. `npm run telemetry` reads the file this produces.
 */
export interface TelemetrySample {
  /** Seconds since recording started. */
  t: number;
  /** Wall-clock time, to line a sample up with a video recorded alongside. */
  at: string;
  x: number;
  z: number;
  y: number;
  kmh: number;
  /** Speed as a fraction of the reference car's top speed, as `citylap` reports it. */
  ofTop: number;
  /** Speed as a fraction of *this* car's top speed. */
  ofOwnTop: number;
  car: string;
  damage: number;
  /** The event running, if any: `race` covers the countdown too. */
  event: 'race' | 'ambush' | 'claim' | null;
  route: string | null;
  heat: number;
  pursuit: string;
  road: string | null;
  surface: string | null;
  /** Civilian cars and quarry trucks on screen at `detectable` or bigger. */
  traffic: number;
  /** Police units on screen at `detectable` or bigger. */
  police: number;
  /**
   * The on-screen height of every vehicle in view, as a fraction of the
   * screen's, down to `TELEMETRY_KEPT`: what lets a recording be counted again
   * at another threshold without being driven again.
   */
  sizes: { traffic: number[]; police: number[] };
}

export interface TelemetryFile {
  version: 2;
  started: string;
  /** How big a vehicle had to be on screen to count, as a fraction of its height. */
  detectable: number;
  samples: TelemetrySample[];
}

/**
 * How big a vehicle has to be on screen to count: 2.5% of the screen's height.
 *
 * The reference game's traffic rate (0.60 a frame) is what a detector found in
 * its video, and a detector does not find a car that is a few pixels tall.
 * Measured by running the same detector over the same 2,813 frames again: of
 * the 1,593 vehicles it counted, 95% were at least 2.5% of the frame tall and
 * none were under 1.5%. Counting everything in the camera's view instead, the
 * first version of this, counted cars a detector never would have.
 *
 * The detector cannot be run on Crosstown's own video to settle it the other
 * way: it does not recognise a low-poly car as a car (it found 5% of them).
 * Nothing tests whether something stands between the camera and a vehicle.
 */
export const TELEMETRY_DETECTABLE = 0.025;

/** The smallest on-screen size kept in `sizes`, well under anything counted. */
export const TELEMETRY_KEPT = 0.005;

/** A vehicle's drawn box: width, length and height to the roof, in world units. */
export interface Box {
  w: number;
  l: number;
  h: number;
}

/**
 * The box a car is drawn in, from `carParts`'s own proportions: 1.9 times as
 * long as it is wide, and its roof is the glasshouse sitting on the body.
 */
export const CAR_BOX: Box = (() => {
  const w = CAR_WIDTH_WORLD;
  const body = w * CAR_ASPECT * 0.62;
  const floor = w * 0.175 * 0.66;
  return { w, l: w * 1.9, h: floor + body * 0.92 + (body * 0.72) / 2 };
})();

/** A haul truck, from the solid it collides as. */
export const TRUCK_BOX: Box = (() => {
  const solid = SET_PIECE_SOLIDS['haul-truck'][0];
  const m = UNITS_PER_METRE;
  return 'w' in solid ? { w: solid.w * m, l: solid.l * m, h: solid.y1 * m } : CAR_BOX;
})();

/** How much of the screen's height a box takes up, as `CityView.screenHeight` answers it. */
export type Sizer = (x: number, y: number, z: number, heading: number, w: number, l: number, h: number) => number;

export class Telemetry {
  private readonly samples: TelemetrySample[] = [];
  private readonly started = new Date();

  sample(world: CityWorld, seconds: number, size: Sizer): TelemetrySample {
    const m = UNITS_PER_METRE;
    type Vehicle = { x: number; y: number; z: number; heading: number };
    const measure = (vehicle: Vehicle, box: Box, k = 1) =>
      size(vehicle.x, vehicle.y, vehicle.z, vehicle.heading, box.w * k, box.l * k, box.h * k);
    const sizes = {
      traffic: [
        ...world.traffic.cars.map((car) => measure(car, CAR_BOX)),
        ...world.trucks.cars.map((truck) => measure(truck, TRUCK_BOX)),
      ],
      police: world.police.cops.map((cop) => measure(cop, CAR_BOX, COP_UNITS[cop.kind].scale)),
    };
    const kept = (all: number[]) => all.filter((h) => h >= TELEMETRY_KEPT).map((h) => Math.round(h * 10000) / 10000);
    const counted = (all: number[]) => all.filter((h) => h >= TELEMETRY_DETECTABLE).length;

    const racing = world.race.state === 'racing' || world.race.state === 'countdown';
    const sample: TelemetrySample = {
      t: Math.round(seconds * 10) / 10,
      at: new Date().toISOString(),
      x: Math.round(world.x / m),
      z: Math.round(world.z / m),
      y: Math.round(world.y / m),
      kmh: Math.round((Math.abs(world.speed) / m) * 3.6),
      ofTop: round(Math.abs(world.speed) / REFERENCE_TOP_SPEED),
      ofOwnTop: round(Math.abs(world.speed) / world.maxSpeed),
      car: world.car.name,
      damage: round(world.damage),
      event: racing
        ? 'race'
        : world.ambush.state === 'running'
          ? 'ambush'
          : world.claim.state === 'running'
            ? 'claim'
            : null,
      route: racing ? (world.race.route?.name ?? null) : null,
      heat: world.police.level,
      pursuit: world.police.state,
      road: world.onRoad?.class ?? null,
      surface: world.onRoad ? (world.onRoad.surface ?? 'asphalt') : null,
      traffic: counted(sizes.traffic),
      police: counted(sizes.police),
      sizes: { traffic: kept(sizes.traffic), police: kept(sizes.police) },
    };
    this.samples.push(sample);
    return sample;
  }

  get length(): number {
    return this.samples.length;
  }

  file(): TelemetryFile {
    return {
      version: 2,
      started: this.started.toISOString(),
      detectable: TELEMETRY_DETECTABLE,
      samples: this.samples,
    };
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
