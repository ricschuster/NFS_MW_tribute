import { describe, it, expect } from 'vitest';
import {
  limit,
  accelerate,
  interpolate,
  easeIn,
  easeInOut,
  exponentialFog,
  increase,
  percentRemaining,
} from './math';

describe('limit', () => {
  it('clamps to the range', () => {
    expect(limit(5, 0, 10)).toBe(5);
    expect(limit(-3, 0, 10)).toBe(0);
    expect(limit(42, 0, 10)).toBe(10);
  });
});

describe('accelerate', () => {
  it('applies acceleration over dt', () => {
    expect(accelerate(10, 4, 0.5)).toBe(12);
    expect(accelerate(10, -20, 0.5)).toBe(0);
  });
});

describe('interpolate', () => {
  it('is linear between endpoints', () => {
    expect(interpolate(0, 10, 0)).toBe(0);
    expect(interpolate(0, 10, 0.5)).toBe(5);
    expect(interpolate(0, 10, 1)).toBe(10);
  });
});

describe('easing', () => {
  it('hits both endpoints', () => {
    expect(easeIn(0, 10, 0)).toBe(0);
    expect(easeIn(0, 10, 1)).toBe(10);
    expect(easeInOut(0, 10, 0)).toBeCloseTo(0);
    expect(easeInOut(0, 10, 1)).toBeCloseTo(10);
  });

  it('easeIn starts slow (below linear in the first half)', () => {
    expect(easeIn(0, 10, 0.5)).toBeLessThan(5);
  });

  it('easeInOut is symmetric about the midpoint', () => {
    expect(easeInOut(0, 10, 0.5)).toBeCloseTo(5);
  });
});

describe('exponentialFog', () => {
  it('is fully visible at zero distance', () => {
    expect(exponentialFog(0, 5)).toBe(1);
  });

  it('decreases monotonically with distance', () => {
    expect(exponentialFog(1, 5)).toBeLessThan(exponentialFog(0.5, 5));
  });
});

describe('increase', () => {
  it('advances within the range', () => {
    expect(increase(0, 5, 10)).toBe(5);
  });

  it('wraps past the maximum', () => {
    expect(increase(8, 5, 10)).toBe(3);
  });

  it('wraps below zero', () => {
    expect(increase(0, -1, 10)).toBe(9);
  });
});

describe('percentRemaining', () => {
  it('returns the fractional progress through a span', () => {
    expect(percentRemaining(0, 200)).toBe(0);
    expect(percentRemaining(250, 200)).toBeCloseTo(0.25);
  });
});
