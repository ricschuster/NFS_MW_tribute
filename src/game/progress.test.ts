import { describe, it, expect } from 'vitest';
import { loadProgress, saveProgress } from './progress';

// The test environment has no localStorage, which exercises the safe fallbacks.
describe('progress persistence', () => {
  it('returns a fresh start when storage is unavailable', () => {
    expect(loadProgress()).toEqual({ beaten: 0 });
  });

  it('saving is a safe no-op without storage', () => {
    expect(() => saveProgress({ beaten: 3 })).not.toThrow();
  });
});
