import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';

const M = UNITS_PER_METRE;
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
const industrial = PLAN_DISTRICTS.find((a) => a.kind === 'industrial')!;
const rail = city.roads.filter((r) => r.surface === 'rail');

describe("Industrial's railway (#489, #514)", () => {
  it('runs a main line through the district beside the freeway', () => {
    const length = rail.reduce((sum, r) => sum + r.length, 0) / M;
    expect(length).toBeGreaterThan(1500);
    for (const road of rail) {
      expect(inArea(industrial.poly, city.nodes[road.a].pos)).toBe(true);
      expect(road.width / M).toBeGreaterThan(9);
    }
    // Beside the freeway: every stretch of line within 60 m of the deck's middle.
    const deck = city.roads.filter((r) => r.class === 'interstate');
    for (const road of rail) {
      const p = city.nodes[road.a].pos;
      const near = deck.some((d) => {
        const a = city.nodes[d.a].pos, b = city.nodes[d.b].pos;
        const ux = b.x - a.x, uz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
        return Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z) / M < 60;
      });
      expect(near).toBe(true);
    }
  });

  it('keeps civilian traffic off the line', () => {
    const at = city.nodes[rail[Math.floor(rail.length / 2)].a].pos;
    const w = new CityWorld(city, { police: false });
    w.x = at.x;
    w.z = at.z;
    for (let i = 0; i < 60 * 30; i++) {
      w.step(1 / 60, { left: false, right: false, up: false, down: false, confirm: false, nitro: false });
      for (const car of w.traffic.cars) expect(car.road.surface).not.toBe('rail');
    }
  });

  it('fills the district with works', () => {
    const inside = city.setPieces.filter((p) => inArea(industrial.poly, p.at));
    const count = (kind: string) => inside.filter((p) => p.kind === kind).length;
    expect(count('tank')).toBeGreaterThan(100);
    expect(count('warehouse')).toBeGreaterThan(20);
    expect(count('gantry')).toBeGreaterThan(5);
  });
});
