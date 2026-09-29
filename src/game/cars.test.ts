import { describe, it, expect } from 'vitest';
import { CARS, STARTER_CAR, carById, colourName } from './cars';
import { kestrelBay } from './city/index';
import { NITRO_SPEED_MULT, FIND_SPACING, CITY_STREET_GRID, FIND_KERB_GAP, UNITS_PER_METRE } from './constants';
import { distanceToRoad } from './city/grid';

const M = UNITS_PER_METRE;

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

    // Quick off the line and short of breath at the top, against a heavy
    // 4x4 with a big engine (#434): the same trade from the other end.
    const current = carById('current');
    const trailbreaker = carById('trailbreaker');
    expect(current.accel).toBeGreaterThan(trailbreaker.accel);
    expect(trailbreaker.topSpeed).toBeGreaterThan(current.topSpeed);
  });

  it('falls back to the starter for an id it does not know', () => {
    expect(carById('a car that does not exist')).toBe(STARTER_CAR);
    expect(carById('nightjar').name).toBe('Nightjar');
  });
});

describe('where they are parked', () => {
  const city = kestrelBay();

  // Every one of them, now that a car with no lot to go to is parked at the
  // kerb instead (#434): it used to wait on a street grid that is off.
  it('parks every car that is meant to be found, and no others', () => {
    const street = CARS.filter((car) => car.source === 'street');
    expect(city.finds.length).toBe(street.length);
    expect(city.finds.some((f) => f.car === STARTER_CAR.id)).toBe(false);
    expect(new Set(city.finds.map((f) => f.car)).size).toBe(city.finds.length);
    // The ladder's cars are taken off the rival driving them (#66); one left
    // in a lot would be one given away.
    for (const find of city.finds) {
      expect(carById(find.car).source).toBe('street');
    }
  });

  // Ashford Point (#268) is the only district with real blocks today, so
  // every open non-park lot the whole map has to offer comes from one small
  // area rather than being spread citywide - the premise this test checks.
  // Two stray empty house lots a few driveways apart on the same island are
  // never going to be 900 m apart, whatever the seed rolls; that is a
  // property of only one district being built yet, not of the spacing
  // itself. Meaningful again once a second district has real lots of its
  // own to draw from.
  it.skipIf(!CITY_STREET_GRID)('spreads them out, so finding one is a drive', () => {
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
  // The further out, the better (#434): the worst parked car is nearer the
  // start than the best one, taking the roster's own order as better.
  it('parks the better cars further from the start', () => {
    const airfield = { x: -1269 * M, z: 2012 * M };
    const away = (id: string) => {
      const find = city.finds.find((f) => f.car === id)!;
      return Math.hypot(find.at.x - airfield.x, find.at.z - airfield.z);
    };
    const street = CARS.filter((car) => car.source === 'street');
    expect(away(street[0].id)).toBeLessThan(away(street[street.length - 1].id));
    const half = Math.floor(street.length / 2);
    const mean = (cars: typeof street) => cars.reduce((sum, car) => sum + away(car.id), 0) / cars.length;
    expect(mean(street.slice(0, half))).toBeLessThan(mean(street.slice(half)));
  });

  // In a lot, or on the verge beside a road (#434): never on the carriageway.
  it('parks them on open ground rather than in the road', () => {
    for (const find of city.finds) {
      const road = city.roads.reduce(
        (best, r) => Math.min(best, distanceToRoad(city, r, find.at.x, find.at.z) - r.width / 2),
        Infinity,
      );
      if (road > 0 && road <= FIND_KERB_GAP + M) continue;
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

// #339: dispatch describes a car the way a witness would.
describe('colour names', () => {
  it('calls each car in the roster what a person would', () => {
    const named = Object.fromEntries(CARS.map((car) => [car.id, colourName(car.colour)]));
    expect(named.kestrel).toBe('red');
    for (const car of CARS) {
      expect(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white', 'silver', 'grey', 'black']).toContain(
        colourName(car.colour),
      );
    }
    expect(colourName('#1d2028')).toBe('black');
    expect(colourName('#e8e2d2')).toBe('white');
    expect(colourName('#3a8fd8')).toBe('blue');
    expect(colourName('#c93a5a')).toBe('pink');
    expect(colourName('#d8663a')).toBe('orange');
  });
});
