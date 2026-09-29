import { WHEEL_ENTRIES } from './constants';
import { CARS, carById, type CarProfile } from './cars';
import { MODS } from './mods';
import { routeDifficulty, type CityWorld } from './cityworld';
import { racePurse } from './rep';
import { difficultyLabel } from './rivals';

/**
 * The Quick Menu (#90, #420).
 *
 * Open while driving, with the game running underneath. It holds the state -
 * open or not, where in the menu, which row - and knows how to turn a press
 * into something that happens to the world; the HUD draws it and the view
 * feeds it keys. Nothing in here draws.
 *
 * Laid out and driven the way the reference game's in-drive menu is, read off
 * the recording (#420): a path you walk down rather than a list you read. The
 * top level is RACES, CUSTOMIZE CAR, CHANGE CAR and MOST WANTED, plus PLACES,
 * which is ours: the reference has no repair shops to go to. It is navigated
 * like a D-pad - right opens, goes deeper and *selects* (the recording's
 * prompt is SELECT MOD beside the pad's right arrow), left goes back and in
 * the end closes, up and down move the cursor. On a keyboard that pad is
 * I J K L, because the arrows and WASD are busy driving: the menu can be used
 * without letting go of the car.
 *
 * It used to be one "go to" list of every kind of place, nearest first, whose
 * order changed while you drove, picked by number. A short list per kind with
 * a cursor is what the owner asked for, and it reopens on the branch it was
 * last on.
 *
 * The mods branch is per-car on purpose (#68): parts belong to the car that
 * earned them, so what it lists is what is bolted or bolt-able to the one you
 * are in right now.
 */
export type WheelBranch = 'races' | 'mods' | 'cars' | 'rival' | 'places';

const BRANCHES: WheelBranch[] = ['races', 'mods', 'cars', 'rival', 'places'];

/** What each branch is called. */
export const BRANCH_TITLES: Record<WheelBranch, string> = {
  races: 'RACES',
  mods: 'CUSTOMIZE CAR',
  cars: 'CHANGE CAR',
  rival: 'MOST WANTED',
  places: 'PLACES',
};

/** What the menu is called on screen. Its own name: the reference's is theirs. */
export const MENU_TITLE = 'QUICK MENU';

/** One row. */
export interface WheelEntry {
  label: string;
  /** The line beside it: what picking this gets you, or why it cannot be had. */
  detail: string;
  /** False when it is shown but cannot be taken, and why is in `detail`. */
  available: boolean;
  /**
   * A tick for a part that is on, a padlock for one not earned yet: the two
   * marks the reference puts at the end of a row.
   */
  mark?: 'fitted' | 'locked';
  /** Right does something here: go deeper, or do it. Drawn as a ▸. */
  opens?: boolean;
}

/** Somewhere the player has asked to be pointed at. */
export interface Marker {
  x: number;
  z: number;
  label: string;
}

/** A row and what selecting it does. */
interface Item extends WheelEntry {
  /** Somewhere to go: selecting it opens its actions. */
  place?: Marker;
  /** Done straight away on select: a car to get into, a part to toggle. */
  act?: (world: CityWorld) => void;
}

/** What the HUD draws: the path so far, and the rows of the level you are on. */
export interface MenuView {
  path: string[];
  rows: WheelEntry[];
  /** Which of `rows` the cursor is on. */
  cursor: number;
  /** How far down the whole list `rows` starts, for the "4-12 of 18". */
  from: number;
  total: number;
}

/** A multiplier as a round two- or three-figure number, for a stat line. */
const pct = (value: number) => Math.round(value * 100);

const METRE = 135;

export class QuickWheel {
  open = false;
  /**
   * How deep: 0 the branches, 1 a branch's rows, 2 a place's actions. Reopening
   * starts at the branches with the cursor where it was, so the last branch is
   * one press away.
   */
  depth: 0 | 1 | 2 = 0;
  branch: WheelBranch = 'races';
  /** The row within the branch. */
  cursor = 0;
  /** The place whose actions are open, held so it does not move under you. */
  private chosen: Marker | null = null;

  /** Right: open, go deeper, or select. Returns true when something happened to the world. */
  right(world: CityWorld): boolean {
    if (!this.open) {
      this.open = true;
      this.depth = 0;
      return false;
    }
    if (this.depth === 0) {
      this.depth = 1;
      this.cursor = 0;
      return false;
    }
    if (this.depth === 1) {
      const item = this.items(world)[this.cursor];
      if (!item || !item.available) return false;
      if (item.act) {
        item.act(world);
        return true;
      }
      if (item.place) {
        this.chosen = item.place;
        this.depth = 2;
      }
      return false;
    }
    // The one action a place has today: be pointed at it. Jumping to a parked
    // car you own is #352's, and joins it here.
    if (!this.chosen) return false;
    // Through `aimAt`, which also works out the way there: an arrow across a
    // city with a river in it points at plenty of places you cannot reach
    // from where you are standing.
    world.aimAt(this.chosen);
    this.depth = 1;
    return true;
  }

  /** Left: back up a level, and from the top, close. */
  left(): void {
    if (!this.open) return;
    if (this.depth === 0) this.open = false;
    else this.depth = (this.depth - 1) as 0 | 1;
  }

  /** Up or down one row, stopping at the ends. */
  move(world: CityWorld, step: 1 | -1): void {
    if (!this.open) return;
    if (this.depth === 0) {
      const at = BRANCHES.indexOf(this.branch);
      this.branch = BRANCHES[Math.max(0, Math.min(BRANCHES.length - 1, at + step))];
    } else if (this.depth === 1) {
      const count = this.items(world).length;
      this.cursor = Math.max(0, Math.min(count - 1, this.cursor + step));
    }
  }

  /** Select row `index` of what is on screen, for a thumb (#89): cursor there, then right. */
  tap(world: CityWorld, index: number): boolean {
    const view = this.view(world);
    if (index < 0 || index >= view.rows.length) return false;
    const at = view.from + index;
    if (this.depth === 0) this.branch = BRANCHES[at];
    else if (this.depth === 1) this.cursor = at;
    return this.right(world);
  }

  /** What is on screen now. */
  view(world: CityWorld): MenuView {
    if (this.depth === 0) {
      return {
        path: [MENU_TITLE],
        rows: BRANCHES.map((branch) => ({ label: BRANCH_TITLES[branch], detail: '', available: true, opens: true })),
        cursor: BRANCHES.indexOf(this.branch),
        from: 0,
        total: BRANCHES.length,
      };
    }
    if (this.depth === 2 && this.chosen) {
      return {
        path: [MENU_TITLE, BRANCH_TITLES[this.branch], this.chosen.label],
        rows: [{ label: 'Set destination', detail: '', available: true, opens: true }],
        cursor: 0,
        from: 0,
        total: 1,
      };
    }
    const items = this.items(world);
    this.cursor = Math.max(0, Math.min(items.length - 1, this.cursor));
    // A window of nine that follows the cursor: nine rows is what can be read
    // at speed, and a list that silently stops at nine is how an event a
    // kilometre away once stopped existing (#214).
    const from = Math.max(0, Math.min(items.length - WHEEL_ENTRIES, this.cursor - Math.floor(WHEEL_ENTRIES / 2)));
    return {
      path: [MENU_TITLE, BRANCH_TITLES[this.branch]],
      rows: items.slice(from, from + WHEEL_ENTRIES),
      cursor: this.cursor - from,
      from,
      total: items.length,
    };
  }

  /** Every row of the current branch. */
  entries(world: CityWorld): WheelEntry[] {
    return this.items(world);
  }

  private items(world: CityWorld): Item[] {
    if (this.branch === 'mods') return this.parts(world);
    if (this.branch === 'cars') return this.garage(world);
    return this.destinations(world);
  }

  /** The cars you have, starter first. */
  private owned(world: CityWorld): CarProfile[] {
    return CARS.filter((car) => world.finds.owned.has(car.id));
  }

  private away(world: CityWorld, at: { x: number; z: number }): number {
    return Math.hypot(at.x - world.x, at.z - world.z);
  }

  private km(world: CityWorld, at: { x: number; z: number }): string {
    return `${Math.round(this.away(world, at) / METRE / 100) / 10} km`;
  }

  /**
   * CHANGE CAR: the cars you have, then the ones found parked and waiting to be
   * taken. The reference lists both under the one heading, and choosing a
   * parked one there is how you get to it.
   */
  private garage(world: CityWorld): Item[] {
    // Changing car mid-event would be swapping horses in the middle of a race,
    // which is not a menu decision, it is a cheat.
    const busy = world.race.state !== 'idle' || world.claim.state !== 'idle';
    const owned: Item[] = this.owned(world).map((car) => ({
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
      act: (w) => w.drive(car),
    }));
    const parked: Item[] = world.finds.waiting
      .map((find) => ({ x: find.at.x, z: find.at.z, label: `${carById(find.car).name}, parked` }))
      .sort((a, b) => this.away(world, a) - this.away(world, b))
      .map((place) => ({ label: place.label, detail: this.km(world, place), available: true, opens: true, place }));
    return [...owned, ...parked];
  }

  /**
   * What is bolted to the car you are in, and what could be.
   *
   * Nothing at all until it has earned something, and the empty state says how
   * to change that rather than just being empty.
   */
  private parts(world: CityWorld): Item[] {
    const owned = new Set(world.finds.unlocked(world.car.id).map((mod) => mod.id));
    const busy = world.race.state !== 'idle' || world.claim.state !== 'idle';

    // The *whole* catalogue, with what you have not earned greyed out rather
    // than absent (#222). Showing only what you own meant a player with two
    // parts saw two parts and had no way to learn that there were ten, what the
    // rest were, or how any of them are had - and every mod is a *trade* (#68),
    // which is the interesting half of the design and was invisible until you
    // happened to own one.
    let toGo = 0;
    return MODS.map((mod) => {
      const have = owned.has(mod.id);
      // Parts are earned in catalogue order (`Garage.earn`), so how far off one
      // is, is exactly how many unearned ones come before it. That makes "how
      // do I get this" answerable precisely rather than vaguely.
      if (!have) toGo++;
      const fitted = world.finds.isFitted(world.car.id, mod.id);
      return {
        label: mod.name,
        mark: have ? (fitted ? 'fitted' : undefined) : 'locked',
        // A locked row says how to get it and nothing else. Carrying the trade
        // as well ran the two texts into each other on the wider names, and a
        // line you cannot read is worse than a line that is not there - the
        // trade shows up the moment the part does.
        detail: have
          ? busy
            ? 'not during an event'
            : mod.detail
          : toGo === 1
            ? 'next: finish top two in this car'
            : `${toGo} more top-two finishes`,
        available: have && !busy,
        act: (w: CityWorld) => {
          w.finds.toggle(w.car.id, mod.id);
          // Re-applied straight away: a part you cannot feel until the next
          // time you get into the car is a menu, not a quick one.
          w.drive(w.car);
        },
      };
    });
  }

  /**
   * The places on the current branch. RACES is the start lines and the
   * ambushes; MOST WANTED is the next rival's line, or what stands between you
   * and it; PLACES is the workshops. Nearest first within a branch: it is used
   * at speed, and the thing you want is almost always the one you could still
   * get to.
   */
  private destinations(world: CityWorld): Item[] {
    const go = (place: Marker, detail: string): Item => ({
      label: place.label,
      detail: detail ? `${this.km(world, place)}  ·  ${detail}` : this.km(world, place),
      available: true,
      opens: true,
      place,
    });
    const near = (list: { place: Marker; detail: string }[]) =>
      list
        .sort((a, b) => this.away(world, a.place) - this.away(world, b.place))
        .map(({ place, detail }) => go(place, detail));

    if (this.branch === 'rival') {
      const rival = world.currentRival;
      const route = world.rivalRoute;
      if (!rival) return [{ label: 'Rivals cleared', detail: `${world.beaten} beaten`, available: false }];
      if (!route) {
        return [
          {
            label: `#${rival.rank} ${rival.name}`,
            detail: `${world.repToNext.toLocaleString('en-US')} more Rep`,
            available: false,
            mark: 'locked',
          },
        ];
      }
      return [
        go(
          { x: route.start.x, z: route.start.z, label: `#${rival.rank} ${rival.name}  ·  ${route.name}` },
          'race, then wreck',
        ),
      ];
    }

    if (this.branch === 'places') {
      return near(
        world.city.repairs.map((shop) => ({ place: { x: shop.at.x, z: shop.at.z, label: 'Repair shop' }, detail: '' })),
      );
    }

    return near([
      ...world.city.routes.map((route) => ({
        place: {
          x: route.start.x,
          z: route.start.z,
          label: `${route.name} (${route.kind === 'speedrun' ? 'speed run' : route.kind})`,
        },
        detail: `${difficultyLabel(routeDifficulty(route))}  ·  ${racePurse(routeDifficulty(route), route.kind)[0].toLocaleString('en-US')} REP`,
      })),
      ...world.city.ambushes.map((spot) => ({
        place: { x: spot.at.x, z: spot.at.z, label: `Ambush, heat ${spot.level}` },
        detail: '',
      })),
    ]);
  }
}
