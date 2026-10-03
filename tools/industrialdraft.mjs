// Draft Industrial's once-over (2026-10-03) into its props file.
//
// `worksdraft` filled the district with works, and the owner's note on it was
// that there are too many rail yards: twelve, each a bundle of sidings and
// wagons, and tanks and chimneys everywhere else. This keeps three of the
// yards, thins the tanks and chimneys, and puts variety where the yards were:
//
// 1. **Cull.** Every yard but the owner's crest yard, the one beside the main
//    line and the biggest of the rest loses its sidings, wagons and gantry,
//    and its paving. A third of the small tanks and every chimney within 45 m
//    of a kept one go.
// 2. **Pipe racks** in the lanes between tanks, so a tank farm is plumbed.
// 3. **New works** on the district's roads, in the cleared ground first: a
//    container depot, an aggregate yard, a scrap yard, a silo plant, a site
//    office, and rarely a pair of cooling towers or a gas works with a flare
//    stack. Depots are fenced and paved; frontages get a dumpster or cones.
// 4. **Two jumps** on spoil heaps beside the Works Circuit, never on its line.
//
// What it drafts carries ids it owns (`di…` for props, `dz…` for yards), so
// running it again replaces its own work and keeps everything else. The cull
// is not repeated on a re-run (what it removed is gone), so a re-run only
// redoes steps 2-4. Then `npm run propsync -- --place industrial`.
//
// Not drafted: gates (a gate has to sit on a road, and the works' yards are
// closed to traffic) and billboards (they are collectibles, which wait for
// #469).
//
// Usage:
//   node tools/industrialdraft.mjs          # write docs/industrial-props-edited.json
//   node tools/industrialdraft.mjs --dry    # count, write nothing
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
const mine = (id) => /^di\d/.test(id) || /^dz\d/.test(id);
const rnd = (x, z, k) => cellRandom(Math.round(x), Math.round(z), k);

// Everything here is in metres.
const polyM = PLAN_DISTRICTS.filter((a) => a.kind === 'industrial')[area.index].poly.map((p) => ({ x: p.x / M, z: p.z / M }));
const inside = (p) => inArea(polyM.map((q) => ({ x: q.x * M, z: q.z * M })), { x: p.x * M, z: p.z * M });
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
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
const outline = (poly) => [...poly, poly[0]];
const near = (p, poly, d) => inPoly(p, poly) || lineDist(p, outline(poly)) < d;
const key = (p) => `${p.kind}:${Math.round(p.x * 10) / 10}:${Math.round(p.z * 10) / 10}`;

// ---- 1. The cull ---------------------------------------------------------------

const props0 = (old.props ?? []).filter((p) => !mine(p.id));
const roads0 = (old.roads ?? []).filter((r) => !mine(r.id));
const yardOf = (r) => r.points.map(([x, z]) => ({ x, z }));
const yardRoads = roads0.filter((r) => r.kind === 'yard');
const mainLine = (roads0.find((r) => r.id === 'rail1')?.points ?? []).map(([x, z]) => ({ x, z }));
const railsIn = (poly) => props0.filter((p) => p.kind === 'rails' && near(p, poly, 3)).length;

const drafted = yardRoads.filter((r) => /^dy\d/.test(r.id) && railsIn(yardOf(r)) > 0);
const centre = (poly) => ({ x: poly.reduce((s, p) => s + p.x, 0) / poly.length, z: poly.reduce((s, p) => s + p.z, 0) / poly.length });
const KEEP_YARDS = 3;
const ownersYards = yardRoads.filter((r) => !/^dy\d/.test(r.id) && railsIn(yardOf(r)) > 0);
const keepIds = new Set(ownersYards.map((r) => r.id));
if (drafted.length > KEEP_YARDS - keepIds.size) {
  const byMain = [...drafted].sort((a, b) => (mainLine.length ? lineDist(centre(yardOf(a)), mainLine) - lineDist(centre(yardOf(b)), mainLine) : 0));
  if (mainLine.length && keepIds.size < KEEP_YARDS) keepIds.add(byMain[0].id);
  const rest = drafted.filter((r) => !keepIds.has(r.id)).sort((a, b) => railsIn(yardOf(b)) - railsIn(yardOf(a)));
  if (keepIds.size < KEEP_YARDS && rest.length) keepIds.add(rest[0].id);
}
const keptYards = drafted.filter((r) => keepIds.has(r.id)).concat(ownersYards);
const culled = drafted.filter((r) => !keepIds.has(r.id) && drafted.length > KEEP_YARDS - ownersYards.length);
const culledPolys = culled.map(yardOf);
const keptPolys = [...yardRoads.filter((r) => !culled.includes(r))].map(yardOf);
const isYardProp = (p) => /^dw\d/.test(p.id) && ['rails', 'wagon', 'gantry'].includes(p.kind);
const inCulled = (p) => culledPolys.some((poly) => near(p, poly, 8)) && !keptPolys.some((poly) => near(p, poly, 1));
const goneIds = new Set(props0.filter((p) => isYardProp(p) && inCulled(p)).map((p) => p.id));

// Tanks and chimneys, thinned: a works district with a third fewer drums, and
// no chimney within 45 m of another.
const draftedWork = (p) => /^dw\d/.test(p.id);
for (const p of props0) if (p.kind === 'tank' && p.variant === 'small' && draftedWork(p) && rnd(p.x, p.z, 500) < 0.33) goneIds.add(p.id);
const stacksKept = [];
for (const p of props0) {
  if (p.kind !== 'chimney' || goneIds.has(p.id)) continue;
  if (draftedWork(p) && stacksKept.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 45)) goneIds.add(p.id);
  else stacksKept.push(p);
}
const keptProps = props0.filter((p) => !goneIds.has(p.id));
const keptRoads = roads0.filter((r) => !culled.includes(r));
const gone = new Set((old.props ?? []).filter((p) => goneIds.has(p.id) || mine(p.id)).map(key));

// ---- What a place keeps clear of ------------------------------------------------

const pieces = city.setPieces.filter((p) => !gone.has(`${p.kind}:${Math.round((p.at.x / M) * 10) / 10}:${Math.round((p.at.z / M) * 10) / 10}`));
const roads = city.roads
  .filter((r) => city.nodes[r.a].level === 'surface' || city.nodes[r.b].level === 'surface' || r.class === 'interstate')
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M }));
for (let i = 1; i < mainLine.length; i++) roads.push({ a: mainLine[i - 1], b: mainLine[i], half: 5 });
const pillars = city.pillars.map((p) => ({ x: p.at.x / M, z: p.at.z / M }));
const keep = [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)].map((p) => ({ x: p.x / M, z: p.z / M }));
const races = city.routes.map((r) => r.points.map((p) => ({ x: p.x / M, z: p.z / M })));
const circuit = city.routes.find((r) => r.name === 'Works Circuit');
const circuitLine = circuit ? circuit.points.map((p) => ({ x: p.x / M, z: p.z / M })) : [];

const placed = [];
const props = [];
const yards = [];
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

const ROAD_CLEAR = 6;
const RACE_CLEAR = 14;
const GAP = 10;
const MAX_FALL = 5;
/** Kinds held to flat ground by the editor, with the footprint it measures (across, along) and the fall allowed. */
const FLAT = {
  'container-block': [30, 12.5, 1], cabin: [5.8, 15.5, 1], crusher: [16, 16, 1], conveyor: [3.2, 84, 1.5],
  silo: [8, 8, 1], 'water-tower': [10, 10, 1], crane: [6, 6, 1], mast: [4, 4, 1],
  'cooling-tower': [30, 30, 2], 'gas-holder': [44, 44, 2], 'flare-stack': [6, 6, 1], stockpile: [44, 44, 6],
};

/** A prop in a place's own frame: `u` away from the road, `v` along it. */
const P = (kind, u, v, turn = 0, variant) => ({ kind, u, v, turn, ...(variant ? { variant } : {}) });
/** A run of fence along a line in the place's frame, `step` metres a piece. */
function fence(out, u0, v0, u1, v1, skip = () => false) {
  const len = Math.hypot(u1 - u0, v1 - v0);
  const n = Math.max(1, Math.round(len / 6));
  // A fence's span is across its heading, so one running along v is turned a quarter.
  const turn = Math.abs(v1 - v0) > Math.abs(u1 - u0) ? 0 : Math.PI / 2;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
    if (!skip(u, v)) out.push(P('fence-line', u, v, turn));
  }
}
/** Fence round a lot on three sides, leaving the front open at its middle for the way in. */
function fenced(out, depth, width, entrance = 14) {
  const h = width / 2;
  fence(out, depth, -h, depth, h);
  fence(out, 3, -h, depth, -h);
  fence(out, 3, h, depth, h);
  fence(out, 3, -h, 3, h, (u, v) => Math.abs(v) < entrance / 2);
}
/** Clutter at a frontage: a dumpster, a few cones, a bollard pair either side of the way in. */
function frontage(out, r, width) {
  if (r(60) < 0.6) out.push(P('dumpster', 5, -width / 2 + 5 + r(61) * 10, 0, ['green', 'blue', 'grey'][Math.floor(r(62) * 3)]));
  if (r(63) < 0.7) for (let k = 0; k < 3; k++) out.push(P('cone', 5, 8 + k * 2.2));
  for (const s of [-1, 1]) out.push(P('bollard', 3.5, s * 8));
}

function containerDepot(r) {
  const rows = 2 + Math.floor(r(1) * 2), cols = 2 + Math.floor(r(2) * 2);
  const vp = 35, up = 20;
  const width = cols * vp + 8, depth = 20 + rows * up;
  const out = [];
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      if (r(10 + i * 7 + j) < 0.12) continue;
      out.push(P('container-block', 16 + i * up, -width / 2 + vp / 2 + 4 + j * vp, Math.PI / 2, ['two high', 'three high', 'four high'][Math.floor(r(30 + i * 5 + j) * 3)]));
    }
  out.push(P(r(3) < 0.5 ? 'reach-stacker' : 'straddle-carrier', 16 + up / 2 + (r(4) < 0.5 ? 0 : up), -width / 2 + 12, Math.PI / 2));
  if (r(5) < 0.6) out.push(P('reach-stacker', 12, width / 2 - 14, Math.PI / 2));
  out.push(P('cabin', 8, -width / 2 + 12, Math.PI / 2));
  fenced(out, depth, width);
  frontage(out, r, width);
  return { props: out, depth: depth + 2, width, yard: [[2, -width / 2 - 2], [depth, -width / 2 - 2], [depth, width / 2 + 2], [2, width / 2 + 2]] };
}

function aggregateYard(r) {
  const long = r(1) < 0.4;
  const out = [];
  let depth, width;
  if (long) {
    depth = 86; width = 104;
    out.push(P('crusher', 14, 0), P('conveyor', 34, 0, Math.PI / 2));
    out.push(P('stockpile', 62, -30, 0, 'grey'), P('stockpile', 62, 30, 0, 'sand'), P('excavator', 12, -34, 0.4), P('haul-truck', 12, 34, -0.3));
  } else {
    depth = 60; width = 70;
    out.push(P('stockpile', 34, -10, 0, ['grey', 'sand', 'rust'][Math.floor(r(2) * 3)]), P('crusher', 14, 24), P('excavator', 46, 26, 1.1), P('haul-truck', 12, -26, 0.3));
  }
  fenced(out, depth, width, 20);
  frontage(out, r, width);
  return { props: out, depth: depth + 2, width, yard: [[2, -width / 2 - 2], [depth, -width / 2 - 2], [depth, width / 2 + 2], [2, width / 2 + 2]] };
}

function scrapYard(r) {
  const depth = 54, width = 66;
  const out = [P('crane', 26, 0), P('stockpile', 34, -20, 0, 'rust'), P('excavator', 16, 22, -0.5), P('haul-truck', 40, 22, 0.9)];
  for (let k = 0; k < 4; k++) out.push(P('stack', 12 + (k % 2) * 4, -26 + k * 3, 0, 'drums'));
  out.push(P('cabin', 8, -width / 2 + 12, Math.PI / 2));
  fenced(out, depth, width);
  frontage(out, r, width);
  return { props: out, depth: depth + 2, width, yard: [[2, -width / 2 - 2], [depth, -width / 2 - 2], [depth, width / 2 + 2], [2, width / 2 + 2]] };
}

function siloPlant(r) {
  const n = 3 + Math.floor(r(1) * 2);
  const width = n * 14 + 30, depth = 52;
  const out = [];
  for (let k = 0; k < n; k++) out.push(P('silo', 22, -width / 2 + 20 + k * 14));
  out.push(P('water-tower', 22, width / 2 - 12), P('cabin', 8, -width / 2 + 12, Math.PI / 2));
  if (r(2) < 0.6) out.push(P('mast', 40, -width / 2 + 14));
  out.push(P('shed', 40, 0, Math.PI / 2), P('shed', 40, 18, Math.PI / 2));
  fenced(out, depth, width);
  frontage(out, r, width);
  return { props: out, depth: depth + 2, width, yard: [[2, -width / 2 - 2], [depth, -width / 2 - 2], [depth, width / 2 + 2], [2, width / 2 + 2]] };
}

function siteOffice(r) {
  const depth = 32, width = 44;
  const out = [P('cabin', 10, -10, Math.PI / 2), P('cabin', 10, 10, Math.PI / 2), P('shed', 24, 0, Math.PI / 2)];
  for (let k = 0; k < 3; k++) out.push(P('stack', 22, -16 + k * 3, 0, k % 2 ? 'drums' : 'pallets'));
  for (const s of [-1, 1]) out.push(P('blast-wall', 4, s * 11, Math.PI / 2));
  fenced(out, depth, width, 16);
  frontage(out, r, width);
  return { props: out, depth: depth + 2, width, yard: [[2, -width / 2 - 2], [depth, -width / 2 - 2], [depth, width / 2 + 2], [2, width / 2 + 2]] };
}

function coolingGroup(r) {
  const depth = 54, width = 84;
  const out = [P('cooling-tower', 28, -22), P('cooling-tower', 28, 22), P('pipe-rack', 28, 0, Math.PI / 2)];
  if (r(1) < 0.6) out.push(P('chimney', 12, 0));
  fenced(out, depth, width, 20);
  return { props: out, depth: depth + 2, width };
}

function gasWorks(r) {
  const depth = 54, width = 96;
  const out = [P('gas-holder', 28, 0), P('flare-stack', 14, 36), P('tank', 18, -38, 0, 'small')];
  if (r(1) < 0.7) out.push(P('tank', 36, -38, 0, 'small'));
  out.push(P('pipe-rack', 40, 30, Math.PI / 2));
  fenced(out, depth, width, 20);
  return { props: out, depth: depth + 2, width };
}

// ---- 2. Pipe racks ----------------------------------------------------------------

const tanks = keptProps.filter((p) => p.kind === 'tank');
const racks = [];
const radius = (t) => (t.variant === 'small' ? 7 : 14);
for (let i = 0; i < tanks.length; i++)
  for (let j = i + 1; j < tanks.length; j++) {
    const a = tanks[i], b = tanks[j];
    if ((a.variant ?? 'large') !== (b.variant ?? 'large')) continue;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    const gap = d - radius(a) - radius(b);
    if (gap < 3 || gap > 10) continue;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (rnd(mx, mz, 510) > 0.45) continue;
    if (racks.some((q) => Math.hypot(q.x - mx, q.z - mz) < 30)) continue;
    // Along the lane: across the line from one tank to the other.
    const angle = Math.atan2(-(b.z - a.z), b.x - a.x);
    racks.push({ kind: 'pipe-rack', x: Math.round(mx * 10) / 10, z: Math.round(mz * 10) / 10, angle: Math.round((((angle % Math.PI) + Math.PI) % Math.PI) * 1000) / 1000 });
  }
props.push(...racks);

// ---- 3. Placing a works -----------------------------------------------------------

const tally = {};
const yardsDone = [];
const budget = { cooling: 2, gas: 2 };
const wasYards = culledPolys.map(centre);
function tryPlace(make, seed, front, dir, out, cap) {
  if (cap && budget[cap] <= 0) return false;
  const r = (k) => cellRandom(Math.round(front.x), Math.round(front.z), 700 + k + seed * 17);
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
  if (pts.some((p) => keptPolys.some((poly) => near(p, poly, 0)))) return false;
  if (pts.some((p) => props.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 6 && q.kind !== 'fence-line'))) return false;
  const gp = probes(grown, 10);
  if (placed.some((poly) => gp.some((p) => inPoly(p, poly)) || poly.some((p) => inPoly(p, grown)))) return false;
  const hs = pts.map(ground);
  if (Math.max(...hs) - Math.min(...hs) > MAX_FALL) return false;
  const roadAngle = Math.atan2(dir.x, dir.z);
  for (const p of w.props) {
    const f = FLAT[p.kind];
    if (!f) continue;
    const c = to(p.u, p.v);
    const ax = p.turn ? out : dir, bx = p.turn ? dir : out;
    const under = [];
    for (let i = -1; i <= 1; i += 0.5)
      for (let j = -1; j <= 1; j += 0.5)
        under.push(ground({ x: c.x + (ax.x * i * f[1]) / 2 + (bx.x * j * f[0]) / 2, z: c.z + (ax.z * i * f[1]) / 2 + (bx.z * j * f[0]) / 2 }));
    if (Math.max(...under) - Math.min(...under) >= f[2]) return false;
  }
  placed.push(corners);
  tally[make.name] = (tally[make.name] ?? 0) + 1;
  if (cap) budget[cap]--;
  for (const p of w.props) {
    const at = to(p.u, p.v);
    const angle = Math.round((((roadAngle + p.turn) % Math.PI) + Math.PI) % Math.PI * 1000) / 1000;
    props.push({ kind: p.kind, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, angle, ...(p.variant ? { variant: p.variant } : {}) });
  }
  if (w.yard) yards.push(w.yard.map(([u, v]) => to(u, v)).map((p) => [Math.round(p.x), Math.round(p.z)]));
  return true;
}

const OPEN = 0.5;
const menu = (x, z) => {
  const nearYard = wasYards.some((c) => Math.hypot(c.x - x, c.z - z) < 110);
  if (!nearYard && rnd(x, z, 600) < OPEN) return [];
  const list = [
    [containerDepot, 1], [aggregateYard, 2], [siloPlant, 3], [scrapYard, 4], [siteOffice, 5],
  ];
  const k = Math.floor(rnd(x, z, 601) * list.length);
  const order = [...list.slice(k), ...list.slice(0, k)].filter(([m]) => m !== siteOffice).map(([m, s]) => [m, s, null]);
  const rare = rnd(x, z, 602);
  if (rare < 0.12) order.unshift([coolingGroup, 6, 'cooling']);
  else if (rare < 0.24) order.unshift([gasWorks, 7, 'gas']);
  return order;
};
// The cleared yards first, each in its own frame: its first edge ran along the
// road or the line it faced, so walk that edge and try each works from it.
const menuAt = (x, z) => {
  const list = [
    [containerDepot, 1], [aggregateYard, 2], [siloPlant, 3], [scrapYard, 4], [siteOffice, 5],
  ];
  const k = Math.floor(rnd(x, z, 601) * list.length);
  return [...list.slice(k), ...list.slice(0, k)].map(([m, s]) => [m, s, null]);
};
for (const poly of culledPolys) {
  if (process.env.DBG) console.log('yard', poly.map((q) => `${q.x},${q.z}`).join(' '), Math.round(Math.hypot(poly[1].x - poly[0].x, poly[1].z - poly[0].z)), 'x', Math.round(Math.hypot(poly[3].x - poly[0].x, poly[3].z - poly[0].z)));
  const [p0, p1, , p3] = poly;
  const L = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
  const out = { x: (p1.x - p0.x) / L, z: (p1.z - p0.z) / L };
  const W = Math.hypot(p3.x - p0.x, p3.z - p0.z) || 1;
  const dir = { x: (p3.x - p0.x) / W, z: (p3.z - p0.z) / W };
  for (let d = 0; d < W; d += 20) {
    const f = { x: p0.x - out.x * 2 + dir.x * d, z: p0.z - out.z * 2 + dir.z * d };
    const rare = rnd(f.x, f.z, 603);
    const order = menuAt(f.x, f.z);
    if (rare < 0.2) order.unshift([coolingGroup, 6, 'cooling']);
    else if (rare < 0.4) order.unshift([gasWorks, 7, 'gas']);
    // The office is the filler, not the choice: only when nothing bigger went in.
    for (const [make, seed, cap] of order) if (tryPlace(make, seed, f, dir, out, cap)) break;
  }
}

// The landmarks need a big lot, so look for one anywhere in the district: on
// a grid, facing each way, the ones that fit first from a shuffled order.
{
  const xs = polyM.map((q) => q.x), zs = polyM.map((q) => q.z);
  const cand = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 24)
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 24) cand.push({ x, z, k: rnd(x, z, 650) });
  cand.sort((a, b) => a.k - b.k);
  const sites = [];
  for (const [make, seed, cap, apart] of [[coolingGroup, 6, 'cooling', 400], [gasWorks, 7, 'gas', 400]]) {
    for (const c of cand) {
      if (budget[cap] <= 0) break;
      if (sites.some((q) => q.cap === cap && Math.hypot(q.x - c.x, q.z - c.z) < apart)) continue;
      const a = Math.floor(rnd(c.x, c.z, 651) * 4) * (Math.PI / 2);
      const dir = { x: Math.cos(a), z: Math.sin(a) }, out = { x: -dir.z, z: dir.x };
      if (tryPlace(make, seed, c, dir, out, cap)) sites.push({ ...c, cap });
    }
  }
}

const local = city.roads.filter((r) => {
  if (r.class === 'interstate' || r.class === 'ramp' || r.bridge) return false;
  if (city.nodes[r.a].level !== 'surface' || city.nodes[r.b].level !== 'surface') return false;
  return inside(node(r.a)) || inside(node(r.b));
});
for (const road of local) {
  const line = [node(road.a), node(road.b)];
  for (const side of [1, -1]) {
    const [a, b] = line;
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 1) continue;
    const dir = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    const out = { x: -dir.z * side, z: dir.x * side };
    const setback = road.width / 2 / M + 10;
    for (let d = 0; d < l; d += 25) {
      const p = { x: a.x + dir.x * d + out.x * setback, z: a.z + dir.z * d + out.z * setback };
      for (const [make, seed, cap] of menu(Math.round(p.x), Math.round(p.z))) if (tryPlace(make, seed, p, dir, out, cap)) break;
    }
  }
}

// ---- 4. Jumps -------------------------------------------------------------------------
// Two, on flat ground a little off the Works Circuit's line (never on it: a
// jump on a race line changes the lap), pointing along the circuit.
let jumps = 0;
for (let i = 0; i < circuitLine.length && jumps < 2; i += 3) {
  const a = circuitLine[i], b = circuitLine[Math.min(circuitLine.length - 1, i + 1)];
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  if (l < 1) continue;
  const dir = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  for (const side of [1, -1]) {
    const c = { x: a.x - dir.z * side * 28, z: a.z + dir.x * side * 28 };
    const foot = probes([{ x: c.x - 8, z: c.z - 8 }, { x: c.x + 8, z: c.z - 8 }, { x: c.x + 8, z: c.z + 8 }, { x: c.x - 8, z: c.z + 8 }], 8);
    if (!foot.every((p) => inside(p) && !wet(p))) continue;
    if (foot.some((p) => roads.some((s) => segDist(p, s.a, s.b) < s.half + 8))) continue;
    if (foot.some((p) => lineDist(p, circuitLine) < 20)) continue;
    if (foot.some((p) => hitsSetPiece(pieces, p.x * M, p.z * M, -Infinity, 4 * M, Infinity))) continue;
    if (placed.some((poly) => foot.some((p) => inPoly(p, poly)))) continue;
    const hs = foot.map(ground);
    if (Math.max(...hs) - Math.min(...hs) > 1.5) continue;
    const angle = Math.round((((Math.atan2(dir.x, dir.z) % Math.PI) + Math.PI) % Math.PI) * 1000) / 1000;
    props.push({ kind: 'jump', x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, angle, variant: 'built ramp', note: 'Spoil heap beside the Works Circuit' });
    jumps++;
    break;
  }
}

// ---- Writing it -------------------------------------------------------------------------

const count = (k) => props.filter((p) => p.kind === k).length;
const railLeft = keptProps.filter((p) => p.kind === 'rails').length;
console.log(
  `culled ${culled.length} of ${culled.length + keptYards.length} rail yards (${goneIds.size} props removed incl. thinning, ${railLeft} lengths of siding left) · ` +
    `${placed.length} new works: ${count('container-block')} container blocks, ${count('stockpile')} stockpiles, ${count('silo')} silos, ` +
    `${count('cooling-tower')} cooling towers, ${count('gas-holder')} gas holders, ${count('flare-stack')} flare stacks, ${count('pipe-rack')} pipe racks, ` +
    `${count('fence-line')} fences, ${count('jump')} jumps · ${yards.length} yards`,
);
if (!DRY) {
  const doc = {
    ...old,
    seed: `0x${(CITY_SEED >>> 0).toString(16)}`,
    place: area.name,
    savedAt: new Date().toISOString(),
    props: [...keptProps, ...props.map((p, i) => ({ id: `di${i + 1}`, ...p }))],
    roads: [
      ...keptRoads,
      ...yards.map((points, i) => ({ id: `dz${i + 1}`, kind: 'yard', district: 'industrial', bridge: false, points, isNew: true })),
    ],
  };
  writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${FILE}`);
}
