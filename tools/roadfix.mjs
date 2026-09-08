// Apply fixes to a hand-edited network, using the generator's own router.
//
// `roadcheck` says what is wrong; this is the other half. The fixes are the
// ones a person asks for after looking at the map, and each is a small edit
// rather than a regeneration - the whole point of an authored network is that
// it survives being corrected.
//
// Three operations:
//
//   --join <id>      extend a road's loose end until it reaches another road
//   --reland <id>    re-route a crossing so it lands where the ground allows
//   --deadend <ids>  mark an end as deliberate, so the check stops asking
//
// Usage:
//   npm run roadfix <saved.json> -- --join n98 --reland n101 --deadend n103,n105
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const flagAll = (name) => argv.reduce((out, a, i) => (a === name && argv[i + 1] ? [...out, argv[i + 1]] : out), []);
const savedPath = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const outPath = flagAll('--out')[0] ?? savedPath;
const toJoin = flagAll('--join');
const toReland = flagAll('--reland');
const deadEnds = flagAll('--deadend').flatMap((v) => v.split(','));
if (!savedPath) {
  console.error('usage: npm run roadfix <saved.json> -- --join <id> --reland <id> --deadend <ids>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(savedPath, 'utf8'));
const saved = raw.roads ? raw : raw.data ?? raw;

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { makeTerrain } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { shapeForPlaces } = await server.ssrLoadModule('/src/game/city/places.ts');
const { makeRouter } = await server.ssrLoadModule('/src/game/city/routing.ts');
const { landBodies } = await server.ssrLoadModule('/src/game/city/bodies.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
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
const land = landBodies(bounds, water);
const router = makeRouter(bounds, terrain, water);
await server.close();

const m = (v) => v * UNITS_PER_METRE;
const toM = (v) => v / UNITS_PER_METRE;
const world = (p) => ({ x: m(p[0]), z: m(p[1]) });
const flat = (p) => [Math.round(toM(p.x)), Math.round(toM(p.z))];

/** Nearest point on any other road, and which road it was. */
function nearest(at, roads, skipId) {
  let best = { d: Infinity, point: null, who: null };
  for (const r of roads) {
    if (r.id === skipId) continue;
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1];
      const [bx, bz] = r.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - az) * dz) / span));
      const point = [ax + dx * t, az + dz * t];
      const d = Math.hypot(point[0] - at[0], point[1] - at[1]);
      if (d < best.d) best = { d, point: [Math.round(point[0]), Math.round(point[1])], who: r.id };
    }
  }
  return best;
}

const byId = new Map(saved.roads.map((r) => [r.id, r]));
const log = [];

// --- join: pull a loose end onto the road it was reaching for.
//
// Straight, not routed. A loose end is tens of metres from something, and a
// router asked for a fifty-metre path returns the straight line anyway - with
// the cost of a search over the whole grid and a chain of cells instead of one
// segment.
for (const id of toJoin) {
  const road = byId.get(id);
  if (!road) {
    log.push(`join ${id}: no such road`);
    continue;
  }
  const ends = [
    { at: road.points[0], put: (p) => road.points.unshift(p) },
    { at: road.points[road.points.length - 1], put: (p) => road.points.push(p) },
  ].map((e) => ({ ...e, hit: nearest(e.at, saved.roads, id) }));
  const loose = ends.reduce((a, b) => (a.hit.d > b.hit.d ? a : b));
  loose.put(loose.hit.point);
  log.push(`join ${id}: extended ${Math.round(loose.hit.d)} m to meet ${loose.hit.who} at (${loose.hit.point[0]}, ${loose.hit.point[1]})`);
}

// --- reland: let the router choose the crossing and the landing.
//
// The hand-drawn line took the shortest way over the water and came ashore
// straight up the bank, which is what a line does and not what a road does. The
// router prices the square of the gradient, so it will trade a longer crossing
// or a slanted landing for a grade something can climb - which is the whole
// reason routing exists (ADR-0008 rule 2).
//
// It keeps the road's own start and aims at whatever it was trying to reach on
// the far side, found as the nearest road on a *different body of land*.
for (const id of toReland) {
  const road = byId.get(id);
  if (!road) {
    log.push(`reland ${id}: no such road`);
    continue;
  }
  const start = road.points[0];
  const home = land.at(m(start[0]), m(start[1]));
  let target = null;
  let bestD = Infinity;
  for (const other of saved.roads) {
    if (other.id === id) continue;
    for (const p of other.points) {
      if (land.at(m(p[0]), m(p[1])) === home) continue;
      const d = Math.hypot(p[0] - start[0], p[1] - start[1]);
      if (d < bestD) {
        bestD = d;
        target = { point: p, who: other.id };
      }
    }
  }
  if (!target) {
    log.push(`reland ${id}: nothing on another body of land to aim at`);
    continue;
  }
  const line = router.route(world(start), world(target.point), ROUTE_COUNTRY);
  if (line.length < 2) {
    log.push(`reland ${id}: the router found no way across`);
    continue;
  }
  road.points = line.map(flat);
  // The routed line ends *at* the target, which is a point on that road, so it
  // joins by construction rather than by being close enough.
  log.push(
    `reland ${id}: re-routed ${Math.round(bestD)} m of straight line into ` +
      `${road.points.length} points, landing on ${target.who} at (${target.point[0]}, ${target.point[1]})`,
  );
}

// --- deadend: a road that stops where it means to.
for (const id of deadEnds) {
  const road = byId.get(id);
  if (!road) {
    log.push(`deadend ${id}: no such road`);
    continue;
  }
  road.deadEnd = true;
  log.push(`deadend ${id}: marked deliberate`);
}

saved.fixedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(saved));
for (const line of log) console.log(line);
console.log(`\nwrote ${outPath}`);
