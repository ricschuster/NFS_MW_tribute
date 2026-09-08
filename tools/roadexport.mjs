// Export the generated map for the road editor.
//
// The plan (#272) was drawn by hand over the generated relief and it worked,
// because a plan is a few dozen judgements and hand-drawing is what judgement
// looks like. This is the same move one layer down: the roads come out of the
// generator, and editing them by hand needs them somewhere a person can push
// them about.
//
// Writes a single JSON file: the terrain as a hill-shaded PNG, the coastline,
// and every road as a chain of points in world metres. Small enough to embed in
// a page, because an editor that has to fetch its own data is an editor with a
// server.
//
// Usage:
//   npm run roadexport            # -> screenshots/roads.json
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { generateCity } = await server.ssrLoadModule('/src/game/city/generate.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const plan = await server.ssrLoadModule('/src/game/city/plan.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_SEED, CITY_LAND_STREAM, UNITS_PER_METRE } = C;

const city = generateCity(CITY_SEED);
const bounds = city.bounds;
const water = makeWater(new Rng(CITY_LAND_STREAM), bounds);
await server.close();

const toM = (v) => v / UNITS_PER_METRE;
const round = (v) => Math.round(v);

// Roads as chains rather than as 5000 separate segments. The generator splits a
// road at every junction, so a routed road arrives as a chain of thirty-metre
// pieces; an editor that showed those as five thousand separate things would be
// unusable. Joined back up here by walking from every node that is not a plain
// through-point.
const degree = new Map();
for (const r of city.roads) {
  degree.set(r.a, (degree.get(r.a) ?? 0) + 1);
  degree.set(r.b, (degree.get(r.b) ?? 0) + 1);
}
const from = new Map();
for (const r of city.roads) {
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
// Junctions and ends first, so a chain runs between two of them; whatever is
// left after that is a loop, which is started anywhere.
for (const [id, edges] of from) {
  if (degree.get(id) === 2) continue;
  for (const edge of edges) {
    if (used.has(edge)) continue;
    chains.push({ nodes: walk(id, edge), road: edge });
  }
}
for (const road of city.roads) {
  if (used.has(road)) continue;
  chains.push({ nodes: walk(road.a, road), road });
}

const roads = chains.map((chain, i) => ({
  id: `r${i}`,
  kind: chain.road.class,
  bridge: !!chain.road.bridge,
  district: chain.road.district,
  points: chain.nodes.map((n) => [round(toM(city.nodes[n].pos.x)), round(toM(city.nodes[n].pos.z))]),
}));

// The land, as a coarse mask the page can draw as a hill-shaded background.
// A raster rather than the traced coastline, because the editor wants to show
// the *ground* - a road that reads as wrong usually reads as wrong against a
// slope.
const STEP = 40 * UNITS_PER_METRE;
const cols = Math.ceil((bounds.maxX - bounds.minX) / STEP);
const rows = Math.ceil((bounds.maxZ - bounds.minZ) / STEP);
const height = [];
for (let row = 0; row < rows; row++) {
  const line = [];
  for (let col = 0; col < cols; col++) {
    const x = bounds.minX + col * STEP;
    const z = bounds.minZ + row * STEP;
    line.push(water.isWater(x, z) ? -1 : Math.max(0, Math.round(toM(groundAt(city.terrain, x, z)))));
  }
  height.push(line);
}

const out = {
  seed: `0x${(CITY_SEED >>> 0).toString(16)}`,
  bounds: {
    minX: round(toM(bounds.minX)),
    minZ: round(toM(bounds.minZ)),
    maxX: round(toM(bounds.maxX)),
    maxZ: round(toM(bounds.maxZ)),
  },
  // Rows run from minZ up. -1 is water, otherwise metres above the sea.
  height: { step: 40, cols, rows, cells: height },
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
};

mkdirSync('screenshots', { recursive: true });
const json = JSON.stringify(out);
writeFileSync('screenshots/roads.json', json);
console.log(
  `wrote screenshots/roads.json  ·  ${roads.length} roads from ${city.roads.length} segments  ·  ` +
    `${(json.length / 1024).toFixed(0)} KB`,
);
