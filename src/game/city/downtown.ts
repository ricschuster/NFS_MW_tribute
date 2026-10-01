import { UNITS_PER_METRE } from '../constants';
import { distanceToSegment } from './grid';
import { cellRandom } from './highmoor';
import { PAVEMENT } from './highstreet';
import { PLAN_DISTRICTS, inArea } from './plan';
import { HOUSE_GROWN, TOWER, hitsSetPiece } from './setpieces';
import { onTheStreet, runsOf } from './suburb';
import { groundAt, type Terrain } from './terrain';
import type { AuthoredProp, CityNode, CityRoad, Pillar, SetPiece, SetPieceKind, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * Downtown's buildings (#268), drafted once for the area editor - the owner's
 * answers on the issue, in order of what goes down first:
 *
 *   1. The landmarks, each at the nearest spot to a target that it fits on,
 *      turned to face the road nearest it: the lookout tower (the tallest,
 *      the skyline steps down from it), the twisting tower, the château
 *      hotel, the library, the gallery and city hall with a square in front
 *      of each, the cathedral, the geodesic dome where the shore turns, and
 *      the stadium by the freeway if there is ground big enough for it.
 *   2. The flatiron, in the sharpest junction in the old core, its prow to
 *      the point.
 *   3. The cruise terminal, out over the bay from the shore, where open
 *      water runs on past its end.
 *   4. Every street's frontage, by how far it is from the water: the old
 *      core of terraced townhouses and shops within `CORE`, warehouse lofts on
 *      the quay lanes nearest the water; mid-rises between; and towers past
 *      `TOWERS`, and along the boulevards and the freeway wherever the core
 *      has given way - taller the nearer they stand to the lookout.
 *
 * A draft, as every area's buildings are (#477): `npm run housedraft --
 * --place downtown --houses` writes it into the props file, the area editor is
 * where it is changed, and `propsync` makes it the city. The numbers come
 * from each lot's own position, so a redraft changes only what a change of
 * street moved.
 */

const CORE = 200; // metres from the water: all old town inside this
const TOWERS = 420; // and towers past this
const QUAY = 110; // a warehouse loft is a quay building: this near the water
const FREEWAY_REACH = 140; // a frontage this near the freeway is a tower's
const ROAD_CLEAR = 2.5; // past a road's kerb, before a wall
const GAP = 0.4; // between two buildings in a terrace
const TOWER_GAP = 12;
const CORNER = 10; // no frontage this near a junction
const TOWER_SETBACK = 8; // a tower stands back behind a forecourt
const MAX_FALL = 2;
const SQUARE = 34; // the depth of the square in front of city hall and the gallery

/** A footprint in model metres: an outline in the piece's own frame, x across and z to the front. */
type Outline = Vec2[];
const rect = (w: number, l: number, v = 0): Outline => [
  { x: -w / 2, z: v - l / 2 },
  { x: w / 2, z: v - l / 2 },
  { x: w / 2, z: v + l / 2 },
  { x: -w / 2, z: v + l / 2 },
];
const ellipse = (a: number, b: number, n = 20): Outline =>
  Array.from({ length: n }, (_, k) => ({ x: Math.cos((k / n) * Math.PI * 2) * a, z: Math.sin((k / n) * Math.PI * 2) * b }));
const g = HOUSE_GROWN;

const OUTLINES: Partial<Record<SetPieceKind, Outline>> = {
  townhouse: rect(7 * g, 12 * g),
  shop: rect(8 * g, 12 * g),
  flat: rect(16 * g, 12 * g),
  loft: rect(22 * g, 16 * g),
  midrise: rect(20 * g, 15 * g),
  tower: rect(TOWER.w + 1, TOWER.l + 1),
  'lookout-tower': rect(33, 33),
  'twist-tower': rect(36, 36),
  'chateau-hotel': rect(46, 34),
  stadium: ellipse(118, 98),
  library: rect(80, 60),
  gallery: rect(74, 50, 0.5),
  cathedral: rect(26, 64),
  'city-hall': rect(77, 40, 2.5),
  'cruise-terminal': rect(57, 202),
  'geodesic-dome': ellipse(22, 22, 12),
  flatiron: [{ x: -13, z: -22 }, { x: 13, z: -22 }, { x: 3, z: 22 }, { x: -3, z: 22 }],
};

/**
 * Where each landmark is aimed, in world metres: the owner's picture of
 * downtown (#268) laid over its streets - towers inland of the boulevard
 * junction, the civic buildings between them and the old core, the dome on
 * the point where the south shore turns. The drafter takes the nearest spot
 * that fits, and the editor is where any of them moves.
 */
const LANDMARKS: { kind: SetPieceKind; at: Vec2; search?: number; square?: boolean }[] = [
  { kind: 'lookout-tower', at: { x: -520, z: -2060 } },
  { kind: 'twist-tower', at: { x: -880, z: -1980 } },
  { kind: 'chateau-hotel', at: { x: -330, z: -2020 } },
  { kind: 'library', at: { x: -260, z: -2260 } },
  { kind: 'gallery', at: { x: -640, z: -2250 }, square: true },
  { kind: 'city-hall', at: { x: -720, z: -1820 }, square: true },
  { kind: 'cathedral', at: { x: -150, z: -2120 } },
  { kind: 'geodesic-dome', at: { x: -60, z: -2700 } },
  { kind: 'stadium', at: { x: -150, z: -2450 }, search: 600 },
];
/** Where the cruise terminal comes ashore, roughly: the south shore below the old core. */
const TERMINAL_AT = { x: -950, z: -2615 };

/** A placed piece's outline in world metres. */
type Placed = { kind: SetPieceKind; poly: Vec2[] };

export function downtownBuildingsFor(
  terrain: Terrain,
  roads: readonly CityRoad[],
  nodes: readonly CityNode[],
  isWater: (x: number, z: number) => boolean,
  pieces: readonly SetPiece[],
  clear: readonly Vec2[],
  pillars: readonly Pillar[],
): { props: AuthoredProp[]; report: string[] } {
  const area = PLAN_DISTRICTS.find((a) => a.kind === 'downtown');
  if (!area) return { props: [], report: ['no downtown in the plan'] };
  const poly = area.poly.map((p) => ({ x: p.x / M, z: p.z / M }));
  const inDowntown = (p: Vec2) => inArea(area.poly, { x: p.x * M, z: p.z * M });
  const wet = (p: Vec2) => isWater(p.x * M, p.z * M);
  const ground = (p: Vec2) => groundAt(terrain, p.x * M, p.z * M) / M;
  const report: string[] = [];

  // Distance to the water on a 10 m grid over downtown, for the zones.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const C = 10, pad = 250;
  const x0 = minX - pad, z0 = minZ - pad;
  const W = Math.ceil((maxX - minX + 2 * pad) / C), H = Math.ceil((maxZ - minZ + 2 * pad) / C);
  const dist = new Float32Array(W * H).fill(Infinity);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (wet({ x: x0 + i * C, z: z0 + j * C })) dist[j * W + i] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) {
      const fwd = pass === 0;
      const j = fwd ? jj : H - 1 - jj, i = fwd ? ii : W - 1 - ii, s = fwd ? -1 : 1;
      let d = dist[j * W + i];
      const look = (a: number, b: number, w: number) => { if (a >= 0 && b >= 0 && a < W && b < H) d = Math.min(d, dist[b * W + a] + w); };
      look(i + s, j, C); look(i, j + s, C); look(i + s, j + s, C * Math.SQRT2); look(i - s, j + s, C * Math.SQRT2);
      dist[j * W + i] = d;
    }
  }
  const shore = (p: Vec2) => {
    const i = Math.round((p.x - x0) / C), j = Math.round((p.z - z0) / C);
    return i < 0 || j < 0 || i >= W || j >= H ? TOWERS : Math.min(dist[j * W + i], 2000);
  };

  // What a building keeps clear of: every road with a foot on the street,
  // and the freeway wherever it is above the street too, since a tower under
  // the deck would stand through it. Not the freeway in its tunnels.
  const segments = roads
    .filter((r) => onTheStreet(nodes, r) || (r.class === 'interstate' && nodes[r.a].level !== 'tunnel' && nodes[r.b].level !== 'tunnel'))
    .map((r) => ({ a: { x: nodes[r.a].pos.x / M, z: nodes[r.a].pos.z / M }, b: { x: nodes[r.b].pos.x / M, z: nodes[r.b].pos.z / M }, half: r.width / 2 / M, deck: r.class === 'interstate' }))
    .filter((s) => Math.max(s.a.x, s.b.x) > minX - 300 && Math.min(s.a.x, s.b.x) < maxX + 300 && Math.max(s.a.z, s.b.z) > minZ - 300 && Math.min(s.a.z, s.b.z) < maxZ + 300);
  const deck = segments.filter((s) => s.deck);
  const nearFreeway = (p: Vec2) => deck.some((s) => distanceToSegment(p.x, p.z, s.a.x, s.a.z, s.b.x, s.b.z) < FREEWAY_REACH);
  const piers = pillars.map((p) => ({ x: p.at.x / M, z: p.at.z / M }));

  const placed: Placed[] = [];
  const props: AuthoredProp[] = [];
  const toWorld = (outline: Outline, at: Vec2, angle: number) => {
    const f = { x: Math.sin(angle), z: Math.cos(angle) }, s = { x: Math.cos(angle), z: -Math.sin(angle) };
    return outline.map((p) => ({ x: at.x + s.x * p.x + f.x * p.z, z: at.z + s.z * p.x + f.z * p.z }));
  };

  /** Does `kind` fit at `at` turned to `angle`? `water` is what it may stand over. */
  const fits = (kind: SetPieceKind, at: Vec2, angle: number, opts: { water?: 'none' | 'over'; outside?: boolean; extra?: Outline } = {}) => {
    const outline = OUTLINES[kind];
    if (!outline) return null;
    const world = toWorld(outline, at, angle);
    const probes = probesOf(world, kind === 'stadium' || kind === 'cruise-terminal' ? 10 : 5);
    for (const p of probes) {
      if (opts.water !== 'over' && (wet(p) || (!opts.outside && !inDowntown(p)))) return null;
      for (const s of segments) if (distanceToSegment(p.x, p.z, s.a.x, s.a.z, s.b.x, s.b.z) < s.half + ROAD_CLEAR) return null;
      if (hitsSetPiece(pieces, p.x * M, p.z * M, -Infinity, 2 * M, Infinity)) return null;
    }
    if (piers.some((q) => insidePoly(world, q, 3))) return null;
    if (clear.some((c) => insidePoly(world, { x: c.x / M, z: c.z / M }, 6))) return null;
    const keep = opts.extra ? [world, toWorld(opts.extra, at, angle)] : [world];
    if (placed.some((q) => keep.some((k) => overlaps(k, q.poly)))) return null;
    if (opts.water !== 'over') {
      const heights = world.map(ground);
      if (Math.max(...heights) - Math.min(...heights) > (kind === 'stadium' ? 4 : MAX_FALL)) return null;
    }
    return keep;
  };
  const facingRoad = (p: Vec2) => {
    let best: { d: number; q: Vec2 } | null = null;
    for (const s of segments) {
      if (s.deck) continue;
      const q = nearestOn(p, s.a, s.b);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (!best || d < best.d) best = { d, q };
    }
    return best ? Math.atan2(best.q.x - p.x, best.q.z - p.z) : 0;
  };
  const put = (kind: SetPieceKind, at: Vec2, angle: number, keep: Vec2[][], variant?: string) => {
    for (const poly of keep) placed.push({ kind, poly });
    props.push({ kind, x: r1(at.x), z: r1(at.z), angle: r3(angle), ...(variant ? { variant } : {}) });
  };

  // 1. The landmarks.
  let peak: Vec2 | null = null;
  for (const mark of LANDMARKS) {
    const R = mark.search ?? 220;
    let done = false;
    for (const at of spiral(mark.at, R, mark.kind === 'stadium' ? 15 : 6)) {
      const angle = facingRoad(at);
      // A square in front: open ground the depth of `SQUARE`, as wide as the building.
      const outline = OUTLINES[mark.kind]!;
      const front = Math.max(...outline.map((p) => p.z));
      const width = Math.max(...outline.map((p) => p.x)) * 2;
      const extra = mark.square ? rect(width * 0.8, SQUARE, front + SQUARE / 2) : undefined;
      const keep = fits(mark.kind, at, angle, { outside: mark.kind === 'stadium', extra });
      if (!keep) continue;
      put(mark.kind, at, angle, keep);
      if (mark.kind === 'lookout-tower') peak = at;
      report.push(`${mark.kind} at ${Math.round(at.x)},${Math.round(at.z)}, ${Math.round(Math.hypot(at.x - mark.at.x, at.z - mark.at.z))} m from its mark`);
      done = true;
      break;
    }
    if (!done) report.push(`${mark.kind}: nowhere within ${R} m of ${mark.at.x},${mark.at.z} fits - place it in the editor`);
  }

  // 2. The flatiron, in the sharpest junction of the old core it fits in.
  const wedges: { at: Vec2; angle: number; sharp: number }[] = [];
  for (const node of nodes) {
    if (node.level !== 'surface') continue;
    const here = { x: node.pos.x / M, z: node.pos.z / M };
    if (!inDowntown(here) || shore(here) > TOWERS) continue;
    const arms = node.roads
      .map((id) => roads[id])
      .filter((r) => r.class !== 'interstate' && r.class !== 'ramp')
      .map((r) => {
        const o = nodes[r.a === node.id ? r.b : r.a].pos;
        return Math.atan2(o.x / M - here.x, o.z / M - here.z);
      })
      .sort((a, b) => a - b);
    if (arms.length < 2) continue;
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i], b = i + 1 < arms.length ? arms[i + 1] : arms[0] + Math.PI * 2;
      const sharp = b - a;
      if (sharp > (55 * Math.PI) / 180 || sharp < (20 * Math.PI) / 180) continue;
      const mid = (a + b) / 2;
      const along = { x: Math.sin(mid), z: Math.cos(mid) };
      // Back from the point until the two roads either side leave it room.
      for (let back = 30; back <= 90; back += 6) wedges.push({ at: { x: here.x + along.x * back, z: here.z + along.z * back }, angle: Math.atan2(-along.x, -along.z), sharp: sharp + back / 1000 });
    }
  }
  wedges.sort((p, q) => p.sharp - q.sharp);
  const flat = wedges.map((w) => ({ w, keep: fits('flatiron', w.at, w.angle) })).find((c) => c.keep);
  if (flat) {
    put('flatiron', flat.w.at, flat.w.angle, flat.keep!, 'stone');
    report.push(`flatiron at ${Math.round(flat.w.at.x)},${Math.round(flat.w.at.z)} in a ${Math.round((flat.w.sharp * 180) / Math.PI)} degree junction`);
  } else report.push(`flatiron: no sharp junction in the old core fits one (${wedges.length} looked at)`);

  // 3. The cruise terminal: its landward end on the shore, the rest over
  // water, and open water on past it.
  let terminal = false;
  for (const at of spiral(TERMINAL_AT, 700, 10)) {
    if (wet(at) || !wet({ x: at.x, z: at.z - 20 }) && !wet({ x: at.x + 20, z: at.z }) && !wet({ x: at.x - 20, z: at.z }) && !wet({ x: at.x, z: at.z + 20 })) continue;
    // Out is away from the land: down the slope of the distance to the water.
    const gx = shore({ x: at.x + C, z: at.z }) - shore({ x: at.x - C, z: at.z });
    const gz = shore({ x: at.x, z: at.z + C }) - shore({ x: at.x, z: at.z - C });
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) continue;
    const out = { x: -gx / l, z: -gz / l };
    // Its landward end just off the shore, clear of the quay lane along it.
    const centre = { x: at.x + out.x * 112, z: at.z + out.z * 112 };
    const angle = Math.atan2(out.x, out.z);
    const beyond = [240, 320, 400].map((d) => ({ x: at.x + out.x * d, z: at.z + out.z * d }));
    if (!beyond.every(wet)) continue;
    const keep = fits('cruise-terminal', centre, angle, { water: 'over' });
    if (!keep) continue;
    // Over water, bar the end that comes ashore.
    if (probesOf(keep[0], 10).some((p) => !wet(p))) continue;
    put('cruise-terminal', centre, angle, keep);
    report.push(`cruise-terminal ashore at ${Math.round(at.x)},${Math.round(at.z)}`);
    terminal = true;
    break;
  }
  if (!terminal) report.push('cruise-terminal: no shore near the old core with open water past it - place it in the editor');

  // 4. The frontages.
  const local = roads.filter((r) => {
    if (r.class === 'interstate' || r.class === 'ramp' || r.bridge) return false;
    const a = nodes[r.a], b = nodes[r.b];
    return a.level === 'surface' && b.level === 'surface' && (inArea(area.poly, a.pos) || inArea(area.poly, b.pos));
  });
  const counts = new Map<string, number>();
  for (const run of runsOf(local, nodes)) {
    const length = run.length / M;
    const boulevard = run.road.class === 'boulevard';
    for (const side of [1, -1]) {
      let d = run.junctionAtStart ? CORNER : 2;
      for (let guard = 0; guard < 400 && d < length; guard++) {
        const here = run.at(Math.min(length, d + 6) * M);
        const p = { x: here.p.x / M, z: here.p.z / M };
        const cx = Math.round(p.x * 2 + side), cz = Math.round(p.z * 2);
        const rnd = (k: number) => cellRandom(cx, cz, 40 + k);
        const t = (shore(p) - CORE) / (TOWERS - CORE);
        const towerLot = t >= 1 || ((boulevard || nearFreeway(p)) && t >= 0.35);
        let kind: SetPieceKind;
        let variant: string | undefined;
        if (towerLot) {
          kind = 'tower';
          const fromPeak = peak ? Math.hypot(p.x - peak.x, p.z - peak.z) : 800;
          const looks = fromPeak < 300 ? ['glass-tall', 'deco', 'stone-tall'] : fromPeak < 650 ? ['glass', 'stone-tall', 'stone', 'glass'] : ['glass-low', 'stone', 'glass'];
          variant = looks[Math.floor(rnd(1) * looks.length)];
        } else if (t >= 0) {
          kind = rnd(2) < 0.7 ? 'midrise' : 'townhouse';
          variant = kind === 'midrise' ? ['stone', 'concrete', 'brick'][Math.floor(rnd(3) * 3)] : ['brick', 'stone', 'render'][Math.floor(rnd(3) * 3)];
        } else if (shore(p) < QUAY && rnd(4) < 0.55) {
          kind = 'loft';
          variant = rnd(5) < 0.5 ? 'red' : 'brown';
        } else {
          const roll = rnd(6);
          kind = roll < 0.6 ? 'townhouse' : roll < 0.85 ? 'shop' : 'flat';
          variant = kind === 'townhouse' ? ['brick', 'stone', 'render'][Math.floor(rnd(7) * 3)] : kind === 'shop' ? ['red', 'green', 'blue', 'black'][Math.floor(rnd(7) * 4)] : ['brick', 'render'][Math.floor(rnd(7) * 2)];
        }
        const outline = OUTLINES[kind]!;
        const w = Math.max(...outline.map((q) => q.x)) * 2;
        const l = Math.max(...outline.map((q) => q.z)) * 2;
        const step = w + (kind === 'tower' ? TOWER_GAP : kind === 'midrise' ? 3 : GAP);
        const end = length - (run.junctionAtEnd ? CORNER : 2);
        if (d + w > end) break;
        const mid = run.at((d + w / 2) * M);
        const n = { x: -mid.dir.z * side, z: mid.dir.x * side };
        const back = run.road.width / 2 / M + (kind === 'tower' ? TOWER_SETBACK : PAVEMENT) + l / 2;
        const at = { x: mid.p.x / M + n.x * back, z: mid.p.z / M + n.z * back };
        const angle = Math.atan2(-n.x, -n.z);
        // Nothing between a road and the water close behind it: the view.
        let view = false;
        for (let k = run.road.width / 2 / M; k <= back + l / 2 + 30 && !view; k += 5) view = wet({ x: mid.p.x / M + n.x * k, z: mid.p.z / M + n.z * k });
        const keep = view ? null : fits(kind, at, angle);
        if (keep) {
          put(kind, at, angle, keep, variant);
          counts.set(kind, (counts.get(kind) ?? 0) + 1);
          d += step;
        } else {
          d += 4;
        }
      }
    }
  }
  report.push([...counts].map(([k, n]) => `${n} ${k}`).join(', '));
  return { props, report };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Points from `centre` outwards to `radius`, nearest first. */
function spiral(centre: Vec2, radius: number, step: number): Vec2[] {
  const out: Vec2[] = [];
  for (let x = -radius; x <= radius; x += step) for (let z = -radius; z <= radius; z += step) if (x * x + z * z <= radius * radius) out.push({ x: centre.x + x, z: centre.z + z });
  return out.sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z));
}

function nearestOn(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { x: a.x + dx * t, z: a.z + dz * t };
}

/** Points over a convex outline: its corners, along its edges, and a grid inside. */
function probesOf(poly: Vec2[], spacing: number): Vec2[] {
  const out: Vec2[] = [...poly];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing);
    for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
  for (let x = Math.min(...xs) + spacing / 2; x < Math.max(...xs); x += spacing)
    for (let z = Math.min(...zs) + spacing / 2; z < Math.max(...zs); z += spacing) if (insidePoly(poly, { x, z }, 0)) out.push({ x, z });
  return out;
}

/** Inside a convex outline, or within `margin` of it. */
function insidePoly(poly: Vec2[], p: Vec2, margin: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  if (inside || margin <= 0) return inside;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (distanceToSegment(p.x, p.z, a.x, a.z, b.x, b.z) < margin) return true;
  }
  return false;
}

/** Do two convex outlines overlap? Separating axes. */
function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const n = { x: q.z - p.z, z: p.x - q.x };
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of a) { const d = v.x * n.x + v.z * n.z; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const v of b) { const d = v.x * n.x + v.z * n.z; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}
