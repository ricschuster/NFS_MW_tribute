import { WHEEL_ENTRIES } from './constants';
import { CARS, carById, type CarProfile } from './cars';
import type { CityWorld } from './cityworld';

/**
 * The Quick Wheel (#90).
 *
 * Held open while driving, with the game running underneath. It holds the
 * state - open or not, which branch - and knows how to turn a keypress into
 * something that happens to the world; the HUD draws it and the view feeds it
 * keys. Nothing in here draws.
 *
 * Entries are picked by *number*, not navigated to. Navigating needs a cursor,
 * a cursor needs direction keys, and the direction keys are busy driving.
 *
 * The mods branch is per-car on purpose (#68): parts belong to the car that
 * earned them, so what it lists is what is bolted or bolt-able to the one you
 * are in right now.
 */
export type WheelBranch = 'cars' | 'mods' | 'goto';

const BRANCHES: WheelBranch[] = ['cars', 'mods', 'goto'];

/** One thing you can pick. */
export interface WheelEntry {
  label: string;
  /** The line under it: what picking this gets you. */
  detail: string;
  /** False when it is shown but cannot be taken, and why is in `detail`. */
  available: boolean;
}

/** Somewhere the player has asked to be pointed at. */
export interface Marker {
  x: number;
  z: number;
  label: string;
}

/** A multiplier as a round two- or three-figure number, for a stat line. */
const pct = (value: number) => Math.round(value * 100);

export class QuickWheel {
  open = false;
  branch: WheelBranch = 'cars';

  /**
   * Which nine of a longer list are on screen (#214).
   *
   * Entries are picked by *number* (#90), and there are nine of those, so a
   * branch with more than nine things on it has to page. It used to truncate
   * instead: `destinations` gathers about thirty places and handed back the
   * nearest nine, so an event a kilometre away was not on the wheel and nothing
   * said a list had been cut. That is how a playtester came to be unable to
   * reach the route they had been asked to drive.
   */
  page = 0;

  /** Flip to the next branch. */
  cycle(): void {
    this.branch = BRANCHES[(BRANCHES.indexOf(this.branch) + 1) % BRANCHES.length];
    this.page = 0;
  }

  /** Show the next nine, wrapping. */
  more(world: CityWorld): void {
    const pages = this.pages(world);
    this.page = pages > 0 ? (this.page + 1) % pages : 0;
  }

  /** How many pages the current branch needs. */
  pages(world: CityWorld): number {
    return Math.max(1, Math.ceil(this.all(world).length / WHEEL_ENTRIES));
  }

  /** How many things are on this branch in total, paged or not. */
  count(world: CityWorld): number {
    return this.all(world).length;
  }

  /** Everything on the current branch, before paging. */
  private all(world: CityWorld): unknown[] {
    if (this.branch === 'cars') return this.owned(world);
    if (this.branch === 'mods') return world.finds.unlocked(world.car.id);
    return this.destinations(world);
  }

  /** Where the current page starts in the full list. */
  private offset(world: CityWorld): number {
    const pages = this.pages(world);
    return (this.page % pages) * WHEEL_ENTRIES;
  }

  /** What the branch is called, for the heading. */
  get title(): string {
    if (this.branch === 'cars') return 'GARAGE';
    if (this.branch === 'mods') return 'PARTS';
    return 'GO TO';
  }

  /** What is on the current branch, at most `WHEEL_ENTRIES` of it. */
  entries(world: CityWorld): WheelEntry[] {
    if (this.branch === 'cars') return this.garage(world);
    if (this.branch === 'mods') return this.parts(world);
    return this.places(world);
  }

  /** Take entry `index`. Returns true when something actually happened. */
  choose(world: CityWorld, index: number): boolean {
    const entries = this.entries(world);
    const entry = entries[index];
    if (!entry || !entry.available) return false;

    const at = this.offset(world) + index;
    if (this.branch === 'cars') {
      world.drive(this.owned(world)[at]);
      return true;
    }

    if (this.branch === 'mods') {
      const mod = world.finds.unlocked(world.car.id)[at];
      if (!mod) return false;
      world.finds.toggle(world.car.id, mod.id);
      // Re-applied straight away: a part you cannot feel until the next time
      // you get into the car is a menu, not a Quick Wheel.
      world.drive(world.car);
      return true;
    }

    const place = this.destinations(world)[at];
    if (!place) return false;
    // Through `aimAt`, which also works out the way there: an arrow across a
    // city with a river in it points at plenty of places you cannot reach
    // from where you are standing.
    world.aimAt(place);
    return true;
  }

  /** The cars you have, starter first. */
  private owned(world: CityWorld): CarProfile[] {
    return CARS.filter((car) => world.finds.owned.has(car.id));
  }

  private garage(world: CityWorld): WheelEntry[] {
    // Changing car mid-event would be swapping horses in the middle of a race,
    // which is not a menu decision, it is a cheat.
    const busy = world.race.state !== 'idle' || world.claim.state !== 'idle';
    return this.owned(world)
      .slice(this.offset(world), this.offset(world) + WHEEL_ENTRIES)
      .map((car) => ({
        label: car.name,
        // Numbers rather than the blurb. The blurb is what you read when you
        // find a car; this is read at two hundred kilometres an hour while
        // choosing between two of them, and what you want then is which is
        // faster and which turns.
        detail: busy
          ? 'not during an event'
          : car.id === world.car.id
            ? 'in it now'
            : `SPD ${pct(car.topSpeed)}  ACC ${pct(car.accel)}  GRP ${pct(car.grip)}`,
        available: !busy && car.id !== world.car.id,
      }));
  }

  /**
   * What is bolted to the car you are in, and what could be.
   *
   * Nothing at all until it has earned something, and the empty state says how
   * to change that rather than just being empty.
   */
  private parts(world: CityWorld): WheelEntry[] {
    const mods = world.finds.unlocked(world.car.id);
    if (mods.length === 0) {
      return [
        {
          label: 'Nothing yet',
          detail: `finish top two in the ${world.car.name}`,
          available: false,
        },
      ];
    }

    const busy = world.race.state !== 'idle' || world.claim.state !== 'idle';
    return mods.slice(this.offset(world), this.offset(world) + WHEEL_ENTRIES).map((mod) => ({
      label: `${world.finds.isFitted(world.car.id, mod.id) ? '\u25cf' : '\u25cb'} ${mod.name}`,
      detail: busy ? 'not during an event' : mod.detail,
      available: !busy,
    }));
  }

  /** Everywhere worth being pointed at, nearest first. */
  private destinations(world: CityWorld): Marker[] {
    const places: Marker[] = [];
    for (const route of world.city.routes) {
      places.push({
        x: route.start.x,
        z: route.start.z,
        label: `${route.name} (${route.kind === 'speedrun' ? 'speed run' : 'circuit'})`,
      });
    }
    for (const spot of world.city.ambushes) {
      places.push({ x: spot.at.x, z: spot.at.z, label: `Ambush, heat ${spot.level}` });
    }
    for (const find of world.finds.waiting) {
      places.push({ x: find.at.x, z: find.at.z, label: `${carById(find.car).name}, parked` });
    }
    for (const shop of world.city.repairs) {
      places.push({ x: shop.at.x, z: shop.at.z, label: 'Repair shop' });
    }

    // Nearest first: the wheel is used at speed, and the thing you want is
    // almost always the one you could still get to.
    return places
      .sort(
        (a, b) =>
          Math.hypot(a.x - world.x, a.z - world.z) - Math.hypot(b.x - world.x, b.z - world.z),
      );
  }

  private places(world: CityWorld): WheelEntry[] {
    const metre = 135;
    return this.destinations(world)
      .slice(this.offset(world), this.offset(world) + WHEEL_ENTRIES)
      .map((place) => ({
        label: place.label,
        detail: `${Math.round(Math.hypot(place.x - world.x, place.z - world.z) / metre / 100) / 10} km`,
        available: true,
      }));
  }
}
