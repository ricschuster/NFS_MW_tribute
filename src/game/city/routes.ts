import {
  ROUTE_COUNT,
  ROUTE_RADIUS,
  ROUTE_LAPS,
  ROUTE_SPACING,
  ROUTE_MIN_LENGTH,
  ROUTE_MAX_LENGTH,
  CHECKPOINT_SPACING,
} from '../constants';
import type { City, CityRoute, Vec2 } from './types';

/**
 * Circuit routes through Kestrel Bay (#70).
 *
 * Generated off the road graph rather than authored, for the same reason the
 * city is: the map is a seed, and an authored route would have to be redrawn
 * by hand every time that seed moved.
 *
 * A route is a loop of *real streets*. Four corner junctions are picked around
 * a centre and joined by shortest paths through the graph, so every metre of
 * it is a road you can actually drive - which matters more than it sounds,
 * because the rival runs at a fixed pace along the line and a route that cut
 * through a building would be a rival that cheats through one.
 *
 * Surface roads only. The interstate is reachable from a route and is a
 * perfectly good shortcut to take, but a *lap* that climbs a ramp and dives
 * back down is a lap where half the checkpoints are twelve metres over your
 * head, and "am I past that checkpoint" stops having an answer.
 */
export function routesFor(city: City): CityRoute[] {
  const graph = surfaceGraph(city);
  if (graph.nodes.length === 0) return [];

  const routes: CityRoute[] = [];
  const centre = {
    x: (city.bounds.minX + city.bounds.maxX) / 2,
    z: (city.bounds.minZ + city.bounds.maxZ) / 2,
  };

  // Candidate centres on three rings around the middle of the map, so the six
  // events land in six quarters rather than six times downtown. Three rings
  // and not one because a single ring of the right radius only holds about
  // three circuits at the spacing they need, and most candidates are rejected
  // anyway - by the water, by a lap that came out too long, or by being too
  // close to one already placed.
  for (const reach of [ROUTE_RADIUS * 2.2, ROUTE_RADIUS * 3.2, ROUTE_RADIUS * 4.2]) {
    for (let i = 0; i < 16 && routes.length < ROUTE_COUNT; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const at = {
        x: centre.x + Math.sin(angle) * reach,
        z: centre.z + Math.cos(angle) * reach,
      };
      const route = circuitAround(city, graph, at, routes.length);
      if (!route) continue;
      // Judged on where the start line actually came out, not on where the
      // candidate centre was: the start is the nearest junction to a corner of
      // the box, which can be a long way from the centre it was measured from.
      const start = route.start;
      if (routes.some((r) => Math.hypot(r.start.x - start.x, r.start.z - start.z) < ROUTE_SPACING)) {
        continue;
      }
      routes.push(route);
    }
  }
  return routes;
}

/** The road graph, restricted to what a lap can be run on. */
interface Graph {
  /** Node ids that are at street level and joined to something. */
  nodes: number[];
  /** Node id to its neighbours and the cost of getting there. */
  edges: Map<number, { to: number; cost: number }[]>;
}

function surfaceGraph(city: City): Graph {
  const edges = new Map<number, { to: number; cost: number }[]>();
  const add = (from: number, to: number, cost: number) => {
    const list = edges.get(from);
    if (list) list.push({ to, cost });
    else edges.set(from, [{ to, cost }]);
  };

  for (const road of city.roads) {
    if (road.class === 'interstate' || road.class === 'ramp') continue;
    if (city.nodes[road.a].y !== 0 || city.nodes[road.b].y !== 0) continue;
    add(road.a, road.b, road.length);
    add(road.b, road.a, road.length);
  }
  return { nodes: [...edges.keys()], edges };
}

/** Build one lap around `at`, or null if the streets there will not make one. */
function circuitAround(city: City, graph: Graph, at: Vec2, id: number): CityRoute | null {
  // Four corners on a box around the centre. A loop through four points that
  // are actually apart is a lap; a loop through four points that are nearly
  // the same junction is a car park.
  const corners: number[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const node = nearestNode(city, graph, {
      x: at.x + Math.sin(angle) * ROUTE_RADIUS,
      z: at.z + Math.cos(angle) * ROUTE_RADIUS,
    });
    if (node === null || corners.includes(node)) return null;
    corners.push(node);
  }

  const points: Vec2[] = [];
  for (let i = 0; i < corners.length; i++) {
    // Bounded by how far apart the two corners are. Unbounded, every leg
    // explores the whole city before it stops, and six routes cost a third of
    // a second of page load for nothing.
    const from = city.nodes[corners[i]].pos;
    const to = city.nodes[corners[(i + 1) % corners.length]].pos;
    const reach = Math.hypot(to.x - from.x, to.z - from.z) * 3 + ROUTE_RADIUS;
    const leg = shortestPath(graph, corners[i], corners[(i + 1) % corners.length], reach);
    if (!leg) return null;
    // Drop the first node of every leg but the first: it is the last node of
    // the leg before it, and a duplicated point is a zero-length segment.
    for (const node of i === 0 ? leg : leg.slice(1)) points.push(city.nodes[node].pos);
  }
  if (points.length < 8) return null;

  const length = lengthOf(points);
  // Too short and it is a car park; too long and it is a commute. The water
  // makes both happen: a loop that has to go round the bay is enormous.
  if (length < ROUTE_MIN_LENGTH || length > ROUTE_MAX_LENGTH) return null;

  return {
    id,
    name: NAMES[id % NAMES.length],
    points,
    checkpoints: checkpointsAlong(points, length),
    start: points[0],
    length,
    laps: ROUTE_LAPS,
  };
}

/**
 * Names for the circuits.
 *
 * Original, and named for what the loop runs past rather than for anywhere
 * real: a route is easier to remember as a place than as "circuit 4".
 */
const NAMES = [
  'Harbour Loop',
  'Foundry Mile',
  'Crosstown Circuit',
  'Bayside Run',
  'Ironworks Loop',
  'Old Quarter',
];

function nearestNode(city: City, graph: Graph, to: Vec2): number | null {
  let best: number | null = null;
  let bestGap = Infinity;
  for (const id of graph.nodes) {
    const pos = city.nodes[id].pos;
    const gap = Math.hypot(pos.x - to.x, pos.z - to.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = id;
    }
  }
  return best;
}

/**
 * Dijkstra from `from` to `to`, over road lengths.
 *
 * A plain array scan for the next node rather than a heap. This runs six times
 * four legs once, at generation time, on a graph of a couple of thousand
 * nodes; a priority queue here would be code nobody needs to read.
 */
function shortestPath(graph: Graph, from: number, to: number, reach: number): number[] | null {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const open = new Set<number>([from]);
  const done = new Set<number>();

  while (open.size > 0) {
    let at = -1;
    let best = Infinity;
    for (const node of open) {
      const d = dist.get(node) ?? Infinity;
      if (d < best) {
        best = d;
        at = node;
      }
    }
    if (at === -1) break;
    open.delete(at);
    done.add(at);
    if (at === to) break;

    for (const edge of graph.edges.get(at) ?? []) {
      if (done.has(edge.to)) continue;
      const through = best + edge.cost;
      if (through > reach) continue;
      if (through >= (dist.get(edge.to) ?? Infinity)) continue;
      dist.set(edge.to, through);
      prev.set(edge.to, at);
      open.add(edge.to);
    }
  }

  if (!done.has(to)) return null;
  const path = [to];
  let walk = to;
  while (walk !== from) {
    const back = prev.get(walk);
    if (back === undefined) return null;
    path.unshift(back);
    walk = back;
  }
  return path;
}

function lengthOf(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/**
 * Checkpoints every `CHECKPOINT_SPACING` along the lap, ending at the start.
 *
 * Spaced by distance rather than laid on every junction: a downtown lap has a
 * junction every eighty metres, and a checkpoint every eighty metres is a lap
 * spent driving between gates rather than driving.
 */
function checkpointsAlong(points: Vec2[], length: number): Vec2[] {
  const checkpoints: Vec2[] = [];
  const count = Math.max(4, Math.round(length / CHECKPOINT_SPACING));
  for (let i = 1; i <= count; i++) {
    checkpoints.push(pointAt(points, length, (length * i) / count));
  }
  return checkpoints;
}

/** The point `along` world units into the loop, wrapping at the end. */
export function pointAt(points: Vec2[], length: number, along: number): Vec2 {
  let left = ((along % length) + length) % length;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= span || i === points.length - 1) {
      const t = span < 1e-6 ? 0 : left / span;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    left -= span;
  }
  return points[0];
}
