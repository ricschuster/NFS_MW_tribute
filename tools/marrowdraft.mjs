// Draft Marrow Field's once-over into its props file.
//
// Marrow Field was the first area finished, placed by hand before the later
// areas found how to fill a place, and measured against them it is the
// sparsest ground on the map: 0.6 props a hectare against 4 to 13 elsewhere,
// most of the field more than 60 m from anything. The owner's call
// (2026-10-02): about two a hectare, the strips beside the runway and the
// taxiways dressed and the open apron left open; a derelict airfield that is
// also a stunt playground; and the rise beside it as country, which the game
// generates (`airfieldRiseFor` in `city/quarryisland.ts`) rather than this.
//
// The way `quarrydraft` drafts the quarry: small composed units, each a thing
// a disused airfield has, set square to the runway on ground flat enough for
// them, clear of every road, race line, jump run, building and placed prop.
//
// - Derelict: a crash site (a nose-down airframe, a broken fuselage, rubble),
//   a boneyard row of stored fuselages, a ruined hangar, a fuel farm in a bund
//   of blast walls, a helipad with its wreck, rusting ground kit.
// - Stunts: jumps on the taxiways the Marrow Field Run does not use, each
//   with its run-up and landing kept clear, and things to drive under - a
//   cargo plane's wing, a pair of hanging fuselages.
//
// Only set pieces and jumps: no breakables or billboards, whose ids a save
// remembers (Marrow's props load first, so a new one would move every later
// area's). Its own ids (`mo…`) are replaced on a re-run and everything else in
// the file is kept. Then `npm run propsync`.
//
// Usage:
//   npm run marrowdraft          # write docs/props-edited.json
//   npm run marrowdraft -- --dry # count, write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const FILE = 'docs/props-edited.json';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { CITY_SEED, UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { PLAN_PLACES, PLAN_RUNWAY, inArea } = await server.ssrLoadModule('/src/game/city/plan.ts');
const { cellRandom } = await server.ssrLoadModule('/src/game/city/highmoor.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const mine = (id) => /^mo\d/.test(id);
const kept = (old.props ?? []).filter((p) => !mine(p.id));

// Everything here is in metres.
const place = PLAN_PLACES.find((p) => p.kind === 'airfield');
const AREA = place.area;
const onField = (p) => inArea(AREA, { x: p.x * M, z: p.z * M });
const [ra, rb] = PLAN_RUNWAY.map((p) => ({ x: p.x / M, z: p.z / M }));
const RL = Math.hypot(rb.x - ra.x, rb.z - ra.z);
/** Along the runway, and across it. */
const RD = { x: (rb.x - ra.x) / RL, z: (rb.z - ra.z) / RL };
const RN = { x: -RD.z, z: RD.x };
const wet = (p) => inWater(city, p.x * M, p.z * M);
const ground = (p) => groundAt(city.terrain, p.x * M, p.z * M) / M;
/** The rise starts here (`RISE_FOOT` in `city/quarryisland.ts`); the field is below it. */
const FIELD_TOP = 10;
const node = (i) => ({ x: city.nodes[i].pos.x / M, z: city.nodes[i].pos.z / M });
const segDist = (p, a, b) => {
  const ux = b.x - a.x, uz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ux + (p.z - a.z) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a.x + ux * t - p.x, a.z + uz * t - p.z);
};

// ---- What is in the way ------------------------------------------------------

const BOX = {
  minX: Math.min(...AREA.map((p) => p.x)) / M - 50, maxX: Math.max(...AREA.map((p) => p.x)) / M + 50,
  minZ: Math.min(...AREA.map((p) => p.z)) / M - 50, maxZ: Math.max(...AREA.map((p) => p.z)) / M + 50,
};
const inBox = (p) => p.x > BOX.minX && p.x < BOX.maxX && p.z > BOX.minZ && p.z < BOX.maxZ;
const roads = city.roads
  .map((r) => ({ a: node(r.a), b: node(r.b), half: r.width / 2 / M, dirt: r.surface === 'dirt', road: r }))
  .filter((s) => inBox(s.a) || inBox(s.b));
const races = city.routes
  .map((r) => r.points.map((p) => ({ x: p.x / M, z: p.z / M })))
  .flatMap((line) => line.slice(1).map((b, i) => ({ a: line[i], b })))
  .filter((s) => inBox(s.a) || inBox(s.b));
const keep = [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)]
  .map((p) => ({ x: p.x / M, z: p.z / M }))
  .filter(inBox);
const buildings = city.buildings
  .map((b) => ({ minX: b.footprint.minX / M, maxX: b.footprint.maxX / M, minZ: b.footprint.minZ / M, maxZ: b.footprint.maxZ / M }))
  .filter((b) => inBox({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }));
const jumps = [
  ...city.jumps.map((j) => ({ x: j.at.x / M, z: j.at.z / M, dx: Math.sin(j.angle), dz: Math.cos(j.angle) })).filter(inBox),
];

/** Back from a road's edge: a car that runs a corner wide on dirt goes further than a pavement. */
const ROAD_CLEAR = 8;
/** Back from a race line, which is the middle of the road it runs on. */
const RACE_CLEAR = 18;
/** A jump's run-up behind it and its flight and landing ahead, and how wide either side. */
const JUMP_BEHIND = 150, JUMP_AHEAD = 230, JUMP_SIDE = 30;
/** Between one piece and the next, and between units. */
const PIECE_GAP = 2.5, UNIT_GAP = 10;

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
  'plane-belly': [32, 30], 'plane-nose': [28, 16], fuselage: [4, 18], 'fuselage-hung': [8, 22], helicopter: [14, 16], outcrop: [13, 10],
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


/** Is a piece's footprint clear of everything, on flat enough dry field? A jump sits on its taxiway. */
function fits(p) {
  const f = corners(p);
  const onRoadOk = p.kind === 'jump';
  for (const q of probes(f)) {
    if (!onField(q) || wet(q) || ground(q) >= FIELD_TOP) return false;
    if (!onRoadOk && roadEdge(q).d < ROAD_CLEAR) return false;
    if (races.some((s) => segDist(q, s.a, s.b) < RACE_CLEAR)) return false;
    if (!onRoadOk && inJump(q)) return false;
    if (keep.some((k) => Math.hypot(k.x - q.x, k.z - q.z) < 10)) return false;
    if (buildings.some((b) => q.x > b.minX - 8 && q.x < b.maxX + 8 && q.z > b.minZ - 8 && q.z < b.maxZ + 8)) return false;
  }
  const hs = probes(f, Math.max(2, Math.min(6, reachOf(f) / 3))).map(ground);
  if (Math.max(...hs) - Math.min(...hs) >= fallOf(p.kind)) return false;
  return true;
}

// ---- What a unit is ------------------------------------------------------------

/**
 * A unit, in its own frame: `u` out from its front edge (0) and `v` along it
 * (0 at its middle). Headings: 'along' runs with `v`, 'out' points along `u`,
 * 'in' back towards the front, 'back' against `v`, or an angle in radians
 * added to 'along'.
 */
const piece = (kind, u, v, face = 'along', variant) => ({ kind, u, v, face, ...(variant ? { variant } : {}) });

/** Where an airframe came down: the nose in the ground, the fuselage that broke off it, the debris. */
const crashSite = (r) => [
  piece('plane-nose', 18, 0, r(1) < 0.5 ? 'along' : 'back'),
  piece('fuselage', 44, r(2) < 0.5 ? -14 : 14, Math.PI / 6 + r(3)),
  piece('rubble', 30, r(4) < 0.5 ? 26 : -26),
  piece('rubble', 60, r(5) < 0.5 ? -6 : 8),
  piece('cone', 1, -10), piece('cone', 1, 0), piece('cone', 1, 10),
];
/** The boneyard: stored airframes in a row, square to the taxiway, waiting for a buyer that never came. */
const boneyard = (r) => {
  const n = 3 + Math.floor(r(1) * 3);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('fuselage', 14, (i - (n - 1) / 2) * 11, 'out'));
  if (r(2) < 0.5) out.push(piece('plane-nose', 36, ((n - 1) / 2) * 11 + 8, 'in'));
  return out;
};
/** A hangar gone to ruin: the shell, its fallen bits, a shed beside it. */
const hangar = (r) => [
  piece('warehouse', 40, 0, 'out', 'small'),
  piece('rubble', 14, r(1) < 0.5 ? -30 : 30),
  piece('shed', 30, r(2) < 0.5 ? 30 : -30, 'out'),
  ...(r(3) < 0.5 ? [piece('fuselage', 8, r(4) < 0.5 ? 6 : -6, 'along')] : []),
];
/** The fuel farm: tanks in a bund of blast walls, and the mast that lit it. */
const fuelFarm = (r) => {
  const n = 2 + Math.floor(r(1) * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(piece('tank', 18, (i - (n - 1) / 2) * 18, 'along', 'small'));
  const half = ((n - 1) / 2) * 18 + 10;
  // The bund's walls run along the front: a wall is wide across its heading.
  for (let v = -half; v <= half + 0.1; v += 6.5) out.push(piece('blast-wall', 4, v, 'out'));
  out.push(piece('mast', 34, half + 6));
  return out;
};
/** A helipad and what is left of the last thing to land on it. */
const helipad = (r) => {
  const out = [piece('helicopter', 16, 0, r(1) * 6.28)];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    out.push(piece('cone', 16 + Math.cos(t) * 13, Math.sin(t) * 13));
  }
  return out;
};
/** Ground kit left to rust: a crane, a cabin, a silo and the cones nobody took in. */
const groundKit = (r) => [
  piece('cabin', 8, -10, 'out'),
  piece(r(1) < 0.5 ? 'crane' : 'silo', 22, 8),
  piece('silo', 10, 14),
  piece('cone', 3, 0), piece('cone', 3, 4),
];
/** A bunker and its blast walls, from when the field had a use. */
const bunkers = (r) => [
  piece('bunker', 10, 0, 'out'),
  piece('blast-wall', 1, -6.5, 'out'), piece('blast-wall', 1, 0, 'out'), piece('blast-wall', 1, 6.5, 'out'),
  ...(r(1) < 0.6 ? [piece('bunker', 10, 22, 'out')] : []),
];
/** Something to drive under: a cargo plane down on its belly, wing held up off the ground. */
const underWing = () => [piece('plane-belly', 22, 0, 'along')];
/** And a pair of hanging fuselages, one behind the other, to drive under both. */
const underPair = () => [piece('fuselage-hung', 14, -18, 'along'), piece('fuselage-hung', 14, 18, 'along')];

// ---- Placing one ---------------------------------------------------------------

const drafted = [];
let units = 0;
const CAPS = new Map();
const cap = (make, n) => (CAPS.set(make, { n, used: 0 }), make);
const angleOf = (x, z) => Math.atan2(x, z);
const wrap = (a) => Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 1000) / 1000;

function tryUnit(make, seed, front, dir, out, gap = UNIT_GAP) {
  const limit = CAPS.get(make);
  if (limit && limit.used >= limit.n) return false;
  const r = (k) => cellRandom(Math.round(front.x), Math.round(front.z), 900 + k + seed * 23);
  const list = make(r).map((q) => {
    const at = { x: front.x + out.x * q.u + dir.x * q.v, z: front.z + out.z * q.u + dir.z * q.v };
    const heading = q.face === 'along' ? dir : q.face === 'out' ? out : q.face === 'in' ? { x: -out.x, z: -out.z } : q.face === 'back' ? { x: -dir.x, z: -dir.z } : dir;
    const angle = wrap(angleOf(heading.x, heading.z) + (typeof q.face === 'number' ? q.face : 0));
    return { kind: q.kind, x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10, angle, ...(q.variant ? { variant: q.variant } : {}) };
  });
  const feet = list.map((p) => corners(p));
  for (const f of feet) {
    const grown = f.round ? { ...f, r: f.r + gap } : corners(list[feet.indexOf(f)], gap);
    if (takenNear(grown, 0).some((g) => overlaps(grown, g))) return false;
  }
  for (let i = 0; i < feet.length; i++)
    for (let j = i + 1; j < feet.length; j++) {
      // Cones stand where they stand, and a bund's walls stand edge to edge.
      const tight = list[i].kind === 'cone' || list[j].kind === 'cone' || (list[i].kind === 'blast-wall' && list[j].kind === 'blast-wall');
      if (tight && list[i].kind === 'blast-wall') continue;
      const gi = tight ? feet[i] : (feet[i].round ? { ...feet[i], r: feet[i].r + PIECE_GAP } : corners(list[i], PIECE_GAP));
      if (overlaps(gi, feet[j])) return false;
    }
  if (!list.every((p) => fits(p))) return false;
  taken.push(...feet);
  drafted.push(...list);
  units++;
  if (limit) limit.used++;
  return true;
}

function anchors(step, salt) {
  const out = [];
  for (let x = BOX.minX; x <= BOX.maxX; x += step)
    for (let z = BOX.minZ; z <= BOX.maxZ; z += step) {
      const p = { x: Math.round(x), z: Math.round(z) };
      if (onField(p)) out.push({ ...p, k: cellRandom(p.x, p.z, salt) });
    }
  return out.sort((a, b) => a.k - b.k);
}
const pick = (x, z, salt, menu) => {
  const k = Math.floor(cellRandom(x, z, salt) * menu.length);
  return [...menu.slice(k), ...menu.slice(0, k)];
};

// 1. Stunts first, so the derelict units keep out of their runs: a jump on
// each taxiway stretch the race does not use, pointing along it, its run-up
// and landing kept clear as a corridor nothing else may stand in.
const JUMP_KINDS = ['built ramp', 'grass mound', 'lifted slab'];
const MAX_JUMPS = 5;
let newJumps = 0;
const stretches = roads
  .filter((s) => s.dirt && Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) > 60)
  .filter((s) => onField({ x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 }))
  .map((s) => ({ ...s, raced: races.some((r) => segDist({ x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 }, r.a, r.b) < 25) }))
  .filter((s) => !s.raced)
  .sort((a, b) => cellRandom(Math.round(a.a.x), Math.round(a.a.z), 51) - cellRandom(Math.round(b.a.x), Math.round(b.a.z), 51));
for (const s of stretches) {
  if (newJumps >= MAX_JUMPS) break;
  const l = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
  const dir = { x: (s.b.x - s.a.x) / l, z: (s.b.z - s.a.z) / l };
  const at = { x: Math.round((s.a.x + dir.x * l * 0.5) * 10) / 10, z: Math.round((s.a.z + dir.z * l * 0.5) * 10) / 10 };
  // Far enough from every other jump that the runs do not cross.
  if (jumps.some((j) => Math.hypot(j.x - at.x, j.z - at.z) < JUMP_BEHIND + JUMP_AHEAD)) continue;
  const variant = JUMP_KINDS[Math.floor(cellRandom(Math.round(at.x), Math.round(at.z), 52) * JUMP_KINDS.length)];
  const jump = { kind: 'jump', x: at.x, z: at.z, angle: wrap(angleOf(dir.x, dir.z)), variant };
  if (!fits(jump)) continue;
  // The corridor: its run-up and landing, held as taken ground.
  const corridor = (u0, u1) => ({ round: false, pts: [[-JUMP_SIDE, u0], [JUMP_SIDE, u0], [JUMP_SIDE, u1], [-JUMP_SIDE, u1]].map(([a, b]) => ({ x: at.x + RN.x * 0 + dir.z * a + dir.x * b, z: at.z - dir.x * a + dir.z * b })) });
  const run = corridor(-JUMP_BEHIND, JUMP_AHEAD);
  if (takenNear(run, 0).some((g) => overlaps(run, g))) continue;
  taken.push(run);
  jumps.push({ x: at.x, z: at.z, dx: dir.x, dz: dir.z });
  drafted.push(jump);
  newJumps++;
  units++;
}

// 2. Things to drive under, on open field near the taxiways.
// 3. The derelict field, square to the runway, either way round.
const ORIENT = [[RD, RN], [{ x: -RD.x, z: -RD.z }, { x: -RN.x, z: -RN.z }], [RN, { x: -RD.x, z: -RD.z }], [{ x: -RN.x, z: -RN.z }, RD]];
const MENU = [
  [cap(underWing, 2), 1], [cap(underPair, 2), 2],
  [cap(crashSite, 5), 3], [cap(boneyard, 4), 4], [cap(hangar, 3), 5], [cap(fuelFarm, 2), 6],
  [cap(helipad, 2), 7], [cap(groundKit, 6), 8], [cap(bunkers, 4), 9],
];
/** How often a spot is left as open field, so the apron stays open. */
const OPEN = 0.35;
for (const a of anchors(18, 61)) {
  if (cellRandom(a.x, a.z, 62) < OPEN) continue;
  // The strips beside the taxiways, not the middle of nowhere.
  const { d } = roadEdge(a);
  if (d < ROAD_CLEAR + 2 || d > 140) continue;
  const menu = pick(a.x, a.z, 63, MENU);
  let done = false;
  for (const [make, seed] of menu) {
    for (let t = 0; t < 4 && !done; t++) {
      const [dir, out] = ORIENT[(t + Math.floor(a.k * 4)) % 4];
      done = tryUnit(make, seed, a, dir, out);
    }
    if (done) break;
  }
}

// ---- Writing it ------------------------------------------------------------------

const count = {};
for (const p of drafted) count[p.kind] = (count[p.kind] ?? 0) + 1;
console.log(
  `${units} units, ${drafted.length} pieces: ` +
    Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ') +
    ` · ${kept.length} props kept`,
);
if (!DRY) {
  const doc = { ...old, seed: `0x${(CITY_SEED >>> 0).toString(16)}`, savedAt: new Date().toISOString(), props: [...kept, ...drafted.map((p, i) => ({ id: `mo${i + 1}`, ...p }))] };
  writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${FILE}`);
}
