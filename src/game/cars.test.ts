import { describe, it, expect } from 'vitest';
import { CARS, STARTER_CAR, carById } from './cars';
import { kestrelBay } from './city/index';
import { NITRO_SPEED_MULT, FIND_SPACING } from './constants';

describe('the roster', () => {
  it('gives every car a unique id', () => {
    expect(new Set(CARS.map((c) => c.id)).size).toBe(CARS.length);
  });

  // Every figure is a multiplier on the reference car, and the reference car
  // is the one the feel work was done against. If the starter drifts off 1 the
  // baseline stops meaning anything.
  it('keeps the starter as the reference on every axis', () => {
    expect(STARTER_CAR).toBe(CARS[0]);
    expect(STARTER_CAR.topSpeed).toBe(1);
    expect(STARTER_CAR.accel).toBe(1);
    expect(STARTER_CAR.grip).toBe(1);
    expect(STARTER_CAR.nitro).toBe(1);
  });

  it('keeps every car inside a range the rest of the game was tuned for', () => {
    for (const car of CARS) {
      expect(car.topSpeed).toBeGreaterThan(0.8);
      expect(car.topSpeed).toBeLessThan(1.25);
      expect(car.accel).toBeGreaterThan(0.7);
      expect(car.grip).toBeGreaterThan(0.7);
      // Boost has to stay under twice the top speed however good the car is,
      // or it crosses more ground in a step than anything can react to.
      expect(1 + (NITRO_SPEED_MULT - 1) * car.nitro).toBeLessThan(2);
    }
  });

  // A roster where every car is a strict upgrade on the last is a roster with
  // one car in it and seven waiting rooms. The trade has to be real.
  it('trades top speed against grip rather than stacking both', () => {
    const kite = carById('kite');
    const ridgeback = carById('ridgeback');
    expect(ridgeback.topSpeed).toBeGreaterThan(kite.topSpeed);
    expect(ridgeback.grip).toBeLessThan(kite.grip);

    const sable = carById('sable');
    const halcyon = carById('halcyon');
    expect(halcyon.accel).toBeGreaterThan(sable.accel);
    expect(sable.grip).toBeGreaterThan(halcyon.grip);
  });

  it('falls back to the starter for an id it does not know', () => {
    expect(carById('a car that does not exist')).toBe(STARTER_CAR);
    expect(carById('nightjar').name).toBe('Nightjar');
  });
});

describe('where they are parked', () => {
  const city = kestrelBay();

  it('parks every car but the one you start in', () => {
    expect(city.finds.length).toBe(CARS.length - 1);
    expect(city.finds.some((f) => f.car === STARTER_CAR.id)).toBe(false);
    expect(new Set(city.finds.map((f) => f.car)).size).toBe(city.finds.length);
  });

  it('spreads them out, so finding one is a drive', () => {
    for (let i = 0; i < city.finds.length; i++) {
      for (let j = i + 1; j < city.finds.length; j++) {
        const gap = Math.hypot(
          city.finds[i].at.x - city.finds[j].at.x,
          city.finds[i].at.z - city.finds[j].at.z,
        );
        expect(gap).toBeGreaterThanOrEqual(FIND_SPACING - 1);
      }
    }
  });

  // A car parked in a live carriageway is a car the traffic drives through.
  it('parks them on open ground rather than in the road', () => {
    for (const find of city.finds) {
      const lot = city.blocks.find(
        (block) =>
          block.open &&
          find.at.x >= block.bounds.minX &&
          find.at.x <= block.bounds.maxX &&
          find.at.z >= block.bounds.minZ &&
          find.at.z <= block.bounds.maxZ,
      );
      expect(lot).toBeDefined();
    }
  });
});
