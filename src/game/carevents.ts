import { CAR_EVENTS_MAX, EVENT_DIFFICULTY_PER_TOP_SPEED, ORDINARY_RACE_DIFFICULTY } from './constants';
import { CARS, type CarProfile } from './cars';
import type { CityRoute } from './city/types';

/**
 * Events per car (M12, `docs/design/02_events_per_car.md`).
 *
 * The reference gives every car you find its own short list of events, and
 * finding the car is the unlock. The owner adopted the design's seven
 * recommendations on 2026-09-29, which is what this is:
 *
 * - three to five events a car, starting at three;
 * - routes shared between cars, so a road network gets many events out of few
 *   routes, and each finished area adds routes for every car at once;
 * - a car's list is there the moment you have the car;
 * - a generic field, paced by the event's difficulty rather than by a rival,
 *   so beating one never looks like beating a rival;
 * - claimed rival cars get lists like any other;
 * - no police called at the lights (ADR-0011 keeps that for rival races);
 * - the Quick Menu lists the current car's events, and to run another car's,
 *   you get into that car.
 *
 * An event is a route at a difficulty, with a name of its own. The difficulty
 * follows the car: a faster car meets a faster field on the same roads, which
 * is what keeps an event in the car you start in from being the same event in
 * the one you took off the boss.
 *
 * A pure function of the car and the city's routes, with no state: which have
 * been won is the world's to keep, and to save.
 */
export interface CarEvent {
  /** Stable within a seed: it is what a save records a result against. */
  id: string;
  name: string;
  route: CityRoute;
  difficulty: number;
}

/**
 * Names, by the route they run. Content, like the Rep table: which car gets
 * which is the car's place in `CARS`, so a car's list reads the same every
 * time and two cars on one route are two different events.
 */
const EVENT_NAMES: Record<string, string[]> = {
  'Marrow Field Run': ['Runway Clear', 'Tailwind', 'Crosswind', 'Last Call', 'Wheels Up', 'Holding Pattern'],
  'Halloway Rim': ['Rim Shot', 'Quarry Lines', 'Dust Circle', 'Edge Work', 'Blast Radius', 'Overburden'],
  'Halloway Drop': ['Down the Hole', 'Loose Gravel', 'Haul Day', 'Spiral Staircase', 'Pit Stop', 'Bedrock'],
};

/** The events the car has, in the order its list shows them. */
export function eventsFor(car: CarProfile, routes: CityRoute[]): CarEvent[] {
  const index = Math.max(0, CARS.findIndex((c) => c.id === car.id));
  return routes.slice(0, CAR_EVENTS_MAX).map((route) => {
    const names = EVENT_NAMES[route.name];
    const base = route.difficulty ?? ORDINARY_RACE_DIFFICULTY;
    return {
      id: `${car.id}:${route.name}`,
      name: names ? names[index % names.length] : route.name,
      route,
      difficulty: Math.max(0.1, Math.min(0.9, base + (car.topSpeed - 1) * EVENT_DIFFICULTY_PER_TOP_SPEED)),
    };
  });
}
