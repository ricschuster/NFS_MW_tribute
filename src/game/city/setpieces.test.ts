import { describe, expect, it } from 'vitest';
import { CAR_HEIGHT, CAR_RADIUS, UNITS_PER_METRE } from '../constants';
import { CityWorld } from '../cityworld';
import { kestrelBay } from './index';
import { MARROW_PROPS } from './marrowprops';
import { QUARRY_PROPS } from './quarryprops';
import { WHARF_PROPS } from './wharfprops';
import { FORT_PROPS } from './fortprops';
import { HIGHMOOR_PROPS } from './highmoorprops';
import { TIDEWATER_PROPS } from './tidewaterprops';
import { MIDTOWN_PROPS } from './midtownprops';
import { MIDTOWN_SOUTH_PROPS } from './midtownsouthprops';
import { HIGHMOOR_CAR_PARK } from './highmoor';
import { CASTLE_AREAS } from './castle';
import { insideOrNear } from './aprons';
import { airfieldProps, hitsSetPiece } from './setpieces';
import { groundAt } from './terrain';
import { PLAN_DISTRICTS, PLAN_PLACES, PLAN_RUNWAY, inArea, planDistrictAt } from './plan';
import { distanceToSegment } from './grid';
import type { SetPiece } from './types';

const M = UNITS_PER_METRE;
const city = kestrelBay();

/** A point `along` and `across` a piece, in metres, in its own frame. */
function beside(piece: SetPiece, along: number, across: number) {
  const s = Math.sin(piece.angle);
  const c = Math.cos(piece.angle);
  return {
    x: piece.at.x + (along * s + across * c) * M,
    z: piece.at.z + (along * c - across * s) * M,
  };
}

describe('Marrow Field props (#295)', () => {
  it('turns every placed prop into a set piece, a breakable, a jump or a billboard', () => {
    const { pieces, breakables, jumps, billboards } = airfieldProps(city.terrain, 1000);
    expect(pieces.length + breakables.length + jumps.length + billboards.length).toBe(MARROW_PROPS.length);
    expect(jumps.length).toBe(MARROW_PROPS.filter((p) => p.kind === 'jump').length);
    expect(pieces.every((p) => p.kind !== ('jump' as string))).toBe(true);
    // Numbered on from where they were told to start, so they cannot collide
    // with the generated breakables' ids.
    expect(breakables.map((b) => b.id)).toEqual(breakables.map((_, i) => 1000 + i));
  });

  it('stands every piece on the ground where it was placed', () => {
    for (const piece of city.setPieces) {
      expect(piece.y).toBeCloseTo(groundAt(city.terrain, piece.at.x, piece.at.z), 6);
    }
  });

  it('sizes a placed gate to the road it was snapped across', () => {
    const placed = MARROW_PROPS.filter((p) => p.kind === 'gate');
    const { breakables } = airfieldProps(city.terrain, 0);
    const gates = breakables.filter((b) => b.kind === 'gate');
    expect(gates.map((g) => g.half)).toEqual(placed.map((p) => ((p.w ?? 12) / 2) * M));
  });

  it('numbers placed billboards after the generated ones, so a save still means the same boards', () => {
    const ids = city.collectibles.map((c) => c.id);
    expect(ids).toEqual(ids.map((_, i) => i));
    const placed = city.collectibles.filter((c) => c.placed);
    expect(placed.length).toBe(MARROW_PROPS.filter((p) => p.kind === 'billboard').length);
    expect(city.collectibles.slice(-placed.length).every((c) => c.placed)).toBe(true);
  });

  it('adds to the generated breakables without renumbering them', () => {
    const ids = city.breakables.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.map((_, i) => i));
  });
});

// The places' set pieces go into the city in order - Marrow Field's, Halloway
// Quarry's, Sablet Wharf's - so each place's are a slice of the list. Asking by
// distance instead stopped working once the wharf's yard (#410) came within
// three radii of the pit.
const piecesOf = (props: typeof MARROW_PROPS) => airfieldProps(city.terrain, 0, props).pieces.length;
const quarryPieces = () => city.setPieces.slice(piecesOf(MARROW_PROPS), piecesOf(MARROW_PROPS) + piecesOf(QUARRY_PROPS));
const wharfPieces = () => city.setPieces.slice(piecesOf(MARROW_PROPS) + piecesOf(QUARRY_PROPS)).slice(0, piecesOf(WHARF_PROPS));
const fortStart = () => piecesOf(MARROW_PROPS) + piecesOf(QUARRY_PROPS) + piecesOf(WHARF_PROPS);
const fortPieces = () => city.setPieces.slice(fortStart(), fortStart() + piecesOf(FORT_PROPS));
// Highmoor Park's (#460) after the castle's: its placed props, then the woods.
const highmoorPieces = () => city.setPieces.slice(fortStart() + piecesOf(FORT_PROPS));

describe('Halloway Quarry props (#323)', () => {
  const pit = PLAN_PLACES.find((p) => p.kind === 'quarry')!;
  const away = (x: number, z: number) => Math.hypot(x - pit.at.x, z - pit.at.z);
  const roadGap = (x: number, z: number) =>
    Math.min(
      ...city.roads.map((r) => {
        const a = city.nodes[r.a].pos;
        const b = city.nodes[r.b].pos;
        return distanceToSegment(x, z, a.x, a.z, b.x, b.z) - r.width / 2;
      }),
    );

  it('puts every placed prop into the city, after Marrow Field\'s and without renumbering them', () => {
    const { pieces, breakables, jumps, billboards } = airfieldProps(city.terrain, 0, QUARRY_PROPS);
    expect(pieces.length + breakables.length + jumps.length + billboards.length).toBe(QUARRY_PROPS.length);
    const inQuarry = quarryPieces();
    expect(inQuarry.length).toBe(pieces.length);
    for (const piece of inQuarry) expect(away(piece.at.x, piece.at.z)).toBeLessThan(pit.radius * 3);
  });

  it('keeps every set piece off the road, off the water and inside the place', () => {
    for (const piece of quarryPieces()) {
      // A cone is the one thing that is meant to stand on tarmac.
      if (piece.kind !== 'cone') expect(roadGap(piece.at.x, piece.at.z)).toBeGreaterThan(0);
      expect(piece.y).toBeGreaterThan(0);
    }
  });

  it('lays each gate across a road it can close', () => {
    const gates = QUARRY_PROPS.filter((p) => p.kind === 'gate');
    expect(gates.length).toBeGreaterThan(0);
    for (const gate of gates) expect(roadGap(gate.x * M, gate.z * M)).toBeLessThan(0);
  });
});

describe('Sablet Wharf props (#410)', () => {
  const docks = PLAN_PLACES.find((p) => p.kind === 'docks')!;
  const inWharf = wharfPieces();
  const roadGap = (x: number, z: number) =>
    Math.min(
      ...city.roads.map((r) => {
        const a = city.nodes[r.a].pos;
        const b = city.nodes[r.b].pos;
        return distanceToSegment(x, z, a.x, a.z, b.x, b.z) - r.width / 2;
      }),
    );

  it('builds the container port it was given', () => {
    const { pieces } = airfieldProps(city.terrain, 0, WHARF_PROPS);
    expect(inWharf.length).toBe(pieces.length);
    for (const piece of inWharf) expect(Math.hypot(piece.at.x - docks.at.x, piece.at.z - docks.at.z)).toBeLessThan(docks.radius * 2);
    expect(inWharf.filter((p) => p.kind === 'container-block').length).toBeGreaterThan(100);
    expect(inWharf.some((p) => p.kind === 'sts-crane')).toBe(true);
  });

  it('keeps the containers and the buildings off the road', () => {
    for (const piece of inWharf.filter((p) => p.kind === 'container-block' || p.kind === 'warehouse')) {
      expect(roadGap(piece.at.x, piece.at.z)).toBeGreaterThan(0);
    }
  });

  it('stands each crane over the quay road, and lets a car drive under it', () => {
    for (const crane of inWharf.filter((p) => p.kind === 'sts-crane')) {
      expect(roadGap(crane.at.x, crane.at.z)).toBeLessThan(0);
      expect(hitsSetPiece([crane], crane.at.x, crane.at.z, crane.y, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
    }
  });

  it('makes a four-high block taller than a two-high one', () => {
    const block = (variant: string): SetPiece => ({ kind: 'container-block', at: { x: 0, z: 0 }, y: 0, angle: 0, variant });
    const up = 8 * M;
    expect(hitsSetPiece([block('two high')], 0, 0, up, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
    expect(hitsSetPiece([block('four high')], 0, 0, up, CAR_RADIUS, CAR_HEIGHT)).toBe(true);
  });
});

describe('Kestrel Head castle (#454)', () => {
  const fort = fortPieces();
  const roadGap = (x: number, z: number) =>
    Math.min(
      ...city.roads.map((r) => {
        const a = city.nodes[r.a].pos;
        const b = city.nodes[r.b].pos;
        return distanceToSegment(x, z, a.x, a.z, b.x, b.z) - r.width / 2;
      }),
    );

  it('builds the castle it was given: a bailey, an inner castle and a keep', () => {
    expect(fort.length).toBe(airfieldProps(city.terrain, 0, FORT_PROPS).pieces.length);
    expect(fort.filter((p) => p.kind === 'rampart').length).toBeGreaterThan(10);
    // The main gate and the inner gate down the approach, and the gate from the
    // courtyard through to the south ward.
    expect(fort.filter((p) => p.kind === 'fort-gate').length).toBe(3);
    for (const kind of ['keep', 'palas', 'chapel'] as const) expect(fort.some((p) => p.kind === kind)).toBe(true);
    // Two keeps: the inner castle's, and the south ward's in the middle of its long wall.
    expect(fort.filter((p) => p.kind === 'keep').length).toBe(2);
    // From the bailey at the north end to the tip of the ridge.
    for (const piece of fort) expect(Math.hypot(piece.at.x / M - 1420, piece.at.z / M + 520)).toBeLessThan(360);
  });

  it('keeps its walls and its buildings off the road', () => {
    const standing = ['rampart', 'wall-tower', 'keep', 'palas', 'chapel', 'ruin-house'];
    for (const piece of fort.filter((p) => standing.includes(p.kind))) {
      expect(roadGap(piece.at.x, piece.at.z)).toBeGreaterThan(0);
    }
  });

  // A gate is a way through: over the road up, or from one cobbled enclosure
  // into the next - the ward's gate stands in the courtyard wall, off the road.
  const cobbled = (x: number, z: number) =>
    [CASTLE_AREAS.bailey, CASTLE_AREAS.court, CASTLE_AREAS.ward].findIndex((area) => insideOrNear(area, x, z, 0));
  it('stands each gate over the road or between two enclosures, and lets a car through under the arch', () => {
    for (const gate of fort.filter((p) => p.kind === 'fort-gate')) {
      if (roadGap(gate.at.x, gate.at.z) >= 0) {
        const front = beside(gate, 10, 0);
        const back = beside(gate, -10, 0);
        expect(cobbled(front.x, front.z)).toBeGreaterThanOrEqual(0);
        expect(cobbled(back.x, back.z)).toBeGreaterThanOrEqual(0);
        expect(cobbled(front.x, front.z)).not.toBe(cobbled(back.x, back.z));
      }
      expect(hitsSetPiece([gate], gate.at.x, gate.at.z, gate.y, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
      const tower = beside(gate, 0, 13);
      expect(hitsSetPiece([gate], tower.x, tower.z, gate.y, CAR_RADIUS, CAR_HEIGHT)).toBe(true);
    }
  });

  it('makes a broken wall lower than a whole one', () => {
    const wall = (variant: string): SetPiece => ({ kind: 'rampart', at: { x: 0, z: 0 }, y: 0, angle: 0, variant });
    expect(hitsSetPiece([wall('broken')], 0, 0, 4 * M, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
    expect(hitsSetPiece([wall('whole')], 0, 0, 4 * M, CAR_RADIUS, CAR_HEIGHT)).toBe(true);
  });
});

describe('Highmoor Park (#460)', () => {
  const pieces = highmoorPieces();
  const park = PLAN_DISTRICTS.find((a) => a.name === 'Highmoor Park')!;
  // Highmoor's woods, not Tidewater Park's trees (#461): the ones in a box
  // round this park, 300 m wider than it all round - Tidewater is 2 km off.
  const near = (v: number, of: number[]) => v > Math.min(...of) - 300 * M && v < Math.max(...of) + 300 * M;
  const trees = pieces.filter((p) => p.kind === 'tree' && near(p.at.x, park.poly.map((q) => q.x)) && near(p.at.z, park.poly.map((q) => q.z)));
  const roadGap = (x: number, z: number) =>
    Math.min(
      ...city.roads.map((r) => {
        const a = city.nodes[r.a].pos;
        const b = city.nodes[r.b].pos;
        return distanceToSegment(x, z, a.x, a.z, b.x, b.z) - r.width / 2;
      }),
    );

  it('puts its own props in first, then a wood of a thousand trees and more', () => {
    expect(pieces.slice(0, piecesOf(HIGHMOOR_PROPS)).every((p) => p.kind !== 'tree')).toBe(true);
    expect(trees.length).toBeGreaterThan(1000);
    // Everything after the placed props is a tree: Highmoor's woods, then
    // Tidewater Park's (#461). Tidewater's buildings and Midtown north's
    // houses (#477) and Midtown south's (#487) are placed props, after
    // Highmoor's.
    expect(pieces.slice(piecesOf(HIGHMOOR_PROPS) + piecesOf(TIDEWATER_PROPS) + piecesOf(MIDTOWN_PROPS) + piecesOf(MIDTOWN_SOUTH_PROPS)).every((p) => p.kind === 'tree')).toBe(true);
  });

  it('keeps the woods in the park or on unclaimed ground just past it, off the roads, out of the castle and below the meadow', () => {
    const edge = (at: { x: number; z: number }) =>
      Math.min(...park.poly.map((b, i) => {
        const a = park.poly[(i + park.poly.length - 1) % park.poly.length];
        return distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) / M;
      }));
    let outside = 0;
    for (const tree of trees) {
      if (!inArea(park.poly, tree.at)) {
        outside++;
        // Past the edge only onto ground no district has, and not far.
        expect(planDistrictAt(tree.at)).toBe(null);
        expect(edge(tree.at)).toBeLessThan(140);
      }
      expect(roadGap(tree.at.x, tree.at.z)).toBeGreaterThan(3 * M);
      for (const area of [CASTLE_AREAS.bailey, CASTLE_AREAS.court, CASTLE_AREAS.ward]) {
        expect(insideOrNear(area, tree.at.x, tree.at.z, 10 * M)).toBe(false);
      }
      // The meadow near the top is open, so the castle stands clear.
      expect(groundAt(city.terrain, tree.at.x, tree.at.z) / M).toBeLessThan(108);
    }
    // The owner asked for the woods to run on past the south-west edge (#460).
    expect(outside).toBeGreaterThan(100);
  });

  it('leaves the picnic area, the viewpoint and the car park open', () => {
    const furniture = pieces.filter((p) => ['picnic-table', 'bench', 'telescope'].includes(p.kind));
    expect(furniture.length).toBeGreaterThanOrEqual(8);
    for (const piece of furniture) {
      for (const tree of trees) expect(Math.hypot(tree.at.x - piece.at.x, tree.at.z - piece.at.z)).toBeGreaterThan(12 * M);
    }
    const lot = city.aprons.find((a) => a.look === 'gravel');
    expect(lot?.outline).toEqual(HIGHMOOR_CAR_PARK);
    for (const tree of trees) expect(insideOrNear(HIGHMOOR_CAR_PARK, tree.at.x, tree.at.z, 5 * M)).toBe(false);
  });

  it('runs the Descent down from the castle to the car park, over the jump', () => {
    const descent = city.routes.find((r) => r.name === 'Highmoor Descent')!;
    expect(descent.kind).toBe('sprint');
    const heights = descent.heights!;
    expect((heights[0] - heights[heights.length - 1]) / M).toBeGreaterThan(40);
    const end = descent.points[descent.points.length - 1];
    expect(insideOrNear(HIGHMOOR_CAR_PARK, end.x, end.z, 10 * M)).toBe(true);
    const jump = city.jumps.find((j) => Math.hypot(j.at.x / M - 845, j.at.z / M + 550) < 5)!;
    const nearest = Math.min(...descent.points.slice(1).map((p, i) => distanceToSegment(jump.at.x, jump.at.z, descent.points[i].x, descent.points[i].z, p.x, p.z)));
    expect(nearest / M).toBeLessThan(3);
  });
});

describe('hitsSetPiece', () => {
  const at = { x: 0, z: 0 };
  const turned = 0.6;
  const piece = (kind: SetPiece['kind']): SetPiece => ({ kind, at, y: 0, angle: turned });

  it('is solid down a fuselage and not across the far side of it', () => {
    const hull = piece('fuselage');
    const along = beside(hull, 8, 0);
    const across = beside(hull, 0, 8);
    expect(hitsSetPiece([hull], along.x, along.z, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(true);
    expect(hitsSetPiece([hull], across.x, across.z, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
  });

  it('lets a car under a cargo plane wing but not into its fuselage', () => {
    const plane = piece('plane-belly');
    const wing = beside(plane, 2, 11);
    const body = beside(plane, -5, 0);
    expect(hitsSetPiece([plane], wing.x, wing.z, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
    expect(hitsSetPiece([plane], body.x, body.z, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(true);
  });

  it('hits a tree at its trunk and nowhere else', () => {
    const tree = piece('tree');
    expect(hitsSetPiece([tree], 0, 0, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(true);
    const clear = beside(tree, 0, 0.6 + CAR_RADIUS / M + 0.5);
    expect(hitsSetPiece([tree], clear.x, clear.z, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
  });

  it('never stops a car for a cone', () => {
    expect(hitsSetPiece([piece('cone')], 0, 0, 0, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
  });

  it('lets anything well above the ground pass over', () => {
    expect(hitsSetPiece([piece('bunker')], 0, 0, 12 * M, CAR_RADIUS, CAR_HEIGHT)).toBe(false);
  });
});

describe('driving into them', () => {
  const FLOOR = { left: false, right: false, up: true, down: false, confirm: false, nitro: false };

  /** Aim the car at a point from `back` metres away and hold the throttle. */
  function closest(world: CityWorld, target: { x: number; z: number }, back: number) {
    world.x = target.x - back * M;
    world.z = target.z;
    world.y = groundAt(world.city.terrain, world.x, world.z);
    world.heading = Math.PI / 2;
    world.speed = 0;
    let gap = Infinity;
    for (let i = 0; i < 240; i++) {
      world.step(1 / 60, FLOOR);
      gap = Math.min(gap, Math.hypot(world.x - target.x, world.z - target.z) / M);
    }
    return gap;
  }

  // Marrow Field stands ten metres above the sea. Collision used to ask how
  // high the car was above *sea level*, and above four metres nothing on the
  // ground was solid - the car drove through the silos and the hangar.
  it('stops at a silo on raised ground rather than driving through it', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const silo = world.city.setPieces.find((p) => p.kind === 'silo')!;
    expect(silo.y / M).toBeGreaterThan(4.4);
    expect(closest(world, silo.at, 12)).toBeGreaterThan(4);
  });

  it('stops at the hangar wall', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const hangar = world.city.buildings.find((b) => b.derelict)!;
    const f = hangar.footprint;
    const centre = { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 };
    // From the -x side, so the wall in the way is `minX`.
    const halfWidth = (f.maxX - f.minX) / 2 / M;
    expect(closest(world, centre, halfWidth + 12)).toBeGreaterThan(halfWidth);
  });
});

// "Dirt on the access road" (#295): the roads that exist only to reach the
// field, found by the network's own structure rather than by where they were
// drawn.
describe('the roads to Marrow Field', () => {
  const dirt = city.roads.filter((r) => r.surface === 'dirt');

  it('are dirt right up to where they meet somebody else\'s road', () => {
    for (const node of city.nodes) {
      const here = node.roads.map((id) => city.roads[id]);
      if (!here.some((r) => r.surface === 'dirt') || !here.some((r) => r.surface !== 'dirt')) continue;
      // Where dirt meets paving, the paving is a bridge or a real junction.
      const paved = here.filter((r) => r.surface !== 'dirt');
      expect(paved.every((r) => r.bridge) || node.roads.length >= 3).toBe(true);
    }
  });

  it('leave every bridge paved', () => {
    expect(dirt.some((r) => r.bridge)).toBe(false);
  });

  it('reach past the runway and taxiways', () => {
    const [a, b] = PLAN_RUNWAY;
    const far = dirt.filter((road) => {
      const p = city.nodes[road.a].pos;
      const along = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / Math.hypot(b.x - a.x, b.z - a.z) ** 2;
      const t = Math.max(0, Math.min(1, along));
      const away = Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.z - (a.z + (b.z - a.z) * t));
      return away > 150 * M;
    });
    expect(far.length).toBeGreaterThan(0);
  });
});
