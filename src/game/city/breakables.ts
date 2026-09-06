import {
  GATE_COUNT,
  STACK_COUNT,
  BREAKER_SPACING,
  UNITS_PER_METRE,
} from '../constants';
import type { Rng } from './rng';
import type { Breakable, City, CityRoad, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * Things in the city that come down (#57).
 *
 * Two kinds, in two places, for two reasons.
 *
 * A **gate** stands across the mouth of an open block - a yard, a lot, a car
 * park - facing the road that runs past it. It is the one that reads as a
 * shortcut: a lot you could always have driven into, with something in front
 * of it that says you were not supposed to.
 *
 * A **stack** sits on the kerb of an industrial or waterfront street, where a
 * stack of pallets belongs. Those quarters are the emptiest part of the city
 * and were the least worth driving through; something to knock over is the
 * cheapest thing that changes that.
 */
export function breakablesFor(rng: Rng, city: City): Breakable[] {
  const found: Breakable[] = [];
  let id = 0;

  gates();
  stacks();
  return found;

  /** Across the mouth of an open block, on the side a road runs down. */
  function gates(): void {
    const lots = shuffled(rng, city.blocks.filter((block) => block.open));
    for (const lot of lots) {
      if (count('gate') >= GATE_COUNT) return;

      const at: Vec2 = {
        x: (lot.bounds.minX + lot.bounds.maxX) / 2,
        z: (lot.bounds.minZ + lot.bounds.maxZ) / 2,
      };
      const road = nearestRoad(city, at);
      if (!road) continue;

      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      const length = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
      const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
      // On the kerb between the road and the lot, facing along the road, which
      // is what a gate across an entrance actually looks like.
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * dir.x + (at.z - a.z) * dir.z) / length));
      const on = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const away = Math.hypot(at.x - on.x, at.z - on.z);
      if (away < 1) continue;

      const step = road.width / 2 + 4 * M;
      const spot: Vec2 = {
        x: on.x + ((at.x - on.x) / away) * step,
        z: on.z + ((at.z - on.z) / away) * step,
      };
      if (crowded(found, spot)) continue;

      found.push({
        id: id++,
        kind: 'gate',
        at: spot,
        y: city.nodes[road.a].y,
        angle: Math.atan2(dir.x, dir.z),
        half: 6 * M,
      });
    }
  }

  /** On the kerb of the quarters where a pallet stack belongs. */
  function stacks(): void {
    const roads = shuffled(
      rng,
      city.roads.filter(
        (road) =>
          (road.district === 'industrial' || road.district === 'waterfront') &&
          road.class !== 'ramp' &&
          road.class !== 'interstate' &&
          !road.bridge &&
          city.nodes[road.a].y === 0 &&
          road.length > road.width * 2,
      ),
    );

    for (const road of roads) {
      if (count('stack') >= STACK_COUNT) return;

      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      const length = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
      const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
      const side = rng.chance(0.5) ? 1 : -1;
      const along = rng.range(0.25, 0.75);
      const offset = road.width / 2 + 2.5 * M;

      const spot: Vec2 = {
        x: a.x + (b.x - a.x) * along - dir.z * offset * side,
        z: a.z + (b.z - a.z) * along + dir.x * offset * side,
      };
      if (outside(city, spot) || crowded(found, spot)) continue;

      found.push({
        id: id++,
        kind: 'stack',
        at: spot,
        y: 0,
        angle: Math.atan2(dir.x, dir.z),
        half: 2.2 * M,
      });
    }
  }

  function count(kind: Breakable['kind']): number {
    return found.reduce((n, item) => n + (item.kind === kind ? 1 : 0), 0);
  }
}

function shuffled<T>(rng: Rng, items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Too close to another to be a separate thing to hit. */
function crowded(found: Breakable[], at: Vec2): boolean {
  return found.some(
    (item) => Math.hypot(item.at.x - at.x, item.at.z - at.z) < BREAKER_SPACING,
  );
}

function outside(city: City, at: Vec2): boolean {
  const b = city.bounds;
  return at.x < b.minX || at.x > b.maxX || at.z < b.minZ || at.z > b.maxZ;
}

/** The surface road whose middle is nearest this point. */
function nearestRoad(city: City, at: Vec2): CityRoad | null {
  let best: CityRoad | null = null;
  let bestGap = Infinity;
  for (const road of city.roads) {
    if (road.class === 'interstate' || road.class === 'ramp' || road.bridge) continue;
    if (city.nodes[road.a].y !== 0) continue;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const gap = Math.hypot((a.x + b.x) / 2 - at.x, (a.z + b.z) / 2 - at.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = road;
    }
  }
  return best;
}
