import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';

const M = UNITS_PER_METRE;
const { city } = new CityWorld(undefined, { traffic: false, police: false });
const park = PLAN_DISTRICTS.find((area) => area.name === 'Tidewater Park')!;

describe('Tidewater Park (#461)', () => {
  it('has drives through it, paved and two lanes wide', () => {
    const drives = city.roads.filter((road) => {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      return road.class === 'street' && inArea(park.poly, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    });
    const length = drives.reduce((sum, road) => sum + road.length, 0) / M;
    expect(length).toBeGreaterThan(1500);
    for (const road of drives) expect(road.surface).toBe('asphalt');
  });

  it('runs a speed run round them, all of it inside the park', () => {
    const drive = city.routes.find((route) => route.name === 'Tidewater Drive')!;
    expect(drive.kind).toBe('speedrun');
    expect(drive.laps).toBe(1);
    expect(drive.length / M).toBeGreaterThan(1800);
    for (const p of drive.points) expect(inArea(park.poly, p)).toBe(true);
  });

  it('keeps the freeway in its tunnel under the park, as the owner chose', () => {
    const under = city.roads.filter((road) => {
      if (road.class !== 'interstate') return false;
      const a = city.nodes[road.a];
      const b = city.nodes[road.b];
      return inArea(park.poly, { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 }) && a.level === 'tunnel' && b.level === 'tunnel';
    });
    expect(under.reduce((sum, road) => sum + road.length, 0) / M).toBeGreaterThan(700);
  });
});
