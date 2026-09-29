import { describe, it, expect } from 'vitest';
import { QuickWheel, MENU_TITLE, type WheelBranch } from './quickwheel';
import { CityWorld } from './cityworld';
import { CARS, STARTER_CAR } from './cars';
import { FIND_RANGE, WHEEL_ENTRIES } from './constants';
import { RIVALS } from './rivals';
import { kestrelBay } from './city/index';

const world = () => new CityWorld(undefined, { traffic: false, police: false });

/** Open the menu and go into `branch`, the way a player does: right, down, right. */
function into(w: CityWorld, branch: WheelBranch): QuickWheel {
  const wheel = new QuickWheel();
  wheel.right(w);
  for (let i = 0; i < 5 && wheel.branch !== branch; i++) wheel.move(w, 1);
  expect(wheel.branch).toBe(branch);
  wheel.right(w);
  expect(wheel.depth).toBe(1);
  return wheel;
}

/** The rows that are cars you own, not ones found parked. */
const owned = (entries: { label: string }[]) => entries.filter((e) => !e.label.endsWith(', parked'));

describe('the Quick Menu', () => {
  // Like a D-pad (#420): right opens and goes deeper, left backs out and in
  // the end closes, up and down move.
  it('opens on right and closes on left from the top', () => {
    const w = world();
    const wheel = new QuickWheel();
    expect(wheel.open).toBe(false);
    wheel.right(w);
    expect(wheel.open).toBe(true);
    expect(wheel.view(w).path).toEqual([MENU_TITLE]);
    wheel.left();
    expect(wheel.open).toBe(false);
  });

  it('walks down a path and back up it', () => {
    const w = world();
    const wheel = into(w, 'places');
    expect(wheel.view(w).path).toEqual([MENU_TITLE, 'PLACES']);
    wheel.right(w);
    expect(wheel.depth).toBe(2);
    expect(wheel.view(w).rows[0].label).toBe('Set destination');
    wheel.left();
    wheel.left();
    expect(wheel.depth).toBe(0);
    expect(wheel.open).toBe(true);
  });

  it('lists the branches in the reference order, plus places', () => {
    const w = world();
    const wheel = new QuickWheel();
    wheel.right(w);
    expect(wheel.view(w).rows.map((r) => r.label)).toEqual([
      'RACES',
      'CUSTOMIZE CAR',
      'CHANGE CAR',
      'MOST WANTED',
      'PLACES',
    ]);
  });

  // It is the same object between openings, so it opens where it was left.
  it('reopens on the branch it was last on', () => {
    const w = world();
    const wheel = into(w, 'cars');
    wheel.left();
    wheel.left();
    expect(wheel.open).toBe(false);
    wheel.right(w);
    expect(wheel.depth).toBe(0);
    expect(wheel.branch).toBe('cars');
  });

  it('stops at the ends rather than wrapping', () => {
    const w = world();
    const wheel = new QuickWheel();
    wheel.right(w);
    wheel.move(w, -1);
    expect(wheel.branch).toBe('races');
    for (let i = 0; i < 10; i++) wheel.move(w, 1);
    expect(wheel.branch).toBe('places');
  });

  it('shows the cars you have, then the ones found parked', () => {
    const w = world();
    const wheel = into(w, 'cars');
    const rows = wheel.entries(w);
    expect(owned(rows).length).toBe(1);
    expect(rows[0].label).toBe(STARTER_CAR.name);
    const firstParked = rows.findIndex((e) => e.label.endsWith(', parked'));
    if (firstParked >= 0) expect(firstParked).toBeGreaterThanOrEqual(owned(rows).length);

    w.finds.claim('nightfall');
    expect(wheel.entries(w).map((e) => e.label)).toContain('Nightfall');
  });

  it('puts you in the one you select, with no stopping', () => {
    const w = world();
    w.finds.claim('nightfall');
    w.speed = w.maxSpeed * 0.5;
    const wheel = into(w, 'cars');
    const index = wheel.entries(w).findIndex((e) => e.label === 'Nightfall');
    for (let i = 0; i < index; i++) wheel.move(w, 1);

    expect(wheel.right(w)).toBe(true);
    expect(w.car.id).toBe('nightfall');
    expect(w.speed).toBeGreaterThan(0);
  });

  it('will not hand you the car you are already in', () => {
    const w = world();
    const wheel = into(w, 'cars');
    expect(wheel.entries(w)[0].available).toBe(false);
    expect(wheel.right(w)).toBe(false);
    expect(wheel.depth).toBe(1);
  });

  it.skipIf(kestrelBay().routes.length === 0)('will not change car during an event', () => {
    const w = world();
    w.finds.claim('nightfall');
    const route = w.city.routes[0];
    w.x = route.start.x;
    w.z = route.start.z;
    w.y = 0;
    w.step(1 / 60, { left: false, right: false, up: false, down: false, nitro: false, confirm: true });
    expect(w.race.state).toBe('countdown');

    const wheel = into(w, 'cars');
    const index = wheel.entries(w).findIndex((e) => e.label === 'Nightfall');
    expect(wheel.entries(w)[index].available).toBe(false);
  });

  it('lists the races, nearest first, each with its distance', () => {
    const w = world();
    const wheel = into(w, 'races');
    const entries = wheel.entries(w);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.available).toBe(true);
      expect(entry.detail).toMatch(/km/);
    }
    const km = entries.map((e) => parseFloat(e.detail));
    expect([...km].sort((a, b) => a - b)).toEqual(km);
  });

  // A marker and not a teleport: quick travel that moved the car would make
  // the pursuit a formality and the city a menu of places.
  it('points you at a place rather than putting you there', () => {
    const w = world();
    const wheel = into(w, 'races');
    const was = { x: w.x, z: w.z };
    wheel.right(w);
    expect(wheel.right(w)).toBe(true);
    expect(w.marker).not.toBeNull();
    expect(w.x).toBe(was.x);
    expect(w.z).toBe(was.z);
  });

  it('turns a part on with right, and shows it ticked', () => {
    const w = world();
    for (let i = 0; i < 2; i++) w.finds.earn(w.car.id);
    const wheel = into(w, 'mods');
    expect(wheel.entries(w)[0].mark).toBeUndefined();
    expect(wheel.right(w)).toBe(true);
    expect(wheel.entries(w)[0].mark).toBe('fitted');
    // Not earned yet: locked, and right does nothing.
    const locked = wheel.entries(w).findIndex((e) => e.mark === 'locked');
    for (let i = 0; i < locked; i++) wheel.move(w, 1);
    expect(wheel.right(w)).toBe(false);
  });

  /**
   * A long list (#214): nine rows on screen, but the list behind it is longer
   * and used to be cut off silently. The window follows the cursor now.
   */
  describe('a branch with more than nine things on it', () => {
    const full = () => {
      const w = world();
      for (const car of CARS) w.finds.claim(car.id);
      return { w, wheel: into(w, 'cars') };
    };

    it('shows nine, and says how many there are', () => {
      const { w, wheel } = full();
      expect(CARS.length).toBeGreaterThan(WHEEL_ENTRIES);
      const view = wheel.view(w);
      expect(view.rows.length).toBe(WHEEL_ENTRIES);
      expect(view.total).toBeGreaterThanOrEqual(CARS.length);
    });

    it('scrolls with the cursor, so the last one can be reached', () => {
      const { w, wheel } = full();
      for (let i = 0; i < CARS.length * 2; i++) wheel.move(w, 1);
      const view = wheel.view(w);
      expect(view.from + view.cursor).toBe(view.total - 1);
      expect(view.rows[view.cursor].label).toBe(wheel.entries(w)[view.total - 1].label);
    });

    it('selects what the cursor is on, not what was there on the first screen', () => {
      const { w, wheel } = full();
      for (let i = 0; i < 12; i++) wheel.move(w, 1);
      const view = wheel.view(w);
      const shown = view.rows[view.cursor];
      expect(wheel.right(w)).toBe(true);
      expect(w.car.name).toBe(shown.label);
    });
  });

  // MOST WANTED (#419): the next rival's line once they will race you, and
  // what stands in the way until then.
  describe('the most wanted branch', () => {
    it('says what Rep the next rival wants, and cannot be selected', () => {
      const w = world();
      const wheel = into(w, 'rival');
      const [entry] = wheel.entries(w);
      expect(entry.available).toBe(false);
      expect(entry.detail).toContain('Rep');
      expect(wheel.right(w)).toBe(false);
    });

    it('points you at their line once they will race you', () => {
      const w = world();
      w.rep.total = RIVALS[0].rep;
      const wheel = into(w, 'rival');
      wheel.right(w);
      expect(wheel.right(w)).toBe(true);
      expect(w.marker).not.toBeNull();
    });
  });

  it('is selected by a tap as well as by right (#89)', () => {
    const w = world();
    const wheel = new QuickWheel();
    wheel.right(w);
    expect(wheel.tap(w, 4)).toBe(false);
    expect(wheel.branch).toBe('places');
    expect(wheel.depth).toBe(1);
  });

  // Jump to a car found parked (#352): from free roam, never while wanted.
  describe('jumping to a parked car', () => {
    /** A world that has driven past one parked car, and the menu open on it. */
    const spottedOne = () => {
      const w = world();
      const find = w.finds.waiting[0];
      w.finds.seen.add(find.car);
      const wheel = into(w, 'cars');
      const index = wheel.entries(w).findIndex((e) => e.label.endsWith(', parked'));
      for (let i = 0; i < index; i++) wheel.move(w, 1);
      wheel.right(w);
      expect(wheel.depth).toBe(2);
      return { w, wheel, find };
    };

    it('lists only the parked cars you have driven past', () => {
      const w = world();
      const wheel = into(w, 'cars');
      expect(wheel.entries(w).some((e) => e.label.endsWith(', parked'))).toBe(false);
      w.finds.seen.add(w.finds.waiting[0].car);
      expect(wheel.entries(w).some((e) => e.label.endsWith(', parked'))).toBe(true);
    });

    it('puts you in the car, where it is parked', () => {
      const { w, wheel, find } = spottedOne();
      expect(wheel.view(w).rows.map((r) => r.label)).toEqual(['Jump to car', 'Set destination']);
      expect(wheel.right(w)).toBe(true);
      expect(wheel.open).toBe(false);
      expect(Math.hypot(w.x - find.at.x, w.z - find.at.z)).toBeLessThan(FIND_RANGE);
      w.step(1 / 60, { left: false, right: false, up: false, down: false, nitro: false, confirm: false });
      expect(w.car.id).toBe(find.car);
    });

    it('is refused while wanted, and says so', () => {
      const { w, wheel } = spottedOne();
      w.police.state = 'cooldown';
      const [jump] = wheel.view(w).rows;
      expect(jump.available).toBe(false);
      expect(jump.detail).toBe('not while wanted');
      const was = { x: w.x, z: w.z };
      expect(wheel.right(w)).toBe(false);
      expect(w.x).toBe(was.x);
      expect(w.z).toBe(was.z);
    });

    it('still sets a destination instead', () => {
      const { w, wheel } = spottedOne();
      wheel.move(w, 1);
      expect(wheel.right(w)).toBe(true);
      expect(w.marker).not.toBeNull();
    });
  });
});
