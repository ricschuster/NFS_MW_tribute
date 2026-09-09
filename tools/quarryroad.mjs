// Put the quarry's haul road into the authored network.
//
// The roads are drawn now (`CITY_AUTHORED_ROADS`), which means the generator no
// longer lays the places' own roads: whatever `places.ts` builds is only laid
// when the switch is off. So a road that belongs to a *place* and is generated
// from its geometry has to be written into `docs/roads-edited.json` like any
// other, after which it is editable, checkable and syncable exactly like the
// ones drawn by hand.
//
// It is regenerated rather than hand-drawn because it is the one road on the map
// whose shape is a consequence of something else - the pit it is cut into. Move
// the quarry or change `QUARRY_RAMP_TURNS` and this is run again.
//
// Usage:
//   npm run quarryroad
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { quarryHaul } = await server.ssrLoadModule('/src/game/city/places.ts');
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { makeTerrain, groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { shapeForPlaces } = await server.ssrLoadModule('/src/game/city/places.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const plan = await server.ssrLoadModule('/src/game/city/plan.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_LAND_STREAM, CITY_WIDTH, CITY_DEPTH, UNITS_PER_METRE, ROUTE_COUNTRY } = C;

const bounds = {
  minX: -CITY_WIDTH / 2,
  minZ: -CITY_DEPTH / 2,
  maxX: CITY_WIDTH / 2,
  maxZ: CITY_DEPTH / 2,
};
const water = makeWater(new Rng(CITY_LAND_STREAM), bounds);
const terrain = makeTerrain(CITY_LAND_STREAM, bounds, water);
shapeForPlaces(terrain, water);

const quarry = plan.PLAN_PLACES.find((p) => p.kind === 'quarry');
const path = quarryHaul(quarry.at, quarry.radius);
await server.close();

const toM = (v) => v / UNITS_PER_METRE;
const points = path.map((step) => [Math.round(toM(step.at.x)), Math.round(toM(step.at.z))]);

// What it comes out at, measured on the ground it was cut into rather than on
// the ground it replaced.
let steepest = 0;
let length = 0;
for (let i = 1; i < path.length; i++) {
  const run = Math.hypot(path[i].at.x - path[i - 1].at.x, path[i].at.z - path[i - 1].at.z);
  const rise = Math.abs(
    groundAt(terrain, path[i].at.x, path[i].at.z) - groundAt(terrain, path[i - 1].at.x, path[i - 1].at.z),
  );
  length += run;
  if (run > 1) steepest = Math.max(steepest, rise / run);
}
const heights = path.map((step) => toM(groundAt(terrain, step.at.x, step.at.z)));

const file = 'docs/roads-edited.json';
const doc = JSON.parse(readFileSync(file, 'utf8'));
doc.roads = doc.roads.filter((r) => r.id !== 'q1');
doc.roads.push({
  id: 'q1',
  kind: 'boulevard',
  bridge: false,
  district: 'industrial',
  deadEnd: true,
  points,
});
writeFileSync(file, JSON.stringify(doc));

console.log(
  `q1: the haul road · ${(toM(length) / 1000).toFixed(2)} km · ${points.length} points · ` +
    `${Math.round(Math.max(...heights))} m down to ${Math.round(Math.min(...heights))} m · ` +
    `max ${(steepest * 100).toFixed(1)}% against a ${Math.round(ROUTE_COUNTRY.cap * 100)}% cap`,
);
console.log(`wrote ${file} (${doc.roads.length} roads) - run npm run roadsync next`);
