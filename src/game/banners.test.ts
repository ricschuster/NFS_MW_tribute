import { describe, it, expect } from 'vitest';
import { Banners, type PursuitSnapshot } from './banners';
import { BANNER_TIME } from './constants';

const snap = (over: Partial<PursuitSnapshot> = {}): PursuitSnapshot => ({
  state: 'clear',
  level: 1,
  busted: false,
  escaped: false,
  ...over,
});

/** Feed a sequence of snapshots a step apart, and collect every banner shown. */
const shown = (steps: PursuitSnapshot[], dt = 0.1): string[] => {
  const banners = new Banners();
  const seen: string[] = [];
  for (const step of steps) {
    banners.update(dt, step);
    const text = banners.current?.text;
    if (text && seen[seen.length - 1] !== text) seen.push(text);
  }
  // And let the queue drain.
  for (let t = 0; t < BANNER_TIME * 6; t += dt) {
    banners.update(dt, steps[steps.length - 1]);
    const text = banners.current?.text;
    if (text && seen[seen.length - 1] !== text) seen.push(text);
  }
  return seen;
};

describe('pursuit banners (#356)', () => {
  it('drops what was waiting once the pursuit is over', () => {
    expect(
      shown([
        snap(),
        snap({ state: 'pursuit' }),
        snap({ state: 'pursuit', level: 2 }),
        snap({ state: 'cooldown', level: 2 }),
        snap({ state: 'cooldown', level: 1 }),
        snap({ state: 'clear', escaped: true }),
      ]),
    ).toEqual(['LOSE THE COPS', 'PURSUIT EVADED']);
  });

  it('holds each banner long enough to read before the next', () => {
    const steps = [snap(), snap({ state: 'pursuit' }), snap({ state: 'pursuit', level: 2 })];
    expect(shown(steps)).toEqual(['LOSE THE COPS', 'HEAT LEVEL 2']);
  });

  it('says nothing about heat falling away in free roam', () => {
    expect(shown([snap({ level: 3 }), snap({ level: 2 }), snap({ level: 1 })])).toEqual([]);
  });

  it('ends a burst of heat changes on where the heat got to', () => {
    const steps = [
      snap(),
      snap({ state: 'pursuit' }),
      snap({ state: 'pursuit', level: 2 }),
      snap({ state: 'pursuit', level: 3 }),
      snap({ state: 'pursuit', level: 4 }),
    ];
    expect(shown(steps)).toEqual(['LOSE THE COPS', 'HEAT LEVEL 4']);
  });

  it('lets a bust talk over everything else', () => {
    const banners = new Banners();
    banners.update(0.1, snap());
    banners.update(0.1, snap({ state: 'pursuit' }));
    banners.update(0.1, snap({ state: 'pursuit', level: 2 }));
    banners.update(0.1, snap({ state: 'pursuit', level: 2, busted: true }));
    expect(banners.current?.text).toBe('BUSTED');
  });

  it('says the search began, and says so when the heat drops in it (#355)', () => {
    const steps = [snap({ state: 'pursuit', level: 3 }), snap({ state: 'cooldown', level: 3 })];
    const banners = new Banners();
    for (const s of steps) banners.update(0.1, s);
    expect(banners.current?.text).toBe('ENTERED COOLDOWN');
    for (let t = 0; t < BANNER_TIME + 0.2; t += 0.1) banners.update(0.1, snap({ state: 'cooldown', level: 3 }));
    banners.update(0.1, snap({ state: 'cooldown', level: 2 }));
    expect(banners.current?.text).toBe('HEAT LEVEL DECREASED');
  });
});
