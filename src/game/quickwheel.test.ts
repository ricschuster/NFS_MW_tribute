import { describe, it, expect } from 'vitest';
import { QuickWheel } from './quickwheel';
import { CityWorld } from './cityworld';
import { CARS, STARTER_CAR } from './cars';
import { WHEEL_ENTRIES } from './constants';

const world = () => new CityWorld(undefined, { traffic: false, police: false });

describe('the Quick Wheel', () => {
  it('starts shut, on the garage', () => {
    const wheel = new QuickWheel();
    expect(wheel.open).toBe(false);
    expect(wheel.branch).toBe('cars');
  });

  it('cycles round its branches', () => {
    const wheel = new QuickWheel();
    wheel.cycle();
    expect(wheel.branch).toBe('goto');
    wheel.cycle();
    expect(wheel.branch).toBe('cars');
  });

  it('shows only the cars you have', () => {
    const w = world();
    const wheel = new QuickWheel();
    expect(wheel.entries(w).length).toBe(1);
    expect(wheel.entries(w)[0].label).toBe(STARTER_CAR.name);

    w.finds.claim('nightfall');
    expect(wheel.entries(w).map((e) => e.label)).toContain('Nightfall');
  });

  it('puts you in the one you pick, with no stopping', () => {
    const w = world();
    w.finds.claim('nightfall');
    w.speed = w.maxSpeed * 0.5;
    const wheel = new QuickWheel();
    const index = wheel.entries(w).findIndex((e) => e.label === 'Nightfall');

    expect(wheel.choose(w, index)).toBe(true);
    expect(w.car.id).toBe('nightfall');
    expect(w.maxSpeed).toBeGreaterThan(0);
    expect(w.speed).toBeGreaterThan(0);
  });

  it('will not hand you the car you are already in', () => {
    const w = world();
    const wheel = new QuickWheel();
    expect(wheel.entries(w)[0].available).toBe(false);
    expect(wheel.choose(w, 0)).toBe(false);
  });

  // Swapping cars in the middle of a race is not a menu decision, it is a
  // cheat.
  it('will not change car during an event', () => {
    const w = world();
    w.finds.claim('nightfall');
    const route = w.city.routes[0];
    w.x = route.start.x;
    w.z = route.start.z;
    w.y = 0;
    w.step(1 / 60, { left: false, right: false, up: false, down: false, nitro: false, confirm: true });
    expect(w.race.state).toBe('countdown');

    const wheel = new QuickWheel();
    const index = wheel.entries(w).findIndex((e) => e.label === 'Nightfall');
    expect(wheel.entries(w)[index].available).toBe(false);
    expect(wheel.choose(w, index)).toBe(false);
    expect(w.car).toBe(STARTER_CAR);
  });

  it('lists somewhere to go, nearest first, and never more than fits', () => {
    const w = world();
    const wheel = new QuickWheel();
    wheel.cycle();

    const entries = wheel.entries(w);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(WHEEL_ENTRIES);
    for (const entry of entries) expect(entry.available).toBe(true);
  });

  // A marker and not a teleport: quick travel that moved the car would make
  // the pursuit a formality and the city a menu of places.
  it('points you at a place rather than putting you there', () => {
    const w = world();
    const wheel = new QuickWheel();
    wheel.cycle();
    const was = { x: w.x, z: w.z };

    expect(wheel.choose(w, 0)).toBe(true);
    expect(w.marker).not.toBeNull();
    expect(w.x).toBe(was.x);
    expect(w.z).toBe(was.z);
  });

  it('ignores a number nothing is under', () => {
    const w = world();
    const wheel = new QuickWheel();
    expect(wheel.choose(w, 8)).toBe(false);
  });

  it('offers the whole garage once the whole garage is yours', () => {
    const w = world();
    for (const car of CARS) w.finds.claim(car.id);
    const wheel = new QuickWheel();
    // Nine at most on screen, however many are owned: eighteen cars will not
    // fit on a panel you are reading at two hundred kilometres an hour.
    expect(CARS.length).toBeGreaterThan(WHEEL_ENTRIES);
    expect(wheel.entries(w).length).toBe(WHEEL_ENTRIES);
  });
});
