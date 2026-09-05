import {
  CITY_WIDTH,
  CITY_DEPTH,
  CITY_ARTERIAL_COLS,
  CITY_ARTERIAL_ROWS,
  CITY_ARTERIAL_JITTER,
  CITY_ARTERIAL_LANES,
  CITY_ARTERIAL_SPEED,
  CITY_LANE_WIDTH,
  CITY_DOWNTOWN_RADIUS,
  CITY_INDUSTRIAL_RADIUS,
  CITY_WATERFRONT_REACH,
  DISTRICTS,
} from '../constants';
import { Rng } from './rng';
import type {
  Axis,
  City,
  CityBlock,
  CityNode,
  CityRoad,
  DistrictKind,
  Rect,
  RoadClass,
  Superblock,
} from './types';

/**
 * Generate Kestrel Bay from a seed (issue #83).
 *
 * The city is built in three passes, largest first:
 *
 *  1. **Arterials.** A handful of roads crossing the whole city, edge to edge.
 *     They are the skeleton, and they are laid first for a structural reason:
 *     because every later street runs from one arterial to another, the network
 *     is connected by construction rather than by hoping it worked out.
 *  2. **Districts.** The cells between the arterials get a character each,
 *     from a downtown core to a waterfront strip and an industrial edge.
 *  3. **Streets.** Each cell is divided into blocks at its district's spacing,
 *     and the dividing lines are its streets.
 *
 * Everything is axis-aligned. That is a deliberate limit and not laziness: it
 * keeps blocks rectangular for the extrusions in #84, keeps "which road is the
 * car on" cheap for collision in #86, and a grid with varied spacing, dropped
 * streets and wandering arterials does not read as graph paper. Diagonals and
 * the bends that come with them can be layered on later without moving this.
 *
 * Pure: same seed, same city, no `Math.random`, no DOM.
 */
export function generateCity(seed: number): City {
  const rng = new Rng(seed);

  const bounds: Rect = {
    minX: -CITY_WIDTH / 2,
    minZ: -CITY_DEPTH / 2,
    maxX: CITY_WIDTH / 2,
    maxZ: CITY_DEPTH / 2,
  };

  const xLines = arterialLines(rng, bounds.minX, bounds.maxX, CITY_ARTERIAL_COLS);
  const zLines = arterialLines(rng, bounds.minZ, bounds.maxZ, CITY_ARTERIAL_ROWS);

  const cells = cellsBetween(xLines, zLines);
  const districts = assignDistricts(rng, cells, bounds);
  const superblocks: Superblock[] = cells.map((c, i) => ({ bounds: c, district: districts[i] }));

  const spans: Span[] = [];
  const blocks: CityBlock[] = [];

  // Arterials span the full city, so they carry traffic right across it.
  for (const x of xLines) {
    spans.push({ axis: 'z', at: x, from: bounds.minZ, to: bounds.maxZ, class: 'arterial', district: 'midtown' });
  }
  for (const z of zLines) {
    spans.push({ axis: 'x', at: z, from: bounds.minX, to: bounds.maxX, class: 'arterial', district: 'midtown' });
  }

  const arterialHalf = roadWidth(CITY_ARTERIAL_LANES) / 2;
  for (const cell of superblocks) {
    fillSuperblock(rng, cell, arterialHalf, spans, blocks);
  }

  const { nodes, roads } = buildGraph(spans);

  return { seed, bounds, shoreZ: bounds.maxZ, nodes, roads, blocks, superblocks };
}

/** A road centreline before it is cut at its crossings: `count` of these make a graph. */
interface Span {
  axis: Axis;
  /** The fixed coordinate: z for an 'x' road, x for a 'z' road. */
  at: number;
  from: number;
  to: number;
  class: RoadClass;
  district: DistrictKind;
}

function roadWidth(lanes: number): number {
  return lanes * CITY_LANE_WIDTH;
}

/**
 * Positions for `count` arterials spanning [min, max], both edges included.
 * Interior ones wander, so the city is not four even quarters.
 */
function arterialLines(rng: Rng, min: number, max: number, count: number): number[] {
  const spacing = (max - min) / (count - 1);
  const wander = spacing * CITY_ARTERIAL_JITTER;
  const lines = [min];
  for (let i = 1; i < count - 1; i++) {
    lines.push(min + i * spacing + rng.range(-wander, wander));
  }
  lines.push(max);
  return lines;
}

function cellsBetween(xLines: number[], zLines: number[]): Rect[] {
  const cells: Rect[] = [];
  for (let i = 0; i < xLines.length - 1; i++) {
    for (let j = 0; j < zLines.length - 1; j++) {
      cells.push({ minX: xLines[i], minZ: zLines[j], maxX: xLines[i + 1], maxZ: zLines[j + 1] });
    }
  }
  return cells;
}

const centre = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/**
 * Give every cell a district.
 *
 * Three seeded anchors do the placing: downtown near the middle but pulled
 * toward the water, a harbour somewhere along the shore, and the industrial
 * edge in one of the far corners. Downtown is tested first, because a downtown
 * that runs right down to the bay is the more interesting city.
 */
function assignDistricts(rng: Rng, cells: Rect[], bounds: Rect): DistrictKind[] {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const downtown = {
    x: rng.range(-0.12, 0.12) * width,
    z: bounds.minZ + depth * rng.range(0.55, 0.78),
  };
  // The port. Only the shore near it is waterfront; the rest of the coast is
  // whatever the city behind it happens to be.
  const harbour = rng.range(-0.32, 0.32) * width;
  // The industrial edge goes in a far corner, on whichever side downtown is not.
  const industrial = {
    x: (downtown.x > 0 ? -1 : 1) * width * rng.range(0.3, 0.42),
    z: bounds.minZ + depth * rng.range(0.1, 0.22),
  };

  // A cell is on the shore if it reaches the north edge of the map.
  const onShore = (cell: Rect) => cell.maxZ >= bounds.maxZ - 1;

  const kinds = cells.map((cell): DistrictKind => {
    const c = centre(cell);
    if (Math.hypot(c.x - downtown.x, c.z - downtown.z) < CITY_DOWNTOWN_RADIUS) return 'downtown';
    if (onShore(cell) && Math.abs(c.x - harbour) < CITY_WATERFRONT_REACH) return 'waterfront';
    if (Math.hypot(c.x - industrial.x, c.z - industrial.z) < CITY_INDUSTRIAL_RADIUS) return 'industrial';
    return 'midtown';
  });

  // Every district has to exist somewhere: a seed that happens to leave one out
  // is a city missing a place the game refers to, not a variation.
  const anchors: Record<DistrictKind, { x: number; z: number }> = {
    downtown,
    industrial,
    waterfront: { x: harbour, z: bounds.maxZ },
    midtown: { x: 0, z: bounds.minZ + depth * 0.35 },
  };
  for (const kind of Object.keys(anchors) as DistrictKind[]) {
    if (kinds.includes(kind)) continue;
    const anchor = anchors[kind];
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      // Never take a cell that is the last of its own kind, or we just move the gap.
      if (kinds.filter((k) => k === kinds[i]).length < 2) continue;
      const c = centre(cells[i]);
      const d = Math.hypot(c.x - anchor.x, c.z - anchor.z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0) kinds[best] = kind;
  }

  return kinds;
}

/**
 * Divide [min, max] at its district's spacing, and hand back the cut positions.
 * The walk stops while there is still most of a block left, so the last block
 * is a block and not a sliver.
 */
function divide(rng: Rng, min: number, max: number, target: number, jitter: number): number[] {
  const cuts: number[] = [];
  let at = min;
  for (;;) {
    const next = at + target * (1 + rng.range(-jitter, jitter));
    if (next > max - target * 0.6) break;
    cuts.push(next);
    at = next;
  }
  return cuts;
}

/**
 * Lay one cell's streets and blocks.
 *
 * Streets run from arterial centreline to arterial centreline so they meet the
 * skeleton exactly; the blocks between them are inset by half a carriageway on
 * every side, which is the gap #84 builds in and #86 keeps the car out of.
 */
function fillSuperblock(
  rng: Rng,
  cell: Superblock,
  arterialHalf: number,
  spans: Span[],
  blocks: CityBlock[],
): void {
  const character = DISTRICTS[cell.district];
  const { bounds, district } = cell;
  const streetHalf = roadWidth(character.lanes) / 2;

  const inner: Rect = {
    minX: bounds.minX + arterialHalf,
    minZ: bounds.minZ + arterialHalf,
    maxX: bounds.maxX - arterialHalf,
    maxZ: bounds.maxZ - arterialHalf,
  };

  const keep = () => !rng.chance(character.skip);
  const xCuts = divide(rng, bounds.minX, bounds.maxX, character.blockX, character.jitter).filter(keep);
  const zCuts = divide(rng, bounds.minZ, bounds.maxZ, character.blockZ, character.jitter).filter(keep);

  for (const x of xCuts) {
    spans.push({ axis: 'z', at: x, from: bounds.minZ, to: bounds.maxZ, class: 'street', district });
  }
  for (const z of zCuts) {
    spans.push({ axis: 'x', at: z, from: bounds.minX, to: bounds.maxX, class: 'street', district });
  }

  const xEdges = [inner.minX, ...xCuts, inner.maxX];
  const zEdges = [inner.minZ, ...zCuts, inner.maxZ];
  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < zEdges.length - 1; j++) {
      blocks.push({
        district,
        bounds: {
          minX: xEdges[i] + (i === 0 ? 0 : streetHalf),
          maxX: xEdges[i + 1] - (i + 2 === xEdges.length ? 0 : streetHalf),
          minZ: zEdges[j] + (j === 0 ? 0 : streetHalf),
          maxZ: zEdges[j + 1] - (j + 2 === zEdges.length ? 0 : streetHalf),
        },
      });
    }
  }
}

/** Snap a coordinate before it is used as a node key, so a shared line is one node. */
const snap = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Turn overlapping centrelines into a graph: cut every span at each span that
 * crosses it, and share a node wherever two roads meet. O(n²) over a few
 * hundred spans, once, at load.
 */
function buildGraph(spans: Span[]): { nodes: CityNode[]; roads: CityRoad[] } {
  const nodes: CityNode[] = [];
  const byKey = new Map<string, CityNode>();
  const roads: CityRoad[] = [];
  const seen = new Set<string>();

  const nodeAt = (x: number, z: number): CityNode => {
    const key = `${snap(x)}|${snap(z)}`;
    let node = byKey.get(key);
    if (!node) {
      node = { id: nodes.length, pos: { x: snap(x), z: snap(z) }, roads: [] };
      byKey.set(key, node);
      nodes.push(node);
    }
    return node;
  };

  for (const span of spans) {
    // Where the perpendicular spans cross this one, plus its own two ends.
    const cuts = new Set([snap(span.from), snap(span.to)]);
    for (const other of spans) {
      if (other.axis === span.axis) continue;
      if (other.at < span.from || other.at > span.to) continue;
      if (span.at < other.from || span.at > other.to) continue;
      cuts.add(snap(other.at));
    }

    const along = [...cuts].sort((p, q) => p - q);
    const lanes = span.class === 'arterial' ? CITY_ARTERIAL_LANES : DISTRICTS[span.district].lanes;
    const speed = span.class === 'arterial' ? CITY_ARTERIAL_SPEED : DISTRICTS[span.district].speed;

    for (let i = 0; i < along.length - 1; i++) {
      const length = along[i + 1] - along[i];
      if (length < 1) continue; // two crossings on top of each other

      const a =
        span.axis === 'x' ? nodeAt(along[i], span.at) : nodeAt(span.at, along[i]);
      const b =
        span.axis === 'x' ? nodeAt(along[i + 1], span.at) : nodeAt(span.at, along[i + 1]);

      const key = `${a.id}-${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const road: CityRoad = {
        id: roads.length,
        a: a.id,
        b: b.id,
        axis: span.axis,
        class: span.class,
        district: span.district,
        lanes,
        width: roadWidth(lanes),
        speed,
        length,
      };
      roads.push(road);
      a.roads.push(road.id);
      b.roads.push(road.id);
    }
  }

  return { nodes, roads };
}
