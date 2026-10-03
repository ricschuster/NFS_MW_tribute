import { describe, it, expect } from 'vitest';
import { LampWires, wirePairs } from './wires';
import { LAMP_SPACING } from '../constants';
import type { StreetProp } from '../city/types';

const lamp = (x: number, z: number, over: Partial<StreetProp> = {}): StreetProp => ({
  at: { x, z },
  y: 0,
  angle: 0,
  reach: 1,
  kind: 'lamp',
  variant: 0,
  ...over,
});

describe('lamp wires', () => {
  // angle 0 means the road runs along +z.
  it('joins each lamp to the next along the road, once', () => {
    const s = LAMP_SPACING;
    const pairs = wirePairs([lamp(0, 0), lamp(0, s), lamp(0, 2 * s)]);
    expect(pairs).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('does not string a wire across the road or between sides', () => {
    const s = LAMP_SPACING;
    expect(wirePairs([lamp(0, 0), lamp(s, 0)])).toEqual([]);
    expect(wirePairs([lamp(0, 0), lamp(0, s, { reach: -1 })])).toEqual([]);
  });

  it('does not join lamps on different roads', () => {
    expect(wirePairs([lamp(0, 0), lamp(0, LAMP_SPACING, { angle: Math.PI / 2 })])).toEqual([]);
  });

  it('draws two sagging conductors per span', () => {
    const wires = new LampWires([lamp(0, 0), lamp(0, LAMP_SPACING)]);
    const p = wires.lines.geometry.attributes.position;
    expect(p.count).toBe(2 * 6 * 2);
    // The middle of a span hangs below its ends.
    const ends = p.getY(0);
    let lowest = ends;
    for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, p.getY(i));
    expect(lowest).toBeLessThan(ends);
    wires.dispose();
  });
});
