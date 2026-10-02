import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, PLAN_PLACES, inArea } from './city/plan';
import { distanceToSegment, inWater } from './city/grid';
import { groundAt } from './city/terrain';
import { quarryIslandWildsFor } from './city/quarryisland';
import { QUARRY_PROPS } from './city/quarryprops';
import { SET_PIECE_SOLIDS } from './city/setpieces';
import type { Vec2 } from './city/types';

const M = UNITS_PER_METRE;
const { city } = new CityWorld(undefined, { traffic: false, police: false });
const wet = (x: number, z: number) => inWater(city, x, z);
const quarry = PLAN_PLACES.find((p) => p.kind === 'quarry')!;
const raced = city.routes.map((route) => route.points);

/**
 * The island's country, asked for directly rather than read back out of
 * `city.setPieces`, where it sits among the quarry's own placed trees and
 * rocks. Asked with no set pieces to avoid: the trees already in the city
 * would otherwise turn every lattice cell down as taken by itself.
 */
const wilds = quarryIslandWildsFor(city.terrain, city.roads, city.nodes, [], QUARRY_PROPS, wet, raced);
const trees = wilds.filter((p) => p.kind === 'tree');
const outcrops = wilds.filter((p) => p.kind === 'outcrop');

/** Metres from a point to the nearest kerb of a surface road, with that road. */
function kerbGap(x: number, z: number): { gap: number; asphalt: boolean } {
  let best = { gap: Infinity, asphalt: false };
  for (const road of city.roads) {
    if (road.class === 'interstate' || road.class === 'ramp') continue;
    if (city.nodes[road.a].level !== 'surface' || city.nodes[road.b].level !== 'surface') continue;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const gap = (distanceToSegment(x * M, z * M, a.x, a.z, b.x, b.z) - road.width / 2) / M;
    if (gap < best.gap) best = { gap, asphalt: road.surface === 'asphalt' };
  }
  return best;
}

const raceGap = (x: number, z: number): number =>
  Math.min(
    ...raced.flatMap((line) =>
      line.slice(1).map((b, k) => distanceToSegment(x * M, z * M, line[k].x, line[k].z, b.x, b.z) / M),
    ),
  );

// The quarry island's wild country (#543): woods, scrub and rock over the
// island's open ground, generated rather than placed.
describe('the quarry island country', () => {
  it('has woods and rock on it at all', () => {
    expect(trees.length).toBeGreaterThan(1000);
    expect(outcrops.length).toBeGreaterThan(50);
  });

  it('is the same country every time it is asked for', () => {
    // Generated on a fixed lattice from each cell's own numbers, so a rerun
    // that moved a single tree would move what a save and a screenshot know.
    expect(quarryIslandWildsFor(city.terrain, city.roads, city.nodes, [], QUARRY_PROPS, wet, raced)).toEqual(wilds);
  });

  it('stands on the island, on dry ground', () => {
    for (const p of wilds) {
      const at: Vec2 = { x: p.x * M, z: p.z * M };
      expect(inArea(quarry.area!, at)).toBe(true);
      expect(wet(at.x, at.z)).toBe(false);
    }
  });

  it('keeps off the roads and the race lines', () => {
    // A tree's verge is a track's 9 m or the tarmac's 18 m off the kerb, and
    // 12 m off a race line; an outcrop asks 8 m more of each, being rock.
    for (const p of wilds) {
      const extra = p.kind === 'outcrop' ? 8 : 0;
      const { gap, asphalt } = kerbGap(p.x, p.z);
      expect(gap).toBeGreaterThanOrEqual((asphalt ? 18 : 9) + extra - 0.01);
      expect(raceGap(p.x, p.z)).toBeGreaterThanOrEqual(12 + extra - 0.01);
    }
  });

  it('puts rock only on the high ground', () => {
    // Outcrops are the bare tops a wood stops short of, at 22 m and over.
    for (const p of outcrops) expect(groundAt(city.terrain, p.x * M, p.z * M) / M).toBeGreaterThanOrEqual(22);
  });
});

// The rock itself (#543): a set piece a car hits at its two big slabs.
describe('an outcrop', () => {
  it('is solid where a car can run into it', () => {
    const solids = SET_PIECE_SOLIDS.outcrop;
    expect(solids.length).toBeGreaterThan(0);
    // Tall enough to stop a car, not so wide it blocks more than it draws.
    for (const solid of solids) {
      expect(solid.y1).toBeGreaterThan(1);
      if ('r' in solid) expect(solid.r).toBeLessThan(8);
    }
  });
});

// The ground each place owns, as the owner traced it (#544).
describe('the places and the ground they own', () => {
  for (const place of PLAN_PLACES.filter((p) => p.area)) {
    it(`gives ${place.name} an outline round it, mostly land and nobody else's`, () => {
      const area = place.area!;
      expect(inArea(area, place.at)).toBe(true);
      const xs = area.map((p) => p.x);
      const zs = area.map((p) => p.z);
      let inside = 0;
      let land = 0;
      let claimed = 0;
      const step = 40 * M;
      for (let x = Math.min(...xs); x < Math.max(...xs); x += step) {
        for (let z = Math.min(...zs); z < Math.max(...zs); z += step) {
          if (!inArea(area, { x, z })) continue;
          inside++;
          if (!wet(x, z)) land++;
          if (PLAN_DISTRICTS.some((d) => inArea(d.poly, { x, z }))) claimed++;
        }
      }
      // A traced island takes in some of its own shore; three quarters land is
      // the loosest of the three. A district inside one would make it built-up
      // ground that the place's own generators also dress.
      expect(land / inside).toBeGreaterThan(0.7);
      expect(claimed / inside).toBeLessThan(0.01);
    });
  }
});

// Its tracks (#543): qi1 to qi5 drafted, n116 and n117 drawn by the owner.
describe('the quarry island tracks', () => {
  const dirt = city.roads.filter(
    (road) =>
      road.surface === 'dirt' &&
      inArea(quarry.area!, city.nodes[road.a].pos) &&
      inArea(quarry.area!, city.nodes[road.b].pos),
  );

  it('are dirt, eleven kilometres of it, and the park\'s', () => {
    const km = dirt.reduce((sum, road) => sum + road.length, 0) / M / 1000;
    expect(km).toBeGreaterThan(10);
    for (const road of dirt) expect(road.district).toBe('park');
  });

  it('all lead somewhere', () => {
    // Every track was drafted or drawn to join a road at both ends; an end
    // with nothing else at it is a track the sync failed to join.
    for (const road of dirt) {
      for (const end of [road.a, road.b]) expect(city.nodes[end].roads.length).toBeGreaterThan(1);
    }
  });
});

// The island's event (#546).
describe('the Halloway Coast Rally', () => {
  const rally = city.routes.find((route) => route.name === 'Halloway Coast Rally')!;

  it('is a sprint of about five and a half kilometres', () => {
    expect(rally).toBeDefined();
    expect(rally.kind).toBe('sprint');
    expect(rally.length / M).toBeGreaterThan(5000);
    expect(rally.length / M).toBeLessThan(6000);
  });

  it('is on dirt the whole way', () => {
    // Asked of each stretch's middle, so a stretch is judged by the road it
    // runs along rather than by the junction it starts at.
    for (let i = 0; i < rally.points.length - 1; i++) {
      const a = rally.points[i];
      const b = rally.points[i + 1];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      let best = { gap: Infinity, surface: '' };
      for (const road of city.roads) {
        const p = city.nodes[road.a].pos;
        const q = city.nodes[road.b].pos;
        const gap = distanceToSegment(mid.x, mid.z, p.x, p.z, q.x, q.z);
        if (gap < best.gap) best = { gap, surface: road.surface };
      }
      expect(best.surface).toBe('dirt');
    }
  });
});
