/**
 * The pieces of ground the roads enclose (#268).
 *
 * A city block is not a rectangle on a grid. It is whatever shape the roads
 * around it leave behind, and it has as many sides as it has roads. Kestrel Bay
 * has been built the other way round since it was first generated - lay a grid,
 * call the cells blocks - and that is what makes a downtown read as planned
 * rather than grown, because it *was* planned, by a ruler.
 *
 * This is the other direction: given the road network, find the faces of it.
 * Everything a city puts on the ground follows from them - local streets are a
 * subdivision of a face, blocks are what the subdivision leaves, buildings stand
 * on blocks - so this is the foundation rather than a feature.
 *
 * **How.** The road network is a planar graph, and the faces of a planar graph
 * are found by walking half-edges: leave a node along an edge, arrive at the
 * next, and always take the next edge *clockwise* from the one you came in on.
 * Do that from every half-edge and each cycle you close is a face. The one that
 * comes back with the wrong winding is the outside of the map rather than a
 * block, which is the only special case.
 *
 * Two things make this less tidy than the textbook version and both are about
 * real road networks rather than nice graphs:
 *
 * - **A dead end is walked down and back.** Its two half-edges are both in the
 *   same face, which is correct - a cul-de-sac does not enclose anything - and
 *   it means a face can touch itself. The area test is what discards the
 *   degenerate ones.
 * - **Only the surface network.** A bridge deck and the road under it are two
 *   different places (#85), and treating them as crossing lines in a plane would
 *   invent a block out of the gap between them.
 */
import { FACE_MIN_AREA, FACE_SPLIT_JITTER } from '../constants';
import type { City, CityRoad, Vec2 } from './types';

/** A piece of ground with roads all the way round it. */
export interface Face {
  /** Anticlockwise in world terms, closed implicitly: the last joins the first. */
  poly: Vec2[];
  /** In square world units. */
  area: number;
  /** The nodes it was walked through, in the same order as `poly`. */
  nodes: number[];
}

const key = (from: number, to: number) => from * 1_000_003 + to;

/**
 * Every face of the surface road network, largest first.
 *
 * The outer face - the sea and everything beyond the roads - is dropped, and so
 * is anything too small to be ground rather than a rounding error.
 */
export function facesOf(city: City): Face[] {
  const usable = (road: CityRoad) =>
    city.nodes[road.a].level === 'surface' && city.nodes[road.b].level === 'surface' && !road.bridge;

  // Neighbours of each node, sorted by the angle of the edge leaving it. The
  // sort is what makes "the next edge clockwise" a lookup rather than a search.
  const around = new Map<number, { to: number; angle: number }[]>();
  const add = (from: number, to: number) => {
    const a = city.nodes[from].pos;
    const b = city.nodes[to].pos;
    const list = around.get(from);
    const entry = { to, angle: Math.atan2(b.z - a.z, b.x - a.x) };
    if (list) list.push(entry);
    else around.set(from, [entry]);
  };
  for (const road of city.roads) {
    if (!usable(road)) continue;
    if (road.a === road.b) continue;
    add(road.a, road.b);
    add(road.b, road.a);
  }
  for (const list of around.values()) list.sort((p, q) => p.angle - q.angle);

  // Where each half-edge sits in its target's fan, so the walk is O(1) a step.
  const rank = new Map<number, number>();
  for (const [from, list] of around) {
    list.forEach((edge, i) => rank.set(key(from, edge.to), i));
  }

  const walked = new Set<number>();
  const faces: Face[] = [];

  for (const [start, list] of around) {
    for (const first of list) {
      if (walked.has(key(start, first.to))) continue;

      const nodes: number[] = [];
      let from = start;
      let to = first.to;
      // A face cannot have more corners than the graph has half-edges; the
      // bound is a guard against a malformed graph rather than an expectation.
      for (let step = 0; step < around.size * 4; step++) {
        if (walked.has(key(from, to))) break;
        walked.add(key(from, to));
        nodes.push(from);

        // Arrive at `to` along `from -> to`; leave along the edge one place
        // clockwise from the way back. Sorted anticlockwise by `atan2`, that is
        // the previous entry in the fan.
        const fan = around.get(to);
        if (!fan) break;
        const back = rank.get(key(to, from));
        if (back === undefined) break;
        const next = fan[(back - 1 + fan.length) % fan.length];
        from = to;
        to = next.to;
        if (from === start && to === first.to) break;
      }

      if (nodes.length < 3) continue;
      const poly = nodes.map((id) => city.nodes[id].pos);
      const area = signedArea(poly);
      // The outer face is the one wound the other way: it is the same walk seen
      // from outside, and it is the only face that contains everything else.
      if (area <= 0) continue;
      if (area < FACE_MIN_AREA) continue;
      faces.push({ poly, area, nodes });
    }
  }

  return faces.sort((a, b) => b.area - a.area);
}

/** Twice the signed area, positive for an anticlockwise ring in x/z. */
function signedArea(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += (poly[j].x - poly[i].x) * (poly[j].z + poly[i].z);
  }
  return sum / 2;
}

/** The middle of a face, by area rather than by corner count. */
export function faceCentre(face: Face): Vec2 {
  let x = 0;
  let z = 0;
  let weight = 0;
  const poly = face.poly;
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[0];
    const b = poly[i];
    const c = poly[i + 1];
    const w = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    x += ((a.x + b.x + c.x) / 3) * w;
    z += ((a.z + b.z + c.z) / 3) * w;
    weight += w;
  }
  if (weight === 0) return poly[0];
  return { x: x / weight, z: z / weight };
}

/** Is this point inside the face? Ray cast, counting crossings. */
export function inFace(face: Face, at: Vec2): boolean {
  let hit = false;
  const poly = face.poly;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > at.z !== b.z > at.z && at.x < ((b.x - a.x) * (at.z - a.z)) / (b.z - a.z) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

/**
 * Cut a face down into blocks, and hand back the streets that did the cutting.
 *
 * A face straight off the road network is a quarter, not a block: the largest
 * on the map is 1.5 km². What turns one into a city is being divided, and the
 * division is what local streets *are* - so this returns both halves of that,
 * the pieces and the lines between them.
 *
 * Split across the **long** axis every time, through the middle. That single
 * rule is most of why the result reads as grown rather than planned: the cut is
 * chosen by the shape of the ground being cut, so a long thin quarter gets a
 * street down its length and a square one gets a cross, and neither is on a
 * grid because the face was never square to begin with. The jitter is small on
 * purpose - it stops the splits stacking into a perfect binary tree, and any
 * more than that reads as noise rather than as a street.
 *
 * Recursive, stopping at `target`: a block is a piece too small to be worth
 * another street through it.
 */
export function subdivide(
  face: Face,
  target: number,
  rng: { range(min: number, max: number): number },
  depth = 0,
): { blocks: Vec2[][]; streets: [Vec2, Vec2][] } {
  const poly = face.poly;
  const area = Math.abs(signedArea(poly));
  // Deep enough that a pathological face cannot recurse forever, which a
  // self-touching one - a face walked down a cul-de-sac and back - can.
  if (area <= target || depth > 12 || poly.length < 3) {
    return { blocks: [poly], streets: [] };
  }

  // The long axis, by the spread of the corners about the middle. A bounding
  // box would answer a different question on anything not square to the world,
  // which most faces are not.
  const centre = faceCentre({ ...face, poly, area });
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const p of poly) {
    const dx = p.x - centre.x;
    const dz = p.z - centre.z;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  // The principal axis of that spread: the direction the face is longest in.
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz) + rng.range(-FACE_SPLIT_JITTER, FACE_SPLIT_JITTER);
  // Cut *across* the long axis, so the normal of the cutting line is the long
  // axis itself. Adding a right angle here - which looks like "cut across" and
  // is the obvious thing to write - splits a 4000 x 500 face down its length
  // into two 4000 x 250 slivers instead of into two 2000 x 500 blocks.
  const nx = Math.cos(angle);
  const nz = Math.sin(angle);
  const at = nx * centre.x + nz * centre.z;

  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const cuts: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = nx * a.x + nz * a.z - at;
    const db = nx * b.x + nz * b.z - at;
    if (da >= 0) left.push(a);
    if (da <= 0) right.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      const hit = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      left.push(hit);
      right.push(hit);
      cuts.push(hit);
    }
  }
  // A cut that did not separate anything: the face is degenerate, or the line
  // clipped a corner. Either way it is a block now.
  if (left.length < 3 || right.length < 3 || cuts.length < 2) {
    return { blocks: [poly], streets: [] };
  }

  const half = (points: Vec2[]): Face => ({ poly: points, area: Math.abs(signedArea(points)), nodes: [] });
  const a = subdivide(half(left), target, rng, depth + 1);
  const b = subdivide(half(right), target, rng, depth + 1);
  // The street is the cut itself, from the first crossing to the last: a face
  // is convex often enough that two is the usual answer, and where it is not,
  // the outermost pair spans the others.
  const ends: [Vec2, Vec2] = [cuts[0], cuts[cuts.length - 1]];
  return {
    blocks: [...a.blocks, ...b.blocks],
    streets: [ends, ...a.streets, ...b.streets],
  };
}
