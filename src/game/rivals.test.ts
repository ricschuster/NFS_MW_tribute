import { describe, it, expect } from 'vitest';
import { RIVALS } from './rivals';
import { RIVAL_BASE_SPEED_FRAC, RIVAL_DIFF_SPEED_FRAC } from './constants';

describe('RIVALS', () => {
  it('has 15 rivals ranked 15 down to 1', () => {
    expect(RIVALS.length).toBe(15);
    expect(RIVALS.map((r) => r.rank)).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('grows harder toward the boss', () => {
    for (let i = 1; i < RIVALS.length; i++) {
      expect(RIVALS[i].difficulty).toBeGreaterThan(RIVALS[i - 1].difficulty);
    }
  });

  it('keeps every rival beatable (race speed below the player max)', () => {
    for (const rival of RIVALS) {
      const speedFrac = RIVAL_BASE_SPEED_FRAC + rival.difficulty * RIVAL_DIFF_SPEED_FRAC;
      expect(speedFrac).toBeLessThan(1);
    }
  });
});
