import { FIND_RANGE, FIND_FLASH, CAR_RADIUS } from './constants';
import { CARS, STARTER_CAR, carById, type CarProfile } from './cars';
import { MODS, effectOf, modById, type Mod, type ModEffect } from './mods';
import type { City, StreetFind } from './city/types';
import type { RepLedger } from './rep';

/**
 * Everything that belongs to the player rather than to the seed: the cars they
 * have, the one they are in, and the parts on each of them (#67, #68).
 *
 * The city says where each car is parked; this owns the other half, for the
 * same reason `collectibles.ts` does - it is the half that gets saved.
 *
 * Parts live here rather than on `CarProfile` because a profile is content and
 * a fitted turbo is progress. Two cars of the same model would have the same
 * profile and different parts, and the day the roster is edited nobody should
 * lose an engine.
 */
export class Garage {
  /** Ids of the cars found so far. The starter is always among them. */
  readonly owned = new Set<string>([STARTER_CAR.id]);
  car: CarProfile = STARTER_CAR;

  /** Set on the step a car is picked up, for the HUD. */
  flash: CarProfile | null = null;
  private flashAge = 0;

  /** Parts earned for each car, and the ones actually bolted on (#68). */
  private readonly parts = new Map<string, Set<string>>();
  private readonly bolted = new Map<string, Set<string>>();
  /** Set on the step a part is earned, for the HUD to say so. */
  earned: Mod | null = null;
  private earnedAge = 0;

  constructor(private readonly city: City) {}

  /** Seconds left on the "you have a new car" banner. */
  get flashLeft(): number {
    return this.flash ? Math.max(0, FIND_FLASH - this.flashAge) : 0;
  }

  /** Seconds left on the "you have earned a part" banner. */
  get earnedLeft(): number {
    return this.earned ? Math.max(0, FIND_FLASH - this.earnedAge) : 0;
  }

  /** The parts this car has earned, in catalogue order. */
  unlocked(carId: string): Mod[] {
    const owned = this.parts.get(carId);
    return owned ? MODS.filter((mod) => owned.has(mod.id)) : [];
  }

  /** Is it bolted on right now? */
  isFitted(carId: string, modId: string): boolean {
    return this.bolted.get(carId)?.has(modId) === true;
  }

  /** What is bolted to this car, as one multiplier per axis. */
  effect(carId: string): ModEffect {
    return effectOf(this.bolted.get(carId) ?? []);
  }

  /**
   * Fit a part, or take it off.
   *
   * One per slot: fitting a second set of tyres takes the first set off,
   * because a car with two sets of tyres on it is not a car.
   */
  toggle(carId: string, modId: string): boolean {
    const mod = modById(modId);
    if (!mod || !this.parts.get(carId)?.has(modId)) return false;

    const on = this.bolted.get(carId) ?? new Set<string>();
    this.bolted.set(carId, on);
    if (on.has(modId)) {
      on.delete(modId);
      return true;
    }
    for (const other of [...on]) {
      if (modById(other)?.slot === mod.slot) on.delete(other);
    }
    on.add(modId);
    return true;
  }

  /**
   * Earn the next part for a car (#68).
   *
   * The next one in catalogue order rather than a choice, which is what keeps
   * the first part a car earns a plain improvement and puts the trades later:
   * the fourth event in a car is a better moment to be asked whether you want
   * top speed or acceleration than the first.
   */
  earn(carId: string): Mod | null {
    const owned = this.parts.get(carId) ?? new Set<string>();
    this.parts.set(carId, owned);
    const next = MODS.find((mod) => !owned.has(mod.id));
    if (!next) return null;

    owned.add(next.id);
    this.earned = next;
    this.earnedAge = 0;
    return next;
  }

  /** Everything earned and everything fitted, for saving. */
  get partsSave(): [string, string[]][] {
    return [...this.parts].map(([car, mods]) => [car, [...mods]]);
  }

  get fittedSave(): [string, string[]][] {
    return [...this.bolted].map(([car, mods]) => [car, [...mods]]);
  }

  loadParts(parts: [string, string[]][], fitted: [string, string[]][]): void {
    for (const [car, mods] of parts) {
      this.parts.set(car, new Set(mods.filter((id) => modById(id) !== undefined)));
    }
    for (const [car, mods] of fitted) {
      // Only what has actually been earned: a save that claims a part the car
      // never won is a save that has been edited, not one to be trusted.
      const owned = this.parts.get(car);
      this.bolted.set(car, new Set(mods.filter((id) => owned?.has(id))));
    }
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
    this.earnedAge += dt;
    if (this.earnedAge > FIND_FLASH) this.earned = null;

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
