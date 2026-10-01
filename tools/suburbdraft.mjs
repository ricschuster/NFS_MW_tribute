// Draft a suburb's streets for the road editor (#477).
//
// A midtown is a quiet suburb: curving residential streets off the drawn
// boulevards, cul-de-sacs, and crescents that leave a boulevard and come back
// to it. This grows a draft of them over one plan area and adds it to
// `docs/roads-edited.json`, where the road editor loads it for the owner to
// move, delete or add to before `npm run roadsync` makes it the city. It is a
// drawing tool, not a generator the game runs: once edited and synced, a
// street is authored data like any other (ADR-0009).
//
// How it grows them:
//   - Walk each boulevard through the area and stop every `SPACING` metres,
//     not within `JUNCTION_CLEAR` of another road.
//   - At each stop, try a street off each side, square to the boulevard and
//     bowing to one side as it goes, longest first. It is kept only if it
//     stays in the area, on dry ground `SHORE_CLEAR` from the water, under the
//     grade cap, and `STREET_GAP` clear of every other road but the one it
//     leaves. If its far end lands near another boulevard it runs on to it
//     and becomes a through street; otherwise it ends in a cul-de-sac.
//   - Neighbouring cul-de-sacs off the same side of the same boulevard are
//     joined at their far ends into a crescent, where the join is clear.
//
// Industrial (#489) drafts the same way with straight service roads instead
// of curving ones: `--district industrial --area 0`, bowing as `--bow` says.
// Ashford Point (#293) as estates: `--district waterfront --area 0 --prefix a`.
//
// Usage:
//   npm run suburbdraft -- --area 2            # the third midtown in plan.ts
//   npm run suburbdraft -- --area 2 --dry      # report, write nothing
//   npm run suburbdraft -- --district industrial --area 0 --prefix i   # works roads
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const DISTRICT = flag('--district', 'midtown');
const AREA = Number(flag('--area', '2'));
const DRY = args.includes('--dry');
const PREFIX = flag('--prefix', 's');

// Ashford Point's estates (#293) are the same streets at a looser grain:
// fewer lanes, longer and windier, far enough apart for grounds between them.
const ESTATES = DISTRICT === 'waterfront';
const SPACING = ESTATES ? 340 : 150; // between streets along a boulevard
const JUNCTION_CLEAR = ESTATES ? 90 : 60; // no street this near another road's junction
const LENGTHS = ESTATES ? [520, 440, 360, 280, 220] : [300, 250, 200, 160];
const CROSS_MIN = 110; // a boulevard opposite at least this far off is crossed to, not dead-ended short of
const CROSS_MAX = ESTATES ? 700 : 420;
// How far a street bows, as a fraction of its length: a suburb's curve, a
// works road's near-straight.
const BOW = Number(flag('--bow', ESTATES ? '0.3' : DISTRICT === 'midtown' ? '0.22' : '0.03'));
const STREET_GAP = ESTATES ? 130 : 55; // centre to centre, from any road but the one it leaves
const SHORE_CLEAR = 25;
const MAX_GRADE = 0.09;
const THROUGH_REACH = 70; // a far end this near a boulevard runs on to it
const CRESCENT_MAX = ESTATES ? 420 : 260; // far ends further apart than this are left as cul-de-sacs
// The far end of a crossing street is let off `STREET_GAP` from the boulevard
// it arrives at for this far back: it has to get within the gap to meet it,
// and at a slant it is within it for longer than the gap itself.
const ARRIVE = STREET_GAP * 1.6;

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { PLAN_DISTRICTS, inArea } = await server.ssrLoadModule('/src/game/city/plan.ts');
const U = K.UNITS_PER_METRE;
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const area = PLAN_DISTRICTS.filter((a) => a.kind === DISTRICT)[AREA];
if (!area) throw new Error(`no ${DISTRICT} ${AREA} in the plan`);
const poly = area.poly.map((p) => ({ x: p.x / U, z: p.z / U }));
const inside = (p) => inArea(poly, p);
const wet = (p) => inWater(city, p.x * U, p.z * U);
const ground = (p) => groundAt(city.terrain, p.x * U, p.z * U) / U;

const docPath = 'docs/roads-edited.json';
const raw = readFileSync(docPath, 'utf8');
const doc = JSON.parse(raw);
// Start from a clean slate: a rerun replaces the last draft instead of adding to it.
// A redraft replaces this area's own earlier draft and nothing else: area
// numbers repeat across kinds of district (Midtown south-west and Industrial
// are both 0), so the district is part of which draft is whose.
const kept = doc.roads.filter((r) => !(r.draft === 'suburb' && r.area === AREA && (r.district ?? 'midtown') === DISTRICT));
const drawn = kept.map((r) => ({ id: r.id, kind: r.kind, points: r.points.map(([x, z]) => ({ x, z })) }));

const seg = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
};
const gapTo = (p, line) => {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) d = Math.min(d, seg(p, line[i - 1], line[i]));
  return d;
};
const lengthOf = (line) => line.slice(1).reduce((s, b, i) => s + Math.hypot(b.x - line[i].x, b.z - line[i].z), 0);
const along = (line, d) => {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= l) return { p: { x: a.x + ((b.x - a.x) * d) / l, z: a.z + ((b.z - a.z) * d) / l }, dir: { x: (b.x - a.x) / l, z: (b.z - a.z) / l } };
    d -= l;
  }
  return null;
};
// Deterministic numbers from a position, so a rerun draws the same draft.
const rand = (x, z, k) => {
  let h = (Math.imul(Math.round(x), 374761393) + Math.imul(Math.round(z), 668265263) + Math.imul(k, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const spines = drawn.filter((r) => r.kind === 'boulevard' && r.points.some(inside));
const others = drawn;
const streets = [];

function clearOf(line, from, skipFirst, to = null, skipLast = 0) {
  for (const [k, p] of line.entries()) {
    if (!inside(p) || wet(p)) return false;
    for (const [dx, dz] of [[SHORE_CLEAR, 0], [-SHORE_CLEAR, 0], [0, SHORE_CLEAR], [0, -SHORE_CLEAR]]) if (wet({ x: p.x + dx, z: p.z + dz })) return false;
    if (k * 10 < skipFirst) continue;
    const last = (line.length - 1 - k) * 10 < skipLast;
    for (const r of others) if (r !== from && !(last && r === to) && gapTo(p, r.points) < STREET_GAP) return false;
    for (const s of streets) if (gapTo(p, s.points) < STREET_GAP) return false;
  }
  for (let i = 1; i < line.length; i++) if (Math.abs(ground(line[i]) - ground(line[i - 1])) / 10 > MAX_GRADE) return false;
  return true;
}
// A street as a polyline sampled every 10 m, and the few points it is kept as.
function curve(start, normal, length, bow) {
  const tangent = { x: -normal.z, z: normal.x };
  const at = (t) => {
    const off = Math.sin(Math.PI * t) * bow * length;
    return { x: start.x + normal.x * length * t + tangent.x * off, z: start.z + normal.z * length * t + tangent.z * off };
  };
  const dense = [];
  for (let d = 0; d <= length; d += 10) dense.push(at(d / length));
  const sparse = [0, 0.25, 0.5, 0.75, 1].map(at);
  return { dense, sparse };
}

// The nearest boulevard straight ahead from a point, if one is in crossing reach.
function crossing(from, dir, own) {
  let best = null;
  for (const r of spines) {
    if (r === own) continue;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      const ex = b.x - a.x, ez = b.z - a.z;
      const den = dir.x * ez - dir.z * ex;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((a.x - from.x) * ez - (a.z - from.z) * ex) / den;
      const u = ((a.x - from.x) * dir.z - (a.z - from.z) * dir.x) / den;
      if (u < 0 || u > 1 || t < CROSS_MIN || t > CROSS_MAX) continue;
      if (!best || t < best.distance) best = { distance: t, road: r, at: { x: from.x + dir.x * t, z: from.z + dir.z * t } };
    }
  }
  return best;
}

for (const spine of spines) {
  const total = lengthOf(spine.points);
  for (let d = SPACING / 2; d < total - JUNCTION_CLEAR; d += SPACING) {
    const here = along(spine.points, d);
    if (!here || !inside(here.p)) continue;
    // Not near a junction: another road's line within the clearance.
    if (others.some((r) => r !== spine && gapTo(here.p, r.points) < JUNCTION_CLEAR)) continue;
    for (const side of [1, -1]) {
      const normal = { x: -here.dir.z * side, z: here.dir.x * side };
      const bow = (rand(here.p.x, here.p.z, side + 2) - 0.5) * 2 * BOW;
      // A boulevard opposite, within reach: cross to it, gently curved - the
      // streets that tie two boulevards together, which a circuit needs.
      const opposite = crossing(here.p, normal, spine);
      if (opposite) {
        const { dense, sparse } = curve(here.p, normal, opposite.distance, bow / 2);
        if (clearOf(dense, spine, 30, opposite.road, ARRIVE)) {
          sparse[sparse.length - 1] = opposite.at;
          streets.push({ spine, side, station: d, points: sparse, deadEnd: false });
          continue;
        }
      }
      for (const length of LENGTHS) {
        const { dense, sparse } = curve(here.p, normal, length, bow);
        if (!clearOf(dense, spine, 30)) continue;
        const end = sparse[sparse.length - 1];
        // Through to another boulevard, if one is near the far end.
        const reach = spines.filter((r) => r !== spine).map((r) => ({ r, gap: gapTo(end, r.points) })).sort((a, b) => a.gap - b.gap)[0];
        streets.push({ spine, side, station: d, points: sparse, deadEnd: !(reach && reach.gap < THROUGH_REACH) });
        break;
      }
    }
  }
}

// Crescents: join neighbouring cul-de-sacs off the same side of one boulevard.
const joined = new Set();
const out = [];
for (const s of streets) {
  if (joined.has(s) || !s.deadEnd) continue;
  const next = streets.find((t) => t !== s && !joined.has(t) && t.deadEnd && t.spine === s.spine && t.side === s.side && t.station > s.station && t.station - s.station <= SPACING * 1.01);
  if (!next || rand(s.points[0].x, s.points[0].z, 9) < 0.35) continue;
  const a = s.points[s.points.length - 1], b = next.points[next.points.length - 1];
  if (Math.hypot(a.x - b.x, a.z - b.z) > CRESCENT_MAX) continue;
  // The join bows outward, away from the boulevard, and must be as clear as a street.
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const out1 = { x: mid.x - s.spine.points[0].x, z: mid.z - s.spine.points[0].z };
  const n = { x: -(b.z - a.z), z: b.x - a.x };
  const len = Math.hypot(n.x, n.z) || 1;
  const sign = Math.sign(n.x * (mid.x - s.points[0].x) + n.z * (mid.z - s.points[0].z)) || Math.sign(out1.x) || 1;
  const top = { x: mid.x + (n.x / len) * sign * 30, z: mid.z + (n.z / len) * sign * 30 };
  const bridge = [];
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const u = 1 - t;
    bridge.push({ x: u * u * a.x + 2 * u * t * top.x + t * t * b.x, z: u * u * a.z + 2 * u * t * top.z + t * t * b.z });
  }
  const without = streets.filter((t) => t !== s && t !== next);
  const saved = streets.splice(0, streets.length, ...without);
  const ok = clearOf(bridge.slice(2, -2), s.spine, 0);
  streets.splice(0, streets.length, ...saved);
  if (!ok) continue;
  joined.add(s).add(next);
  out.push({ points: [...s.points, top, ...next.points.slice().reverse()], deadEnd: false, crescent: true });
}
for (const s of streets) if (!joined.has(s)) out.push({ points: s.points, deadEnd: s.deadEnd, crescent: false });

const r0 = (v) => Math.round(v);
const roads = out.map((s, i) => ({
  id: `${PREFIX}${AREA}-${i + 1}`,
  kind: 'street',
  bridge: false,
  district: DISTRICT,
  points: s.points.map((p) => [r0(p.x), r0(p.z)]),
  ...(s.deadEnd ? { deadEnd: true } : {}),
  isNew: true,
  draft: 'suburb',
  area: AREA,
}));
const km = roads.reduce((sum, r) => sum + lengthOf(r.points.map(([x, z]) => ({ x, z }))), 0) / 1000;
console.log(
  `${DISTRICT} ${AREA}: ${roads.length} streets, ${km.toFixed(2)} km · ` +
    `${out.filter((s) => s.crescent).length} crescents, ${out.filter((s) => s.deadEnd).length} cul-de-sacs, ` +
    `${out.filter((s) => !s.deadEnd && !s.crescent).length} through`,
);
if (!DRY) {
  doc.roads = [...kept, ...roads];
  writeFileSync(docPath, JSON.stringify(doc, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`wrote ${docPath}`);
}
