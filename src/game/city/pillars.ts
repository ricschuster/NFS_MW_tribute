import {
  INTERSTATE_PILLAR_SPACING,
  PILLAR_CLEAR,
  PILLAR_INSET,
  PILLAR_MIN_HEIGHT,
  PILLAR_WIDTH,
} from '../constants';
import { distanceToSegment } from './grid';
import type { City, Pillar } from './types';

/**
 * What holds the freeway up (#487).
 *
 * A pair to every bent, one under each edge of the deck, rather than one
 * column down the middle: the owner's call, made driving Midtown south, so
 * that the ground under the deck is somewhere you can drive - a lane between
 * two rows of pillars - instead of somewhere a column stands in the way.
 * Solid, on the owner's word, which is why they are city data rather than
 * something the renderer works out for itself: the sim has to hit the same
 * pillar the renderer draws.
 *
 * A pillar never stands on a road. Every street, boulevard and ramp foot
 * that passes under the deck had a column through it while they were only
 * drawn, and a solid one there is a wall across a junction. So a pillar that
 * would come within `PILLAR_CLEAR` of a road's kerb is left out, and the
 * deck simply spans that gap.
 */
export function pillarsFor(city: City): Pillar[] {
  const decks = city.roads.filter((r) => r.class === 'interstate');
  // Anything with an end on the street: the deck's own roads are scenery
  // overhead, and a ramp's foot is in the road.
  const roads = city.roads
    .filter((r) => r.class !== 'interstate' && (city.nodes[r.a].level === 'surface' || city.nodes[r.b].level === 'surface'))
    .map((r) => ({ a: city.nodes[r.a].pos, b: city.nodes[r.b].pos, half: r.width / 2 }));
  const reach = PILLAR_WIDTH / 2 + PILLAR_CLEAR;
  const onARoad = (x: number, z: number) =>
    roads.some((r) => {
      const slack = r.half + reach;
      if (x < Math.min(r.a.x, r.b.x) - slack || x > Math.max(r.a.x, r.b.x) + slack) return false;
      if (z < Math.min(r.a.z, r.b.z) - slack || z > Math.max(r.a.z, r.b.z) + slack) return false;
      return distanceToSegment(x, z, r.a.x, r.a.z, r.b.x, r.b.z) < slack;
    });

  const pillars: Pillar[] = [];
  for (const road of decks) {
    const a = city.nodes[road.a];
    const b = city.nodes[road.b];
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    // Across the deck, to its edges and back in by the inset.
    const off = road.width / 2 - PILLAR_INSET;
    const nx = (-dz / len) * off;
    const nz = (dx / len) * off;
    const count = Math.max(1, Math.round(road.length / INTERSTATE_PILLAR_SPACING));
    for (let p = 0; p < count; p++) {
      const t = (p + 0.5) / count;
      const height = a.y + (b.y - a.y) * t;
      if (height < PILLAR_MIN_HEIGHT) continue; // in the tunnel, or nearly on the ground
      const x = a.pos.x + dx * t;
      const z = a.pos.z + dz * t;
      for (const side of [1, -1]) {
        const at = { x: x + nx * side, z: z + nz * side };
        if (onARoad(at.x, at.z)) continue;
        pillars.push({ at, height });
      }
    }
  }
  return pillars;
}
