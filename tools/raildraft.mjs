// Draft the rest of the railway round the freeway loop (#514), as a proposal.
//
// Industrial's stretch (`rail1`, `worksdraft`) is 1.8 km of main line 35 m
// off the freeway on the inside of the loop. This drafts the other 13 km the
// same way - a road with surface `rail` - so the owner has a line to judge
// the open questions against (crossings, tunnels, which side), rather than
// answering them in the abstract.
//
// How it finds the line: the loop is sampled every 10 m, and at each sample a
// signed offset from the freeway's centre (inside positive) is tested for
// what a track cannot go through - buildings, props and set pieces, paved
// yards and drives, jumps, the ramps, a road running alongside, the deck's
// pillars - and for what it can but at a price: water (a bridge) and a
// cross-fall over 8% (a cutting). A shortest path over (sample, offset) then
// picks the cheapest line, moving at most 2.5 m sideways per 10 m, and
// crossing to the other side of the freeway only where the freeway is in a
// tunnel (over it) or on a deck high enough to pass under.
//
// It starts at `rail1`'s east end and finishes at its west end, so the two
// make one loop, and splits what it draws into one road per area (`rail2`,
// `rail3`, ...) so each can be kept or dropped on its own. It never moves or
// alters a drawn road or a props file: it adds roads with its own ids to
// docs/roads-edited.json, and a re-run replaces only those. Then `npm run
// roadsync`.
//
// Usage:
//   npm run raildraft            # write docs/roads-edited.json
//   npm run raildraft -- --dry   # report, write nothing
//   npm run raildraft -- --json out.json   # also the line and its checks
//   npm run raildraft -- --profile         # the offset it holds round the loop
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const flag = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const FILE = 'docs/roads-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_DISTRICTS, PLAN_PLACES, inArea, planDistrictAt } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { hitsSetPiece } = await server.ssrLoadModule('/src/game/city/setpieces.ts');
const { FREEWAY_LOOP } = await server.ssrLoadModule('/src/game/city/freeway.ts');
const { AUTHORED_ROADS } = await server.ssrLoadModule('/src/game/city/roads.ts');
/** Ours: `rail2` and up. `rail1` is Industrial's, drafted by `worksdraft`. */
const mine = (id) => /^rail\d+$/.test(id) && id !== 'rail1';
// Measured on the city without a previous draft, so a re-run draws the same
// line: a synced draft has graded its own ground and taken out pillars.
for (let i = AUTHORED_ROADS.length - 1; i >= 0; i--) if (mine(AUTHORED_ROADS[i].id)) AUTHORED_ROADS.splice(i, 1);
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

// ---- Measuring ------------------------------------------------------------------

const node = (i) => ({ x: city.nodes[i].pos.x / M, z: city.nodes[i].pos.z / M, y: city.nodes[i].y / M, level: city.nodes[i].level });
const ground = (p) => groundAt(city.terrain, p.x * M, p.z * M) / M;
const wet = (p) => inWater(city, p.x * M, p.z * M);
const segT = (p, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  return Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
};
const segDist = (p, a, b) => {
  const t = segT(p, a, b);
  return Math.hypot(a.x + (b.x - a.x) * t - p.x, a.z + (b.z - a.z) * t - p.z);
};
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};

const NAMES = { 'midtown:0': 'Midtown south-west', 'midtown:1': 'Midtown south', 'midtown:2': 'Midtown north', 'park:0': 'Highmoor Park', 'park:1': 'Tidewater Park' };
/** The area a point is in, by the names `docs/map-areas.md` uses. */
const areaAt = (p) => {
  const w = { x: p.x * M, z: p.z * M };
  for (const pl of PLAN_PLACES) if (Math.hypot(w.x - pl.at.x, w.z - pl.at.z) < pl.radius) return pl.name;
  const idx = {};
  for (const a of PLAN_DISTRICTS) {
    const i = (idx[a.kind] = (idx[a.kind] ?? -1) + 1);
    if (inArea(a.poly, w)) return NAMES[`${a.kind}:${i}`] ?? `${a.kind[0].toUpperCase()}${a.kind.slice(1)}`;
  }
  return 'country';
};

// The loop as drawn, in metres, sampled every 10 m.
const loop = FREEWAY_LOOP.map((p) => ({ x: p.x / M, z: p.z / M }));
const STEP = 10;
const dense = [];
let total = 0;
for (let i = 0; i < loop.length; i++) {
  const a = loop[i], b = loop[(i + 1) % loop.length];
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.round(l / STEP));
  for (let k = 0; k < n; k++) {
    const t = k / n;
    dense.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s: total + l * t, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l });
  }
  total += l;
}
// Inside of the loop is to the left of its drawn direction when it runs anticlockwise.
let area2 = 0;
for (let i = 0; i < loop.length; i++) area2 += loop[i].x * loop[(i + 1) % loop.length].z - loop[(i + 1) % loop.length].x * loop[i].z;
const INSIDE = area2 > 0 ? 1 : -1;
const at = (p, o) => ({ x: p.x - p.tz * o * INSIDE, z: p.z + p.tx * o * INSIDE });

// The freeway as built.
const inter = city.roads.filter((r) => r.class === 'interstate').map((r) => ({ a: node(r.a), b: node(r.b) }));
const ramps = city.roads.filter((r) => r.class === 'ramp').map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M }));
const streets = city.roads
  .filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && r.surface !== 'rail')
  .filter((r) => city.nodes[r.a].level === 'surface' && city.nodes[r.b].level === 'surface')
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, r }));
for (const p of dense) {
  let best = null, bd = Infinity;
  for (const seg of inter) {
    const d = segDist(p, seg.a, seg.b);
    if (d < bd) { bd = d; best = seg; }
  }
  const t = segT(p, best.a, best.b);
  const y = best.a.y + (best.b.y - best.a.y) * t;
  p.g = ground(p);
  p.headroom = y - p.g;
  p.fw = best.a.level === 'tunnel' || best.b.level === 'tunnel' || p.headroom < -3 ? 'tunnel' : wet(p) ? 'water' : p.headroom > 5 ? 'viaduct' : 'low deck';
  p.area = areaAt(p);
}

// What a track keeps clear of, from its centre line: half its 10 m bed and a
// margin. The path is picked with a wider one than the line is checked with,
// because it only looks every 10 m and a corner of a house can fall between.
let CLEAR = 11;
const CELL = 100;
const bIndex = new Map();
for (const b of city.buildings) {
  const f = { minX: b.footprint.minX / M, maxX: b.footprint.maxX / M, minZ: b.footprint.minZ / M, maxZ: b.footprint.maxZ / M };
  for (let x = Math.floor(f.minX / CELL); x <= Math.floor(f.maxX / CELL); x++)
    for (let z = Math.floor(f.minZ / CELL); z <= Math.floor(f.maxZ / CELL); z++) {
      const k = `${x},${z}`;
      if (!bIndex.has(k)) bIndex.set(k, []);
      bIndex.get(k).push(f);
    }
}
const nearBuilding = (p) => {
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      for (const b of bIndex.get(`${Math.floor(p.x / CELL) + dx},${Math.floor(p.z / CELL) + dz}`) ?? [])
        if (p.x > b.minX - CLEAR && p.x < b.maxX + CLEAR && p.z > b.minZ - CLEAR && p.z < b.maxZ + CLEAR) return true;
  return false;
};
const paved = [...city.aprons, ...city.drives, ...city.pavements].map((a) => a.outline.map((q) => ({ x: q.x / M, z: q.z / M })));
const pillars = city.pillars.map((p) => ({ x: p.at.x / M, z: p.at.z / M }));
const jumps = city.jumps.map((j) => ({ x: j.at.x / M, z: j.at.z / M }));

/** Why a track cannot run through `q`, or null. `h0` is the freeway's ground beside it. */
function blocked(q, tx, tz, h0, o) {
  if (nearBuilding(q)) return 'building';
  if (hitsSetPiece(city.setPieces, q.x * M, q.z * M, -Infinity, CLEAR * M, Infinity)) return 'prop';
  if (paved.some((poly) => inPoly(q, poly))) return 'paved';
  if (jumps.some((j) => Math.hypot(j.x - q.x, j.z - q.z) < 20)) return 'jump';
  if (ramps.some((r) => segDist(q, r.a, r.b) < r.half + CLEAR)) return 'ramp';
  // `pillarsFor` leaves out a pillar within its own clearance of a road's kerb,
  // so a track that came that close would take a pillar out from under the deck.
  if (pillars.some((c) => Math.hypot(c.x - q.x, c.z - q.z) < 8)) return 'pillar';
  // A road alongside: the track would share its carriageway. Crossing one is a level crossing, and allowed.
  for (const r of streets) {
    if (segDist(q, r.a, r.b) > r.half + 5) continue;
    const l = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z) || 1;
    if (Math.abs(((r.b.x - r.a.x) * tx + (r.b.z - r.a.z) * tz) / l) > 0.7) return 'road';
  }
  if (wet(q)) return 'water';
  if (Math.abs(o) >= 20 && Math.abs(ground(q) - h0) / Math.abs(o) > 0.08) return 'fall';
  return null;
}
const COST = { building: 1000, prop: 1000, paved: 1000, jump: 1000, ramp: 1000, pillar: 1000, road: 400, water: 40, fall: 4 };

// ---- The line ------------------------------------------------------------------

// Offsets from the freeway's centre, inside positive. Within 20 m of it is
// only for crossing over a tunnel or under a deck high enough to pass beneath.
const OFFS = [];
for (let o = -50; o <= 50; o += 2.5) OFFS.push(o);
const crossable = (p) => p.fw === 'tunnel' || (p.fw === 'viaduct' && p.headroom > 8);

// Where `rail1` ends, as samples and offsets on the loop.
const railPts = JSON.parse(readFileSync(FILE, 'utf8')).roads.find((r) => r.id === 'rail1').points.map(([x, z]) => ({ x, z }));
const nearestSample = (q) => {
  let bi = 0, bd = Infinity;
  dense.forEach((p, i) => {
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < bd) { bd = d; bi = i; }
  });
  const p = dense[bi];
  return { i: bi, o: ((q.x - p.x) * -p.tz + (q.z - p.z) * p.tx) * INSIDE };
};
const west = nearestSample(railPts[0]);
const east = nearestSample(railPts[railPts.length - 1]);
// The free run: from rail1's east end round to its west end.
const N = dense.length;
const run = [];
for (let k = 0, i = east.i; ; k++, i = (i + 1) % N) {
  run.push(dense[i]);
  if (i === west.i) break;
}
console.log(`rail1: west end at s=${Math.round(dense[west.i].s)} (${west.o.toFixed(0)} m), east end at s=${Math.round(dense[east.i].s)} (${east.o.toFixed(0)} m); free run ${run.length * STEP} m`);

const cell = run.map((p) =>
  OFFS.map((o) => {
    if (Math.abs(o) < 20 && !crossable(p)) return { cost: Infinity, why: 'freeway' };
    const why = blocked(at(p, o), p.tx, p.tz, p.g, o);
    return { cost: (why ? COST[why] : 0) + Math.abs(Math.abs(o) - 35) * 0.04, why };
  }),
);
const snapOff = (o) => OFFS.reduce((bi, v, i) => (Math.abs(v - o) < Math.abs(OFFS[bi] - o) ? i : bi), 0);
const startJ = snapOff(east.o), endJ = snapOff(west.o);
const best = cell.map(() => OFFS.map(() => Infinity));
const from = cell.map(() => OFFS.map(() => -1));
best[0][startJ] = 0;
const SIDEWAYS = 0.6; // a little for every bend, so the line stays straight where it can
for (let i = 1; i < run.length; i++)
  for (let j = 0; j < OFFS.length; j++) {
    if (cell[i][j].cost === Infinity) continue;
    for (const dj of [-1, 0, 1]) {
      const k = j + dj;
      if (k < 0 || k >= OFFS.length || best[i - 1][k] === Infinity) continue;
      const c = best[i - 1][k] + cell[i][j].cost + (dj ? SIDEWAYS : 0);
      if (c < best[i][j]) { best[i][j] = c; from[i][j] = k; }
    }
  }
if (best[run.length - 1][endJ] === Infinity) throw new Error('no line reaches rail1 west end');
const pick = new Array(run.length);
pick[run.length - 1] = endJ;
for (let i = run.length - 1; i > 0; i--) pick[i - 1] = from[i][pick[i]];

// The line as the path picked it: a point every 20 m, and every one where it
// moves sideways, so a gap it threaded is not cut across by a straighter chord.
// The ends land exactly on rail1's so the two share a vertex.
const off = pick.map((j) => OFFS[j]);
let line = run.map((p, i) => ({ ...at(p, off[i]), p, o: off[i] }));
// `--profile`: the offset the path holds, as runs of offset@where x samples.
if (process.argv.includes('--profile')) { let r = []; off.forEach((o, i) => { if (!r.length || r[r.length - 1][0] !== o) r.push([o, i, 1]); else r[r.length - 1][2]++; }); console.log(r.map(([o, i, n]) => `${o}@${Math.round(run[i].s)}x${n}`).join(" ")); }
line = line.filter((_, i) => i % 2 === 0 || i === line.length - 1 || off[i] !== off[i - 1] || off[i] !== off[i + 1]);
line[0] = { ...line[0], x: railPts[railPts.length - 1].x, z: railPts[railPts.length - 1].z };
line[line.length - 1] = { ...line[line.length - 1], x: railPts[0].x, z: railPts[0].z };
// Then only the points that bend it, to within a metre (Douglas-Peucker): every
// vertex is a node, and a node every 20 m on a line nobody turns off is
// several hundred roads for the sim to search for nothing.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], a, b);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}
line = simplify(line, 1);
line = line.map((q) => ({ ...q, x: Math.round(q.x), z: Math.round(q.z) }));

CLEAR = 8;

// ---- Checking it ---------------------------------------------------------------

// The finished line, walked every 5 m, against the same tests.
const walked = [];
let len = 0;
for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i];
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.round(l / 5));
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    // Against the freeway beside it, not the one at the segment's start: a
    // segment can be a kilometre long now.
    const { i: near, o } = nearestSample(q);
    const p = dense[near];
    walked.push({ ...q, s: len + l * t, why: blocked(q, (b.x - a.x) / l, (b.z - a.z) / l, p.g, o), fw: p.fw, area: areaAt(q), g: ground(q) });
  }
  len += l;
}
// Runs of each problem, as where and how long.
const runs = (test) => {
  const out = [];
  for (const w of walked) {
    if (!test(w)) continue;
    const last = out[out.length - 1];
    if (last && w.s - last.to <= 10) last.to = w.s + 5;
    else out.push({ from: w.s, to: w.s + 5, x: Math.round(w.x), z: Math.round(w.z), why: w.why, area: w.area });
  }
  return out;
};
const water = runs((w) => w.why === 'water');
const hard = runs((w) => w.why && w.why !== 'water' && w.why !== 'fall');
const cuts = runs((w) => w.why === 'fall');
const overTunnel = runs((w) => w.fw === 'tunnel');

// Where it crosses a street: a level crossing each, today.
const crossings = [];
for (let i = 1; i < line.length; i++) {
  const a = line[i - 1], b = line[i];
  for (const r of streets) {
    const d = (b.x - a.x) * (r.b.z - r.a.z) - (b.z - a.z) * (r.b.x - r.a.x);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((r.a.x - a.x) * (r.b.z - r.a.z) - (r.a.z - a.z) * (r.b.x - r.a.x)) / d;
    const u = ((r.a.x - a.x) * (b.z - a.z) - (r.a.z - a.z) * (b.x - a.x)) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (crossings.some((c) => Math.hypot(c.x - q.x, c.z - q.z) < 15)) continue; // one road split at a node
    const l1 = Math.hypot(b.x - a.x, b.z - a.z), l2 = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z);
    const angle = Math.round((Math.acos(Math.min(1, Math.abs(((b.x - a.x) * (r.b.x - r.a.x) + (b.z - a.z) * (r.b.z - r.a.z)) / (l1 * l2)))) * 180) / Math.PI);
    crossings.push({ x: Math.round(q.x), z: Math.round(q.z), area: areaAt(q), class: r.r.class, surface: r.r.surface, angle, g: ground(q) });
  }
}

// Grades along the line, on the ground before it is graded: cut-and-fill
// caps an authored road's grade, so a steep stretch here is a cutting or a bank.
const grades = [];
for (let i = 20; i < walked.length; i += 4) {
  const a = walked[i - 20], b = walked[i];
  grades.push({ s: b.s, g: Math.abs(b.g - a.g) / (b.s - a.s), x: Math.round(b.x), z: Math.round(b.z), area: b.area });
}
const steep = grades.filter((g) => g.g > 0.05);

const km = (m) => (m / 1000).toFixed(2);
console.log(`line ${km(len)} km, ${line.length} points; with rail1 the loop is ${km(len + 1775)} km`);
const byArea = {};
for (const w of walked) byArea[w.area] = (byArea[w.area] ?? 0) + 5;
console.log('by area:', Object.entries(byArea).map(([a, l]) => `${a} ${km(l)} km`).join(', '));
const sideLen = { inside: 0, outside: 0 };
for (let i = 1; i < line.length; i++) sideLen[line[i].o > 0 ? 'inside' : 'outside'] += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
const sides = line.filter((q) => Math.abs(q.o) >= 20).map((q) => ({ side: Math.sign(q.o), q }));
const switches = sides.slice(1).filter((x, i) => x.side !== sides[i].side).map((x) => `${x.q.x},${x.q.z} over ${x.q.p.fw === 'tunnel' ? 'the tunnel' : 'under the deck'}`);
let under = 0;
for (let i = 1; i < line.length; i++) if (Math.abs(line[i].o) < 20 && line[i].p.fw !== 'tunnel') under += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
console.log(`inside the loop ${km(sideLen.inside)} km, outside ${km(sideLen.outside)} km; ${km(under)} km under the deck`);
console.log(`crosses the freeway ${switches.length} times: ${switches.join('; ')}`);
console.log(`over the freeway's tunnels: ${overTunnel.map((r) => `${Math.round(r.to - r.from)} m at ${r.x},${r.z} (${r.area})`).join('; ')}`);
console.log(`water to bridge: ${water.length ? water.map((r) => `${Math.round(r.to - r.from)} m at ${r.x},${r.z} (${r.area})`).join('; ') : 'none'}`);
console.log(`through something (would need it moved): ${hard.length ? hard.map((r) => `${r.why} ${Math.round(r.to - r.from)} m at ${r.x},${r.z} (${r.area})`).join('; ') : 'nothing'}`);
console.log(`cross-fall over 8% (a cutting or a bank): ${Math.round(cuts.reduce((s, r) => s + r.to - r.from, 0))} m in ${cuts.length} places`);
console.log(`ground grade along it: median ${(grades.map((g) => g.g).sort((a, b) => a - b)[grades.length >> 1] * 100).toFixed(1)}%, over 5% for ${steep.length * 20} m, steepest ${(Math.max(...grades.map((g) => g.g)) * 100).toFixed(0)}% at ${(() => { const g = grades.reduce((m, g) => (g.g > m.g ? g : m)); return `${g.x},${g.z} (${g.area})`; })()}`);
console.log(`level crossings: ${crossings.length}`);
const cByArea = {};
for (const c of crossings) cByArea[c.area] = (cByArea[c.area] ?? 0) + 1;
console.log('  by area:', Object.entries(cByArea).map(([a, n]) => `${a} ${n}`).join(', '));
for (const c of crossings) console.log(`  ${c.x},${c.z} ${c.area} ${c.class}${c.surface !== 'asphalt' ? ` (${c.surface})` : ''} at ${c.angle} deg`);

// ---- Writing it ----------------------------------------------------------------

// One road per area, so each can be kept or dropped on its own; and a water
// crossing as a road of its own, from two points back on one bank to two on
// the other. A drawn street that meets water is cut at the bank: only a
// boulevard is bridged (`clip` in generate.ts), so the crossing is drawn as one.
const wetSeg = line.map((a, i) => {
  const b = line[i + 1];
  if (!b) return false;
  for (let t = 0.1; t < 1; t += 0.2) if (wet({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return true;
  return false;
});
const onBridge = line.map((_, i) => wetSeg.slice(Math.max(0, i - 3), i + 2).some(Boolean));
const pieces = [];
for (const [i, q] of line.entries()) {
  const a = onBridge[i] ? 'bridge' : areaAt(q);
  const last = pieces[pieces.length - 1];
  if (last && last.area === a) last.pts.push(q);
  else {
    // A new area starts at the last point of the one before, so the two join.
    if (last) last.pts.push(q);
    pieces.push({ area: a, pts: [q] });
  }
}
// Fold a piece too short to be worth its own id into the one before it.
for (let i = pieces.length - 1; i > 0; i--) {
  const l = pieces[i].pts.slice(1).reduce((s, p, k) => s + Math.hypot(p.x - pieces[i].pts[k].x, p.z - pieces[i].pts[k].z), 0);
  if (l < 300 && pieces[i].area !== 'bridge' && pieces[i - 1].area !== 'bridge') { pieces[i - 1].pts.push(...pieces[i].pts.slice(1)); pieces.splice(i, 1); }
}
const roads = pieces.map((piece, i) => {
  const pts = piece.pts.filter((p, k) => k === 0 || p.x !== piece.pts[k - 1].x || p.z !== piece.pts[k - 1].z);
  const mid = pts[pts.length >> 1];
  const district = planDistrictAt({ x: mid.x * M, z: mid.z * M }) ?? 'industrial';
  const kind = piece.area === 'bridge' ? 'boulevard' : 'street';
  return { id: `rail${i + 2}`, kind, district, bridge: false, surface: 'rail', points: pts.map((p) => [p.x, p.z]), isNew: true, draft: 'rail' };
});
for (const r of roads) {
  const l = r.points.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - r.points[k][0], p[1] - r.points[k][1]), 0);
  console.log(`${r.id}: ${km(l)} km, ${r.points.length} points, ${pieces[roads.indexOf(r)].area}`);
}

const jsonOut = flag('--json');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ line, roads, crossings, water, hard, cuts, overTunnel, steep }, null, 1));
if (!DRY) {
  const doc = JSON.parse(readFileSync(FILE, 'utf8'));
  doc.roads = [...doc.roads.filter((r) => !mine(r.id)), ...roads];
  writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${roads.length} roads to ${FILE}; now npm run roadsync`);
}
