import { describe, it, expect } from 'vitest';
import { BLACKLIST } from './blacklist';
import { RIVAL_BASE_SPEED_FRAC, RIVAL_DIFF_SPEED_FRAC } from './constants';

describe('BLACKLIST', () => {
  it('has 15 rivals ranked 15 down to 1', () => {
    expect(BLACKLIST.length).toBe(15);
    expect(BLACKLIST.map((r) => r.rank)).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('grows harder toward the boss', () => {
    for (let i = 1; i < BLACKLIST.length; i++) {
      expect(BLACKLIST[i].difficulty).toBeGreaterThan(BLACKLIST[i - 1].difficulty);
    }
  });

  it('keeps every rival beatable (race speed below the player max)', () => {
    for (const rival of BLACKLIST) {
      const speedFrac = RIVAL_BASE_SPEED_FRAC + rival.difficulty * RIVAL_DIFF_SPEED_FRAC;
      expect(speedFrac).toBeLessThan(1);
    }
  });
});
