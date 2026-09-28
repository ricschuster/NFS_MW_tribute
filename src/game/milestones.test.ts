import { describe, it, expect } from 'vitest';
import { MILESTONES, newlyReached, type MilestoneStats } from './milestones';
import { CARS, STARTER_CAR } from './cars';

const none: MilestoneStats = { cameras: 0, billboards: 0, gates: 0, escapes: 0, beaten: 0, driven: new Set() };

describe('the milestones (#353)', () => {
  it('has stable, distinct ids, since a save records them', () => {
    const ids = MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reaches nothing for a player who has done nothing', () => {
    expect(newlyReached(none, new Set())).toEqual([]);
  });

  it('reaches a threshold on the count that crosses it, and not before', () => {
    expect(newlyReached({ ...none, cameras: 9 }, new Set()).map((m) => m.id)).toEqual(['camera-1']);
    expect(newlyReached({ ...none, cameras: 10 }, new Set(['camera-1'])).map((m) => m.id)).toEqual(['camera-10']);
  });

  it('never reaches one twice', () => {
    const done = new Set(MILESTONES.map((m) => m.id));
    expect(newlyReached({ ...none, cameras: 99, billboards: 99, gates: 99, escapes: 9, beaten: 9 }, done)).toEqual([]);
  });

  it('marks driving every car but the one you start in', () => {
    for (const car of CARS) {
      const hit = newlyReached({ ...none, driven: new Set([car.id]) }, new Set()).map((m) => m.id);
      expect(hit).toEqual(car.id === STARTER_CAR.id ? [] : [`drove-${car.id}`]);
    }
  });
});
