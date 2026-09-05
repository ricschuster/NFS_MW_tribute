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
  CITY_WATERFRONT_RADIUS,
  CITY_BRIDGES,
  CITY_MAX_BRIDGE,
  CITY_BRIDGE_SPACING,
  CITY_CLIP_STEP,
  CITY_MIN_STREET,
  BOULEVARD_CLEARANCE,
  BOULEVARD_LANES,
  BOULEVARD_SPEED,
  DENSITY_RANGE,
  OPEN_BLOCK_CHANCE,
  DISTRICTS,
} from '../constants';
import { Rng } from './rng';
import { buildingsOn } from './buildings';
import { furnitureFor } from './furniture';
import { addInterstate } from './interstate';
import { boulevardRoutes } from './boulevards';
import { makeWater, type Water } from './water';
import { segmentIntersection, segmentToRect } from './grid';
import type {
  Axis,
  Building,
  City,
  CityBlock,
  CityNode,
  CityRoad,
  DistrictKind,
  Rect,
  RoadClass,
  Superblock,
  Vec2,
} from './types';

/**
 * Generate Kestrel Bay from a seed (issue #83; ADR-0005 for its shape).
 *
 * Water comes first and land second, which is the point of ADR-0005: a bay eats
 * into the north edge and a river runs inland from it, and the street network
 * is cut against them rather than drawn around them. The passes run largest to
 * smallest:
 *
 *  1. **Water.** A wandering shoreline, and a river that severs the city.
 *  2. **Arterials.** A handful of roads crossing the whole city. They are laid
 *     before anything else because every later street runs from one arterial to
 *     another, which is what keeps the network connected on land.
 *  3. **Districts.** The cells between the arterials get a character each, from
 *     seeded anchors: a downtown, a harbour, an industrial edge.
 *  4. **Streets.** Each cell is divided into blocks at its district's spacing.
 *  5. **The cut.** Every road is clipped to the land, and a chosen few of the
 *     water gaps become bridges.
 *  6. **The repair.** Cutting a network can strand a district, so generation
 *     ends by proving the city is drivable and fixing it if it is not.
 *  7. **Boulevards and the interstate.** Curves laid over the finished grid,
 *     and an elevated circuit over all of it.
 *  7b. **The interstate.** An elevated circuit on its own alignment, joined to
 *     the streets only by ramps. See `interstate.ts`: this is the one ADR-0004
 *     was written for.
 *  8. **Buildings and furniture.** Each block is divided into lots and built
 *     on, and the finished streets get lamps, signs and bridge parapets. Both
 *     are descriptions and never meshes: see `buildings.ts`, `furniture.ts`.
 *
 * Roads are axis-aligned, which keeps blocks rectangular for the extrusions in
 * #84 and "which road am I on" cheap for #86. ADR-0005 rule 4 ends that for the
 * residential streets, and records the cost there rather than leaving it to be
 * discovered.
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

  const water = makeWater(rng, bounds);

  const xLines = arterialLines(rng, bounds.minX, bounds.maxX, CITY_ARTERIAL_COLS);
  const zLines = arterialLines(rng, bounds.minZ, bounds.maxZ, CITY_ARTERIAL_ROWS);

  // A cell with no land in it is open water: no streets, no blocks, no district.
  const cells = cellsBetween(xLines, zLines).filter((cell) => !allWater(cell, water));
  const districts = assignDistricts(rng, cells, bounds, water);
  // Each superblock gets its own density, so the city has thin quarters and
  // dense ones rather than one even spread of buildings.
  const superblocks: Superblock[] = cells.map((c, i) => ({
    bounds: c,
    district: districts[i],
    density: 1 + rng.range(-DENSITY_RANGE, DENSITY_RANGE),
  }));

  const laid: Span[] = [];
  const blocks: CityBlock[] = [];

  for (const x of xLines) {
    laid.push({
      from: { x, z: bounds.minZ },
      to: { x, z: bounds.maxZ },
      axis: 'z',
      class: 'arterial',
      district: 'midtown',
    });
  }
  for (const z of zLines) {
    laid.push({
      from: { x: bounds.minX, z },
      to: { x: bounds.maxX, z },
      axis: 'x',
      class: 'arterial',
      district: 'midtown',
    });
  }

  const arterialHalf = roadWidth(CITY_ARTERIAL_LANES) / 2;
  for (const cell of superblocks) {
    fillSuperblock(rng, cell, arterialHalf, water, laid, blocks);
  }

  // Boulevards go in as ordinary spans, so they are cut against the water and
  // split at every crossing by the same code as everything else. Each curve is
  // a chain of short straight pieces; the bend is in where the pieces point.
  for (const route of boulevardRoutes(rng, bounds)) {
    for (let i = 1; i < route.length; i++) {
      laid.push({ from: route[i - 1], to: route[i], class: 'boulevard', district: 'midtown' });
    }
  }

  // Cut the network against the water, keeping what crosses it as candidates.
  const dry: Span[] = [];
  const gaps: Gap[] = [];
  for (const span of laid) clip(span, water, dry, gaps);

  const { nodes, roads } = connect(dry, gaps, chooseBridges(gaps));

  // Blocks are checked against the water at block resolution, which a river
  // can slip through at building resolution. Buildings are cheap to test
  // exactly, so test them exactly rather than widening the block probe.
  // The interstate goes on after the surface network is whole, and joins it
  // only through its ramps. It is deliberately not part of the connectivity
  // repair above: the surface city has to stand up without it.
  addInterstate(rng, bounds, nodes, roads);

  // A boulevard runs through ground the grid had already parcelled up, so the
  // blocks it crosses have to make way for it.
  const swept = roads.filter((road) => road.class === 'boulevard');
  const onBoulevard = (r: Rect) =>
    swept.some((road) => {
      const a = nodes[road.a].pos;
      const b = nodes[road.b].pos;
      return segmentToRect(a, b, r) < road.width / 2 + BOULEVARD_CLEARANCE;
    });

  const standing: CityBlock[] = [];
  for (const block of blocks) {
    // Trim against the water as well as the boulevard: pulling a block back
    // moves its corners, and the water test samples corners, so a block that
    // was clear can stop being clear once it has been trimmed.
    const fitted = pullClear(block.bounds, (r) => onBoulevard(r) || anyWater(r, water));
    if (fitted) standing.push({ ...block, bounds: fitted });
  }
  blocks.length = 0;
  blocks.push(...standing);

  // How built up a block is comes from the superblock it sits in, so the whole
  // quarter thins together rather than block by block.
  const densityAt = (block: CityBlock) => {
    const x = (block.bounds.minX + block.bounds.maxX) / 2;
    const z = (block.bounds.minZ + block.bounds.maxZ) / 2;
    const cell = superblocks.find(
      (s) => x >= s.bounds.minX && x <= s.bounds.maxX && z >= s.bounds.minZ && z <= s.bounds.maxZ,
    );
    return cell?.density ?? 1;
  };

  const buildings: Building[] = [];
  for (const block of blocks) {
    if (block.open) continue;
    let built = 0;
    for (const building of buildingsOn(rng, block, densityAt(block))) {
      if (anyWater(building.footprint, water)) continue;
      buildings.push(building);
      built++;
    }
    // A block that ended up with nothing on it is open ground, whatever the
    // roll said. Left as a paved block it reads as an enormous empty forecourt.
    if (built === 0) block.open = true;
  }

  const city: City = {
    seed,
    bounds,
    water: water.bodies,
    nodes,
    roads,
    blocks,
    superblocks,
    buildings,
    furniture: [],
  };
  // Furniture is placed from the finished road graph, so it goes on kerbs that
  // actually exist rather than on ones that were bridged or pruned away.
  city.furniture = furnitureFor(rng, city);
  return city;
}

/**
 * A road centreline before it is cut at its crossings.
 *
 * A segment between two points, not a coordinate on an axis. That is what lets
 * a boulevard go through the same pipeline as a street: cut against the water,
 * split at every crossing, repaired if it strands anything. `axis` survives
 * only as a fast path - most spans really are axis-aligned, and knowing it
 * turns a crossing test into two comparisons.
 */
interface Span {
  from: Vec2;
  to: Vec2;
  class: RoadClass;
  district: DistrictKind;
  bridge?: boolean;
  axis?: Axis;
}

/** A stretch of water a road would have to cross: a bridge, or a dead end. */
interface Gap {
  span: Span;
  /** Where the land ends and starts again, as fractions along the span. */
  from: number;
  to: number;
  length: number;
}

const spanLength = (span: Span) =>
  Math.hypot(span.to.x - span.from.x, span.to.z - span.from.z);

/** A point a fraction `t` along a span. */
function pointAt(span: Span, t: number): Vec2 {
  return {
    x: span.from.x + (span.to.x - span.from.x) * t,
    z: span.from.z + (span.to.z - span.from.z) * t,
  };
}

/** Where two spans cross, or null. Axis-aligned pairs take the cheap route. */
function crossing(a: Span, b: Span): Vec2 | null {
  if (a.axis && b.axis) {
    if (a.axis === b.axis) return null;
    const [along, across] = a.axis === 'x' ? [a, b] : [b, a];
    const x = across.from.x;
    const z = along.from.z;
    if (x < Math.min(along.from.x, along.to.x) || x > Math.max(along.from.x, along.to.x)) return null;
    if (z < Math.min(across.from.z, across.to.z) || z > Math.max(across.from.z, across.to.z)) return null;
    return { x, z };
  }
  return segmentIntersection(a.from, a.to, b.from, b.to);
}

function roadWidth(lanes: number): number {
  return lanes * CITY_LANE_WIDTH;
}

/** Road classes that carry their own lane count and speed, whatever district they cross. */
const LANES_FOR: Partial<Record<RoadClass, number>> = {
  arterial: CITY_ARTERIAL_LANES,
  boulevard: BOULEVARD_LANES,
};
const SPEED_FOR: Partial<Record<RoadClass, number>> = {
  arterial: CITY_ARTERIAL_SPEED,
  boulevard: BOULEVARD_SPEED,
};

/**
 * Positions for `count` arterials spanning [min, max], both edges included.
 * Interior ones wander, so the city is not an even lattice.
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

/** The nine points that stand in for a rectangle when asking about the water. */
function probes(r: Rect): { x: number; z: number }[] {
  const xs = [r.minX, (r.minX + r.maxX) / 2, r.maxX];
  const zs = [r.minZ, (r.minZ + r.maxZ) / 2, r.maxZ];
  const out: { x: number; z: number }[] = [];
  for (const x of xs) for (const z of zs) out.push({ x, z });
  return out;
}

const allWater = (r: Rect, water: Water) => probes(r).every((p) => water.isWater(p.x, p.z));
const anyWater = (r: Rect, water: Water) => probes(r).some((p) => water.isWater(p.x, p.z));

/**
 * Give every land cell a district.
 *
 * Three seeded anchors do the placing: downtown near the middle but pulled
 * toward the water, a harbour somewhere along the shore, and the industrial
 * edge in a far corner. Downtown is tested first, because a downtown that runs
 * right down to the bay is the more interesting city. The waterfront is what
 * touches water near the harbour, which takes in the riverbanks by the port
 * but leaves the rest of the coast to whatever city sits behind it.
 */
function assignDistricts(rng: Rng, cells: Rect[], bounds: Rect, water: Water): DistrictKind[] {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const downtown = {
    x: rng.range(-0.12, 0.12) * width,
    z: bounds.minZ + depth * rng.range(0.55, 0.78),
  };
  // The port, somewhere along the shore. The docks grow around it.
  const harbour = { x: rng.range(-0.32, 0.32) * width, z: bounds.maxZ };
  const industrial = {
    x: (downtown.x > 0 ? -1 : 1) * width * rng.range(0.3, 0.42),
    z: bounds.minZ + depth * rng.range(0.1, 0.22),
  };

  const kinds = cells.map((cell): DistrictKind => {
    const c = centre(cell);
    if (Math.hypot(c.x - downtown.x, c.z - downtown.z) < CITY_DOWNTOWN_RADIUS) return 'downtown';
    if (anyWater(cell, water) && Math.hypot(c.x - harbour.x, c.z - harbour.z) < CITY_WATERFRONT_RADIUS) {
      return 'waterfront';
    }
    if (Math.hypot(c.x - industrial.x, c.z - industrial.z) < CITY_INDUSTRIAL_RADIUS) return 'industrial';
    return 'midtown';
  });

  // Every district has to exist somewhere: a seed that happens to leave one out
  // is a city missing a place the game refers to, not a variation.
  const anchors: Record<DistrictKind, { x: number; z: number }> = {
    downtown,
    industrial,
    waterfront: harbour,
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

/** Move one edge of a rectangle inward by `t` of its span. */
function pullIn(r: Rect, edge: 'minX' | 'maxX' | 'minZ' | 'maxZ', t: number): Rect {
  const span = edge === 'minX' || edge === 'maxX' ? r.maxX - r.minX : r.maxZ - r.minZ;
  const by = span * t;
  return {
    ...r,
    [edge]: edge === 'minX' || edge === 'minZ' ? r[edge] + by : r[edge] - by,
  };
}

const area = (r: Rect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);

/**
 * Pull a block back off whatever is in the way, instead of deleting it.
 *
 * Used for both the water and the boulevards, and for the same reason in each:
 * deleting a whole block because something clips its corner takes a hundred
 * metres of city out for the sake of ten. A diagonal boulevard clips a corner
 * off every block it passes, so without this it carves a staircase-shaped hole
 * far wider than the road.
 *
 * Whatever it is almost always arrives from one side, so each edge is tried in
 * turn and the roomiest clear result wins. A block reached from two sides is a
 * sliver, not a plot, and is dropped.
 */
function pullClear(block: Rect, blocked: (r: Rect) => boolean): Rect | null {
  if (!blocked(block)) return block;

  let best: Rect | null = null;
  for (const edge of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
    for (let t = 0.1; t <= 0.7; t += 0.05) {
      const pulled = pullIn(block, edge, t);
      if (blocked(pulled)) continue;
      if (!best || area(pulled) > area(best)) best = pulled;
      break;
    }
  }
  return best && area(best) >= area(block) * 0.3 ? best : null;
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
 * every side, which is the gap #84 builds in and #86 keeps the car out of. A
 * block with any water in it is dropped rather than clipped, so the coast steps
 * along block edges the way a quay does.
 */
function fillSuperblock(
  rng: Rng,
  cell: Superblock,
  arterialHalf: number,
  water: Water,
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

  // A thin superblock gets fewer streets as well as fewer buildings; without
  // that it is a full grid with gaps in it rather than somewhere emptier.
  const skip = Math.min(0.6, character.skip / Math.max(0.35, cell.density));
  const keep = () => !rng.chance(skip);
  const xCuts = divide(rng, bounds.minX, bounds.maxX, character.blockX, character.jitter).filter(keep);
  const zCuts = divide(rng, bounds.minZ, bounds.maxZ, character.blockZ, character.jitter).filter(keep);

  for (const x of xCuts) {
    spans.push({
      from: { x, z: bounds.minZ },
      to: { x, z: bounds.maxZ },
      axis: 'z',
      class: 'street',
      district,
    });
  }
  for (const z of zCuts) {
    spans.push({
      from: { x: bounds.minX, z },
      to: { x: bounds.maxX, z },
      axis: 'x',
      class: 'street',
      district,
    });
  }

  const xEdges = [inner.minX, ...xCuts, inner.maxX];
  const zEdges = [inner.minZ, ...zCuts, inner.maxZ];
  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < zEdges.length - 1; j++) {
      const block: Rect = {
        minX: xEdges[i] + (i === 0 ? 0 : streetHalf),
        maxX: xEdges[i + 1] - (i + 2 === xEdges.length ? 0 : streetHalf),
        minZ: zEdges[j] + (j === 0 ? 0 : streetHalf),
        maxZ: zEdges[j + 1] - (j + 2 === zEdges.length ? 0 : streetHalf),
      };
      const fitted = pullClear(block, (r) => anyWater(r, water));
      if (!fitted) continue;
      // Some of a city is gaps: a park, a yard, a car park, a lot nobody built on.
      const open = rng.chance(Math.min(0.5, OPEN_BLOCK_CHANCE / Math.max(0.35, cell.density)));
      blocks.push({ district, bounds: fitted, open });
    }
  }
}

/**
 * Find where a span leaves the land, to within a metre or so, as a fraction
 * along it. Sampling alone would put the bank up to a whole sample away from
 * where it is, and a bridge that starts short of the water is a road that
 * stops in a field.
 */
function edge(span: Span, water: Water, dry: number, wet: number): number {
  let lo = dry;
  let hi = wet;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const p = pointAt(span, mid);
    if (water.isWater(p.x, p.z)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * Cut one span against the water: the stretches on land go to `dry`, and the
 * stretches of water between them are recorded as gaps a bridge could cross.
 */
function clip(span: Span, water: Water, dry: Span[], gaps: Gap[]): void {
  const length = spanLength(span);
  const runs: { from: number; to: number }[] = [];
  let start: number | null = null;
  let previous = 0;

  const steps = Math.max(1, Math.ceil(length / CITY_CLIP_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointAt(span, t);
    const land = !water.isWater(p.x, p.z);
    if (land && start === null) {
      start = i === 0 ? t : edge(span, water, t, previous);
    } else if (!land && start !== null) {
      runs.push({ from: start, to: edge(span, water, previous, t) });
      start = null;
    }
    previous = t;
  }
  if (start !== null) runs.push({ from: start, to: 1 });

  const kept = runs.filter((r) => (r.to - r.from) * length >= CITY_MIN_STREET);
  for (const run of kept) {
    dry.push({ ...span, from: pointAt(span, run.from), to: pointAt(span, run.to) });
  }

  // Only a major road is worth bridging; a side street stops at the bank.
  if (span.class !== 'arterial' && span.class !== 'boulevard') return;
  for (let i = 0; i < kept.length - 1; i++) {
    const from = kept[i].to;
    const to = kept[i + 1].from;
    const gap = (to - from) * length;
    if (gap <= CITY_MAX_BRIDGE) gaps.push({ span, from, to, length: gap });
  }
}

const bridgeSpan = (gap: Gap): Span => ({
  ...gap.span,
  from: pointAt(gap.span, gap.from),
  to: pointAt(gap.span, gap.to),
  bridge: true,
});

/**
 * Pick the crossings the city is designed around (ADR-0005 rule 2): the
 * shortest ones, held apart from each other so each is a separate decision to
 * make during a pursuit. The repair pass adds more only if it has to.
 */
function chooseBridges(gaps: Gap[]): number[] {
  const midpoint = (gap: Gap) => pointAt(gap.span, (gap.from + gap.to) / 2);
  const order = gaps.map((_, i) => i).sort((a, b) => gaps[a].length - gaps[b].length);
  const chosen: number[] = [];
  for (const i of order) {
    if (chosen.length >= CITY_BRIDGES) break;
    const here = midpoint(gaps[i]);
    const crowded = chosen.some((j) => {
      const there = midpoint(gaps[j]);
      return Math.hypot(there.x - here.x, there.z - here.z) < CITY_BRIDGE_SPACING;
    });
    if (!crowded) chosen.push(i);
  }
  return chosen;
}

/** Snap a coordinate before it is used as a node key, so a shared line is one node. */
const snap = (v: number) => Math.round(v * 1000) / 1000;
const key = (x: number, z: number) => `${snap(x)}|${snap(z)}`;

interface Graph {
  nodes: CityNode[];
  roads: CityRoad[];
  at: Map<string, CityNode>;
}

/**
 * Turn overlapping centrelines into a graph: cut every span at each span that
 * crosses it, and share a node wherever two roads meet.
 */
function buildGraph(spans: Span[]): Graph {
  const nodes: CityNode[] = [];
  const at = new Map<string, CityNode>();
  const roads: CityRoad[] = [];
  const seen = new Set<string>();

  const nodeAt = (x: number, z: number): CityNode => {
    const k = key(x, z);
    let node = at.get(k);
    if (!node) {
      node = { id: nodes.length, pos: { x: snap(x), z: snap(z) }, y: 0, roads: [] };
      at.set(k, node);
      nodes.push(node);
    }
    return node;
  };

  for (const span of spans) {
    const length = spanLength(span);
    if (length < 1) continue;

    // Everything crossing this span, as fractions along it, plus its own ends.
    const cuts = new Set([0, 1]);
    for (const other of spans) {
      if (other === span) continue;
      const at = crossing(span, other);
      if (!at) continue;
      const t = Math.hypot(at.x - span.from.x, at.z - span.from.z) / length;
      if (t > 0 && t < 1) cuts.add(t);
    }

    const along = [...cuts].sort((p, q) => p - q);
    const lanes = LANES_FOR[span.class] ?? DISTRICTS[span.district].lanes;
    const speed = SPEED_FOR[span.class] ?? DISTRICTS[span.district].speed;

    for (let i = 0; i < along.length - 1; i++) {
      const p1 = pointAt(span, along[i]);
      const p2 = pointAt(span, along[i + 1]);
      const piece = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      if (piece < 1) continue; // two crossings on top of each other

      const a = nodeAt(p1.x, p1.z);
      const b = nodeAt(p2.x, p2.z);
      if (a.id === b.id) continue;

      const k = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      if (seen.has(k)) continue;
      seen.add(k);

      const road: CityRoad = {
        id: roads.length,
        a: a.id,
        b: b.id,
        class: span.class,
        district: span.district,
        lanes,
        width: roadWidth(lanes),
        speed,
        length: piece,
        bridge: span.bridge ?? false,
      };
      roads.push(road);
      a.roads.push(road.id);
      b.roads.push(road.id);
    }
  }

  return { nodes, roads, at };
}

/** Which connected piece each node belongs to, and how many pieces there are. */
function components(graph: Graph): { of: number[]; count: number } {
  const of = new Array<number>(graph.nodes.length).fill(-1);
  let count = 0;
  for (const start of graph.nodes) {
    if (of[start.id] !== -1) continue;
    const queue = [start.id];
    of[start.id] = count;
    while (queue.length > 0) {
      const node = graph.nodes[queue.pop() as number];
      for (const id of node.roads) {
        const road = graph.roads[id];
        const next = road.a === node.id ? road.b : road.a;
        if (of[next] === -1) {
          of[next] = count;
          queue.push(next);
        }
      }
    }
    count++;
  }
  return { of, count };
}

/**
 * Build the graph, and keep bridging until you can drive across the whole city
 * (ADR-0005 rule 3).
 *
 * Cutting a network against water can sever a district, and which seed does
 * that is not worth trying to predict. So the invariant is enforced rather than
 * assumed: while the city is in pieces, span the shortest water gap that joins
 * two of them. Anything still unreachable at the end - a stub of street left on
 * a headland - is deleted, because a piece of road nobody can drive to is not
 * content.
 */
function connect(dry: Span[], gaps: Gap[], initial: number[]): { nodes: CityNode[]; roads: CityRoad[] } {
  const chosen = new Set(initial);
  const rebuild = () => buildGraph([...dry, ...[...chosen].map((i) => bridgeSpan(gaps[i]))]);
  let graph = rebuild();

  for (let attempt = 0; attempt < gaps.length; attempt++) {
    const parts = components(graph);
    if (parts.count === 1) return graph;

    let best = -1;
    for (let i = 0; i < gaps.length; i++) {
      if (chosen.has(i)) continue;
      const gap = gaps[i];
      const p1 = pointAt(gap.span, gap.from);
      const p2 = pointAt(gap.span, gap.to);
      const a = graph.at.get(key(p1.x, p1.z));
      const b = graph.at.get(key(p2.x, p2.z));
      if (!a || !b || parts.of[a.id] === parts.of[b.id]) continue;
      if (best === -1 || gap.length < gaps[best].length) best = i;
    }
    if (best === -1) break;

    chosen.add(best);
    graph = rebuild();
  }

  return prune(graph);
}

/** Keep the largest connected piece and renumber it, dropping the orphans. */
function prune(graph: Graph): { nodes: CityNode[]; roads: CityRoad[] } {
  const parts = components(graph);
  const size = new Array<number>(parts.count).fill(0);
  for (const part of parts.of) size[part]++;
  const keep = size.indexOf(Math.max(...size));

  const nodes: CityNode[] = [];
  const remap = new Map<number, number>();
  for (const node of graph.nodes) {
    if (parts.of[node.id] !== keep) continue;
    remap.set(node.id, nodes.length);
    nodes.push({ id: nodes.length, pos: node.pos, y: node.y, roads: [] });
  }

  const roads: CityRoad[] = [];
  for (const road of graph.roads) {
    const a = remap.get(road.a);
    const b = remap.get(road.b);
    if (a === undefined || b === undefined) continue;
    const kept: CityRoad = { ...road, id: roads.length, a, b };
    roads.push(kept);
    nodes[a].roads.push(kept.id);
    nodes[b].roads.push(kept.id);
  }

  return { nodes, roads };
}
