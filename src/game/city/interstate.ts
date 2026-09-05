import {
  INTERSTATE_INSET,
  INTERSTATE_HEIGHT,
  INTERSTATE_LANES,
  INTERSTATE_SPEED,
  INTERSTATE_SEGMENT,
  CITY_LANE_WIDTH,
  RAMP_COUNT_PER_SIDE,
  RAMP_MIN_RUN,
  RAMP_MAX_RUN,
  RAMP_LANES,
  RAMP_SPEED,
  TUNNEL_DEPTH,
  TUNNEL_LENGTH,
  GRADE_RUN,
} from '../constants';
import type { Rng } from './rng';
import type { Axis, CityNode, CityRoad, Rect } from './types';

/**
 * The elevated interstate (#85).
 *
 * This is the feature ADR-0004 was written for. A projected ribbon and a
 * ground plane can each hold one surface per map position, so neither can
 * express a road crossing over another road. Here that is just two nodes with
 * different `y` that were never joined - and because they were never joined,
 * driving under an overpass is not the same as driving on it, for routing and
 * for collision alike.
 *
 * The route is a **circuit**, not a through road, and it runs on its own
 * alignment rather than above an arterial. Both are deliberate: a loop means
 * joining it is a commitment, and its own alignment means it crosses the
 * surface grid instead of shadowing it, so the overpasses are everywhere
 * rather than nowhere.
 *
 * Tunnels are the same mechanism with the sign flipped. One stretch of the
 * loop dives below the streets instead of climbing over them, which needs no
 * new concept at all - only a negative `y`.
 */
export function addInterstate(
  rng: Rng,
  bounds: Rect,
  nodes: CityNode[],
  roads: CityRoad[],
): void {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const west = bounds.minX + width * INTERSTATE_INSET;
  const east = bounds.maxX - width * INTERSTATE_INSET;
  const south = bounds.minZ + depth * INTERSTATE_INSET;
  const north = bounds.maxZ - depth * INTERSTATE_INSET;

  // The loop, as four sides walked in order. Each carries the distance already
  // travelled around the circuit, so the height profile is a function of one
  // number rather than of which side you are on.
  const sides: Side[] = [
    { axis: 'x', at: south, from: west, to: east },
    { axis: 'z', at: east, from: south, to: north },
    { axis: 'x', at: north, from: east, to: west },
    { axis: 'z', at: west, from: north, to: south },
  ];

  const perimeter = sides.reduce((sum, side) => sum + Math.abs(side.to - side.from), 0);
  const profile = heightProfile(rng, perimeter);

  // Surface nodes a ramp could land on, indexed so the search per side is not
  // a scan of the whole city.
  const surface = nodes.filter((node) => node.y === 0 && node.roads.length >= 3);

  let travelled = 0;
  let previous: CityNode | null = null;
  let first: CityNode | null = null;

  for (const side of sides) {
    const ramps = rampsFor(rng, side, surface);
    const stations = stationsAlong(side, ramps);

    for (const station of stations) {
      const along = travelled + Math.abs(station.at - side.from);
      const node = make(nodes, point(side, station.at), profile(along));

      if (previous) link(roads, nodes, previous, node, 'interstate');
      else first = node;
      previous = node;

      // A ramp only makes sense where the deck is actually above the street.
      if (station.ramp && node.y > 0) {
        link(roads, nodes, node, station.ramp, 'ramp');
      }
    }

    travelled += Math.abs(side.to - side.from);
  }

  // Close the circuit.
  if (previous && first) link(roads, nodes, previous, first, 'interstate');
}

interface Side {
  axis: Axis;
  /** The fixed coordinate: z for a side running along x, x for one along z. */
  at: number;
  from: number;
  to: number;
}

/** A point on the loop, and the surface node a ramp there would descend to. */
interface Station {
  at: number;
  ramp: CityNode | null;
}

const point = (side: Side, at: number) =>
  side.axis === 'x' ? { x: at, z: side.at } : { x: side.at, z: at };

/**
 * Height as a function of distance around the circuit: elevated nearly all the
 * way, with one stretch that dives into a tunnel instead. The transitions take
 * a fixed run so the grade stays something a car can climb.
 */
function heightProfile(rng: Rng, perimeter: number): (along: number) => number {
  const start = rng.range(0.05, 0.85) * perimeter;
  const end = start + TUNNEL_LENGTH * perimeter;

  return (along: number) => {
    // How far into the tunnel stretch, in run-length units either side.
    const into = Math.min(along - start, end - along);
    if (into <= -GRADE_RUN) return INTERSTATE_HEIGHT;
    if (into >= 0) return -TUNNEL_DEPTH;
    // Ease across the transition rather than kinking from one level to the other.
    const t = (into + GRADE_RUN) / GRADE_RUN;
    const eased = (1 - Math.cos(t * Math.PI)) / 2;
    return INTERSTATE_HEIGHT + (-TUNNEL_DEPTH - INTERSTATE_HEIGHT) * eased;
  };
}

/**
 * Pick where this side's ramps come down.
 *
 * A ramp descends *along* a surface street's alignment, which keeps it
 * axis-aligned like everything else and lands it on a junction that already
 * exists. That means the choice is really "which surface junction", and the
 * ramp is then the line from the deck above it to the street.
 */
function rampsFor(rng: Rng, side: Side, surface: CityNode[]): { at: number; node: CityNode }[] {
  const across = (node: CityNode) => (side.axis === 'x' ? node.pos.z : node.pos.x);
  const along = (node: CityNode) => (side.axis === 'x' ? node.pos.x : node.pos.z);

  const lo = Math.min(side.from, side.to);
  const hi = Math.max(side.from, side.to);

  const reachable = surface.filter((node) => {
    const run = Math.abs(across(node) - side.at);
    const at = along(node);
    return run >= RAMP_MIN_RUN && run <= RAMP_MAX_RUN && at > lo + GRADE_RUN && at < hi - GRADE_RUN;
  });
  if (reachable.length === 0) return [];

  // Spread them out: a side's ramps clustered together are one ramp.
  const spacing = Math.abs(hi - lo) / (RAMP_COUNT_PER_SIDE + 1);
  const chosen: { at: number; node: CityNode }[] = [];
  for (let i = 1; i <= RAMP_COUNT_PER_SIDE; i++) {
    const want = lo + spacing * i + rng.range(-0.15, 0.15) * spacing;
    let best: CityNode | null = null;
    for (const node of reachable) {
      if (chosen.some((c) => c.node === node)) continue;
      if (!best || Math.abs(along(node) - want) < Math.abs(along(best) - want)) best = node;
    }
    if (best) chosen.push({ at: along(best), node: best });
  }
  return chosen;
}

/**
 * The points along one side that get a node: every ramp, plus enough in
 * between that the deck follows its height profile as a slope rather than as
 * a staircase.
 */
function stationsAlong(side: Side, ramps: { at: number; node: CityNode }[]): Station[] {
  const forward = side.to > side.from;
  const span = Math.abs(side.to - side.from);
  const steps = Math.max(1, Math.round(span / INTERSTATE_SEGMENT));

  const points = new Map<number, CityNode | null>();
  for (let i = 0; i <= steps; i++) {
    const at = side.from + (forward ? 1 : -1) * (span * i) / steps;
    points.set(at, null);
  }
  for (const ramp of ramps) points.set(ramp.at, ramp.node);

  const ordered = [...points.entries()].sort((a, b) => (forward ? a[0] - b[0] : b[0] - a[0]));
  // The far end is the next side's first station, so drop it to avoid a doubled node.
  return ordered.slice(0, -1).map(([at, ramp]) => ({ at, ramp }));
}

function make(nodes: CityNode[], at: { x: number; z: number }, y: number): CityNode {
  const node: CityNode = { id: nodes.length, pos: { x: at.x, z: at.z }, y, roads: [] };
  nodes.push(node);
  return node;
}

function link(
  roads: CityRoad[],
  nodes: CityNode[],
  a: CityNode,
  b: CityNode,
  kind: 'interstate' | 'ramp',
): void {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const length = Math.hypot(dx, dz);
  if (length < 1) return;

  const lanes = kind === 'interstate' ? INTERSTATE_LANES : RAMP_LANES;
  // `a` is the lower end along the axis, as everywhere else in the graph.
  const axis: Axis = Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z';
  const forward = axis === 'x' ? dx >= 0 : dz >= 0;
  const from = forward ? a : b;
  const to = forward ? b : a;

  const road: CityRoad = {
    id: roads.length,
    a: from.id,
    b: to.id,
    axis,
    class: kind,
    district: 'midtown',
    lanes,
    width: lanes * CITY_LANE_WIDTH,
    speed: kind === 'interstate' ? INTERSTATE_SPEED : RAMP_SPEED,
    length,
    bridge: false,
  };
  roads.push(road);
  nodes[from.id].roads.push(road.id);
  nodes[to.id].roads.push(road.id);
}
