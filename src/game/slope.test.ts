import { describe, expect, it } from 'vitest';
import { CREST_GRIP_MIN, GRAVITY, SLOPE_SPEED_MAX, UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { advanceAlong } from './graphcar';
import { crestGrip, slopePull, slopeSpeed } from './slope';
import type { GraphCar } from './graphcar';
import type { CityRoad } from './city/types';

const M = UNITS_PER_METRE;
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
const FLOOR = { left: false, right: false, up: true, down: false, confirm: false, nitro: false };
const IDLE = { ...FLOOR, up: false };

describe('what a hill does (#255)', () => {
  it('lowers top speed uphill and raises it downhill', () => {
    expect(slopeSpeed(0)).toBe(1);
    expect(slopeSpeed(0.06)).toBeCloseTo(0.85, 6);
    expect(slopeSpeed(-0.06)).toBeCloseTo(1.15, 6);
  });

  it('stops short of making a steep street a wall or a launch ramp', () => {
    expect(slopeSpeed(0.5)).toBeCloseTo(1 - SLOPE_SPEED_MAX, 6);
    expect(slopeSpeed(-0.5)).toBeCloseTo(1 + SLOPE_SPEED_MAX, 6);
  });

  it('pulls back up a climb and on down a descent', () => {
    expect(slopePull(0)).toBe(0);
    expect(slopePull(0.1)).toBeGreaterThan(0);
    expect(slopePull(-0.1)).toBeCloseTo(-slopePull(0.1), 9);
    expect(slopePull(0.1)).toBeLessThan(GRAVITY * 0.1);
  });

  it('takes grip away over a crest, more the faster the car, and never all of it', () => {
    const crest = -0.001 / M;
    expect(crestGrip(20 * M, 0)).toBe(1);
    expect(crestGrip(80 * M, -crest)).toBe(1);
    expect(crestGrip(80 * M, crest)).toBeLessThan(crestGrip(40 * M, crest));
    expect(crestGrip(200 * M, crest * 100)).toBe(CREST_GRIP_MIN);
  });
});

/**
 * The longest steady climb in the city: a run of road pieces with no junction
 * in it, each rising at least 2.5% and none turning more than 20 degrees from
 * the last, so a car held straight stays on it.
 */
function steadyClimb(): { from: number; to: number; grade: number } {
  const other = (road: CityRoad, node: number) => (road.a === node ? road.b : road.a);
  let best = { from: -1, to: -1, length: 0, rise: 0 };
  for (const start of city.roads) {
    if (start.class === 'interstate' || start.class === 'ramp' || start.bridge) continue;
    if ((city.nodes[start.b].y - city.nodes[start.a].y) / start.length < 0.03) continue;
    const a = city.nodes[start.a].pos;
    const b = city.nodes[start.b].pos;
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    let road = start;
    let node = start.b;
    let length = start.length;
    for (;;) {
      const here = city.nodes[node];
      if (here.roads.length !== 2) break;
      const next = city.roads[here.roads.find((id) => id !== road.id)!];
      const to = other(next, node);
      const grade = (city.nodes[to].y - here.y) / next.length;
      const turn = Math.atan2(city.nodes[to].pos.x - here.pos.x, city.nodes[to].pos.z - here.pos.z) - heading;
      if (grade < 0.025 || Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.35) break;
      length += next.length;
      road = next;
      node = to;
    }
    if (length > best.length) best = { from: start.a, to: node, length, rise: city.nodes[node].y - city.nodes[start.a].y };
  }
  return { from: best.from, to: best.to, grade: best.rise / best.length };
}

/** Flat out from one node towards another; the slowest and fastest over the last 70% of the way. */
function flatOut(from: number, to: number) {
  const world = new CityWorld(city, { traffic: false, police: false });
  const a = city.nodes[from].pos;
  const b = city.nodes[to].pos;
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  world.x = a.x;
  world.z = a.z;
  world.y = city.nodes[from].y;
  world.heading = heading;
  world.speed = world.maxSpeed;
  let slowest = Infinity;
  let fastest = 0;
  for (let step = 0; step < 60 * 30; step++) {
    world.step(1 / 60, FLOOR);
    const along = (world.x - a.x) * Math.sin(heading) + (world.z - a.z) * Math.cos(heading);
    if (along > length) break;
    if (along > length * 0.3) {
      slowest = Math.min(slowest, world.speed / world.maxSpeed);
      fastest = Math.max(fastest, world.speed / world.maxSpeed);
    }
  }
  return { slowest, fastest };
}

describe('driving one', () => {
  const climb = steadyClimb();

  it('finds a real climb to test on', () => {
    expect(climb.grade).toBeGreaterThan(0.025);
  });

  it('costs top speed on the way up', () => {
    const { fastest } = flatOut(climb.from, climb.to);
    expect(fastest).toBeLessThan(0.97);
    expect(fastest).toBeLessThan(slopeSpeed(climb.grade) + 0.05);
  });

  it('gives it back on the way down', () => {
    expect(flatOut(climb.to, climb.from).fastest).toBeGreaterThan(1.03);
  });

  it('leaves a car standing on a hill where it was', () => {
    const world = new CityWorld(city, { traffic: false, police: false });
    const a = city.nodes[climb.from].pos;
    const b = city.nodes[climb.to].pos;
    world.x = (a.x + b.x) / 2;
    world.z = (a.z + b.z) / 2;
    world.heading = Math.atan2(b.x - a.x, b.z - a.z);
    world.speed = 0;
    for (let i = 0; i < 20; i++) world.step(1 / 60, IDLE);
    const x = world.x;
    const z = world.z;
    for (let i = 0; i < 120; i++) world.step(1 / 60, IDLE);
    expect(Math.hypot(world.x - x, world.z - z)).toBe(0);
  });
});

// The police run at a fraction of your top speed (`HEAT_LEVELS`), and that
// invariant has to hold on a hill as well as on the flat: a cop that did not
// feel the climb you did would close on you up every one of them.
describe('every car on the graph feels the same hill', () => {
  const road = city.roads.find(
    (r) => r.class !== 'interstate' && r.length > 20 * M && (city.nodes[r.b].y - city.nodes[r.a].y) / r.length > 0.04,
  )!;
  const car = (forward: boolean): GraphCar => ({
    road,
    t: 0.1,
    forward,
    speed: 20 * M,
    damage: 0,
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
  });

  it('climbs slower than it descends, by the same factor the player is held to', () => {
    const up = car(true);
    const down = car(false);
    const dt = 0.1;
    advanceAlong(city, up, dt, () => null, 0);
    advanceAlong(city, down, dt, () => null, 0);
    const grade = (city.nodes[road.b].y - city.nodes[road.a].y) / road.length;
    expect(up.t - 0.1).toBeCloseTo(((20 * M * dt) / road.length) * slopeSpeed(grade), 9);
    expect(down.t - 0.1).toBeCloseTo(((20 * M * dt) / road.length) * slopeSpeed(-grade), 9);
    expect(up.t).toBeLessThan(down.t);
  });
});
