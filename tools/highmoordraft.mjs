// Draft Highmoor Park's once-over into its props file.
//
// Highmoor Park was signed off (#460) as the Climb, a gravel car park at its
// western foot, dirt paths through generated woods to an open meadow, six
// picnic tables, four benches, a telescope and the Descent's jump: twelve
// pieces and two thousand trees. The owner's picks (2026-10-03), placed here
// so the area editor starts from something:
//
// - Furniture: more picnic tables with bins - on the meadow, at the car
//   park, the viewpoint, the lookout and the campsite - and the car park's
//   facilities: a toilet block, a picnic shelter, a kiosk and the ranger's hut.
// - Waymarkers at every junction of the paths and where a trail leaves one,
//   and a field gate with a stile beside each path where it leaves the car
//   park, a short dry-stone wall out from it either side.
// - Dry-stone walls along the meadow's edge, in runs with gaps.
// - Logs, log piles and boulders in the woods.
// - A timber lookout on the meadow near the top, and a radio mast in its
//   fenced compound on the highest ground the castle leaves.
// - A campsite in a clearing in the woods: a fire ring, tents round it, two
//   camper vans, picnic tables.
// - Trails (gravel paths, the path prop's `trail` variant) from the paths to
//   the campsite, the lookout and the mast.
//
// Everything is placed clear of every carriageway, race line, lamp,
// collectible, the castle and the car park's lot, and clear of each other;
// a building wants level ground (`slope`). The woods are generated after
// this, round it (`woodsFor`): a campsite or a hut gets a clearing, a log or
// a boulder only keeps a trunk off it. Picnic shelters are breakables. This
// tool's own ids (`hm…`) are replaced on a re-run and everything else in the
// file is kept. Then `npm run propsync -- --place highmoor`.
//
// Usage:
//   npm run highmoordraft          # write docs/highmoor-props-edited.json
//   npm run highmoordraft -- --dry # count, write nothing
//   npm run highmoordraft -- --dry --why # and why each kind was refused where it was
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const WHY = process.argv.includes('--why');
const FILE = 'docs/highmoor-props-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_DISTRICTS } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { TIDEWATER_GROUND_SIZES } = await server.ssrLoadModule('/src/game/city/tidewaterground.ts');
const { CASTLE_AREAS } = await server.ssrLoadModule('/src/game/city/castle.ts');
const { HIGHMOOR_CAR_PARK } = await server.ssrLoadModule('/src/game/city/highmoor.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const mine = (id) => /^hm\d/.test(id ?? '');
const kept = (old.props ?? []).filter((p) => !mine(p.id));

// Everything here is in metres.
const AREA = PLAN_DISTRICTS.find((a) => a.name === 'Highmoor Park').poly.map((p) => ({ x: p.x / M, z: p.z / M }));
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
const inPark = (p) => inPoly(p, AREA);
const wet = (p) => inWater(city, p.x * M, p.z * M);
const ground = (p) => groundAt(city.terrain, p.x * M, p.z * M) / M;
const segDist = (p, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z);
};
const outlineDist = (p, outline) => {
  let d = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) d = Math.min(d, segDist(p, outline[j], outline[i]));
  return inPoly(p, outline) ? -d : d;
};
/** A heading that points a piece's front (+z in its own frame) along (`dx`, `dz`). */
const facing = (dx, dz) => Math.atan2(dx, dz);
/** A heading that runs a piece's across axis (+x, which a heading `a` turns to (cos a, -sin a)) along (`dx`, `dz`). */
const across = (dx, dz) => Math.atan2(-dz, dx);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
const unit = (dx, dz) => {
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
};
// A fixed stream of numbers, so a re-run drafts the same park.
let seed = 0x48696768;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return (seed >>> 0) / 4294967296;
};

// ---- A spatial hash, for "is anything near here" ---------------------------------

const CELL = 40;
class Hash {
  constructor() { this.cells = new Map(); }
  add(item, x, z, reach) {
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
        const k = `${i},${j}`;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(item);
      }
  }
  near(x, z, reach) {
    const out = new Set();
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++)
        for (const item of this.cells.get(`${i},${j}`) ?? []) out.add(item);
    return out;
  }
}

// ---- What is in the way ------------------------------------------------------

const xs = AREA.map((p) => p.x), zs = AREA.map((p) => p.z);
const BOX = { minX: Math.min(...xs) - 80, maxX: Math.max(...xs) + 80, minZ: Math.min(...zs) - 80, maxZ: Math.max(...zs) + 80 };
const inBox = (p) => p.x > BOX.minX && p.x < BOX.maxX && p.z > BOX.minZ && p.z < BOX.maxZ;
const node = (i) => ({ x: city.nodes[i].pos.x / M, z: city.nodes[i].pos.z / M, y: city.nodes[i].y / M, level: city.nodes[i].level, i });

const roadHash = new Hash();
const roads = city.roads
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, road: r }))
  .filter((s) => (inBox(s.a) || inBox(s.b)) && s.a.level !== 'tunnel' && s.b.level !== 'tunnel');
for (const s of roads) roadHash.add(s, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) / 2 + s.half);
/** How far a point is from the nearest carriageway's edge, counting only roads at ground level. */
const roadEdge = (p, reach = 40) => {
  let best = Infinity;
  const g = ground(p);
  for (const s of roadHash.near(p.x, p.z, reach)) {
    if (Math.min(s.a.y, s.b.y) > g + 5) continue;
    best = Math.min(best, segDist(p, s.a, s.b) - s.half);
  }
  return best;
};
/** The nearest point on a park path's edge (dirt or gravel, not the Climb's tarmac), and the path. */
function nearestPathEdge(p, reach = 300) {
  let best = null;
  for (const s of roadHash.near(p.x, p.z, reach)) {
    if (s.road.surface === 'asphalt') continue;
    const ux = s.b.x - s.a.x, uz = s.b.z - s.a.z;
    const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * ux + (p.z - s.a.z) * uz) / (ux * ux + uz * uz || 1)));
    const q = { x: s.a.x + ux * t, z: s.a.z + uz * t };
    const d = Math.hypot(q.x - p.x, q.z - p.z) - s.half;
    if (!best || d < best.d) {
      const n = unit(p.x - q.x, p.z - q.z);
      best = { d, s, at: { x: q.x + n.x * s.half, z: q.z + n.z * s.half } };
    }
  }
  return best;
}

const raceHash = new Hash();
for (const route of city.routes) {
  const line = route.points.map((p) => ({ x: p.x / M, z: p.z / M }));
  for (let i = 1; i < line.length; i++) {
    const s = { a: line[i - 1], b: line[i] };
    if (!inBox(s.a) && !inBox(s.b)) continue;
    raceHash.add(s, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) / 2);
  }
}
const raceDist = (p, reach = 40) => {
  let best = Infinity;
  for (const s of raceHash.near(p.x, p.z, reach)) best = Math.min(best, segDist(p, s.a, s.b));
  return best;
};

const castle = [CASTLE_AREAS.bailey, CASTLE_AREAS.court, CASTLE_AREAS.ward].map((o) => o.map((p) => ({ x: p.x / M, z: p.z / M })));
const castleDist = (p) => Math.min(...castle.map((o) => outlineDist(p, o)));
const lot = HIGHMOOR_CAR_PARK.map((p) => ({ x: p.x / M, z: p.z / M }));

// The city as loaded holds this tool's last draft, synced; those pieces are
// about to be replaced, so they are in nobody's way.
const lastDraft = (old.props ?? []).filter((p) => mine(p.id));
const drafted = (at) => lastDraft.some((p) => Math.abs(p.x - at.x / M) < 0.2 && Math.abs(p.z - at.z / M) < 0.2);
const pointHash = new Hash();
const points = [
  ...city.collectibles.map((c) => ({ ...c.at, r: 8 })),
  ...city.breakables.filter((b) => !drafted(b.at)).map((b) => ({ ...b.at, r: 6 })),
  ...city.furniture.filter((f) => f.kind === 'lamp' || f.kind === 'sign').map((f) => ({ ...f.at, r: 2.5 })),
  // The castle's own pieces, which are not trees and do not move.
  ...city.setPieces.filter((s) => s.kind !== 'tree' && !drafted(s.at)).map((s) => ({ ...s.at, r: 12 })),
  ...city.jumps.map((j) => ({ ...j.at, r: 20 })),
]
  .map((p) => ({ x: p.x / M, z: p.z / M, r: p.r }))
  .filter(inBox);
for (const p of points) pointHash.add(p, p.x, p.z, p.r);
const nearPoint = (p, pad) => [...pointHash.near(p.x, p.z, 20 + pad)].some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + pad);

// ---- Footprints ----------------------------------------------------------------

/** The editor's sizes (`tools/propeditor.html`), across (`w`) and along (`l`) a piece's heading. */
const SIZE = {
  bench: [1.2, 3.6], bin: [1.2, 1.2], 'picnic-table': [3.6, 4.4], telescope: [1, 1], kiosk: [4.8, 4],
  'picnic-shelter': [9.6, 7.4], 'toilet-block': [8, 12.8],
  waymarker: [0.6, 0.6], 'field-gate': [9.6, 1.2], 'stone-wall': [10, 1.1], log: [1.1, 12], 'log-pile': [6, 4],
  boulder: [4.4, 4.4], 'ranger-hut': [7.4, 10.4], 'timber-lookout': [8, 8], tent: [5.2, 6.6], campfire: [8, 8],
  'camper-van': [4.2, 11], 'radio-mast': [16, 16], jump: [20, 20],
};
const ROUND = new Set(['bin', 'telescope', 'waymarker', 'boulder', 'campfire']);
const GROUND = new Set(['path', 'plaza', 'beach', 'lawn']);
const sizeOf = (p) => {
  if (GROUND.has(p.kind)) {
    const [w, l] = TIDEWATER_GROUND_SIZES[p.kind][p.variant];
    return [p.w ?? w, l];
  }
  if (p.kind === 'boulder' && p.variant === 'large') return [7.6, 7.6];
  return SIZE[p.kind] ?? [4, 4];
};

/** A piece's footprint, grown by `pad`: a circle or four corners. */
function footprint(p, pad = 0) {
  const [w, l] = sizeOf(p);
  if (ROUND.has(p.kind)) return { round: true, x: p.x, z: p.z, r: Math.max(w, l) / 2 + pad };
  const s = Math.sin(p.angle), c = Math.cos(p.angle);
  return { round: false, x: p.x, z: p.z, s, c, hw: w / 2 + pad, hl: l / 2 + pad };
}
const inPrint = (f, q) => {
  if (f.round) return Math.hypot(q.x - f.x, q.z - f.z) < f.r;
  const dx = q.x - f.x, dz = q.z - f.z;
  return Math.abs(dx * f.c - dz * f.s) < f.hw && Math.abs(dx * f.s + dz * f.c) < f.hl;
};
/** Points over a footprint, a few metres apart, for testing it against everything else. */
function samples(f, step = 2.5) {
  const out = [];
  if (f.round) {
    out.push({ x: f.x, z: f.z });
    for (let r = step; r <= f.r; r += step) {
      const n = Math.max(6, Math.ceil((2 * Math.PI * r) / step));
      for (let k = 0; k < n; k++) out.push({ x: f.x + Math.cos((k / n) * 2 * Math.PI) * r, z: f.z + Math.sin((k / n) * 2 * Math.PI) * r });
    }
    if (f.r < step) for (let k = 0; k < 6; k++) out.push({ x: f.x + Math.cos((k / 6) * 2 * Math.PI) * f.r, z: f.z + Math.sin((k / 6) * 2 * Math.PI) * f.r });
    return out;
  }
  const nu = Math.max(1, Math.ceil((2 * f.hw) / step)), nv = Math.max(1, Math.ceil((2 * f.hl) / step));
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const u = -f.hw + (2 * f.hw * i) / nu, v = -f.hl + (2 * f.hl * j) / nv;
      out.push({ x: f.x + u * f.c + v * f.s, z: f.z - u * f.s + v * f.c });
    }
  return out;
}

const taken = new Hash();
const take = (f, kind) => taken.add({ f, kind }, f.x, f.z, f.round ? f.r : Math.hypot(f.hw, f.hl));
const hitsTaken = (q, ignore) => [...taken.near(q.x, q.z, 2)].some((t) => t.kind !== ignore && !GROUND.has(t.kind) && inPrint(t.f, q));
const onTrail = (q) => [...taken.near(q.x, q.z, 2)].some((t) => GROUND.has(t.kind) && inPrint(t.f, q));

const why = new Map();
const refuse = (kind, reason) => {
  if (!why.has(kind)) why.set(kind, new Map());
  why.get(kind).set(reason, (why.get(kind).get(reason) ?? 0) + 1);
  return false;
};

/**
 * Can this piece stand here? Its footprint, grown by `pad`, has to be in the
 * park, dry, off every road by `road` metres, off every race line by `race`,
 * `castle` metres off the castle, off the car park's lot, on ground that
 * falls no more than `slope` metres across it, off the trails, and on
 * nothing placed.
 */
function fits(p, { pad = 1, road = 3, race = 14, castleGap = 10, slope = Infinity, park = true, lotOk = false, trails = false, ignore = null } = {}) {
  const f = footprint(p, pad);
  let lo = Infinity, hi = -Infinity;
  for (const q of samples(f)) {
    if (park && !inPark(q)) return refuse(p.kind, 'outside the park');
    if (wet(q)) return refuse(p.kind, 'in the water');
    if (roadEdge(q) < road) return refuse(p.kind, 'on a road');
    if (race > 0 && raceDist(q) < race) return refuse(p.kind, 'on a race line');
    if (castleDist(q) < castleGap) return refuse(p.kind, 'in the castle');
    if (!lotOk && outlineDist(q, lot) < 2) return refuse(p.kind, 'on the car park');
    if (nearPoint(q, 0.5)) return refuse(p.kind, 'on a lamp, a collectible or a castle piece');
    if (!trails && onTrail(q)) return refuse(p.kind, 'on a trail');
    if (hitsTaken(q, ignore)) return refuse(p.kind, 'on something placed');
    const g = ground(q);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  if (hi - lo > slope) return refuse(p.kind, 'on a slope');
  return true;
}

const out = [];
let next = 1;
function put(p, pad = 1) {
  const prop = { id: `hm${next++}`, kind: p.kind, x: r1(p.x), z: r1(p.z), angle: r3(p.angle) };
  if (p.w != null) prop.w = r1(p.w);
  if (p.variant) prop.variant = p.variant;
  if (p.note) prop.note = p.note;
  out.push(prop);
  take(footprint(prop, pad), p.kind);
  return prop;
}

/**
 * Put a piece as near `at` as it fits: out in rings to `radius`, trying each
 * heading in `angles` (or the one `angleAt` gives for where it stands).
 */
function placeNear(kind, at, { radius = 80, step = 4, angles = [0], angleAt = null, variant, note, opts = {}, pad = 1 } = {}) {
  for (let r = 0; r <= radius; r += step) {
    const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / step);
    for (let k = 0; k < n; k++) {
      const x = at.x + Math.cos((k / n) * 2 * Math.PI) * r, z = at.z + Math.sin((k / n) * 2 * Math.PI) * r;
      for (const angle of angleAt ? [angleAt({ x, z })] : angles) {
        const p = { kind, x, z, angle, variant, note };
        if (fits(p, opts)) return put(p, pad);
      }
    }
  }
  refuse(kind, `nothing within ${radius} m of ${Math.round(at.x)}, ${Math.round(at.z)}`);
  return null;
}
const toward = (from, to) => facing(to.x - from.x, to.z - from.z);

// What was placed by hand stays, and is in the way.
for (const p of kept) if (!GROUND.has(p.kind)) take(footprint(p, 2), p.kind);

// ---- Trails ------------------------------------------------------------------

/**
 * A trail from `a` to `b`, in straight pieces of at most 30 m overlapping at
 * the joints. A piece through something placed is left out, and one running
 * along a road rather than off it too.
 */
const TRAIL_W = TIDEWATER_GROUND_SIZES.path.trail[1];
let trailPieces = 0;
function trail(a, b, { ignore = null } = {}) {
  const placed = [];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 6) return placed;
  const n = Math.max(1, Math.ceil(len / 30));
  for (let i = 0; i < n; i++) {
    const p0 = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
    const p1 = { x: a.x + ((b.x - a.x) * (i + 1)) / n, z: a.z + ((b.z - a.z) * (i + 1)) / n };
    const piece = { kind: 'path', variant: 'trail', x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2, angle: across(p1.x - p0.x, p1.z - p0.z), w: len / n + TRAIL_W };
    const pts = samples(footprint(piece, 0), 2);
    if (pts.some((q) => wet(q))) { refuse('path', 'into the water'); continue; }
    if (pts.some((q) => castleDist(q) < 4)) { refuse('path', 'into the castle'); continue; }
    if (pts.some((q) => [...taken.near(q.x, q.z, 2)].some((t) => t.kind !== ignore && !GROUND.has(t.kind) && inPrint(t.f, q)))) { refuse('path', 'through something placed'); continue; }
    if (pts.filter((q) => roadEdge(q) < 0).length > pts.length * 0.3) { refuse('path', 'along a road'); continue; }
    placed.push(put({ ...piece, note: trailPieces++ ? undefined : 'Trails, gravel through the woods, in straight pieces that overlap at the joints' }, 0));
  }
  return placed;
}

/** A trail from `p` to the nearest park path, with a waymarker where it meets it. Returns where it met it. */
function trailToPath(p, { ignore = null } = {}) {
  const e = nearestPathEdge(p);
  if (!e || e.d > 260) return null;
  trail(p, e.at, { ignore });
  const d = unit(p.x - e.at.x, p.z - e.at.z);
  const side = { x: -d.z, z: d.x };
  placeNear('waymarker', { x: e.at.x + d.x * 3 + side.x * 4, z: e.at.z + d.z * 3 + side.z * 4 }, { radius: 8, step: 1, opts: { pad: 0.2, road: 1, race: 8, trails: false } });
  return e.at;
}

// ---- The car park's facilities ------------------------------------------------

const lotC = { x: lot.reduce((s, p) => s + p.x, 0) / 4, z: lot.reduce((s, p) => s + p.z, 0) / 4 };
const lotAlong = unit(lot[1].x - lot[0].x, lot[1].z - lot[0].z);
const lotAcross = unit(lot[3].x - lot[0].x, lot[3].z - lot[0].z);
const offLot = (u, v) => ({ x: lotC.x + lotAlong.x * u + lotAcross.x * v, z: lotC.z + lotAlong.z * u + lotAcross.z * v });
const LOT_OPTS = { pad: 1, road: 4, race: 16, slope: 2.5 };
// Round the lot's edges, each building facing it: its front to the lot.
const facingLot = (q) => toward(q, lotC);
const hut = placeNear('ranger-hut', offLot(-10, -26), { radius: 40, angleAt: facingLot, opts: LOT_OPTS, note: 'The ranger\'s hut, by the car park' });
const toilets = placeNear('toilet-block', offLot(14, -26), { radius: 40, angleAt: facingLot, opts: LOT_OPTS, note: 'Toilets at the car park' });
const kiosk = placeNear('kiosk', offLot(-34, 6), { radius: 40, angleAt: facingLot, opts: LOT_OPTS, note: 'A kiosk at the car park' });
const shelter = placeNear('picnic-shelter', offLot(0, 30), { radius: 50, angles: [Math.atan2(lotAlong.x, lotAlong.z), Math.atan2(lotAcross.x, lotAcross.z)], opts: LOT_OPTS, note: 'A picnic shelter by the car park' });

/** A group of picnic tables round `spot` and a bin, `n` of them, as near as they fit. */
function picnic(spot, n, { from = 8, to = 40, opts = {} } = {}) {
  let placed = 0;
  for (let r = from; r <= to && placed < n; r += 4) {
    for (let k = 0; k < 10 && placed < n; k++) {
      const a = (k / 10) * 2 * Math.PI + r * 0.37;
      const p = { kind: 'picnic-table', x: spot.x + Math.cos(a) * r, z: spot.z + Math.sin(a) * r, angle: r3(a * 2.3) };
      if (fits(p, { pad: 2, road: 5, race: 16, slope: 1.5, ...opts })) { put(p, 2); placed++; }
    }
  }
  if (placed) placeNear('bin', { x: spot.x + 5, z: spot.z + 5 }, { radius: 24, step: 2, opts: { pad: 0.4, road: 2, race: 12, ...opts } });
  return placed;
}
if (shelter) picnic(shelter, 3);
// Bins round the lot itself: at its corners, off the gravel.
for (const [u, v] of [[-30, -20], [30, -20], [30, 20], [-30, 20]]) placeNear('bin', offLot(u, v), { radius: 10, step: 1.5, opts: { pad: 0.3, road: 1.5, race: 12 } });
if (hut) placeNear('log-pile', { x: hut.x - Math.sin(hut.angle) * 9, z: hut.z - Math.cos(hut.angle) * 9 }, { radius: 16, step: 2, angles: [hut.angle, hut.angle + Math.PI / 2], opts: { pad: 0.5, road: 3, race: 14 } });

// ---- A gate and a stile where each path leaves the car park ------------------

const MOUTH_OUT = 14;
for (const s of roads) {
  if (s.road.surface !== 'dirt') continue;
  for (const [end, other] of [[s.a, s.b], [s.b, s.a]]) {
    if (outlineDist(end, lot) > 20) continue;
    const d = unit(other.x - end.x, other.z - end.z);
    const side = { x: -d.z, z: d.x };
    // The fence line crosses the path MOUTH_OUT metres out; the gate stands
    // open against it, swung back along the path's edge.
    const mouth = { x: end.x + d.x * MOUTH_OUT, z: end.z + d.z * MOUTH_OUT };
    // As near the edge as the race line lets it: a raced path keeps its gate further off.
    let gated = false;
    for (let off = s.half + 1.8; off <= s.half + 9 && !gated; off += 0.5) {
      for (const sign of [1, -1]) {
        const at = { x: mouth.x + side.x * sign * off + d.x * 5, z: mouth.z + side.z * sign * off + d.z * 5 };
        const gate = { kind: 'field-gate', x: at.x, z: at.z, angle: across(d.x, d.z), note: 'A field gate, open, and its stile' };
        if (fits(gate, { pad: 0.3, road: 0.5, race: 11, slope: 2 })) {
          put(gate, 0.3);
          gated = true;
          break;
        }
      }
    }
    // The wall, out from the path's edges along the fence line, both ways.
    for (const sign of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const off = s.half + 1 + 5 + k * 10;
        const wall = { kind: 'stone-wall', x: mouth.x + side.x * sign * off, z: mouth.z + side.z * sign * off, angle: across(side.x, side.z) };
        if (!fits(wall, { pad: 0.2, road: 1, race: 14, castleGap: 6 })) break;
        put(wall, 0.2);
      }
    }
  }
}

// ---- The summit: the radio mast, and the lookout on the meadow ---------------

// The highest ground the castle leaves, in the park, off the roads.
let summit = null;
for (let x = BOX.minX; x < BOX.maxX; x += 5) {
  for (let z = BOX.minZ; z < BOX.maxZ; z += 5) {
    const q = { x, z };
    if (!inPark(q) || castleDist(q) < 45 || roadEdge(q) < 14 || raceDist(q) < 30) continue;
    const h = ground(q);
    if (!summit || h > summit.h) summit = { q, h };
  }
}
const MAST_OPTS = { pad: 1, road: 10, race: 28, castleGap: 40, slope: 3 };
const mast = summit ? placeNear('radio-mast', summit.q, { radius: 60, angles: [0, Math.PI / 4], opts: MAST_OPTS, note: 'The radio mast, on the highest ground the castle leaves' }) : null;
if (mast) trailToPath({ x: mast.x - Math.sin(mast.angle) * 10, z: mast.z - Math.cos(mast.angle) * 10 }, { ignore: 'radio-mast' });

// The lookout on the meadow near the top, looking out over the woods: high
// ground, but not the mast's, between it and the picnic area.
let lookoutSpot = null;
for (let x = BOX.minX; x < BOX.maxX; x += 5) {
  for (let z = BOX.minZ; z < BOX.maxZ; z += 5) {
    const q = { x, z };
    if (!inPark(q) || castleDist(q) < 40 || roadEdge(q) < 12 || raceDist(q) < 26) continue;
    if (mast && Math.hypot(q.x - mast.x, q.z - mast.z) < 180) continue;
    const h = ground(q);
    if (h < 108) continue;
    // Highest first, and nearer the picnic area for a tie.
    const score = h - Math.hypot(q.x - 1318, q.z + 80) / 100;
    if (!lookoutSpot || score > lookoutSpot.score) lookoutSpot = { q, score };
  }
}
const lookout = lookoutSpot ? placeNear('timber-lookout', lookoutSpot.q, { radius: 50, angles: [0.3, 1.1], opts: { pad: 1, road: 8, race: 24, castleGap: 30, slope: 2 }, note: 'A timber lookout on the meadow' }) : null;
if (lookout) {
  trailToPath(lookout, { ignore: 'timber-lookout' });
  picnic(lookout, 2, { from: 12, to: 36 });
}

// ---- The campsite, in a clearing in the woods ---------------------------------

/**
 * Somewhere level in the woods (below the meadow), off the races, a short
 * walk from a path: the flattest 30 m disc within 50 to 160 m of a park path.
 */
let campSpot = null;
for (let x = BOX.minX; x < BOX.maxX; x += 10) {
  for (let z = BOX.minZ; z < BOX.maxZ; z += 10) {
    const q = { x, z };
    if (!inPark(q) || ground(q) > 92 || roadEdge(q) < 40 || raceDist(q) < 50 || castleDist(q) < 60) continue;
    if (outlineDist(q, lot) < 120) continue;
    const e = nearestPathEdge(q);
    if (!e || e.d < 50 || e.d > 160) continue;
    let lo = Infinity, hi = -Infinity, ok = true;
    for (let r = 0; r <= 30 && ok; r += 6) {
      for (let k = 0; k < 12; k++) {
        const t = { x: q.x + Math.cos((k / 12) * 2 * Math.PI) * r, z: q.z + Math.sin((k / 12) * 2 * Math.PI) * r };
        if (!inPark(t) || roadEdge(t) < 12) { ok = false; break; }
        const g = ground(t);
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
    if (!ok) continue;
    const score = hi - lo + e.d / 200;
    if (!campSpot || score < campSpot.score) campSpot = { q, score };
  }
}
const CAMP_OPTS = { pad: 1, road: 10, race: 30, slope: 1.6 };
const fire = campSpot ? placeNear('campfire', campSpot.q, { radius: 20, step: 2, opts: { ...CAMP_OPTS, pad: 0.5 }, note: 'The campsite: a fire ring in a clearing, tents round it' }) : null;
if (fire) {
  // The trail in first, from the fire ring's edge, so the tents leave it clear.
  const e = nearestPathEdge(fire);
  if (e) {
    const d = unit(e.at.x - fire.x, e.at.z - fire.z);
    trailToPath({ x: fire.x + d.x * 6, z: fire.z + d.z * 6 }, { ignore: 'campfire' });
  }
  const variants = ['orange', 'green', 'blue', 'red', 'green', 'orange'];
  let tents = 0;
  for (let r = 13; r <= 22 && tents < 6; r += 3) {
    for (let k = 0; k < 12 && tents < 6; k++) {
      const a = (k / 12) * 2 * Math.PI + r * 0.11;
      const q = { x: fire.x + Math.cos(a) * r, z: fire.z + Math.sin(a) * r };
      const p = { kind: 'tent', x: q.x, z: q.z, angle: toward(q, fire), variant: variants[tents] };
      if (fits(p, { ...CAMP_OPTS, pad: 1.5 })) { put(p, 1.5); tents++; }
    }
  }
  let vans = 0;
  for (let r = 28; r <= 40 && vans < 2; r += 3) {
    for (let k = 0; k < 16 && vans < 2; k++) {
      const a = (k / 16) * 2 * Math.PI;
      const q = { x: fire.x + Math.cos(a) * r, z: fire.z + Math.sin(a) * r };
      // Parked side-on to the fire, awning towards it.
      const p = { kind: 'camper-van', x: q.x, z: q.z, angle: across(q.x - fire.x, q.z - fire.z) + Math.PI, variant: ['teal', 'cream'][vans] };
      if (fits(p, { ...CAMP_OPTS, pad: 1.5 })) { put(p, 1.5); vans++; }
    }
  }
  picnic(fire, 2, { from: 18, to: 40, opts: { race: 30 } });
  placeNear('log-pile', { x: fire.x + 10, z: fire.z - 10 }, { radius: 20, step: 2, angles: [0.5], opts: { pad: 0.5, road: 6, race: 30 } });
}

// ---- More picnic tables on the meadow, and at the viewpoint -------------------

picnic({ x: 1318, z: -84 }, 6, { from: 14, to: 50 });
const viewpoint = kept.find((p) => p.kind === 'telescope');
if (viewpoint) picnic(viewpoint, 2, { from: 10, to: 30 });

// ---- Waymarkers at every junction of the park's paths -------------------------

const degree = new Map();
for (const r of city.roads) for (const n of [r.a, r.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
const junctions = new Map();
for (const s of roads) {
  if (s.road.surface === 'asphalt') continue;
  for (const n of [s.a, s.b]) if ((degree.get(n.i) ?? 0) !== 2 && inPark(n)) junctions.set(n.i, n);
}
for (const n of junctions.values()) {
  // In the corner between two of its roads, off the carriageway.
  placeNear('waymarker', n, { radius: 18, step: 1, opts: { pad: 0.2, road: 1.5, race: 9, lotOk: false } });
}

// ---- Dry-stone walls along the meadow's edge ---------------------------------

/**
 * The meadow's edge is where the woods give out (`woodsFor`: thinning from
 * 96 m to nothing at 108, and thin enough to read as open by 105): that contour, found along rays out from the
 * summit and laid in runs of walls, a gap every few lengths, kept off the
 * roads and well off the race lines, where a wall would be a wall to a
 * racing car.
 */
const EDGE = 105;
const centre = summit ? summit.q : { x: 1393, z: -474 };
const edge = [];
for (let deg = 0; deg < 360; deg += 2) {
  const a = (deg * Math.PI) / 180;
  const d = { x: Math.cos(a), z: Math.sin(a) };
  let found = null;
  for (let r = 10; r < 900; r += 2) {
    const q = { x: centre.x + d.x * r, z: centre.z + d.z * r };
    if (ground(q) < EDGE) { found = q; break; }
  }
  edge.push(found);
}
let walls = 0, run = 0;
for (let i = 0; i < edge.length; i++) {
  const a = edge[i], b = edge[(i + 1) % edge.length];
  if (!a || !b) continue;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len > 60) continue;
  const d = unit(b.x - a.x, b.z - a.z);
  for (let t = 5; t < len; t += 10) {
    // A gap of one length in every seven.
    if (run++ % 7 === 6) continue;
    const q = { x: a.x + d.x * t, z: a.z + d.z * t };
    const wall = { kind: 'stone-wall', x: q.x, z: q.z, angle: across(d.x, d.z), note: walls ? undefined : 'Dry-stone walls along the meadow\'s edge' };
    if (!fits(wall, { pad: 0.3, road: 4, race: 24, castleGap: 8 })) continue;
    put(wall, 0.3);
    walls++;
  }
}

// ---- Logs, log piles and boulders in the woods --------------------------------

/** Somewhere in the woods, below the meadow, off the paths and the races. */
const WOOD_OPTS = { pad: 0.5, road: 6, race: 24, castleGap: 8 };
const scatter = (kind, n, variantOf = () => undefined, opts = WOOD_OPTS) => {
  let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 400) {
    const q = { x: BOX.minX + rand() * (BOX.maxX - BOX.minX), z: BOX.minZ + rand() * (BOX.maxZ - BOX.minZ) };
    if (!inPark(q) || ground(q) > 98) continue;
    const p = { kind, x: q.x, z: q.z, angle: r3(rand() * 2 * Math.PI), variant: variantOf() };
    if (fits(p, opts)) { put(p, opts.pad); placed++; }
  }
  return placed;
};
scatter('boulder', 45, () => (rand() < 0.3 ? 'large' : 'small'));
scatter('log', 40);
// Log piles by the paths, where a woodman would stack them: 6 to 14 m off a path's edge.
{
  let piles = 0, tries = 0;
  while (piles < 10 && tries++ < 4000) {
    const q = { x: BOX.minX + rand() * (BOX.maxX - BOX.minX), z: BOX.minZ + rand() * (BOX.maxZ - BOX.minZ) };
    if (!inPark(q) || ground(q) > 98) continue;
    const e = nearestPathEdge(q, 60);
    if (!e || e.d < 6 || e.d > 14) continue;
    const along = unit(e.s.b.x - e.s.a.x, e.s.b.z - e.s.a.z);
    const p = { kind: 'log-pile', x: q.x, z: q.z, angle: across(along.x, along.z) };
    if (fits(p, { ...WOOD_OPTS, road: 5 })) { put(p, 0.5); piles++; }
  }
}

// ---- Report and write ------------------------------------------------------------

const counts = {};
for (const p of out) {
  const k = `${p.kind}${p.variant && GROUND.has(p.kind) ? ` (${p.variant})` : ''}`;
  counts[k] = (counts[k] ?? 0) + 1;
}
console.log(`Highmoor Park once-over: ${out.length} props (${kept.length} kept)`);
if (summit) console.log(`  summit ${Math.round(summit.q.x)}, ${Math.round(summit.q.z)} at ${summit.h.toFixed(1)} m`);
if (campSpot) console.log(`  campsite ${Math.round(campSpot.q.x)}, ${Math.round(campSpot.q.z)}`);
for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(22)} ${n}`);
if (WHY) {
  console.log('\nRefused:');
  for (const [kind, reasons] of why) console.log(`  ${kind}: ${[...reasons].map(([r, n]) => `${r} ${n}`).join(', ')}`);
}
if (!DRY) {
  const doc = { ...old, savedAt: new Date().toISOString(), props: [...kept, ...out] };
  writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${FILE}`);
}
