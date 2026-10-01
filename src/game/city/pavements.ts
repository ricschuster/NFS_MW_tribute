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
 * metre at a time, so paving is never laid over another road - at a junction,
 * on the inside of a bend, or where a street crosses a square.
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
        if (near.some(({ r, a, b }) => distanceToSegment(x, z, a.x, a.z, b.x, b.z) < r.width / 2 + 0.3 * M)) return false;
      }
      return true;
    };
    const step = 1 * M;
    let runFrom: number | null = null;
    const emit = (t0: number, t1: number) => {
      if (t1 - t0 < 2 * M) return;
      const p = (t: number, d: number) => ({ x: from.x + along.x * t + across.x * d, z: from.z + along.z * t + across.z * d });
      // Four corners, in the order `scene/drives.ts` drapes them: one long
      // edge, then the other end to end.
      out.push({ outline: [p(t0, inner), p(t1, inner), p(t1, outer), p(t0, outer)], margin: 0, look, yard: false });
    };
    for (let t = 0; t <= length + 1e-6; t += step) {
      const ok = clear(Math.min(t, length));
      if (ok && runFrom === null) runFrom = t;
      if (!ok && firstOnly && runFrom === null) return;
      if (!ok && runFrom !== null) {
        emit(runFrom, t - step);
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
