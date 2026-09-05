import { describe, it, expect } from 'vitest';
import { Police, type PlayerRef } from './police';
import { COP_FIRST_SPAWN } from './constants';

const MAX_SPEED = 12000;
const TRACK = 100000;
/** Ticks of the 0.1 s step it takes for the first pursuit to start. */
const SPAWN_TICKS = Math.ceil(COP_FIRST_SPAWN / 0.1);

function player(z: number, offset: number, speed: number): PlayerRef {
  return { z, offset, speed };
}

/** Run the pursuit forward, advancing the player at `speed` each tick. */
function drive(p: Police, ticks: number, speed: number, offset = 0): void {
  let z = 0;
  for (let i = 0; i < ticks; i++) {
    p.update(0.1, player(z, offset, speed), MAX_SPEED, TRACK);
    z += speed * 0.1;
  }
}

describe('Police spawning', () => {
  it('has no cops before the first-spawn delay', () => {
    const p = new Police();
    drive(p, SPAWN_TICKS - 2, MAX_SPEED * 0.5);
    expect(p.cops.length).toBe(0);
  });

  it('starts a pursuit once the delay elapses', () => {
    const p = new Police();
    drive(p, SPAWN_TICKS + 5, MAX_SPEED * 0.5);
    expect(p.cops.length).toBeGreaterThan(0);
    expect(p.pursuing).toBe(true);
  });
});

describe('Police pursuit AI', () => {
  it('slides toward the player lane', () => {
    const p = new Police();
    drive(p, SPAWN_TICKS + 60, MAX_SPEED * 0.5, 0.8);
    expect(p.cops.length).toBeGreaterThan(0);
    const nearest = p.cops.reduce((a, b) => (a.distance < b.distance ? a : b));
    expect(Math.abs(nearest.offset - 0.8)).toBeLessThan(0.2);
  });

  it('builds heat while a slower player is chased', () => {
    const p = new Police();
    drive(p, SPAWN_TICKS + 120, MAX_SPEED * 0.45);
    expect(p.heat).toBeGreaterThan(0);
    expect(p.level).toBeGreaterThanOrEqual(1);
  });
});

describe('Police outrun / escape', () => {
  it('a full-throttle player shakes the cops and escapes', () => {
    const p = new Police();
    let escaped = false;
    let existed = false;
    let z = 0;
    for (let i = 0; i < SPAWN_TICKS + 200; i++) {
      p.update(0.1, player(z, 0, MAX_SPEED), MAX_SPEED, TRACK);
      z += MAX_SPEED * 0.1;
      if (p.cops.length > 0) existed = true;
      if (p.justEscaped) escaped = true;
    }
    expect(existed).toBe(true);
    expect(escaped).toBe(true);
  });
});

describe('Police bust', () => {
  it('busts a stopped player after being pinned', () => {
    const p = new Police();
    // player parked at the origin; cops close in and pin
    for (let i = 0; i < SPAWN_TICKS + 120; i++) {
      p.update(0.1, player(0, 0, 0), MAX_SPEED, TRACK);
      if (p.busted) break;
    }
    expect(p.busted).toBe(true);
  });

  it('reset() clears the pursuit and heat', () => {
    const p = new Police();
    for (let i = 0; i < SPAWN_TICKS + 120; i++) {
      p.update(0.1, player(0, 0, 0), MAX_SPEED, TRACK);
      if (p.busted) break;
    }
    p.reset();
    expect(p.busted).toBe(false);
    expect(p.cops.length).toBe(0);
    expect(p.heat).toBe(0);
    expect(p.pursuing).toBe(false);
  });
});
