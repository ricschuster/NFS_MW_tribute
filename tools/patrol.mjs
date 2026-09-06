// What does the game do to you over twenty minutes?
//
// `npm run citylap` asks how fast a route can be driven, alone, on an empty
// map. This asks the other question: put a competent driver in the city with
// the police live and let it run, then read what came out. Heat escalation,
// when the helicopter arrives, how many roadblocks and spikes, how much damage,
// how much Rep, and whether any of it ever ends.
//
// It found three issues on its first run - #170, #171 and the shape of the Rep
// curve - none of which any test was going to catch, which is the argument for
// it existing. It asserts nothing: it is an instrument, not a gate.
//
// **Read two of these numbers with care.** The driver comes from
// `citydriver.mjs`, and it has two limits that matter here:
//
//   - It laps one route, so it never drives *away*. Breaking line of sight is
//     how an escape actually happens, and a car going round a 3 km loop cannot
//     do it. Escapes are understated and time-wanted is overstated, which is
//     the one caveat that still stands after #171.
//
// It holds a lane and brakes for the car in front, which #171 gave it, so the
// damage and pace figures are a driver's rather than a crash test's. They are
// still a floor: it never takes a racing line and only uses nitrous on a
// straight.
//
// Everything else - when heat rises, what turns up, what they throw at you, and
// what it all pays - is what the game does regardless of who is steering.
//
// Usage:
//   npm run patrol                        # twenty minutes on the first route
//   npm run patrol -- --minutes 5         # a shorter look
//   npm run patrol -- --route "Old Quarter"
//   npm run patrol -- --quiet             # summary only, no event log
import { createServer } from 'vite';
import { routeDriver, carAheadLimit } from './citydriver.mjs';

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const has = (name) => process.argv.includes(name);

const MINUTES = Number(flag('--minutes') ?? 20);
const QUIET = has('--quiet');

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const M = K.UNITS_PER_METRE;

const world = new CityWorld();
const wanted = flag('--route');
const route = wanted
  ? world.city.routes.find((r) => r.name.toLowerCase() === wanted.toLowerCase())
  : world.city.routes[0];
if (!route) {
  console.error(`no route called "${wanted}". Try: ${world.city.routes.map((r) => r.name).join(', ')}`);
  process.exit(1);
}

const driver = routeDriver(route, K);
const start = driver.at(0);
const facing = driver.at(400);
world.x = start.x;
world.z = start.z;
world.y = 0;
world.heading = Math.atan2(facing.x - start.x, facing.z - start.z);

const log = [];
const at = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const say = (t, line) => log.push(`  ${at(t)}  ${line}`);

let along = 0;
let covered = 0;
let lastCovered = 0;
let still = 0;
let stuck = 0;
let escapeTurn = 0;
let moved = false;

let prev = null;
let peakHeat = 0;
let busts = 0;
let escapes = 0;
let searches = 0;
let roadblocks = 0;
let spiked = 0;
let timeWanted = 0;
let timeSeen = 0;
let timeHeli = 0;
let speedSum = 0;
let samples = 0;

for (let t = 0; t < MINUTES * 60; t += K.STEP) {
  // Steering, lifted from citydriver's own loop: follow the line, and when
  // wedged, latch a direction and three-point out of it rather than deciding
  // afresh every frame.
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

  if (stuck > 0.4) {
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
      // Unlike the lap probe, this one uses the boost: it is modelling a
      // player under pressure, not measuring a clean lap.
      nitro: world.nitro > 0.4 && Math.abs(error) < 0.05,
    });
  }

  const police = world.police;
  const now = {
    heat: world.level,
    cops: police.cops.length,
    busted: world.busted,
    seen: police.seenNow,
    wanted: police.state !== 'clear',
    searching: police.state === 'cooldown',
    blocks: police.roadblocks.length,
    heli: !!police.helicopter,
    shredded: world.shredded,
    hurt: world.hurt,
  };

  peakHeat = Math.max(peakHeat, now.heat);
  if (now.wanted) timeWanted += K.STEP;
  if (now.seen) timeSeen += K.STEP;
  if (now.heli) timeHeli += K.STEP;
  speedSum += world.speed;
  samples++;

  if (prev) {
    if (now.heat > prev.heat) say(t, `heat ${prev.heat} -> ${now.heat}`);
    if (now.heat < prev.heat && !now.busted) say(t, `heat falling to ${now.heat}`);
    if (now.blocks > prev.blocks) {
      roadblocks++;
      say(t, 'roadblock across the road ahead');
    }
    if (now.heli && !prev.heli) say(t, 'helicopter up');
    if (!now.heli && prev.heli) say(t, 'helicopter gone');
    if (now.searching && !prev.searching) {
      searches++;
      say(t, `contact broken - searching for ${Math.round(police.searchLeft)}s`);
    }
    if (!now.searching && prev.searching && now.wanted) say(t, 'found again');
    if (now.shredded > 0.1 && prev.shredded <= 0.1) {
      spiked++;
      say(t, 'spike strip - tyres gone');
    }
    if (now.busted && !prev.busted) {
      busts++;
      say(t, `BUSTED at heat ${now.heat}`);
    }
    if (!now.wanted && prev.wanted && !now.busted) {
      escapes++;
      say(t, 'ESCAPED');
    }
    if (Math.floor(now.hurt * 4) > Math.floor(prev.hurt * 4)) say(t, `damage ${Math.round(now.hurt * 100)}%`);
  }
  prev = now;
}

console.log(`PATROL - ${MINUTES} minutes in Kestrel Bay, police live, lapping "${route.name}"\n`);
if (!QUIET) {
  console.log(log.join('\n'));
  console.log('');
}

const row = (label, value, note = '') => console.log(`  ${label.padEnd(20)} ${String(value).padStart(10)}   ${note}`);
console.log('WHAT HAPPENED');
row('peak heat', `${peakHeat} of ${K.HEAT_LEVEL_COUNT}`);
row('wanted', `${(timeWanted / 60).toFixed(1)} min`, `of ${MINUTES}`);
row('in their sights', `${(timeSeen / 60).toFixed(1)} min`);
row('helicopter up', `${(timeHeli / 60).toFixed(1)} min`);
row('roadblocks', roadblocks);
row('spike strips hit', spiked);
row('searches started', searches, 'understated: this driver laps, it never runs');
row('escapes', escapes, 'same caveat');
row('busts', busts);
row('damage at the end', `${Math.round(world.hurt * 100)}%`);
row('average speed', `${Math.round((speedSum / samples / K.REFERENCE_TOP_SPEED) * 100)}%`, 'a floor: no racing line');
console.log('');
console.log('WHAT IT PAID');
row('Rep earned', Math.round(world.rep.total));
row('the whole ladder', 65000, 'what rank one asks for');
row('billboards', `${world.collectibles.smashed.size}/90`);
row('speed cameras', `${world.collectibles.clocked.size}/25`);

await server.close();
