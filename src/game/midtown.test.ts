import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';
import { inWater } from './city/grid';
import { APARTMENT, HOUSE, SHOP, SUBURB_AREAS, suburbHousesFor } from './city/suburb';
import { AUTHORED_ROADS } from './city/roads';
import { HIGH_STREETS, PAVEMENT, highStreetAprons, highStreetLines } from './city/highstreet';

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

describe('a high street (#488)', () => {
  // Drafted the way `npm run housedraft -- --place midtown-sw --houses` does,
  // with the draft's own high street: the boulevard down into Tidewater Park.
  const high = AUTHORED_ROADS.find((r) => r.id === 'n100')!.points;
  const water = (x: number, z: number) => inWater(city, x, z);
  const drafted = suburbHousesFor(city.terrain, city.roads, city.nodes, water, [], [], [], [0], [high]);
  const onHigh = drafted.filter((h) => h.kind === 'shop' || h.kind === 'flat');

  it('puts shops and flats along it, and only along it', () => {
    expect(onHigh.filter((h) => h.kind === 'shop').length).toBeGreaterThan(20);
    expect(onHigh.filter((h) => h.kind === 'flat').length).toBeGreaterThan(3);
    for (const h of onHigh) {
      const gap = Math.min(...high.slice(1).map((b, i) => Math.hypot(...nearest(h, high[i], b)))) / M;
      expect(gap).toBeLessThan(40);
    }
  });

  it('closes them up into a terrace, where a suburb leaves gardens between houses', () => {
    // Each shop's nearest neighbour is about a shop's width away, which no
    // two houses ever are.
    const shops = onHigh.filter((h) => h.kind === 'shop');
    const nearestNeighbour = shops.map((a) => Math.min(...onHigh.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z))));
    const terraced = nearestNeighbour.filter((d) => d < SHOP.w + 2).length;
    expect(terraced / shops.length).toBeGreaterThan(0.8);
    expect(Math.min(...nearestNeighbour)).toBeGreaterThan(SHOP.w * 0.9);
  });
});

describe("a high street's pavement (#488)", () => {
  it('is paved from kerb to shopfront on both sides, inside its own midtown only', () => {
    // Borrowed for the test: the list is the owner's, and empty until they pick.
    const before = HIGH_STREETS[0];
    HIGH_STREETS[0] = ['n100'];
    try {
      const lines = highStreetLines(0);
      expect(lines.length).toBe(1);
      for (const p of lines[0]) expect(inArea(midtowns[0].poly, p)).toBe(true);
      const [apron] = highStreetAprons(city.roads, city.nodes);
      expect(apron.look).toBe('concrete');
      expect(apron.yard).toBe(false);
      // Across the middle of it, the band is the road and a pavement each side.
      const mid = lines[0][Math.floor(lines[0].length / 2)];
      const across = Math.min(...apron.outline.map((p) => Math.hypot(p.x - mid.x, p.z - mid.z))) / M;
      const road = nearestRoad(mid);
      expect(across).toBeGreaterThan(PAVEMENT);
      expect(across).toBeLessThan(PAVEMENT + 15);
      expect(road.gap).toBeLessThan(0);
    } finally {
      if (before) HIGH_STREETS[0] = before;
      else delete HIGH_STREETS[0];
    }
  });
});

/** The offset from a prop, in metres, to the nearest point of a segment in world units. */
function nearest(h: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): [number, number] {
  const p = { x: h.x * M, z: h.z * M };
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return [p.x - a.x - dx * t, p.z - a.z - dz * t];
}
