import {
  BILLBOARD_HIT,
  CAMERA_RANGE,
  CAMERA_MIN_SPEED,
  CAR_RADIUS,
  CITY_GRID_CELL,
} from './constants';
import type { City, Collectible } from './city/types';
import type { RepLedger } from './rep';

/**
 * What has been found, and what finding it is worth (#93).
 *
 * The city says where the billboards and cameras are; this owns the part that
 * belongs to a player rather than to a seed - which ones are gone, and what
 * you have been clocked at. Kept out of `CityWorld` because it is the half
 * that gets saved, and because a collection is a thing the HUD asks questions
 * of ("how many left?", "is that one found?") rather than a field.
 */
export interface CameraFlash {
  id: number;
  /** Fraction of top speed you went past at. */
  speed: number;
  /** True when it beat what you had. */
  best: boolean;
}

export class Collectibles {
  /** Billboards already smashed, by id. */
  readonly smashed = new Set<number>();
  /** Camera id to the best fraction of top speed clocked there. */
  readonly clocked = new Map<number, number>();

  /** Set on the step a camera fires, for the HUD to show. Cleared after a moment. */
  flash: CameraFlash | null = null;
  flashAge = 0;

  readonly billboards: Collectible[];
  readonly cameras: Collectible[];

  /** Cell index, so a step is not a scan of a hundred and twenty things. */
  private readonly cells = new Map<string, Collectible[]>();
  /** Cameras the car is currently inside, so one pass fires once. */
  private readonly inRange = new Set<number>();

  constructor(city: City) {
    this.billboards = city.collectibles.filter((c) => c.kind === 'billboard');
    this.cameras = city.collectibles.filter((c) => c.kind === 'camera');

    for (const item of city.collectibles) {
      const key = this.key(item.at.x, item.at.z);
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    }
  }

  /** How many billboards are left to find. */
  get remaining(): number {
    return this.billboards.length - this.smashed.size;
  }

  /** How many cameras have been clocked at all. */
  get clockedCount(): number {
    return this.clocked.size;
  }

  /** Restore a saved collection. */
  load(smashed: number[], clocked: [number, number][]): void {
    for (const id of smashed) this.smashed.add(id);
    for (const [id, speed] of clocked) this.clocked.set(id, speed);
  }

  /**
   * Check what the car just drove into or past.
   *
   * `speed` is a fraction of top speed rather than raw units, because that is
   * what a camera is actually measuring: "how close to flat out were you", not
   * "how many world units per second".
   */
  update(
    dt: number,
    car: { x: number; z: number; y: number },
    speed: number,
    rep: RepLedger,
    level: number,
  ): void {
    this.flashAge += dt;
    if (this.flashAge > 2.5) this.flash = null;

    for (const item of this.near(car.x, car.z)) {
      if (Math.abs(item.y - car.y) > CAR_RADIUS * 4) continue;
      const gap = Math.hypot(item.at.x - car.x, item.at.z - car.z);

      if (item.kind === 'billboard') {
        if (this.smashed.has(item.id) || gap > BILLBOARD_HIT) continue;
        this.smashed.add(item.id);
        rep.award('billboard', level);
        continue;
      }

      // A camera fires on the way in and not again until you have left, or
      // parking beside one and blipping the throttle is a scoring strategy.
      if (gap > CAMERA_RANGE) {
        this.inRange.delete(item.id);
        continue;
      }
      if (this.inRange.has(item.id)) continue;
      this.inRange.add(item.id);
      if (speed < CAMERA_MIN_SPEED) continue;

      const was = this.clocked.get(item.id) ?? 0;
      const best = speed > was;
      if (best) {
        this.clocked.set(item.id, speed);
        // Priced off how fast you went past: a camera is a target, and a
        // target that pays the same at 120 as at 300 is not one.
        rep.award('camera', level, speed);
      }
      this.flash = { id: item.id, speed, best };
      this.flashAge = 0;
    }
  }

  /** Everything within a cell or so of a point, for the HUD's hints. */
  near(x: number, z: number): Collectible[] {
    const found: Collectible[] = [];
    const cx = Math.floor(x / CITY_GRID_CELL);
    const cz = Math.floor(z / CITY_GRID_CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.cells.get(`${cx + dx}|${cz + dz}`);
        if (cell) found.push(...cell);
      }
    }
    return found;
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / CITY_GRID_CELL)}|${Math.floor(z / CITY_GRID_CELL)}`;
  }
}
