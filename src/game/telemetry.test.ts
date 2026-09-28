import { beforeAll, describe, expect, it } from 'vitest';
import { CityWorld } from './cityworld';
import { REFERENCE_TOP_SPEED, UNITS_PER_METRE } from './constants';
import { Telemetry, TELEMETRY_DETECTABLE, TELEMETRY_KEPT } from './telemetry';

const M = UNITS_PER_METRE;

describe('telemetry (#347)', () => {
  // One city for the file: building it is most of a cold test's five seconds.
  let built: CityWorld;
  beforeAll(() => {
    built = new CityWorld(undefined, { traffic: false, police: false });
  }, 60_000);
  const world = () => new CityWorld(built.city, { traffic: false, police: false });
  const carAt = (w: CityWorld, metres: number) => ({
    road: w.onRoad!,
    t: 0.5,
    forward: true,
    speed: 0,
    damage: 0,
    colour: '#c94b4b',
    x: w.x + metres * M,
    z: w.z,
    y: w.y,
    heading: 0,
  });

  it('reads the speed as the same fraction of top speed citylap reports', () => {
    const w = world();
    w.speed = REFERENCE_TOP_SPEED * 0.6;
    const s = new Telemetry().sample(w, 0, () => 0);
    expect(s.ofTop).toBeCloseTo(0.6, 3);
    expect(s.kmh).toBe(Math.round(((REFERENCE_TOP_SPEED * 0.6) / M) * 3.6));
    expect(s.event).toBeNull();
  });

  // On-screen size is the renderer's to say; here it is a stand-in that makes
  // the near car big and the far one small, the way a camera would.
  const byDistance = (w: CityWorld) => (x: number, _y: number, z: number) =>
    (4 * M) / Math.max(1, Math.hypot(x - w.x, z - w.z));

  it('counts a vehicle only once it is as big on screen as a detector needs', () => {
    const w = world();
    // 40 m away is 10% of the screen by the stand-in; 300 m is 1.3%.
    w.traffic.cars.push(carAt(w, 40), carAt(w, 300));
    const s = new Telemetry().sample(w, 0, byDistance(w));
    expect(s.traffic).toBe(1);
    expect(s.sizes.traffic.length).toBe(2);
    expect(Math.min(...s.sizes.traffic)).toBeLessThan(TELEMETRY_DETECTABLE);
    expect(Math.min(...s.sizes.traffic)).toBeGreaterThanOrEqual(TELEMETRY_KEPT);
    expect(new Telemetry().sample(w, 0, () => 0).traffic).toBe(0);
  });

  it('keeps every sample for the file', () => {
    const w = world();
    const rec = new Telemetry();
    rec.sample(w, 0, () => 0);
    rec.sample(w, 1, () => 0);
    const file = rec.file();
    expect(file.version).toBe(2);
    expect(file.samples.map((s) => s.t)).toEqual([0, 1]);
  });
});
