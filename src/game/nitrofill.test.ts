import { describe, it, expect } from 'vitest';
import { NitroCounters, leftOfCentre } from './nitrofill';
import { NITRO_COUNTER_HOLD } from './constants';

describe('which side of the road (#351)', () => {
  // A road running north (+z). Facing north, your right hand points at -x.
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 1000 };

  it('is the left, going the way the car is going', () => {
    expect(leftOfCentre(a, b, { x: 300, z: 500 }, 0)).toBeCloseTo(300);
    expect(leftOfCentre(a, b, { x: -300, z: 500 }, 0)).toBeCloseTo(-300);
  });

  it('turns round when the car does, since a road has no direction of its own', () => {
    expect(leftOfCentre(a, b, { x: 300, z: 500 }, Math.PI)).toBeCloseTo(-300);
    expect(leftOfCentre(b, a, { x: 300, z: 500 }, 0)).toBeCloseTo(300);
  });
});

describe('the refill counters', () => {
  it('runs one counter per source and clears it once that source goes quiet', () => {
    const counters = new NitroCounters();
    counters.add('oncoming', 0.5);
    counters.add('oncoming', 0.5);
    counters.add('nearMiss', 1);
    expect(counters.active.find((c) => c.source === 'oncoming')?.value).toBe(1);
    counters.step(NITRO_COUNTER_HOLD + 0.1);
    expect(counters.active).toEqual([]);
  });
});
