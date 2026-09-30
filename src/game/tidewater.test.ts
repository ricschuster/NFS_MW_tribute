import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';
import { groundAt } from './city/terrain';
import { inWater } from './city/grid';
import { TIDEWATER_PONDS } from './city/tidewater';

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

  it('has ponds in hollows, level and clear of every road', () => {
    const ponds = city.water.filter((body) => body.kind === 'pond' && inArea(park.poly, body.outline[0]));
    expect(ponds.length).toBe(TIDEWATER_PONDS.length);
    for (const pond of ponds) {
      // The water is at or under the ground all round its edge: not buried
      // along one side, and not standing above the lawn on the other.
      for (const p of pond.outline) {
        const edge = groundAt(city.terrain, p.x, p.z);
        expect(pond.level!).toBeLessThanOrEqual(edge + 0.5 * M);
      }
      const centre = TIDEWATER_PONDS[ponds.indexOf(pond)].at;
      expect(groundAt(city.terrain, centre.x, centre.z)).toBeLessThan(pond.level!);
      expect(inWater(city, centre.x, centre.z)).toBe(true);
    }
    for (const road of city.roads) {
      const a = city.nodes[road.a];
      if (a.level === 'tunnel') continue;
      for (const pond of ponds) expect(inWater(city, a.pos.x, a.pos.z) && inArea(pond.outline, a.pos)).toBe(false);
    }
  });

  it('has trees on its lawns, and none on the race or in the water', () => {
    const trees = city.setPieces.filter((piece) => piece.kind === 'tree' && inArea(park.poly, piece.at));
    expect(trees.length).toBeGreaterThan(150);
    const drive = city.routes.find((route) => route.name === 'Tidewater Drive')!;
    for (const tree of trees) {
      expect(inWater(city, tree.at.x, tree.at.z)).toBe(false);
      for (let i = 1; i < drive.points.length; i++) {
        const a = drive.points[i - 1];
        const b = drive.points[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((tree.at.x - a.x) * dx + (tree.at.z - a.z) * dz) / (dx * dx + dz * dz)));
        expect(Math.hypot(a.x + dx * t - tree.at.x, a.z + dz * t - tree.at.z) / M).toBeGreaterThan(20);
      }
    }
  });
});
