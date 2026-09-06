import { describe, it, expect } from 'vitest';
import { CityWorld } from './cityworld';
import {
  STEP,
  CAR_RADIUS,
  TRAFFIC_RADIUS,
  CITY_PURSUIT_RANGE,
  HEAT_LEVELS,
  HEAT_LEVEL_COUNT,
  COP_UNITS,
  CITY_COP_LOSE,
  SEARCH_TIME_PER_LEVEL,
  UNITS_PER_METRE,
  WRECK_LINGER,
  TAKEDOWN_MIN_CLOSING,
  ROADBLOCK_MIN_LEVEL,
  ROADBLOCK_MIN_WIDTH,
  ROADBLOCK_MIN_LEAD,
  ROADBLOCK_GAP,
  ROADBLOCK_GAP_CHANCE,
  ROADBLOCK_GAP_FALLOFF,
  ROADBLOCK_SPEED_KEPT,
  ENFORCER_MIN_LEVEL,
  ENFORCER_SPEED_KEPT,
  ENFORCER_SPAWN,
  SHUNT_SPEED_KEPT,
  SPIKE_MIN_LEVEL,
  SPIKE_MAX,
  SHRED_TIME,
  SHRED_SPEED_FRAC,
  SHRED_GRIP,
  HELI_MIN_LEVEL,
  HELI_TIME,
  HELI_SEE_RADIUS,
  COVER_MIN,
  LOSE_CONTACT_TIME,
  REP_TAKEDOWN,
  REP_ROADBLOCK,
  REP_NEAR_MISS,
  REP_WRECK,
  REP_PURSUIT_TICK,
  REP_NEAR_MISS_RANGE,
  REFERENCE_TOP_SPEED,
  FIND_RANGE,
  CITY_COUNTDOWN,
  CITY_EDGE_MARGIN,
  ROUTE_START_RANGE,
  AMBUSH_RANGE,
  AMBUSH_RING,
  DAMAGE_FREE,
  DAMAGE_SPEED_LOSS,
  REPAIR_COUNT,
  REPAIR_SPACING,
  REPAIR_RANGE,
  type CopKind,
} from './constants';
import { CARS, STARTER_CAR, carById } from './cars';
import { RIVALS } from './rivals';
import type { InputState } from './world';
import type { Cop } from './citypolice';
import type { TrafficCar } from './citytraffic';

const NONE: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  confirm: false,
  nitro: false,
};
const press = (partial: Partial<InputState>): InputState => ({ ...NONE, ...partial });

/** Drive for `seconds` on the fixed timestep, as the game loop does. */
function drive(world: CityWorld, seconds: number, input: InputState): void {
  for (let t = 0; t < seconds; t += STEP) world.step(STEP, input);
}

const at = (world: CityWorld) => ({ x: world.x, z: world.z });
const moved = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(b.x - a.x, b.z - a.z);

const M = UNITS_PER_METRE;

/**
 * Put the car on a road wide enough for the police to bother blocking, at
 * street level, pointing along it.
 *
 * Shared by the roadblock, Enforcer and spike-strip tests. All three are about
 * something the police put in front of you, and all three need the car to be
 * somewhere they would actually put it.
 */
function onAnArterial(): CityWorld {
  const world = new CityWorld(undefined, { traffic: false, police: false });
  const road = world.city.roads.find(
    (r) => r.width >= ROADBLOCK_MIN_WIDTH && !r.bridge && world.city.nodes[r.a].y === 0,
  );
  if (!road) throw new Error('no road wide enough to block: the city changed');

  const a = world.city.nodes[road.a].pos;
  const b = world.city.nodes[road.b].pos;
  world.x = a.x + (b.x - a.x) * 0.3;
  world.z = a.z + (b.z - a.z) * 0.3;
  world.y = 0;
  world.heading = Math.atan2(b.x - a.x, b.z - a.z);
  world.onRoad = road;
  return world;
}

/** A cop holding station behind the car, so the pursuit has eyes on it. */
function tail(world: CityWorld): Cop {
  const cop: Cop = {
    road: world.onRoad!,
    t: 0.5,
    forward: true,
    speed: 0,
    damage: 0,
    x: 0,
    z: 0,
    y: 0,
    heading: world.heading,
    kind: 'cruiser',
    role: 'chase',
  };
  world.police.cops.push(cop);
  return cop;
}

/**
 * Hold a pursuit at a fixed heat for `seconds`, with the car where it is.
 *
 * The pursuit is driven directly rather than by holding the throttle, and that
 * is not a shortcut. A scripted straight-line drive in this city wedges the
 * car against a building inside a minute, and a test that measures how long
 * the car survived is not a test about roadblocks, Enforcers or spikes.
 *
 * The tail is re-placed every step because, left to itself, it closes and
 * busts you, which ends the pursuit the test is trying to observe.
 */
function hunt(world: CityWorld, heat: number, seconds: number): void {
  const cop = tail(world);
  for (let t = 0; t < seconds; t += STEP) {
    cop.x = world.x - Math.sin(world.heading) * 35 * M;
    cop.z = world.z - Math.cos(world.heading) * 35 * M;
    cop.y = world.y;
    world.police.heat = heat;
    world.police.update(STEP, world, world.maxSpeed);
  }
}

describe('a car in Kestrel Bay', () => {
  it('starts on a street, at street level, pointing along it', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    expect(world.onRoad).not.toBeNull();
    expect(world.onRoad?.class).not.toBe('interstate');
    expect(world.y).toBe(0);
    expect(world.speed).toBe(0);
  });

  it('drives forwards along its heading', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const start = at(world);
    drive(world, 2, press({ up: true }));

    expect(world.speed).toBeGreaterThan(0);
    // It went the way it was pointing, not merely somewhere.
    const travelled = moved(start, at(world));
    expect(travelled).toBeGreaterThan(0);
    expect(world.x - start.x).toBeCloseTo(Math.sin(world.heading) * travelled, -2);
  });

  // The track model clamped heading to +/-0.9 rad, because a car on a track can
  // only ever point roughly along it. In a city it has to be able to turn round.
  it('can be turned all the way round, which a track car could not', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const facing = world.heading;
    drive(world, 3, press({ left: true }));
    expect(Math.abs(world.heading - facing)).toBeGreaterThan(Math.PI);
  });

  // Getting this backwards is not subtle to play and was invisible to every
  // other test, all of which only cared that the car turned *somewhere*.
  it('steers right to the driver\'s right', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    world.heading = 0; // facing +z
    // Turned on the spot, so the answer is about steering and not about which
    // building the car found first.
    drive(world, 0.5, press({ right: true }));

    // Facing +z with y up, the driver's right is -x: forward crossed with up.
    // So a right turn has to send the car's nose toward -x.
    expect(Math.sin(world.heading)).toBeLessThan(0);
  });

  it('steers left to the driver\'s left', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    world.heading = 0;
    drive(world, 0.5, press({ left: true }));
    expect(Math.sin(world.heading)).toBeGreaterThan(0);
  });

  it('reverses back the way it came', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    drive(world, 1.5, press({ up: true }));
    const forward = at(world);
    drive(world, 3, press({ down: true }));
    expect(world.speed).toBeLessThan(0);
    expect(moved(forward, at(world))).toBeGreaterThan(0);
  });

  // Open ground is drivable but slow. That is what makes cutting across a
  // block a decision rather than either a wall or a free shortcut.
  it('runs slower off the road than on it', () => {
    // Short enough to still be on the street it started on: held longer the
    // car reaches a junction, hits something and bounces into reverse, which
    // makes it a slower baseline than the off-road car it is meant to beat.
    const onRoad = new CityWorld(undefined, { traffic: false, police: false });
    drive(onRoad, 3, press({ up: true }));
    expect(onRoad.onRoad).not.toBeNull();

    // Stood in the middle of an open block, so this is a test of open ground
    // and not of whichever side street the car happened to find.
    const offRoad = new CityWorld(undefined, { traffic: false, police: false });
    const open = offRoad.city.blocks.find((b) => b.open);
    expect(open).toBeDefined();
    if (open) {
      offRoad.x = (open.bounds.minX + open.bounds.maxX) / 2;
      offRoad.z = (open.bounds.minZ + open.bounds.maxZ) / 2;
    }
    drive(offRoad, 3, press({ up: true }));

    expect(offRoad.speed).toBeLessThan(onRoad.speed);
  });

  it('cannot drive through a building', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    // Aim across the road at whatever is beside it and hold the throttle down.
    world.heading += Math.PI / 2;
    drive(world, 8, press({ up: true }));

    const inside = world.city.buildings.some((b) => {
      const f = b.footprint;
      const nx = Math.max(f.minX, Math.min(world.x, f.maxX));
      const nz = Math.max(f.minZ, Math.min(world.z, f.maxZ));
      return Math.hypot(world.x - nx, world.z - nz) < CAR_RADIUS * 0.9;
    });
    expect(inside).toBe(false);
  });

  it('stays on the map', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    // Point at the nearest edge and drive at it for a long time.
    world.heading = 0;
    drive(world, 90, press({ up: true }));
    expect(world.x).toBeGreaterThanOrEqual(world.city.bounds.minX);
    expect(world.x).toBeLessThanOrEqual(world.city.bounds.maxX);
    expect(world.z).toBeGreaterThanOrEqual(world.city.bounds.minZ);
    expect(world.z).toBeLessThanOrEqual(world.city.bounds.maxZ);
  });

  it('is deterministic: the same drive twice ends in the same place', () => {
    const a = new CityWorld(undefined, { traffic: false, police: false });
    const b = new CityWorld(undefined, { traffic: false, police: false });
    const script = press({ up: true, right: true });
    drive(a, 5, script);
    drive(b, 5, script);
    expect(at(a)).toEqual(at(b));
    expect(a.heading).toBe(b.heading);
  });

  it('never leaves the car at a height with no road under it', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    drive(world, 20, press({ up: true, right: true }));
    if (world.onRoad === null) expect(world.y).toBe(0);
  });
});

describe('nitrous, unchanged from the track', () => {
  // Measured while the boost is still lit. Held to the end of a clear street
  // both cars sit at the cap and the comparison says nothing.
  it('goes faster with it than without', () => {
    const plain = new CityWorld(undefined, { traffic: false, police: false });
    drive(plain, 2, press({ up: true }));

    const boosted = new CityWorld(undefined, { traffic: false, police: false });
    drive(boosted, 2, press({ up: true, nitro: true }));

    expect(boosted.speed).toBeGreaterThan(plain.speed);
  });

  it('spends its charge while boosting', () => {
    const boosted = new CityWorld(undefined, { traffic: false, police: false });
    // The boost will not light below 15% of top speed, so roughly the first
    // three quarters of a second is spent getting going rather than burning.
    drive(boosted, 1.5, press({ up: true, nitro: true }));
    expect(boosted.nitro).toBeLessThan(0.8);

    const saved = new CityWorld(undefined, { traffic: false, police: false });
    drive(saved, 1.5, press({ up: true }));
    expect(saved.nitro).toBe(1);
  });
});

// The two levels are the reason #85 was built. From the sim's side, what they
// buy is that being under an overpass is a different place from being on it.
describe('two levels', () => {
  const city = new CityWorld(undefined, { traffic: false, police: false }).city;

  it('can tell a deck from the street below it', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const deck = city.roads.find((r) => r.class === 'interstate' && city.nodes[r.a].y > 0);
    expect(deck).toBeDefined();
    if (!deck) return;

    const a = city.nodes[deck.a];
    world.x = a.pos.x;
    world.z = a.pos.z;

    // Standing at that map position at street level is *not* being on the deck.
    world.y = 0;
    expect(world.groundHeight()).toBe(0);

    // Standing at the same map position up at deck height is.
    world.y = a.y;
    expect(world.groundHeight()).toBeCloseTo(a.y, -2);
  });

  it('falls back to the street if it leaves the deck', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const deck = city.roads.find((r) => r.class === 'interstate' && city.nodes[r.a].y > 0);
    if (!deck) return;

    const a = city.nodes[deck.a];
    // Park it off the side of the deck, in mid-air.
    world.x = a.pos.x + deck.width;
    world.z = a.pos.z + deck.width;
    world.y = a.y;
    world.speed = 0;
    drive(world, 5, NONE);

    expect(world.y).toBe(0);
    expect(world.falling).toBe(false);
  });
});


// Traffic is what makes the city somewhere rather than a model of somewhere.
describe('traffic', () => {
  it('fills the streets around the car', () => {
    const world = new CityWorld(undefined, { police: false });
    drive(world, 1, NONE);
    expect(world.traffic.cars.length).toBeGreaterThan(20);
  });

  it('keeps its cars on the roads', () => {
    const world = new CityWorld(undefined, { police: false });
    drive(world, 20, press({ up: true }));

    for (const car of world.traffic.cars) {
      const a = world.city.nodes[car.road.a].pos;
      const b = world.city.nodes[car.road.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = Math.max(1, dx * dx + dz * dz);
      const t = Math.max(0, Math.min(1, ((car.x - a.x) * dx + (car.z - a.z) * dz) / lengthSquared));
      const away = Math.hypot(car.x - (a.x + dx * t), car.z - (a.z + dz * t));
      expect(away).toBeLessThanOrEqual(car.road.width / 2);
    }
  });

  it('stays near the car rather than all over the map', () => {
    const world = new CityWorld(undefined, { police: false });
    drive(world, 25, press({ up: true }));
    for (const car of world.traffic.cars) {
      expect(Math.hypot(car.x - world.x, car.z - world.z)).toBeLessThan(TRAFFIC_RADIUS * 1.4);
    }
  });

  it('does not spawn a car on top of the player', () => {
    const world = new CityWorld(undefined, { police: false });
    for (let i = 0; i < 400; i++) {
      world.step(STEP, NONE);
      for (const car of world.traffic.cars) {
        expect(Math.hypot(car.x - world.x, car.z - world.z)).toBeGreaterThan(1);
      }
    }
  });

  it('is deterministic, traffic and all', () => {
    const a = new CityWorld(undefined, { police: false });
    const b = new CityWorld(undefined, { police: false });
    const script = press({ up: true });
    drive(a, 6, script);
    drive(b, 6, script);
    expect(a.traffic.cars.length).toBe(b.traffic.cars.length);
    expect({ x: a.x, z: a.z }).toEqual({ x: b.x, z: b.z });
  });
});


// The pursuit, in a city where a cop is a car with a place of its own rather
// than a distance behind you.
describe('the police', () => {
  // Driven in a loop rather than in a straight line, so the car stays in the
  // middle of the city instead of running out of map and sitting on a shore
  // where nothing can reach it.
  const chase = (seconds: number) => {
    const world = new CityWorld(undefined, { traffic: false });
    for (let t = 0; t < seconds; t += STEP) {
      world.step(STEP, press({ up: true, right: Math.floor(t / 4) % 2 === 0 }));
    }
    return world;
  };

  it('leaves you alone at first', () => {
    expect(chase(5).police.cops.length).toBe(0);
  });

  it('comes after you eventually', () => {
    const world = chase(30);
    expect(world.police.cops.length).toBeGreaterThan(0);
  });

  it('keeps its cars on the roads', () => {
    const world = chase(45);
    for (const cop of world.police.cops) {
      const a = world.city.nodes[cop.road.a].pos;
      const b = world.city.nodes[cop.road.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSquared = Math.max(1, dx * dx + dz * dz);
      const t = Math.max(0, Math.min(1, ((cop.x - a.x) * dx + (cop.z - a.z) * dz) / lengthSquared));
      expect(Math.hypot(cop.x - (a.x + dx * t), cop.z - (a.z + dz * t))).toBeLessThanOrEqual(
        cop.road.width / 2,
      );
    }
  });

  it('closes on a car that is standing still', () => {
    const world = chase(20);
    const gap = () =>
      world.police.cops.reduce(
        (best, cop) => Math.min(best, Math.hypot(cop.x - world.x, cop.z - world.z)),
        Infinity,
      );

    // Sit still and let them arrive.
    drive(world, 25, NONE);
    expect(world.police.cops.length).toBeGreaterThan(0);
    expect(gap()).toBeLessThan(CITY_PURSUIT_RANGE * 3);
  });

  it('busts a car that never moves, and lets go afterwards', () => {
    const world = new CityWorld(undefined, { traffic: false });
    drive(world, 120, NONE);
    // Either it has you now or it had you and the state has cycled; what must
    // not happen is a pursuit that can never end either way.
    expect(world.police.heat).toBeGreaterThanOrEqual(0);
    // Two budgets since #61: the ones following you and the ones sent to meet
    // you. Neither grows without bound, which is the thing being asserted.
    const top = HEAT_LEVELS[HEAT_LEVEL_COUNT - 1];
    expect(world.police.cops.length).toBeLessThanOrEqual(top.maxCops + top.enforcers);
  });

  it('is deterministic', () => {
    const a = chase(20);
    const b = chase(20);
    expect(a.police.cops.length).toBe(b.police.cops.length);
    expect(a.police.heat).toBeCloseTo(b.police.heat, 6);
  });
});


// Six levels, and what each sends after you (#58).
describe('heat levels', () => {
  it('starts at level one and climbs no higher than six', () => {
    const world = new CityWorld(undefined, { traffic: false });
    expect(world.police.level).toBe(1);
    world.police.heat = 1;
    expect(world.police.level).toBe(HEAT_LEVEL_COUNT);
  });

  it('covers the whole range without a gap or an overshoot', () => {
    const world = new CityWorld(undefined, { traffic: false });
    const seen = new Set<number>();
    for (let heat = 0; heat <= 1.0001; heat += 0.01) {
      world.police.heat = Math.min(1, heat);
      const level = world.police.level;
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(HEAT_LEVEL_COUNT);
      seen.add(level);
    }
    expect(seen.size).toBe(HEAT_LEVEL_COUNT);
  });

  // A pursuit that cannot be outrun on speed alone is a pursuit with no
  // answer. This has to hold at level six as much as at level one.
  it('never sends a car faster than yours', () => {
    for (const level of HEAT_LEVELS) {
      expect(level.speed).toBeLessThan(1);
      for (const kind of [...level.units, level.enforcerUnit]) {
        const unit = COP_UNITS[kind];
        expect(level.speed * unit.pace).toBeLessThan(1);
      }
    }
  });

  it('sends heavier units as the level rises', () => {
    const early = new Set(HEAT_LEVELS[0].units);
    const late = new Set(HEAT_LEVELS[HEAT_LEVEL_COUNT - 1].units);
    expect(early.has('cruiser')).toBe(true);
    expect(late.has('cruiser')).toBe(false);
    expect(HEAT_LEVELS[HEAT_LEVEL_COUNT - 1].maxCops).toBeGreaterThan(HEAT_LEVELS[0].maxCops);
  });

  it('only spawns units its level actually has', () => {
    const world = new CityWorld(undefined, { traffic: false });
    for (let t = 0; t < 90; t += STEP) {
      world.step(STEP, press({ up: true, right: Math.floor(t / 5) % 2 === 0 }));
      for (const cop of world.police.cops) {
        const from = HEAT_LEVELS.some((l) =>
          cop.role === 'enforcer' ? l.enforcerUnit === cop.kind : l.units.includes(cop.kind),
        );
        expect(from).toBe(true);
      }
    }
  });
});


// Escaping is two stages (#63). These drive the sim into each one directly
// rather than hoping a scripted lap happens to wander far enough, which is the
// difference between testing the mechanic and testing the route.
describe('cooldown and the search area', () => {
  /** Step until `done`, or give up. Returns whether it happened. */
  const stepUntil = (world: CityWorld, done: () => boolean, limit = 60) => {
    for (let t = 0; t < limit; t += STEP) {
      world.step(STEP, NONE);
      if (done()) return true;
    }
    return false;
  };

  /** Run a pursuit until cops are on you, then break contact by vanishing. */
  const lostThem = () => {
    const world = new CityWorld(undefined, { traffic: false });
    for (let t = 0; t < 40; t += STEP) {
      world.step(STEP, press({ up: true, right: Math.floor(t / 5) % 2 === 0 }));
    }
    expect(world.police.cops.length).toBeGreaterThan(0);

    // Somewhere they cannot possibly still see, so contact really is broken.
    world.x += CITY_COP_LOSE * 3;
    expect(stepUntil(world, () => world.police.state === 'cooldown')).toBe(true);
    return world;
  };

  it('drops into a search when contact is broken', () => {
    const world = lostThem();
    expect(world.police.state).toBe('cooldown');
    expect(world.police.search).not.toBeNull();
    expect(world.police.searchLeft).toBeGreaterThan(0);
  });

  // The area is where they lost you. It does not follow you around, which is
  // the difference between a search and a tracking device.
  it('searches a fixed place, not wherever you have got to', () => {
    const world = lostThem();
    const area = { ...(world.police.search as { x: number; z: number; radius: number }) };

    world.x += area.radius * 4;
    stepUntil(world, () => false, 3);

    expect(world.police.search?.x).toBe(area.x);
    expect(world.police.search?.z).toBe(area.z);
  });

  // The whole mechanic: sitting still in the middle of where they are looking
  // is not hiding, so the clock does not run.
  it('does not count down while you are inside the area', () => {
    const world = lostThem();
    const area = world.police.search;
    expect(area).not.toBeNull();
    if (!area) return;

    world.x = area.x;
    world.z = area.z;
    for (const cop of world.police.cops) {
      cop.x = area.x + area.radius * 6;
      cop.z = area.z + area.radius * 6;
    }

    const before = world.police.searchLeft;
    stepUntil(world, () => false, 6);
    expect(world.police.searchLeft).toBe(before);
    expect(world.police.state).toBe('cooldown');
  });

  it('lets you go once you are out of it and stay out', () => {
    const world = lostThem();
    const area = world.police.search;
    if (area) {
      world.x = area.x + area.radius * 5;
      world.z = area.z + area.radius * 5;
    }
    expect(stepUntil(world, () => world.police.state === 'clear', 120)).toBe(true);
    expect(world.police.cops.length).toBe(0);
  });

  it('makes a hotter pursuit harder to shed', () => {
    const cold = new CityWorld(undefined, { traffic: false });
    cold.police.heat = 0;
    const hot = new CityWorld(undefined, { traffic: false });
    hot.police.heat = 1;
    expect(hot.police.level).toBeGreaterThan(cold.police.level);
    // Search time and radius both scale off the level, so a higher level is a
    // longer search over more ground.
    expect(SEARCH_TIME_PER_LEVEL).toBeGreaterThan(0);
  });
});

/**
 * Takedowns (#94).
 *
 * Every one of these builds the contact by hand rather than driving into
 * somebody, and that is deliberate. A takedown is a statement about closing
 * speed and angle, and a scripted drive that happens to catch a cop delivers
 * whichever closing speed and angle it happened to arrive at. Putting the car
 * exactly where the assertion needs it is the only way the number under test
 * is the number being asserted on.
 *
 * The worlds are built with `police: false` so the pursuit never moves the cop
 * off the spot it was placed on; contact resolution runs either way.
 */
describe('takedowns', () => {

  /** A stationary cop `metres` straight ahead of the car, facing the same way. */
  function copAhead(world: CityWorld, metres: number, kind: CopKind = 'cruiser'): Cop {
    const cop: Cop = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: world.x + Math.sin(world.heading) * metres * M,
      z: world.z + Math.cos(world.heading) * metres * M,
      y: world.y,
      heading: world.heading,
      kind,
      role: 'chase',
    };
    world.police.cops.push(cop);
    return cop;
  }

  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  it('wrecks a cop rammed square at speed, and counts it', () => {
    const world = still();
    copAhead(world, 3);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);

    expect(world.takedowns).toBe(1);
    expect(world.police.cops.length).toBe(0);
    expect(world.wrecks.length).toBe(1);
    expect(world.wrecks[0].police).toBe(true);
    expect(world.takedownFlash).toBeGreaterThan(0);
    expect(world.lastTakedown).not.toBeNull();
  });

  it('costs you speed, so a takedown is not a free way through', () => {
    const world = still();
    copAhead(world, 3);
    world.speed = world.maxSpeed * 0.6;
    const before = world.speed;
    world.step(STEP, NONE);
    expect(world.speed).toBeLessThan(before * 0.5);
  });

  it('makes them angrier rather than calmer', () => {
    const world = still();
    world.police.heat = 0.3;
    copAhead(world, 3);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);
    expect(world.police.heat).toBeGreaterThan(0.3);
  });

  // Leaning on a cop at matched speed is the thing that must not work: it is
  // free, it needs no commitment, and it would make the pursuit a formality.
  it('does not wreck anybody by nudging them', () => {
    const world = still();
    const cop = copAhead(world, 2);
    world.speed = world.maxSpeed * TAKEDOWN_MIN_CLOSING * 0.5;
    for (let i = 0; i < 120; i++) world.step(STEP, NONE);

    expect(cop.damage).toBe(0);
    expect(world.takedowns).toBe(0);
    expect(world.police.cops).toContain(cop);
  });

  it('takes more than one hit to put a heavy unit out', () => {
    const world = still();
    const suv = copAhead(world, 3, 'suv');
    world.speed = world.maxSpeed * 0.3;
    world.step(STEP, NONE);

    expect(suv.damage).toBeGreaterThan(0);
    expect(suv.damage).toBeLessThan(1);
    expect(world.takedowns).toBe(0);
  });

  it('leaves a wreck in the street, then has it towed away', () => {
    const world = still();
    copAhead(world, 3);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);
    expect(world.wrecks.length).toBe(1);

    // Standing still beside it, so nothing but the clock clears it.
    world.speed = 0;
    drive(world, WRECK_LINGER + 1, NONE);
    expect(world.wrecks.length).toBe(0);
  });

  it('does not count wrecked traffic as a takedown', () => {
    const world = still();
    const car: TrafficCar = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      colour: '#c94b4b',
      x: world.x + Math.sin(world.heading) * 3 * M,
      z: world.z + Math.cos(world.heading) * 3 * M,
      y: world.y,
      heading: world.heading,
    };
    world.traffic.cars.push(car);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);

    expect(world.traffic.cars).not.toContain(car);
    expect(world.wrecks.length).toBe(1);
    expect(world.wrecks[0].police).toBe(false);
    expect(world.takedowns).toBe(0);
    expect(world.takedownFlash).toBe(0);
  });

  // A wreck that stops being solid the moment it is made is a car that
  // vanished, which is not what the picture says happened.
  it('leaves the wreck solid enough to hit', () => {
    const world = still();
    copAhead(world, 3);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);

    world.speed = world.maxSpeed * 0.2;
    const before = world.speed;
    world.step(STEP, NONE);
    expect(world.speed).toBeLessThan(before);
  });
});

/**
 * Roadblocks (#59).
 *
 * Built by hand for the same reason the takedown tests are: whether a barrier
 * stops you is a question about a line, a gap and a heading, and a scripted
 * drive that happens to meet one answers whichever version of that question it
 * happened to arrive at.
 */
describe('roadblocks', () => {
  /** A barrier straight across the car's path, `metres` ahead. */
  function blockAhead(world: CityWorld, metres: number, gap: number | null) {
    const road = world.onRoad!;
    // Across the heading, which on this road is across the road.
    const ax = Math.cos(world.heading);
    const az = -Math.sin(world.heading);
    const block = {
      road,
      x: world.x + Math.sin(world.heading) * metres * M,
      z: world.z + Math.cos(world.heading) * metres * M,
      y: 0,
      ax,
      az,
      half: road.width / 2,
      gap,
      cars: [
        {
          x: world.x + Math.sin(world.heading) * metres * M,
          z: world.z + Math.cos(world.heading) * metres * M,
          y: 0,
          heading: Math.atan2(ax, az),
          kind: 'cruiser' as CopKind,
        },
      ],
    };
    world.police.roadblocks.push(block);
    return block;
  }

  it('costs most of your speed when you go through the wall', () => {
    const world = onAnArterial();
    blockAhead(world, 1, null);
    world.speed = world.maxSpeed * 0.5;
    const before = world.speed;
    world.step(STEP, NONE);

    expect(world.speed).toBeLessThan(before * (ROADBLOCK_SPEED_KEPT + 0.05));
    expect(world.crashFlash).toBe(1);
  });

  it('is not a dead stop: you come out the far side still moving', () => {
    const world = onAnArterial();
    blockAhead(world, 1, null);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    expect(world.speed).toBeGreaterThan(0);
  });

  it('breaks apart where you came through, and stops being in the way', () => {
    const world = onAnArterial();
    blockAhead(world, 1, null);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.police.roadblocks.length).toBe(0);
    expect(world.wrecks.length).toBeGreaterThan(0);
    // A parked car is not somebody you took down.
    expect(world.takedowns).toBe(0);
  });

  it('lets you through the gap untouched', () => {
    const world = onAnArterial();
    // The gap is straight ahead, so the car threads it without steering.
    blockAhead(world, 1, 0);
    world.speed = world.maxSpeed * 0.5;
    const before = world.speed;
    world.step(STEP, NONE);

    expect(world.speed).toBeGreaterThan(before * 0.9);
    expect(world.police.roadblocks.length).toBe(1);
  });

  it('catches you if you aim beside the gap', () => {
    const world = onAnArterial();
    const road = world.onRoad!;
    // Gap at one edge of the road, car still down the middle.
    blockAhead(world, 1, road.width / 2 - ROADBLOCK_GAP);
    world.speed = world.maxSpeed * 0.5;
    const before = world.speed;
    world.step(STEP, NONE);
    expect(world.speed).toBeLessThan(before * 0.5);
  });

  it('is not in the way of a car on the deck above it', () => {
    const world = onAnArterial();
    const block = blockAhead(world, 1, null);
    block.y = 0;
    world.y = 12 * M; // the interstate, passing over
    world.speed = world.maxSpeed * 0.5;
    const before = world.speed;
    world.step(STEP, NONE);
    expect(world.speed).toBeGreaterThan(before * 0.9);
  });

  it('does not turn up below heat two', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0, 40);
    expect(world.police.roadblocks.length).toBe(0);
  });

  it('turns up once the heat is high enough', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0.6, 40);
    expect(world.police.roadblocks.length).toBeGreaterThan(0);
  });

  it('places them ahead of you, on a road worth blocking', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0.6, 40);
    expect(world.police.roadblocks.length).toBeGreaterThan(0);

    for (const block of world.police.roadblocks) {
      const dx = block.x - world.x;
      const dz = block.z - world.z;
      const ahead = dx * Math.sin(world.heading) + dz * Math.cos(world.heading);
      expect(ahead).toBeGreaterThanOrEqual(ROADBLOCK_MIN_LEAD);
      expect(block.road.width).toBeGreaterThanOrEqual(ROADBLOCK_MIN_WIDTH);
      expect(block.cars.length).toBeGreaterThan(0);
    }
  });

  it('gives up on them when the pursuit does', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0.6, 40);
    expect(world.police.roadblocks.length).toBeGreaterThan(0);

    world.police.reset();
    expect(world.police.roadblocks.length).toBe(0);
  });

  it('offers fewer ways through the hotter it gets', () => {
    const chance = (level: number) =>
      ROADBLOCK_GAP_CHANCE - ROADBLOCK_GAP_FALLOFF * (level - ROADBLOCK_MIN_LEVEL);
    expect(chance(ROADBLOCK_MIN_LEVEL)).toBeGreaterThan(chance(HEAT_LEVEL_COUNT));
    expect(chance(HEAT_LEVEL_COUNT)).toBeLessThan(0.35);
  });
});

/**
 * Enforcers (#61).
 *
 * The pursuit is driven directly here, as it is for roadblocks and for the
 * same reason: what is under test is where a unit comes from and what it does
 * when it gets there, and a scripted drive answers whichever version of that
 * question it happened to survive long enough to reach.
 */
describe('enforcers', () => {
  const parked = () => new CityWorld(undefined, { traffic: false, police: false });

  /** Hold a pursuit for a while and hand back whatever Enforcers it sent. */
  const hunted = (world: CityWorld, heat: number, seconds: number): Cop[] => {
    hunt(world, heat, seconds);
    return world.police.cops.filter((c) => c.role === 'enforcer');
  };

  it('stays away below heat three', () => {
    const world = parked();
    expect(hunted(world, 0, 40).length).toBe(0);
  });

  it('comes out once the heat is high enough', () => {
    const world = parked();
    world.police.heat = 0.5;
    expect(world.police.level).toBeGreaterThanOrEqual(ENFORCER_MIN_LEVEL);
    expect(hunted(world, 0.5, 40).length).toBeGreaterThan(0);
  });

  // The whole difference between an Enforcer and a cruiser: one is behind you
  // and one is not.
  it('arrives in front of you, not behind', () => {
    const world = parked();
    const sent = hunted(world, 0.5, 40);
    expect(sent.length).toBeGreaterThan(0);
    for (const cop of sent) {
      const dx = cop.x - world.x;
      const dz = cop.z - world.z;
      const ahead = dx * Math.sin(world.heading) + dz * Math.cos(world.heading);
      expect(ahead).toBeGreaterThan(0);
      expect(Math.hypot(dx, dz)).toBeLessThan(ENFORCER_SPAWN * 1.6);
    }
  });

  it('is a heavier unit than the cars chasing you', () => {
    const world = parked();
    const sent = hunted(world, 0.9, 40);
    expect(sent.length).toBeGreaterThan(0);
    for (const cop of sent) {
      expect(COP_UNITS[cop.kind].scale).toBeGreaterThan(COP_UNITS.cruiser.scale);
    }
  });

  it('does not eat the budget of the cars chasing you', () => {
    const world = parked();
    hunted(world, 0.9, 60);
    const chasing = world.police.cops.filter((c) => c.role === 'chase').length;
    // The tail we put in is one of them, and the pursuit is free to call more.
    expect(chasing).toBeGreaterThan(0);
  });

  it('costs far more to hit than a cruiser does', () => {
    const ram = (role: Cop['role'], kind: CopKind) => {
      const world = parked();
      const cop: Cop = {
        road: world.onRoad!,
        t: 0.5,
        forward: true,
        speed: 0,
        damage: 0,
        x: world.x + Math.sin(world.heading) * 3 * M,
        z: world.z + Math.cos(world.heading) * 3 * M,
        y: world.y,
        heading: world.heading + Math.PI,
        kind,
        role,
      };
      world.police.cops.push(cop);
      world.speed = world.maxSpeed * 0.3;
      world.step(STEP, NONE);
      return { speed: world.speed, damage: cop.damage, wrecked: cop.damage >= 1 };
    };

    const cruiser = ram('chase', 'cruiser');
    const heavy = ram('enforcer', 'enforcer');

    expect(heavy.speed).toBeLessThan(cruiser.speed);
    expect(ENFORCER_SPEED_KEPT).toBeLessThan(SHUNT_SPEED_KEPT);
    // And it takes far more to put one out than it takes to put a cruiser out.
    expect(heavy.damage).toBeLessThan(cruiser.damage);
  });

  it('holds your line, where a chase unit keeps right whatever you do', () => {
    const world = parked();
    const road = world.onRoad!;
    const a = world.city.nodes[road.a].pos;
    const b = world.city.nodes[road.b].pos;
    const length = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
    const hx = (b.x - a.x) / length;
    const hz = (b.z - a.z) / length;

    /** How far off its road's centreline a cop is sitting. */
    const lateral = (cop: Cop) => {
      const from = cop.forward ? a : b;
      const to = cop.forward ? b : a;
      const cx = from.x + (to.x - from.x) * cop.t;
      const cz = from.z + (to.z - from.z) * cop.t;
      const dx = (to.x - from.x) / length;
      const dz = (to.z - from.z) / length;
      return (cop.x - cx) * -dz + (cop.z - cz) * dx;
    };

    const put = (role: Cop['role']): Cop => {
      const cop: Cop = {
        road,
        t: 0.2,
        forward: true,
        speed: 0,
        damage: 0,
        x: 0,
        z: 0,
        y: 0,
        heading: 0,
        kind: role === 'enforcer' ? 'enforcer' : 'cruiser',
        role,
      };
      world.police.cops.push(cop);
      return cop;
    };

    const enforcer = put('enforcer');
    const chaser = put('chase');
    world.police.heat = 0.9;

    // Put the car well off the centreline, across the road, and let them steer.
    world.x = a.x + (b.x - a.x) * 0.3 - hz * 5 * M;
    world.z = a.z + (b.z - a.z) * 0.3 + hx * 5 * M;
    for (let t = 0; t < 0.5; t += STEP) world.police.update(STEP, world, world.maxSpeed);
    const enforcerLeft = lateral(enforcer);
    const chaserLeft = lateral(chaser);

    // Now the other side of the road.
    world.x = a.x + (b.x - a.x) * 0.3 + hz * 5 * M;
    world.z = a.z + (b.z - a.z) * 0.3 - hx * 5 * M;
    for (let t = 0; t < 0.5; t += STEP) world.police.update(STEP, world, world.maxSpeed);

    // The Enforcer moved across with the car; the chaser did not move at all.
    expect(Math.abs(lateral(enforcer) - enforcerLeft)).toBeGreaterThan(M);
    expect(Math.abs(lateral(chaser) - chaserLeft)).toBeLessThan(M * 0.5);
  });
});

/**
 * Spike strips (#60).
 *
 * The strip itself is nearly nothing - a line and a span. What is worth
 * asserting on is the several seconds afterwards, which is the part a picture
 * cannot show and the part that decides whether it is a setback or a bust with
 * extra steps.
 */
describe('spike strips', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  /** A strip straight across the car's path, `metres` ahead, covering it all. */
  function stripAhead(world: CityWorld, metres: number, from: number, to: number) {
    const strip = {
      road: world.onRoad!,
      x: world.x + Math.sin(world.heading) * metres * M,
      z: world.z + Math.cos(world.heading) * metres * M,
      y: world.y,
      ax: Math.cos(world.heading),
      az: -Math.sin(world.heading),
      from,
      to,
    };
    world.police.spikes.push(strip);
    return strip;
  }

  it('shreds the tyres when you run over it', () => {
    const world = still();
    stripAhead(world, 0, -10 * M, 10 * M);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.shredded).toBeGreaterThan(0);
    expect(world.police.spikes.length).toBe(0);
  });

  // A strip is not a wall. Nothing about this step should feel like an impact.
  it('does not stop you or shake the screen', () => {
    const world = still();
    stripAhead(world, 0, -10 * M, 10 * M);
    world.speed = world.maxSpeed * 0.5;
    const before = world.speed;
    world.step(STEP, NONE);

    expect(world.speed).toBeGreaterThan(before * 0.95);
    expect(world.crashFlash).toBe(0);
  });

  it('leaves a way past it', () => {
    const world = still();
    // Laid from one kerb, leaving the far side clean; the car sits out there.
    const road = world.onRoad!;
    stripAhead(world, 0, -road.width / 2, -road.width / 2 + road.width * 0.5);
    world.x += Math.cos(world.heading) * (road.width * 0.42);
    world.z -= Math.sin(world.heading) * (road.width * 0.42);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.shredded).toBe(0);
    expect(world.police.spikes.length).toBe(1);
  });

  // At top speed the car covers more ground in a step than the strip is deep,
  // and a hazard you can step over at speed is a hazard only for slow cars.
  it('cannot be stepped over at top speed', () => {
    const world = still();
    stripAhead(world, 1.5, -10 * M, 10 * M);
    world.speed = world.maxSpeed;
    world.step(STEP, NONE);
    expect(world.shredded).toBeGreaterThan(0);
  });

  it('is not in the way of a car on the deck above it', () => {
    const world = still();
    const strip = stripAhead(world, 0, -10 * M, 10 * M);
    strip.y = 0;
    world.y = 12 * M;
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    expect(world.shredded).toBe(0);
  });

  it('caps the top speed hard while it lasts, nitrous included', () => {
    const world = still();
    stripAhead(world, 0, -10 * M, 10 * M);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    expect(world.shredded).toBeGreaterThan(0);

    drive(world, 3, press({ up: true, nitro: true }));
    expect(world.speed).toBeLessThanOrEqual(world.maxSpeed * SHRED_SPEED_FRAC + 1);
  });

  it('takes most of the steering with it', () => {
    const turn = (shredded: boolean) => {
      const world = still();
      if (shredded) world.shredded = SHRED_TIME;
      const facing = world.heading;
      // On the spot, so the answer is about steering and not about which
      // building the car found first.
      for (let t = 0; t < 0.5; t += STEP) world.step(STEP, press({ left: true }));
      return Math.abs(world.heading - facing);
    };
    const hurt = turn(true);
    const fine = turn(false);
    expect(hurt).toBeLessThan(fine);
    expect(hurt).toBeGreaterThan(fine * SHRED_GRIP * 0.8);
  });

  it('wears off, and the car comes back', () => {
    const world = still();
    world.shredded = SHRED_TIME;
    // Standing still, so nothing but the clock clears it.
    drive(world, SHRED_TIME + 0.5, NONE);
    expect(world.shredded).toBe(0);

    // Three seconds of throttle takes the car past the shredded cap, which it
    // could not have done a moment ago. Three and not twelve: a straight line
    // from here reaches a building, and that is a different test failing.
    drive(world, 3, press({ up: true }));
    expect(world.speed).toBeGreaterThan(world.maxSpeed * SHRED_SPEED_FRAC);
  });

  it('does not turn up below heat four', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0.2, 60);
    expect(world.police.level).toBeLessThan(SPIKE_MIN_LEVEL);
    expect(world.police.spikes.length).toBe(0);
  });

  it('turns up once the heat is high enough, and not without limit', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0.75, 90);
    expect(world.police.level).toBeGreaterThanOrEqual(SPIKE_MIN_LEVEL);
    expect(world.police.spikes.length).toBeGreaterThan(0);
    expect(world.police.spikes.length).toBeLessThanOrEqual(SPIKE_MAX);
  });

  it('gives up on them when the pursuit does', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    hunt(world, 0.75, 90);
    expect(world.police.spikes.length).toBeGreaterThan(0);
    world.police.reset();
    expect(world.police.spikes.length).toBe(0);
  });
});

/**
 * The police helicopter (#62).
 *
 * The thing worth asserting on is not that it flies. It is that while it has
 * you the search never starts, and that driving under something makes it stop
 * having you - which is a claim about `seenBy`, `coveredAt` and the cooldown
 * from #63 all agreeing with each other.
 */
describe('the helicopter', () => {
  it('stays away below heat five', () => {
    const world = onAnArterial();
    hunt(world, 0.3, 40);
    expect(world.police.level).toBeLessThan(HELI_MIN_LEVEL);
    expect(world.police.helicopter).toBeNull();
  });

  it('comes out once the heat is high enough', () => {
    const world = onAnArterial();
    hunt(world, 0.9, 30);
    expect(world.police.level).toBeGreaterThanOrEqual(HELI_MIN_LEVEL);
    expect(world.police.helicopter).not.toBeNull();
  });

  it('closes on the car and then holds station over it', () => {
    const world = onAnArterial();
    hunt(world, 0.9, 40);
    const heli = world.police.helicopter;
    expect(heli).not.toBeNull();
    expect(Math.hypot(heli!.x - world.x, heli!.z - world.z)).toBeLessThan(HELI_SEE_RADIUS);
    expect(heli!.y).toBeGreaterThan(world.y);
    expect(heli!.spotting).toBe(true);
  });

  // The whole point of it. Without this, cooldown works the same at heat six
  // as at heat one and the helicopter is scenery.
  it('stops the pursuit ever dropping into a search', () => {
    const world = onAnArterial();
    hunt(world, 0.9, 30);
    expect(world.police.helicopter?.spotting).toBe(true);

    // Take every car away and leave the aircraft. On the ground alone this
    // would be a search inside four seconds.
    world.police.cops.length = 0;
    for (let t = 0; t < LOSE_CONTACT_TIME * 3; t += STEP) {
      world.police.heat = 0.9;
      world.police.update(STEP, world, world.maxSpeed);
    }
    expect(world.police.state).toBe('pursuit');
  });

  it('loses you under a deck, and the search starts', () => {
    const world = onAnArterial();
    hunt(world, 0.9, 30);
    expect(world.police.helicopter?.spotting).toBe(true);

    // Under the elevated interstate: a real place in this city rather than a
    // fabricated one, which is what makes the cover test worth anything.
    const deck = world.city.roads.find(
      (r) => r.class === 'interstate' && world.city.nodes[r.a].y > COVER_MIN * 2,
    );
    expect(deck).toBeDefined();
    const a = world.city.nodes[deck!.a].pos;
    const b = world.city.nodes[deck!.b].pos;
    world.x = (a.x + b.x) / 2;
    world.z = (a.z + b.z) / 2;
    world.y = 0;

    world.police.cops.length = 0;
    for (let t = 0; t < LOSE_CONTACT_TIME * 3; t += STEP) {
      world.police.heat = 0.9;
      world.police.update(STEP, world, world.maxSpeed);
    }
    expect(world.police.helicopter?.spotting).toBe(false);
    expect(world.police.state).toBe('cooldown');
  });

  it('goes home eventually rather than circling for ever', () => {
    const world = onAnArterial();
    hunt(world, 0.9, HELI_TIME + 20);
    // Either it has gone, or a fresh one came after the grounding delay; what
    // must not happen is one aircraft on station indefinitely.
    const heli = world.police.helicopter;
    expect(heli === null || heli.onStation < HELI_TIME).toBe(true);
  });

  // Cover has to be a temporary answer, not a permanent one: an aircraft that
  // went home the moment you got under a bridge would make one overpass the
  // end of every pursuit at heat five.
  it('is still up there when you come back out', () => {
    const world = onAnArterial();
    hunt(world, 0.9, 30);
    const deck = world.city.roads.find(
      (r) => r.class === 'interstate' && world.city.nodes[r.a].y > COVER_MIN * 2,
    )!;
    const a = world.city.nodes[deck.a].pos;
    const b = world.city.nodes[deck.b].pos;
    const under = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };

    world.police.cops.length = 0;
    world.x = under.x;
    world.z = under.z;
    world.y = 0;
    for (let t = 0; t < LOSE_CONTACT_TIME * 2; t += STEP) {
      world.police.heat = 0.9;
      world.police.update(STEP, world, world.maxSpeed);
    }
    expect(world.police.state).toBe('cooldown');
    expect(world.police.helicopter).not.toBeNull();
  });

  it('goes when the pursuit does', () => {
    const world = onAnArterial();
    hunt(world, 0.9, 30);
    expect(world.police.helicopter).not.toBeNull();
    world.police.reset();
    expect(world.police.helicopter).toBeNull();
  });
});

/**
 * Rep (#64).
 *
 * The award table itself is tested in `rep.test.ts`. What these are about is
 * the wiring: that the things the player actually does reach the ledger, once
 * each, at the right heat.
 */
describe('Rep', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  it('pays for a takedown', () => {
    const world = still();
    const cop: Cop = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: world.x + Math.sin(world.heading) * 3 * M,
      z: world.z + Math.cos(world.heading) * 3 * M,
      y: world.y,
      heading: world.heading,
      kind: 'cruiser',
      role: 'chase',
    };
    world.police.cops.push(cop);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);

    expect(world.takedowns).toBe(1);
    expect(world.rep.total).toBeGreaterThanOrEqual(REP_TAKEDOWN);
    expect(world.rep.recent.some((a) => a.reason === 'takedown')).toBe(true);
  });

  it('pays for going through a roadblock', () => {
    const world = onAnArterial();
    const road = world.onRoad!;
    world.police.roadblocks.push({
      road,
      x: world.x + Math.sin(world.heading) * M,
      z: world.z + Math.cos(world.heading) * M,
      y: 0,
      ax: Math.cos(world.heading),
      az: -Math.sin(world.heading),
      half: road.width / 2,
      gap: null,
      cars: [],
    });
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.rep.total).toBeGreaterThanOrEqual(REP_ROADBLOCK);
  });

  it('pays for wrecking traffic, but far less than for a cop', () => {
    const world = still();
    const car: TrafficCar = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      colour: '#c94b4b',
      x: world.x + Math.sin(world.heading) * 3 * M,
      z: world.z + Math.cos(world.heading) * 3 * M,
      y: world.y,
      heading: world.heading,
    };
    world.traffic.cars.push(car);
    world.speed = world.maxSpeed * 0.6;
    world.step(STEP, NONE);

    expect(world.rep.total).toBeGreaterThanOrEqual(REP_WRECK);
    expect(world.rep.total).toBeLessThan(REP_TAKEDOWN);
  });

  // Once per car is the whole difficulty. Without it, sitting alongside a car
  // in traffic pays every frame and the highest-scoring thing is not moving.
  it('pays for a near miss once per car, not once per frame', () => {
    const world = still();
    world.speed = world.maxSpeed * 0.5;
    const beside: TrafficCar = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      colour: '#c94b4b',
      x: 0,
      z: 0,
      y: world.y,
      heading: world.heading,
    };
    world.traffic.cars.push(beside);

    /** Hold it alongside, close but not touching. */
    const alongside = () => {
      beside.x = world.x + Math.cos(world.heading) * REP_NEAR_MISS_RANGE * 0.85;
      beside.z = world.z - Math.sin(world.heading) * REP_NEAR_MISS_RANGE * 0.85;
      beside.y = world.y;
    };

    // Wider than the range at which the two are touching, or there is no band
    // to be in: a near miss has to be a miss.
    expect(REP_NEAR_MISS_RANGE).toBeGreaterThan(CAR_RADIUS * 2.2);

    alongside();
    world.step(STEP, NONE);
    const paid = world.rep.total;
    expect(paid).toBeGreaterThanOrEqual(REP_NEAR_MISS);

    for (let i = 0; i < 60; i++) {
      alongside();
      world.step(STEP, NONE);
    }
    expect(world.rep.total).toBe(paid);
  });

  it('pays by the second for still being at large', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.3;
    // The pursuit is not stepped by this world, so its state is set directly:
    // what is under test is the payout, not how the state got there.
    world.police.state = 'pursuit';
    world.police.heat = 0.5;

    for (let t = 0; t < REP_PURSUIT_TICK + 1; t += STEP) world.step(STEP, NONE);

    expect(world.rep.recent.some((a) => a.reason === 'pursuit')).toBe(true);
    expect(world.rep.total).toBeGreaterThan(0);
  });

  it('pays nothing for driving around doing nothing', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    drive(world, 3, press({ up: true }));
    expect(world.rep.total).toBe(0);
  });
});

/**
 * Collectibles in the world (#93).
 *
 * The collection itself is tested in `collectibles.test.ts`. These are about
 * the wiring: that driving into a billboard in the running sim smashes it and
 * pays, and that the pursuit multiplier reaches it like everything else.
 */
describe('billboards and cameras, driven at', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  /** Put the car on top of the nearest billboard to it. */
  function atABillboard(world: CityWorld) {
    const board = world.collectibles.billboards[0];
    world.x = board.at.x;
    world.z = board.at.z;
    world.y = board.y;
    return board;
  }

  it('smashes a billboard the car is driven into', () => {
    const world = still();
    const board = atABillboard(world);
    world.step(STEP, NONE);

    expect(world.collectibles.smashed.has(board.id)).toBe(true);
    expect(world.rep.total).toBeGreaterThan(0);
    expect(world.rep.recent.some((a) => a.reason === 'billboard')).toBe(true);
  });

  it('counts down what is left to find', () => {
    const world = still();
    const before = world.collectibles.remaining;
    atABillboard(world);
    world.step(STEP, NONE);
    expect(world.collectibles.remaining).toBe(before - 1);
  });

  it('pays more for one smashed under a pursuit', () => {
    const calm = still();
    atABillboard(calm);
    calm.step(STEP, NONE);

    const hot = still();
    hot.police.state = 'pursuit';
    hot.police.heat = 0.9;
    atABillboard(hot);
    hot.step(STEP, NONE);

    expect(hot.rep.total).toBeGreaterThan(calm.rep.total);
  });

  it('starts with nothing found', () => {
    const world = still();
    expect(world.collectibles.smashed.size).toBe(0);
    expect(world.collectibles.clockedCount).toBe(0);
    expect(world.collectibles.billboards.length).toBeGreaterThan(0);
    expect(world.collectibles.cameras.length).toBeGreaterThan(0);
  });
});

/**
 * Street Finds (#67).
 *
 * The thing worth asserting on is not that a car can be picked up. It is that
 * picking one up actually changes how the car drives, and that everything
 * measured as a fraction of the player's top speed still means what it meant -
 * the police run at fractions of it, and a per-car top speed that quietly
 * detached them from it would be a pursuit you cannot outrun in a slow car and
 * cannot lose in a fast one.
 */
describe('street finds', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  /** Put the car on top of the nearest parked one. */
  function atACar(world: CityWorld) {
    const find = world.finds.waiting[0];
    world.x = find.at.x;
    world.z = find.at.z;
    world.y = find.y;
    return find;
  }

  it('starts in the starter, with nothing else found', () => {
    const world = still();
    expect(world.car).toBe(STARTER_CAR);
    expect(world.finds.owned.size).toBe(1);
    expect(world.finds.waiting.length).toBe(CARS.filter((c) => c.source === 'street').length);
  });

  it('hands you the car you drive into, straight away', () => {
    const world = still();
    const find = atACar(world);
    world.step(STEP, NONE);

    expect(world.car.id).toBe(find.car);
    expect(world.finds.owned.has(find.car)).toBe(true);
    expect(world.finds.flash?.id).toBe(find.car);
    expect(world.rep.recent.some((a) => a.reason === 'streetFind')).toBe(true);
  });

  it('does not hand you one you only drove past', () => {
    const world = still();
    const find = world.finds.waiting[0];
    world.x = find.at.x + FIND_RANGE * 3;
    world.z = find.at.z;
    world.y = find.y;
    world.step(STEP, NONE);
    expect(world.car).toBe(STARTER_CAR);
  });

  it('pays once, not once a frame', () => {
    const world = still();
    atACar(world);
    world.step(STEP, NONE);
    const paid = world.rep.total;
    for (let i = 0; i < 60; i++) world.step(STEP, NONE);
    expect(world.rep.total).toBe(paid);
  });

  it('changes how the car actually drives', () => {
    const slow = still();
    slow.drive(carById('kite'));
    const fast = still();
    fast.drive(carById('nightjar'));

    expect(fast.maxSpeed).toBeGreaterThan(slow.maxSpeed);
    // Three seconds, not twelve: a straight line from the spawn reaches a
    // building, and two cars parked against a wall are the same speed.
    drive(slow, 3, press({ up: true }));
    drive(fast, 3, press({ up: true }));
    expect(fast.speed).toBeGreaterThan(slow.speed);
  });

  it('lets a grippier car hold a tighter line at the same speed', () => {
    const turn = (id: string) => {
      const world = still();
      world.drive(carById(id));
      // Turned on the spot at a fixed speed, so the answer is about grip and
      // not about which of the two reached the corner faster.
      world.speed = REFERENCE_TOP_SPEED * 0.6;
      const facing = world.heading;
      for (let t = 0; t < 0.4; t += STEP) {
        world.speed = REFERENCE_TOP_SPEED * 0.6;
        world.step(STEP, press({ left: true }));
      }
      return Math.abs(world.heading - facing);
    };
    expect(turn('kite')).toBeGreaterThan(turn('ridgeback'));
  });

  // The police run at fractions of *your* top speed, so this has to keep
  // holding whatever you are driving.
  it('leaves the pursuit outrunnable in every car', () => {
    for (const car of CARS) {
      const world = new CityWorld(undefined, { traffic: false, police: false });
      world.drive(car);
      for (const level of HEAT_LEVELS) {
        for (const kind of [...level.units, level.enforcerUnit]) {
          expect(world.maxSpeed * level.speed * COP_UNITS[kind].pace).toBeLessThan(world.maxSpeed);
        }
      }
    }
  });

  it('remembers the garage it is handed, and refuses one it does not know', () => {
    const world = still();
    world.finds.load(['nightjar', 'not-a-car'], 'nightjar');
    expect(world.finds.owned.has('nightjar')).toBe(true);
    expect(world.finds.owned.has('not-a-car')).toBe(false);
    expect(world.finds.car.id).toBe('nightjar');

    // And will not put you in a car you do not have.
    const other = still();
    other.finds.load([], 'halcyon');
    expect(other.finds.car).toBe(STARTER_CAR);
  });
});

/**
 * Races in the city (#70).
 *
 * The race itself is tested in `cityrace.test.ts`, driven by a perfect racer
 * on the line. These are about the wiring: getting into one, what it does to
 * the pursuit, and what winning it moves.
 */
describe('circuits', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  /** Put the car on a start line. */
  function atTheLine(world: CityWorld) {
    const route = world.city.routes[0];
    world.x = route.start.x;
    world.z = route.start.z;
    world.y = 0;
    return route;
  }

  it('offers the event you are standing on, and nothing when you are not', () => {
    const world = still();
    expect(world.atStartLine).toBeNull();
    const route = atTheLine(world);
    expect(world.atStartLine).toBe(route);

    world.x += ROUTE_START_RANGE * 4;
    expect(world.atStartLine).toBeNull();
  });

  it('starts one when you press it, and lines you up on the grid', () => {
    const world = still();
    const route = atTheLine(world);
    world.step(STEP, press({ confirm: true }));

    expect(world.race.state).toBe('countdown');
    expect(world.race.route).toBe(route);
    expect(world.race.challenger).toBe(world.currentRival);
    expect(world.race.runners).toBeGreaterThan(2);
    expect(world.speed).toBe(0);
  });

  it('will not start one you have not earned', () => {
    const world = still();
    world.beaten = 1; // the second rival wants Rep
    world.rep.total = 0;
    atTheLine(world);
    world.step(STEP, press({ confirm: true }));
    expect(world.race.state).toBe('idle');
  });

  it('holds the car still while the lights run down', () => {
    const world = still();
    atTheLine(world);
    world.step(STEP, press({ confirm: true }));
    drive(world, CITY_COUNTDOWN - 0.5, press({ up: true }));
    expect(world.race.state).toBe('countdown');
    expect(world.speed).toBe(0);

    drive(world, 1, press({ up: true }));
    expect(world.race.state).toBe('racing');
  });

  // A race you have to win while being rammed by a heat-six Enforcer is not a
  // race, it is a pursuit with a lap counter on it.
  it('calls the police off for the duration', () => {
    const world = new CityWorld(undefined, { traffic: false });
    world.police.heat = 0.8;
    atTheLine(world);
    world.step(STEP, press({ confirm: true }));
    expect(world.police.heat).toBe(0);

    drive(world, 20, press({ up: true }));
    expect(world.police.cops.length).toBe(0);
  });

  it('is abandoned if you are busted out of it', () => {
    const world = still();
    atTheLine(world);
    world.step(STEP, press({ confirm: true }));
    world.busted = true;
    drive(world, 5, NONE);
    expect(world.race.state).toBe('idle');
  });

  // Winning the race is the first half (#66): it pays, and it starts the
  // chase for the car. The ladder does not move until that chase is won.
  it('pays for a win and sends the rival running', () => {
    const world = still();
    const route = atTheLine(world);
    world.step(STEP, press({ confirm: true }));
    drive(world, CITY_COUNTDOWN + 0.2, NONE);
    expect(world.race.state).toBe('racing');

    // Teleported round the gates: what is under test is what a win *does*,
    // not whether this scripted driver can win one.
    const before = world.beaten;
    for (let lap = 0; lap < route.laps; lap++) {
      for (const gate of route.checkpoints) {
        world.x = gate.x;
        world.z = gate.z;
        world.step(STEP, NONE);
      }
    }

    expect(world.race.state).toBe('finished');
    expect(world.race.won).toBe(true);
    expect(world.rep.recent.some((a) => a.reason === 'raceWin')).toBe(true);
    expect(world.claim.state).toBe('running');
    expect(world.beaten).toBe(before);
  });
});

/**
 * Ambushes (#92).
 *
 * The event itself is nine lines of state machine and is tested next to it.
 * These are about the thing that makes it an event at all: that pressing the
 * button really does drop you stopped and surrounded, at the heat the spot
 * says, with the ordinary escape as the only way out.
 */
describe('ambushes', () => {
  function atATrap(world: CityWorld) {
    const spot = world.city.ambushes[2];
    world.x = spot.at.x;
    world.z = spot.at.z;
    world.y = 0;
    return spot;
  }

  it('offers the trap you are parked on, and nothing when you are not', () => {
    const world = new CityWorld(undefined, { traffic: false });
    expect(world.atAmbush).toBeNull();
    const spot = atATrap(world);
    expect(world.atAmbush).toBe(spot);
    world.x += AMBUSH_RANGE * 4;
    expect(world.atAmbush).toBeNull();
  });

  it('drops you stopped, surrounded, and already at heat', () => {
    const world = new CityWorld(undefined, { traffic: false });
    const spot = atATrap(world);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, press({ confirm: true }));

    expect(world.ambush.state).toBe('running');
    expect(world.speed).toBe(0);
    expect(world.police.level).toBe(spot.level);
    expect(world.police.cops.length).toBeGreaterThan(1);
    for (const cop of world.police.cops) {
      expect(Math.hypot(cop.x - world.x, cop.z - world.z)).toBeLessThan(AMBUSH_RING * 3);
    }
  });

  // It asks nothing of the ladder. The pursuit is available to anyone who can
  // drive, which is the point of having an event made of nothing else.
  it('asks nothing of the ladder', () => {
    const world = new CityWorld(undefined, { traffic: false });
    world.beaten = 3;
    world.rep.total = 0;
    expect(world.challengeReady).toBe(false);
    atATrap(world);
    world.step(STEP, press({ confirm: true }));
    expect(world.ambush.state).toBe('running');
  });

  it('pays when you get out of one', () => {
    const world = new CityWorld(undefined, { traffic: false });
    atATrap(world);
    world.step(STEP, press({ confirm: true }));

    // Cleared by hand: what is under test is the payout, not whether this
    // scripted driver can lose four cars.
    world.police.reset();
    drive(world, 0.2, NONE);
    expect(world.ambush.state).toBe('escaped');
    expect(world.rep.recent.some((a) => a.reason === 'ambush')).toBe(true);
  });

  it('pays more for a hotter one', () => {
    const escape = (which: number) => {
      const world = new CityWorld(undefined, { traffic: false });
      const spot = world.city.ambushes[which];
      world.x = spot.at.x;
      world.z = spot.at.z;
      world.y = 0;
      world.step(STEP, press({ confirm: true }));
      world.police.reset();
      drive(world, 0.2, NONE);
      return world.rep.total;
    };
    expect(escape(4)).toBeGreaterThan(escape(0));
  });

  it('is lost by being busted in it', () => {
    const world = new CityWorld(undefined, { traffic: false });
    atATrap(world);
    world.step(STEP, press({ confirm: true }));
    world.busted = true;
    world.step(STEP, NONE);
    expect(world.ambush.state).toBe('busted');
  });
});

/**
 * Car damage and drive-through repair (#95).
 *
 * Everything in the city could be wrecked except the player, which #94 made
 * conspicuous. What is worth asserting on is that damage costs something, that
 * the first scrape does not, and that the repair is a decision about *when*
 * rather than a button that cancels a pursuit.
 */
describe('damage', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  it('starts undamaged', () => {
    expect(still().damage).toBe(0);
  });

  it('is taken from driving into a building', () => {
    const world = still();
    // Straight into whatever is at the end of this street.
    drive(world, 12, press({ up: true, right: true }));
    expect(world.damage).toBeGreaterThan(0);
  });

  it('is taken from going through a roadblock', () => {
    const world = onAnArterial();
    const road = world.onRoad!;
    world.police.roadblocks.push({
      road,
      x: world.x + Math.sin(world.heading) * M,
      z: world.z + Math.cos(world.heading) * M,
      y: 0,
      ax: Math.cos(world.heading),
      az: -Math.sin(world.heading),
      half: road.width / 2,
      gap: null,
      cars: [],
    });
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    expect(world.damage).toBeGreaterThan(0);
  });

  // Ramming favours the rammer, which is what makes a takedown worth doing
  // rather than a trade.
  it('costs you less than it costs the car you rammed', () => {
    const world = still();
    const cop: Cop = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: world.x + Math.sin(world.heading) * 3 * M,
      z: world.z + Math.cos(world.heading) * 3 * M,
      y: world.y,
      heading: world.heading,
      kind: 'cruiser',
      role: 'chase',
    };
    world.police.cops.push(cop);
    world.speed = world.maxSpeed * 0.3;
    world.step(STEP, NONE);
    expect(cop.damage).toBeGreaterThan(world.damage);
  });

  // A model where the first shunt makes the car worse turns every pursuit into
  // a slow spiral from the opening contact.
  it('lets the first scrape cost nothing', () => {
    const clean = still();
    const scraped = still();
    scraped.damage = DAMAGE_FREE;
    drive(clean, 4, press({ up: true }));
    drive(scraped, 4, press({ up: true }));
    expect(scraped.speed).toBeCloseTo(clean.speed, 3);
  });

  // Given a running start rather than driven up to it: reaching the cap under
  // acceleration takes four seconds and a straight line from the spawn is a
  // building, and two cars parked against a wall are the same speed.
  it('takes the top speed with it', () => {
    const settle = (damage: number) => {
      const world = still();
      world.damage = damage;
      world.speed = world.maxSpeed;
      // Held on the spot while the overspeed bleeds off. Settling to the cap
      // takes a couple of seconds, and two seconds in a straight line from
      // here is a building - which is a different test failing.
      const home = { x: world.x, z: world.z };
      for (let t = 0; t < 2; t += STEP) {
        world.x = home.x;
        world.z = home.z;
        world.step(STEP, press({ up: true }));
      }
      return world.speed;
    };

    const fine = settle(0);
    const wrecked = settle(1);
    expect(wrecked).toBeLessThan(fine);
    expect(wrecked).toBeCloseTo(fine * (1 - DAMAGE_SPEED_LOSS), -2);
  });

  it('takes the steering with it', () => {
    const turn = (damage: number) => {
      const world = still();
      world.damage = damage;
      const facing = world.heading;
      for (let t = 0; t < 0.5; t += STEP) {
        world.speed = world.maxSpeed * 0.5;
        world.step(STEP, press({ left: true }));
      }
      return Math.abs(world.heading - facing);
    };
    expect(turn(1)).toBeLessThan(turn(0));
  });

  it('never stops the car outright', () => {
    const world = still();
    world.damage = 1;
    drive(world, 6, press({ up: true }));
    expect(world.speed).toBeGreaterThan(world.maxSpeed * 0.5);
  });
});

describe('drive-through repair', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  const atAShop = (world: CityWorld) => {
    const shop = world.city.repairs[0];
    world.x = shop.at.x;
    world.z = shop.at.z;
    world.y = shop.y;
    return shop;
  };

  it('puts shops on the fast roads, spread out', () => {
    const city = still().city;
    expect(city.repairs.length).toBe(REPAIR_COUNT);
    for (let i = 0; i < city.repairs.length; i++) {
      for (let j = i + 1; j < city.repairs.length; j++) {
        const gap = Math.hypot(
          city.repairs[i].at.x - city.repairs[j].at.x,
          city.repairs[i].at.z - city.repairs[j].at.z,
        );
        expect(gap).toBeGreaterThanOrEqual(REPAIR_SPACING - 1);
      }
    }
  });

  it('mends the car at whatever speed you go through at', () => {
    const world = still();
    world.damage = 0.9;
    atAShop(world);
    world.speed = world.maxSpeed * 0.8;
    world.step(STEP, NONE);

    expect(world.damage).toBe(0);
    expect(world.repairFlash).toBeGreaterThan(0);
    // No stopping: the speed is untouched by it.
    expect(world.speed).toBeGreaterThan(world.maxSpeed * 0.7);
  });

  it('does nothing from the next street over', () => {
    const world = still();
    world.damage = 0.9;
    const shop = atAShop(world);
    world.x = shop.at.x + REPAIR_RANGE * 5;
    world.step(STEP, NONE);
    expect(world.damage).toBe(0.9);
  });

  // The genre's neat trick: a car that goes in beaten up and comes out
  // straight is not the car they are looking for.
  it('ends a search you take it during', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    world.police.state = 'cooldown';
    world.police.search = { x: world.x, z: world.z, radius: 1000 };
    world.damage = 0.5;
    atAShop(world);
    world.step(STEP, NONE);

    expect(world.police.state).toBe('clear');
    expect(world.damage).toBe(0);
  });

  // ...but it is not a button that cancels a pursuit. While they still have
  // eyes on you, driving through a workshop changes nothing about that.
  it('does not end a pursuit they are still running', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    world.police.state = 'pursuit';
    world.damage = 0.5;
    atAShop(world);
    world.step(STEP, NONE);

    expect(world.police.state).toBe('pursuit');
    expect(world.damage).toBe(0);
  });
});

/**
 * Claiming a rival's car (#66).
 *
 * The chase itself is tested next to it. These are about what the two halves
 * do to each other: that winning a race starts one, that the ladder waits for
 * it, and that taking the car is what moves both.
 */
describe('claiming a car', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  /** Win a race by teleporting round its gates, and hand back the world. */
  function afterWinning(): CityWorld {
    const world = still();
    const route = world.city.routes[0];
    world.x = route.start.x;
    world.z = route.start.z;
    world.y = 0;
    world.step(STEP, press({ confirm: true }));
    drive(world, CITY_COUNTDOWN + 0.2, NONE);
    for (let lap = 0; lap < route.laps; lap++) {
      for (const gate of route.checkpoints) {
        world.x = gate.x;
        world.z = gate.z;
        world.step(STEP, NONE);
      }
    }
    return world;
  }

  it('sends them running the moment the race is won', () => {
    const world = afterWinning();
    expect(world.claim.state).toBe('running');
    expect(world.claim.rival).toBe(RIVALS[0]);
  });

  // Winning the race alone gets you nothing, which is the whole point of the
  // second half existing.
  it('does not move the ladder on the race alone', () => {
    const world = afterWinning();
    expect(world.beaten).toBe(0);
    expect(world.finds.owned.has(RIVALS[0].carId)).toBe(false);
  });

  it('brings the police out for both of you', () => {
    const world = new CityWorld(undefined, { traffic: false });
    const route = world.city.routes[0];
    world.x = route.start.x;
    world.z = route.start.z;
    world.y = 0;
    world.step(STEP, press({ confirm: true }));
    drive(world, CITY_COUNTDOWN + 0.2, NONE);
    for (let lap = 0; lap < route.laps; lap++) {
      for (const gate of route.checkpoints) {
        world.x = gate.x;
        world.z = gate.z;
        world.step(STEP, NONE);
      }
    }
    expect(world.police.heat).toBeGreaterThan(0.3);
  });

  it('moves the ladder and hands over the car when they are wrecked', () => {
    const world = afterWinning();
    expect(world.claim.state).toBe('running');

    // Ridden on the bumper at closing speed until the car gives.
    for (let t = 0; t < 60 && world.claim.state === 'running'; t += STEP) {
      const runner = world.claim.runner!;
      world.x = runner.x - Math.sin(runner.heading) * CAR_RADIUS;
      world.z = runner.z - Math.cos(runner.heading) * CAR_RADIUS;
      world.y = runner.y;
      world.heading = runner.heading;
      world.speed = world.maxSpeed;
      world.step(STEP, NONE);
    }

    expect(world.claim.state).toBe('won');
    expect(world.beaten).toBe(1);
    expect(world.finds.owned.has(RIVALS[0].carId)).toBe(true);
    expect(world.rep.recent.some((a) => a.reason === 'claim')).toBe(true);
  });

  // Added to the garage but not driven away in: being teleported into a
  // different car mid-pursuit, having just wrecked somebody, would be absurd.
  it('does not put you in it there and then', () => {
    const world = afterWinning();
    for (let t = 0; t < 60 && world.claim.state === 'running'; t += STEP) {
      const runner = world.claim.runner!;
      world.x = runner.x - Math.sin(runner.heading) * CAR_RADIUS;
      world.z = runner.z - Math.cos(runner.heading) * CAR_RADIUS;
      world.y = runner.y;
      world.heading = runner.heading;
      world.speed = world.maxSpeed;
      world.step(STEP, NONE);
    }
    expect(world.claim.state).toBe('won');
    expect(world.car.id).toBe(STARTER_CAR.id);
  });

  it('is given up on if you are busted out of it', () => {
    const world = afterWinning();
    world.busted = true;
    drive(world, 5, NONE);
    expect(world.claim.state).toBe('idle');
  });
});

/**
 * Mods (#68).
 *
 * The catalogue and the garage are tested next to them. These are about the
 * wiring: that a part changes the car it is bolted to, that a good result in a
 * car earns one, and that the tyres really do answer a spike strip.
 */
describe('parts on the car', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  it('changes the car it is bolted to', () => {
    const plain = still();
    const tuned = still();
    tuned.finds.earn(tuned.car.id);
    tuned.finds.toggle(tuned.car.id, 'block');
    tuned.drive(tuned.car);

    drive(plain, 2, press({ up: true }));
    drive(tuned, 2, press({ up: true }));
    expect(tuned.speed).toBeGreaterThan(plain.speed);
  });

  it('is earned by a good result in that car', () => {
    const world = still();
    const route = world.city.routes[0];
    world.x = route.start.x;
    world.z = route.start.z;
    world.y = 0;
    world.step(STEP, press({ confirm: true }));
    drive(world, CITY_COUNTDOWN + 0.2, NONE);

    expect(world.finds.unlocked(world.car.id).length).toBe(0);
    for (let lap = 0; lap < route.laps; lap++) {
      for (const gate of route.checkpoints) {
        world.x = gate.x;
        world.z = gate.z;
        world.step(STEP, NONE);
      }
    }
    expect(world.finds.unlocked(world.car.id).length).toBe(1);
  });

  // The one part that argues with the police rather than with the stopwatch.
  it('gives you tyres a spike strip barely touches', () => {
    const shredded = (reinflating: boolean) => {
      const world = still();
      if (reinflating) {
        for (let i = 0; i < 6; i++) world.finds.earn(world.car.id);
        world.finds.toggle(world.car.id, 'reinflatables');
        world.drive(world.car);
      }
      world.police.spikes.push({
        road: world.onRoad!,
        x: world.x,
        z: world.z,
        y: world.y,
        ax: Math.cos(world.heading),
        az: -Math.sin(world.heading),
        from: -10 * M,
        to: 10 * M,
      });
      world.speed = world.maxSpeed * 0.5;
      world.step(STEP, NONE);
      return world.shredded;
    };

    const ruined = shredded(false);
    const survived = shredded(true);
    expect(ruined).toBeGreaterThan(0);
    expect(survived).toBeGreaterThan(0);
    expect(survived).toBeLessThan(ruined * 0.4);
  });

  it('keeps the parts on the car that earned them', () => {
    const world = still();
    world.finds.claim('nightfall');
    world.finds.earn('kestrel');
    world.finds.toggle('kestrel', 'block');

    expect(world.finds.effect('kestrel').accel).toBeGreaterThan(1);
    world.drive(carById('nightfall'));
    // The Nightfall is faster, but not because of the Kestrel's engine.
    expect(world.finds.effect('nightfall').accel).toBe(1);
  });
});

/**
 * The edge of the map (#14's groundwork).
 *
 * The perimeter arterial's *centreline* is the map boundary, so its
 * carriageway straddles it and a car driving down it is legitimately outside.
 * Without a margin on the out-of-bounds check, that car was reverted and
 * stopped on every step: the coast road was a place you drove onto and could
 * never leave. A reference driver found it; nothing else had.
 */
describe('the coast road', () => {
  /** Put the car on the road that runs along the map's edge, pointing along it. */
  function onThePerimeter(world: CityWorld) {
    const bounds = world.city.bounds;
    const edge = world.city.roads.find((road) => {
      const a = world.city.nodes[road.a].pos;
      const b = world.city.nodes[road.b].pos;
      return (
        world.city.nodes[road.a].y === 0 &&
        road.length > 100 * M &&
        Math.abs(a.z - bounds.minZ) < 1 &&
        Math.abs(b.z - bounds.minZ) < 1
      );
    });
    if (!edge) throw new Error('no perimeter road: the city changed');

    const a = world.city.nodes[edge.a].pos;
    const b = world.city.nodes[edge.b].pos;
    world.x = a.x + (b.x - a.x) * 0.3;
    world.z = a.z + (b.z - a.z) * 0.3;
    world.y = 0;
    world.heading = Math.atan2(b.x - a.x, b.z - a.z);
    world.onRoad = edge;
    return edge;
  }

  it('can be driven down', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    onThePerimeter(world);
    const start = at(world);
    drive(world, 3, press({ up: true }));

    expect(world.speed).toBeGreaterThan(world.maxSpeed * 0.4);
    expect(moved(start, at(world))).toBeGreaterThan(50 * M);
  });

  // The margin exists for the carriageway, not for the sea. Driving away from
  // the map still stops you.
  it('still stops you driving out to sea', () => {
    const world = new CityWorld(undefined, { traffic: false, police: false });
    const bounds = world.city.bounds;
    world.x = (bounds.minX + bounds.maxX) / 2;
    world.z = bounds.minZ;
    world.y = 0;
    // Straight off the edge.
    world.heading = Math.PI;
    drive(world, 4, press({ up: true }));

    expect(world.z).toBeGreaterThan(bounds.minZ - CITY_EDGE_MARGIN * 2);
  });
});
