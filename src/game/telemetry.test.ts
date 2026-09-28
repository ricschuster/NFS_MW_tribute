import { beforeAll, describe, expect, it } from 'vitest';
import { CityWorld } from './cityworld';
import { REFERENCE_TOP_SPEED, UNITS_PER_METRE } from './constants';
import { Telemetry, TELEMETRY_RANGE } from './telemetry';

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
    const s = new Telemetry().sample(w, 0, () => true);
    expect(s.ofTop).toBeCloseTo(0.6, 3);
    expect(s.kmh).toBe(Math.round(((REFERENCE_TOP_SPEED * 0.6) / M) * 3.6));
    expect(s.event).toBeNull();
  });

  it('counts only the traffic the camera sees, and only within range', () => {
    const w = world();
    w.traffic.cars.push(carAt(w, 40), carAt(w, TELEMETRY_RANGE + 50));
    expect(new Telemetry().sample(w, 0, () => true).traffic).toBe(1);
    expect(new Telemetry().sample(w, 0, () => false).traffic).toBe(0);
  });

  it('keeps every sample for the file', () => {
    const w = world();
    const rec = new Telemetry();
    rec.sample(w, 0, () => true);
    rec.sample(w, 1, () => true);
    const file = rec.file();
    expect(file.version).toBe(1);
    expect(file.samples.map((s) => s.t)).toEqual([0, 1]);
  });
});
