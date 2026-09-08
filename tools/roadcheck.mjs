// Is this network buildable?
//
// The editor will let you draw anything: up a cliff, out to sea, ending in mid
// air. The generator will not - a road too steep is a road the car cannot climb,
// a water crossing longer than `CITY_MAX_BRIDGE` is not a bridge, and a road
// whose ends touch nothing is pruned the moment it is laid.
//
// So this is the gate between the drawing and the city. It asks four questions
// of a hand-edited network, all of them ones the generator will ask later and
// none of them visible on the map:
//
//   1. Where does it cross water, and can that crossing be built?
//   2. How steep does it get?
//   3. Do both ends join something?
//   4. Is the whole network still one piece, with every place on it?
//
// Usage:
//   npm run roadcheck <saved.json>
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const savedPath = process.argv[2];
if (!savedPath) {
  console.error('usage: npm run roadcheck <saved.json>');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(savedPath, 'utf8'));
const saved = raw.roads ? raw : raw.data ?? raw;
const base = JSON.parse(readFileSync('screenshots/roads.json', 'utf8'));

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { makeTerrain, groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { shapeForPlaces } = await server.ssrLoadModule('/src/game/city/places.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_LAND_STREAM, CITY_WIDTH, CITY_DEPTH, UNITS_PER_METRE, CITY_MAX_BRIDGE, ROUTE_ARTERIAL, ROUTE_COUNTRY } = C;

const bounds = {
  minX: -CITY_WIDTH / 2,
  minZ: -CITY_DEPTH / 2,
  maxX: CITY_WIDTH / 2,
  maxZ: CITY_DEPTH / 2,
};
const water = makeWater(new Rng(CITY_LAND_STREAM), bounds);
const terrain = makeTerrain(CITY_LAND_STREAM, bounds, water);
// The places dig into the ground before any road is laid, so a road to the
// quarry has to be measured against the quarry rather than the hill it replaced.
shapeForPlaces(terrain, water);
await server.close();

const m = (v) => v * UNITS_PER_METRE;
const toM = (v) => v / UNITS_PER_METRE;
const maxBridge = toM(CITY_MAX_BRIDGE);
const STEP = 10; // metres between samples along a road
const JOIN = 45; // metres: how close an end has to be to count as joined

const wet = (x, z) => water.isWater(m(x), m(z));
const ground = (x, z) => toM(groundAt(terrain, m(x), m(z)));

/** Walk a road at a fixed step, so long segments are not skipped over. */
function* along(points) {
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const span = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(span / STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      yield [ax + (bx - ax) * t, az + (bz - az) * t, span / steps];
    }
  }
  yield [...points[points.length - 1], 0];
}

function survey(points) {
  let length = 0;
  let overWater = 0;
  let steepest = 0;
  let steepAt = null;
  const crossings = [];
  let run = null;
  let previous = null;

  for (const [x, z, step] of along(points)) {
    const isWet = wet(x, z);
    length += step;
    if (isWet) {
      overWater += step;
      run = run ? { ...run, length: run.length + step } : { at: [Math.round(x), Math.round(z)], length: step };
    } else if (run) {
      crossings.push(run);
      run = null;
    }
    // Grade is meaningless across water - there is no ground under a bridge.
    if (!isWet && previous && !previous.wet && step > 0) {
      const rise = Math.abs(ground(x, z) - previous.h);
      const grade = rise / Math.max(1, previous.step);
      if (grade > steepest) {
        steepest = grade;
        steepAt = [Math.round(x), Math.round(z)];
      }
    }
    previous = { h: isWet ? 0 : ground(x, z), wet: isWet, step };
  }
  if (run) crossings.push(run);
  return { length, overWater, crossings, steepest, steepAt };
}

/** Closest approach from a point to any of these roads, in metres. */
function nearestRoad(at, roads, skipId) {
  let best = Infinity;
  let who = null;
  for (const r of roads) {
    if (r.id === skipId) continue;
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1];
      const [bx, bz] = r.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const span = dx * dx + dz * dz;
      const t = span < 1e-9 ? 0 : Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - az) * dz) / span));
      const d = Math.hypot(ax + dx * t - at[0], az + dz * t - at[1]);
      if (d < best) {
        best = d;
        who = r.id;
      }
    }
  }
  return { d: best, who };
}

const wasThere = new Set(base.roads.map((r) => r.id));
const drawn = saved.roads.filter((r) => !wasThere.has(r.id));

console.log(`checking ${saved.roads.length} roads · ${drawn.length} drawn by hand\n`);
console.log(`  street grade cap ${Math.round(ROUTE_ARTERIAL.cap * 100)}%  ·  country ${Math.round(ROUTE_COUNTRY.cap * 100)}%  ·  longest bridge ${Math.round(maxBridge)} m\n`);

let problems = 0;
for (const r of drawn) {
  const s = survey(r.points);
  const ends = [r.points[0], r.points[r.points.length - 1]].map((at) => nearestRoad(at, saved.roads, r.id));
  const notes = [];

  for (const crossing of s.crossings) {
    if (crossing.length > maxBridge) {
      notes.push(`✗ ${Math.round(crossing.length)} m of open water at (${crossing.at[0]}, ${crossing.at[1]}) - too long to bridge`);
      problems++;
    } else {
      notes.push(`· crosses ${Math.round(crossing.length)} m of water at (${crossing.at[0]}, ${crossing.at[1]}) - a bridge`);
    }
  }
  if (s.steepest > ROUTE_COUNTRY.cap) {
    notes.push(`✗ ${Math.round(s.steepest * 100)}% at (${s.steepAt[0]}, ${s.steepAt[1]}) - steeper than any road may be`);
    problems++;
  } else if (s.steepest > ROUTE_ARTERIAL.cap) {
    notes.push(`! ${Math.round(s.steepest * 100)}% at (${s.steepAt[0]}, ${s.steepAt[1]}) - a country road, not a street`);
  }
  // Both ends loose is a road that is not part of the network and gets pruned.
  // One end loose is a **dead end**, which is a different thing and often a
  // deliberate one - a pier is a dead end on purpose (ADR-0009 rule 6). Saying
  // "would be pruned" for either was wrong and worth not repeating: a road is
  // connected if it touches the network anywhere along it, not at its tips.
  const loose = ends.filter((e) => e.d > JOIN).length;
  if (loose === 2) {
    notes.push(`✗ neither end joins a road - nearest is ${Math.round(Math.min(...ends.map((e) => e.d)))} m away, so this would be pruned`);
    problems++;
  } else if (loose === 1) {
    const which = ends[0].d > JOIN ? 'start' : 'end';
    const gap = Math.round(Math.max(...ends.map((e) => e.d)));
    notes.push(`! its ${which} is a dead end - ${gap} m of open ground to the nearest road`);
  }

  console.log(
    `${r.id}  ${(s.length / 1000).toFixed(2)} km` +
      (s.overWater > 0 ? `  ${Math.round((s.overWater / s.length) * 100)}% over water` : '') +
      `  max ${Math.round(s.steepest * 100)}%`,
  );
  for (const note of notes) console.log(`    ${note}`);
  if (!notes.length) console.log('    ✓ on land, drivable, joined at both ends');
}

// Is it still one network, and is every place on it? Roads are joined where
// they pass within `JOIN` of each other, which is what the generator's junction
// splitting does with a tolerance.
const ids = saved.roads.map((r) => r.id);
const parent = new Map(ids.map((id) => [id, id]));
const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
const union = (a, b) => parent.set(find(a), find(b));
for (let i = 0; i < saved.roads.length; i++) {
  for (let j = i + 1; j < saved.roads.length; j++) {
    const a = saved.roads[i];
    const b = saved.roads[j];
    if (find(a.id) === find(b.id)) continue;
    const near = a.points.some((p) => nearestRoad(p, [b]).d <= JOIN);
    if (near) union(a.id, b.id);
  }
}
const parts = new Map();
for (const id of ids) {
  const root = find(id);
  parts.set(root, (parts.get(root) ?? 0) + 1);
}
const ranked = [...parts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nnetwork: ${ranked.length} piece${ranked.length === 1 ? '' : 's'}`);
if (ranked.length > 1) {
  console.log(`  largest holds ${ranked[0][1]} roads; the rest would be pruned:`);
  for (const [root, n] of ranked.slice(1)) {
    const members = ids.filter((id) => find(id) === root);
    console.log(`    ${n} road${n === 1 ? '' : 's'}: ${members.join(', ')}`);
  }
}

const main = ranked[0]?.[0];
console.log('\nplaces:');
for (const place of base.places) {
  const near = nearestRoad(place.at, saved.roads);
  const on = near.who && find(near.who) === main;
  console.log(
    `  ${place.name.padEnd(16)} nearest road ${near.who ?? '-'} at ${Math.round(near.d)} m  ` +
      `${on ? '✓ on the main network' : '✗ NOT on the main network'}`,
  );
}
console.log(`\n${problems === 0 ? 'no blocking problems' : `${problems} blocking problem${problems === 1 ? '' : 's'}`}`);
