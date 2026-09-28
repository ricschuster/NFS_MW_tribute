import { describe, it, expect } from 'vitest';
import { CityAmbush } from './cityambush';
import { kestrelBay } from './city/index';
import {
  AMBUSH_COUNT,
  AMBUSH_SPACING,
  AMBUSH_FIRST_LEVEL,
  AMBUSH_RESULT_HOLD,
  AMBUSH_TARGET,
  AMBUSH_TARGET_PER_LEVEL,
  HEAT_LEVEL_COUNT,
} from './constants';

const STEP = 1 / 60;
const city = kestrelBay();

describe('where the traps are', () => {
  it('puts one in each quarter, at rising heat', () => {
    expect(city.ambushes.length).toBe(AMBUSH_COUNT);
    for (let i = 0; i < city.ambushes.length; i++) {
      expect(city.ambushes[i].level).toBe(Math.min(HEAT_LEVEL_COUNT, AMBUSH_FIRST_LEVEL + i));
    }
  });

  it('keeps them apart, so picking one is picking a place', () => {
    for (let i = 0; i < city.ambushes.length; i++) {
      for (let j = i + 1; j < city.ambushes.length; j++) {
        const gap = Math.hypot(
          city.ambushes[i].at.x - city.ambushes[j].at.x,
          city.ambushes[i].at.z - city.ambushes[j].at.z,
        );
        expect(gap).toBeGreaterThanOrEqual(AMBUSH_SPACING - 1);
      }
    }
  });

  // Springing a trap on a four-lane road with two clear exits is not a trap,
  // and springing one in a dead end is not an event either.
  it('springs them at junctions off the fast roads', () => {
    for (const spot of city.ambushes) {
      const node = city.nodes.find((n) => n.pos === spot.at);
      expect(node).toBeDefined();
      expect(node!.level).toBe('surface');
      expect(node!.roads.length).toBeGreaterThanOrEqual(3);
      for (const id of node!.roads) {
        expect(city.roads[id].class).not.toBe('interstate');
        expect(city.roads[id].class).not.toBe('ramp');
      }
    }
  });
});

describe('running one', () => {
  const run = (ambush: CityAmbush, seconds: number, clear = false, busted = false) => {
    for (let t = 0; t < seconds; t += STEP) ambush.update(STEP, clear, busted);
  };

  it('starts stopped and running', () => {
    const ambush = new CityAmbush();
    ambush.begin(4);
    expect(ambush.state).toBe('running');
    expect(ambush.level).toBe(4);
    expect(ambush.elapsed).toBe(0);
  });

  it('is scored on how long they had you', () => {
    const ambush = new CityAmbush();
    ambush.begin(3);
    run(ambush, 8);
    expect(ambush.elapsed).toBeGreaterThan(7.5);
    expect(ambush.state).toBe('running');
  });

  it('is over when the pursuit clears', () => {
    const ambush = new CityAmbush();
    ambush.begin(3);
    run(ambush, 5);
    ambush.update(STEP, true, false);
    expect(ambush.state).toBe('escaped');
    expect(ambush.justEnded).toBe(true);
  });

  it('is lost when you are busted', () => {
    const ambush = new CityAmbush();
    ambush.begin(3);
    ambush.update(STEP, false, true);
    expect(ambush.state).toBe('busted');
    expect(ambush.justEnded).toBe(true);
  });

  // The world pays for it once. A flag that stayed set would pay every frame
  // of the result screen.
  it('says it ended exactly once', () => {
    const ambush = new CityAmbush();
    ambush.begin(3);
    ambush.update(STEP, true, false);
    expect(ambush.justEnded).toBe(true);
    ambush.update(STEP, true, false);
    expect(ambush.justEnded).toBe(false);
  });

  it('lets go of the result after a moment', () => {
    const ambush = new CityAmbush();
    ambush.begin(3);
    ambush.update(STEP, true, false);
    run(ambush, AMBUSH_RESULT_HOLD + 0.5, true);
    expect(ambush.state).toBe('idle');
  });
});

describe('the target time (#358)', () => {
  it('gives a hotter ambush longer, up to the reference two and a half minutes', () => {
    const at = (level: number) => {
      const run = new CityAmbush();
      run.begin(level);
      return run.target;
    };
    expect(at(1)).toBe(AMBUSH_TARGET);
    expect(at(3)).toBe(AMBUSH_TARGET + 2 * AMBUSH_TARGET_PER_LEVEL);
    expect(at(HEAT_LEVEL_COUNT)).toBe(150);
  });

  it('is in time up to the target and not after', () => {
    const run = new CityAmbush();
    run.begin(2);
    run.update(run.target - 0.1, false, false);
    run.update(0.05, true, false);
    expect(run.inTime).toBe(true);

    const late = new CityAmbush();
    late.begin(2);
    late.update(late.target + 1, false, false);
    late.update(0.05, true, false);
    expect(late.state).toBe('escaped');
    expect(late.inTime).toBe(false);
  });

  it('is never in time when it ends in a bust', () => {
    const run = new CityAmbush();
    run.begin(2);
    run.update(0.05, false, true);
    expect(run.state).toBe('busted');
    expect(run.inTime).toBe(false);
  });
});
