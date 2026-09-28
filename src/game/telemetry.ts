import { REFERENCE_TOP_SPEED, UNITS_PER_METRE } from './constants';
import type { CityWorld } from './cityworld';

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
 * Dev only, and nothing here touches the DOM or the renderer: what counts as
 * "on screen" is a question for whoever holds the camera, so it is asked in
 * through `sees`. `npm run telemetry` reads the file this produces.
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
  /** Civilian cars and quarry trucks the camera can see, within `range`. */
  traffic: number;
  /** Police units the camera can see, within `range`. */
  police: number;
}

export interface TelemetryFile {
  version: 1;
  started: string;
  /** How far a vehicle may be and still count as on screen, in metres. */
  range: number;
  samples: TelemetrySample[];
}

/**
 * How far away a vehicle still counts as on screen. A 720p frame shows a car
 * at 150 m as a handful of pixels, about where the detector that counted the
 * reference's traffic stopped finding them. Occlusion is not tested: a car
 * behind a building counts, which leans the rate high, and the report says so.
 */
export const TELEMETRY_RANGE = 150;

type Sees = (x: number, y: number, z: number) => boolean;

export class Telemetry {
  private readonly samples: TelemetrySample[] = [];
  private readonly started = new Date();

  sample(world: CityWorld, seconds: number, sees: Sees): TelemetrySample {
    const m = UNITS_PER_METRE;
    const count = (cars: readonly { x: number; y: number; z: number }[]) =>
      cars.filter((car) => {
        const gap = Math.hypot(car.x - world.x, car.z - world.z) / m;
        return gap <= TELEMETRY_RANGE && sees(car.x, car.y, car.z);
      }).length;

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
      traffic: count(world.traffic.cars) + count(world.trucks.cars),
      police: count(world.police.cops),
    };
    this.samples.push(sample);
    return sample;
  }

  get length(): number {
    return this.samples.length;
  }

  file(): TelemetryFile {
    return { version: 1, started: this.started.toISOString(), range: TELEMETRY_RANGE, samples: this.samples };
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
