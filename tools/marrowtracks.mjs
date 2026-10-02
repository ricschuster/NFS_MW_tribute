// Draft dirt tracks over Marrow Field's east side into the drawn roads
// (`docs/roads-edited.json`), for the owner to edit in the Road Editor.
//
// The owner's call (2026-10-02): "on the east side of the runway we can put
// some dirt roads". East on the map, which is the runway's -x side in the
// world (`scene/mapping.ts`): the broad flat strip between the taxiway and
// the shore, where the hangar stands. A loop out round it and two tracks
// across, each laid the way `islanddraft` lays the quarry island's: a
// least-cost path over the ground, smoothed, its ends joined exactly to a
// node of the taxiway or a point on a track laid before it.
//
// Its own ids (`mt…`, marked `draft: 'marrow'`) are replaced on a re-run and
// everything else in the file is kept. Then `npm run roadsync`, and
// `npm run marrowdraft` so the field's props keep clear of the tracks.
//
// Usage:
//   npm run marrowtracks          # write docs/roads-edited.json
//   npm run marrowtracks -- --dry # report, write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const FILE = 'docs/roads-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_RUNWAY } = await server.ssrLoadModule('/src/game/city/plan.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const doc = JSON.parse(readFileSync(FILE, 'utf8'));
const kept = doc.roads.filter((r) => r.draft !== 'marrow');

// Everything here is in metres.
const [RA, RB] = PLAN_RUNWAY.map((p) => ({ x: p.x / M, z: p.z / M }));
const RL = Math.hypot(RB.x - RA.x, RB.z - RA.z);
/** Toward the map's east: the runway's normal on its -x side. */
const EAST = { x: -(RB.z - RA.z) / RL, z: (RB.x - RA.x) / RL };
/** A point `s` of the way up the runway from its south end and `d` metres east of it. */
const field = (s, d) => ({ x: Math.round(RA.x + (RB.x - RA.x) * s + EAST.x * d), z: Math.round(RA.z + (RB.z - RA.z) * s + EAST.z * d) });
const ground = (x, z) => groundAt(city.terrain, x * M, z * M) / M;
const wet = (x, z) => inWater(city, x * M, z * M);
const nodes = city.nodes.map((n) => ({ x: n.pos.x / M, z: n.pos.z / M }));
const segDist = (x, z, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * ux + (z - a.z) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a.x + ux * t - x, a.z + uz * t - z);
};
// The roads in the way, less this tool's own last draft: once synced, a
// re-run would otherwise keep clear of the tracks it is replacing.
const ownLines = doc.roads.filter((r) => r.draft === 'marrow').map((r) => r.points.map(([x, z]) => ({ x, z })));
const ownDraft = (a, b) => {
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  return ownLines.some((line) => line.slice(1).some((q, i) => segDist(mid.x, mid.z, line[i], q) < 3));
};
const segs = city.roads
  .map((r) => ({ a: nodes[r.a], b: nodes[r.b], half: r.width / 2 / M, road: r }))
  .filter((s) => !(s.road.surface === 'dirt' && ownDraft(s.a, s.b)));


/**
 * The nearest point on a road that passes `test`: where a track joins. Its
 * nearest node when one is close, so the join is a junction the graph already
 * has; otherwise the point on the road itself, which `roadsync`'s stitch
 * splits the road at.
 */
function joinNear(p, test) {
  let node = null, nd = Infinity, onRoad = null, od = Infinity;
  for (const r of city.roads) {
    if (!test(r)) continue;
    const a = nodes[r.a], b = nodes[r.b];
    for (const n of [a, b]) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < nd) [nd, node] = [d, n];
    }
    const ux = b.x - a.x, uz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
    const q = { x: a.x + ux * t, z: a.z + uz * t };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < od) [od, onRoad] = [d, q];
  }
  if (od > 200) throw new Error(`no road to join within 200 m of ${p.x},${p.z}`);
  const at = nd < od + 40 ? node : onRoad;
  return { x: Math.round(at.x), z: Math.round(at.z) };
}
/** The taxiways and the runway: Marrow Field's own dirt. */
const taxiway = (r) => r.surface === 'dirt' && r.class === 'boulevard';

// ---- The tracks ------------------------------------------------------------------

/**
 * Where each track starts, goes through and ends. An end is a join: a node
 * on the taxiway, or (`{ track, near }`) a point on a track laid before it,
 * as a T. The vias are only ground to pass over.
 */
const tracks = () => [
  {
    // The loop: off the taxiway near the south end, out across the east
    // side behind the hangar towards the shore, and back onto the taxiway
    // near the north end.
    id: 'mt1',
    from: joinNear(field(0.12, 110), taxiway),
    via: [field(0.2, 380), field(0.42, 450), field(0.62, 420), field(0.8, 300)],
    to: joinNear(field(0.9, 100), taxiway),
  },
  {
    // Across, south of the hangar.
    id: 'mt2',
    from: joinNear(field(0.38, 100), taxiway),
    via: [],
    to: { track: 'mt1', near: field(0.36, 440) },
  },
  {
    // And across north of it.
    id: 'mt3',
    from: joinNear(field(0.66, 100), taxiway),
    via: [field(0.68, 260)],
    to: { track: 'mt1', near: field(0.7, 400) },
  },
];

// ---- Laying one leg ----------------------------------------------------------------

const CELL = 10;
/** How much a climb costs against distance: a 10% grade doubles a step's cost. */
const GRADE_COST = 100;
/** Back from the water, and out of bounds nearer than this. */
const SHORE_SOFT = 60, SHORE_HARD = 30;
/** Clear of other roads except near the ends. */
const ROAD_CLEAR = 30, END_FREE = 60;

const shoreCache = new Map();
function shore(x, z) {
  const k = `${x},${z}`;
  if (shoreCache.has(k)) return shoreCache.get(k);
  let d = Infinity;
  for (let r = 10; r <= SHORE_SOFT && d === Infinity; r += 10)
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      if (wet(x + Math.sin(t) * r, z + Math.cos(t) * r)) { d = r; break; }
    }
  shoreCache.set(k, d);
  return d;
}
const nearSegs = (x, z, r) => segs.filter((s) => segDist(x, z, s.a, s.b) - s.half < r);

/** A least-cost path from `a` to `b` over the grid, avoiding `own` (the track's earlier legs) only at its ends. */
function leg(a, b, ends) {
  const minX = Math.min(a.x, b.x) - 600, maxX = Math.max(a.x, b.x) + 600;
  const minZ = Math.min(a.z, b.z) - 600, maxZ = Math.max(a.z, b.z) + 600;
  const W = Math.ceil((maxX - minX) / CELL) + 1, H = Math.ceil((maxZ - minZ) / CELL) + 1;
  const ix = (x) => Math.round((x - minX) / CELL), iz = (z) => Math.round((z - minZ) / CELL);
  const wx = (i) => minX + i * CELL, wz = (j) => minZ + j * CELL;
  const blocked = new Uint8Array(W * H), hcache = new Float32Array(W * H).fill(NaN);
  const h = (i, j) => {
    const k = j * W + i;
    if (Number.isNaN(hcache[k])) hcache[k] = ground(wx(i), wz(j));
    return hcache[k];
  };
  const free = (x, z) => ends.some((e) => Math.hypot(e.x - x, e.z - z) < END_FREE);
  const penalty = (i, j) => {
    const k = j * W + i;
    if (blocked[k] === 1) return Infinity;
    if (blocked[k] === 2) return 0;
    const x = wx(i), z = wz(j);
    let p = 0;
    if (wet(x, z)) p = Infinity;
    else if (!free(x, z)) {
      const s = shore(x, z);
      if (s <= SHORE_HARD) p = Infinity;
      else if (s < SHORE_SOFT) p = (SHORE_SOFT - s) * 2;
      if (p !== Infinity && nearSegs(x, z, ROAD_CLEAR).length) p = Infinity;
    }
    blocked[k] = p === Infinity ? 1 : p === 0 ? 2 : 3;
    return p;
  };
  const g = new Float64Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
  const s = iz(a.z) * W + ix(a.x), t = iz(b.z) * W + ix(b.x);
  g[s] = 0;
  // A binary heap on f = g + distance to go.
  const heap = [[0, s]];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  const ti = ix(b.x), tj = iz(b.z);
  while (heap.length) {
    const [, k] = pop();
    if (k === t) break;
    const i = k % W, j = (k - i) / W;
    for (const [di, dj] of STEPS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const p = penalty(ni, nj);
      if (p === Infinity) continue;
      const len = Math.hypot(di, dj) * CELL;
      const grade = (h(ni, nj) - h(i, j)) / len;
      const cost = len * (1 + GRADE_COST * grade * grade) + p * len / CELL;
      const nk = nj * W + ni;
      if (g[k] + cost < g[nk]) {
        g[nk] = g[k] + cost;
        from[nk] = k;
        push(g[nk] + Math.hypot(ni - ti, nj - tj) * CELL, nk);
      }
    }
  }
  if (from[t] === -1) throw new Error(`no way from ${a.x},${a.z} to ${b.x},${b.z}`);
  const out = [];
  for (let k = t; k !== -1; k = from[k]) out.push({ x: wx(k % W), z: wz(Math.floor(k / W)) });
  out.reverse();
  out[0] = { ...a };
  out[out.length - 1] = { ...b };
  return out;
}

/** Corners rounded off (Chaikin), the ends kept where they are. */
function smooth(line, passes = 3) {
  let p = line;
  for (let n = 0; n < passes; n++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
/** Thinned to a point every `step` metres along it, the ends exact. */
function thin(line, step) {
  const out = [line[0]];
  let carry = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    let t = step - carry;
    while (t < l) {
      out.push({ x: a.x + ((b.x - a.x) * t) / l, z: a.z + ((b.z - a.z) * t) / l });
      t += step;
    }
    carry = (carry + l) % step;
  }
  const last = line[line.length - 1];
  if (Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].z - last.z) < step / 3) out.pop();
  out.push(last);
  return out.map((p) => ({ x: Math.round(p.x), z: Math.round(p.z) }));
}
const lengthOf = (line) => line.slice(1).reduce((s, b, i) => s + Math.hypot(b.x - line[i].x, b.z - line[i].z), 0);
function steepest(line) {
  let worst = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t + 10 <= l; t += 10) {
      const p = { x: a.x + ((b.x - a.x) * t) / l, z: a.z + ((b.z - a.z) * t) / l };
      const q = { x: a.x + ((b.x - a.x) * (t + 10)) / l, z: a.z + ((b.z - a.z) * (t + 10)) / l };
      worst = Math.max(worst, Math.abs(ground(q.x, q.z) - ground(p.x, p.z)) / 10);
    }
  }
  return worst;
}

// ---- Laying them -------------------------------------------------------------------

/** A point every 40 m: at the drawn roads' usual 80 a track's bends come out sharp enough to draw as two strips. */
const SPACING = 40;
const laid = new Map();
/** A point on a track already laid, a few points in from its ends, nearest `near`: where a T meets it. */
function onTrack(id, near) {
  const host = laid.get(id);
  const inner = host.slice(2, -2);
  return inner.reduce((best, p) => (Math.hypot(p.x - near.x, p.z - near.z) < Math.hypot(best.x - near.x, best.z - near.z) ? p : best), inner[0]);
}
for (const track of tracks()) {
  const to = track.to.track ? onTrack(track.to.track, track.to.near) : track.to;
  const stops = [track.from, ...track.via, to];
  let path = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const part = leg(stops[i], stops[i + 1], [track.from, to]);
    path = path.length ? [...path, ...part.slice(1)] : part;
  }
  const line = thin(smooth(path, 6), SPACING);
  laid.set(track.id, line);
  // Later tracks keep clear of this one as they do of any road.
  for (let i = 0; i < line.length - 1; i++) segs.push({ a: line[i], b: line[i + 1], half: 2.5 });
  console.log(`${track.id}: ${Math.round(lengthOf(line))} m, ${line.length} points, steepest ${(steepest(line) * 100).toFixed(0)}%, from ${track.from.x},${track.from.z} to ${to.x},${to.z}`);
}

if (!DRY) {
  const drafted = [...laid].map(([id, line]) => ({
    bridge: false,
    deadEnd: false,
    district: 'park',
    draft: 'marrow',
    area: 0,
    id,
    isNew: true,
    kind: 'street',
    points: line.map((p) => [p.x, p.z]),
    surface: 'dirt',
  }));
  writeFileSync(FILE, JSON.stringify({ ...doc, roads: [...kept, ...drafted], savedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`wrote ${FILE}: ${drafted.length} tracks, ${kept.length} roads kept`);
}
