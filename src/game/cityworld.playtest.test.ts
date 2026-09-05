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
  type CopKind,
} from './constants';
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
    expect(world.police.cops.length).toBeLessThanOrEqual(
      HEAT_LEVELS[HEAT_LEVEL_COUNT - 1].maxCops,
    );
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
      for (const kind of level.units) {
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
        expect(HEAT_LEVELS.some((l) => l.units.includes(cop.kind))).toBe(true);
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
  const M = UNITS_PER_METRE;

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
  const M = UNITS_PER_METRE;

  /** A world with the car on a road wide enough to be worth blocking. */
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

  /**
   * Run a pursuit for `seconds` with the car parked on a wide road and the
   * heat pinned, and count what gets placed.
   *
   * The pursuit is driven directly rather than by holding the throttle, and
   * that is not a shortcut. A scripted straight-line drive in this city wedges
   * the car against a building inside a minute, and a test that measures how
   * long the car survived is not a test about roadblocks.
   */
  function blocksPlaced(world: CityWorld, heat: number, seconds: number): number {
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
    };
    world.police.cops.push(cop);

    let placed = 0;
    for (let t = 0; t < seconds; t += STEP) {
      // Holding station off the back bumper: close enough to keep eyes on,
      // far enough not to bust. Left to itself it would close and end this.
      cop.x = world.x - Math.sin(world.heading) * 40 * M;
      cop.z = world.z - Math.cos(world.heading) * 40 * M;
      world.police.heat = heat;
      const before = world.police.roadblocks.length;
      world.police.update(STEP, world, world.maxSpeed);
      if (world.police.roadblocks.length > before) placed++;
    }
    return placed;
  }

  it('does not turn up below heat two', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    expect(blocksPlaced(world, 0, 40)).toBe(0);
  });

  it('turns up once the heat is high enough', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    expect(blocksPlaced(world, 0.6, 40)).toBeGreaterThan(0);
  });

  it('places them ahead of you, on a road worth blocking', () => {
    const world = onAnArterial();
    world.speed = world.maxSpeed * 0.4;
    blocksPlaced(world, 0.6, 40);
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
    blocksPlaced(world, 0.6, 40);
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
