import { FIND_RANGE, FIND_FLASH, CAR_RADIUS } from './constants';
import { CARS, STARTER_CAR, carById, type CarProfile } from './cars';
import type { City, StreetFind } from './city/types';
import type { RepLedger } from './rep';

/**
 * The cars you have found, and the one you are driving (#67).
 *
 * The city says where each car is parked; this owns the half that belongs to a
 * player - which ones you have, and which one you are in - for the same reason
 * `collectibles.ts` does. That is the half that gets saved.
 */
export class StreetFinds {
  /** Ids of the cars found so far. The starter is always among them. */
  readonly owned = new Set<string>([STARTER_CAR.id]);
  car: CarProfile = STARTER_CAR;

  /** Set on the step a car is picked up, for the HUD. */
  flash: CarProfile | null = null;
  private flashAge = 0;

  constructor(private readonly city: City) {}

  /** Seconds left on the "you have a new car" banner. */
  get flashLeft(): number {
    return this.flash ? Math.max(0, FIND_FLASH - this.flashAge) : 0;
  }

  /** The cars still parked out there. */
  get waiting(): StreetFind[] {
    return this.city.finds.filter((find) => !this.owned.has(find.car));
  }

  /** Restore a saved garage. Unknown ids are ignored rather than trusted. */
  load(owned: string[], active: string): void {
    for (const id of owned) {
      if (CARS.some((car) => car.id === id)) this.owned.add(id);
    }
    const wanted = carById(active);
    this.car = this.owned.has(wanted.id) ? wanted : STARTER_CAR;
  }

  /**
   * Take a car off a ladder rival (#66).
   *
   * Added to the garage but *not* driven away in: you are in the middle of a
   * pursuit having just wrecked somebody, and being teleported into a
   * different car at that moment would be absurd. The Quick Wheel (#90) is
   * where changing car deliberately belongs.
   */
  claim(id: string): void {
    if (CARS.some((car) => car.id === id)) this.owned.add(id);
  }

  /** Drive into a parked car and it is yours, immediately. */
  update(
    dt: number,
    at: { x: number; z: number; y: number },
    rep: RepLedger,
    level: number,
  ): CarProfile | null {
    this.flashAge += dt;
    if (this.flashAge > FIND_FLASH) this.flash = null;

    for (const find of this.city.finds) {
      if (this.owned.has(find.car)) continue;
      if (Math.abs(find.y - at.y) > CAR_RADIUS * 4) continue;
      if (Math.hypot(find.at.x - at.x, find.at.z - at.z) > FIND_RANGE) continue;

      const car = carById(find.car);
      this.owned.add(car.id);
      // No menu and no purchase: you are in it as soon as you have touched it.
      this.car = car;
      this.flash = car;
      this.flashAge = 0;
      rep.award('streetFind', level);
      return car;
    }
    return null;
  }
}
