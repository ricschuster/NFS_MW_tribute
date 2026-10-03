// Draft Tidewater Park's once-over into its props file.
//
// Tidewater Park was signed off (#461) as drives, two ponds, a bandstand, a
// café, a toilet block, ten benches and about 270 pines on the lawns: the
// thinnest area left once downtown had its pass. The owner's picks
// (2026-10-02), placed here so the area editor starts from something:
//
// - Furniture: picnic tables with bins on the lawns, benches and bins along
//   the drives, coin telescopes on the seafront, an ice-cream kiosk and two
//   food trucks by the bandstand.
// - Features: a playground, a boathouse with a jetty and rowing boats on the
//   big pond, a football pitch and a pair of tennis courts, picnic shelters.
// - The shore: a promenade along the seaward side of the coast road with a
//   railing, a beach below it with a row of beach huts and a lifeguard tower,
//   and a lighthouse on the park's eastern point.
// - The ground: footpaths across the lawns joining it all up, and a fountain
//   plaza by the café. The broadleaves among the pines are not placed here:
//   the park's trees are generated (`parkTreesFor`), round all of this.
//
// Everything is placed clear of every carriageway, pond, building, race line,
// lamp, collectible and the water, and clear of each other; the pitch, the
// courts and the playground stand on pads the generator levels
// (`city/tidewaterground.ts`), kept off the freeway's tunnel. Picnic shelters
// are breakables, numbered on after everything before them. This tool's own
// ids (`tw…`) are replaced on a re-run and everything else in the file is
// kept. Then `npm run propsync -- --place tidewater`.
//
// Usage:
//   npm run tidewaterdraft          # write docs/tidewater-props-edited.json
//   npm run tidewaterdraft -- --dry # count, write nothing
//   npm run tidewaterdraft -- --dry --why # and why each kind was refused where it was
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const WHY = process.argv.includes('--why');
const FILE = 'docs/tidewater-props-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_DISTRICTS } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { TIDEWATER_GROUND_SIZES, PAD_SIZES } = await server.ssrLoadModule('/src/game/city/tidewaterground.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const mine = (id) => /^tw\d/.test(id ?? '');
const kept = (old.props ?? []).filter((p) => !mine(p.id));

// Everything here is in metres.
const AREA = PLAN_DISTRICTS.find((a) => a.name === 'Tidewater Park').poly.map((p) => ({ x: p.x / M, z: p.z / M }));
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

// Every carriageway near the park at ground level. The freeway's tunnel is
// not in the way of anything on the surface, but a levelled pad is kept off
// its line (`TUNNEL_CLEAR`), so the ground over it is never lowered.
const roadHash = new Hash();
const tunnelHash = new Hash();
const roads = city.roads
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, road: r }))
  .filter((s) => inBox(s.a) || inBox(s.b));
for (const s of roads) {
  const x = (s.a.x + s.b.x) / 2, z = (s.a.z + s.b.z) / 2;
  const reach = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) / 2 + s.half;
  if (s.a.level === 'tunnel' || s.b.level === 'tunnel') tunnelHash.add(s, x, z, reach);
  else roadHash.add(s, x, z, reach);
}
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
const TUNNEL_CLEAR = 40;
const tunnelEdge = (p) => {
  let best = Infinity;
  for (const s of tunnelHash.near(p.x, p.z, TUNNEL_CLEAR + 20)) best = Math.min(best, segDist(p, s.a, s.b) - s.half);
  return best;
};
/** The nearest point on a ground-level road's edge, and the road. */
function nearestRoadEdge(p, reach = 200) {
  let best = null;
  for (const s of roadHash.near(p.x, p.z, reach)) {
    if (s.road.class === 'interstate' || s.road.class === 'ramp') continue;
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

const ponds = city.water.filter((w) => w.kind === 'pond' && w.outline.some((p) => inBox({ x: p.x / M, z: p.z / M })))
  .map((w) => {
    const outline = w.outline.map((p) => ({ x: p.x / M, z: p.z / M }));
    const c = { x: outline.reduce((s, p) => s + p.x, 0) / outline.length, z: outline.reduce((s, p) => s + p.z, 0) / outline.length };
    return { outline, c, r: Math.max(...outline.map((p) => Math.hypot(p.x - c.x, p.z - c.z))) };
  })
  .filter((p) => inPark(p.c))
  .sort((a, b) => b.r - a.r);
const inPond = (p) => ponds.some((w) => inPoly(p, w.outline));
const pondEdge = (p) => Math.min(...ponds.map((w) => {
  let d = Infinity;
  for (let i = 0, j = w.outline.length - 1; i < w.outline.length; j = i++) d = Math.min(d, segDist(p, w.outline[j], w.outline[i]));
  return inPoly(p, w.outline) ? -d : d;
}));

const pointHash = new Hash();
const points = [
  ...city.collectibles.map((c) => ({ ...c.at, r: 8 })),
  ...city.breakables.map((b) => ({ ...b.at, r: 6 })),
  ...city.pillars.map((p) => ({ ...p.at, r: 3 })),
  ...city.furniture.filter((f) => f.kind === 'lamp' || f.kind === 'sign').map((f) => ({ ...f.at, r: 2.5 })),
]
  .map((p) => ({ x: p.x / M, z: p.z / M, r: p.r }))
  .filter(inBox);
for (const p of points) pointHash.add(p, p.x, p.z, p.r);
const nearPoint = (p, pad) => [...pointHash.near(p.x, p.z, 10 + pad)].some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + pad);

// ---- Footprints ----------------------------------------------------------------

/** The editor's sizes (`tools/propeditor.html`), across (`w`) and along (`l`) a piece's heading. */
const SIZE = {
  bench: [1.2, 3.6], bin: [1.2, 1.2], 'picnic-table': [3.6, 4.4], telescope: [1, 1], kiosk: [4.8, 4], 'food-truck': [4.6, 13],
  fountain: [14.4, 14.4], statue: [4.4, 4.4], planter: [4.8, 2.4], playground: [28, 20], boathouse: [11.2, 16],
  jetty: [3.8, 28.8], 'rowing-boat': [2.6, 7.2], 'football-pitch': [70, 110], 'tennis-court': [28.8, 57.6],
  'picnic-shelter': [9.6, 7.4], 'beach-hut': [3.5, 4.2], 'lifeguard-tower': [3.8, 7], lighthouse: [9, 27], railing: [10, 0.3],
  cafe: [11.2, 19.2], 'toilet-block': [8, 12.8], bandstand: [15.4, 15.4],
};
const ROUND = new Set(['bin', 'telescope', 'fountain', 'bandstand']);
const GROUND = new Set(['path', 'plaza', 'beach']);
const sizeOf = (p) => {
  if (GROUND.has(p.kind)) {
    const [w, l] = TIDEWATER_GROUND_SIZES[p.kind][p.variant];
    return [p.w ?? w, l];
  }
  return PAD_SIZES[p.kind] ?? SIZE[p.kind] ?? [4, 4];
};

/** A piece's footprint, grown by `pad`: a circle or four corners. */
function footprint(p, pad = 0) {
  const [w, l] = sizeOf(p);
  if (ROUND.has(p.kind)) return { round: true, x: p.x, z: p.z, r: Math.max(w, l) / 2 + pad };
  const s = Math.sin(p.angle), c = Math.cos(p.angle);
  // The lighthouse's footprint runs back from its tower over the keeper's store.
  const shift = p.kind === 'lighthouse' ? -9 : 0;
  return { round: false, x: p.x + s * shift, z: p.z + c * shift, s, c, hw: w / 2 + pad, hl: (p.kind === 'lighthouse' ? 13.5 : l / 2) + pad };
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
const hitsTaken = (q, ignore) => [...taken.near(q.x, q.z, 2)].some((t) => t.kind !== ignore && inPrint(t.f, q));

const why = new Map();
const refuse = (kind, reason) => {
  if (!why.has(kind)) why.set(kind, new Map());
  why.get(kind).set(reason, (why.get(kind).get(reason) ?? 0) + 1);
  return false;
};

/**
 * Can this piece stand here? Its footprint, grown by `pad`, has to be in the
 * park, dry, out of the ponds, off every road by `road` metres, off every race
 * line by `race`, off the tunnel's line if it is a pad, and on nothing placed.
 */
function fits(p, { pad = 1, road = 3, race = 14, water = false, park = true, pond = true, lamps = true, ignore = null } = {}) {
  const f = footprint(p, pad);
  for (const q of samples(f)) {
    if (park && !inPark(q)) return refuse(p.kind, 'outside the park');
    if (!water && wet(q)) return refuse(p.kind, 'in the water');
    if (pond && inPond(q)) return refuse(p.kind, 'in a pond');
    if (roadEdge(q) < road) return refuse(p.kind, 'on a road');
    if (race > 0 && raceDist(q) < race) return refuse(p.kind, 'on a race line');
    if (PAD_SIZES[p.kind] && tunnelEdge(q) < TUNNEL_CLEAR) return refuse(p.kind, 'over the tunnel');
    if (lamps && nearPoint(q, 0.5)) return refuse(p.kind, 'on a lamp or a collectible');
    if (hitsTaken(q, ignore)) return refuse(p.kind, 'on something placed');
  }
  return true;
}

const out = [];
let next = 1;
function put(p, pad = 1) {
  const prop = { id: `tw${next++}`, kind: p.kind, x: r1(p.x), z: r1(p.z), angle: r3(p.angle) };
  if (p.w != null) prop.w = r1(p.w);
  if (p.variant) prop.variant = p.variant;
  if (p.note) prop.note = p.note;
  out.push(prop);
  if (!GROUND.has(p.kind)) take(footprint(prop, pad), p.kind);
  return prop;
}

/**
 * Put a piece as near `at` as it fits: out in rings to `radius`, trying each
 * heading in `angles` (or the one `angleAt` gives for where it stands).
 */
function placeNear(kind, at, { radius = 80, step = 6, angles = [0], angleAt = null, variant, note, opts = {}, pad = 1 } = {}) {
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

const [bigPond, smallPond] = ponds;
const toward = (from, to) => facing(to.x - from.x, to.z - from.z);
const KEPT = Object.fromEntries(kept.filter((p) => ['cafe', 'bandstand', 'toilet-block'].includes(p.kind)).map((p) => [p.kind, p]));

// ---- Footpath helpers, and the rings round the ponds first -----------------------

/**
 * A path from `a` to `b`, in straight pieces of at most 30 m overlapping at
 * the joints. A piece that would cross a pond, a building or the water is
 * left out, and a piece running along a road rather than across it too.
 */
const PATH_W = TIDEWATER_GROUND_SIZES.path.path[1];
let pathPieces = 0;
function path(a, b, { ignore = null, force = false } = {}) {
  const placed = [];
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 6) return placed;
  const n = Math.max(1, Math.ceil(len / 30));
  for (let i = 0; i < n; i++) {
    const p0 = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n };
    const p1 = { x: a.x + ((b.x - a.x) * (i + 1)) / n, z: a.z + ((b.z - a.z) * (i + 1)) / n };
    const piece = { kind: 'path', variant: 'path', x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2, angle: across(p1.x - p0.x, p1.z - p0.z), w: len / n + PATH_W };
    const f = footprint(piece, 0);
    const pts = samples(f, 2);
    if (pts.some((q) => wet(q) || inPond(q))) { refuse('path', 'into the water'); continue; }
    // A ring round a pond (`force`) is laid before anything else and wins:
    // what stood on its line is moved off it. Every other path joins the
    // rings rather than stopping short of them.
    const solid = (t) => t.kind !== ignore && t.kind !== 'ring' && !GROUND.has(t.kind) && t.kind !== 'plaza';
    if (!force && pts.some((q) => [...taken.near(q.x, q.z, 2)].some((t) => solid(t) && inPrint(t.f, q)))) { refuse('path', 'through something placed'); continue; }
    if (pts.filter((q) => roadEdge(q) < 0).length > pts.length * 0.3) { refuse('path', 'along a road'); continue; }
    placed.push(put({ ...piece, note: pathPieces++ ? undefined : 'Footpaths, in straight pieces that overlap at the joints' }));
  }
  return placed;
}
/** A ring round a pond, `gap` off its furthest shore. */
function ring(pond, gap, opts = {}) {
  const r = pond.r + gap;
  const n = Math.ceil((2 * Math.PI * r) / 28);
  const placed = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 2 * Math.PI, a1 = ((k + 1) / n) * 2 * Math.PI;
    placed.push(...path({ x: pond.c.x + Math.cos(a0) * r, z: pond.c.z + Math.sin(a0) * r }, { x: pond.c.x + Math.cos(a1) * r, z: pond.c.z + Math.sin(a1) * r }, opts));
  }
  return placed;
}
/** From a point to the nearest drive's edge. */
function toDrive(p) {
  const e = nearestRoadEdge(p);
  if (e && e.d < 160) path(p, e.at);
}
/** The point on a pond's ring nearest `p`. */
const onRing = (pond, gap, p) => {
  const d = unit(p.x - pond.c.x, p.z - pond.c.z);
  return { x: pond.c.x + d.x * (pond.r + gap), z: pond.c.z + d.z * (pond.r + gap) };
};
const front = (p, by) => ({ x: p.x + Math.sin(p.angle) * by, z: p.z + Math.cos(p.angle) * by });

// The owner's call: the path round the big pond closes, and the buildings
// move for it. The rings go down before anything else, the big pond's far
// enough out for the boathouse to stand between it and the water; whatever
// was placed by hand on a ring's line moves off it, towards the water if it
// stood inside the ring (a bench by the shore) and away from it if not.
const RING_GAP = [16, 12];
const ringPieces = ponds.slice(0, 2).flatMap((pond, i) => ring(pond, RING_GAP[i], { force: true }));
const ringPrints = ringPieces.map((p) => footprint(p, 0));
const onARing = (f) => samples(f, 2).some((q) => ringPrints.some((r) => inPrint(r, q)));
const moved = [];
for (const p of kept) {
  if (GROUND.has(p.kind) || !onARing(footprint(p, 1))) continue;
  const i = ponds.slice(0, 2).reduce((best, w, k) => (Math.hypot(p.x - w.c.x, p.z - w.c.z) < Math.hypot(p.x - ponds[best].c.x, p.z - ponds[best].c.z) ? k : best), 0);
  const pond = ponds[i];
  const d = unit(p.x - pond.c.x, p.z - pond.c.z);
  const r0 = Math.hypot(p.x - pond.c.x, p.z - pond.c.z);
  const sign = r0 < pond.r + RING_GAP[i] ? -1 : 1;
  for (let step = 1; step <= 60; step++) {
    const r = r0 + sign * step;
    const q = { ...p, x: pond.c.x + d.x * r, z: pond.c.z + d.z * r };
    const f = footprint(q, 1);
    if (onARing(f)) continue;
    if (samples(f).some((t) => wet(t) || inPond(t) || roadEdge(t) < 3)) continue;
    moved.push(`${p.kind} ${p.id} ${step} m ${sign < 0 ? 'in' : 'out'}`);
    p.x = r1(q.x);
    p.z = r1(q.z);
    break;
  }
}
for (const p of kept) take(footprint(p, 1), p.kind);
for (const p of ringPieces) take(footprint(p, 1), 'ring');

// ---- The pitches, the courts and the playground: the biggest first --------------

// Off the race lines by more than a bench, since a pad changes the ground.
const PAD_OPTS = { pad: 2, road: 8, race: 20 };
const pitch = placeNear('football-pitch', { x: 520, z: -2790 }, { radius: 200, step: 8, angles: [0, Math.PI / 2, 0.3, -0.3, Math.PI / 2 + 0.3, Math.PI / 2 - 0.3], opts: PAD_OPTS, note: 'The football pitch, on a levelled pad' });
// A pair of courts side by side, sharing a fence line.
let courts = null;
for (const at of [{ x: 800, z: -2890 }, { x: 900, z: -2700 }, { x: 250, z: -2850 }]) {
  for (let r = 0; r <= 120 && !courts; r += 8) {
    const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 8);
    for (let k = 0; k < n && !courts; k++) {
      const c = { x: at.x + Math.cos((k / n) * 2 * Math.PI) * r, z: at.z + Math.sin((k / n) * 2 * Math.PI) * r };
      for (const angle of [0, Math.PI / 2, 0.4, -0.4]) {
        const off = { x: Math.cos(angle) * 15.4, z: -Math.sin(angle) * 15.4 };
        const a = { kind: 'tennis-court', x: c.x - off.x, z: c.z - off.z, angle };
        const b = { kind: 'tennis-court', x: c.x + off.x, z: c.z + off.z, angle };
        if (!fits(a, PAD_OPTS) || !fits(b, PAD_OPTS)) continue;
        courts = [put({ ...a, note: 'Tennis courts, a fenced pair on a levelled pad' }, 2), put(b, 2)];
        break;
      }
    }
  }
  if (courts) break;
}
const playground = placeNear('playground', { x: 470, z: -2700 }, { radius: 160, angles: [0, Math.PI / 2, Math.PI, -Math.PI / 2], opts: PAD_OPTS, note: 'The playground, by the big pond' });

// ---- The fountain plaza by the café --------------------------------------------

let plaza = null;
if (KEPT.cafe) {
  const cafe = KEPT.cafe;
  // The café's terrace side faces the plaza: try the ground round it, nearest first.
  for (let r = 30; r <= 90 && !plaza; r += 5) {
    for (let k = 0; k < 24 && !plaza; k++) {
      const a = (k / 24) * 2 * Math.PI;
      const at = { x: cafe.x + Math.cos(a) * r, z: cafe.z + Math.sin(a) * r };
      for (const angle of [0, Math.PI / 2]) {
        const p = { kind: 'plaza', x: at.x, z: at.z, angle, variant: 'medium' };
        if (!fits(p, { pad: 0, road: 4, race: 12 })) continue;
        plaza = put({ ...p, note: 'The fountain plaza by the café' });
        take(footprint(plaza, 0), 'plaza');
        break;
      }
    }
  }
}
if (plaza) {
  const s = Math.sin(plaza.angle), c = Math.cos(plaza.angle);
  const local = (u, v) => ({ x: plaza.x + u * c + v * s, z: plaza.z - u * s + v * c });
  const set = (kind, u, v, angle, variant) => {
    const q = local(u, v);
    const p = { kind, x: q.x, z: q.z, angle, variant };
    if (fits(p, { pad: 0.3, road: 2, race: 10, ignore: 'plaza' })) put(p, 0.3);
  };
  set('fountain', 0, 0, plaza.angle);
  set('statue', -16, 0, plaza.angle + Math.PI / 2, 'figure');
  for (const [u, v] of [[-19, -14], [19, -14], [-19, 14], [19, 14]]) set('planter', u, v, plaza.angle);
  // Benches round the fountain, facing it.
  for (const [u, v] of [[0, -11], [0, 11], [11, 0], [-11, 6], [-11, -6]]) {
    const q = local(u, v);
    set('bench', u, v, across(plaza.x - q.x, plaza.z - q.z));
  }
  set('bin', 6, -11, 0);
  set('bin', -6, 11, 0);
}

// ---- The boathouse, the jetty and the boats on the big pond ---------------------

/** Where a ray from the pond's middle at `a` leaves the water. */
function shoreAt(pond, a) {
  const d = { x: Math.cos(a), z: Math.sin(a) };
  let r = 0;
  while (r < pond.r + 5 && inPoly({ x: pond.c.x + d.x * r, z: pond.c.z + d.z * r }, pond.outline)) r += 0.5;
  return { at: { x: pond.c.x + d.x * r, z: pond.c.z + d.z * r }, d, r };
}
let boathouse = null, jetty = null;
if (bigPond) {
  for (let k = 0; k < 36 && !boathouse; k++) {
    // The north-east shore first, round from there.
    const a = -Math.PI / 4 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 18) + Math.PI / 2;
    const { at, d } = shoreAt(bigPond, a);
    const house = { kind: 'boathouse', x: at.x + d.x * 9, z: at.z + d.z * 9, angle: facing(-d.x, -d.z) };
    // Beside it, along the shore, the jetty runs out into the water.
    const side = { x: -d.z, z: d.x };
    const foot = { x: at.x + side.x * 12, z: at.z + side.z * 12 };
    const pier = { kind: 'jetty', x: foot.x - d.x * 12, z: foot.z - d.z * 12, angle: facing(-d.x, -d.z) };
    if (!fits(house, { pad: 1, road: 6, race: 14, pond: false, water: true })) continue;
    if (!fits(pier, { pad: 0.5, road: 6, race: 14, pond: false, water: true })) continue;
    // The house's front at the water's edge, not out in it.
    if (samples(footprint(house, 0)).filter(wet).length > 6) { refuse('boathouse', 'out in the pond'); continue; }
    boathouse = put({ ...house, note: 'The boathouse on the big pond' });
    jetty = put({ ...pier, note: 'Its jetty' }, 0.5);
    // Two boats moored along the jetty, one on each side.
    const back = { x: -d.x, z: -d.z };
    for (const [u, v] of [[4.6, 4], [-4.6, -2]]) {
      const q = { x: pier.x + side.x * u + back.x * v, z: pier.z + side.z * u + back.z * v };
      const boat = { kind: 'rowing-boat', x: q.x, z: q.z, angle: pier.angle, variant: u > 0 ? 'green' : 'white' };
      if (fits(boat, { pad: 0.3, road: 6, race: 0, pond: false, water: true, park: true }) && inPond(q)) put(boat, 0.3);
    }
  }
  // And three out on the water, well off the shore.
  const out_ = [[0.3, 0.45, 'red'], [2.2, 0.35, 'blue'], [4.2, 0.5, 'white']];
  for (const [a, f, variant] of out_) {
    const { r } = shoreAt(bigPond, a);
    const q = { x: bigPond.c.x + Math.cos(a) * r * f, z: bigPond.c.z + Math.sin(a) * r * f };
    const boat = { kind: 'rowing-boat', x: q.x, z: q.z, angle: a * 1.7, variant };
    if (fits(boat, { pad: 1, road: 6, race: 0, pond: false, water: true }) && samples(footprint(boat, 1)).every(inPond)) put(boat, 0.3);
  }
}

// ---- Picnic shelters, the kiosk and the food trucks ------------------------------

const LAWN_OPTS = { pad: 1.5, road: 6, race: 16 };
const shelters = [];
for (const at of [{ x: 480, z: -2600 }, { x: 890, z: -2700 }, { x: 210, z: -2760 }]) {
  const s = placeNear('picnic-shelter', at, { radius: 90, angles: [0, Math.PI / 2, 0.8, -0.8], opts: LAWN_OPTS, pad: 2, note: shelters.length ? undefined : 'Picnic shelters: breakable' });
  if (s) shelters.push(s);
}
const band = KEPT.bandstand;
if (band) {
  placeNear('kiosk', { x: band.x + 22, z: band.z - 4 }, { radius: 40, angleAt: (q) => toward(q, band), variant: 'blue', opts: LAWN_OPTS, note: 'The ice-cream kiosk by the bandstand' });
  // The food trucks on the nearest drive's verge, hatch side to the lawn.
  const edge = nearestRoadEdge(band);
  if (edge) {
    const along = unit(edge.s.b.x - edge.s.a.x, edge.s.b.z - edge.s.a.z);
    const outward = unit(band.x - edge.at.x, band.z - edge.at.z);
    for (const shift of [0, 18, -18, 36, -36, 54, -54]) {
      if (out.filter((p) => p.kind === 'food-truck').length >= 2) break;
      const q = { x: edge.at.x + along.x * shift + outward.x * 6, z: edge.at.z + along.z * shift + outward.z * 6 };
      // Its left side (the hatch) faces the lawn: heading along the road.
      const left = { x: -Math.cos(facing(along.x, along.z)), z: Math.sin(facing(along.x, along.z)) };
      const heading = left.x * outward.x + left.z * outward.z > 0 ? facing(along.x, along.z) : facing(-along.x, -along.z);
      const truck = { kind: 'food-truck', x: q.x, z: q.z, angle: heading, variant: ['yellow', 'teal'][out.filter((p) => p.kind === 'food-truck').length] };
      if (fits(truck, { pad: 1, road: 2.5, race: 12 })) put(truck);
    }
  }
}

// ---- The shore: promenade, railing, beach, huts, lifeguard, telescopes ------------

// Samples along the park's roads every 8 m, and for each the side the sea is
// on and how far: the coast road is the road with the sea close on one side.
const coast = [];
for (const s of roads) {
  if (s.a.level === 'tunnel' || s.b.level === 'tunnel' || s.road.class === 'interstate' || s.road.class === 'ramp') continue;
  const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
  const dir = unit(s.b.x - s.a.x, s.b.z - s.a.z);
  for (let t = 0; t < len; t += 8) {
    const p = { x: s.a.x + dir.x * t, z: s.a.z + dir.z * t };
    if (!inBox(p)) continue;
    for (const sign of [-1, 1]) {
      const n = { x: -dir.z * sign, z: dir.x * sign };
      // The road may run just outside the park's outline where its shore is
      // inside it, out to the point: what counts is the ground seaward of it.
      if (!inPark({ x: p.x + n.x * (s.half + 40), z: p.z + n.z * (s.half + 40) })) continue;
      let d = s.half;
      let blocked = false;
      // The sea, not a pond: the north drive has the big pond close on its side.
      const sea = (q) => wet(q) && !inPond(q);
      while (d < 240 && !sea({ x: p.x + n.x * d, z: p.z + n.z * d })) {
        // Another road between this one and the water: this is not the coast road.
        if (d > s.half + 4 && roadEdge({ x: p.x + n.x * d, z: p.z + n.z * d }, 30) < 0) { blocked = true; break; }
        d += 2;
      }
      // The park's shore faces south: a drive running down to it has the sea
      // off its end, not its side.
      if (!blocked && d < 240 && n.z < -0.5) coast.push({ p, n, dir, half: s.half, sea: d, road: s });
    }
  }
}
coast.sort((a, b) => a.p.x - b.p.x);
const PROM = TIDEWATER_GROUND_SIZES.path.promenade[1];
const PROM_OFF = 3; // off the carriageway's edge, over its verge
// The promenade runs where there is room for it and a beach below it.
const prom = coast.filter((k) => k.sea - k.half - PROM_OFF - PROM > 12);
// Thin the samples to one every ~24 m along the coast, in order along it.
const promLine = [];
for (const k of prom) {
  const c = { x: k.p.x + k.n.x * (k.half + PROM_OFF + PROM / 2), z: k.p.z + k.n.z * (k.half + PROM_OFF + PROM / 2) };
  if (promLine.length && Math.hypot(c.x - promLine.at(-1).c.x, c.z - promLine.at(-1).c.z) < 24) continue;
  promLine.push({ ...k, c });
}
// Pieces between consecutive centres, overlapping at the joints; a gap of
// more than 40 m (the road leaves the shore, a junction) breaks the line.
const promPieces = [];
for (let i = 1; i < promLine.length; i++) {
  const a0 = promLine[i - 1].c, b0 = promLine[i].c;
  const span = Math.hypot(b0.x - a0.x, b0.z - a0.z);
  // A gap of more than 90 m is the road leaving the shore; a shorter one (a
  // junction's mouth) is bridged, in pieces of no more than 40 m.
  if (span > 90) continue;
  const parts = Math.ceil(span / 40);
  for (let j = 0; j < parts; j++) {
  const a = { x: a0.x + ((b0.x - a0.x) * j) / parts, z: a0.z + ((b0.z - a0.z) * j) / parts };
  const b = { x: a0.x + ((b0.x - a0.x) * (j + 1)) / parts, z: a0.z + ((b0.z - a0.z) * (j + 1)) / parts };
  const len = span / parts;
  const p = { kind: 'path', variant: 'promenade', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, angle: across(b.x - a.x, b.z - a.z), w: len + 4 };
  // A lamp on the verge stands on the promenade, as a seafront's do.
  if (!fits(p, { pad: 0, road: 0.5, race: 0, water: true, park: false, lamps: false })) continue;
  // Seaward, square to this piece rather than to the road it was measured from.
  const along = unit(b.x - a.x, b.z - a.z);
  const side = along.z * promLine[i].n.x - along.x * promLine[i].n.z > 0 ? 1 : -1;
  const n = { x: along.z * side, z: -along.x * side };
  promPieces.push({ piece: put({ ...p, note: promPieces.length ? undefined : 'The promenade, along the seaward side of the coast road' }), k: { ...promLine[i], n, dir: along }, a, b });
  }
}
// The beach below it: from the promenade's seaward edge out past the water's
// edge, in pieces along the shore. Where the sand is deeper than the deepest
// piece, a second row goes behind the first, overlapping it.
const DEPTHS = Object.entries(TIDEWATER_GROUND_SIZES.beach).sort((a, b) => a[1][1] - b[1][1]);
const beachPieces = [];
/** Sand from the promenade line between `a` and `b` out to the sea, `k` the coast there. */
function beachAt(k, a, b) {
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  // From the promenade's centre line: sand from its seaward edge to 6 m into the water.
  const back = PROM / 2;
  let outer = k.sea - k.half - PROM_OFF - PROM / 2 + 6;
  let first = true;
  while (outer - back > 1) {
    const depth = outer - back;
    const [variant, [, l]] = DEPTHS.find(([, s]) => s[1] >= depth) ?? DEPTHS.at(-1);
    const from = Math.max(back, outer - l);
    const c = { x: mid.x + k.n.x * (from + l / 2), z: mid.z + k.n.z * (from + l / 2) };
    const p = { kind: 'beach', variant, x: c.x, z: c.z, angle: facing(k.n.x, k.n.z), w: len + 24 };
    outer = from + 2;
    if (!fits(p, { pad: 0, road: 1, race: 0, water: true, park: false })) break;
    const piece = put({ ...p, note: beachPieces.length ? undefined : 'The beach below the promenade' });
    if (first) beachPieces.push({ piece, k, mid, back });
    first = false;
    if (from === back) break;
  }
}
for (const { k, a, b } of promPieces) beachAt(k, a, b);
// And on past the promenade's east end, out to the point, where the coast
// road runs just outside the park: the sand goes the whole way (the owner's
// call), from where the promenade line would run down to the sea.
if (promPieces.length) {
  const { k, b } = promPieces.at(-1);
  for (let j = 0; j < 8; j++) {
    const a = { x: b.x + k.dir.x * 30 * j, z: b.z + k.dir.z * 30 * j };
    const e = { x: a.x + k.dir.x * 30, z: a.z + k.dir.z * 30 };
    const m = { x: (a.x + e.x) / 2, z: (a.z + e.z) / 2 };
    let d = 0;
    while (d < 240 && !(wet({ x: m.x + k.n.x * d, z: m.z + k.n.z * d }) && !inPond({ x: m.x + k.n.x * d, z: m.z + k.n.z * d }))) d += 2;
    if (d < PROM / 2 + 6 || d >= 240 || !inPark({ x: m.x + k.n.x * (d / 2), z: m.z + k.n.z * (d / 2) })) break;
    beachAt({ ...k, sea: d + k.half + PROM_OFF + PROM / 2 }, a, e);
  }
}
// The railing along the promenade's seaward edge, with a gap down to the
// beach every fifth length.
let railCount = 0;
for (const { k, a, b } of promPieces) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const pieces = Math.max(1, Math.round(len / 10));
  for (let j = 0; j < pieces; j++) {
    if (railCount++ % 5 === 4) continue;
    const t = (j + 0.5) / pieces;
    const q = { x: a.x + (b.x - a.x) * t + k.n.x * (PROM / 2 - 0.5), z: a.z + (b.z - a.z) * t + k.n.z * (PROM / 2 - 0.5) };
    const rail = { kind: 'railing', x: q.x, z: q.z, angle: across(b.x - a.x, b.z - a.z), w: undefined };
    if (fits(rail, { pad: 0, road: 2, race: 12, water: true, park: false })) put(rail, 0.2);
  }
}
// Benches on the promenade facing the sea, and coin telescopes, by turns.
let seat = 0;
for (const { k, a, b } of promPieces) {
  const q = { x: (a.x + b.x) / 2 + k.n.x * (PROM / 2 - 3), z: (a.z + b.z) / 2 + k.n.z * (PROM / 2 - 3) };
  const which = seat++ % 6;
  if (which === 1 || which === 3) continue;
  const p = which === 4
    ? { kind: 'telescope', x: q.x, z: q.z, angle: facing(k.n.x, k.n.z) }
    : { kind: 'bench', x: q.x, z: q.z, angle: across(k.n.x, k.n.z) };
  if (fits(p, { pad: 0.3, road: 2, race: 12, water: true, park: false })) put(p, 0.3);
}
// The beach huts: a row at the back of the widest stretch of sand, doors to
// the sea, and the lifeguard tower out on the sand along from them.
const HUT_COLOURS = ['blue', 'yellow', 'red', 'green', 'mint', 'pink'];
const widest = [...beachPieces].sort((x, y) => y.k.sea - x.k.sea);
let huts = 0;
for (const { k, mid, back } of widest) {
  if (huts >= 14) break;
  const along = k.dir;
  for (let j = -2; j <= 2 && huts < 14; j++) {
    const q = { x: mid.x + along.x * j * 5.5 + k.n.x * (Math.max(back, PROM / 2) + 5), z: mid.z + along.z * j * 5.5 + k.n.z * (Math.max(back, PROM / 2) + 5) };
    const hut = { kind: 'beach-hut', x: q.x, z: q.z, angle: facing(k.n.x, k.n.z), variant: HUT_COLOURS[huts % HUT_COLOURS.length] };
    if (fits(hut, { pad: 0.6, road: 4, race: 14, water: false, park: false })) {
      put({ ...hut, note: huts ? undefined : 'Beach huts at the back of the sand' }, 0.6);
      huts++;
    }
  }
}
for (const { k, mid } of widest.slice(Math.floor(widest.length / 3))) {
  const q = { x: mid.x + k.n.x * (k.sea - k.half - PROM_OFF - PROM / 2 - 14), z: mid.z + k.n.z * (k.sea - k.half - PROM_OFF - PROM / 2 - 14) };
  const tower = { kind: 'lifeguard-tower', x: q.x, z: q.z, angle: facing(k.n.x, k.n.z), note: 'The lifeguard tower' };
  if (fits(tower, { pad: 1, road: 4, race: 14, water: false, park: false })) { put(tower); break; }
}

// ---- The lighthouse on the point -----------------------------------------------

{
  // The park's eastern point: the dry ground furthest east and south, a
  // little back from the water, facing out to sea.
  let best = null;
  for (let x = BOX.maxX; x > BOX.maxX - 500; x -= 4) {
    for (let z = BOX.minZ; z < BOX.minZ + 500; z += 4) {
      const q = { x, z };
      if (!inPark(q) || wet(q) || ground(q) < 0.4) continue;
      const score = x - z * 0.6;
      if (best && score <= best.score) continue;
      best = { q, score };
    }
  }
  if (best) {
    // Out to sea is the way to the nearest water.
    let sea = null;
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 36) {
      for (let r = 2; r < 80; r += 2) {
        if (wet({ x: best.q.x + Math.cos(a) * r, z: best.q.z + Math.sin(a) * r })) {
          if (!sea || r < sea.r) sea = { a, r };
          break;
        }
      }
    }
    const d = sea ? { x: Math.cos(sea.a), z: Math.sin(sea.a) } : { x: 1, z: -1 };
    const at = { x: best.q.x - d.x * 18, z: best.q.z - d.z * 18 };
    placeNear('lighthouse', at, { radius: 60, step: 4, angleAt: () => facing(d.x, d.z), opts: { pad: 1, road: 6, race: 16, park: false }, note: 'The lighthouse on the point' });
  }
}

// ---- Footpaths -------------------------------------------------------------------

// The rings are down already; these join them to the drives.
ponds.slice(0, 2).forEach((pond, i) => {
  for (const a of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) toDrive({ x: pond.c.x + Math.cos(a) * (pond.r + RING_GAP[i]), z: pond.c.z + Math.sin(a) * (pond.r + RING_GAP[i]) });
});
if (plaza) {
  if (bigPond) path(plaza, onRing(bigPond, RING_GAP[0], plaza), { ignore: 'fountain' });
  if (band) path(plaza, band, { ignore: 'bandstand' });
  toDrive(plaza);
}
if (band) toDrive(band);
if (KEPT.cafe) toDrive(front(KEPT.cafe, 0));
if (playground) {
  if (bigPond) path(playground, onRing(bigPond, RING_GAP[0], playground), { ignore: 'playground' });
  toDrive(playground);
}
if (pitch) toDrive(pitch);
if (courts) toDrive({ x: (courts[0].x + courts[1].x) / 2, z: (courts[0].z + courts[1].z) / 2 });
for (const s of shelters) toDrive(s);

// ---- Picnic tables, with a bin to each group -------------------------------------

const lawnSpots = [
  ...shelters.map((s) => ({ x: s.x, z: s.z })),
  ...(bigPond ? [0.6, 2.4, 3.9].map((a) => ({ x: bigPond.c.x + Math.cos(a) * (bigPond.r + 30), z: bigPond.c.z + Math.sin(a) * (bigPond.r + 30) })) : []),
  ...(smallPond ? [1.2, 4.4].map((a) => ({ x: smallPond.c.x + Math.cos(a) * (smallPond.r + 28), z: smallPond.c.z + Math.sin(a) * (smallPond.r + 28) })) : []),
];
for (const spot of lawnSpots) {
  let n = 0;
  for (let r = 10; r <= 40 && n < 3; r += 5) {
    for (let k = 0; k < 8 && n < 3; k++) {
      const a = (k / 8) * 2 * Math.PI + r;
      const p = { kind: 'picnic-table', x: spot.x + Math.cos(a) * r, z: spot.z + Math.sin(a) * r, angle: r3(a * 2.3) };
      if (fits(p, { pad: 2, road: 6, race: 14 })) { put(p, 2); n++; }
    }
  }
  if (n) placeNear('bin', { x: spot.x + 6, z: spot.z + 6 }, { radius: 20, step: 3, opts: { pad: 0.3, road: 3, race: 12 } });
}

// ---- Benches and bins along the drives -------------------------------------------

// Along both sides of the park's own drives, every 45 m, facing the lawn.
// A drive a race runs down keeps its verges clear where the racing line is
// not straight: within 32 m of a junction, or of a bend of more than 12
// degrees, where the reference driver cuts in.
const degree = new Map();
for (const r of city.roads) for (const n of [r.a, r.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
const turnAt = new Map();
for (const s of roads) for (const [n, o] of [[s.a, s.b], [s.b, s.a]]) {
  if (!turnAt.has(n.i)) turnAt.set(n.i, []);
  turnAt.get(n.i).push(unit(o.x - n.x, o.z - n.z));
}
const bendy = (p) => {
  for (const s of roads) for (const n of [s.a, s.b]) {
    if (Math.hypot(n.x - p.x, n.z - p.z) > 32) continue;
    if (degree.get(n.i) !== 2) return true;
    const [u, v] = turnAt.get(n.i) ?? [];
    if (u && v && Math.acos(Math.max(-1, Math.min(1, -(u.x * v.x + u.z * v.z)))) > (12 * Math.PI) / 180) return true;
  }
  return false;
};
let drivePairs = 0;
for (const s of roads) {
  if (s.a.level === 'tunnel' || s.b.level === 'tunnel' || s.road.class !== 'street') continue;
  if (!inPark(s.a) && !inPark(s.b)) continue;
  const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
  const dir = unit(s.b.x - s.a.x, s.b.z - s.a.z);
  for (let t = 20; t < len - 10; t += 45) {
    const p = { x: s.a.x + dir.x * t, z: s.a.z + dir.z * t };
    if (!inPark(p)) continue;
    const raced = raceDist(p) < s.half + 2;
    if (raced && bendy(p)) { refuse('bench', 'by a bend in a race'); continue; }
    for (const sign of [-1, 1]) {
      const n = { x: -dir.z * sign, z: dir.x * sign };
      const q = { x: p.x + n.x * (s.half + 4), z: p.z + n.z * (s.half + 4) };
      // Facing the lawn, back to the drive.
      const bench = { kind: 'bench', x: q.x, z: q.z, angle: across(n.x, n.z) };
      if (!fits(bench, { pad: 0.3, road: 2.5, race: raced ? s.half + 2.5 : 8 })) continue;
      put(bench, 0.3);
      if (drivePairs++ % 2 === 0) {
        const b = { kind: 'bin', x: q.x + dir.x * 3, z: q.z + dir.z * 3, angle: 0 };
        if (fits(b, { pad: 0.2, road: 2.5, race: raced ? s.half + 2.5 : 8 })) put(b, 0.2);
      }
    }
  }
}

// ---- Report and write ------------------------------------------------------------

const counts = {};
for (const p of out) counts[`${p.kind}${p.variant && GROUND.has(p.kind) ? ` (${p.variant})` : ''}`] = (counts[`${p.kind}${p.variant && GROUND.has(p.kind) ? ` (${p.variant})` : ''}`] ?? 0) + 1;
console.log(`Tidewater Park once-over: ${out.length} props (${kept.length} kept)`);
for (const m of moved) console.log(`  moved off a ring: ${m}`);
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
