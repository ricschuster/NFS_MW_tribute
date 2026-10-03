import { describe, it, expect } from 'vitest';
import { CarMotion, poseWheels, tyreRadius } from './carmotion';
import { carParts } from './carshape';

const base = { speed: 0, heading: 0, steer: 0, airborne: false, maxSpeed: 1000 };

function run(m: CarMotion, frames: number, f: (n: number) => Partial<typeof base>) {
  for (let n = 0; n < frames; n++) m.update(1 / 60, { ...base, ...f(n) });
}

describe('car motion', () => {
  it('is level on a steady straight', () => {
    const m = new CarMotion();
    run(m, 120, () => ({ speed: 800 }));
    expect(Math.abs(m.roll)).toBeLessThan(1e-3);
    expect(Math.abs(m.pitch)).toBeLessThan(1e-3);
  });

  it('leans the roof outward in a corner, both ways', () => {
    // Steering right lowers the heading in this world; the roof goes to +x,
    // which is a negative turn about z.
    const right = new CarMotion();
    run(right, 60, (n) => ({ speed: 800, heading: -n * 0.02, steer: 1 }));
    const left = new CarMotion();
    run(left, 60, (n) => ({ speed: 800, heading: n * 0.02, steer: -1 }));
    expect(right.roll).toBeLessThan(-0.01);
    expect(left.roll).toBeGreaterThan(0.01);
  });

  it('squats under throttle and dives under braking', () => {
    const up = new CarMotion();
    run(up, 30, (n) => ({ speed: 100 + n * 20 }));
    const down = new CarMotion();
    run(down, 30, (n) => ({ speed: 900 - n * 30 }));
    expect(up.pitch).toBeLessThan(0);
    expect(down.pitch).toBeGreaterThan(0);
  });

  it('is bounded by a crash and by a heading wrap', () => {
    const m = new CarMotion();
    run(m, 5, (n) => ({ speed: n === 2 ? -5000 : 900, heading: n * 3.1 }));
    expect(Math.abs(m.roll)).toBeLessThan(0.1);
    expect(Math.abs(m.pitch)).toBeLessThan(0.08);
  });

  it('flattens in the air', () => {
    const m = new CarMotion();
    run(m, 60, (n) => ({ speed: 800, heading: -n * 0.02 }));
    run(m, 120, () => ({ speed: 800, airborne: true }));
    expect(Math.abs(m.roll)).toBeLessThan(1e-3);
  });

  it('steers the front wheels only, and spins all four', () => {
    const { wheels } = carParts(650, 0.7);
    poseWheels(wheels, 0.3, 1.2);
    for (const w of wheels) {
      expect(w.rotation.x).toBe(1.2);
      expect(w.rotation.y).toBe(w.position.z > 0 ? 0.3 : 0);
      expect(w.userData.wheel).toBe(true);
    }
    expect(tyreRadius(wheels[0])).toBeGreaterThan(0);
  });

  it('never turns a wheel faster than it can be read', () => {
    const m = new CarMotion();
    m.advanceWheel(1 / 60, 1e6, 40);
    expect(m.spin).toBeLessThanOrEqual(0.5);
  });
});
