import { describe, it, expect } from 'vitest';
import { CityClaim } from './cityclaim';
import { CityGrid } from './city/grid';
import { kestrelBay } from './city/index';
import { CARS, carById } from './cars';
import { RIVALS } from './rivals';
import {
  CLAIM_TIME,
  CLAIM_SPEED,
  CLAIM_LOSE_RANGE,
  CLAIM_RESULT_HOLD,
  CAR_RADIUS,
  REFERENCE_TOP_SPEED,
} from './constants';

const STEP = 1 / 60;
const city = kestrelBay();
const grid = new CityGrid(city);
const MAX = REFERENCE_TOP_SPEED;

/** Somewhere on a street, with the car pointed along it. */
function somewhere() {
  const road = city.roads.find(
    (r) => r.class === 'street' && !r.bridge && city.nodes[r.a].y === 0 && r.length > 20000,
  )!;
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    y: 0,
    heading: Math.atan2(b.x - a.x, b.z - a.z),
    speed: 0,
  };
}

describe('the ladder cars', () => {
  it('gives every rival a car of their own', () => {
    const ids = RIVALS.map((r) => r.carId);
    expect(new Set(ids).size).toBe(RIVALS.length);
    for (const id of ids) expect(carById(id).source).toBe('rival');
  });

  // They are the prize at the top of a ladder, so they have to be worth the
  // climb: nothing parked in a lot should out-run the thing you took off Ghost.
  it('makes them better than anything parked in the city', () => {
    const street = CARS.filter((car) => car.source === 'street');
    const bestStreet = Math.max(...street.map((car) => car.topSpeed));
    const boss = carById(RIVALS[RIVALS.length - 1].carId);
    expect(boss.topSpeed).toBeGreaterThan(bestStreet);
    expect(boss.grip).toBeGreaterThan(Math.max(...street.map((c) => c.grip)));
  });

  it('makes them better the further up the ladder they are', () => {
    for (let i = 1; i < RIVALS.length; i++) {
      const under = carById(RIVALS[i - 1].carId);
      const over = carById(RIVALS[i].carId);
      expect(over.topSpeed).toBeGreaterThan(under.topSpeed);
    }
  });

  // The police run at fractions of the player's top speed, so this has to hold
  // in the best car in the game as much as in the starter.
  it('keeps every one of them a car and not a rocket', () => {
    for (const car of CARS) {
      expect(car.topSpeed).toBeLessThan(1.25);
    }
  });
});

describe('running one down', () => {
  it('starts them next to you, pointed away', () => {
    const claim = new CityClaim(city, grid);
    const at = somewhere();
    expect(claim.begin(RIVALS[0], at)).toBe(true);
    expect(claim.state).toBe('running');
    expect(claim.left).toBe(CLAIM_TIME);
    expect(claim.runner).not.toBeNull();
    expect(Math.hypot(claim.runner!.x - at.x, claim.runner!.z - at.z)).toBeLessThan(
      CLAIM_LOSE_RANGE,
    );
  });

  it('runs away from you rather than at you', () => {
    const claim = new CityClaim(city, grid);
    const at = somewhere();
    claim.begin(RIVALS[0], at);
    const first = Math.hypot(claim.runner!.x - at.x, claim.runner!.z - at.z);
    for (let t = 0; t < 3; t += STEP) claim.update(STEP, at, MAX);
    expect(Math.hypot(claim.runner!.x - at.x, claim.runner!.z - at.z)).toBeGreaterThan(first);
  });

  it('never goes quicker than the car chasing it', () => {
    expect(CLAIM_SPEED).toBeLessThan(1);
  });

  it('is claimed by wrecking it', () => {
    const claim = new CityClaim(city, grid);
    const at = somewhere();
    claim.begin(RIVALS[0], at);

    // Ram it repeatedly: sit on the runner, closing hard, until it gives.
    for (let t = 0; t < 40 && claim.state === 'running'; t += STEP) {
      const runner = claim.runner!;
      // On the bumper, not a car's length back: the runner moves before the
      // contact is tested, so a gap measured before the step is already a
      // gap-plus-three-metres by the time it matters.
      const chase = {
        ...at,
        x: runner.x - Math.sin(runner.heading) * CAR_RADIUS,
        z: runner.z - Math.cos(runner.heading) * CAR_RADIUS,
        heading: runner.heading,
        speed: MAX,
      };
      claim.update(STEP, chase, MAX);
    }
    expect(claim.state).toBe('won');
  });

  // Their car is the prize, so it has to take real work rather than one shunt.
  it('does not give in to a single hit', () => {
    const claim = new CityClaim(city, grid);
    const at = somewhere();
    claim.begin(RIVALS[0], at);
    const runner = claim.runner!;
    claim.update(
      STEP,
      {
        ...at,
        x: runner.x - Math.sin(runner.heading) * CAR_RADIUS,
        z: runner.z - Math.cos(runner.heading) * CAR_RADIUS,
        heading: runner.heading,
        speed: MAX,
      },
      MAX,
    );
    expect(claim.state).toBe('running');
    expect(claim.damage).toBeLessThan(1);
  });

  it('is lost when the clock runs out', () => {
    const claim = new CityClaim(city, grid);
    const at = somewhere();
    claim.begin(RIVALS[0], at);
    for (let t = 0; t < CLAIM_TIME + 5 && claim.state === 'running'; t += STEP) {
      claim.update(STEP, at, MAX);
    }
    expect(claim.state).toBe('lost');
  });

  // Losing them is losing them, not a slow walk back to the same distance.
  it('runs the clock down faster once they are out of reach', () => {
    const near = new CityClaim(city, grid);
    const at = somewhere();
    near.begin(RIVALS[0], at);
    for (let t = 0; t < 2; t += STEP) near.update(STEP, at, MAX);

    const far = new CityClaim(city, grid);
    far.begin(RIVALS[0], at);
    const away = { ...at, x: at.x + CLAIM_LOSE_RANGE * 3 };
    for (let t = 0; t < 2; t += STEP) far.update(STEP, away, MAX);

    expect(far.left).toBeLessThan(near.left);
  });

  it('lets go of the result after a moment', () => {
    const claim = new CityClaim(city, grid);
    const at = somewhere();
    claim.begin(RIVALS[0], at);
    for (let t = 0; t < CLAIM_TIME + 1 && claim.state === 'running'; t += STEP) {
      claim.update(STEP, at, MAX);
    }
    expect(claim.state).toBe('lost');
    for (let t = 0; t < CLAIM_RESULT_HOLD + 1; t += STEP) claim.update(STEP, at, MAX);
    expect(claim.state).toBe('idle');
  });
});
