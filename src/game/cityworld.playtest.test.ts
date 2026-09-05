import { describe, it, expect } from 'vitest';
import { CityWorld } from './cityworld';
import { STEP, CAR_RADIUS, TRAFFIC_RADIUS } from './constants';
import type { InputState } from './world';

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
    const world = new CityWorld(undefined, { traffic: false });
    expect(world.onRoad).not.toBeNull();
    expect(world.onRoad?.class).not.toBe('interstate');
    expect(world.y).toBe(0);
    expect(world.speed).toBe(0);
  });

  it('drives forwards along its heading', () => {
    const world = new CityWorld(undefined, { traffic: false });
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
    const world = new CityWorld(undefined, { traffic: false });
    const facing = world.heading;
    drive(world, 3, press({ left: true }));
    expect(Math.abs(world.heading - facing)).toBeGreaterThan(Math.PI);
  });

  // Getting this backwards is not subtle to play and was invisible to every
  // other test, all of which only cared that the car turned *somewhere*.
  it('steers right to the driver\'s right', () => {
    const world = new CityWorld(undefined, { traffic: false });
    world.heading = 0; // facing +z
    // Turned on the spot, so the answer is about steering and not about which
    // building the car found first.
    drive(world, 0.5, press({ right: true }));

    // Facing +z with y up, the driver's right is -x: forward crossed with up.
    // So a right turn has to send the car's nose toward -x.
    expect(Math.sin(world.heading)).toBeLessThan(0);
  });

  it('steers left to the driver\'s left', () => {
    const world = new CityWorld(undefined, { traffic: false });
    world.heading = 0;
    drive(world, 0.5, press({ left: true }));
    expect(Math.sin(world.heading)).toBeGreaterThan(0);
  });

  it('reverses back the way it came', () => {
    const world = new CityWorld(undefined, { traffic: false });
    drive(world, 1.5, press({ up: true }));
    const forward = at(world);
    drive(world, 3, press({ down: true }));
    expect(world.speed).toBeLessThan(0);
    expect(moved(forward, at(world))).toBeGreaterThan(0);
  });

  // Open ground is drivable but slow. That is what makes cutting across a
  // block a decision rather than either a wall or a free shortcut.
  it('runs slower off the road than on it', () => {
    const onRoad = new CityWorld(undefined, { traffic: false });
    drive(onRoad, 6, press({ up: true }));

    const offRoad = new CityWorld(undefined, { traffic: false });
    offRoad.onRoad = null;
    // Point it across the street and drive off into the block.
    offRoad.heading += Math.PI / 2;
    drive(offRoad, 6, press({ up: true }));

    expect(offRoad.speed).toBeLessThan(onRoad.speed);
  });

  it('cannot drive through a building', () => {
    const world = new CityWorld(undefined, { traffic: false });
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
    const world = new CityWorld(undefined, { traffic: false });
    // Point at the nearest edge and drive at it for a long time.
    world.heading = 0;
    drive(world, 90, press({ up: true }));
    expect(world.x).toBeGreaterThanOrEqual(world.city.bounds.minX);
    expect(world.x).toBeLessThanOrEqual(world.city.bounds.maxX);
    expect(world.z).toBeGreaterThanOrEqual(world.city.bounds.minZ);
    expect(world.z).toBeLessThanOrEqual(world.city.bounds.maxZ);
  });

  it('is deterministic: the same drive twice ends in the same place', () => {
    const a = new CityWorld(undefined, { traffic: false });
    const b = new CityWorld(undefined, { traffic: false });
    const script = press({ up: true, right: true });
    drive(a, 5, script);
    drive(b, 5, script);
    expect(at(a)).toEqual(at(b));
    expect(a.heading).toBe(b.heading);
  });

  it('never leaves the car at a height with no road under it', () => {
    const world = new CityWorld(undefined, { traffic: false });
    drive(world, 20, press({ up: true, right: true }));
    if (world.onRoad === null) expect(world.y).toBe(0);
  });
});

describe('nitrous, unchanged from the track', () => {
  it('goes faster with it than without', () => {
    const plain = new CityWorld(undefined, { traffic: false });
    drive(plain, 5, press({ up: true }));

    const boosted = new CityWorld(undefined, { traffic: false });
    drive(boosted, 5, press({ up: true, nitro: true }));

    expect(boosted.speed).toBeGreaterThan(plain.speed);
  });

  it('runs out, and will not relight on a sliver of charge', () => {
    const world = new CityWorld(undefined, { traffic: false });
    drive(world, 12, press({ up: true, nitro: true }));
    expect(world.nitro).toBeLessThan(0.2);
    expect(world.boosting).toBe(false);
  });
});

// The two levels are the reason #85 was built. From the sim's side, what they
// buy is that being under an overpass is a different place from being on it.
describe('two levels', () => {
  const city = new CityWorld(undefined, { traffic: false }).city;

  it('can tell a deck from the street below it', () => {
    const world = new CityWorld(undefined, { traffic: false });
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
    const world = new CityWorld(undefined, { traffic: false });
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
    const world = new CityWorld();
    drive(world, 1, NONE);
    expect(world.traffic.cars.length).toBeGreaterThan(20);
  });

  it('keeps its cars on the roads', () => {
    const world = new CityWorld();
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
    const world = new CityWorld();
    drive(world, 25, press({ up: true }));
    for (const car of world.traffic.cars) {
      expect(Math.hypot(car.x - world.x, car.z - world.z)).toBeLessThan(TRAFFIC_RADIUS * 1.4);
    }
  });

  it('does not spawn a car on top of the player', () => {
    const world = new CityWorld();
    for (let i = 0; i < 400; i++) {
      world.step(STEP, NONE);
      for (const car of world.traffic.cars) {
        expect(Math.hypot(car.x - world.x, car.z - world.z)).toBeGreaterThan(1);
      }
    }
  });

  it('is deterministic, traffic and all', () => {
    const a = new CityWorld();
    const b = new CityWorld();
    const script = press({ up: true });
    drive(a, 6, script);
    drive(b, 6, script);
    expect(a.traffic.cars.length).toBe(b.traffic.cars.length);
    expect({ x: a.x, z: a.z }).toEqual({ x: b.x, z: b.z });
  });
});
