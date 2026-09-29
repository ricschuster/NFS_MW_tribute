import { FIND_KERB_GAP, FIND_SPACING } from '../constants';
import { distanceToRoad, inWater } from './grid';
import { groundAt } from './terrain';
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
  // Lots inside the street grid, not the parkland #185 laid over the
  // leftovers: a car parked in a yard is a find, and one in a riverside park
  // is litter.
  const lots = city.blocks.filter((block) => block.open && !block.park);

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
        // On the ground, not at sea level: a car is only taken within a few
        // metres of its height, and one parked at 0 on a hillside never was.
        y: groundAt(city.terrain, at.x, at.z),
        angle: rng.range(0, Math.PI * 2),
      });
    }
    if (finds.length >= wanted.length) break;
  }

  // Then by the road (#434). A lot is where a car is best left, but a map
  // whose street grid is off has three of them, and a roster of thirty-three
  // parked cars needs somewhere to park the rest: on the verge beside a
  // surface road, off the carriageway, spread as far apart as the lots are.
  if (finds.length < wanted.length) {
    const roads = city.roads.filter(
      (road) =>
        road.class !== 'ramp' &&
        road.class !== 'interstate' &&
        !road.bridge &&
        city.nodes[road.a].level === 'surface' &&
        city.nodes[road.b].level === 'surface' &&
        road.length > road.width * 4,
    );
    for (let i = roads.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [roads[i], roads[j]] = [roads[j], roads[i]];
    }
    for (const spacing of [FIND_SPACING, FIND_SPACING / 2]) {
      for (const road of roads) {
        if (finds.length >= wanted.length) break;
        const a = city.nodes[road.a].pos;
        const b = city.nodes[road.b].pos;
        const length = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
        const side = finds.length % 2 === 0 ? 1 : -1;
        const off = road.width / 2 + FIND_KERB_GAP;
        const at: Vec2 = {
          x: (a.x + b.x) / 2 - ((b.z - a.z) / length) * off * side,
          z: (a.z + b.z) / 2 + ((b.x - a.x) / length) * off * side,
        };
        if (inWater(city, at.x, at.z)) continue;
        if (finds.some((f) => Math.hypot(f.at.x - at.x, f.at.z - at.z) < spacing)) continue;
        // Off every carriageway, not just this road's: near a junction the
        // verge of one road is the middle of the next.
        if (city.roads.some((r) => distanceToRoad(city, r, at.x, at.z) < r.width / 2 + FIND_KERB_GAP / 2)) continue;
        finds.push({
          car: wanted[finds.length].id,
          at,
          y: groundAt(city.terrain, at.x, at.z),
          // Parked along the road, the way a car left at a kerb is.
          angle: Math.atan2(b.x - a.x, b.z - a.z),
        });
      }
      if (finds.length >= wanted.length) break;
    }
  }

  return finds;
}
