import { UNITS_PER_METRE } from '../constants';
import { PAVEMENT } from './highstreet';
import { distanceToSegment } from './grid';
import { PLAN_DISTRICTS, inArea } from './plan';
import type { Apron, AuthoredProp, CityNode, CityRoad, Vec2 } from './types';

const M = UNITS_PER_METRE;
/** City hall's and the gallery's squares (#268): this deep in front of them, and this share of their width. */
const SQUARE_DEPTH = 34;
const SQUARE_SHARE = 0.8;
/** The front of each, from its centre, and its width: the outlines the drafter kept open (`city/downtown.ts`). */
/**
 * How far into another carriageway a strip may reach before it is trimmed.
 * Slightly negative rather than a margin, so two strips of one street meet at
 * the joint between its segments, where each one's kerb is exactly the other
 * one's width away, instead of both stopping a couple of metres short of it.
 */
const KERB_SLACK = 0.05 * M;
/** A run shorter than this is a scrap, not a pavement. */
const MIN_STRIP = 2 * M;
/**
 * The inside of a bend gentler than this is left to the strips, which very
 * nearly meet there; the parallelogram would be a long sliver over them. The
 * outside of one is filled down to `SLIGHT`, since a fan is exact and cheap and
 * the gap it fills opens with the building line, not the kerb.
 */
const GENTLE = (15 * Math.PI) / 180;
const SLIGHT = (2 * Math.PI) / 180;
/** The outside of a bend is filled in pieces no wider than this, so a chord never cuts into the carriageway. */
const FAN = (30 * Math.PI) / 180;
/** A corner reaching further than this from its junction is not a corner. */
const CORNER_REACH = 30 * M;
const FRONTS: Record<string, { front: number; width: number }> = {
  'city-hall': { front: 22.5, width: 77 },
  gallery: { front: 25.5, width: 74 },
};

/**
 * Downtown's pavements (#268): a strip of paving from the kerb to the
 * building line, `PAVEMENT` wide, down both sides of every surface road in
 * downtown, and the squares in front of city hall and the gallery. A
 * downtown with grass up to its shopfronts reads as a suburb that grew
 * tall; paving is what says the street belongs to the town.
 *
 * Strips rather than one outline per street, because they are drawn as a
 * mesh over the ground (`scene/drives.ts`) and paid for by the vertex, not
 * in the ground's shader by the fragment, which a thousand aprons would make
 * too slow to render (#293's lesson with the drives). Each strip and square is
 * laid only where it is clear of every carriageway but its own, measured a
 * metre at a time and its ends found to a few centimetres, so paving is never
 * laid over another road - at a junction, on the inside of a bend, or where a
 * street crosses a square. The corners that leaves are filled by `corners`.
 */
export function downtownPavements(roads: readonly CityRoad[], nodes: readonly CityNode[], props: readonly AuthoredProp[]): Apron[] {
  const area = PLAN_DISTRICTS.find((a) => a.kind === 'downtown');
  if (!area) return [];
  const out: Apron[] = [];
  const surface = (r: CityRoad) => r.class !== 'interstate' && r.class !== 'ramp' && !r.bridge && nodes[r.a].level === 'surface' && nodes[r.b].level === 'surface';
  // Every surface road, for the trimming: a strip or a square is laid only
  // where it is clear of every carriageway but the one it runs along.
  const carriageways = roads.filter(surface).map((r) => ({ r, a: nodes[r.a].pos, b: nodes[r.b].pos }));
  const lay = (from: Vec2, to: Vec2, across: Vec2, inner: number, outer: number, own: CityRoad | null, look: Apron['look'], firstOnly = false) => {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const along = { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
    const pad = Math.max(Math.abs(inner), Math.abs(outer)) + 20 * M;
    const near = carriageways.filter(
      ({ r, a, b }) =>
        r !== own &&
        Math.max(a.x, b.x) > Math.min(from.x, to.x) - pad && Math.min(a.x, b.x) < Math.max(from.x, to.x) + pad &&
        Math.max(a.z, b.z) > Math.min(from.z, to.z) - pad && Math.min(a.z, b.z) < Math.max(from.z, to.z) + pad,
    );
    const clear = (t: number) => {
      for (let k = 0; k <= 4; k++) {
        const d = inner + ((outer - inner) * k) / 4;
        const x = from.x + along.x * t + across.x * d, z = from.z + along.z * t + across.z * d;
        if (near.some(({ r, a, b }) => distanceToSegment(x, z, a.x, a.z, b.x, b.z) < r.width / 2 - KERB_SLACK)) return false;
      }
      return true;
    };
    const step = 1 * M;
    // Where a run starts or stops, found to a few centimetres rather than to
    // the metre it is sampled at: a strip that stops a metre short of the
    // street it meets leaves a metre of grass the corner never reaches.
    const edge = (blocked: number, open: number) => {
      for (let i = 0; i < 5; i++) {
        const mid = (blocked + open) / 2;
        if (clear(mid)) open = mid;
        else blocked = mid;
      }
      return open;
    };
    let runFrom: number | null = null;
    const emit = (t0: number, t1: number) => {
      if (t1 - t0 < MIN_STRIP) return;
      const p = (t: number, d: number) => ({ x: from.x + along.x * t + across.x * d, z: from.z + along.z * t + across.z * d });
      // Four corners, in the order `scene/drives.ts` drapes them: one long
      // edge, then the other end to end.
      out.push({ outline: [p(t0, inner), p(t1, inner), p(t1, outer), p(t0, outer)], margin: 0, look, yard: false });
    };
    for (let t = 0; t <= length + 1e-6; t += step) {
      const ok = clear(Math.min(t, length));
      if (ok && runFrom === null) runFrom = t === 0 ? 0 : edge(t - step, Math.min(t, length));
      if (!ok && firstOnly && runFrom === null) return;
      if (!ok && runFrom !== null) {
        emit(runFrom, edge(Math.min(t, length), t - step));
        if (firstOnly) return;
        runFrom = null;
      }
    }
    if (runFrom !== null) emit(runFrom, length);
  };

  for (const road of roads) {
    if (!surface(road)) continue;
    const a = nodes[road.a].pos, b = nodes[road.b].pos;
    if (!inArea(area.poly, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 2 * M) continue;
    const across = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
    for (const side of [1, -1]) {
      const n = { x: across.x * side, z: across.z * side };
      lay(a, b, n, road.width / 2, road.width / 2 + PAVEMENT * M, road, 'concrete');
    }
  }
  out.push(...corners(roads.filter(surface), nodes, area.poly, carriageways));
  // The squares.
  for (const prop of props) {
    const front = FRONTS[prop.kind];
    if (!front) continue;
    const f = { x: Math.sin(prop.angle), z: Math.cos(prop.angle) };
    const s = { x: Math.cos(prop.angle), z: -Math.sin(prop.angle) };
    const half = ((front.width * SQUARE_SHARE) / 2) * M;
    const at = (v: number) => ({ x: (prop.x + f.x * v) * M, z: (prop.z + f.z * v) * M });
    // From its steps out to the first road it reaches, and no further: a
    // square cut in two by a street is two scraps, not a square.
    lay(at(front.front), at(front.front + SQUARE_DEPTH), s, -half, half, null, 'cobbles', true);
  }
  return out;
}

/**
 * The corners the strips leave (#268). Each strip is trimmed where it meets
 * another street's carriageway, so at a junction the two pavements that turn
 * the corner stop at each other's kerbs and the square between them, where a
 * real block's kerb would turn, is left as grass; the same happens on the
 * inside of a bend, and on the outside one the strips fan apart.
 *
 * So at every node, between each pair of streets next to each other round
 * it, one more four-cornered piece in the same mesh as the strips: on the
 * inside of the angle, the parallelogram where the two pavement bands cross -
 * kerb to building line from both streets at once, which by construction is
 * on neither carriageway - and on the outside, a fan from one strip's end to
 * the other's round the junction. Each is kept only if it is clear of every
 * other carriageway, the way a strip is.
 */
function corners(
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  area: Vec2[],
  carriageways: readonly { r: CityRoad; a: Vec2; b: Vec2 }[],
): Apron[] {
  const out: Apron[] = [];
  const at = new Map<number, CityRoad[]>();
  for (const r of roads) for (const n of [r.a, r.b]) at.set(n, [...(at.get(n) ?? []), r]);
  for (const [n, here] of at) {
    if (here.length < 2) continue;
    const o = nodes[n].pos;
    if (!inArea(area, o)) continue;
    // Each street leaving the node: its heading, and its kerb and building line.
    const legs = here
      .map((r) => {
        const far = nodes[r.a === n ? r.b : r.a].pos;
        const length = Math.hypot(far.x - o.x, far.z - o.z);
        return { r, d: { x: (far.x - o.x) / length, z: (far.z - o.z) / length }, kerb: r.width / 2, line: r.width / 2 + PAVEMENT * M, length };
      })
      .filter((l) => l.length > 0.5 * M)
      .map((l) => ({ ...l, angle: Math.atan2(l.d.z, l.d.x) }))
      .sort((p, q) => p.angle - q.angle);
    if (legs.length < 2) continue;
    const others = (mine: CityRoad[]) => {
      const pad = CORNER_REACH + 20 * M;
      return carriageways.filter(
        ({ r, a, b }) =>
          !mine.includes(r) &&
          Math.max(a.x, b.x) > o.x - pad && Math.min(a.x, b.x) < o.x + pad && Math.max(a.z, b.z) > o.z - pad && Math.min(a.z, b.z) < o.z + pad,
      );
    };
    const fits = (outline: Vec2[], mine: CityRoad[]) => {
      const near = others(mine);
      const middle = { x: outline.reduce((s, p) => s + p.x, 0) / 4, z: outline.reduce((s, p) => s + p.z, 0) / 4 };
      return [...outline, middle].every(
        (p) => Math.hypot(p.x - o.x, p.z - o.z) < CORNER_REACH && !near.some(({ r, a, b }) => distanceToSegment(p.x, p.z, a.x, a.z, b.x, b.z) < r.width / 2 - KERB_SLACK),
      );
    };
    for (let k = 0; k < legs.length; k++) {
      // From one leg anticlockwise round to the next: the angle between them.
      const i = legs[k], j = legs[(k + 1) % legs.length];
      let sweep = j.angle - i.angle;
      if (sweep <= 0) sweep += 2 * Math.PI;
      // The normals of each leg pointing into the angle between them.
      const ni = { x: -i.d.z, z: i.d.x };
      const nj = { x: j.d.z, z: -j.d.x };
      let piece: Vec2[][] = [];
      if (sweep < Math.PI - GENTLE) {
        // Where i's line at offset u meets j's line at offset v.
        const cross = (u: number, v: number): Vec2 | null => {
          const px = o.x + ni.x * u, pz = o.z + ni.z * u;
          const qx = o.x + nj.x * v, qz = o.z + nj.z * v;
          const det = i.d.x * -j.d.z - i.d.z * -j.d.x;
          if (Math.abs(det) < 1e-6) return null;
          const s = ((qx - px) * -j.d.z - (qz - pz) * -j.d.x) / det;
          return { x: px + i.d.x * s, z: pz + i.d.z * s };
        };
        const quad = [cross(i.kerb, j.kerb), cross(i.kerb, j.line), cross(i.line, j.line), cross(i.line, j.kerb)];
        // Only where it lies along both streets: on a gentle bend the bands
        // cross so far out that the parallelogram runs off the end of a short
        // segment, past where the street has already turned again.
        const along = (p: Vec2, l: typeof i) => (p.x - o.x) * l.d.x + (p.z - o.z) * l.d.z;
        if (quad.every((p): p is Vec2 => p !== null) && quad.every((p) => along(p, i) <= i.length && along(p, j) <= j.length)) piece = [quad];
      } else if (sweep > Math.PI + SLIGHT) {
        // The outside: a fan round the node from i's end to j's, in pieces
        // narrow enough that the inner chord stays off the carriageway.
        const open = sweep - Math.PI;
        const parts = Math.ceil(open / FAN);
        const a0 = Math.atan2(ni.z, ni.x);
        for (let p = 0; p < parts; p++) {
          const s0 = p / parts, s1 = (p + 1) / parts;
          const ray = (s: number, outer: boolean) => {
            // Anticlockwise from i's normal round the outside to j's.
            const angle = a0 + open * s;
            const reach = outer ? i.line + (j.line - i.line) * s : i.kerb + (j.kerb - i.kerb) * s;
            return { x: o.x + Math.cos(angle) * reach, z: o.z + Math.sin(angle) * reach };
          };
          piece.push([ray(s0, false), ray(s1, false), ray(s1, true), ray(s0, true)]);
        }
      }
      for (const outline of piece) if (fits(outline, [i.r, j.r])) out.push({ outline, margin: 0, look: 'concrete', yard: false });
    }
  }
  return out;
}
