import { describe, it, expect } from 'vitest';
import { CityRace, fieldFor } from './cityrace';
import { pointAt } from './city/routes';
import { kestrelBay } from './city/index';
import { RIVALS } from './rivals';
import {
  ROUTE_COUNT,
  ROUTE_MIN_LENGTH,
  ROUTE_MAX_LENGTH,
  ROUTE_SPACING,
  ROUTE_LAPS,
  CHECKPOINT_RANGE,
  CITY_COUNTDOWN,
  REFERENCE_TOP_SPEED,
  SURFACE_REACH,
  FIELD_SIZE,
  FIELD_WOBBLE,
  RIVAL_BASE_SPEED_FRAC,
  RIVAL_DIFF_SPEED_FRAC,
} from './constants';
import { distanceToRoad } from './city/grid';

const city = kestrelBay();
const STEP = 1 / 60;

describe('the circuits', () => {
  it('generates a full set of them', () => {
    expect(city.routes.length).toBe(ROUTE_COUNT);
  });

  // Too short and it is a car park; too long and it is a commute. The first
  // version produced a twelve-kilometre lap round the harbour.
  it('keeps a lap to a length that is a race', () => {
    for (const route of city.routes) {
      expect(route.length).toBeGreaterThanOrEqual(ROUTE_MIN_LENGTH);
      expect(route.length).toBeLessThanOrEqual(ROUTE_MAX_LENGTH);
      expect(route.laps).toBe(ROUTE_LAPS);
    }
  });

  it('puts the six events in six places', () => {
    for (let i = 0; i < city.routes.length; i++) {
      for (let j = i + 1; j < city.routes.length; j++) {
        const gap = Math.hypot(
          city.routes[i].start.x - city.routes[j].start.x,
          city.routes[i].start.z - city.routes[j].start.z,
        );
        expect(gap).toBeGreaterThanOrEqual(ROUTE_SPACING - 1);
      }
    }
  });

  // The rival runs at a fixed pace along this line. A route that cut a corner
  // through a building would be a rival that drives through one.
  it('runs every metre of it on a real road', () => {
    for (const route of city.routes) {
      for (const point of route.points) {
        const nearest = city.roads.reduce(
          (best, road) =>
            Math.min(best, distanceToRoad(city, road, point.x, point.z)),
          Infinity,
        );
        expect(nearest).toBeLessThan(SURFACE_REACH * 4);
      }
    }
  });

  it('closes the loop', () => {
    for (const route of city.routes) {
      const last = route.checkpoints[route.checkpoints.length - 1];
      const gap = Math.hypot(last.x - route.start.x, last.z - route.start.z);
      // The final gate is the start line, within the length of one segment.
      expect(gap).toBeLessThan(CHECKPOINT_RANGE * 4);
    }
  });

  it('walks the line and comes back to where it started', () => {
    const route = city.routes[0];
    const start = pointAt(route.points, route.length, 0);
    const round = pointAt(route.points, route.length, route.length);
    expect(Math.hypot(round.x - start.x, round.z - start.z)).toBeLessThan(1);
  });
});

describe('racing one', () => {
  const route = city.routes[0];
  const rival = RIVALS[0];

  /**
   * Drive the player round the line at `pace`, as a perfect racer would.
   *
   * Stops when the race does, so a long run does not sail past the finish and
   * out the far side of the result screen back into `idle`.
   */
  function run(race: CityRace, pace: number, seconds: number, until = 'finished'): void {
    let along = 0;
    for (let t = 0; t < seconds; t += STEP) {
      along += pace * STEP;
      const at = pointAt(route.points, route.length, along);
      race.update(STEP, at, REFERENCE_TOP_SPEED);
      if (race.state === until) return;
    }
  }

  it('holds the car on the grid until the lights go', () => {
    const race = new CityRace();
    race.begin(route, rival);
    expect(race.state).toBe('countdown');
    run(race, 0, CITY_COUNTDOWN + 0.2, 'racing');
    expect(race.state).toBe('racing');
  });

  it('is won by driving the route faster than the rival', () => {
    const race = new CityRace();
    race.begin(route, rival);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
    // Flat out, which is comfortably quicker than a rank-ten rival.
    run(race, REFERENCE_TOP_SPEED, 300);

    expect(race.state).toBe('finished');
    expect(race.won).toBe(true);
    expect(race.lap).toBeGreaterThanOrEqual(route.laps);
  });

  it('is lost by not driving it', () => {
    const race = new CityRace();
    race.begin(route, rival);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
    run(race, 0, 400);

    expect(race.state).toBe('finished');
    expect(race.won).toBe(false);
  });

  // A city has more than one way round a corner. A race scored on distance
  // travelled is a race won by driving in circles.
  it('cannot be won by driving anywhere but the route', () => {
    const race = new CityRace();
    race.begin(route, rival);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');

    // Round and round a spot a long way off the line.
    for (let t = 0; t < 200; t += STEP) {
      const angle = t * 3;
      race.update(STEP, {
        x: route.start.x + 40000 + Math.sin(angle) * 5000,
        z: route.start.z + 40000 + Math.cos(angle) * 5000,
      }, REFERENCE_TOP_SPEED);
    }
    expect(race.lap).toBe(0);
    expect(race.won).toBe(false);
  });

  it('lines up a full field, with the challenge rival quickest in it', () => {
    const race = new CityRace();
    race.begin(route, RIVALS[4]);
    expect(race.runners).toBe(FIELD_SIZE + 1);
    expect(race.challenger).toBe(RIVALS[4]);
    for (const car of race.field.slice(1)) {
      expect(car.rival.difficulty).toBeLessThan(RIVALS[4].difficulty);
    }
  });

  // Winning the race and beating the rival have to be the same thing, or you
  // could come second to somebody you have already beaten and still rank up.
  it('makes the challenge rival the car to beat', () => {
    for (const challenge of RIVALS) {
      const field = fieldFor(challenge);
      expect(field[0]).toBe(challenge);
      for (const car of field.slice(1)) {
        expect(car.difficulty).toBeLessThanOrEqual(challenge.difficulty);
      }
    }
  });

  // No car in the field may ever be quicker than the player's top speed, wobble
  // and all: a race you cannot win is not an event.
  it('never sends anybody faster than you can go', () => {
    for (const challenge of RIVALS) {
      for (const car of fieldFor(challenge)) {
        const pace = RIVAL_BASE_SPEED_FRAC + car.difficulty * RIVAL_DIFF_SPEED_FRAC;
        expect(pace * (1 + FIELD_WOBBLE)).toBeLessThan(1);
      }
    }
  });

  it('does not leave the field in lockstep', () => {
    const race = new CityRace();
    race.begin(route, RIVALS[5]);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
    for (let t = 0; t < 30; t += STEP) race.update(STEP, route.start, REFERENCE_TOP_SPEED);

    // Not simply ordered by difficulty at every instant: the wobble is what
    // makes positions change rather than settle in the first corner.
    const gaps = race.field.slice(1).map((car, i) => race.field[i].dist - car.dist);
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBeGreaterThan(1);
  });

  it('says who is ahead', () => {
    const race = new CityRace();
    race.begin(route, rival);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
    run(race, REFERENCE_TOP_SPEED, 6);
    expect(race.position).toBe(1);

    const behind = new CityRace();
    behind.begin(route, rival);
    run(behind, 0, CITY_COUNTDOWN + 0.1, 'racing');
    for (let t = 0; t < 6; t += STEP) behind.update(STEP, route.start, REFERENCE_TOP_SPEED);
    expect(behind.position).toBeGreaterThan(1);
  });

  it('points at the next gate while racing, and at nothing otherwise', () => {
    const race = new CityRace();
    expect(race.target).toBeNull();
    race.begin(route, rival);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
    expect(race.target).not.toBeNull();
    race.abandon();
    expect(race.target).toBeNull();
  });

  it('lets go of the result after a moment', () => {
    const race = new CityRace();
    race.begin(route, rival);
    run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
    run(race, 0, 400);
    expect(race.state).toBe('finished');
    run(race, 0, 20, 'idle');
    expect(race.state).toBe('idle');
  });

  // Measured over a fixed stretch of time rather than over a whole race: the
  // player finishes at the same moment either way, so comparing the rival's
  // distance at the finish compares two numbers that are nearly the same.
  it('is harder against a harder rival', () => {
    const covers = (which: number) => {
      const race = new CityRace();
      race.begin(route, RIVALS[which]);
      run(race, 0, CITY_COUNTDOWN + 0.1, 'racing');
      for (let t = 0; t < 10; t += STEP) race.update(STEP, route.start, REFERENCE_TOP_SPEED);
      return race.field[0].dist;
    };
    expect(covers(RIVALS.length - 1)).toBeGreaterThan(covers(0));
  });
});
