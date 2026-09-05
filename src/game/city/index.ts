import { CITY_SEED } from '../constants';
import { generateCity } from './generate';
import type { City } from './types';

export { generateCity } from './generate';
export { Rng } from './rng';
export type * from './types';

let pinned: City | null = null;

/**
 * The city, generated once from the pinned seed and shared from then on.
 *
 * Generating it takes a few milliseconds and everything that asks wants the
 * same one: the sim, the renderer and the map tool have to agree on where a
 * street is, or a car ends up in a building.
 */
export function kestrelBay(): City {
  if (!pinned) pinned = generateCity(CITY_SEED);
  return pinned;
}
