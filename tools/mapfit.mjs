// Does the map fit what we have learned? (#363)
//
// A measured answer, question by question, to whether the authored map carries
// what the gameplay review and ADR-0011 changed: the reference game's pace, fast
// roads for fast cars, roadblocks on race routes, events per car, and pursuit
// geography. Everything is measured on the live network the game builds, with
// the game's own car physics, not on the plan's idea of it.
//
// The pace model is a speed profile, not a driver. At every vertex of a path the
// corner speed comes from the turn's radius and the car's grip, bounded by the
// road's width at a junction; between vertices the car accelerates on the
// game's own tapered curve (`ACCEL_TIME`) and brakes at `BRAKE_RATE`, looking
// ahead. Two versions of it bracket what a person can do:
//
//   physics - all the grip, the full width of the road
//   human   - half the grip, one side of the road
//
// The car is capable: about 11 g of grip, so almost any smooth road allows
// more than a person will take. What decides the human number is junction
// turns, which the width bounds, and how far apart they are, which decides how
// fast the car can get between them now that acceleration is gradual (#14).
//
// Usage:
//   npm run mapfit
//   npm run mapfit -- --json docs/research/mapfit.json   # also write the numbers
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');
const { CARS, STARTER_CAR } = await server.ssrLoadModule('/src/game/cars.ts');
const { planDistrictAt } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { FREEWAY_LOOP } = await server.ssrLoadModule('/src/game/city/freeway.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { slopeSpeed, slopePull } = await server.ssrLoadModule('/src/game/slope.ts');

const U = K.UNITS_PER_METRE;
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const jsonOut = flag('--json');

const world = new CityWorld(undefined, { traffic: false, police: false });
const city = world.city;
const out = {};
const log = (...a) => console.log(...a);
const km = (m) => (m / 1000).toFixed(1);
const pct = (f) => `${Math.round(f * 100)}%`;
const kmhOf = (mps) => Math.round(mps * 3.6);
const q = (v, p) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];

// ---------------------------------------------------------------- the car
/** A car's physics in metres and seconds, from its profile, as `drive()` sets it. */
function carModel(profile) {
  return {
    name: profile.name,
    top: (K.REFERENCE_TOP_SPEED * profile.topSpeed) / U,
    a0: (K.REFERENCE_TOP_SPEED / K.ACCEL_TIME) * profile.accel / U,
    grip: (K.LATERAL_GRIP * profile.grip) / U,
    brake: K.BRAKE_RATE / U,
  };
}
const starter = carModel(STARTER_CAR);
const fastestProfile = CARS.reduce((a, b) => (b.topSpeed > a.topSpeed ? b : a));
const fastest = carModel(fastestProfile);

const MODES = {
  physics: { grip: 1, width: 1 },
  human: { grip: 0.5, width: 0.5 },
};

// ------------------------------------------------------------ the network
const surface = (n) => city.nodes[n].level === 'surface';
const driveable = city.roads.filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && surface(r.a) && surface(r.b));
const adj = new Map();
for (const r of driveable) {
  for (const [from, to] of [[r.a, r.b], [r.b, r.a]]) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, road: r });
  }
}
const nodes = [...adj.keys()];
const P = (n) => city.nodes[n].pos;

const STEP_M = 5;
const SCALES = [10, 20, 40, 80, 160, 320];

/**
 * Resample a path to a point every `STEP_M` metres, each carrying the road's
 * width and surface. A hand-drawn road is a chain of short segments with small
 * kinks in it, and the corner speed has to be read off the road's shape at the
 * scale a driver sees it, not off each vertex.
 */
function resample(points, loop) {
  const res = [];
  const n = points.length;
  const segs = loop ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const k = Math.max(1, Math.round(len / STEP_M));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      res.push({ x, z, y: a.flat ? 0 : groundAt(city.terrain, x * U, z * U) / U, w: a.w, surface: a.surface, ds: len / k });
    }
  }
  if (!loop) {
    const e = points[n - 1];
    res.push({ ...e, y: e.flat ? 0 : groundAt(city.terrain, e.x * U, e.z * U) / U, ds: 0 });
  }
  // The grade along the direction of travel, over the same span the game
  // reads it (`SLOPE_SAMPLE` either side), for the hill's cap and its pull.
  const k = Math.max(1, Math.round(K.SLOPE_SAMPLE / U / STEP_M));
  for (let i = 0; i < res.length; i++) {
    let ia = i - k, ib = i + k;
    if (loop) { ia = (ia + res.length) % res.length; ib = ib % res.length; }
    else { ia = Math.max(0, ia); ib = Math.min(res.length - 1, ib); }
    const run = Math.max(1, Math.hypot(res[ib].x - res[ia].x, res[ib].z - res[ia].z));
    res[i].grade = (res[ib].y - res[ia].y) / run;
  }
  return res;
}

/**
 * The corner speed at every resampled point, in m/s.
 *
 * At each point and each scale d, the road's centreline bends away from the
 * chord between the points d either side of it by a sagitta s. A driver with
 * half-width h of room can go straight through any bend whose sagitta is under
 * h, and has to curve by the rest: over a chord of 2d that is a curvature of
 * 2(s - h) / d^2. The tightest of those over all scales is the corner. It is
 * one rule for a junction and a bend, and it is what stops a drawn road's
 * small kinks reading as corners.
 */
function corners(res, car, mode, loop) {
  const n = res.length;
  const grip = car.grip * mode.grip;
  const cap = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = res[i];
    const h = (p.w / 2) * mode.width;
    let kappa = 0;
    for (const d of SCALES) {
      const k = Math.round(d / STEP_M);
      let ia = i - k, ib = i + k;
      if (loop) { ia = (ia + n) % n; ib = ib % n; }
      else if (ia < 0 || ib >= n) continue;
      const a = res[ia], b = res[ib];
      const cx = b.x - a.x, cz = b.z - a.z;
      const chord = Math.hypot(cx, cz);
      if (chord < 1) continue;
      const sag = Math.abs((p.x - a.x) * cz - (p.z - a.z) * cx) / chord;
      const half = chord / 2;
      kappa = Math.max(kappa, (2 * Math.max(0, sag - h)) / (half * half));
    }
    const surfaceCap = p.surface === 'dirt' ? K.DIRT_SPEED_FRAC : p.surface === 'gravel' ? K.GRAVEL_SPEED_FRAC : 1;
    let v = car.top * surfaceCap * slopeSpeed(p.grade ?? 0);
    if (kappa > 0) {
      const r = 1 / kappa;
      v = Math.min(v, Math.sqrt(grip * r), r * K.TURN_RATE);
    }
    cap[i] = v;
  }
  return cap;
}

/**
 * Time and speeds along a path of points (metres). Forward pass on the tapered
 * acceleration, backward pass on braking, over the resampled points.
 */
function profile(points, car, mode, { flying = false, loop = false } = {}) {
  const res = resample(points, loop);
  const lim = corners(res, car, mode, loop);
  const m = res.length;
  const v = new Array(m);
  v[0] = flying ? lim[0] : 0;
  for (let i = 1; i < m; i++) {
    const u = v[i - 1];
    const a = car.a0 * Math.max(0, 1 - (u / car.top) ** 2) - slopePull(res[i - 1].grade ?? 0) / U;
    v[i] = Math.min(Math.sqrt(Math.max(0, u * u + 2 * a * res[i - 1].ds)), lim[i]);
  }
  if (loop) {
    // A second forward lap so the start is carried at speed, as on a real lap.
    v[0] = Math.min(lim[0], Math.sqrt(v[m - 1] ** 2 + 2 * car.a0 * res[m - 1].ds));
    for (let i = 1; i < m; i++) {
      const u = v[i - 1];
      const a = car.a0 * Math.max(0, 1 - (u / car.top) ** 2) - slopePull(res[i - 1].grade ?? 0) / U;
      v[i] = Math.min(Math.sqrt(Math.max(0, u * u + 2 * a * res[i - 1].ds)), lim[i]);
    }
  }
  for (let i = m - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * car.brake * res[i].ds));
  let t = 0, dist = 0, vmax = 0;
  for (let i = 0; i < m - 1; i++) {
    const avg = Math.max(0.5, (v[i] + v[i + 1]) / 2);
    t += res[i].ds / avg;
    dist += res[i].ds;
    vmax = Math.max(vmax, v[i]);
  }
  // Corners the car has to come under half its top for, per km.
  let slow = 0;
  for (let i = 1; i < m; i++) if (lim[i] < car.top * 0.5 && lim[i - 1] >= car.top * 0.5) slow++;
  return { length: dist, time: t, avg: dist / t, frac: dist / t / car.top, vmax, slowPerKm: slow / (dist / 1000) };
}

/** A node path as profile points (metres), with each vertex's road width and surface. */
function pathPoints(path) {
  const pts = [];
  for (let i = 0; i < path.length; i++) {
    const node = path[i].node;
    const road = path[i].road ?? path[i - 1]?.road ?? path[i + 1]?.road;
    const p = P(node);
    pts.push({ x: p.x / U, z: p.z / U, w: road.width / U, surface: road.surface });
  }
  return pts;
}

/** The driveable road nearest a point, by distance to its segment. */
function nearestRoad(p) {
  let best = null, bd = Infinity;
  for (const r of driveable) {
    const a = P(r.a), b = P(r.b);
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / Math.max(1, dx * dx + dz * dz)));
    const d = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// ---------------------------------------------------------- shortest paths
function dijkstra(from) {
  const dist = new Map([[from, 0]]);
  const back = new Map();
  const heap = [[0, from]];
  const push = (e) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        [heap[s], heap[i]] = [heap[i], heap[s]];
        i = s;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, n] = pop();
    if (d > dist.get(n)) continue;
    for (const { to, road } of adj.get(n) ?? []) {
      const nd = d + road.length / U;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        back.set(to, { node: n, road });
        push([nd, to]);
      }
    }
  }
  return { dist, back };
}
function pathTo(sp, to) {
  const path = [];
  let n = to;
  let road = null;
  while (n !== undefined) {
    path.push({ node: n, road });
    const b = sp.back.get(n);
    if (!b) break;
    road = b.road;
    n = b.node;
  }
  path.reverse();
  // Each entry already holds the road leaving it toward `to`; the last has
  // none, so it borrows the one it arrived on (for its width).
  if (path.length > 1) path[path.length - 1].road = path[path.length - 2].road;
  return path;
}

let seed = 0x363;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ================================================================ report
log('MAP FIT (#363)');
log(`starter: ${starter.name}, top ${kmhOf(starter.top)} km/h, grip ${(starter.grip / 9.81).toFixed(1)} g`);
log(`fastest: ${fastest.name}, top ${kmhOf(fastest.top)} km/h`);
log('');

// ---- inventory (question 7)
const byClass = {}, byDistrict = {};
let total = 0;
for (const r of driveable) {
  const l = r.length / U;
  total += l;
  byClass[r.class] = (byClass[r.class] ?? 0) + l;
  const d = planDistrictAt(P(r.a)) ?? 'periphery';
  byDistrict[d] = (byDistrict[d] ?? 0) + l;
}
log(`7. THE NETWORK: ${km(total)} km of surface road, ${nodes.length} nodes`);
for (const [c, l] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) log(`   ${c.padEnd(12)} ${km(l).padStart(6)} km  ${pct(l / total)}`);
log('   by plan district:');
for (const [c, l] of Object.entries(byDistrict).sort((a, b) => b[1] - a[1])) log(`   ${c.padEnd(12)} ${km(l).padStart(6)} km  ${pct(l / total)}`);
out.network = { totalKm: total / 1000, byClass, byDistrict };
log('');

// ---- widths (question 3)
const widths = {};
let wide = 0;
for (const r of driveable) {
  const w = Math.round(r.width / U);
  widths[w] = (widths[w] ?? 0) + r.length / U;
  if (r.width >= K.ROADBLOCK_MIN_WIDTH) wide += r.length / U;
}
log(`3. WIDTHS (kerb to kerb, by length); roadblocks need ${Math.round(K.ROADBLOCK_MIN_WIDTH / U)} m`);
for (const [w, l] of Object.entries(widths).sort((a, b) => a[0] - b[0])) log(`   ${String(w).padStart(3)} m  ${km(l).padStart(6)} km  ${pct(l / total)}`);
log(`   roadblock-eligible: ${pct(wide / total)} of the network`);
out.widths = { byMetre: widths, roadblockEligibleFrac: wide / total };
log('');

// ---- straights (question 2): runs of road the fastest car need not lift on
function chains() {
  const seen = new Set();
  const res = [];
  for (const r of driveable) {
    if (seen.has(r.id)) continue;
    // Walk out both ways through nodes of degree two.
    const walk = (start, road) => {
      const pts = [];
      let n = start, cur = road;
      for (;;) {
        seen.add(cur.id);
        const other = cur.a === n ? cur.b : cur.a;
        pts.push({ node: other, road: cur });
        const exits = (adj.get(other) ?? []).filter((e) => e.road.id !== cur.id);
        if (exits.length !== 1 || seen.has(exits[0].road.id)) break;
        n = other;
        cur = exits[0].road;
      }
      return pts;
    };
    const fwd = walk(r.a, r);
    const back = (adj.get(r.a) ?? []).filter((e) => e.road.id !== r.id);
    const bwd = back.length === 1 && !seen.has(back[0].road.id) ? walk(r.a, back[0].road) : [];
    const nodesOrder = [...bwd.reverse().map((p) => p.node), r.a, ...fwd.map((p) => p.node)];
    const roadsOrder = [...bwd.map((p) => p.road), ...fwd.map((p) => p.road)];
    res.push(nodesOrder.map((node, i) => ({ node, road: roadsOrder[Math.min(i, roadsOrder.length - 1)] })));
  }
  return res;
}
const allChains = chains();
let runs = [];
for (const ch of allChains) {
  const res = resample(pathPoints(ch), false);
  const lim = corners(res, fastest, MODES.human, false);
  // A run is a stretch the fastest car need not lift on.
  let run = 0;
  for (let i = 0; i < res.length; i++) {
    run += res[i].ds;
    if (lim[i] < fastest.top * 0.95 || i === res.length - 1) {
      runs.push(run);
      run = 0;
    }
  }
}
// How far each car needs to reach 90% and 95% of its top from rest.
function reachDistance(car, frac) {
  let v = 0, s = 0;
  while (v < car.top * frac && s < 20000) {
    const a = car.a0 * Math.max(0, 1 - (v / car.top) ** 2);
    const dt = 0.01;
    s += v * dt;
    v += a * dt;
  }
  return s;
}
runs.sort((a, b) => b - a);
log('2. RUNS a fast car can hold without lifting (human line), longest first:');
log(`   ${runs.slice(0, 8).map((r) => `${Math.round(r)} m`).join(', ')}`);
log(`   runs over 1 km: ${runs.filter((r) => r > 1000).length}; over 2 km: ${runs.filter((r) => r > 2000).length}`);
for (const car of [starter, fastest]) {
  log(`   ${car.name.padEnd(10)} needs ${Math.round(reachDistance(car, 0.9))} m to reach 90% of its top, ${Math.round(reachDistance(car, 0.95))} m for 95%`);
}
out.runs = { longest: runs.slice(0, 20), over1km: runs.filter((r) => r > 1000).length };
log('');

// The freeway loop, as authored (it is not built while CITY_FREEWAY is off).
const loopPts = FREEWAY_LOOP.map((p) => ({ x: p.x / U, z: p.z / U, w: 24, surface: 'asphalt', flat: true }));
log('2b. THE FREEWAY LOOP (authored, not built today), one flying lap:');
out.freeway = {};
for (const car of [starter, fastest]) {
  for (const [mode, m] of Object.entries(MODES)) {
    const p = profile(loopPts, car, m, { flying: true, loop: true });
    log(`   ${car.name.padEnd(10)} ${mode.padEnd(8)} ${km(p.length)} km in ${(p.time / 60).toFixed(2)} min, avg ${kmhOf(p.avg)} km/h (${pct(p.frac)} of its top), peak ${kmhOf(p.vmax)}`);
    out.freeway[`${car.name}-${mode}`] = p;
  }
}
// Where the loop runs, by plan district, and how close it comes to downtown's
// middle: the reference game's interstate runs through its downtown, under a
// deck, and "a covered freeway downtown" is only possible if the loop gets there.
const { planCentre } = await server.ssrLoadModule('/src/game/city/plan.ts');
const loopBy = {};
const dense = resample(loopPts, true);
for (const p of dense) {
  const d = planDistrictAt({ x: p.x * U, z: p.z * U }) ?? 'periphery';
  loopBy[d] = (loopBy[d] ?? 0) + p.ds;
}
const dc = planCentre('downtown');
const nearestDowntown = Math.min(...dense.map((p) => Math.hypot(p.x - dc.x / U, p.z - dc.z / U)));
log(`   the loop by district: ${Object.entries(loopBy).sort((a, b) => b[1] - a[1]).map(([d, l]) => `${d} ${km(l)} km`).join(', ')}`);
log(`   closest it comes to downtown's middle: ${km(nearestDowntown)} km`);
out.freewayByDistrict = loopBy;

// A railway beside the loop (docs/map-areas.md): is there a strip of land
// alongside it, 25-45 m out on either side, that a track could follow? Land,
// and a cross-fall under 8% from the loop's own ground, which is what a
// shelf a track could be cut into looks like. Measured every 5 m along the loop.
let railOk = 0, railRun = 0, railBest = 0;
for (let i = 0; i < dense.length; i++) {
  const p = dense[i], q2 = dense[(i + 1) % dense.length];
  const dx = q2.x - p.x, dz = q2.z - p.z, l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l, nz = dx / l;
  const h0 = groundAt(city.terrain, p.x * U, p.z * U) / U;
  let fits = false;
  for (const side of [1, -1]) {
    let ok = true;
    for (const off of [25, 35, 45]) {
      const x = (p.x + nx * off * side) * U, z = (p.z + nz * off * side) * U;
      if (inWater(city, x, z)) { ok = false; break; }
      const h = groundAt(city.terrain, x, z) / U;
      if (Math.abs(h - h0) / off > 0.08) { ok = false; break; }
    }
    if (ok) { fits = true; break; }
  }
  if (fits) { railOk += p.ds; railRun += p.ds; railBest = Math.max(railBest, railRun); } else railRun = 0;
}
log(`   room for a railway beside it: ${pct(railOk / dense.reduce((s2, p) => s2 + p.ds, 0))} of the loop, longest unbroken stretch ${km(railBest)} km`);
out.railwayBesideFreeway = { frac: railOk / 15000, longestKm: railBest / 1000 };
out.freewayToDowntownKm = nearestDowntown / 1000;
log('');

// ---- routes (questions 1 and 5)
log('1. PACE ALONG ROUTES (standing start, starter car). ADR-0011 target: human about 60% of top');
out.routes = {};
for (const route of city.routes) {
  // Width and surface from the road each point lies on.
  const pts = route.points.map((p) => {
    const road = nearestRoad(p);
    return { x: p.x / U, z: p.z / U, w: road.width / U, surface: road.surface };
  });
  const res = {};
  for (const [mode, m] of Object.entries(MODES)) res[mode] = profile(pts, starter, m, { loop: route.laps > 1 });
  log(`   ${route.name.padEnd(20)} ${km(res.physics.length)} km lap: physics ${pct(res.physics.frac)}, human ${pct(res.human.frac)} (${kmhOf(res.human.avg)} km/h)`);
  out.routes[route.name] = res;
}

const candidates = [];
for (let tries = 0; tries < 400 && candidates.length < 160; tries++) {
  const a = nodes[Math.floor(rand() * nodes.length)];
  const b = nodes[Math.floor(rand() * nodes.length)];
  const d = Math.hypot(P(a).x - P(b).x, P(a).z - P(b).z) / U;
  if (d < 1500 || d > 7000) continue;
  const sp = dijkstra(a);
  const L = sp.dist.get(b);
  if (!L || L < 2000 || L > 9000) continue;
  const path = pathTo(sp, b);
  if (path.length < 3) continue;
  const pts = pathPoints(path);
  const phys = profile(pts, starter, MODES.physics);
  const hum = profile(pts, starter, MODES.human);
  const wideLen = path.reduce((s, e) => s + (e.road && e.road.width >= K.ROADBLOCK_MIN_WIDTH ? e.road.length / U : 0), 0);
  candidates.push({ from: a, to: b, km: L / 1000, phys: phys.frac, human: hum.frac, humanKmh: kmhOf(hum.avg), wide: wideLen / L, slowPerKm: hum.slowPerKm, roads: new Set(path.map((e) => e.road?.id)) });
}
const H = candidates.map((c) => c.human), Ph = candidates.map((c) => c.phys);
log(`   ${candidates.length} candidate routes of 2-9 km (shortest paths between random points):`);
log(`   human: median ${pct(q(H, 0.5))}, p10 ${pct(q(H, 0.1))}, p90 ${pct(q(H, 0.9))};  physics: median ${pct(q(Ph, 0.5))}`);
log(`   at or above the 60% target (human): ${candidates.filter((c) => c.human >= 0.6).length} of ${candidates.length}`);
log(`   slow corners (under half of top, human) per km: median ${q(candidates.map((c) => c.slowPerKm), 0.5).toFixed(1)}`);
log(`   share of a route wide enough for a roadblock: median ${pct(q(candidates.map((c) => c.wide), 0.5))}`);
out.candidates = candidates.map(({ roads, ...c }) => c);

// Question 5: how many distinct routes that meet the target, overlapping little?
const good = candidates.filter((c) => c.human >= 0.6).sort((a, b) => b.human - a.human);
const chosen = [];
for (const c of good) {
  const overlaps = chosen.some((o) => {
    let shared = 0;
    for (const r of c.roads) if (o.roads.has(r)) shared++;
    return shared / c.roads.size > 0.5;
  });
  if (!overlaps) chosen.push(c);
}
log(`5. DISTINCT ROUTES meeting the target, overlapping by at most half: ${chosen.length}`);
log(`   (events per car wants about three per car, ${CARS.length * 3} in all, sharing routes)`);
out.distinctTargetRoutes = chosen.length;
log('');

// ---- crossings (question 4)
function farthest(from, filter) {
  const sp = dijkstra(from);
  let best = from, bd = 0;
  for (const [n, d] of sp.dist) if (filter(n) && d > bd) { bd = d; best = n; }
  return { node: best, dist: bd, sp };
}
function crossing(filter, label) {
  const start = nodes.find(filter);
  if (start === undefined) return;
  const a = farthest(start, filter);
  const b = farthest(a.node, filter);
  const path = pathTo(b.sp, b.node);
  const pts = pathPoints(path);
  const hum = profile(pts, starter, MODES.human);
  const at190 = b.dist / (190 / 3.6);
  log(`   ${label.padEnd(26)} ${km(b.dist)} km by road: ${(at190 / 60).toFixed(1)} min at 190 km/h, ${(hum.time / 60).toFixed(1)} min on the human profile (${kmhOf(hum.avg)} km/h)`);
  out[`crossing-${label}`] = { km: b.dist / 1000, minAt190: at190 / 60, minHuman: hum.time / 60 };
}
log('4. CROSSINGS (the longest shortest-path, found by a double sweep)');
crossing(() => true, 'whole network');
crossing((n) => planDistrictAt(P(n)) !== null, 'inside plan districts');
log('');

// ---- geography (question 6)
const bridges = driveable.filter((r) => r.bridge);
const tunnels = city.roads.filter((r) => city.nodes[r.a].level === 'tunnel' || city.nodes[r.b].level === 'tunnel');
log(`6. GEOGRAPHY: ${bridges.length} bridge segments (${km(bridges.reduce((s, r) => s + r.length / U, 0))} km), ${tunnels.length} tunnel segments on the live network`);
out.geography = { bridgeSegments: bridges.length, tunnelSegments: tunnels.length };

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(out, null, 1));
  log(`\nwrote ${jsonOut}`);
}
await server.close();
