// The same city, driven by four different people.
//
// `npm run citylap` measures the reference driver, which is a floor nobody
// stands on: it holds its lane exactly, looks the whole braking window ahead,
// and never stops paying attention. Tuning against it means tuning against a
// driver who does not exist.
//
// This runs the range - beginner, advanced, expert, perfect - so a change can
// be read as "what does this do to somebody who is not perfect". The gap
// between the bottom row and the top is the part of the game's difficulty that
// comes from the player rather than from the car.
//
// Traffic is on by default, because traffic is on in the real game every second
// of every session and it roughly halves the pace (#171).
//
// Everything is seeded: two runs of the same constants are identical, and a
// driver's mistakes land in the same places each time, so an excursion that
// repeats is a corner that driver cannot take rather than a coin that came up
// tails.
//
// A full run drives twenty-four laps of a populated city and takes on the order
// of ten minutes. Narrowing it is usually what you want: `--route` across all
// four drivers is under a minute and answers most questions.
//
// Usage:
//   npm run drivers                        # all four, traffic on
//   npm run drivers -- --empty             # empty roads too, for comparison
//   npm run drivers -- --driver beginner   # just one
//   npm run drivers -- --route "Old Quarter"
import { createServer } from 'vite';
import { driveRoute, DRIVERS, driverNamed } from './citydriver.mjs';

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const has = (name) => process.argv.includes(name);

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

const wantDriver = flag('--driver');
const drivers = wantDriver ? [driverNamed(wantDriver)].filter(Boolean) : DRIVERS;
if (drivers.length === 0) {
  console.error(`no driver called "${wantDriver}". Try: ${DRIVERS.map((d) => d.name).join(', ')}`);
  process.exit(1);
}
const wantRoute = flag('--route');
const routes = wantRoute
  ? city.routes.filter((r) => r.name.toLowerCase() === wantRoute.toLowerCase())
  : city.routes;
if (routes.length === 0) {
  console.error(`no route called "${wantRoute}". Try: ${city.routes.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
const conditions = has('--empty') ? [false, true] : [true];

console.log('DRIVERS');
console.log('the same routes, driven by four different people\n');

const head = ['route', 'traffic', 'driver', 'lap', 'time', 'avg', 'crashes', 'damage', 'worst off line'];
const rows = [head];
const totals = new Map(drivers.map((d) => [d.name, { avg: 0, crashes: 0, km: 0, damage: 0, done: 0 }]));

for (const route of routes) {
  for (const traffic of conditions) {
    for (const driver of drivers) {
      const world = new CityWorld(undefined, { traffic, police: false });
      let damage = 0;
      // Seeded off the route as well as the driver, so two routes are not the
      // same mistakes in the same order.
      const seed = (route.id + 1) * 7919 + Math.round(driver.skill * 1000);
      const run = driveRoute(world, route, K, {
        // Generous enough that a slow driver reads as slow rather than as cut
        // off: the reference driver's worst route is about 190 s in traffic and
        // a beginner takes roughly twice that. Past this it is a lap they
        // cannot drive, which is a different claim and reported as one.
        seconds: 420,
        none: NONE,
        skill: driver.skill,
        seed,
        hold: () => {
          damage = Math.max(damage, world.hurt);
          return {};
        },
      });
      const t = totals.get(driver.name);
      if (run.finished) t.done++;
      t.avg += run.average / K.REFERENCE_TOP_SPEED;
      t.crashes += run.crashes;
      // Normalised by ground actually covered. A raw count measures how long a
      // driver spent wedged against a building, not how often they hit one:
      // it made the expert look worse than the advanced driver purely because
      // it survived longer on the route neither could finish.
      t.km += (run.lap * route.length) / M / 1000;
      t.damage += damage;
      rows.push([
        driver === drivers[0] && traffic === conditions[0] ? route.name : '',
        driver === drivers[0] ? (traffic ? 'on' : 'off') : '',
        driver.name,
        `${Math.round(run.lap * 100)}%`,
        run.finished ? `${run.elapsed.toFixed(1)} s` : '-',
        `${Math.round((run.average / K.REFERENCE_TOP_SPEED) * 100)}%`,
        String(run.crashes),
        `${Math.round(damage * 100)}%`,
        `${Math.round(run.offRoute / M)} m`,
      ]);
    }
  }
}

const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const row of rows) {
  console.log(
    '  ' + row.map((cell, i) => (i <= 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('   '),
  );
}

const laps = routes.length * conditions.length;
console.log('\nOVER ALL ROUTES');
const sum = [['driver', 'finished', 'avg speed', 'crashes/km', 'damage', 'vs perfect']];
const perfect = totals.get('perfect');
for (const driver of drivers) {
  const t = totals.get(driver.name);
  const rel = perfect && perfect.avg > 0 ? `${Math.round((t.avg / perfect.avg) * 100)}%` : '-';
  sum.push([
    driver.name,
    `${t.done}/${laps}`,
    `${Math.round((t.avg / laps) * 100)}%`,
    (t.crashes / Math.max(0.001, t.km)).toFixed(1),
    `${Math.round((t.damage / laps) * 100)}%`,
    rel,
  ]);
}
const sw = sum[0].map((_, i) => Math.max(...sum.map((r) => r[i].length)));
for (const row of sum) {
  console.log('  ' + row.map((c, i) => (i === 0 ? c.padEnd(sw[i]) : c.padStart(sw[i]))).join('   '));
}
console.log('\n  "vs perfect" is average speed as a fraction of the reference driver\'s.');
console.log('  Nobody reaches it. The gap is the part of the difficulty that is the player.');
console.log('  Crashes are per kilometre of route covered, not per lap: a lap that was');
console.log('  never finished otherwise counts the time spent wedged against a wall.');

await server.close();
