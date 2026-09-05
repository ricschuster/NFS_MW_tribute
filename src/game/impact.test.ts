import { describe, it, expect } from 'vitest';
import { impactDamage, touching } from './impact';
import {
  CAR_RADIUS,
  COP_UNITS,
  TAKEDOWN_KILL_CLOSING,
  TAKEDOWN_MIN_CLOSING,
  UNITS_PER_METRE,
} from './constants';
import type { GraphCar } from './graphcar';
import type { CityRoad } from './city/types';

const MAX = 12000;
const M = UNITS_PER_METRE;

/**
 * A car on the graph, without a graph. Nothing in the impact model reads the
 * road it is on, which is the point of keeping the model a pure function of
 * two positions and two velocities.
 */
function car(over: Partial<GraphCar> = {}): GraphCar {
  return {
    road: { length: 1000 } as CityRoad,
    t: 0.5,
    forward: true,
    speed: 0,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    damage: 0,
    ...over,
  };
}

/** The player, driving toward +z at `speed`. */
const rammer = (speed: number) => ({ x: 0, y: 0, z: 0, heading: 0, speed });

/** A car sitting `metres` straight ahead. */
const ahead = (metres: number, over: Partial<GraphCar> = {}) =>
  car({ z: metres * M, ...over });

describe('what counts as a hit', () => {
  it('is not a hit at all when the cars are apart', () => {
    expect(touching({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: CAR_RADIUS * 8 })).toBe(false);
  });

  it('is not a hit when one is on a deck above the other', () => {
    // The whole reason height is real (#85): a cop on the interstate and a car
    // in the street below share a map position and are nowhere near each other.
    expect(touching({ x: 0, y: 0, z: 0 }, { x: 0, y: 12 * M, z: 0 })).toBe(false);
  });
});

describe('how much a hit hurts', () => {
  it('wrecks a stopped car rammed square at the killing speed', () => {
    const damage = impactDamage(rammer(MAX * TAKEDOWN_KILL_CLOSING), ahead(3), MAX);
    expect(damage).toBeCloseTo(1, 2);
  });

  it('does nothing at all below the threshold', () => {
    const damage = impactDamage(rammer(MAX * TAKEDOWN_MIN_CLOSING * 0.9), ahead(3), MAX);
    expect(damage).toBe(0);
  });

  // This is the one that stops a pursuit being won by leaning on somebody: a
  // cop matched to your speed is touching you and doing nothing about it.
  it('does nothing when the two are not closing', () => {
    const matched = ahead(3, { speed: MAX * 0.5, heading: 0 });
    expect(impactDamage(rammer(MAX * 0.5), matched, MAX)).toBe(0);
  });

  it('does nothing when the other car is pulling away', () => {
    const leaving = ahead(3, { speed: MAX * 0.7, heading: 0 });
    expect(impactDamage(rammer(MAX * 0.4), leaving, MAX)).toBe(0);
  });

  it('counts the closing speed, not the speedometer: head on hurts more', () => {
    const oncoming = ahead(3, { speed: MAX * 0.2, heading: Math.PI });
    const stopped = ahead(3);
    expect(impactDamage(rammer(MAX * 0.2), oncoming, MAX)).toBeGreaterThan(
      impactDamage(rammer(MAX * 0.2), stopped, MAX),
    );
  });

  it('barely scratches on a parallel graze', () => {
    // Alongside rather than ahead: the line between the cars is across the
    // direction of travel, so almost none of the hit lands.
    const beside = car({ x: 3 * M });
    expect(impactDamage(rammer(MAX * 0.6), beside, MAX)).toBeLessThan(0.05);
  });

  it('lands harder the squarer it is', () => {
    const square = ahead(3);
    const angled = car({ x: 2 * M, z: 2 * M });
    expect(impactDamage(rammer(MAX * 0.3), square, MAX)).toBeGreaterThan(
      impactDamage(rammer(MAX * 0.3), angled, MAX),
    );
  });

  it('takes more to put a heavy unit out than a cruiser', () => {
    const hit = MAX * 0.3;
    const light = impactDamage(rammer(hit), ahead(3), MAX, null, COP_UNITS.cruiser.scale);
    const heavy = impactDamage(rammer(hit), ahead(3), MAX, null, COP_UNITS.suv.scale);
    expect(heavy).toBeLessThan(light);
    expect(heavy).toBeGreaterThan(0);
  });
});
