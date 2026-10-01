import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';
import { inWater } from './city/grid';
import { APARTMENT, HOUSE, SUBURB_AREAS } from './city/suburb';

const M = UNITS_PER_METRE;
const { city } = new CityWorld(undefined, { traffic: false, police: false });
const midtowns = PLAN_DISTRICTS.filter((a) => a.kind === 'midtown');
const area = midtowns[2];
// Every suburb's houses, and Midtown north's own: Midtown south (#487) builds
// on the same pipeline.
const allHomes = city.setPieces.filter((p) => p.kind === 'house' || p.kind === 'apartment');
const homes = allHomes.filter((p) => inArea(area.poly, p.at));

/** The nearest surface road to a point, and how far its edge is. */
function nearestRoad(p: { x: number; z: number }) {
  let best = { gap: Infinity, foot: p };
  for (const road of city.roads) {
    const a = city.nodes[road.a];
    const b = city.nodes[road.b];
    if (a.level !== 'surface' || b.level !== 'surface') continue;
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.pos.x) * dx + (p.z - a.pos.z) * dz) / (dx * dx + dz * dz || 1)));
    const foot = { x: a.pos.x + dx * t, z: a.pos.z + dz * t };
    const gap = Math.hypot(foot.x - p.x, foot.z - p.z) - road.width / 2;
    if (gap < best.gap) best = { gap, foot };
  }
  return best;
}

describe('Midtown north (#477)', () => {
  it('is a suburb: houses on its streets and low apartment blocks on its boulevards', () => {
    expect(homes.filter((p) => p.kind === 'house').length).toBeGreaterThan(120);
    expect(homes.filter((p) => p.kind === 'apartment').length).toBeGreaterThan(40);
    for (const home of allHomes) expect(SUBURB_AREAS.some((i) => inArea(midtowns[i].poly, home.at))).toBe(true);
  });

  it('stands every house on dry ground and clear of the road, and nearly all of them facing one across a front garden', () => {
    let facingOne = 0;
    for (const home of homes) {
      expect(inWater(city, home.at.x, home.at.z)).toBe(false);
      const size = home.kind === 'house' ? HOUSE : APARTMENT;
      // The front wall is a garden back from the kerb, not on the road.
      expect(nearestRoad(home.at).gap / M).toBeGreaterThan(size.l / 2);
      // And it faces a road: straight out of its front, across the garden,
      // is a carriageway. A house on a corner may face the other street.
      const face = { x: Math.sin(home.angle), z: Math.cos(home.angle) };
      let facing = false;
      for (let d = size.l / 2; d <= size.l / 2 + 30 && !facing; d += 1) {
        const p = { x: home.at.x + face.x * d * M, z: home.at.z + face.z * d * M };
        facing = nearestRoad(p).gap < 0;
      }
      if (facing) facingOne++;
    }
    // Nearly, not all: the houses are edited by hand in the area editor
    // (#477), and the owner may stand a block back from the street on purpose.
    expect(facingOne / homes.length).toBeGreaterThan(0.98);
  });

  it('keeps the houses apart', () => {
    for (let i = 0; i < homes.length; i++) {
      for (let j = i + 1; j < homes.length; j++) {
        expect(Math.hypot(homes[i].at.x - homes[j].at.x, homes[i].at.z - homes[j].at.z) / M).toBeGreaterThan(HOUSE.w);
      }
    }
  });

  it('races two circuits through it: the Crescents on its streets, the Northshore Loop round its shore', () => {
    const crescents = city.routes.find((r) => r.name === 'Midtown Crescents')!;
    const northshore = city.routes.find((r) => r.name === 'Northshore Loop')!;
    for (const route of [crescents, northshore]) {
      expect(route.kind).toBe('circuit');
      // Mostly inside the area: the loops close on roads just past its edge.
      expect(route.points.filter((p) => inArea(area.poly, p)).length / route.points.length).toBeGreaterThan(0.8);
    }
    expect(crescents.length / M).toBeGreaterThan(1400);
    expect(northshore.length / M).toBeGreaterThan(3000);
  });
});
