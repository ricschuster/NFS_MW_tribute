// How far a reference driver gets round each of Kestrel Bay's routes.
//
// The city has never had a feel baseline, and this is the first half of one:
// before you can measure how the car feels in a city you need something that
// can drive round it, and before that you need a city it is possible to drive
// round. This measures the second thing.
//
// The driver gets round all six now, so the table is a baseline: the average
// speed column is how fast a competent driver can hold each route, and that
// is the number #14 needs to tune the car against.
//
// It was red for a while, and what it caught on the way is the argument for
// keeping it: two defects in the city (routes that doubled back on
// themselves, a perimeter road that stopped the car dead) and three in the
// driver, every one of them invisible to a test suite that was passing
// throughout. Set TRACE to a route's name to watch one drive.
//
// Note what the numbers are *not*: a fast lap. This driver follows the
// centreline at a margin under the grip limit and never uses nitrous, so
// treat the speeds as a floor a player should beat, not a target.
//
// Usage: npm run citylap
import { createServer } from 'vite';
import { driveRoute } from './citydriver.mjs';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const M = K.UNITS_PER_METRE;

const city = new CityWorld(undefined, { traffic: false, police: false }).city;

console.log('CITY LAP PROBE');
console.log(
  `a reference driver on each route, alone, no police · top speed ${K.REFERENCE_TOP_SPEED} units/s\n`,
);

const head = ['route', 'kind', 'lap', 'time', 'avg', 'crashes', 'worst off line'];
const rows = [head];

for (const route of city.routes) {
  const world = new CityWorld(undefined, { traffic: false, police: false });
  const run = driveRoute(world, route, K, { seconds: 300, none: NONE });
  rows.push([
    route.name,
    route.kind,
    `${Math.round(run.lap * 100)}%`,
    run.finished ? `${run.elapsed.toFixed(1)} s` : '-',
    `${Math.round((run.average / K.REFERENCE_TOP_SPEED) * 100)}%`,
    String(run.crashes),
    `${Math.round(run.offRoute / M)} m`,
  ]);
}

const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const row of rows) {
  console.log(
    '  ' + row.map((cell, i) => (i === 0 || i === 1 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('   '),
  );
}

const done = rows.slice(1).filter((r) => r[3] !== '-').length;
console.log(`\n${done} of ${city.routes.length} laps completed.`);

await server.close();
