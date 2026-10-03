// Draft downtown's once-over into its props file.
//
// Downtown was signed off with its buildings and nothing else (#268): 451
// buildings and 11 landmarks, lamps and signs along its streets, and not a
// tree, a bench or a bin, where every other district had at least trees in its
// verges. The owner's picks (2026-10-02), placed here so the area editor
// starts from something:
//
// - Streets: street trees down the pavements, bus shelters on the boulevards
//   and main roads, benches with a bin beside them along the pavements.
// - Squares (city hall's and the gallery's): a fountain, a statue or an
//   obelisk, a kiosk with café tables round it, bollards and planters along
//   the edge that faces the road, and a food truck on the square.
// - Clutter: dumpsters behind the old core's buildings, food trucks by the
//   stadium, and two building sites (a crane, cabins, a heap, cones and a
//   hoarding of blast walls) on the biggest gaps left.
// - Lawns: a handful of pocket parks on the next biggest gaps, grass in the
//   paving (`city/downtownground.ts`), with trees and benches.
//
// Everything is placed clear of every carriageway, building, race line, jump,
// collectible, breakable, freeway pillar and the water, and clear of each
// other. Café tables are breakables, numbered on after everything before them;
// downtown's props load last (`generate.ts`), so they move no other area's
// ids. This tool's own ids (`do…`) are replaced on a re-run and everything else
// in the file is kept. Then `npm run propsync -- --place downtown`.
//
// Usage:
//   npm run downtowndraft          # write docs/downtown-props-edited.json
//   npm run downtowndraft -- --dry # count, write nothing
//   npm run downtowndraft -- --dry --why # and why each kind was refused where it was
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const FILE = 'docs/downtown-props-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { CITY_SEED, UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_DISTRICTS } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { cellRandom } = await server.ssrLoadModule('/src/game/city/highmoor.ts');
const { LAWN_SIZES } = await server.ssrLoadModule('/src/game/city/downtownground.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const mine = (id) => /^do\d/.test(id ?? '');
const kept = (old.props ?? []).filter((p) => !mine(p.id));

// Everything here is in metres.
const AREA = PLAN_DISTRICTS.find((a) => a.kind === 'downtown').poly.map((p) => ({ x: p.x / M, z: p.z / M }));
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
const inDowntown = (p) => inPoly(p, AREA);
const wet = (p) => inWater(city, p.x * M, p.z * M);
const ground = (p) => groundAt(city.terrain, p.x * M, p.z * M) / M;
const segDist = (p, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z);
};
const facing = (dx, dz) => Math.atan2(dx, dz);
/**
 * A bench's heading, to face it along (`dx`, `dz`): its seat runs along its
 * heading and it faces across it, to its right (+x in its own frame, which a
 * heading `a` turns to (cos a, -sin a)).
 */
const benchFacing = (dx, dz) => Math.atan2(-dz, dx);
const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;

// ---- A spatial hash, for "is anything near here" over thousands of things ------

const CELL = 40;
class Hash {
  constructor() { this.cells = new Map(); }
  key(i, j) { return `${i},${j}`; }
  add(item, x, z, reach) {
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++) {
        const k = this.key(i, j);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(item);
      }
  }
  near(x, z, reach) {
    const out = new Set();
    for (let i = Math.floor((x - reach) / CELL); i <= Math.floor((x + reach) / CELL); i++)
      for (let j = Math.floor((z - reach) / CELL); j <= Math.floor((z + reach) / CELL); j++)
        for (const item of this.cells.get(this.key(i, j)) ?? []) out.add(item);
    return out;
  }
}

// ---- What is in the way ------------------------------------------------------

const xs = AREA.map((p) => p.x), zs = AREA.map((p) => p.z);
const BOX = { minX: Math.min(...xs) - 60, maxX: Math.max(...xs) + 60, minZ: Math.min(...zs) - 60, maxZ: Math.max(...zs) + 60 };
const inBox = (p) => p.x > BOX.minX && p.x < BOX.maxX && p.z > BOX.minZ && p.z < BOX.maxZ;
const node = (i) => ({ x: city.nodes[i].pos.x / M, z: city.nodes[i].pos.z / M, y: city.nodes[i].y / M });

// Every carriageway near downtown, the freeway's included: nothing stands in one.
const roadHash = new Hash();
const roads = city.roads
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, road: r }))
  .filter((s) => inBox(s.a) || inBox(s.b));
for (const s of roads) {
  const x = (s.a.x + s.b.x) / 2, z = (s.a.z + s.b.z) / 2;
  roadHash.add(s, x, z, Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) / 2 + s.half);
}
/** How far a point is from the nearest carriageway's edge, counting only roads at ground level. */
const roadEdge = (p, reach = 30) => {
  let best = Infinity;
  const g = ground(p);
  for (const s of roadHash.near(p.x, p.z, reach)) {
    // A deck overhead is not in the way of a bench; a pillar under it is (`pillars`).
    if (Math.min(s.a.y, s.b.y) > g + 5) continue;
    best = Math.min(best, segDist(p, s.a, s.b) - s.half);
  }
  return best;
};
// The streets this draft dresses: downtown's surface roads, at ground level.
const STREETS = new Set(['street', 'boulevard', 'arterial']);
const degree = new Map();
for (const r of city.roads) for (const n of [r.a, r.b]) degree.set(n, (degree.get(n) ?? 0) + 1);
const streets = roads.filter((s) => {
  const r = s.road;
  if (!STREETS.has(r.class) || r.surface !== 'asphalt' || r.bridge || r.tunnel) return false;
  if (!inDowntown(s.a) && !inDowntown(s.b)) return false;
  return Math.abs(s.a.y - ground(s.a)) < 2 && Math.abs(s.b.y - ground(s.b)) < 2;
});
const junctions = [...degree].filter(([, d]) => d !== 2).map(([n]) => node(n)).filter(inBox);
const junctionHash = new Hash();
for (const j of junctions) junctionHash.add(j, j.x, j.z, 0);
const nearJunction = (p, reach) => [...junctionHash.near(p.x, p.z, reach)].some((j) => Math.hypot(j.x - p.x, j.z - p.z) < reach);

const raceHash = new Hash();
for (const route of city.routes) {
  const line = route.points.map((p) => ({ x: p.x / M, z: p.z / M }));
  for (let i = 1; i < line.length; i++) {
    const s = { a: line[i - 1], b: line[i] };
    if (!inBox(s.a) && !inBox(s.b)) continue;
    raceHash.add(s, (s.a.x + s.b.x) / 2, (s.a.z + s.b.z) / 2, Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) / 2);
  }
}
const raceDist = (p, reach = 30) => {
  let best = Infinity;
  for (const s of raceHash.near(p.x, p.z, reach)) best = Math.min(best, segDist(p, s.a, s.b));
  return best;
};

const pointHash = new Hash();
const points = [
  ...city.collectibles.map((c) => ({ ...c.at, r: 8 })),
  ...city.breakables.map((b) => ({ ...b.at, r: 6 })),
  ...city.pillars.map((p) => ({ ...p.at, r: 3 })),
  ...city.furniture.filter((f) => f.kind === 'lamp' || f.kind === 'sign').map((f) => ({ ...f.at, r: 2.5 })),
]
  .map((p) => ({ x: p.x / M, z: p.z / M, r: p.r }))
  .filter(inBox);
// Jumps, by their run-up and landing.
const jumps = city.jumps.map((j) => ({ x: j.at.x / M, z: j.at.z / M, dx: Math.sin(j.angle), dz: Math.cos(j.angle) })).filter(inBox);
const inJump = (p) =>
  jumps.some((j) => {
    const along = (p.x - j.x) * j.dx + (p.z - j.z) * j.dz;
    const across = Math.abs((p.x - j.x) * j.dz - (p.z - j.z) * j.dx);
    return along > -150 && along < 230 && across < 30;
  });
for (const p of points) pointHash.add(p, p.x, p.z, p.r);
const nearPoint = (p, pad) => [...pointHash.near(p.x, p.z, 10 + pad)].some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + pad);

// ---- Footprints ----------------------------------------------------------------

/** The editor's sizes (`tools/propeditor.html`), across (`w`) and along (`l`) a piece's heading. */
const SIZE = {
  'street-tree': [2, 2], 'bus-shelter': [8, 3.2], bollard: [0.5, 0.5], planter: [4.8, 2.4], bin: [1.2, 1.2],
  fountain: [14.4, 14.4], statue: [4.4, 4.4], kiosk: [4.8, 4], 'cafe-tables': [4.4, 6], dumpster: [3.2, 2.9],
  'food-truck': [4.6, 13], bench: [1.2, 3.6], crane: [6, 6], cabin: [5.8, 15.5], rubble: [16, 16], cone: [0.6, 0.6],
  'blast-wall': [6, 1.2],
  townhouse: [11.2, 19.2], loft: [35.2, 25.6], midrise: [32, 24], tower: [30, 30], 'lookout-tower': [32, 32],
  'twist-tower': [36, 36], 'chateau-hotel': [46, 34], stadium: [232, 192], library: [80, 60], gallery: [74, 50],
  cathedral: [26, 64], 'city-hall': [77, 45], 'cruise-terminal': [56, 200], 'geodesic-dome': [44, 44], flatiron: [26, 44],
  shop: [12.8, 19.2], flat: [25.6, 19.2], house: [16, 19.2], apartment: [38.4, 19.2], hedge: [16, 1.2],
};
const ROUND = new Set(['street-tree', 'bollard', 'bin', 'fountain', 'rubble', 'cone', 'stadium', 'geodesic-dome']);
const sizeOf = (p) => (p.kind === 'lawn' ? [p.w ?? LAWN_SIZES[p.variant][0], LAWN_SIZES[p.variant][1]] : SIZE[p.kind] ?? [4, 4]);

/** A piece's footprint, grown by `pad`: a circle or four corners. */
function footprint(p, pad = 0) {
  const [w, l] = sizeOf(p);
  if (ROUND.has(p.kind)) return { round: true, x: p.x, z: p.z, r: Math.max(w, l) / 2 + pad };
  const s = Math.sin(p.angle), c = Math.cos(p.angle);
  // Along the heading is (s, c); across it is (c, -s).
  const pt = (u, v) => ({ x: p.x + c * u + s * v, z: p.z - s * u + c * v });
  const hw = w / 2 + pad, hl = l / 2 + pad;
  return { round: false, x: p.x, z: p.z, pts: [pt(-hw, -hl), pt(hw, -hl), pt(hw, hl), pt(-hw, hl)], r: Math.hypot(hw, hl) };
}
function probes(f, step = 2) {
  if (f.round) {
    const out = [{ x: f.x, z: f.z }];
    for (let r = Math.min(step, f.r); r <= f.r + 0.01; r += step) {
      const n = Math.max(6, Math.ceil((2 * Math.PI * r) / step));
      for (let k = 0; k < n; k++) out.push({ x: f.x + Math.sin((k / n) * 2 * Math.PI) * r, z: f.z + Math.cos((k / n) * 2 * Math.PI) * r });
    }
    return out;
  }
  const [a, b, , d] = f.pts;
  const nu = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  const nv = Math.max(1, Math.ceil(Math.hypot(d.x - a.x, d.z - a.z) / step));
  const out = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) out.push({ x: a.x + ((b.x - a.x) * i) / nu + ((d.x - a.x) * j) / nv, z: a.z + ((b.z - a.z) * i) / nu + ((d.z - a.z) * j) / nv });
  return out;
}
const inside = (p, f) => (f.round ? Math.hypot(p.x - f.x, p.z - f.z) < f.r : inPoly(p, f.pts));
const overlaps = (f, g) => {
  if (Math.hypot(f.x - g.x, f.z - g.z) > f.r + g.r) return false;
  return probes(f, 1.5).some((p) => inside(p, g)) || probes(g, 1.5).some((p) => inside(p, f));
};

// What stands already - the buildings, and whatever else is kept - and what this run places.
const takenHash = new Hash();
const take = (f, kind) => takenHash.add(Object.assign(f, { kind }), f.x, f.z, f.r);
for (const p of kept) if (p.kind !== 'lawn' && p.kind !== 'billboard' && p.kind !== 'gate') take(footprint(p, 0.5), p.kind);
for (const b of city.buildings) {
  const f = { round: false, pts: [[b.footprint.minX, b.footprint.minZ], [b.footprint.maxX, b.footprint.minZ], [b.footprint.maxX, b.footprint.maxZ], [b.footprint.minX, b.footprint.maxZ]].map(([x, z]) => ({ x: x / M, z: z / M })) };
  f.x = (f.pts[0].x + f.pts[2].x) / 2;
  f.z = (f.pts[0].z + f.pts[2].z) / 2;
  f.r = Math.hypot(f.pts[2].x - f.x, f.pts[2].z - f.z);
  if (inBox(f)) take(f, 'a building');
}
/** What a footprint lands on, by kind, or nothing. */
const clashes = (f) => [...takenHash.near(f.x, f.z, f.r)].find((g) => overlaps(f, g))?.kind ?? '';

/**
 * Is a piece clear of everything, on dry downtown ground no steeper than it
 * can stand on? `kerb` is how near a carriageway it may come: a tree on the
 * pavement is a metre off it, a building site well back.
 */
function fits(p, opts = {}) {
  const why = refusal(p, opts);
  if (why) refusals.set(`${p.kind}: ${why}`, (refusals.get(`${p.kind}: ${why}`) ?? 0) + 1);
  return !why;
}
/** Why a piece cannot go where it was asked to, or nothing if it can: counted, for `--why`. */
function refusal(p, { kerb = 0.6, race = 0, pad = 0.4, fall = 0.8, onLawn = false } = {}) {
  const f = footprint(p, pad);
  const hit = clashes(f);
  if (hit) return `on ${hit}`;
  if (!onLawn && lawnPrints.some((g) => overlaps(f, g))) return 'a lawn';
  const ps = probes(footprint(p), Math.max(1, Math.min(4, f.r / 3)));
  for (const q of ps) {
    if (!inDowntown(q)) return 'outside downtown';
    if (wet(q)) return 'water';
    if (roadEdge(q, 30 + f.r) < kerb) return 'road';
    if (race && raceDist(q, 30 + race) < race) return 'race line';
    if (nearPoint(q, 0.5)) return 'collectible, lamp or pillar';
    if (inJump(q)) return 'jump';
  }
  const hs = ps.map(ground);
  return Math.max(...hs) - Math.min(...hs) < fall ? '' : 'slope';
}
const refusals = new Map();

const drafted = [];
/** Lawns are ground: what stands on one is placed on it on purpose (`onLawn`), nothing else is. */
const lawnPrints = [];
let id = 0;
function place(p, opts) {
  if (!fits(p, opts)) return false;
  const out = { id: `do${++id}`, kind: p.kind, x: r1(p.x), z: r1(p.z), angle: r3(p.angle), ...(p.w != null ? { w: p.w } : {}), ...(p.variant ? { variant: p.variant } : {}) };
  drafted.push(out);
  if (p.kind === 'lawn') lawnPrints.push(footprint(p, 1));
  else take(footprint(p, 0.5), p.kind);
  return true;
}

// ---- Along the streets -------------------------------------------------------

/**
 * Stations along every downtown street, `spacing` apart and clear of its
 * junctions, each with the point at `offset` past the kerb on one side and the
 * heading back towards the carriageway.
 */
const RACED_CORNER = 32;
function stations(spacing, offset, sides, salt) {
  const out = [];
  for (const s of streets) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    if (len < 1) continue;
    const dir = { x: (s.b.x - s.a.x) / len, z: (s.b.z - s.a.z) / len };
    const nrm = { x: -dir.z, z: dir.x };
    for (const side of sides) {
      // A phase of its own for each street and side, so rows on two streets do not line up across a junction.
      const phase = cellRandom(Math.round(s.a.x), Math.round(s.a.z), salt + side) * spacing;
      for (let t = phase; t < len; t += spacing) {
        const c = { x: s.a.x + dir.x * t, z: s.a.z + dir.z * t };
        const at = { x: c.x + nrm.x * side * (s.half + offset), z: c.z + nrm.z * side * (s.half + offset) };
        // A race cuts its corners - the reference driver runs five metres
        // inside the line through the old core's - so a street a race runs
        // down keeps its pavements clear for longer either side of a junction.
        const raced = raceDist(c) < s.half;
        if (nearJunction(at, (raced ? RACED_CORNER : 14) + s.half)) continue;
        out.push({ at, toRoad: facing(-nrm.x * side, -nrm.z * side), along: facing(dir.x, dir.z), street: s });
      }
    }
  }
  return out;
}

// ---- The gaps: plazas, building sites and lawns --------------------------------

/**
 * Open ground: every point on a grid over downtown, with how far it is from
 * the nearest thing - a carriageway, a race line, a building or anything
 * placed, a lamp or a collectible, or the water.
 */
function openGround(minClear = 14) {
  const out = [];
  for (let x = BOX.minX; x < BOX.maxX; x += 6)
    for (let z = BOX.minZ; z < BOX.maxZ; z += 6) {
      const p = { x, z };
      if (!inDowntown(p) || wet(p)) continue;
      let clear = Math.min(roadEdge(p, 80), raceDist(p, 80));
      if (clear < minClear) continue;
      for (const g of takenHash.near(x, z, 60)) {
        const d = g.round ? Math.hypot(g.x - x, g.z - z) - g.r : inside(p, g) ? -1 : Math.min(...g.pts.map((a, i) => segDist(p, a, g.pts[(i + 1) % 4])));
        clear = Math.min(clear, d);
      }
      for (const q of pointHash.near(x, z, 40)) clear = Math.min(clear, Math.hypot(q.x - x, q.z - z) - q.r);
      for (const g of lawnPrints) if (Math.hypot(g.x - x, g.z - z) < g.r + minClear) clear = Math.min(clear, Math.hypot(g.x - x, g.z - z) - g.r);
      // The shore, sampled in rings: a gap on the quay is not as big as the quay.
      shore: for (let r = 8; r < clear; r += 8)
        for (let k = 0; k < 12; k++)
          if (wet({ x: x + Math.sin((k / 12) * 2 * Math.PI) * r, z: z + Math.cos((k / 12) * 2 * Math.PI) * r })) {
            clear = r - 4;
            break shore;
          }
      if (clear >= minClear) out.push({ ...p, clear });
    }
  return out.sort((a, b) => b.clear - a.clear);
}
/** The heading of the road nearest a point, so what is laid out there is square to the street. */
function streetAngle(p) {
  let best = Infinity, angle = 0;
  for (const s of roadHash.near(p.x, p.z, 120)) {
    const d = segDist(p, s.a, s.b);
    if (d < best) [best, angle] = [d, facing(s.b.x - s.a.x, s.b.z - s.a.z)];
  }
  return angle;
}
/** A unit's frame at a gap: `u` across the street direction, `v` along it. */
const frame = (g, a) => {
  const d = { x: Math.sin(a), z: Math.cos(a) };
  const n = { x: d.z, z: -d.x };
  return { d, n, at: (u, v) => ({ x: g.x + n.x * u + d.x * v, z: g.z + n.z * u + d.z * v }) };
};
const chosen = [];
/** Up to `n` of the biggest gaps, `minClear` or more, each at least `apart` from the last ones picked; `near` limits where. */
const pick = (n, minClear, apart = 150, near = () => true) => {
  const out = [];
  for (const p of openGround(minClear)) {
    if (out.length >= n) break;
    if (!near(p)) continue;
    if ([...chosen, ...out].some((q) => Math.hypot(q.x - p.x, q.z - p.z) < apart)) continue;
    out.push(p);
  }
  chosen.push(...out);
  return out;
};

// The plazas: city hall's and the gallery's. Their squares (#268) were laid
// in front of each, and the streets grown after them (#526) took most of
// that ground - what is left is a forecourt seven to eleven metres deep - so
// each plaza goes on the biggest open ground within 160 m of its building:
// a fountain in the middle, a monument behind it, a kiosk with café tables,
// benches facing the fountain, planters, and a food truck at the edge.
const plazas = [];
for (const kind of ['city-hall', 'gallery']) {
  const b = kept.find((p) => p.kind === kind);
  if (!b) continue;
  const [g] = pick(1, 15, 150, (p) => Math.hypot(p.x - b.x, p.z - b.z) < 160);
  if (!g) continue;
  plazas.push(kind);
  const a = streetAngle(g);
  const { at } = frame(g, a);
  place({ kind: 'fountain', ...at(0, 0), angle: a }, { kerb: 3 });
  place({ kind: 'statue', ...at(0, -14), angle: a, variant: kind === 'city-hall' ? 'figure' : 'obelisk' }, { kerb: 3 });
  place({ kind: 'kiosk', ...at(13, 9), angle: a - Math.PI / 2, variant: kind === 'city-hall' ? 'green' : 'red' }, { kerb: 3 });
  for (const [u, v] of [[13, 1], [13, -6], [6, 13]]) place({ kind: 'cafe-tables', ...at(u, v), angle: a }, { kerb: 3 });
  for (const u of [-11, 11]) {
    const p = at(u, 0);
    place({ kind: 'bench', ...p, angle: benchFacing(g.x - p.x, g.z - p.z) }, { kerb: 3 });
  }
  for (const v of [-9, 9]) place({ kind: 'planter', ...at(-12, v), angle: a + Math.PI / 2 }, { kerb: 2 });
  // Its hatch (its left side) to the fountain.
  place({ kind: 'food-truck', ...at(-17, 0), angle: a + Math.PI, variant: kind === 'city-hall' ? 'teal' : 'yellow' }, { kerb: 2 });
  // A line of bollards on whichever side is nearer the road, a planter at each end.
  const side = roadEdge(at(0, -20)) < roadEdge(at(0, 20)) ? -1 : 1;
  for (let u = -15; u <= 15; u += 3) place({ kind: Math.abs(u) === 15 ? 'planter' : 'bollard', ...at(u, side * 19), angle: a + Math.PI / 2 }, { kerb: 0.5 });
}
const nPlaza = drafted.length;

// Two building sites on the biggest gaps left: a tower crane, two cabins, a
// heap of spoil, and a hoarding of blast walls with cones along it on the
// street side.
let sites = 0;
for (const g of pick(2, 24)) {
  const a = streetAngle(g);
  const { at } = frame(g, a);
  const before = drafted.length;
  place({ kind: 'crane', ...at(0, 0), angle: a }, { kerb: 6 });
  place({ kind: 'cabin', ...at(-10, -12), angle: a }, { kerb: 4 });
  place({ kind: 'cabin', ...at(-10, 6), angle: a }, { kerb: 4 });
  place({ kind: 'rubble', ...at(11, -8), angle: a }, { kerb: 4 });
  const side = roadEdge(at(-20, 0)) < roadEdge(at(20, 0)) ? -1 : 1;
  for (let v = -18; v <= 18; v += 6) place({ kind: 'blast-wall', ...at(side * 19, v), angle: a - Math.PI / 2 }, { kerb: 1 });
  for (let v = -15; v <= 15; v += 6) place({ kind: 'cone', ...at(side * 21.5, v), angle: a }, { kerb: 0.5 });
  if (drafted.length > before) sites++;
}

// Lawns: the next five biggest gaps, each as big as it has room for, with a
// tree or three and benches along its edge. The lawn is ground; what stands
// on it is placed on it on purpose.
let lawns = 0;
for (const g of pick(6, 16)) {
  const a = streetAngle(g);
  // The biggest that fits, narrowed to its gap where the smallest is too wide.
  const sizes = [['large'], ['medium'], ['small'], ['small', 24], ['small', 18]];
  const fit = sizes.find(([variant, w]) => place({ kind: 'lawn', x: g.x, z: g.z, angle: a, variant, ...(w ? { w } : {}) }, { kerb: 3, pad: 1 }));
  if (!fit) continue;
  const [variant] = fit;
  const w = fit[1] ?? LAWN_SIZES[variant][0];
  const l = LAWN_SIZES[variant][1];
  lawns++;
  const { n, at } = frame(g, a);
  const trees = variant === 'small' ? [[0, 0]] : [[-w / 4, -l / 4], [w / 4, l / 5], [-w / 6, l / 3]];
  for (const [u, v] of trees) place({ kind: 'street-tree', ...at(u, v), angle: a + u }, { kerb: 3, onLawn: true });
  for (const v of [-l / 4, l / 4]) place({ kind: 'bench', ...at(w / 2 - 2, v), angle: benchFacing(-n.x, -n.z) }, { kerb: 2, onLawn: true });
  if (variant === 'large') place({ kind: 'statue', ...at(w / 6, -l / 6), angle: a, variant: 'figure' }, { kerb: 3, onLawn: true });
}

// Food trucks by the stadium, on open ground near it.
let stadiumTrucks = 0;
const stadium = kept.find((p) => p.kind === 'stadium');
if (stadium) {
  for (const g of openGround(10).filter((p) => Math.hypot(p.x - stadium.x, p.z - stadium.z) < 220)) {
    if (stadiumTrucks >= 3) break;
    const variant = ['white', 'pink', 'yellow'][stadiumTrucks];
    if (place({ kind: 'food-truck', x: g.x, z: g.z, angle: streetAngle(g), variant }, { kerb: 3 })) stadiumTrucks++;
  }
}

// ---- Along the streets -------------------------------------------------------

const MAIN = new Set(['boulevard', 'arterial']);
const alongOf = (st) => ({ x: Math.sin(st.along), z: Math.cos(st.along) });

// Bus shelters: on the boulevards and main roads, one every 180 m or so, at
// the back of the pavement where it is wide enough and nearer the kerb where
// it is not, the open front to the kerb; a bin beside each.
let shelters = 0;
const shelterAt = [];
for (const st of stations(60, 2.6, [1, -1], 11)) {
  if (!MAIN.has(st.street.road.class)) continue;
  if (shelterAt.some((q) => Math.hypot(q.x - st.at.x, q.z - st.at.z) < 180)) continue;
  const back = { x: -Math.sin(st.toRoad), z: -Math.cos(st.toRoad) };
  const at = [0.4, 0, -0.6].map((k) => ({ x: st.at.x + back.x * k, z: st.at.z + back.z * k })).find((p) => place({ kind: 'bus-shelter', ...p, angle: st.toRoad }, { kerb: 0.3, race: st.street.half + 1 }));
  if (!at) continue;
  shelters++;
  shelterAt.push(at);
  const along = alongOf(st);
  place({ kind: 'bin', x: at.x + along.x * 6, z: at.z + along.z * 6, angle: st.toRoad }, { kerb: 0.6 });
}

// Benches facing the road, a bin beside each: one every 90 m on either side,
// at the back of the pavement or nearer the kerb where a building stands
// close behind it. Before the trees, which fill in round them.
let benches = 0;
for (const st of stations(90, 3, [1, -1], 31)) {
  const t = { x: Math.sin(st.toRoad), z: Math.cos(st.toRoad) };
  const at = [0, 1.4].map((k) => ({ x: st.at.x + t.x * k, z: st.at.z + t.z * k })).find((p) => place({ kind: 'bench', ...p, angle: benchFacing(t.x, t.z) }, { kerb: 0.8, race: st.street.half + 1.5 }));
  if (!at) continue;
  benches++;
  const along = alongOf(st);
  place({ kind: 'bin', x: at.x + along.x * 3.8, z: at.z + along.z * 3.8, angle: st.toRoad }, { kerb: 0.8 });
}

// Street trees down the pavements: every 24 m on the main roads and 32 m on
// the side streets, both sides, nearly two metres off the kerb.
let trees = 0;
for (const st of [...stations(24, 1.8, [1, -1], 21).filter((s) => MAIN.has(s.street.road.class)), ...stations(32, 1.8, [1, -1], 23).filter((s) => !MAIN.has(s.street.road.class))]) {
  if (place({ kind: 'street-tree', ...st.at, angle: st.along + cellRandom(Math.round(st.at.x), Math.round(st.at.z), 7) }, { kerb: 0.6, race: st.street.half + 0.6 })) trees++;
}

// ---- Behind the old core -----------------------------------------------------

// A dumpster behind about one building in four of the old core and the quay
// lofts, a couple of metres off its back wall, square to it.
let dumpsters = 0;
const CORE = new Set(['townhouse', 'shop', 'flat', 'loft', 'midrise']);
for (const b of kept.filter((p) => CORE.has(p.kind))) {
  if (cellRandom(Math.round(b.x), Math.round(b.z), 41) > 0.25) continue;
  const [, l] = SIZE[b.kind];
  const back = { x: -Math.sin(b.angle), z: -Math.cos(b.angle) };
  const d = l / 2 + 3;
  const variant = ['green', 'blue', 'grey'][Math.floor(cellRandom(Math.round(b.x), Math.round(b.z), 43) * 3)];
  if (place({ kind: 'dumpster', x: b.x + back.x * d, z: b.z + back.z * d, angle: b.angle, variant }, { kerb: 1.5 })) dumpsters++;
}

const count = (k) => drafted.filter((p) => p.kind === k).length;
console.log(`plazas: ${plazas.join(', ') || 'none'} (${nPlaza} pieces: ${count('fountain')} fountains, ${count('statue')} statues, ${count('kiosk')} kiosks, ${count('cafe-tables')} café tables, ${count('bollard')} bollards, ${count('planter')} planters)`);
console.log(`streets: ${trees} street trees, ${shelters} bus shelters, ${benches} benches, ${count('bin')} bins`);
console.log(`clutter: ${dumpsters} dumpsters, ${count('food-truck')} food trucks (${stadiumTrucks} by the stadium), ${sites} building sites`);
console.log(`lawns: ${lawns}`);
console.log(`${drafted.length} drafted, ${kept.length} kept`);
if (process.argv.includes('--why')) for (const [k, n] of [...refusals].sort((a, b) => b[1] - a[1])) console.log(`  refused ${n}x ${k}`);

if (!DRY) {
  const props = [...kept, ...drafted];
  writeFileSync(FILE, JSON.stringify({ ...old, seed: `0x${(CITY_SEED >>> 0).toString(16)}`, savedAt: new Date().toISOString(), props }, null, 2) + '\n');
  console.log(`wrote ${FILE}`);
}
