import { describe, it, expect } from 'vitest';
import { eventsFor } from './carevents';
import { CARS, STARTER_CAR } from './cars';
import { kestrelBay } from './city/index';

const routes = kestrelBay().routes;

// Events per car (M12, docs/design/02): every car its own short list.
describe('events per car', () => {
  it('gives every car at least three events, one per route', () => {
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const car of CARS) {
      const events = eventsFor(car, routes);
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(new Set(events.map((e) => e.route)).size).toBe(events.length);
    }
  });

  it('names two cars on one route as two different events', () => {
    const [a, b] = [CARS[0], CARS[1]].map((car) => eventsFor(car, routes)[0]);
    expect(a.route).toBe(b.route);
    expect(a.name).not.toBe(b.name);
    expect(a.id).not.toBe(b.id);
  });

  // Every car, not only the first two: a small pool repeated every few cars
  // was the same name on the same route for cars seven apart.
  it('gives every car its own name on each route', () => {
    for (const route of routes) {
      const names = CARS.map((car) => eventsFor(car, routes).find((e) => e.route === route)!.name);
      expect(new Set(names).size).toBe(CARS.length);
    }
  });

  it('puts a faster car against a faster field', () => {
    const quickest = CARS.reduce((best, car) => (car.topSpeed > best.topSpeed ? car : best));
    const mine = eventsFor(STARTER_CAR, routes);
    const theirs = eventsFor(quickest, routes);
    for (let i = 0; i < mine.length; i++) expect(theirs[i].difficulty).toBeGreaterThan(mine[i].difficulty);
  });

  it('is the same list every time, so a saved result means something', () => {
    expect(eventsFor(STARTER_CAR, routes).map((e) => e.id)).toEqual(eventsFor(STARTER_CAR, routes).map((e) => e.id));
  });
});
