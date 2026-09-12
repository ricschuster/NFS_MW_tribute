// Export the generated map for the freeway loop editor (#261).
//
// The same move as `roadexport.mjs`, one layer up: this is a single closed
// loop rather than a network of independent chains, so it gets its own small
// export instead of being squeezed into the roads schema. Writes the relief,
// the surface network (for context - the loop has to cross it, not ignore
// it), and today's rectangle-inset-from-the-land as the starting draft to
// drag into shape.
//
// Usage:
//   npm run freewayexport            # -> screenshots/freeway.json
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { generateCity } = await server.ssrLoadModule('/src/game/city/generate.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const { draftLoop } = await server.ssrLoadModule('/src/game/city/interstate.ts');
const plan = await server.ssrLoadModule('/src/game/city/plan.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_SEED, CITY_LAND_STREAM, UNITS_PER_METRE } = C;

const city = generateCity(CITY_SEED);
const bounds = city.bounds;
const water = makeWater(new Rng(CITY_LAND_STREAM), bounds);
const draft = draftLoop(bounds, water);
await server.close();

const toM = (v) => v / UNITS_PER_METRE;
const round = (v) => Math.round(v);

// Surface roads only, and thinned to their own chains exactly as roadexport
// does - the loop is drawn against them for context (it has to cross the
// grid, not run alongside it forever), not to edit them here.
const surface = city.roads.filter((r) => r.class !== 'interstate' && r.class !== 'ramp');
const degree = new Map();
for (const r of surface) {
  degree.set(r.a, (degree.get(r.a) ?? 0) + 1);
  degree.set(r.b, (degree.get(r.b) ?? 0) + 1);
}
const from = new Map();
for (const r of surface) {
  if (!from.has(r.a)) from.set(r.a, []);
  if (!from.has(r.b)) from.set(r.b, []);
  from.get(r.a).push(r);
  from.get(r.b).push(r);
}
const used = new Set();
const chains = [];
const walk = (start, first) => {
  const points = [start];
  let node = start;
  let edge = first;
  for (;;) {
    used.add(edge);
    const next = edge.a === node ? edge.b : edge.a;
    points.push(next);
    node = next;
    if (degree.get(node) !== 2) break;
    const on = from.get(node).filter((e) => !used.has(e));
    if (on.length !== 1) break;
    edge = on[0];
  }
  return points;
};
for (const [id, edges] of from) {
  if (degree.get(id) === 2) continue;
  for (const edge of edges) {
    if (used.has(edge)) continue;
    chains.push(walk(id, edge));
  }
}
for (const road of surface) {
  if (used.has(road)) continue;
  chains.push(walk(road.a, road));
}
const roads = chains.map((nodes) => nodes.map((n) => [round(toM(city.nodes[n].pos.x)), round(toM(city.nodes[n].pos.z))]));

// The land, as a hill-shaded raster - identical to roadexport's, since a
// route through the hills wants exactly the same background a street does.
const STEP = 12 * UNITS_PER_METRE;
const cols = Math.ceil((bounds.maxX - bounds.minX) / STEP);
const rows = Math.ceil((bounds.maxZ - bounds.minZ) / STEP);
const WATER = 255;
const cells = new Uint8Array(cols * rows);
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const x = bounds.minX + col * STEP;
    const z = bounds.minZ + row * STEP;
    cells[row * cols + col] = water.isWater(x, z)
      ? WATER
      : Math.max(0, Math.min(254, Math.round(toM(groundAt(city.terrain, x, z)))));
  }
}

const out = {
  seed: `0x${(CITY_SEED >>> 0).toString(16)}`,
  bounds: {
    minX: round(toM(bounds.minX)),
    minZ: round(toM(bounds.minZ)),
    maxX: round(toM(bounds.maxX)),
    maxZ: round(toM(bounds.maxZ)),
  },
  height: { step: 12, cols, rows, water: WATER, cells: Buffer.from(cells).toString('base64') },
  places: plan.PLAN_PLACES.map((p) => ({
    kind: p.kind,
    name: p.name,
    at: [round(toM(p.at.x)), round(toM(p.at.z))],
  })),
  districts: plan.PLAN_DISTRICTS.map((a) => ({
    kind: a.kind,
    poly: a.poly.map((p) => [round(toM(p.x)), round(toM(p.z))]),
  })),
  roads,
  draft: draft.map((p) => [round(toM(p.x)), round(toM(p.z))]),
};

mkdirSync('screenshots', { recursive: true });
const json = JSON.stringify(out);
writeFileSync('screenshots/freeway.json', json);
console.log(`wrote screenshots/freeway.json  ·  ${roads.length} surface chains  ·  ${(json.length / 1024).toFixed(0)} KB`);
