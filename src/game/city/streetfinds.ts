import { FIND_SPACING } from '../constants';
import { CARS } from '../cars';
import type { Rng } from './rng';
import type { City, StreetFind, Vec2 } from './types';

/**
 * Where the cars are parked (#67).
 *
 * One lot per parked car, spread as far apart as the map allows. The spread is the point: a Street Find is the reward for
 * having driven somewhere, and eight cars in one district is one drive.
 *
 * They go on *open* blocks - the parks, yards and lots the generator leaves
 * unbuilt - because that is where a car would actually be left, and because a
 * car parked in a live carriageway is a car the traffic drives through.
 *
 * The starter car is not placed - you are already in it - and neither are the
 * ladder's, which are won rather than found.
 */
export function findsFor(rng: Rng, city: City): StreetFind[] {
  // Only the cars that are *parked*. The ladder's ten are taken off the rival
  // driving them (#66), and leaving one in a lot would be giving it away.
  const wanted = CARS.filter((car) => car.source === 'street');
  const lots = city.blocks.filter((block) => block.open);
  if (lots.length === 0) return [];

  // Shuffled once, then walked in order: taking a random lot per car would
  // pick the same one twice, and rejecting duplicates by retrying can loop.
  const order = lots.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }

  const finds: StreetFind[] = [];
  // Two passes: the first insists on the full spacing, the second takes
  // whatever is left. A map that cannot fit eight cars a kilometre apart
  // should still have eight cars in it.
  for (const spacing of [FIND_SPACING, 0]) {
    for (const lot of order) {
      if (finds.length >= wanted.length) break;

      const at: Vec2 = {
        x: (lot.bounds.minX + lot.bounds.maxX) / 2,
        z: (lot.bounds.minZ + lot.bounds.maxZ) / 2,
      };
      if (finds.some((f) => Math.hypot(f.at.x - at.x, f.at.z - at.z) < spacing)) continue;
      if (finds.some((f) => f.at.x === at.x && f.at.z === at.z)) continue;

      finds.push({
        car: wanted[finds.length].id,
        at,
        y: 0,
        angle: rng.range(0, Math.PI * 2),
      });
    }
    if (finds.length >= wanted.length) break;
  }

  return finds;
}
