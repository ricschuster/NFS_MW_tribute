import { describe, expect, it } from 'vitest';
import { DRIVERS, driverNamed, faults } from './citydriver.mjs';

// The reference driver's skill model (#545, #549). `citylap` measures the
// perfect driver and treats it as the road's own limit, so every fault has to
// be exactly nothing at full skill; and the tiers in `drivers` only mean
// something if each fault grows as skill falls.
describe('the reference driver faults', () => {
  it('are nothing at all for the perfect driver', () => {
    const f = faults(1);
    expect(f.reaction).toBe(0);
    expect(f.wander).toBe(0);
    expect(f.misjudge).toBe(0);
    expect(f.lookahead).toBe(1);
    expect(f.pace).toBe(1);
    expect(f.caution).toBe(1);
    expect(f.lapseEvery).toBe(Infinity);
  });

  it('get worse, every one of them, as skill falls', () => {
    const tiers = [...DRIVERS].sort((a, b) => b.skill - a.skill).map((d) => faults(d.skill));
    for (let i = 1; i < tiers.length; i++) {
      const better = tiers[i - 1];
      const worse = tiers[i];
      expect(worse.reaction).toBeGreaterThan(better.reaction);
      expect(worse.wander).toBeGreaterThan(better.wander);
      expect(worse.misjudge).toBeGreaterThan(better.misjudge);
      expect(worse.lookahead).toBeLessThan(better.lookahead);
      expect(worse.pace).toBeLessThan(better.pace);
      expect(worse.caution).toBeGreaterThan(better.caution);
      expect(worse.lapseEvery).toBeLessThan(better.lapseEvery);
    }
  });

  it('are clamped outside the range a skill can mean', () => {
    expect(faults(1.5)).toEqual(faults(1));
    expect(faults(-1)).toEqual(faults(0));
  });

  it('name the four tiers', () => {
    expect(DRIVERS.map((d) => d.name)).toEqual(['beginner', 'advanced', 'expert', 'perfect']);
    expect(driverNamed('Expert')).toBe(DRIVERS[2]);
  });
});
