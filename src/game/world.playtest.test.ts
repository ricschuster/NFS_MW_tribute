import { describe, it, expect } from 'vitest';
import { World, type InputState } from './world';
import { STEP } from './constants';

const NONE: InputState = { left: false, right: false, up: false, down: false };

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

  it('lets you steer out of a lane while stopped (crash-recovery authority)', () => {
    const w = new World({ traffic: false });
    const before = w.playerX;
    play(w, 1, () => press({ left: true })); // never touch the throttle
    expect(w.speed).toBe(0);
    expect(w.playerX).toBeLessThan(before);
  });

  it('bleeds speed when driven off the road', () => {
    const w = new World({ traffic: false });
    play(w, 6, () => press({ up: true }));
    const onRoad = w.speed;
    play(w, 3, () => press({ up: true, right: true })); // floor it but veer off
    expect(w.playerX).toBeGreaterThan(1); // off the road surface
    expect(w.speed).toBeLessThan(onRoad); // ...and slower for it
  });
});

describe('playtest: pursuit', () => {
  it('busts a player who sits still while the cops arrive', () => {
    const w = new World({ traffic: false });
    let sawBusted = false;
    play(w, 12, () => {
      if (w.busted) sawBusted = true;
      return NONE; // parked
    });
    expect(sawBusted).toBe(true);
  });

  it('hands control back after a bust resets the pursuit', () => {
    const w = new World({ traffic: false });
    play(w, 12, () => NONE); // get busted, then the overlay clears
    play(w, 6, () => press({ up: true }));
    expect(w.busted).toBe(false);
    expect(w.speed).toBeGreaterThan(0);
  });

  it('escapes when the player floors it away from the cops', () => {
    const w = new World({ traffic: false });
    let sawEscape = false;
    play(w, 14, () => {
      if (w.escapedFlash > 0) sawEscape = true;
      return press({ up: true });
    });
    expect(sawEscape).toBe(true);
  });
});
