// Draft Industrial's works and its railway (#489, #514) into its props file.
//
// The owner laid out one works on the open crest and asked for "way more
// stuff, similar to what you have in the one spot". This fills the rest of
// the district the same way, as a draft to edit in the Industrial Props
// editor, the same as `housedraft` does for a suburb: generated once, then
// the editor's.
//
// Two passes:
//
// 1. **The main line**, a road with surface `rail`, 35 m off the freeway on
//    the works side, the first stretch of the railway that is to run round
//    the loop (#514). Rail yards stand beside it, their sidings parallel to
//    it, because a siding is where a line's wagons wait.
// 2. **The works on the roads**: along every works road and boulevard in the
//    district, both sides, a works facing the road - a tank farm, a shed with
//    its chimneys, a smaller rail yard, a cluster of stacks - each clear of
//    every road, the freeway and its pillars, the water, the race lines and
//    everything already placed, on ground flat enough to stand on.
//
// What it drafts carries ids it owns (`dw…` for props, `dy…` for yards,
// `rail1` for the line), so running it again replaces its own draft and
// keeps everything else in the file - the hand-placed works included.
// Then `npm run propsync -- --place industrial`.
//
// Usage:
//   npm run worksdraft          # write docs/industrial-props-edited.json
//   npm run worksdraft -- --dry # count, write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { SUBURBS } from './suburbs.mjs';

const DRY = process.argv.includes('--dry');
const area = SUBURBS.industrial;
const FILE = area.json;

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { CITY_SEED, UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_DISTRICTS, inArea } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { hitsSetPiece } = await server.ssrLoadModule('/src/game/city/setpieces.ts');
const { cellRandom } = await server.ssrLoadModule('/src/game/city/highmoor.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const mine = (id) => /^dw\d/.test(id) || /^dy\d/.test(id) || id === 'rail1';
const keptProps = (old.props ?? []).filter((p) => !mine(p.id));
const keptRoads = (old.roads ?? []).filter((r) => !mine(r.id));

// Everything here is in metres.
const poly = PLAN_DISTRICTS.filter((a) => a.kind === 'industrial')[area.index].poly.map((p) => ({ x: p.x / M, z: p.z / M }));
const inside = (p) => inArea(poly.map((q) => ({ x: q.x * M, z: q.z * M })), { x: p.x * M, z: p.z * M });
const wet = (p) => inWater(city, p.x * M, p.z * M);
const ground = (p) => groundAt(city.terrain, p.x * M, p.z * M) / M;
const node = (i) => ({ x: city.nodes[i].pos.x / M, z: city.nodes[i].pos.z / M });
const segDist = (p, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z);
};
const lineDist = (p, line) => {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(p, line[i - 1], line[i]));
  return d;
};

// What a works keeps clear of. A drafted prop already in the city (a re-run
// after a sync) is not in the way of its own redraft.
const drafted = new Set((old.props ?? []).filter((p) => mine(p.id)).map((p) => `${p.kind}:${p.x}:${p.z}`));
const pieces = city.setPieces.filter((p) => !drafted.has(`${p.kind}:${Math.round((p.at.x / M) * 10) / 10}:${Math.round((p.at.z / M) * 10) / 10}`));
const roads = city.roads
  .filter((r) => city.nodes[r.a].level === 'surface' || city.nodes[r.b].level === 'surface' || r.class === 'interstate')
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, road: r }));
const pillars = city.pillars.map((p) => ({ x: p.at.x / M, z: p.at.z / M }));
const keep = [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)].map((p) => ({ x: p.x / M, z: p.z / M }));
const races = city.routes.map((r) => r.points.map((p) => ({ x: p.x / M, z: p.z / M })));
const yardsBefore = keptRoads.filter((r) => r.kind === 'yard').map((r) => r.points.map(([x, z]) => ({ x, z })));

// ---- 1. The main line ------------------------------------------------------

/** The freeway through the district as one line, west end first. */
function freewayLine() {
  const segs = city.roads
    .filter((r) => r.class === 'interstate')
    .map((r) => [node(r.a), node(r.b)])
    .filter(([a, b]) => inside(a) || inside(b));
  const ends = segs.flat();
  let cur = ends.reduce((m, p) => (p.x < m.x ? p : m));
  const line = [cur];
  const used = new Set();
  for (;;) {
    let next = null;
    segs.forEach(([a, b], i) => {
      if (used.has(i) || next) return;
      if (Math.hypot(a.x - cur.x, a.z - cur.z) < 1) next = [i, b];
      else if (Math.hypot(b.x - cur.x, b.z - cur.z) < 1) next = [i, a];
    });
    if (!next) break;
    used.add(next[0]);
    cur = next[1];
    line.push(cur);
  }
  return line;
}

/** A line offset to its left by `d` metres, mitred at each vertex. */
function offset(line, d) {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const n = (s, e) => {
      const l = Math.hypot(e.x - s.x, e.z - s.z) || 1;
      return { x: -(e.z - s.z) / l, z: (e.x - s.x) / l };
    };
    const n1 = i > 0 ? n(a, p) : n(p, b);
    const n2 = i < line.length - 1 ? n(p, b) : n1;
    const m = { x: n1.x + n2.x, z: n1.z + n2.z };
    const ml = Math.hypot(m.x, m.z) || 1;
    const cos = (m.x * n1.x + m.z * n1.z) / ml;
    const k = d / Math.max(0.5, cos);
    return { x: p.x + (m.x / ml) * k, z: p.z + (m.z / ml) * k };
  });
}

/** Rounded off: Chaikin's corner cutting, which turns a mitre into a curve. */
function smooth(line, passes) {
  let out = line;
  for (let k = 0; k < passes; k++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** Points every `step` metres along a line. */
function resample(line, step) {
  const out = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    let d = step - carry;
    while (d < l) {
      out.push({ x: a.x + ((b.x - a.x) * d) / l, z: a.z + ((b.z - a.z) * d) / l });
      d += step;
    }
    carry = l - (d - step);
  }
  const last = line[line.length - 1];
  if (Math.hypot(last.x - out[out.length - 1].x, last.z - out[out.length - 1].z) > step / 3) out.push(last);
  return out;
}

/** Off the freeway's centre to the line's centre: clear of the deck's pillars and of a ramp's foot. */
const MAIN_LINE_OFFSET = 35;
const RAIL_WIDTH = 10;
const freeway = freewayLine();
let main = resample(smooth(offset(freeway, MAIN_LINE_OFFSET), 3), 25).filter((p) => inside(p) && !wet(p));
main = main.map((p) => ({ x: Math.round(p.x), z: Math.round(p.z) }));
const rail = { id: 'rail1', kind: 'street', district: 'industrial', bridge: false, surface: 'rail', points: main.map((p) => [p.x, p.z]), isNew: true };
roads.push(...main.slice(1).map((b, i) => ({ a: main[i], b, half: RAIL_WIDTH / 2, rail: true })));

// ---- What a works is ---------------------------------------------------------

/**
 * A works, in its own frame: `u` across the road it faces (0 at its front
 * edge, growing away from the road), `v` along it (0 at its middle). Each
 * returns its props in that frame (`angle` relative to the road: 0 runs along
 * it) and the yard it paves, if any.
 */
const box = (kind, u, v, angle, variant) => ({ kind, u, v, angle, ...(variant ? { variant } : {}) });

function railYard(r, long) {
  // Sidings parallel to the road, a gantry across them, wagons waiting, the
  // yard paved round them: the owner's works on the crest, laid on its side.
  const lengths = long ? 4 : 2;
  const L = lengths * 40;
  const tracks = r(1) < 0.5 ? 3 : 2;
  const props = [];
  for (let t = 0; t < tracks; t++) {
    const u = 12 + t * 7;
    for (let k = 0; k < lengths; k++) props.push(box('rails', u, -L / 2 + 20 + k * 40, 0));
    for (let k = 0; k < Math.floor(L / 16); k++) {
      if (r(10 + t * 31 + k) < 0.45) continue;
      props.push(box('wagon', u, -L / 2 + 8 + k * 16, 0, r(50 + t * 7 + k) < 0.5 ? 'box' : 'tank'));
    }
  }
  props.push(box('gantry', 12 + (tracks - 1) * 3.5, (r(3) - 0.5) * (L - 50), 0));
  const depth = long ? 60 : 40;
  if (long) props.push(box('warehouse', depth + 18, 0, 0, 'small'));
  return { props, depth: long ? depth + 36 : depth, width: L + 10, yard: [[4, -L / 2 - 5], [depth, -L / 2 - 5], [depth, L / 2 + 5], [4, L / 2 + 5]] };
}

function tankFarm(r) {
  // Two rows of large drums, or three of small ones, and a stack by them.
  const large = r(1) < 0.6;
  const props = [];
  const cols = large ? 2 + Math.floor(r(2) * 2) : 3 + Math.floor(r(2) * 2);
  const rows = large ? 2 : 3;
  const pitch = large ? 36 : 19;
  const width = cols * pitch;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) props.push(box('tank', 4 + pitch / 2 + i * pitch, -width / 2 + pitch / 2 + j * pitch, 0, large ? 'large' : 'small'));
  if (r(3) < 0.7) props.push(box('chimney', 4 + rows * pitch + 6, (r(4) - 0.5) * width * 0.6, 0));
  return { props, depth: rows * pitch + (r(3) < 0.7 ? 14 : 4), width };
}

function shed(r) {
  // A works shed side-on to the road, its chimneys behind it.
  const large = r(1) < 0.45;
  const w = large ? 130 : 60, d = large ? 50 : 30;
  const props = [box('warehouse', 4 + d / 2, 0, 0, large ? undefined : 'small')];
  const stacks = 1 + Math.floor(r(2) * (large ? 3 : 2));
  for (let k = 0; k < stacks; k++) props.push(box('chimney', 4 + d + 8, -w / 2 + ((k + 1) * w) / (stacks + 1), 0));
  if (r(3) < 0.5) props.push(box('tank', 4 + d + 22, (r(4) - 0.5) * w * 0.5, 0, 'small'));
  return { props, depth: d + (props.some((p) => p.kind === 'tank') ? 32 : 14), width: w };
}

function stacks(r) {
  // A cluster of stacks over a few small drums: a works seen from across town.
  const props = [box('chimney', 10, -12, 0), box('chimney', 10, 12, 0)];
  if (r(1) < 0.5) props.push(box('chimney', 24, 0, 0));
  props.push(box('tank', 30, -16, 0, 'small'), box('tank', 30, 16, 0, 'small'));
  return { props, depth: 40, width: 50 };
}

// ---- Placing one -------------------------------------------------------------

const placed = []; // footprints, as polygons
const props = [];
const yards = [];
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
/** Points over a footprint, every few metres, to test it against everything. */
const probes = (corners, step = 8) => {
  const [a, b, , d] = corners;
  const nu = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  const nv = Math.max(1, Math.ceil(Math.hypot(d.x - a.x, d.z - a.z) / step));
  const out = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const s = i / nu, t = j / nv;
      out.push({ x: a.x + (b.x - a.x) * s + (d.x - a.x) * t, z: a.z + (b.z - a.z) * s + (d.z - a.z) * t });
    }
  return out;
};

/** Clear of every road's edge but the front, which is a set-back away. */
const ROAD_CLEAR = 6;
/** Back from a race line: a car that runs a corner wide goes further than a pavement. */
const RACE_CLEAR = 14;
const GAP = 12;
const MAX_FALL = 5;
/** What has to stand on flat ground, along (`l`) and across (`w`) its heading, in metres. */
const FLAT_SIZES = {
  warehouse: { w: 50, l: 130 },
  'warehouse:small': { w: 30, l: 60 },
  'tank:large': { w: 28, l: 28 },
  'tank:small': { w: 14, l: 14 },
  rails: { w: 3.4, l: 40 },
};

/**
 * Try a works at `front` (its front edge's middle), facing along `dir` with
 * its back towards `out`. Returns whether it went in.
 */
function tryPlace(make, seed, front, dir, out) {
  const r = (k) => cellRandom(Math.round(front.x), Math.round(front.z), 300 + k + seed * 17);
  const w = make(r);
  const to = (u, v) => ({ x: front.x + out.x * u + dir.x * v, z: front.z + out.z * u + dir.z * v });
  const corners = [to(0, -w.width / 2), to(0, w.width / 2), to(w.depth, w.width / 2), to(w.depth, -w.width / 2)];
  const grown = [to(-GAP / 2, -w.width / 2 - GAP / 2), to(-GAP / 2, w.width / 2 + GAP / 2), to(w.depth + GAP / 2, w.width / 2 + GAP / 2), to(w.depth + GAP / 2, -w.width / 2 - GAP / 2)];
  const pts = probes(corners);
  if (!pts.every((p) => inside(p) && !wet(p))) return false;
  if (pts.some((p) => roads.some((s) => segDist(p, s.a, s.b) < s.half + ROAD_CLEAR))) return false;
  if (pts.some((p) => pillars.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 8))) return false;
  if (pts.some((p) => races.some((line) => lineDist(p, line) < RACE_CLEAR))) return false;
  if (pts.some((p) => keep.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 10))) return false;
  if (pts.some((p) => hitsSetPiece(pieces, p.x * M, p.z * M, -Infinity, 4 * M, Infinity))) return false;
  if (pts.some((p) => yardsBefore.some((y) => inPoly(p, y)))) return false;
  const gp = probes(grown, 10);
  if (placed.some((poly) => gp.some((p) => inPoly(p, poly)) || poly.some((p) => inPoly(p, grown)))) return false;
  const hs = pts.map(ground);
  if (Math.max(...hs) - Math.min(...hs) > MAX_FALL) return false;
  // Each shed and drum on ground flat under it, by the editor's own measure:
  // a works can sit across a rise, a building on one sinks into it.
  for (const p of w.props) {
    const size = FLAT_SIZES[p.variant ? `${p.kind}:${p.variant}` : p.kind];
    if (!size) continue;
    const c = to(p.u, p.v);
    const ax = p.angle === 0 ? dir : out, bx = p.angle === 0 ? out : dir;
    const under = [];
    for (let i = -1; i <= 1; i += 0.5)
      for (let j = -1; j <= 1; j += 0.5)
        under.push(ground({ x: c.x + (ax.x * i * size.l) / 2 + (bx.x * j * size.w) / 2, z: c.z + (ax.z * i * size.l) / 2 + (bx.z * j * size.w) / 2 }));
    // Under 1 m for what the editor holds to flat ground: it reads heights to
    // the whole metre, so a fall of 1.1 m shows there as 2.
    // A shed stands on a 3 m footing (`WAREHOUSE_FOOTING`, #516), which hides a 6 m fall.
    const limit = p.kind === 'warehouse' ? 5 : p.kind === 'tank' ? 2 : 1;
    if (Math.max(...under) - Math.min(...under) >= limit) return false;
  }
  placed.push(corners);
  const roadAngle = Math.atan2(dir.x, dir.z);
  for (const p of w.props) {
    const at = to(p.u, p.v);
    const angle = Math.round((((roadAngle + p.angle) % Math.PI) + Math.PI) % Math.PI * 1000) / 1000;
    props.push({ kind: p.kind, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, angle, ...(p.variant ? { variant: p.variant } : {}) });
  }
  if (w.yard) yards.push(w.yard.map(([u, v]) => to(u, v)).map((p) => [Math.round(p.x), Math.round(p.z)]));
  return true;
}

/** Walk a line on one side, trying a works every `step` metres from what `pick` offers. */
function walk(line, side, setback, step, pick) {
  let along = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 1) continue;
    const dir = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    const out = { x: -dir.z * side, z: dir.x * side };
    for (let d = 0; d < l; d += step) {
      const p = { x: a.x + dir.x * d + out.x * setback, z: a.z + dir.z * d + out.z * setback };
      for (const [make, seed] of pick(Math.round(p.x), Math.round(p.z))) if (tryPlace(make, seed, p, dir, out)) break;
    }
    along += l;
  }
  return along;
}

// Yards beside the main line, on the side away from the freeway (its left).
walk(main, 1, RAIL_WIDTH / 2 + 2, 30, () => [[(r) => railYard(r, true), 1], [(r) => railYard(r, false), 2]]);

// Then the works on the district's roads, both sides of each.
/** How often a spot is left as open ground: a works district has its waste lots. */
const OPEN = 0.2;
const menu = (x, z) => {
  if (cellRandom(x, z, 400) < OPEN) return [];
  const big = [
    [(r) => railYard(r, true), 7],
    [shed, 4],
    [tankFarm, 3],
    [(r) => railYard(r, false), 5],
  ];
  // A different first choice at each spot, so neighbours are not all one
  // kind; the stacks only where nothing bigger fits, and not always then.
  const k = Math.floor(cellRandom(x, z, 401) * big.length);
  const order = [...big.slice(k), ...big.slice(0, k)];
  return cellRandom(x, z, 402) < 0.35 ? [...order, [stacks, 6]] : order;
};
const local = city.roads.filter((r) => {
  if (r.class === 'interstate' || r.class === 'ramp' || r.bridge) return false;
  if (city.nodes[r.a].level !== 'surface' || city.nodes[r.b].level !== 'surface') return false;
  return inside(node(r.a)) || inside(node(r.b));
});
for (const road of local) {
  const line = [node(road.a), node(road.b)];
  for (const side of [1, -1]) walk(line, side, road.width / 2 / M + 10, 25, menu);
}

// ---- Writing it ----------------------------------------------------------------

const count = (k) => props.filter((p) => p.kind === k).length;
const length = main.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - main[i].x, p.z - main[i].z), 0);
console.log(
  `main line ${Math.round(length)} m, ${main.length} points · ${placed.length} works: ${count('tank')} tanks, ${count('warehouse')} sheds, ` +
    `${count('chimney')} chimneys, ${count('rails')} lengths of siding, ${count('wagon')} wagons, ${count('gantry')} gantries · ${yards.length} yards · ` +
    `${keptProps.length} props kept`,
);
if (!DRY) {
  const doc = {
    ...old,
    seed: `0x${(CITY_SEED >>> 0).toString(16)}`,
    place: area.name,
    savedAt: new Date().toISOString(),
    props: [...keptProps, ...props.map((p, i) => ({ id: `dw${i + 1}`, ...p }))],
    roads: [
      ...keptRoads,
      rail,
      ...yards.map((points, i) => ({ id: `dy${i + 1}`, kind: 'yard', district: 'industrial', bridge: false, points, isNew: true })),
    ],
  };
  writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${FILE}`);
}
