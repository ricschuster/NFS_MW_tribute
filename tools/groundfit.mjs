// How every set piece sits on the ground it stands on: a report, not a gate.
//
// A set piece is placed at the height of the ground under its middle
// (`airfieldProps` in `city/setpieces.ts`), and drawn flat from there. On a
// slope that leaves one side of it in the air and the other side buried, and
// a big footprint on a hillside does both by metres. This builds the city,
// takes each piece's footprint from what it is solid as at the ground
// (`SET_PIECE_SOLIDS`, the parts that start at ground level), samples the
// height field under its corners, edges and middle, and reports what floats
// (a corner more than `TOLERANCE` below the piece's base) and what is sunk (a
// corner more than that above it), by area and by kind - and what stands on a
// road or in the water. A piece drawn down onto a footing (a shed, an estate
// house) is allowed that much float, since its wall reaches the ground.
//
// It separates what the owner placed (anything in a `docs/*props*.json`,
// drafted or not, which is matched there by kind and position and listed by
// id so it can be found in the area editor) from what the game generates
// (woods, garden trees, country, which a generator can be told to keep off).
// Kinds the editor allows on a road (`road: 'ok'` in `tools/propeditor.html`:
// cones, rubble, a gate across it) are not counted as standing on one.
//
// Usage:
//   npm run groundfit                 # the summary and the worst offenders
//   npm run groundfit -- --all        # every offender, not just the worst
//   npm run groundfit -- --tolerance 2
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';

const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const ALL = process.argv.includes('--all');
/** How far a corner may be off the piece's base, in metres, before it counts. */
const TOLERANCE = Number(flag('--tolerance', '1'));

const server = await createServer({ appType: 'custom', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { UNITS_PER_METRE: M } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater, distanceToSegment } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { solidsOf: solidsOfPiece } = await server.ssrLoadModule('/src/game/city/setpieces.ts');
const { PLAN_DISTRICTS, PLAN_PLACES, inArea } = await server.ssrLoadModule('/src/game/city/plan.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

// ---- Who placed what ----------------------------------------------------------

/** Every placed prop, by kind and position to a tenth of a metre, with its file and id. */
const placed = new Map();
for (const file of readdirSync('docs').filter((f) => /props.*\.json$/.test(f))) {
  const doc = JSON.parse(readFileSync(`docs/${file}`, 'utf8'));
  const area = file === 'props-edited.json' ? 'marrow' : file.replace('-props-edited.json', '');
  for (const p of doc.props ?? []) placed.set(`${p.kind}@${Math.round(p.x * 10)},${Math.round(p.z * 10)}`, { area, id: p.id });
}
const whoPlaced = (piece) => placed.get(`${piece.kind}@${Math.round((piece.at.x / M) * 10)},${Math.round((piece.at.z / M) * 10)}`) ?? null;

/** Where a generated piece is: the place or district it stands in. */
function whereIs(at) {
  for (const p of PLAN_PLACES) if (p.area && inArea(p.area, at)) return p.name;
  for (const d of PLAN_DISTRICTS) if (inArea(d.poly, at)) return d.name ?? d.kind;
  return 'country';
}

/** Kinds the editor lets stand on a road. */
const editor = readFileSync('tools/propeditor.html', 'utf8');
const roadOk = new Set([...editor.matchAll(/\{ id: '([a-z-]+)'[^\n]*road: 'ok'/g)].map((m) => m[1]));

// ---- Footprints ---------------------------------------------------------------

/** What a piece is solid as: its variant's solids where it has them (a small warehouse is not a big one). */
const solidsOf = (piece) => solidsOfPiece(piece) ?? [];
/**
 * How far below its base a piece is drawn down to: a shed or an estate house
 * stands on a footing (`WAREHOUSE_FOOTING`, `ESTATE_FOOTING`), a wall carried
 * down past the ground so the downhill side of a slope shows no daylight, and
 * a float within it is not a float anyone sees.
 */
const footingOf = (piece) => Math.max(0, ...solidsOf(piece).map((s) => -s.y0));

/** Points under a piece, in world units: corners, edge middles and middle of each solid that starts at the ground. */
function probes(piece) {
  const solids = solidsOf(piece).filter((s) => s.y0 <= 0.5);
  const sin = Math.sin(piece.angle), cos = Math.cos(piece.angle);
  // Along the heading is (sin, cos); across it is (cos, -sin), as the editor and the solids read it.
  const at = (u, v) => ({ x: piece.at.x + (cos * u + sin * v) * M, z: piece.at.z + (-sin * u + cos * v) * M });
  const out = [{ x: piece.at.x, z: piece.at.z }];
  for (const s of solids) {
    if ('r' in s) {
      for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) out.push(at(s.u + du * s.r, s.v + dv * s.r));
    } else {
      for (const fu of [-0.5, 0, 0.5]) for (const fv of [-0.5, 0, 0.5]) out.push(at(s.u + fu * s.w, s.v + fv * s.l));
    }
  }
  return out;
}

// Surface roads, as segments, bucketed so a piece asks only the ones near it.
const BUCKET = 100 * M;
const buckets = new Map();
const segs = city.roads
  .filter((r) => !r.bridge && city.nodes[r.a].level === 'surface' && city.nodes[r.b].level === 'surface')
  .map((r) => ({ a: city.nodes[r.a].pos, b: city.nodes[r.b].pos, half: r.width / 2 }));
segs.forEach((s, id) => {
  for (let i = Math.floor(Math.min(s.a.x, s.b.x) / BUCKET) - 1; i <= Math.floor(Math.max(s.a.x, s.b.x) / BUCKET) + 1; i++)
    for (let j = Math.floor(Math.min(s.a.z, s.b.z) / BUCKET) - 1; j <= Math.floor(Math.max(s.a.z, s.b.z) / BUCKET) + 1; j++) {
      const k = `${i},${j}`;
      (buckets.get(k) ?? buckets.set(k, []).get(k)).push(id);
    }
});
const onARoad = (p) =>
  (buckets.get(`${Math.floor(p.x / BUCKET)},${Math.floor(p.z / BUCKET)}`) ?? []).some((id) => {
    const s = segs[id];
    return distanceToSegment(p.x, p.z, s.a.x, s.a.z, s.b.x, s.b.z) < s.half;
  });

// ---- Measuring ----------------------------------------------------------------

const rows = [];
for (const piece of city.setPieces) {
  const pts = probes(piece);
  const hs = pts.map((p) => groundAt(city.terrain, p.x, p.z));
  const base = piece.y;
  const float = Math.max(0, ...hs.map((h) => (base - h) / M).map((f) => f - footingOf(piece)));
  const sunk = Math.max(0, ...hs.map((h) => (h - base) / M));
  const road = !roadOk.has(piece.kind) && pts.some(onARoad);
  const wet = pts.some((p) => inWater(city, p.x, p.z));
  if (float <= TOLERANCE && sunk <= TOLERANCE && !road && !wet) continue;
  const who = whoPlaced(piece);
  rows.push({
    kind: piece.kind,
    owner: !!who,
    area: who ? who.area : whereIs(piece.at),
    id: who?.id ?? '-',
    x: Math.round(piece.at.x / M),
    z: Math.round(piece.at.z / M),
    float,
    sunk,
    road,
    wet,
  });
}

// ---- Reporting ----------------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);
console.log(`GROUND FIT - ${city.setPieces.length} set pieces, a corner more than ${TOLERANCE} m off its base counts\n`);
for (const owner of [true, false]) {
  const mine = rows.filter((r) => r.owner === owner);
  console.log(owner ? 'PLACED (in a props file: the owner moves these, in the area editor)' : 'GENERATED (woods, gardens, country: a generator decides these)');
  if (mine.length === 0) {
    console.log('  none\n');
    continue;
  }
  const groups = new Map();
  for (const r of mine) {
    const k = `${r.area}|${r.kind}`;
    const g = groups.get(k) ?? { area: r.area, kind: r.kind, n: 0, float: 0, sunk: 0, road: 0, wet: 0, worst: 0 };
    g.n++;
    if (r.float > TOLERANCE) g.float++;
    if (r.sunk > TOLERANCE) g.sunk++;
    if (r.road) g.road++;
    if (r.wet) g.wet++;
    g.worst = Math.max(g.worst, r.float, r.sunk);
    groups.set(k, g);
  }
  console.log(`  ${pad('area', 20)}${pad('kind', 18)}${pad('pieces', 8)}${pad('floats', 8)}${pad('sunk', 7)}${pad('road', 6)}${pad('water', 7)}worst`);
  for (const g of [...groups.values()].sort((a, b) => b.worst - a.worst || b.n - a.n)) {
    console.log(`  ${pad(g.area, 20)}${pad(g.kind, 18)}${pad(g.n, 8)}${pad(g.float, 8)}${pad(g.sunk, 7)}${pad(g.road, 6)}${pad(g.wet, 7)}${g.worst.toFixed(1)} m`);
  }
  const worst = [...mine].sort((a, b) => Math.max(b.float, b.sunk) - Math.max(a.float, a.sunk));
  console.log(`\n  ${ALL ? 'every one' : 'the worst ten'}:`);
  for (const r of ALL ? worst : worst.slice(0, 10)) {
    const what = [r.float > TOLERANCE ? `floats ${r.float.toFixed(1)} m` : '', r.sunk > TOLERANCE ? `sunk ${r.sunk.toFixed(1)} m` : '', r.road ? 'on a road' : '', r.wet ? 'in water' : '']
      .filter(Boolean)
      .join(', ');
    console.log(`    ${pad(r.area, 18)}${pad(r.id, 14)}${pad(r.kind, 16)}${pad(`${r.x},${r.z}`, 14)}${what}`);
  }
  console.log('');
}
