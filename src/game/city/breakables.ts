import {
  GATE_COUNT,
  GATE_DETOUR,
  GATE_GAP_MAX,
  GATE_GAP_MIN,
  GATE_GRADE,
  GATE_SAMPLE,
  STACK_COUNT,
  BREAKER_SPACING,
  UNITS_PER_METRE,
} from '../constants';
import type { Rng } from './rng';
import { inWater } from './grid';
import { groundAt } from './terrain';
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

  /**
   * At the mouth of a shortcut (#361): somewhere two roads pass close across
   * open ground that the network goes a long way round to join. The gate is on
   * the kerb of one of them, facing along it, so it closes the way across; and
   * breaking it is how you find the way, which is what the reference's gates
   * are for. They used to stand across the mouths of yards and lead nowhere.
   *
   * Nearest shortcuts first, by how much of a detour they save, so the gates
   * go where a pursuit would most want to cut through.
   */
  function gates(): void {
    for (const link of shortcuts(city)) {
      if (count('gate') >= GATE_COUNT) return;
      const road = link.road;
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      const length = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
      const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
      const step = road.width / 2 + 4 * M;
      const spot: Vec2 = { x: link.from.x + link.way.x * step, z: link.from.z + link.way.z * step };
      if (crowded(found, spot) || onPark(city, spot) || outside(city, spot)) continue;
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
          city.nodes[road.a].level === 'surface' &&
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
      if (outside(city, spot) || crowded(found, spot) || onPark(city, spot)) continue;

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

/**
 * A stack sits a fixed offset off whichever kerb it rolled, which used to be
 * a safe assumption: every quarter this ran in was one shapeless park with
 * its edges far away. A district with real blocks in it has park edges close
 * against its own roads, so the offset needs to check rather than assume.
 */
function onPark(city: City, at: Vec2): boolean {
  return city.blocks.some(
    (block) =>
      block.park &&
      at.x >= block.bounds.minX &&
      at.x <= block.bounds.maxX &&
      at.z >= block.bounds.minZ &&
      at.z <= block.bounds.maxZ,
  );
}

/** A way across between two roads: from a point on `road`, heading `way`, `gap` long. */
export interface Shortcut {
  road: CityRoad;
  from: Vec2;
  way: Vec2;
  gap: number;
  /** How far round it is by road, over the gap. */
  detour: number;
}

/**
 * Where the network passes itself close across open ground (#361).
 *
 * Every surface road sampled every `GATE_SAMPLE`; any two samples on
 * different roads between `GATE_GAP_MIN` and `GATE_GAP_MAX` apart are a
 * candidate, and it is a shortcut when the ground between them is dry, not
 * built on, not steeper than `GATE_GRADE`, and going round by road is at
 * least `GATE_DETOUR` times the gap. Measured on the graph with a Dijkstra
 * capped at that distance, so a candidate costs only as much road as it
 * could possibly save.
 */
export function shortcuts(city: City): Shortcut[] {
  const roads = city.roads.filter(
    (road) =>
      road.class !== 'ramp' &&
      road.class !== 'interstate' &&
      !road.bridge &&
      city.nodes[road.a].level === 'surface' &&
      city.nodes[road.b].level === 'surface',
  );
  const samples: { road: CityRoad; at: Vec2; t: number }[] = [];
  for (const road of roads) {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.floor(length / GATE_SAMPLE));
    for (let i = 0; i <= steps; i++) {
      const t = (i + 0.5) / (steps + 1);
      samples.push({ road, at: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, t });
    }
  }
  const cellSize = GATE_GAP_MAX;
  const cells = new Map<string, number[]>();
  const cellOf = (p: Vec2) => `${Math.floor(p.x / cellSize)},${Math.floor(p.z / cellSize)}`;
  samples.forEach((s, i) => {
    const k = cellOf(s.at);
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  });
  const built = city.blocks.filter((block) => !block.open);

  const found: Shortcut[] = [];
  const used = new Set<string>();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cx = Math.floor(s.at.x / cellSize);
    const cz = Math.floor(s.at.z / cellSize);
    let best: { j: number; gap: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of cells.get(`${cx + dx},${cz + dz}`) ?? []) {
          const o = samples[j];
          if (o.road === s.road) continue;
          const gap = Math.hypot(o.at.x - s.at.x, o.at.z - s.at.z);
          const clear = s.road.width / 2 + o.road.width / 2;
          if (gap < GATE_GAP_MIN + clear || gap > GATE_GAP_MAX) continue;
          if (!best || gap < best.gap) best = { j, gap };
        }
      }
    }
    if (!best) continue;
    const o = samples[best.j];
    const pair = [s.road.id, o.road.id].sort((p, q) => p - q).join(':');
    if (used.has(pair)) continue;
    if (!acrossOpenGround(city, s.at, o.at, built)) continue;
    // Searched past the threshold, to rank them: the biggest detours first.
    const round = roadDistance(city, s, o, best.gap * GATE_DETOUR * 3);
    if (round < best.gap * GATE_DETOUR) continue;
    used.add(pair);
    found.push({
      road: s.road,
      from: s.at,
      way: { x: (o.at.x - s.at.x) / best.gap, z: (o.at.z - s.at.z) / best.gap },
      gap: best.gap,
      detour: round / best.gap,
    });
  }
  return found.sort((p, q) => q.detour - p.detour);
}

/** Dry, unbuilt and not too steep, all the way across. */
function acrossOpenGround(city: City, a: Vec2, b: Vec2, built: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }[]): boolean {
  const gap = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(2, Math.ceil(gap / (5 * M)));
  let was = groundAt(city.terrain, a.x, a.z);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (inWater(city, x, z)) return false;
    for (const block of built) {
      const r = block.bounds;
      if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return false;
    }
    const h = groundAt(city.terrain, x, z);
    if (Math.abs(h - was) / (gap / steps) > GATE_GRADE) return false;
    was = h;
  }
  return true;
}

/**
 * How far it is by road from one sample to the other, or `cap` if it is at
 * least that. Starts from both ends of the first road, charged the distance
 * to each; ends at either end of the second.
 */
function roadDistance(
  city: City,
  from: { road: CityRoad; t: number },
  to: { road: CityRoad; t: number },
  cap: number,
): number {
  const dist = new Map<number, number>();
  const open: [number, number][] = [
    [from.road.a, from.road.length * from.t],
    [from.road.b, from.road.length * (1 - from.t)],
  ];
  const targets = new Map([
    [to.road.a, to.road.length * to.t],
    [to.road.b, to.road.length * (1 - to.t)],
  ]);
  let best = cap;
  while (open.length > 0) {
    let k = 0;
    for (let i = 1; i < open.length; i++) if (open[i][1] < open[k][1]) k = i;
    const [node, d] = open.splice(k, 1)[0];
    if (d >= best) break;
    if ((dist.get(node) ?? Infinity) <= d) continue;
    dist.set(node, d);
    const end = targets.get(node);
    if (end !== undefined) best = Math.min(best, d + end);
    for (const id of city.nodes[node].roads) {
      const road = city.roads[id];
      if (road.class === 'ramp' || road.class === 'interstate') continue;
      const next = road.a === node ? road.b : road.a;
      const nd = d + road.length;
      if (nd < best && nd < (dist.get(next) ?? Infinity)) open.push([next, nd]);
    }
  }
  return best;
}
