import { describe, it, expect } from 'vitest';
import { daylightAt, clockFace } from './daylight';
import { hourly } from '../citytraffic';

/**
 * The look of a time of day (#180).
 *
 * Testable because it is a pure function of the clock, which is the reason it
 * is a module rather than eight lines inside `cityview`: a palette buried in a
 * renderer can only be checked by looking at it, and looking at it only tells
 * you about the hour you happened to render.
 */
describe('the light through the day', () => {
  // The sun does the separating, not the fill. Night is *moonlit*: the fill
  // stays high on purpose, because the first version dropped it and the
  // screenshot was a black rectangle with two tail lights in it.
  it('is brightest in the middle of the day and darkest in the middle of the night', () => {
    const noon = daylightAt(13);
    const night = daylightAt(2);
    expect(noon.sunStrength).toBeGreaterThan(night.sunStrength * 3);
    expect(night.fillStrength).toBeGreaterThan(1);
  });

  it('turns the lamps on after dark and off by day', () => {
    expect(daylightAt(2).lamps).toBe(1);
    expect(daylightAt(13).lamps).toBe(0);
    expect(daylightAt(10).lamps).toBe(0);
    // Dusk is on the way, not there yet.
    const dusk = daylightAt(19);
    expect(dusk.lamps).toBeGreaterThan(0);
    expect(dusk.lamps).toBeLessThan(1);
  });

  // Midnight is the same moment approached from either side. Keying a table at
  // 0 and at 24 and forgetting to make them match is a seam you would only
  // ever find by driving past it at the wrong minute.
  it('joins up at midnight', () => {
    const before = daylightAt(23.99);
    const after = daylightAt(0.01);
    expect(before.sunStrength).toBeCloseTo(after.sunStrength, 1);
    expect(before.haze).toBe(after.haze);
  });

  it('wraps rather than falling off either end', () => {
    expect(daylightAt(25).haze).toBe(daylightAt(1).haze);
    expect(daylightAt(-1).haze).toBe(daylightAt(23).haze);
  });

  it('never leaves the sun below the horizon, however dark it is', () => {
    for (let h = 0; h < 24; h += 0.5) {
      expect(daylightAt(h).sunHeight).toBeGreaterThan(0);
      expect(daylightAt(h).sunStrength).toBeGreaterThan(0);
    }
  });

  it('reads the clock back as a clock', () => {
    expect(clockFace(0)).toBe('00:00');
    expect(clockFace(13.5)).toBe('13:30');
    expect(clockFace(23.99)).toBe('23:59');
    expect(clockFace(25)).toBe('01:00');
  });
});

describe('how busy the day is', () => {
  it('has two peaks and a trough', () => {
    expect(hourly(8)).toBeGreaterThan(hourly(12));
    expect(hourly(17)).toBeGreaterThan(hourly(12));
    expect(hourly(3)).toBeLessThan(hourly(12) / 3);
  });

  it('joins up at midnight and wraps', () => {
    expect(hourly(23.99)).toBeCloseTo(hourly(0.01), 2);
    expect(hourly(25)).toBeCloseTo(hourly(1), 6);
  });

  it('never empties the city completely', () => {
    for (let h = 0; h < 24; h += 0.5) expect(hourly(h)).toBeGreaterThan(0.1);
  });
});
