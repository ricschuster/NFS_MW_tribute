import { describe, expect, it } from 'vitest';
import { REP_JUMP, REP_JUMP_DISTANCE, REP_JUMP_MIN, UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { JUMP_SHAPES, jumpProfile, lipSlope } from './city/jumps';
import { groundAt } from './city/terrain';
import type { Jump, JumpKind } from './city/types';

const M = UNITS_PER_METRE;
const kmh = (v: number) => (v / 3.6) * M;
const city = new CityWorld(undefined, { traffic: false, police: false }).city;

/**
 * Put a car a few metres short of a jump, pointing up it at `speed`, and hold
 * that speed until it leaves the lip - so a run is about the jump and not
 * about how quickly this car gets up to speed. Returns the world and the
 * lowest the car ever got below the ground under it.
 */
function launch(jump: Jump, speed: number, input: Partial<Record<'left' | 'right', boolean>> = {}) {
  const world = new CityWorld(city, { traffic: false, police: false });
  const back = JUMP_SHAPES[jump.kind].l / 2 + 3;
  world.x = jump.at.x - Math.sin(jump.angle) * back * M;
  world.z = jump.at.z - Math.cos(jump.angle) * back * M;
  world.y = groundAt(city.terrain, world.x, world.z);
  world.heading = jump.angle;
  world.speed = speed;
  world.damage = 0;
  const keys = { left: false, right: false, up: true, down: false, confirm: false, nitro: false, ...input };
  let flew = false;
  let sunk = 0;
  const headings: number[] = [];
  for (let step = 0; step < 60 * 8; step++) {
    if (!flew && !world.airborne) world.speed = speed;
    world.step(1 / 60, keys);
    if (world.airborne) {
      flew = true;
      headings.push(world.heading);
    }
    sunk = Math.max(sunk, (groundAt(city.terrain, world.x, world.z) - world.y) / M);
    if (flew && !world.airborne) break;
  }
  return { world, flew, sunk, headings };
}

const first = (kind: JumpKind) => city.jumps.find((jump) => jump.kind === kind)!;

describe('what a jump is (#307)', () => {
  it('rises from nothing at the back to its full height at the lip', () => {
    for (const kind of Object.keys(JUMP_SHAPES) as JumpKind[]) {
      expect(jumpProfile(kind, 0)).toBe(0);
      expect(jumpProfile(kind, 1)).toBeCloseTo(JUMP_SHAPES[kind].rise, 6);
    }
  });

  // A mound that levelled off at its crest would roll the car over the top.
  it('makes a mound steepest at its lip, not a hump', () => {
    const { l, rise } = JUMP_SHAPES.mound;
    expect(lipSlope('mound')).toBeGreaterThan(rise / l);
  });

  it("builds Marrow Field's jumps from what the editor placed", () => {
    expect(city.jumps.map((jump) => jump.kind).sort()).toEqual(['mound', 'ramp', 'slab', 'slab']);
  });
});

describe('taking one', () => {
  it('throws the car off the lip at speed, and it comes down further on', () => {
    const { world, flew } = launch(first('ramp'), kmh(160));
    expect(flew).toBe(true);
    expect(world.airborne).toBe(false);
    expect(world.lastJump!.distance / M).toBeGreaterThan(40);
    expect(world.lastJump!.height / M).toBeGreaterThan(1);
  });

  it('lands a clean jump onto flat ground softly, at any speed', () => {
    for (const speed of [40, 120, 200, 240]) {
      const { world } = launch(first('ramp'), kmh(speed));
      expect(world.lastJump!.hard).toBe(false);
      expect(world.damage).toBe(0);
    }
  });

  it('goes further the faster it is taken', () => {
    const slow = launch(first('slab'), kmh(80)).world.lastJump!.distance;
    const fast = launch(first('slab'), kmh(160)).world.lastJump!.distance;
    expect(fast).toBeGreaterThan(slow * 2);
  });

  it('never puts the car below the ground, in the air or landing', () => {
    for (const kind of ['ramp', 'mound', 'slab'] as JumpKind[]) {
      expect(launch(first(kind), kmh(200)).sunk).toBeLessThan(0.05);
    }
  });

  it('cannot be steered in the air', () => {
    const { headings } = launch(first('ramp'), kmh(160), { left: true });
    expect(headings.length).toBeGreaterThan(10);
    expect(Math.max(...headings) - Math.min(...headings)).toBeLessThan(1e-9);
  });
});

// The Cargo Plane Jump: a mound on the taxiway and a plane lying across it,
// its wing along the line of the jump - high enough to drive under, and in
// the way of a jump taken too slowly.
describe('the Cargo Plane Jump', () => {
  const mound = first('mound');
  const plane = city.setPieces.find((piece) => piece.kind === 'plane-belly')!;
  /** How far along the jump's line a point is, in metres from the mound. */
  const along = (x: number, z: number) =>
    ((x - mound.at.x) * Math.sin(mound.angle) + (z - mound.at.z) * Math.cos(mound.angle)) / M;

  it('lies across the line of the jump, further on', () => {
    expect(along(plane.at.x, plane.at.z)).toBeGreaterThan(20);
    expect(Math.abs(Math.cos(plane.angle - mound.angle))).toBeLessThan(0.05);
  });

  it('is cleared at speed, landing past the far side of the plane', () => {
    const { world } = launch(mound, kmh(200));
    expect(along(world.x, world.z)).toBeGreaterThan(along(plane.at.x, plane.at.z) + 16);
    expect(world.lastJump!.hard).toBe(false);
  });

  it('is not cleared slowly: the wing catches the car and it comes down hard', () => {
    const { world } = launch(mound, kmh(110));
    expect(along(world.x, world.z)).toBeLessThan(along(plane.at.x, plane.at.z));
    expect(world.damage).toBeGreaterThan(0);
  });
});

describe('what a jump pays', () => {
  it('pays for a landed jump by the metre, and says how far it was', () => {
    const { world } = launch(first('ramp'), kmh(160));
    const distance = world.lastJump!.distance;
    const award = world.rep.recent.find((a) => a.reason === 'jump')!;
    expect(award.label).toBe(`JUMP ${Math.round(distance / M)} M`);
    expect(award.amount).toBe(Math.round((REP_JUMP * distance) / REP_JUMP_DISTANCE));
  });

  it('pays nothing for a hop', () => {
    const { world } = launch(first('slab'), kmh(40));
    expect(world.lastJump!.distance).toBeLessThan(REP_JUMP_MIN);
    expect(world.rep.total).toBe(0);
  });

  it('pays nothing for a jump that was not landed', () => {
    const { world } = launch(first('mound'), kmh(110));
    expect(world.lastJump!.hard).toBe(true);
    expect(world.rep.recent.some((a) => a.reason === 'jump')).toBe(false);
  });
});

// Billboards stacked on the Hangar Ramp's flight line (#295), as the reference
// has them: something to smash on the way down.
describe('the Hangar Ramp billboards', () => {
  it('are smashed by taking the jump', () => {
    const ramp = first('ramp');
    const { world } = launch(ramp, kmh(160));
    // Carry on past the landing, through the rest of the stack.
    const keys = { left: false, right: false, up: true, down: false, confirm: false, nitro: false };
    for (let i = 0; i < 60; i++) world.step(1 / 60, keys);
    const boards = city.collectibles.filter((c) => c.placed);
    const smashed = boards.filter((b) => world.collectibles.smashed.has(b.id));
    expect(boards.length).toBe(4);
    expect(smashed.length).toBe(4);
  });
});
