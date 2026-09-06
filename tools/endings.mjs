// How does a pursuit end?
//
// #178 was filed on a number - 1 bust in 54 attempts, and at heat 6 half the
// attempts ending with the clock run out, still wanted - that came from a
// throwaway script nobody kept. This is that measurement, made repeatable,
// because "a pursuit reaches a terminal state in reasonable time" is the
// acceptance test for the issue and there was nothing that could report it.
//
// A pursuit has exactly three ways to finish: they catch you, you lose them,
// or neither happens and it simply carries on. The third is the one nobody
// designed, and it is the one worth counting.
//
// `--damage 1` runs the whole thing in a wrecked car, which is #170's question:
// the fractions in `HEAT_LEVELS` are written against an undamaged car, and a
// wrecked one is slower than the slowest unit in the game. Measured, it makes
// no consistent difference to whether you get away - because getting away is
// line of sight, not speed.
//
// Read the caveat before reading the numbers. The driver laps a circuit rather
// than running for the edge of the map, because that is the driver this repo
// has (#171). A lap of 2.5-4 km does break line of sight and does leave a
// search area behind - the escapes here are real - but a runner who kept going
// in one direction would shed a pursuit more easily than this does. Treat the
// escape rate as a floor and the stalemate rate as a ceiling.
//
// The busts are a floor too, in the other direction: the driver wedges itself
// on traffic and three-point-turns out, and since #178 a stopped car with a
// unit on it is busted in three and a half seconds. A player has #179's reset
// for exactly that; this driver never presses it.
//
// Usage:
//   npm run endings                    # 8 pursuits at each of heat 1, 3 and 6
//   npm run endings -- --runs 4        # quicker
//   npm run endings -- --minutes 2     # how long a pursuit gets to end
import { createServer } from 'vite';
import { routeDriver, carAheadLimit } from './citydriver.mjs';

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

const RUNS = Number(flag('--runs') ?? 8);
const LIMIT = Number(flag('--minutes') ?? 3) * 60;
const LEVELS = (flag('--levels') ?? '1,3,6').split(',').map(Number);
/** Seconds before the driver in the second table gives up and stops. */
const STOP_AFTER = 15;
/**
 * How beaten up the car is, held there (#170).
 *
 * `npm run endings -- --damage 1` runs the whole thing in a wrecked car. It is
 * held rather than set, because the driver will go through a repair shop given
 * the chance and the question is what a wrecked car can do.
 */
const DAMAGE = Number(flag('--damage') ?? 0);

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };

/**
 * One pursuit, from opening it to whatever ends it.
 *
 * The pursuit is opened with `rammed`, which is the one provocation that needs
 * no witness (#177) and therefore the only one that can be relied on to start
 * a pursuit at a chosen moment. Heat is set once, at the start, and then left
 * alone: forcing it every step - which is what the pursuit tests do - would
 * be measuring a pursuit that cannot cool, and cooling is half of how one
 * ends.
 */
function pursuit(route, level, seed, stopAfter = Infinity) {
  const world = new CityWorld();
  const driver = routeDriver(route, K, { seed });
  const start = driver.at(0);
  const facing = driver.at(400);
  world.x = start.x;
  world.z = start.z;
  world.y = 0;
  world.heading = Math.atan2(facing.x - start.x, facing.z - start.z);

  // Just inside the level, so `level` reads back as the one asked for.
  world.police.heat = Math.min(1, (level - 0.5) / K.HEAT_LEVEL_COUNT);
  world.damage = DAMAGE;
  world.police.rammed(world);

  let along = 0;
  let covered = 0;
  let lastCovered = 0;
  let still = 0;
  let stuck = 0;
  let escapeTurn = 0;
  let moved = false;
  let searches = 0;
  let searching = false;

  for (let t = 0; t < LIMIT; t += K.STEP) {
    // The steering, the stuck escape and the target speed are all lifted from
    // `patrol.mjs`, which lifted them from `citydriver`'s own loop. Duplicated
    // rather than shared because these are instruments: one that quietly
    // changed when another was tuned would be worse than two that repeat
    // themselves.
    const found = driver.progress(world.x, world.z, along);
    let step = found.along - along;
    if (step < -driver.length / 2) step += driver.length;
    if (step > 0 && step < driver.length / 4) covered += step;
    along = found.along;
    if (covered > 3000) moved = true;
    if (covered > lastCovered + 400) {
      lastCovered = covered;
      still = 0;
    } else {
      still += K.STEP;
    }
    stuck = moved && still > 1.5 ? stuck + K.STEP : 0;

    let error = driver.steer(found, world.speed) - world.heading;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;

    // The second table: a car that stops. Not a driver model - the skill model
    // lives in `driveRoute`'s hands and this loop does not go through them, so
    // asking for a worse driver here changes nothing - but the state every
    // way of driving badly ends in. A roadblock, a spike strip, an Enforcer
    // and a wall all do the same thing to you: they stop you moving.
    if (t > stopAfter) {
      world.step(K.STEP, NONE);
    } else if (stuck > 0.4) {
      if (escapeTurn === 0) escapeTurn = error > 0 ? -1 : 1;
      const backing = stuck < 1.6;
      const turn = backing ? escapeTurn : -escapeTurn;
      world.step(K.STEP, { ...NONE, down: backing, up: !backing, left: turn > 0, right: turn < 0 });
      if (stuck > 2.4) {
        stuck = 0;
        still = 0;
        escapeTurn = 0;
      }
    } else {
      escapeTurn = 0;
      const target = Math.min(
        driver.target(along, world.speed, world.maxSpeed),
        carAheadLimit(world, K),
      );
      world.step(K.STEP, {
        ...NONE,
        left: error > 0.02,
        right: error < -0.02,
        up: world.speed < target * 0.98,
        down: world.speed > target * 1.08,
        nitro: world.nitro > 0.4 && Math.abs(error) < 0.05,
      });
    }

    world.damage = Math.max(world.damage, DAMAGE);
    const now = world.police.state === 'cooldown';
    if (now && !searching) searches++;
    searching = now;

    if (world.busted) return { how: 'busted', at: t, level: world.police.level, searches };
    if (world.police.state === 'clear') {
      return { how: 'escaped', at: t, level: world.police.level, searches };
    }
  }

  return { how: 'neither', at: LIMIT, level: world.police.level, searches };
}

const world = new CityWorld(undefined, { traffic: false, police: false });
const routes = world.city.routes;

console.log(
  `HOW A PURSUIT ENDS - ${RUNS} runs at each level, ${LIMIT / 60} minutes each` +
    (DAMAGE > 0 ? `, in a car at ${Math.round(DAMAGE * 100)}% damage` : '') +
    '\n',
);

const row = (cells) => console.log('  ' + cells.map(([v, w]) => String(v).padEnd(w)).join(''));

function table(title, note, stopAfter) {
  console.log(title);
  console.log(`  ${note}\n`);
  row([
    ['heat', 8],
    ['busted', 10],
    ['escaped', 10],
    ['neither', 10],
    ['median end', 14],
    ['searches/run', 14],
  ]);

  for (const level of LEVELS) {
    const results = [];
    for (let i = 0; i < RUNS; i++) {
      results.push(pursuit(routes[i % routes.length], level, i + 1, stopAfter));
    }

    const count = (how) => results.filter((r) => r.how === how).length;
    const ended = results.filter((r) => r.how !== 'neither').map((r) => r.at).sort((a, b) => a - b);
    const median = ended.length === 0 ? null : ended[Math.floor(ended.length / 2)];
    const searches = results.reduce((n, r) => n + r.searches, 0) / results.length;

    const pct = (n) => `${n} (${Math.round((n / RUNS) * 100)}%)`;
    row([
      [level, 8],
      [pct(count('busted')), 10],
      [pct(count('escaped')), 10],
      [pct(count('neither')), 10],
      [median === null ? '-' : `${median.toFixed(0)} s`, 14],
      [searches.toFixed(1), 14],
    ]);
  }
  console.log('');
}

table('IF YOU KEEP DRIVING', 'a lap is not a run, so the escapes are a floor', Infinity);
table(
  'IF YOU STOP',
  `driving for ${STOP_AFTER}s and then not moving: what a roadblock leaves you in`,
  STOP_AFTER,
);

console.log('  neither = still wanted when the clock ran out: nobody designed that one');

await server.close();
