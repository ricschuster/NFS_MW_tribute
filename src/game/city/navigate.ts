import type { City, Vec2 } from './types';

/**
 * A way there, over the roads that exist (#90).
 *
 * The Quick Wheel's "go to" drops a marker and an arrow, and an arrow across a
 * five-by-four kilometre city with a river through it points at a lot of
 * places you cannot get to from here. This is the line to follow.
 *
 * Deliberately *not* `routes.ts`'s pathfinder, which is restricted to the
 * surface because a lap whose checkpoints are twelve metres over your head has
 * no answer to "am I past that one". A player crossing the city should be sent
 * up the freeway if the freeway is quicker, so this graph has the interstate
 * and the ramps in it. Node identity includes height (#85), so the ramps are
 * the only join between the levels and a path cannot teleport onto a deck.
 *
 * Built once per city and cached: it is two thousand nodes and nobody wants it
 * rebuilt every time somebody opens the wheel.
 */
interface Graph {
  edges: Map<number, { to: number; cost: number }[]>;
  nodes: number[];
}

const graphs = new WeakMap<City, Graph>();

function driveGraph(city: City): Graph {
  const hit = graphs.get(city);
  if (hit) return hit;

  const edges = new Map<number, { to: number; cost: number }[]>();
  const add = (from: number, to: number, cost: number) => {
    const list = edges.get(from);
    if (list) list.push({ to, cost });
    else edges.set(from, [{ to, cost }]);
  };

  for (const road of city.roads) {
    // Weighted by what the road is for, not only by how long it is: a route
    // that saves fifty metres by threading six junctions is not the way
    // anybody would tell you to go.
    const pace = Math.max(1, road.speed);
    const cost = road.length / pace;
    add(road.a, road.b, cost);
    add(road.b, road.a, cost);
  }

  const graph = { edges, nodes: [...edges.keys()] };
  graphs.set(city, graph);
  return graph;
}

/** The junction nearest a point, at any height. */
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
 * The way from one point to another, as a line to draw.
 *
 * Dijkstra with a plain array scan for the next node, like `routes.ts`: this
 * runs when a destination is chosen and when the driver strays off the line,
 * not per frame, and a heap here would be code nobody needs to read.
 *
 * Returns an empty array when there is no way - which can happen, because the
 * river severs the city and a marker on the far bank of an unbridged stretch
 * is genuinely unreachable.
 */
export function routeTo(city: City, from: Vec2, to: Vec2): Vec2[] {
  const graph = driveGraph(city);
  const start = nearestNode(city, graph, from);
  const finish = nearestNode(city, graph, to);
  if (start === null || finish === null || start === finish) return [];

  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const open = new Set<number>([start]);
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
    if (at === finish) break;

    for (const edge of graph.edges.get(at) ?? []) {
      if (done.has(edge.to)) continue;
      const through = best + edge.cost;
      if (through >= (dist.get(edge.to) ?? Infinity)) continue;
      dist.set(edge.to, through);
      prev.set(edge.to, at);
      open.add(edge.to);
    }
  }

  if (!done.has(finish)) return [];

  const path: Vec2[] = [];
  let walk: number | undefined = finish;
  while (walk !== undefined) {
    path.push(city.nodes[walk].pos);
    walk = prev.get(walk);
  }
  return path.reverse();
}

/** How far a point is from the nearest leg of a route, for "am I still on it". */
export function offRoute(path: Vec2[], at: Vec2): number {
  if (path.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = Math.max(1, dx * dx + dz * dz);
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(at.x - (a.x + dx * t), at.z - (a.z + dz * t)));
  }
  return best;
}
