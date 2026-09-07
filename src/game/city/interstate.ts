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
  RAMP_OFFSET,
  RAMP_SPEED,
  TUNNEL_DEPTH,
  TUNNEL_LENGTH,
  TUNNEL_TRIES,
  GRADE_RUN,
  FREEWAY_SPURS,
  FREEWAY_SPUR_MIN,
} from '../constants';
import type { Rng } from './rng';
import { nearWater, type Water } from './water';
import type { Axis, CityNode, CityRoad, NodeLevel, Rect, Vec2 } from './types';


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
 *
 * The water is passed in because this runs *after* the network has been cut
 * against it and is therefore the one pass that could put a road in the bay
 * without anything noticing (#244). Being over water is fine at 12 m and fine
 * at -9 m; what is not fine is the stretch in between, so the two places the
 * deck comes down to street level - a ramp, and a tunnel mouth - are the two
 * places that ask.
 */
export function addInterstate(
  rng: Rng,
  bounds: Rect,
  nodes: CityNode[],
  roads: CityRoad[],
  water: Water,
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
  const profile = heightProfile(
    rng,
    perimeter,
    (along) => point(...whereAlong(sides, along)),
    water,
  );

  // Surface nodes a ramp could land on, indexed so the search per side is not
  // a scan of the whole city.
  const surface = nodes.filter((node) => node.level === 'surface' && node.roads.length >= 3);

  let travelled = 0;
  let previous: CityNode | null = null;
  let first: CityNode | null = null;
  // Every node the loop is made of, so a spur can leave from one of them
  // rather than from a new node that merely shares its position - which is a
  // spur floating unattached above the city.
  const built: { node: CityNode; side: Side }[] = [];

  for (const side of sides) {
    const ramps = rampsFor(rng, side, surface, water);
    const stations = stationsAlong(side, ramps);

    for (const station of stations) {
      const along = travelled + Math.abs(station.at - side.from);
      const node = make(nodes, point(side, station.at), profile(along));

      if (previous) link(roads, nodes, previous, node, 'interstate');
      else first = node;
      previous = node;
      built.push({ node, side });

      // A ramp only makes sense where the deck is actually above the street.
      if (station.ramp && node.level === 'elevated') {
        link(roads, nodes, node, footFor(nodes, roads, node, station.ramp), 'ramp');
      }
    }

    travelled += Math.abs(side.to - side.from);
  }

  // Close the circuit.
  if (previous && first) link(roads, nodes, previous, first, 'interstate');

  addSpurs(rng, bounds, built, nodes, roads);
}

/**
 * Freeway spurs off the loop.
 *
 * A circuit on its own means every long fast line in the city is the same
 * line, and that you can only ever go round. Spurs give the network ends as
 * well as a middle: somewhere to be chased towards, and a reason to pick a
 * direction when you join.
 *
 * A spur leaves a side of the loop at right angles and runs to the map edge,
 * elevated the whole way, which keeps it clear of the streets it crosses for
 * the same reason the loop is.
 */
function addSpurs(
  rng: Rng,
  bounds: Rect,
  stations: { node: CityNode; side: Side }[],
  nodes: CityNode[],
  roads: CityRoad[],
): void {
  const middleX = (bounds.minX + bounds.maxX) / 2;
  const middleZ = (bounds.minZ + bounds.maxZ) / 2;

  // Only stations up on the deck, and only ones with room to run to an edge.
  const candidates = stations.filter(({ node, side }) => {
    if (node.level !== 'elevated') return false; // leaving from inside the tunnel is not a junction
    const run =
      side.axis === 'x'
        ? Math.abs((side.at > middleZ ? bounds.maxZ : bounds.minZ) - node.pos.z)
        : Math.abs((side.at > middleX ? bounds.maxX : bounds.minX) - node.pos.x);
    return run >= FREEWAY_SPUR_MIN;
  });

  const chosen: CityNode[] = [];
  for (let attempt = 0; attempt < 60 && chosen.length < FREEWAY_SPURS; attempt++) {
    const pick = candidates[rng.int(candidates.length)];
    if (!pick) break;
    // Keep them apart, or three spurs leave from the same corner.
    const crowded = chosen.some(
      (other) => Math.hypot(other.pos.x - pick.node.pos.x, other.pos.z - pick.node.pos.z) < FREEWAY_SPUR_MIN,
    );
    if (crowded) continue;

    const { node, side } = pick;
    const outward =
      side.axis === 'x'
        ? { x: 0, z: side.at > middleZ ? 1 : -1 }
        : { x: side.at > middleX ? 1 : -1, z: 0 };
    const run =
      outward.x !== 0
        ? Math.abs((outward.x > 0 ? bounds.maxX : bounds.minX) - node.pos.x)
        : Math.abs((outward.z > 0 ? bounds.maxZ : bounds.minZ) - node.pos.z);

    // Elevated the whole way out, for the same reason the loop is: it crosses
    // every street on the way and joins none of them.
    const steps = Math.max(2, Math.round(run / INTERSTATE_SEGMENT));
    let previous = node;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = make(
        nodes,
        { x: node.pos.x + outward.x * run * t, z: node.pos.z + outward.z * run * t },
        node.y,
      );
      link(roads, nodes, previous, next, 'interstate');
      previous = next;
    }
    chosen.push(node);
  }
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
 * Which side of the loop a distance around it lands on, and where along that
 * side. The height profile is a function of one number and the water is a
 * function of a position, so something has to turn the first into the second.
 */
function whereAlong(sides: Side[], along: number): [Side, number] {
  const perimeter = sides.reduce((sum, side) => sum + Math.abs(side.to - side.from), 0);
  // Wrapped, because a tunnel near the end of the circuit has its far mouth
  // round the corner past the start.
  let left = ((along % perimeter) + perimeter) % perimeter;
  for (const side of sides) {
    const span = Math.abs(side.to - side.from);
    if (left <= span) return [side, side.from + Math.sign(side.to - side.from) * left];
    left -= span;
  }
  const last = sides[sides.length - 1];
  return [last, last.to];
}

/**
 * Height as a function of distance around the circuit: elevated nearly all the
 * way, with one stretch that dives into a tunnel instead. The transitions take
 * a fixed run so the grade stays something a car can climb.
 */
function heightProfile(
  rng: Rng,
  perimeter: number,
  at: (along: number) => Vec2,
  water: Water,
): (along: number) => number {
  const start = tunnelStart(rng, perimeter, at, water);
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
 * Where the tunnel starts: anywhere on the loop whose *mouths* are on land.
 *
 * The deck at 12 m over the bay is a viaduct and the tunnel at -9 m under the
 * river is a tunnel; both are fine. The transition between them is neither -
 * it passes through street level, and over water that is a freeway driving
 * into the sea, which is what it was doing (#244).
 *
 * Rolled and checked rather than solved, because "is this over water" is a
 * sampled question either way. If the map leaves nowhere clean - a loop whose
 * every quarter meets the bay - the driest roll wins, so this can only improve
 * a city and never fail to build one.
 */
function tunnelStart(rng: Rng, perimeter: number, at: (along: number) => Vec2, water: Water): number {
  let best = 0;
  let bestWet = Infinity;
  for (let attempt = 0; attempt < TUNNEL_TRIES; attempt++) {
    const start = rng.range(0.05, 0.85) * perimeter;
    const end = start + TUNNEL_LENGTH * perimeter;
    let wet = 0;
    // Both grade runs: down into the tunnel, and back up out of it.
    for (const from of [start - GRADE_RUN, end]) {
      const steps = Math.max(2, Math.round(GRADE_RUN / INTERSTATE_SEGMENT));
      for (let i = 0; i <= steps; i++) {
        const p = at(from + (GRADE_RUN * i) / steps);
        // A margin, because a mouth on the very edge of the bank is a mouth
        // with the water lapping at it.
        if (nearWater(water, p.x, p.z, RAMP_OFFSET)) wet++;
      }
    }
    if (wet === 0) return start;
    if (wet < bestWet) {
      bestWet = wet;
      best = start;
    }
  }
  return best;
}

/**
 * Pick where this side's ramps come down.
 *
 * A ramp descends *along* a surface street's alignment, which keeps it
 * axis-aligned like everything else and lands it on a junction that already
 * exists. That means the choice is really "which surface junction", and the
 * ramp is then the line from the deck above it to the street.
 */
function rampsFor(
  rng: Rng,
  side: Side,
  surface: CityNode[],
  water: Water,
): { at: number; node: CityNode }[] {
  const across = (node: CityNode) => (side.axis === 'x' ? node.pos.z : node.pos.x);
  const along = (node: CityNode) => (side.axis === 'x' ? node.pos.x : node.pos.z);

  const lo = Math.min(side.from, side.to);
  const hi = Math.max(side.from, side.to);

  const reachable = surface.filter((node) => {
    const run = Math.abs(across(node) - side.at);
    const at = along(node);
    if (run < RAMP_MIN_RUN || run > RAMP_MAX_RUN) return false;
    if (at <= lo + GRADE_RUN || at >= hi - GRADE_RUN) return false;
    // And the descent itself has to be over land (#244). A ramp is only a few
    // metres up for most of its run, so one crossing the river is a road going
    // into the water rather than a viaduct over it - and it is rejected here,
    // among the other reasons a junction cannot take a ramp, so the side picks
    // a different junction instead of losing the ramp.
    return dryRun(water, point(side, at), node.pos);
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

/**
 * Is the line between these two clear of the water for its whole length?
 *
 * Sampled at the same interval the deck is built from, with a margin the width
 * of the offset between a ramp's two carriageways so that neither of them ends
 * up over the bank.
 */
function dryRun(water: Water, from: Vec2, to: Vec2): boolean {
  const run = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(2, Math.round(run / INTERSTATE_SEGMENT));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    if (nearWater(water, x, z, RAMP_OFFSET)) return false;
  }
  return true;
}

/**
 * Where a ramp actually comes down: beside the junction it serves, not on it.
 *
 * A ramp laid straight at its junction runs down the street on that line for
 * its whole length, and the car can then never get onto it - the street beneath
 * is flat, the ramp is rising, and `surfaceAt` takes whichever is nearest the
 * height the car is at, so the flat one wins on every step (#212). Setting the
 * foot aside by `RAMP_OFFSET` puts the two carriageways side by side instead of
 * on top of each other.
 *
 * The offset is *across* the ramp's own line, so the foot lands beside the
 * street rather than further along it, and a short spur joins it back to the
 * junction so the thing is still reachable. That spur is a ramp too, which
 * keeps it out of `routes.ts`'s surface graph - a lap should no more be routed
 * up an on-ramp mouth than up the ramp itself.
 */
function footFor(
  nodes: CityNode[],
  roads: CityRoad[],
  deck: CityNode,
  junction: CityNode,
): CityNode {
  const dx = junction.pos.x - deck.pos.x;
  const dz = junction.pos.z - deck.pos.z;
  const length = Math.hypot(dx, dz);
  if (length < 1) return junction;

  // Across the descent, either side. Which side is decided by where the deck
  // is, so the foot is always on the inside of the turn off the street.
  const foot = make(
    nodes,
    {
      x: junction.pos.x - (dz / length) * RAMP_OFFSET,
      z: junction.pos.z + (dx / length) * RAMP_OFFSET,
    },
    0,
  );
  link(roads, nodes, foot, junction, 'ramp');
  return foot;
}

function make(nodes: CityNode[], at: { x: number; z: number }, y: number): CityNode {
  // Derived from the height, because on flat ground they are the same question
  // and this has to stay a no-op (#250). When the ground stops being flat, this
  // is the line that stops being a derivation.
  const level: NodeLevel = y > 0 ? 'elevated' : y < 0 ? 'tunnel' : 'surface';
  const node: CityNode = { id: nodes.length, pos: { x: at.x, z: at.z }, y, level, roads: [] };
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
  // Keep the convention the rest of the graph uses: `a` is the lower end along
  // whichever axis this piece mostly runs.
  const forward = Math.abs(dx) >= Math.abs(dz) ? dx >= 0 : dz >= 0;
  const from = forward ? a : b;
  const to = forward ? b : a;

  const road: CityRoad = {
    id: roads.length,
    a: from.id,
    b: to.id,
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
