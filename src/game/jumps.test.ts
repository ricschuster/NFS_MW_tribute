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

  it('builds the jumps the editors placed: four on Marrow Field, one in Halloway Quarry, two at Sablet Wharf', () => {
    expect(city.jumps.map((jump) => jump.kind).sort()).toEqual(['mound', 'ramp', 'ramp', 'slab', 'slab', 'slab', 'slab']);
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

// The Crest Kicker: a lifted slab on the Halloway Rim's line where the rim
// tops out on its north side, so a car taken over it flat out lands on the
// downslope. Measured before placing it: at race pace it flies 60-70 m and
// lands clean, where a mound on the same spot flew 135 m and came down hard.
describe('the Crest Kicker', () => {
  const rim = city.routes.find((route) => route.name === 'Halloway Rim')!;
  const kicker = city.jumps.find(
    (jump) => jump.kind === 'slab' && Math.hypot(jump.at.x / M + 2820, jump.at.z / M + 1386) < 5,
  )!;

  it("sits on the Halloway Rim's line, facing the way the race runs", () => {
    const i = rim.points.findIndex((p) => Math.hypot(p.x - kicker.at.x, p.z - kicker.at.z) < 3 * M);
    expect(i).toBeGreaterThanOrEqual(0);
    const next = rim.points[(i + 1) % rim.points.length];
    const along = Math.atan2(next.x - kicker.at.x, next.z - kicker.at.z);
    expect(Math.cos(along - kicker.angle)).toBeGreaterThan(0.99);
  });

  it('is landed clean at race pace, and pays for it', () => {
    const { world } = launch(kicker, kmh(240));
    expect(world.lastJump!.hard).toBe(false);
    expect(world.lastJump!.distance).toBeGreaterThan(50 * M);
    expect(world.rep.recent.some((a) => a.reason === 'jump')).toBe(true);
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

// The Pier Jump (#410): Sablet Wharf's way out across the east channel. No
// channel off the wharf is narrower than 140 m, and the narrow ones are beside
// the south bridge, so a jetty runs 90 m out and the jump is off its end: about
// 110 m of water to the far bank. The run-up is the straight across the wharf
// behind it, which is what makes the speed.
describe('the Pier Jump', () => {
  const pier = city.jumps.find((jump) => Math.hypot(jump.at.x / M + 1360, jump.at.z / M + 2286) < 5)!;
  const deck = city.roads.filter(
    (road) =>
      road.bridge &&
      [road.a, road.b].some((id) => Math.hypot(city.nodes[id].pos.x / M + 1354, city.nodes[id].pos.z / M + 2288) < 3),
  );

  it('stands on the end of a deck over the water, level with the quay', () => {
    expect(pier).toBeDefined();
    const tip = deck.flatMap((road) => [road.a, road.b]).map((id) => city.nodes[id]).find((n) => n.roads.length === 1)!;
    expect(tip).toBeDefined();
    expect(pier.y).toBeCloseTo(tip.y, 3);
    expect(tip.y / M).toBeGreaterThan(3);
    expect(groundAt(city.terrain, pier.at.x, pier.at.z)).toBeLessThan(0);
  });

  /** From the west end of the straight, standing, flat out with no nitrous. */
  function run(cap = Infinity) {
    const world = new CityWorld(city, { traffic: false, police: false });
    const from = { x: -1911 * M, z: -2139 * M };
    world.x = from.x;
    world.z = from.z;
    world.y = groundAt(city.terrain, from.x, from.z);
    world.heading = pier.angle;
    world.speed = 0;
    const keys = { left: false, right: false, up: true, down: false, confirm: false, nitro: false };
    let flew = false;
    let wet = false;
    let after = 0;
    for (let step = 0; step < 60 * 40; step++) {
      if (!world.airborne) world.speed = Math.min(world.speed, cap);
      world.step(1 / 60, keys);
      if (world.airborne) flew = true;
      if (world.dunked > 0) wet = true;
      // A second on after landing: going in is noticed on the step after.
      if (flew && !world.airborne && ++after > 60) break;
    }
    return { world, flew, wet };
  }

  it('is cleared from the straight behind it, landing clean on the far bank', () => {
    const { world, flew, wet } = run();
    expect(flew).toBe(true);
    expect(wet).toBe(false);
    expect(world.lastJump!.distance / M).toBeGreaterThan(110);
    expect(world.lastJump!.hard).toBe(false);
  });

  it('is not cleared slowly: short of the bank is the water', () => {
    const { flew, wet } = run(kmh(170));
    expect(flew).toBe(true);
    expect(wet).toBe(true);
  });
});
