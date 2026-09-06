// How far a reference driver gets round each of Kestrel Bay's routes.
//
// This is the city's feel baseline, and since the track retired with its own
// probe (#165) it is the only one: before you can measure how the car feels in
// a city you need something that can drive round it, and before that you need
// a city it is possible to drive round. This measures the second thing.
//
// Every route runs twice, empty and with traffic (#171). The empty lap says
// what the road allows; the traffic lap says what the drive is actually like,
// and it is the one that resembles playing the game. Traffic roughly halves the
// pace a good driver can hold, which is worth knowing before tuning anything
// against the empty number alone.
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
// Usage:
//   npm run citylap                                  # table, vs. the baseline
//   npm run citylap -- --out docs/city-baseline.json # re-record it
//   TRACE='Old Quarter' npm run citylap              # watch one drive
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { driveRoute } from './citydriver.mjs';

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const M = K.UNITS_PER_METRE;
/** Rounded on the way in, so a saved baseline diffs on real changes only. */
const round = (n) => Math.round(n * 10000) / 10000;

const city = new CityWorld(undefined, { traffic: false, police: false }).city;

console.log('CITY LAP PROBE');
console.log(
  `a reference driver on each route, no police · top speed ${K.REFERENCE_TOP_SPEED} units/s`,
);
console.log('each route twice: what the empty road allows, and what traffic makes of it\n');

const head = ['route', 'kind', 'traffic', 'lap', 'time', 'avg', 'crashes', 'damage', 'worst off line'];
const rows = [head];
const metrics = {};

for (const route of city.routes) {
  // Twice: an empty city says what the *road* allows, and a populated one says
  // what the drive is actually like. Traffic is on in the real game every
  // second of every session, and until #171 nothing had ever driven with it.
  for (const traffic of [false, true]) {
    const world = new CityWorld(undefined, { traffic, police: false });
    let damage = 0;
    const run = driveRoute(world, route, K, {
      seconds: 300,
      none: NONE,
      hold: () => {
        damage = Math.max(damage, world.hurt);
        return {};
      },
    });
    // Keyed by name rather than index so a re-seeded city diffs as routes
    // appearing and disappearing instead of as every number having moved.
    const key = route.name.toLowerCase().replace(/[^a-z]+/g, '_') + (traffic ? '_traffic' : '');
    metrics[`${key}_lap`] = round(run.lap);
    metrics[`${key}_time_s`] = run.finished ? round(run.elapsed) : null;
    metrics[`${key}_avg`] = round(run.average / K.REFERENCE_TOP_SPEED);
    metrics[`${key}_crashes`] = run.crashes;
    metrics[`${key}_damage`] = round(damage);
    rows.push([
      traffic ? '' : route.name,
      traffic ? '' : route.kind,
      traffic ? 'on' : 'off',
      `${Math.round(run.lap * 100)}%`,
      run.finished ? `${run.elapsed.toFixed(1)} s` : '-',
      `${Math.round((run.average / K.REFERENCE_TOP_SPEED) * 100)}%`,
      String(run.crashes),
      `${Math.round(damage * 100)}%`,
      `${Math.round(run.offRoute / M)} m`,
    ]);
  }
}

const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const row of rows) {
  console.log(
    '  ' + row.map((cell, i) => (i <= 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('   '),
  );
}

const done = rows.slice(1).filter((r) => r[4] !== '-').length;
console.log(`\n${done} of ${city.routes.length * 2} laps completed.`);

// A number here moving is the only warning you get that a change to
// `constants.ts` made the city harder to drive, and since the track sim's
// probe retired with the track (#165) it is the only driving baseline left.
// Re-record it in the PR that moves a constant.
const baselinePath = flag('--baseline') ?? 'docs/city-baseline.json';
let baseline = null;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  baseline = null;
}
if (baseline) {
  const changed = Object.keys(metrics).filter((k) => baseline[k] !== metrics[k]);
  console.log(`\nCHANGED VS. ${baselinePath}`);
  if (changed.length === 0) console.log('  nothing moved');
  for (const k of changed) {
    console.log(`  ${k.padEnd(28)} ${String(baseline[k])} -> ${String(metrics[k])}`);
  }
} else {
  console.log(`\nno baseline at ${baselinePath}`);
}

const outPath = flag('--out');
if (outPath) {
  writeFileSync(outPath, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`\nwrote ${outPath}`);
}

await server.close();
