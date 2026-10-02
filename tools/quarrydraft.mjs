// Draft a once-over of Halloway Quarry's set dressing into its props file.
//
// The quarry (#323) was one of the first areas finished, placed by hand
// before the later areas found how to fill a place: the works along every
// road in Industrial (`worksdraft`), the houses facing their streets in the
// midtowns (`housedraft`). Measured against those it is sparse - under half a
// prop a hectare in the bowl against Industrial's four, and most of the
// benches more than 60 m from anything - and what is there is scattered
// rather than composed. This drafts the rest of a working quarry the same way
// `worksdraft` drafts works: small composed units, each a thing a quarry
// actually has, set square to the ground they stand on.
//
// Three frames, because the quarry has three kinds of ground:
//
// 1. **The pit floor**, square to the plant: the crushing plant is a box on
//    the map's axes, so its screening lines and stockpile rows are too.
// 2. **The benches**, square to the bowl: a bench runs round the pit, so a
//    working face, its muck pile and the plant digging it face the wall, and a
//    rock berm runs along each bench's crest.
// 3. **The rim and the road in**, square to the nearest road and set back
//    from it, as Industrial's works are: the truck park, the cabins, the fuel
//    store and the sales stockpiles. Then copses of conifers on what is left
//    of the rim, which is scrub and hillside rather than workings.
//
// Every unit is held clear of every road, the race lines (the Halloway Rim and
// the Halloway Drop run on the quarry's roads, and so do its haul trucks), the
// Crest Kicker's run-up and landing, the ponds, the buildings, the barriers,
// the collectibles and breakables, and everything already placed, with each
// piece on ground as flat as the editor holds that kind to. Only set pieces:
// no breakables, billboards or jumps, whose ids a save remembers.
//
// What it drafts carries ids it owns (`qo…`), so running it again replaces its
// own draft and keeps everything else in the file, hand edits included. Then
// `npm run propsync -- --place quarry`.
//
// Usage:
//   npm run quarrydraft          # write docs/quarry-props-edited.json
//   npm run quarrydraft -- --dry # count, write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const FILE = 'docs/quarry-props-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { CITY_SEED, UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_PLACES } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { cellRandom } = await server.ssrLoadModule('/src/game/city/highmoor.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const mine = (id) => /^qo\d/.test(id);
const kept = (old.props ?? []).filter((p) => !mine(p.id));

// Everything here is in metres.
const place = PLAN_PLACES.find((p) => p.kind === 'quarry');
const C = { x: place.at.x / M, z: place.at.z / M };
const R = place.radius / M;
/** How far out the once-over reaches: the rim, the yard by the road in, and the hillside between. */
const REACH = 1050;
const away = (p) => Math.hypot(p.x - C.x, p.z - C.z);
const wet = (p) => inWater(city, p.x * M, p.z * M);
const ground = (p) => groundAt(city.terrain, p.x * M, p.z * M) / M;
const node = (i) => ({ x: city.nodes[i].pos.x / M, z: city.nodes[i].pos.z / M });
const segDist = (p, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z);
};

// ---- What is in the way ------------------------------------------------------

const near = (p, r) => away(p) < r;
const roads = city.roads
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, gravel: r.surface === 'gravel' }))
  .filter((s) => near(s.a, REACH + 400) || near(s.b, REACH + 400));
const races = city.routes
  .map((r) => r.points.map((p) => ({ x: p.x / M, z: p.z / M })))
  .flatMap((line) => line.slice(1).map((b, i) => ({ a: line[i], b })))
  .filter((s) => near(s.a, REACH + 400) || near(s.b, REACH + 400));
const keep = [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)]
  .map((p) => ({ x: p.x / M, z: p.z / M }))
  .filter((p) => near(p, REACH + 100));
const furniture = city.furniture.map((f) => ({ x: f.at.x / M, z: f.at.z / M })).filter((p) => near(p, REACH + 100));
const buildings = city.buildings
  .map((b) => ({ minX: b.footprint.minX / M, maxX: b.footprint.maxX / M, minZ: b.footprint.minZ / M, maxZ: b.footprint.maxZ / M }))
  .filter((b) => near({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }, REACH + 100));
const jumps = city.jumps.map((j) => ({ x: j.at.x / M, z: j.at.z / M, dx: Math.sin(j.angle), dz: Math.cos(j.angle) })).filter((j) => near(j, REACH + 100));

/** Back from a road's edge: a car that runs a corner wide on gravel goes further than a pavement. */
const ROAD_CLEAR = 8;
/** Back from a race line, which is the middle of the road it runs on. */
const RACE_CLEAR = 18;
/** A jump's run-up behind it and its flight and landing ahead, and how wide either side. */
const JUMP_BEHIND = 150, JUMP_AHEAD = 230, JUMP_SIDE = 30;
/** Between one piece and the next, and between units. */
const PIECE_GAP = 2.5, UNIT_GAP = 9;

const roadEdge = (p) => {
  let best = Infinity, seg = null;
  for (const s of roads) {
    const d = segDist(p, s.a, s.b) - s.half;
    if (d < best) [best, seg] = [d, s];
  }
  return { d: best, seg };
};
const inJump = (p) =>
  jumps.some((j) => {
    const along = (p.x - j.x) * j.dx + (p.z - j.z) * j.dz;
    const across = Math.abs((p.x - j.x) * j.dz - (p.z - j.z) * j.dx);
    return along > -JUMP_BEHIND && along < JUMP_AHEAD && across < JUMP_SIDE;
  });

// ---- Footprints ----------------------------------------------------------------

/** The editor's sizes (`tools/propeditor.html`), across (`w`) and along (`l`) a piece's heading. */
const SIZE = {
  stockpile: [44, 44], conveyor: [3.2, 84], 'haul-truck': [16, 25], excavator: [9.5, 20], cabin: [5.8, 15.5],
  crusher: [16, 16], rubble: [16, 16], silo: [8, 8], 'water-tower': [10, 10], crane: [6, 6], mast: [4, 4],
  bunker: [12, 8], 'blast-wall': [6, 1.2], shed: [9, 14], cone: [0.6, 0.6], tree: [6, 6], stack: [3, 2],
  'tank:small': [14, 14], 'tank:large': [28, 28], 'warehouse:small': [30, 60], gate: [10, 1.2], jump: [8, 12], billboard: [11, 0.6],
};
const ROUND = new Set(['stockpile', 'rubble', 'silo', 'water-tower', 'tree', 'cone', 'tank']);
const sizeOf = (p) => SIZE[`${p.kind}:${p.variant}`] ?? SIZE[p.kind] ?? [4, 4];
/**
 * How far the ground may fall under each kind, in metres. Under 1 m for what
 * the editor holds to flat ground (it reads heights to the whole metre, so a
 * fall of 1.1 m shows there as 2); a heap or a tree can sit on a gentle slope.
 */
const FALL = { stockpile: 4, rubble: 3, tree: 3, cone: 2, tank: 2, conveyor: 1.8, 'haul-truck': 1.5, excavator: 1.5, 'blast-wall': 1.5 };
const fallOf = (kind) => FALL[kind] ?? 1;

/** A piece's footprint as four corners, grown by `pad`. */
function corners(p, pad = 0) {
  const [w, l] = sizeOf(p);
  if (ROUND.has(p.kind)) {
    const r = Math.max(w, l) / 2 + pad;
    return { round: true, x: p.x, z: p.z, r };
  }
  const s = Math.sin(p.angle), c = Math.cos(p.angle);
  // Along the heading is (s, c); across it is (c, -s).
  const pt = (u, v) => ({ x: p.x + c * u + s * v, z: p.z - s * u + c * v });
  const hw = w / 2 + pad, hl = l / 2 + pad;
  return { round: false, pts: [pt(-hw, -hl), pt(hw, -hl), pt(hw, hl), pt(-hw, hl)] };
}
/** Points over a footprint, every few metres, to test it against everything. */
function probes(f, step = 4) {
  if (f.round) {
    const out = [{ x: f.x, z: f.z }];
    for (let r = step; r <= f.r + 0.01; r += step) {
      const n = Math.max(6, Math.ceil((2 * Math.PI * r) / step));
      for (let k = 0; k < n; k++) out.push({ x: f.x + Math.sin((k / n) * 2 * Math.PI) * r, z: f.z + Math.cos((k / n) * 2 * Math.PI) * r });
    }
    const n = Math.max(6, Math.ceil((2 * Math.PI * f.r) / step));
    for (let k = 0; k < n; k++) out.push({ x: f.x + Math.sin((k / n) * 2 * Math.PI) * f.r, z: f.z + Math.cos((k / n) * 2 * Math.PI) * f.r });
    return out;
  }
  const [a, b, , d] = f.pts;
  const nu = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
  const nv = Math.max(1, Math.ceil(Math.hypot(d.x - a.x, d.z - a.z) / step));
  const out = [];
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const s = i / nu, t = j / nv;
      out.push({ x: a.x + (b.x - a.x) * s + (d.x - a.x) * t, z: a.z + (b.z - a.z) * s + (d.z - a.z) * t });
    }
  return out;
}
const inPoly = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};
const inside = (p, f) => (f.round ? Math.hypot(p.x - f.x, p.z - f.z) < f.r : inPoly(p, f.pts));
/** Do two footprints overlap? Each one's probes against the other's shape. */
const overlaps = (f, g) => probes(f, 3).some((p) => inside(p, g)) || probes(g, 3).some((p) => inside(p, f));
const reachOf = (f) => (f.round ? f.r : Math.max(...f.pts.map((p) => Math.hypot(p.x - (f.pts[0].x + f.pts[2].x) / 2, p.z - (f.pts[0].z + f.pts[2].z) / 2))));
const centreOf = (f) => (f.round ? { x: f.x, z: f.z } : { x: (f.pts[0].x + f.pts[2].x) / 2, z: (f.pts[0].z + f.pts[2].z) / 2 });

// What is already placed - kept by hand, and what this run drafts - as footprints.
const taken = kept.filter((p) => !['gate', 'billboard'].includes(p.kind)).map((p) => corners(p));
const takenNear = (f, pad) => {
  const c = centreOf(f), r = reachOf(f) + pad;
  return taken.filter((g) => Math.hypot(centreOf(g).x - c.x, centreOf(g).z - c.z) < r + reachOf(g) + 1);
};

/** Is a piece's footprint clear of everything, on flat enough dry ground in the quarry? */
function fits(p, zone) {
  const f = corners(p);
  const pts = probes(f);
  for (const q of pts) {
    if (away(q) > REACH || wet(q)) return false;
    if (zone && zoneOf(q) !== zone && !(zone === 'bench' && zoneOf(q) === 'floor')) return false;
    if (roadEdge(q).d < ROAD_CLEAR) return false;
    if (races.some((s) => segDist(q, s.a, s.b) < RACE_CLEAR)) return false;
    if (inJump(q)) return false;
    if (keep.some((k) => Math.hypot(k.x - q.x, k.z - q.z) < 10)) return false;
    if (furniture.some((k) => Math.hypot(k.x - q.x, k.z - q.z) < 4)) return false;
    if (buildings.some((b) => q.x > b.minX - 8 && q.x < b.maxX + 8 && q.z > b.minZ - 8 && q.z < b.maxZ + 8)) return false;
  }
  const hs = probes(f, Math.max(2, Math.min(6, reachOf(f) / 3))).map(ground);
  if (Math.max(...hs) - Math.min(...hs) >= fallOf(p.kind)) return false;
  return true;
}

// ---- Where things go -----------------------------------------------------------

/** The floor, the benches, or the rim and beyond. */
const FLOOR_TOP = 12;
function zoneOf(p) {
  const r = away(p);
  if (r > R + 30) return 'outer';
  return ground(p) < FLOOR_TOP && r < R * 0.45 ? 'floor' : 'bench';
}

// ---- What a unit is ------------------------------------------------------------

/**
 * A unit, in its own frame: `u` out from its front edge (0) and `v` along it
 * (0 at its middle). Headings: 'along' runs with `v`, 'out' points along `u`,
 * 'in' back towards the front, 'back' against `v`, or an angle in radians
 * added to 'along'.
 */
const piece = (kind, u, v, face = 'along', variant) => ({ kind, u, v, face, ...(variant ? { variant } : {}) });
const HEAPS = ['grey', 'sand', 'rust'];

/** A screening line on the floor: a hopper, a belt climbing away from it, and the heap it builds. */
const screeningLine = (r) => {
  const heap = HEAPS[Math.floor(r(1) * 3)];
  const out = [piece('crusher', 10, 0, 'out'), piece('conveyor', 18 + 42, 0, 'out'), piece('stockpile', 18 + 84 + 4, 0, 'out', heap)];
  if (r(2) < 0.6) out.push(piece('stockpile', 18 + 84 - 14, r(3) < 0.5 ? -36 : 36, 'out', HEAPS[(HEAPS.indexOf(heap) + 1) % 3]));
  if (r(4) < 0.5) out.push(piece('mast', 6, r(5) < 0.5 ? -14 : 14));
  return out;
};
/** Graded product in a row along the road, the way a stockyard is laid out, and a loader at one end. */
const stockRow = (r) => {
  const n = 2 + Math.floor(r(1) * 3);
  const start = Math.floor(r(2) * 3);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('stockpile', 26, (i - (n - 1) / 2) * 50, 'along', HEAPS[(start + i) % 3]));
  if (r(3) < 0.7) out.push(piece('excavator', 14, ((n - 1) / 2) * 50 + 34, 'out'));
  if (r(4) < 0.5) out.push(piece('mast', 4, -((n - 1) / 2) * 50 - 30));
  return out;
};
/** A loading point: a heap, the machine loading from it and two trucks waiting their turn. */
const loadingBay = (r) => [
  piece('stockpile', 30, 0, 'along', HEAPS[Math.floor(r(1) * 3)]),
  piece('excavator', 20, 34, 'in'),
  piece('haul-truck', 14, 56, 'back'),
  ...(r(2) < 0.7 ? [piece('haul-truck', 14, 82, 'back')] : []),
  piece('cone', 2, 44), piece('cone', 2, 50), piece('cone', 2, 56),
];
/** A working face: the machine digging the wall, a truck beside it, and the blasted rock at its feet. */
const workingFace = (r) => {
  const out = [piece('excavator', 34, 0, 'out'), piece('haul-truck', 18, r(1) < 0.5 ? -24 : 24, r(2) < 0.5 ? 'along' : 'back')];
  const n = 3 + Math.floor(r(3) * 3);
  for (let i = 0; i < n; i++) out.push(piece('rubble', 46 + (r(10 + i) - 0.5) * 6, (i - (n - 1) / 2) * 15 + (r(20 + i) - 0.5) * 4));
  return out;
};
/** Overburden tipped on a bench: two or three heaps of spoil and loose rock round them. */
const spoil = (r) => {
  const out = [piece('stockpile', 24, 0, 'along', r(1) < 0.6 ? 'rust' : 'sand')];
  if (r(2) < 0.7) out.push(piece('stockpile', 30, 46, 'along', r(3) < 0.5 ? 'rust' : 'grey'));
  out.push(piece('rubble', 10, -30), piece('rubble', 8, 22));
  if (r(4) < 0.5) out.push(piece('rubble', 50, 24));
  return out;
};
/** A drill pattern marked out for the next blast, behind a blast wall, with the shot-firer's cabin. */
const drillPattern = (r) => {
  const out = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push(piece('cone', 18 + j * 6, (i - 1) * 6));
  out.push(piece('blast-wall', 6, -6), piece('blast-wall', 6, 0.5), piece('blast-wall', 6, 7));
  out.push(piece('cabin', 9, r(1) < 0.5 ? -22 : 22, 'out'));
  return out;
};
/** Plant parked up on a bench between shifts. */
const parked = (r) => [
  piece('haul-truck', 14, -12, r(1) < 0.5 ? 'out' : 'in'),
  piece('excavator', 12, 12, 'out'),
  ...(r(2) < 0.6 ? [piece('haul-truck', 14, 34, r(1) < 0.5 ? 'out' : 'in')] : []),
];
/** The truck park: a row of haul trucks nose to the road. */
const truckPark = (r) => {
  const n = 3 + Math.floor(r(1) * 3);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('haul-truck', 14, (i - (n - 1) / 2) * 20, 'in'));
  out.push(piece('mast', 30, ((n - 1) / 2) * 20 + 14));
  return out;
};
/** Welfare cabins in a row, side on to the road, with a floodlight. */
const cabins = (r) => {
  const n = 3 + Math.floor(r(1) * 3);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('cabin', 10, (i - (n - 1) / 2) * 9, 'out'));
  out.push(piece('mast', 4, ((n - 1) / 2) * 9 + 10));
  if (r(2) < 0.5) out.push(piece('shed', 30, 0, 'along'));
  return out;
};
/** The fuel store: tanks in a bund of blast walls, and the pump shed. */
const fuel = (r) => {
  const n = 2 + Math.floor(r(1) * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('tank', 16, (i - (n - 1) / 2) * 18, 'along', 'small'));
  const half = ((n - 1) / 2) * 18 + 10;
  for (let v = -half; v <= half + 0.1; v += 6.5) out.push(piece('blast-wall', 5, v, 'along'));
  out.push(piece('shed', 12, half + 14, 'out'));
  return out;
};
/** A workshop: two sheds and a machine outside waiting for a fitter. */
const workshop = (r) => [
  piece('shed', 10, -9, 'out'),
  piece('shed', 10, 9, 'out'),
  piece(r(1) < 0.5 ? 'excavator' : 'haul-truck', 14, 34, 'in'),
  piece('silo', 26, -22),
];
/** Bins and a silo by a road: where the product is stored before it leaves. */
const bins = (r) => {
  const n = 2 + Math.floor(r(1) * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('silo', 10, (i - (n - 1) / 2) * 12));
  out.push(piece('conveyor', 10 + 42 + 4, 0, 'in'));
  return out;
};

// ---- Placing one ---------------------------------------------------------------

const drafted = [];
let units = 0;
/**
 * At most this many of a unit across the quarry: one site has a truck park
 * and a fuel store or two, not one on every bend.
 */
const CAPS = new Map();
const cap = (make, n) => (CAPS.set(make, { n, used: 0 }), make);
const angleOf = (x, z) => Math.atan2(x, z);
const wrap = (a) => Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 1000) / 1000;

/** Try a unit with its front edge's middle at `front`, running along `dir`, its back towards `out`. */
function tryUnit(make, seed, front, dir, out, zone, gap = UNIT_GAP) {
  const limit = CAPS.get(make);
  if (limit && limit.used >= limit.n) return false;
  const r = (k) => cellRandom(Math.round(front.x), Math.round(front.z), 700 + k + seed * 19);
  const list = make(r).map((q) => {
    const at = { x: front.x + out.x * q.u + dir.x * q.v, z: front.z + out.z * q.u + dir.z * q.v };
    const heading = q.face === 'along' ? dir : q.face === 'out' ? out : q.face === 'in' ? { x: -out.x, z: -out.z } : q.face === 'back' ? { x: -dir.x, z: -dir.z } : dir;
    const angle = wrap(angleOf(heading.x, heading.z) + (typeof q.face === 'number' ? q.face : 0));
    return { kind: q.kind, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, angle, ...(q.variant ? { variant: q.variant } : {}) };
  });
  const feet = list.map((p) => corners(p));
  // Clear of everything already placed: a unit gap from what other units hold.
  for (const f of feet) {
    const grown = f.round ? { ...f, r: f.r + gap } : corners(list[feet.indexOf(f)], gap);
    if (takenNear(grown, 0).some((g) => overlaps(grown, g))) return false;
  }
  // And each piece clear of the others in its own unit.
  for (let i = 0; i < feet.length; i++)
    for (let j = i + 1; j < feet.length; j++) {
      const gi = list[i].kind === 'cone' || list[j].kind === 'cone' ? feet[i] : (feet[i].round ? { ...feet[i], r: feet[i].r + PIECE_GAP } : corners(list[i], PIECE_GAP));
      if (overlaps(gi, feet[j])) return false;
    }
  if (!list.every((p) => fits(p, zone))) return false;
  taken.push(...feet);
  drafted.push(...list);
  units++;
  if (limit) limit.used++;
  return true;
}

/** Points on a grid over the quarry, in an order that is the same every run and is not a raster. */
function anchors(step, salt) {
  const out = [];
  for (let x = C.x - REACH; x <= C.x + REACH; x += step)
    for (let z = C.z - REACH; z <= C.z + REACH; z += step) {
      const p = { x: Math.round(x), z: Math.round(z) };
      if (away(p) <= REACH) out.push({ ...p, k: cellRandom(p.x, p.z, salt) });
    }
  return out.sort((a, b) => a.k - b.k);
}
const pick = (x, z, salt, menu) => {
  const k = Math.floor(cellRandom(x, z, salt) * menu.length);
  return [...menu.slice(k), ...menu.slice(0, k)];
};

// 1. The floor, square to the plant: try each way round.
const AXES = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }];
const FLOOR_MENU = [[cap(screeningLine, 3), 1], [cap((r) => stockRow(r), 4), 2], [cap(loadingBay, 3), 3]];
for (const a of anchors(14, 11)) {
  if (zoneOf(a) !== 'floor') continue;
  const menu = pick(a.x, a.z, 12, FLOOR_MENU);
  let done = false;
  for (const [make, seed] of menu) {
    for (let t = 0; t < 4 && !done; t++) {
      const dir = AXES[(t + Math.floor(a.k * 4)) % 4];
      const out = { x: -dir.z, z: dir.x };
      done = tryUnit(make, seed, a, dir, out, 'bench');
    }
    if (done) break;
  }
}

// 1b. What the floor has room for once the plant is in: the hand-placed
// crushing plant spreads over most of it, so a screening line rarely fits,
// but a heap with its loader or a couple of parked trucks does.
const floorHeap = (r) => [
  piece('stockpile', 24, 0, 'along', HEAPS[Math.floor(r(1) * 3)]),
  piece('excavator', 10, r(2) < 0.5 ? -30 : 30, 'in'),
  ...(r(3) < 0.5 ? [piece('cone', 2, -6), piece('cone', 2, 0), piece('cone', 2, 6)] : []),
];
const FLOOR_SMALL = [[cap(floorHeap, 6), 1], [cap(parked, 4), 2], [cap(spoil, 3), 3]];
for (const a of anchors(10, 13)) {
  if (zoneOf(a) !== 'floor') continue;
  const menu = pick(a.x, a.z, 14, FLOOR_SMALL);
  let done = false;
  for (const [make, seed] of menu) {
    for (let t = 0; t < 4 && !done; t++) {
      const dir = AXES[(t + Math.floor(a.k * 4)) % 4];
      done = tryUnit(make, seed, a, dir, { x: -dir.z, z: dir.x }, 'bench', 4);
    }
    if (done) break;
  }
}

// 2. The benches. First walked along the haul roads, square to the road and
// set back from it, the way a quarry works a bench from the road that reaches
// it; then whatever bench is left, square to the bowl with its back to the wall.
/** How often a spot on a bench is left as open ground. */
const BENCH_OPEN = 0.15;
const benchDrill = cap(drillPattern, 8);
const BENCH_MENU = [[workingFace, 4], [spoil, 5], [workingFace, 6], [cap(parked, 10), 7], [benchDrill, 8], [cap((r) => stockRow(r), 6), 9]];
/** How far along a haul road between one try and the next, and how far back from its edge. */
const HAUL_STEP = 16, HAUL_SET = [ROAD_CLEAR + 2, ROAD_CLEAR + 14];
for (const s of roads) {
  if (!s.gravel || (away(s.a) > R + 20 && away(s.b) > R + 20)) continue;
  const l = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
  if (l < 1) continue;
  const dir = { x: (s.b.x - s.a.x) / l, z: (s.b.z - s.a.z) / l };
  for (let t = HAUL_STEP / 2; t < l; t += HAUL_STEP)
    for (const side of [1, -1])
      for (const set of HAUL_SET) {
        const out = { x: -dir.z * side, z: dir.x * side };
        const a = { x: Math.round(s.a.x + dir.x * t + out.x * (s.half + set)), z: Math.round(s.a.z + dir.z * t + out.z * (s.half + set)) };
        if (zoneOf(a) !== 'bench' || cellRandom(a.x, a.z, 25) < BENCH_OPEN) continue;
        const menu = pick(a.x, a.z, 26, BENCH_MENU).filter(([make]) => make !== benchDrill || cellRandom(a.x, a.z, 24) < 0.15);
        let done = false;
        for (const [make, seed] of menu) if ((done = tryUnit(make, seed, a, { x: dir.x * side, z: dir.z * side }, out, 'bench'))) break;
        if (done) break;
      }
}
for (const a of anchors(12, 21)) {
  if (zoneOf(a) !== 'bench' || away(a) < 40) continue;
  if (cellRandom(a.x, a.z, 22) < BENCH_OPEN) continue;
  const r = away(a);
  const out = { x: (a.x - C.x) / r, z: (a.z - C.z) / r };
  const dir = { x: out.z, z: -out.x };
  // A drill pattern is offered now and then, not wherever nothing bigger fits.
  const menu = pick(a.x, a.z, 23, BENCH_MENU).filter(([make]) => make !== benchDrill || cellRandom(a.x, a.z, 24) < 0.15);
  for (const [make, seed] of menu) if (tryUnit(make, seed, a, dir, out, 'bench')) break;
}

// 3. The rim and the road in, square to the road and set back from it.
const RIM_OPEN = 0.2;
const RIM_MENU = [[cap(truckPark, 4), 1], [cap(cabins, 4), 2], [cap(fuel, 2), 3], [cap(workshop, 3), 4], [cap((r) => stockRow(r), 6), 5], [cap(bins, 3), 6]];
for (const a of anchors(10, 31)) {
  if (zoneOf(a) !== 'outer') continue;
  if (cellRandom(a.x, a.z, 32) < RIM_OPEN) continue;
  const { d, seg } = roadEdge(a);
  // Only along the quarry's own roads: its works do not line the public network.
  if (!seg || !seg.gravel || d < ROAD_CLEAR + 2 || d > ROAD_CLEAR + 8) continue;
  const l = Math.hypot(seg.b.x - seg.a.x, seg.b.z - seg.a.z) || 1;
  const dir = { x: (seg.b.x - seg.a.x) / l, z: (seg.b.z - seg.a.z) / l };
  let out = { x: -dir.z, z: dir.x };
  if ((a.x - seg.a.x) * out.x + (a.z - seg.a.z) * out.z < 0) out = { x: -out.x, z: -out.z };
  const menu = pick(a.x, a.z, 33, RIM_MENU);
  for (const [make, seed] of menu) if (tryUnit(make, seed, a, dir, out, 'outer')) break;
}

// 4. A rock berm along each bench's crest: the line a quarry keeps its
// machines back from, in runs with gaps where the bench is reached from below.
const berm = [];
{
  const STEP = 2;
  for (let deg = 0; deg < 360; deg += 0.25) {
    const t = (deg * Math.PI) / 180;
    const ray = { x: Math.sin(t), z: Math.cos(t) };
    let rising = false;
    for (let r = 60; r < R + 20; r += STEP) {
      const h0 = ground({ x: C.x + ray.x * (r - 6), z: C.z + ray.z * (r - 6) });
      const h1 = ground({ x: C.x + ray.x * r, z: C.z + ray.z * r });
      if (h1 - h0 > 3) rising = true;
      else if (rising && h1 - h0 < 0.5) {
        rising = false;
        const at = { x: C.x + ray.x * (r + 9), z: C.z + ray.z * (r + 9) };
        // Every 15 m round the crest, at most.
        if (berm.some((b) => Math.hypot(b.x - at.x, b.z - at.z) < 15)) continue;
        berm.push({ ...at, deg });
      }
    }
  }
}
for (const b of berm) {
  // Runs of about six, with a gap after each.
  if (cellRandom(Math.round(b.x / 90), Math.round(b.z / 90), 41) < 0.3) continue;
  const p = { kind: 'rubble', x: Math.round(b.x * 10) / 10, z: Math.round(b.z * 10) / 10, angle: wrap(cellRandom(Math.round(b.x), Math.round(b.z), 42) * 6.28) };
  const f = corners(p);
  if (takenNear({ ...f, r: f.r + 3 }, 0).some((g) => overlaps({ ...f, r: f.r + 3 }, g))) continue;
  if (!fits(p, null)) continue;
  taken.push(f);
  drafted.push(p);
}

// 5. Copses of conifers on the rim and the hillside: scrub, not workings.
/** How far past the rim the scrub reaches: the rim is the quarry's, the hillside below it the city's. */
const SCRUB = 260;
for (const a of anchors(85, 61)) {
  if (zoneOf(a) !== 'outer' || away(a) > R + SCRUB || cellRandom(a.x, a.z, 62) < 0.4) continue;
  const n = 3 + Math.floor(cellRandom(a.x, a.z, 63) * 6);
  let grew = 0;
  for (let i = 0; i < 16 && grew < n; i++) {
    const t = cellRandom(a.x, a.z, 70 + i) * Math.PI * 2;
    const d = Math.sqrt(cellRandom(a.x, a.z, 90 + i)) * 26;
    const p = { kind: 'tree', x: Math.round((a.x + Math.sin(t) * d) * 10) / 10, z: Math.round((a.z + Math.cos(t) * d) * 10) / 10, angle: wrap(cellRandom(a.x, a.z, 110 + i) * 6.28) };
    const f = corners(p);
    if (takenNear({ ...f, r: f.r + 1.5 }, 0).some((g) => overlaps({ ...f, r: f.r + 1.5 }, g))) continue;
    if (!fits(p, 'outer')) continue;
    taken.push(f);
    drafted.push(p);
    grew++;
  }
}

// ---- Writing it ------------------------------------------------------------------

const count = {};
for (const p of drafted) count[p.kind] = (count[p.kind] ?? 0) + 1;
console.log(
  `${units} units, ${drafted.length} pieces: ` +
    Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} ${k}`)
      .join(', ') +
    ` · ${kept.length} props kept`,
);
if (!DRY) {
  const doc = {
    ...old,
    seed: `0x${(CITY_SEED >>> 0).toString(16)}`,
    place: 'Halloway Quarry',
    savedAt: new Date().toISOString(),
    props: [...kept, ...drafted.map((p, i) => ({ id: `qo${i + 1}`, ...p }))],
  };
  writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${FILE}`);
}
