import { describe, it, expect } from 'vitest';
import { loadProgress, saveProgress } from './progress';

// The test environment has no localStorage, which exercises the safe fallbacks.
describe('progress persistence', () => {
  it('returns a fresh start when storage is unavailable', () => {
    expect(loadProgress()).toEqual({ beaten: 0, rep: 0, smashed: [], clocked: [] });
  });

  it('saving is a safe no-op without storage', () => {
    expect(() =>
      saveProgress({ beaten: 3, rep: 1200, smashed: [1, 2], clocked: [[4, 0.8]] }),
    ).not.toThrow();
  });
});
