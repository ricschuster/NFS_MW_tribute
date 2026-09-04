import { describe, it, expect } from 'vitest';
import { Police, type PlayerRef } from './police';
import { COP_FIRST_SPAWN } from './constants';

const MAX_SPEED = 12000;
const TRACK = 100000;

function player(z: number, offset: number, speed: number): PlayerRef {
  return { z, offset, speed };
}

/** Run the pursuit forward, advancing the player at `speed` each tick. */
function drive(p: Police, ticks: number, speed: number, offset = 0, startZ = 0): void {
  let z = startZ;
  for (let i = 0; i < ticks; i++) {
    p.update(0.1, player(z, offset, speed), MAX_SPEED, TRACK);
    z += speed * 0.1;
  }
}

describe('Police spawning', () => {
  it('has no cop before the first-spawn delay', () => {
    const p = new Police();
    drive(p, Math.floor(COP_FIRST_SPAWN / 0.1) - 2, MAX_SPEED * 0.5);
    expect(p.cop).toBeNull();
  });

  it('spawns a cop once the delay elapses', () => {
    const p = new Police();
    drive(p, Math.ceil(COP_FIRST_SPAWN / 0.1) + 5, MAX_SPEED * 0.5);
    expect(p.cop).not.toBeNull();
  });
});

describe('Police pursuit AI', () => {
  it('slides toward the player lane over time', () => {
    const p = new Police();
    drive(p, 60, MAX_SPEED * 0.6, 0.8); // spawn + settle at the player's lane
    const cop = p.cop;
    expect(cop).not.toBeNull();
    // it should be close to the player's 0.8 offset, not its spawn lane
    expect(Math.abs(cop!.offset - 0.8)).toBeLessThan(0.2);
  });

  it('keeps pace with a slower player (stays on the hunt)', () => {
    const p = new Police();
    drive(p, 120, MAX_SPEED * 0.5);
    expect(p.cop).not.toBeNull();
    expect(p.heat).toBeGreaterThan(0);
  });
});

describe('Police outrun', () => {
  it('a full-throttle player eventually shakes the cop', () => {
    const p = new Police();
    let existed = false;
    let despawned = false;
    let z = 0;
    for (let i = 0; i < 250; i++) {
      p.update(0.1, player(z, 0, MAX_SPEED), MAX_SPEED, TRACK);
      z += MAX_SPEED * 0.1;
      if (p.cop) existed = true;
      else if (existed) despawned = true;
    }
    expect(existed).toBe(true);
    expect(despawned).toBe(true);
  });
});
