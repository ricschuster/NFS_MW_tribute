import { describe, expect, it } from 'vitest';
import { CAR_HEIGHT, CAR_RADIUS, UNITS_PER_METRE } from '../constants';
import { CityWorld } from '../cityworld';
import { kestrelBay } from './index';
import { MARROW_PROPS } from './marrowprops';
import { airfieldProps, hitsSetPiece } from './setpieces';
import { groundAt } from './terrain';
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
  it('turns every placed prop into a set piece, a breakable or a jump', () => {
    const { pieces, breakables, jumps } = airfieldProps(city.terrain, 1000);
    expect(pieces.length + breakables.length + jumps.length).toBe(MARROW_PROPS.length);
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

  it('adds to the generated breakables without renumbering them', () => {
    const ids = city.breakables.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.map((_, i) => i));
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
