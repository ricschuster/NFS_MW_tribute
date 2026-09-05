import { describe, it, expect } from 'vitest';
import { World, type InputState } from './world';
import type { Car } from './types';
import { STEP, SEGMENT_LENGTH, NITRO_SPEED_MULT } from './constants';

const NONE: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  confirm: false,
  nitro: false,
};

function press(partial: Partial<InputState>): InputState {
  return { ...NONE, ...partial };
}

/** Drive the world for `seconds`, choosing the held input each step via `control`. */
function play(world: World, seconds: number, control: (t: number, w: World) => InputState): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    world.step(STEP, control(i * STEP, world));
  }
}

/**
 * Steer toward `targetX` across the road, with `extra` inputs held.
 *
 * Steering points the car now rather than sliding it sideways, so aiming at a
 * lateral position takes two levels: pick the heading that would carry the car
 * there, then steer toward that heading. Reacting to the lateral error alone
 * just oscillates.
 */
function steerToward(w: World, targetX: number, extra: Partial<InputState> = {}): InputState {
  const want = Math.max(-0.35, Math.min(0.35, (targetX - w.playerX) * 0.8));
  const error = want - w.heading;
  if (error > 0.01) return press({ ...extra, right: true });
  if (error < -0.01) return press({ ...extra, left: true });
  return press(extra);
}

// Traffic spawns at random positions, so these playtests run on a clear road to
// stay deterministic. The pursuit's only randomness (a cop's spawn lane) does
// not affect any asserted outcome.

describe('playtest: driving', () => {
  it('accelerates to near top speed on a clear road', () => {
    const w = new World({ traffic: false });
    play(w, 6, () => press({ up: true }));
    expect(w.speed).toBeGreaterThan(w.maxSpeed * 0.9);
    expect(w.position).toBeGreaterThan(0);
  });

  it('brakes and then reverses when Down is held past a stop', () => {
    const w = new World({ traffic: false });
    play(w, 3, () => press({ up: true }));
    const topSpeed = w.speed;
    play(w, 1.5, () => press({ down: true }));
    expect(w.speed).toBeLessThan(topSpeed);
    expect(w.speed).toBeLessThan(0); // now reversing
  });

  it('lets you point a stopped car away from what it hit (crash recovery)', () => {
    const w = new World({ traffic: false });
    play(w, 1, () => press({ left: true })); // never touch the throttle
    expect(w.speed).toBe(0);
    // a stopped car cannot slide sideways any more, but it can still be aimed,
    // which is what getting off a wall actually needs
    expect(w.heading).toBeLessThan(-0.1);

    play(w, 1.5, (_t, world) => press({ up: true, left: world.heading > -0.3 }));
    expect(w.playerX).toBeLessThan(0); // and then driven off in that direction
  });

  it('bleeds speed when driven off the road', () => {
    const w = new World({ traffic: false });
    play(w, 6, () => press({ up: true }));
    const onRoad = w.speed;
    play(w, 3, () => press({ up: true, right: true })); // floor it but veer off
    expect(w.playerX).toBeGreaterThan(1); // off the road surface
    expect(w.speed).toBeLessThan(onRoad); // ...and slower for it
  });

  it('stops the car dead against roadside scenery', () => {
    const w = new World({ traffic: false });
    play(w, 6, () => press({ up: true }));

    // hold the car out on the left verge, where the props stand
    let sawCrash = false;
    let stopped = false;
    play(w, 10, () => {
      if (w.crashFlash > 0) sawCrash = true;
      if (sawCrash && w.speed === 0) stopped = true;
      if (w.playerX > -1.5) return press({ up: true, left: true });
      if (w.playerX < -1.6) return press({ up: true, right: true });
      return press({ up: true });
    });

    expect(sawCrash).toBe(true);
    expect(stopped).toBe(true);
  });

  it('leaves you alone while you stay on the road', () => {
    const w = new World({ traffic: false });
    let sawCrash = false;
    play(w, 12, () => {
      if (w.crashFlash > 0) sawCrash = true;
      // flat out down the middle: the props are all off the tarmac
      if (w.playerX > 0.05) return press({ up: true, left: true });
      if (w.playerX < -0.05) return press({ up: true, right: true });
      return press({ up: true });
    });
    expect(sawCrash).toBe(false);
  });

  it('crashing into a parked car in your lane costs speed', () => {
    const w = new World({ traffic: false });
    // drop a parked car dead-centre, a dozen segments ahead
    const idx = 12;
    const car: Car = { offset: 0, z: idx * SEGMENT_LENGTH, speed: 0, color: '#c94b4b', segmentIndex: idx };
    w.road.segments[idx].cars.push(car);
    w.traffic.cars.push(car);

    let sawCrash = false;
    let topSpeed = 0;
    play(w, 4, (_t, world) => {
      topSpeed = Math.max(topSpeed, world.speed);
      if (world.crashFlash > 0) sawCrash = true;
      return steerToward(world, 0, { up: true }); // floor it, holding the car's lane
    });

    expect(sawCrash).toBe(true); // we hit it
    expect(w.speed).toBeLessThan(topSpeed); // and it cost us speed
  });

  it('nitrous pushes past the normal top speed, then drains and recharges', () => {
    const w = new World({ traffic: false });
    play(w, 6, () => press({ up: true }));
    const normalTop = w.speed;
    expect(normalTop).toBeGreaterThan(w.maxSpeed * 0.95);
    expect(normalTop).toBeLessThanOrEqual(w.maxSpeed + 1);

    play(w, 1.5, () => press({ up: true, nitro: true }));
    expect(w.speed).toBeGreaterThan(w.maxSpeed); // above the normal cap
    const drained = w.nitro;
    expect(drained).toBeLessThan(1);

    play(w, 3, () => press({ up: true })); // let it settle and recharge
    expect(w.nitro).toBeGreaterThan(drained);
    expect(w.speed).toBeLessThanOrEqual(w.maxSpeed + 1); // bled back to the normal cap
  });

  it('runs the nitrous dry even if the key is never released', () => {
    const w = new World({ traffic: false });
    play(w, 6, () => press({ up: true }));

    // Holding the key used to boost forever: at empty the meter recharged for a
    // single step, which was enough to light it again on the next one.
    let sawEmpty = false;
    let sawNormalSpeed = false;
    let speedSum = 0;
    let steps = 0;
    play(w, 10, () => {
      if (w.nitro <= 0) sawEmpty = true;
      if (sawEmpty && w.speed <= w.maxSpeed + 1) sawNormalSpeed = true;
      speedSum += w.speed;
      steps++;
      return press({ up: true, nitro: true });
    });

    expect(sawEmpty).toBe(true); // the charge actually runs out
    expect(sawNormalSpeed).toBe(true); // and the car drops back to the normal cap
    // some overspeed is expected (the charge is spent as it arrives), but
    // nowhere near sitting at the boosted top speed the whole time
    expect(speedSum / steps).toBeLessThan(w.maxSpeed * NITRO_SPEED_MULT * 0.9);
  });
});

describe('playtest: pursuit', () => {
  it('busts a player who sits still while the cops arrive', () => {
    const w = new World({ traffic: false });
    let sawBusted = false;
    play(w, 24, () => {
      if (w.busted) sawBusted = true;
      return NONE; // parked
    });
    expect(sawBusted).toBe(true);
  });

  it('hands control back after a bust resets the pursuit', () => {
    const w = new World({ traffic: false });
    play(w, 24, () => NONE); // get busted, then the overlay clears
    play(w, 6, () => press({ up: true }));
    expect(w.busted).toBe(false);
    expect(w.speed).toBeGreaterThan(0);
  });

  it('escapes when the player floors it away from the cops', () => {
    const w = new World({ traffic: false });
    let sawEscape = false;
    // Steer back to centre as well as flooring it: throttle alone drifts off
    // the road on the first curve, and an off-road car gets caught, which is
    // the pursuit working rather than the escape failing.
    play(w, 26, (_t, world) => {
      if (world.escapedFlash > 0) sawEscape = true;
      return steerToward(world, 0, { up: true });
    });
    expect(sawEscape).toBe(true);
  });

  it('escalates a mid-speed pursuit instead of settling it in a few seconds', () => {
    const w = new World({ traffic: false });
    let chase = 0;
    let mostCops = 0;
    let topLevel = 0;
    play(w, 32, (_t, w) => {
      if (w.police.pursuing) {
        chase += STEP;
        mostCops = Math.max(mostCops, w.police.cops.length);
        topLevel = Math.max(topLevel, w.police.level);
      }
      // hold a fast-but-not-flat-out pace, staying on the road
      return steerToward(w, 0, { up: w.speed < w.maxSpeed * 0.9 });
    });

    expect(chase).toBeGreaterThan(6); // long enough to be a chase
    expect(topLevel).toBeGreaterThanOrEqual(2); // heat actually climbs
    expect(mostCops).toBeGreaterThan(1); // and pulls in backup
  });
});

describe('playtest: Blacklist race', () => {
  // Press ENTER on the first step, then floor it while steering back to centre
  // (holding only throttle would drift off-road on curves — a human steers).
  function raceLine(t: number, w: World): InputState {
    if (t < STEP * 0.5) return press({ confirm: true });
    return steerToward(w, 0, { up: true });
  }

  it('wins a clean sprint and ranks up', () => {
    const w = new World({ traffic: false });
    const before = w.beaten;
    play(w, 45, raceLine); // a full-length sprint plus the 3-2-1
    expect(w.raceMode).toBe('result');
    expect(w.raceResult).toBe('won');
    expect(w.beaten).toBe(before + 1);
    expect(w.currentRival?.rank).toBe(14); // advanced from #15 to #14
  });

  it('loses when the player never leaves the line', () => {
    const w = new World({ traffic: false });
    play(w, 45, (t) => (t < STEP * 0.5 ? press({ confirm: true }) : NONE));
    expect(w.raceResult).toBe('lost');
    expect(w.beaten).toBe(0);
  });

  it('returns to cruise when the result is dismissed', () => {
    const w = new World({ traffic: false });
    play(w, 45, raceLine); // win, land on the result screen
    expect(w.raceMode).toBe('result');
    play(w, 1, () => press({ confirm: true })); // dismiss
    expect(w.raceMode).toBe('cruise');
  });
});
