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
  TUNNEL_COUNT,
  TUNNEL_SPACING,
  TUNNEL_TRIES,
  GRADE_RUN,
  FREEWAY_SPURS,
  FREEWAY_SPUR_MIN,
} from '../constants';
import type { Rng } from './rng';
import { nearWater, type Water } from './water';
import { groundAt, type Terrain } from './terrain';
import type { CityNode, CityRoad, NodeLevel, Rect, Vec2 } from './types';

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
 *
 * **The loop is authored, not computed** (#261). It used to be four sides
 * inset from the land's own bounding rectangle - a ring around the middle of
 * the city, which is why every ramp landed downtown and the freeway read as a
 * faster way round the same blocks rather than as a journey out and back.
 * `path` is a closed polyline instead: however many points, in order, walked
 * edge to edge and closed from the last point back to the first. Everything
 * below reasons about "distance travelled around the loop" and "which edge is
 * that on", which is exactly as true of four authored bends as of forty - the
 * rectangle was never load-bearing, only convenient. `draftLoop` below
 * reproduces that rectangle as a four-point path, which is what `generate.ts`
 * passes until a hand-routed one replaces it.
 */
export function addInterstate(
  rng: Rng,
  bounds: Rect,
  nodes: CityNode[],
  roads: CityRoad[],
  water: Water,
  terrain: Terrain,
  path: Vec2[],
): void {
  const edges = buildEdges(path);
  const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);
  const profile = heightProfile(
    rng,
    perimeter,
    (along) => point(...whereAlong(edges, along)),
    water,
    terrain,
  );

  // Surface nodes a ramp could land on, indexed so the search per edge is not
  // a scan of the whole city.
  const surface = nodes.filter((node) => node.level === 'surface' && node.roads.length >= 3);

  let travelled = 0;
  let previous: CityNode | null = null;
  let first: CityNode | null = null;
  // Every node the loop is made of, so a spur can leave from one of them
  // rather than from a new node that merely shares its position - which is a
  // spur floating unattached above the city.
  const built: { node: CityNode; edge: Edge }[] = [];

  for (const edge of edges) {
    const ramps = rampsFor(rng, edge, surface, water);
    const stations = stationsAlong(edge, ramps);

    for (const station of stations) {
      const along = travelled + station.at;
      const node = make(nodes, point(edge, station.at), profile(along));

      if (previous) link(roads, nodes, previous, node, 'interstate');
      else first = node;
      previous = node;
      built.push({ node, edge });

      // A ramp only makes sense where the deck is actually above the street.
      if (station.ramp && node.level === 'elevated') {
        link(roads, nodes, node, footFor(nodes, roads, node, station.ramp), 'ramp');
      }
    }

    travelled += edge.length;
  }

  // Close the circuit.
  if (previous && first) link(roads, nodes, previous, first, 'interstate');

  addSpurs(rng, bounds, path, built, nodes, roads, water);
}

/**
 * A placeholder loop until the real one is authored (#261): today's inset
 * rectangle, kept on the land, as four corners rather than four sides. It is
 * not the shape the issue wants - it still reads as a ring around the middle
 * of the city rather than a journey out through the hills and back - but it
 * keeps `addInterstate` exercised and its tests green while the real route is
 * drawn by hand and synced in, the same way the surface roads were.
 */
export function draftLoop(bounds: Rect, water: Water): Vec2[] {
  const on = landBounds(bounds, water);
  const width = on.maxX - on.minX;
  const depth = on.maxZ - on.minZ;
  const west = on.minX + width * INTERSTATE_INSET;
  const east = on.maxX - width * INTERSTATE_INSET;
  const south = on.minZ + depth * INTERSTATE_INSET;
  const north = on.maxZ - depth * INTERSTATE_INSET;
  return [
    { x: west, z: south },
    { x: east, z: south },
    { x: east, z: north },
    { x: west, z: north },
  ];
}

/**
 * Freeway spurs off the loop.
 *
 * A circuit on its own means every long fast line in the city is the same
 * line, and that you can only ever go round. Spurs give the network ends as
 * well as a middle: somewhere to be chased towards, and a reason to pick a
 * direction when you join.
 *
 * A spur leaves an edge of the loop at right angles and runs to the map edge,
 * elevated the whole way, which keeps it clear of the streets it crosses for
 * the same reason the loop is. "At right angles" used to mean whichever axis
 * the side it left from ran on; an authored loop has no axis, so outward is
 * whichever of the edge's two perpendiculars points away from the loop's own
 * centroid.
 */
function addSpurs(
  rng: Rng,
  bounds: Rect,
  path: Vec2[],
  stations: { node: CityNode; edge: Edge }[],
  nodes: CityNode[],
  roads: CityRoad[],
  water: Water,
): void {
  if (path.length === 0) return;
  const centroid = { x: 0, z: 0 };
  for (const p of path) {
    centroid.x += p.x;
    centroid.z += p.z;
  }
  centroid.x /= path.length;
  centroid.z /= path.length;

  const outwardFor = (edge: Edge): Vec2 => {
    const perp = { x: -edge.uz, z: edge.ux };
    const mid = { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2 };
    const towardMid = (mid.x - centroid.x) * perp.x + (mid.z - centroid.z) * perp.z;
    return towardMid >= 0 ? perp : { x: -perp.x, z: -perp.z };
  };

  // Only stations up on the deck - leaving from inside the tunnel is not a junction.
  const candidates = stations.filter(({ node }) => node.level === 'elevated');

  const chosen: CityNode[] = [];
  for (let attempt = 0; attempt < 60 && chosen.length < FREEWAY_SPURS; attempt++) {
    const pick = candidates[rng.int(candidates.length)];
    if (!pick) break;
    // Keep them apart, or three spurs leave from the same corner.
    const crowded = chosen.some(
      (other) => Math.hypot(other.pos.x - pick.node.pos.x, other.pos.z - pick.node.pos.z) < FREEWAY_SPUR_MIN,
    );
    if (crowded) continue;

    const { node, edge } = pick;
    const outward = outwardFor(edge);
    // As far as the land goes, not as far as the map does. A spur is a freeway
    // out of town and it should end at the coast, not two kilometres past it
    // over open water (ADR-0008 made the map bigger than the island).
    const toEdge = rayToBounds(node.pos, outward, bounds);
    if (toEdge < FREEWAY_SPUR_MIN) continue;

    let run = 0;
    for (let d = 0; d <= toEdge; d += INTERSTATE_SEGMENT / 2) {
      if (!water.isWater(node.pos.x + outward.x * d, node.pos.z + outward.z * d)) run = d;
    }
    // The deck itself can be over water (a viaduct is fine at height), and a
    // station right at the water's edge can find no dry ground outward at
    // all - `run` comes back 0. Building a spur anyway made two nodes on top
    // of each other, `link`'s own `length < 1` guard silently declined to
    // join them, and both sat in the network with no road at all: unreachable,
    // never picked up by anything, only visible as a connectivity count that
    // did not match the node count.
    if (run < INTERSTATE_SEGMENT) continue;

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

/** How far from `pos`, heading along `dir`, before the map's own rectangle is reached. */
function rayToBounds(pos: Vec2, dir: Vec2, bounds: Rect): number {
  let t = Infinity;
  if (dir.x > 1e-9) t = Math.min(t, (bounds.maxX - pos.x) / dir.x);
  else if (dir.x < -1e-9) t = Math.min(t, (bounds.minX - pos.x) / dir.x);
  if (dir.z > 1e-9) t = Math.min(t, (bounds.maxZ - pos.z) / dir.z);
  else if (dir.z < -1e-9) t = Math.min(t, (bounds.minZ - pos.z) / dir.z);
  return t;
}

/** One edge of the authored loop: two consecutive points, and its own direction. */
interface Edge {
  a: Vec2;
  b: Vec2;
  length: number;
  /** Unit vector from `a` to `b`. */
  ux: number;
  uz: number;
}

/** A point on the loop, and the surface node a ramp there would descend to. */
interface Station {
  at: number;
  ramp: CityNode | null;
}

/** The loop's edges, `path[i]` to `path[i + 1]`, closed from the last point to the first. */
function buildEdges(path: Vec2[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.max(1, Math.hypot(dx, dz));
    edges.push({ a, b, length, ux: dx / length, uz: dz / length });
  }
  return edges;
}

const point = (edge: Edge, at: number): Vec2 => ({ x: edge.a.x + edge.ux * at, z: edge.a.z + edge.uz * at });

/**
 * The box the land actually occupies, which is not the box the map does.
 *
 * Sampled rather than derived from the coastline, because the coast is loops
 * and this wants one rectangle - and because a stray islet should not stretch
 * the box out to reach it, which is why a row or column has to have a decent
 * run of land in it before it counts.
 */
function landBounds(bounds: Rect, water: Water): Rect {
  const step = (bounds.maxX - bounds.minX) / 120;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let x = bounds.minX; x <= bounds.maxX; x += step) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
      if (water.isWater(x, z)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (minX > maxX) return bounds;
  return { minX, maxX, minZ, maxZ };
}

/**
 * Which edge of the loop a distance around it lands on, and where along that
 * edge. The height profile is a function of one number and the water is a
 * function of a position, so something has to turn the first into the second.
 */
function whereAlong(edges: Edge[], along: number): [Edge, number] {
  const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);
  // Wrapped, because a tunnel near the end of the circuit has its far mouth
  // round the corner past the start.
  let left = ((along % perimeter) + perimeter) % perimeter;
  for (const edge of edges) {
    if (left <= edge.length) return [edge, left];
    left -= edge.length;
  }
  const last = edges[edges.length - 1];
  return [last, last.length];
}

/**
 * Height as a function of distance around the circuit: elevated nearly all
 * the way, with `TUNNEL_COUNT` stretches that dive into a tunnel instead of
 * one long one (#261 - a loop that actually goes through hills crosses low
 * ground more than once). The transitions take a fixed run so the grade
 * stays something a car can climb.
 *
 * Each zone is checked shifted by a whole perimeter either way, because a
 * zone near the seam - chosen close to 0 or close to `perimeter` - has a
 * transition that lands on the *other* side of the wrap, and `along` here is
 * one uninterrupted walk from 0 to `perimeter` rather than a wrapped angle.
 */
function heightProfile(
  rng: Rng,
  perimeter: number,
  at: (along: number) => Vec2,
  water: Water,
  terrain: Terrain,
): (along: number) => number {
  const tunnels = pickTunnels(rng, perimeter, at, water, terrain);

  return (along: number) => {
    let height = INTERSTATE_HEIGHT;
    for (const { start, end } of tunnels) {
      for (const shift of [-perimeter, 0, perimeter]) {
        const here = along + shift;
        const into = Math.min(here - start, end - here);
        if (into >= 0) return -TUNNEL_DEPTH;
        if (into > -GRADE_RUN) {
          const t = (into + GRADE_RUN) / GRADE_RUN;
          const eased = (1 - Math.cos(t * Math.PI)) / 2;
          height = Math.min(height, INTERSTATE_HEIGHT + (-TUNNEL_DEPTH - INTERSTATE_HEIGHT) * eased);
        }
      }
    }
    return height;
  };
}

/**
 * Where `TUNNEL_COUNT` tunnels start: the highest ground the loop crosses,
 * among candidates whose *mouths* are on land, kept `TUNNEL_SPACING` apart
 * from each other.
 *
 * A tunnel is a hill offered a choice - climb it or dive under it - and a
 * candidate picked at random honours neither: it is as likely to dive under
 * flat ground as under a real summit. Every dry candidate this rolls is
 * scored by the ground under its middle third and the highest wins, so a
 * tunnel lands where a car would otherwise be climbing, not wherever the
 * dice said.
 *
 * The deck at 12 m over the bay is a viaduct and the tunnel at -9 m under the
 * river is a tunnel; both are fine. The transition between them is neither -
 * it passes through street level, and over water that is a freeway driving
 * into the sea, which is what it was doing (#244).
 *
 * Rolled and checked rather than solved, because "is this over water" is a
 * sampled question either way. If the map leaves nowhere clean - a loop whose
 * every quarter meets the bay - the driest roll wins, so this can only improve
 * a city and never fail to build one. The same is true of the count: a short
 * loop that cannot fit `TUNNEL_COUNT` tunnels `TUNNEL_SPACING` apart gets
 * fewer, not a broken one.
 */
function pickTunnels(
  rng: Rng,
  perimeter: number,
  at: (along: number) => Vec2,
  water: Water,
  terrain: Terrain,
): { start: number; end: number }[] {
  const tunnels: { start: number; end: number }[] = [];

  // The ground under the middle third of a candidate, which is the part
  // actually under a hill rather than easing down into or up out of one.
  const elevationOf = (start: number, end: number) => {
    let sum = 0;
    const samples = 3;
    for (let i = 0; i <= samples; i++) {
      const t = 1 / 3 + ((1 / 3) * i) / samples;
      const p = at(start + (end - start) * t);
      sum += groundAt(terrain, p.x, p.z);
    }
    return sum / (samples + 1);
  };

  for (let n = 0; n < TUNNEL_COUNT; n++) {
    let best: { start: number; end: number } | null = null;
    let bestWet = Infinity;
    let bestElevation = -Infinity;
    for (let attempt = 0; attempt < TUNNEL_TRIES; attempt++) {
      const start = rng.range(0.05, 0.95) * perimeter;
      const end = start + TUNNEL_LENGTH;

      // Clear of every tunnel already placed, wrapping either way round the
      // loop - two tunnels a stone's throw apart at the seam are one tunnel
      // with a gap in it, not two.
      // Padded-interval overlap: too close if [start, end] widened by the
      // spacing on both sides reaches into a tunnel already placed.
      const tooClose = tunnels.some(
        (t) => start < t.end + TUNNEL_SPACING && end + TUNNEL_SPACING > t.start,
      );
      if (tooClose) continue;

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

      if (wet === 0) {
        // Once any dry candidate is found, only a higher dry one replaces
        // it - never fall back to a wetter candidate for more elevation.
        const elevation = elevationOf(start, end);
        if (bestWet > 0 || elevation > bestElevation) {
          bestWet = 0;
          bestElevation = elevation;
          best = { start, end };
        }
      } else if (bestWet > 0 && wet < bestWet) {
        bestWet = wet;
        best = { start, end };
      }
    }
    if (best) tunnels.push(best);
  }
  return tunnels;
}

/**
 * Pick where this edge's ramps come down.
 *
 * A ramp descends *along* a surface street's alignment, which lands it on a
 * junction that already exists. That means the choice is really "which
 * surface junction", and the ramp is then the line from the deck above it to
 * the street. "Across" and "along" are the edge's own direction now rather
 * than a map axis, which is what an authored, freely-angled loop needs.
 */
function rampsFor(
  rng: Rng,
  edge: Edge,
  surface: CityNode[],
  water: Water,
): { at: number; node: CityNode }[] {
  const reachable: { node: CityNode; along: number }[] = [];
  for (const node of surface) {
    const dx = node.pos.x - edge.a.x;
    const dz = node.pos.z - edge.a.z;
    const along = dx * edge.ux + dz * edge.uz;
    const across = Math.abs(dx * -edge.uz + dz * edge.ux);
    if (across < RAMP_MIN_RUN || across > RAMP_MAX_RUN) continue;
    if (along <= GRADE_RUN || along >= edge.length - GRADE_RUN) continue;
    // And the descent itself has to be over land (#244). A ramp is only a few
    // metres up for most of its run, so one crossing the river is a road going
    // into the water rather than a viaduct over it - and it is rejected here,
    // among the other reasons a junction cannot take a ramp, so the edge picks
    // a different junction instead of losing the ramp.
    if (!dryRun(water, point(edge, along), node.pos)) continue;
    reachable.push({ node, along });
  }
  if (reachable.length === 0) return [];

  // Spread them out: an edge's ramps clustered together are one ramp.
  const spacing = edge.length / (RAMP_COUNT_PER_SIDE + 1);
  const chosen: { at: number; node: CityNode }[] = [];
  for (let i = 1; i <= RAMP_COUNT_PER_SIDE; i++) {
    const want = spacing * i + rng.range(-0.15, 0.15) * spacing;
    let best: { node: CityNode; along: number } | null = null;
    for (const candidate of reachable) {
      if (chosen.some((c) => c.node === candidate.node)) continue;
      if (!best || Math.abs(candidate.along - want) < Math.abs(best.along - want)) best = candidate;
    }
    if (best) chosen.push({ at: best.along, node: best.node });
  }
  return chosen;
}

/**
 * The points along one edge that get a node: every ramp, plus enough in
 * between that the deck follows its height profile as a slope rather than as
 * a staircase.
 */
function stationsAlong(edge: Edge, ramps: { at: number; node: CityNode }[]): Station[] {
  const steps = Math.max(1, Math.round(edge.length / INTERSTATE_SEGMENT));

  const points = new Map<number, CityNode | null>();
  for (let i = 0; i <= steps; i++) points.set((edge.length * i) / steps, null);
  for (const ramp of ramps) points.set(ramp.at, ramp.node);

  const ordered = [...points.entries()].sort((a, b) => a[0] - b[0]);
  // The far end is the next edge's first station, so drop it to avoid a doubled node.
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
  //
  // At the junction's own height, not zero (#261 found this against real
  // terrain). Zero was every surface node's height before ADR-0007 gave the
  // network real elevation, so it was never wrong to hardcode; a junction up a
  // hillside now sits well above the map's zero, and a foot pinned there turned
  // RAMP_OFFSET - a lateral step meant to put the foot beside the street rather
  // than on top of it - into a cliff the mouth had to climb in fourteen metres.
  // The whole descent belongs on the climb (`deck` to `foot`, tens to hundreds
  // of metres per `RAMP_MIN_RUN`/`RAMP_MAX_RUN`); the mouth stays flat because
  // both its ends are the ground already is.
  const foot = make(
    nodes,
    {
      x: junction.pos.x - (dz / length) * RAMP_OFFSET,
      z: junction.pos.z + (dx / length) * RAMP_OFFSET,
    },
    junction.y,
    // Explicitly surface: it stands at the junction's own height, which on a
    // hillside is not zero, and `make`'s sign-of-`y` guess would call that
    // elevated - the one thing this point specifically is not.
    'surface',
  );
  link(roads, nodes, foot, junction, 'ramp');
  return foot;
}

function make(nodes: CityNode[], at: { x: number; z: number }, y: number, level?: NodeLevel): CityNode {
  // Derived from the height when not given explicitly, because on flat ground
  // they are the same question and this has to stay a no-op (#250). Once the
  // ground itself has real height, `y > 0` stops meaning "on the deck" - a
  // hillside surface point is above zero too - so anything that is not the
  // loop or a tunnel passes its own level rather than trusting the sign.
  const lvl: NodeLevel = level ?? (y > 0 ? 'elevated' : y < 0 ? 'tunnel' : 'surface');
  const node: CityNode = { id: nodes.length, pos: { x: at.x, z: at.z }, y, level: lvl, roads: [] };
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
