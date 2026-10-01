import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from '../constants';
import { yardAprons } from './yards';

const M = UNITS_PER_METRE;

describe('yards drawn in an area editor (#489)', () => {
  it('are paved ground closed to traffic, in world units', () => {
    const [yard] = yardAprons([
      [
        [0, 0],
        [100, 0],
        [100, 50],
      ],
    ]);
    expect(yard.yard).toBe(true);
    expect(yard.look).toBe('concrete');
    expect(yard.outline[1]).toEqual({ x: 100 * M, z: 0 });
    expect(yard.margin).toBeGreaterThan(0);
  });

  it('leave out an outline too short to enclose anything', () => {
    expect(
      yardAprons([
        [
          [0, 0],
          [10, 0],
        ],
      ]),
    ).toEqual([]);
  });
});
