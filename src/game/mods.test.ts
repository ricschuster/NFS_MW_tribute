import { describe, it, expect } from 'vitest';
import { MODS, effectOf, modById, type ModSlot } from './mods';
import { Garage } from './garage';
import { kestrelBay } from './city/index';
import { WHEEL_ENTRIES, SHRED_REINFLATE } from './constants';

const city = kestrelBay();

describe('the parts catalogue', () => {
  it('gives every part a unique id and a slot', () => {
    expect(new Set(MODS.map((m) => m.id)).size).toBe(MODS.length);
    for (const mod of MODS) {
      expect(['engine', 'tyres', 'gearing', 'aero']).toContain(mod.slot);
      expect(mod.detail.length).toBeGreaterThan(0);
    }
  });

  it('fits on a wheel you read while driving', () => {
    expect(MODS.length).toBeLessThanOrEqual(WHEEL_ENTRIES);
  });

  it('fills every slot at least twice, so a slot is a choice', () => {
    const slots: ModSlot[] = ['engine', 'tyres', 'gearing', 'aero'];
    for (const slot of slots) {
      expect(MODS.filter((m) => m.slot === slot).length).toBeGreaterThanOrEqual(2);
    }
  });

  // The difference between tuning and a stat boost. A part that is better at
  // everything is not a decision, it is an upgrade with a menu in front of it.
  it('makes the strong parts cost something', () => {
    for (const mod of MODS) {
      const gains = [mod.topSpeed, mod.accel, mod.grip, mod.nitro].filter(
        (v) => v !== undefined && v > 1,
      ).length;
      const losses = [mod.topSpeed, mod.accel, mod.grip, mod.nitro].filter(
        (v) => v !== undefined && v < 1,
      ).length;
      // Two gains or more has to be paid for somewhere - unless it is the
      // first part in its slot, which is deliberately a plain improvement.
      if (gains >= 2 && !mod.reinflating) expect(losses).toBeGreaterThan(0);
    }
  });

  it('multiplies what is fitted, and ignores what is not real', () => {
    const both = effectOf(['block', 'short-gears']);
    expect(both.accel).toBeCloseTo(1.08 * 1.14, 5);
    expect(both.topSpeed).toBeCloseTo(0.96, 5);
    expect(effectOf(['not-a-part']).accel).toBe(1);
    expect(effectOf([]).grip).toBe(1);
  });

  it('has exactly one part that argues with the police', () => {
    const spikes = MODS.filter((m) => m.reinflating);
    expect(spikes.length).toBe(1);
    expect(effectOf([spikes[0].id]).reinflating).toBe(true);
    // And it has to be worth fitting: a counter that only halves the penalty
    // would not change the decision it exists to change.
    expect(SHRED_REINFLATE).toBeLessThan(0.3);
  });
});

describe('earning and fitting them', () => {
  const garage = () => new Garage(city);

  it('starts with nothing on anything', () => {
    expect(garage().unlocked('kestrel').length).toBe(0);
  });

  it('hands them out in order, one per good result', () => {
    const g = garage();
    expect(g.earn('kestrel')?.id).toBe(MODS[0].id);
    expect(g.earn('kestrel')?.id).toBe(MODS[1].id);
    expect(g.unlocked('kestrel').length).toBe(2);
  });

  it('runs out rather than looping', () => {
    const g = garage();
    for (const _ of MODS) g.earn('kestrel');
    expect(g.earn('kestrel')).toBeNull();
    expect(g.unlocked('kestrel').length).toBe(MODS.length);
  });

  // Parts belong to the car that earned them. Winning in the Kestrel does not
  // put a turbo in the Nightfall.
  it('keeps them on the car that earned them', () => {
    const g = garage();
    g.earn('kestrel');
    expect(g.unlocked('kestrel').length).toBe(1);
    expect(g.unlocked('nightfall').length).toBe(0);
  });

  it('will not fit a part the car has not earned', () => {
    const g = garage();
    expect(g.toggle('kestrel', 'block')).toBe(false);
    expect(g.isFitted('kestrel', 'block')).toBe(false);
  });

  it('fits and unfits', () => {
    const g = garage();
    g.earn('kestrel');
    expect(g.toggle('kestrel', 'block')).toBe(true);
    expect(g.isFitted('kestrel', 'block')).toBe(true);
    g.toggle('kestrel', 'block');
    expect(g.isFitted('kestrel', 'block')).toBe(false);
  });

  // A car with two sets of tyres on it is not a car.
  it('allows one part per slot', () => {
    const g = garage();
    for (const _ of MODS) g.earn('kestrel');
    g.toggle('kestrel', 'track-tyres');
    g.toggle('kestrel', 'reinflatables');

    expect(g.isFitted('kestrel', 'reinflatables')).toBe(true);
    expect(g.isFitted('kestrel', 'track-tyres')).toBe(false);
    // ...and a part in a different slot is untouched by it.
    g.toggle('kestrel', 'block');
    expect(g.isFitted('kestrel', 'block')).toBe(true);
    expect(g.isFitted('kestrel', 'reinflatables')).toBe(true);
  });

  it('reports what is fitted as one multiplier per axis', () => {
    const g = garage();
    g.earn('kestrel');
    g.toggle('kestrel', 'block');
    expect(g.effect('kestrel').accel).toBeCloseTo(modById('block')!.accel!, 5);
    expect(g.effect('nightfall').accel).toBe(1);
  });

  it('saves and restores what is earned and what is on', () => {
    const g = garage();
    g.earn('kestrel');
    g.toggle('kestrel', 'block');

    const back = garage();
    back.loadParts(g.partsSave, g.fittedSave);
    expect(back.unlocked('kestrel').length).toBe(1);
    expect(back.isFitted('kestrel', 'block')).toBe(true);
  });

  // A save claiming a part the car never won has been edited, not earned.
  it('refuses to fit a part a restored save never earned', () => {
    const g = garage();
    g.loadParts([['kestrel', []]], [['kestrel', ['turbo']]]);
    expect(g.isFitted('kestrel', 'turbo')).toBe(false);
  });
});
