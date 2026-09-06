import { describe, it, expect } from 'vitest';
import { kestrelBay } from './city/index';
import { CityWorld } from './cityworld';
import { distanceToRoad } from './city/grid';
import type { Cop } from './citypolice';
import {
  STEP,
  GATE_COUNT,
  BREAKER_SPACING,
  BREAKER_MIN_SPEED,
  BREAKER_SPEED_KEPT,
  BREAKER_BLAST,
  UNITS_PER_METRE,
} from './constants';

const city = kestrelBay();
const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const M = UNITS_PER_METRE;

describe('what there is to break', () => {
  it('puts gates on the yards and stacks on the industrial kerbs', () => {
    const gates = city.breakables.filter((b) => b.kind === 'gate');
    const stacks = city.breakables.filter((b) => b.kind === 'stack');
    expect(gates.length).toBe(GATE_COUNT);
    expect(stacks.length).toBeGreaterThan(0);
  });

  it('keeps them apart, so a corner is not four of them', () => {
    for (let i = 0; i < city.breakables.length; i++) {
      for (let j = i + 1; j < city.breakables.length; j++) {
        const gap = Math.hypot(
          city.breakables[i].at.x - city.breakables[j].at.x,
          city.breakables[i].at.z - city.breakables[j].at.z,
        );
        expect(gap).toBeGreaterThanOrEqual(BREAKER_SPACING - 1);
      }
    }
  });

  it('gives every one a stable id', () => {
    expect(new Set(city.breakables.map((b) => b.id)).size).toBe(city.breakables.length);
  });

  // Near enough a road to be driven into, and not so near it is in the road.
  it('stands them within reach of a road rather than out in a field', () => {
    // Every road, not the spatial index: a thing standing just outside a
    // road's cells is exactly the case being checked, and the index would
    // report nothing rather than a distance.
    for (const thing of city.breakables) {
      const near = city.roads.reduce(
        (best, road) => Math.min(best, distanceToRoad(city, road, thing.at.x, thing.at.z)),
        Infinity,
      );
      expect(near).toBeLessThan(30 * M);
    }
  });
});

describe('breaking one', () => {
  const still = () => new CityWorld(undefined, { traffic: false, police: false });

  /** Put the car on top of the first thing that breaks. */
  function atOne(world: CityWorld) {
    const thing = world.city.breakables[0];
    world.x = thing.at.x;
    world.z = thing.at.z;
    world.y = thing.y;
    return thing;
  }

  it('comes down when you drive through it', () => {
    const world = still();
    const thing = atOne(world);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.broken.has(thing.id)).toBe(true);
    expect(world.rep.recent.some((a) => a.reason === 'breaker')).toBe(true);
  });

  // It gives, which is the whole difference between this and a wall. Something
  // you have to slow down for is not worth aiming at while being chased.
  it('barely slows you down', () => {
    const world = still();
    atOne(world);
    world.speed = world.maxSpeed * 0.5;
    const before = world.speed;
    world.step(STEP, NONE);
    expect(world.speed).toBeGreaterThan(before * BREAKER_SPEED_KEPT * 0.95);
  });

  it('stays down once it is down', () => {
    const world = still();
    const thing = atOne(world);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    const paid = world.rep.total;
    for (let i = 0; i < 30; i++) world.step(STEP, NONE);
    expect(world.rep.total).toBe(paid);
    expect(world.broken.has(thing.id)).toBe(true);
  });

  it('is not knocked over by a car crawling past it', () => {
    const world = still();
    const thing = atOne(world);
    world.speed = world.maxSpeed * BREAKER_MIN_SPEED * 0.5;
    for (let i = 0; i < 30; i++) world.step(STEP, NONE);
    expect(world.broken.has(thing.id)).toBe(false);
  });

  // The point of the whole thing: the city doing something to the police,
  // rather than the police doing something to you.
  it('lands on whoever was close behind', () => {
    const world = still();
    const thing = atOne(world);
    const cop: Cop = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: thing.at.x + BREAKER_BLAST * 0.2,
      z: thing.at.z,
      y: thing.y,
      heading: 0,
      kind: 'cruiser',
      role: 'chase',
    };
    world.police.cops.push(cop);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.police.cops).not.toContain(cop);
    expect(world.takedowns).toBe(1);
  });

  // Scaled by how close they were, so it is neither useless nor a button that
  // deletes a pursuit.
  it('hurts the one at the edge of it without finishing them', () => {
    const world = still();
    const thing = atOne(world);
    const cop: Cop = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: thing.at.x + BREAKER_BLAST * 0.8,
      z: thing.at.z,
      y: thing.y,
      heading: 0,
      kind: 'cruiser',
      role: 'chase',
    };
    world.police.cops.push(cop);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.police.cops).toContain(cop);
    expect(cop.damage).toBeGreaterThan(0);
    expect(cop.damage).toBeLessThan(1);
  });

  it('leaves the one on the next street alone', () => {
    const world = still();
    const thing = atOne(world);
    const cop: Cop = {
      road: world.onRoad!,
      t: 0.5,
      forward: true,
      speed: 0,
      damage: 0,
      x: thing.at.x + BREAKER_BLAST * 4,
      z: thing.at.z,
      y: thing.y,
      heading: 0,
      kind: 'cruiser',
      role: 'chase',
    };
    world.police.cops.push(cop);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);

    expect(world.police.cops).toContain(cop);
    expect(cop.damage).toBe(0);
  });

  // Using the city against them is not free.
  it('makes them angrier', () => {
    const world = still();
    world.police.heat = 0.3;
    atOne(world);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    expect(world.police.heat).toBeGreaterThan(0.3);
  });

  it('leaves the wreckage in the road', () => {
    const world = still();
    atOne(world);
    world.speed = world.maxSpeed * 0.5;
    world.step(STEP, NONE);
    expect(world.wrecks.length).toBeGreaterThan(0);
    expect(world.wrecks[0].police).toBe(false);
  });
});
