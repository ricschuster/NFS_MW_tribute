import { REPAIR_COUNT, REPAIR_SPACING, UNITS_PER_METRE } from '../constants';
import { distanceToSegment } from './grid';
import type { City, CityRoad, RepairShop } from './types';

/**
 * Shops an area asked for by name, in world metres, each put on the nearest
 * road a shop can stand on. The generated ones go longest road first, and
 * Midtown south's longest roads are someone else's: its nearest shop was 2 km
 * off when it was audited (#487), so it gets one by hand, on the inland
 * boulevard (r34) - the through road, not the promenade, which is a race.
 */
const PLACED_REPAIRS: [number, number][] = [[-850, -50]];

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

  const fit = (road: CityRoad) =>
    (road.class === 'arterial' || road.class === 'boulevard') && !road.bridge && city.nodes[road.a].level === 'surface';
  const roads = city.roads
    .filter((road) => fit(road) && road.length > road.width * 3)
    // Longest first, so the shops land on the roads a pursuit actually uses.
    .sort((a, b) => b.length - a.length);

  // Placed first so the generated ones keep their spacing from them, and
  // listed last so the shops that were already there keep their order.
  const placed: RepairShop[] = [];
  for (const [x, z] of PLACED_REPAIRS) {
    const p = { x: x * UNITS_PER_METRE, z: z * UNITS_PER_METRE };
    let best: { road: CityRoad; d: number } | null = null;
    for (const road of city.roads) {
      if (!fit(road)) continue;
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      const d = distanceToSegment(p.x, p.z, a.x, a.z, b.x, b.z);
      if (!best || d < best.d) best = { road, d };
    }
    if (!best) continue;
    const a = city.nodes[best.road.a].pos;
    const b = city.nodes[best.road.b].pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    placed.push({ at: { x: a.x + dx * t, z: a.z + dz * t }, angle: Math.atan2(dx, dz), y: 0 });
  }

  for (const road of roads) {
    if (shops.length + placed.length >= REPAIR_COUNT) break;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const at = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if ([...shops, ...placed].some((s) => Math.hypot(s.at.x - at.x, s.at.z - at.z) < REPAIR_SPACING)) continue;

    shops.push({ at, angle: Math.atan2(b.x - a.x, b.z - a.z), y: 0 });
  }
  return [...shops, ...placed];
}
