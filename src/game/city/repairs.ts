import { REPAIR_COUNT, REPAIR_SPACING } from '../constants';
import type { City, RepairShop } from './types';

/**
 * Where the repair shops are (#95).
 *
 * On the arterials and boulevards, spread across the map. Both halves matter:
 * a repair is a decision taken at speed with cops behind you, so it has to be
 * somewhere you would already be driving fast, and it has to be somewhere you
 * can plan a run to rather than somewhere you happen to be.
 *
 * Sat on the centreline of the road rather than off the kerb, because it is a
 * gate you drive through and not a building you visit.
 */
export function repairsFor(city: City): RepairShop[] {
  const shops: RepairShop[] = [];

  const roads = city.roads
    .filter(
      (road) =>
        (road.class === 'arterial' || road.class === 'boulevard') &&
        !road.bridge &&
        city.nodes[road.a].y === 0 &&
        road.length > road.width * 3,
    )
    // Longest first, so the shops land on the roads a pursuit actually uses.
    .sort((a, b) => b.length - a.length);

  for (const road of roads) {
    if (shops.length >= REPAIR_COUNT) break;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const at = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (shops.some((s) => Math.hypot(s.at.x - at.x, s.at.z - at.z) < REPAIR_SPACING)) continue;

    shops.push({ at, angle: Math.atan2(b.x - a.x, b.z - a.z), y: 0 });
  }
  return shops;
}
