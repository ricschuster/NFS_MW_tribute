// What is nitrous actually worth on a city circuit, and where does it go?
//
// #204: `npm run citylap`'s ladder table measures a boosted lap of Harbour Loop
// at 25% of top speed against 30% clean. A boost that costs a sixth of the pace
// is worse than no boost, and it is the exact regression #105 was filed to fix
// - so the question this answers is not "is it slower" (it is) but *where the
// time goes*, which a lap time cannot say.
//
// The lap time is one number at the end of two minutes. This prints the inside
// of those two minutes: how much of the lap the driver even wants throttle, how
// much of the charge is spent while it does not, and what the boost does to the
// two things that end a fast lap in a city - overshooting the speed a corner
// allows, and hitting something.
//
// It runs several boost policies over the same route and seed so the rows
// compare. The policies matter as much as the numbers: the two #204 has already
// measured both decide when to press from the *heading*, and neither of them
// asks the one question #105's taper is built around - am I accelerating out of
// something? `hold` gets the driver's intent now, so this one can.
//
// Usage:
//   npm run nitro                      # every policy on the proving circuit
//   npm run nitro -- --route 'Old Quarter'
//   npm run nitro -- --skill expert    # or a number; default is the whole set
//   npm run nitro -- --traffic off     # empty road: is it the bends or the cars?
//   npm run nitro -- --race            # what the ladder table actually measures
import { createServer } from 'vite';
import { driveRoute, DRIVERS, driverNamed } from './citydriver.mjs';

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

const city = new CityWorld(undefined, { traffic: false, police: false }).city;

const wanted = flag('--route');
const route = wanted
  ? city.routes.find((r) => r.name.toLowerCase() === wanted.toLowerCase())
  : city.routes.find((r) => r.kind === 'circuit');
if (!route) throw new Error(`no route named "${wanted}"`);

// The decisive comparison. If the boost is a loss on an empty road too, the
// corners are eating it; if it only loses in traffic, the overspeed is going
// into the back of a car rather than into a bend.
const roadArg = flag('--traffic');
const roads = roadArg === 'on' ? [true] : roadArg === 'off' ? [false] : [true, false];

// A race is `ROUTE_LAPS` of these, and `driveRoute` returns at the end of one -
// so `citylap` calls it again, which teleports the car back to the line and
// sets its speed to zero while damage, charge and the clock carry over. Whether
// the boost's cost compounds over a race or is a single lap's story is the
// difference between a tuning problem and a harness one.
const laps = Number(flag('--laps') ?? 1);

const skillArg = flag('--skill');
const tiers = skillArg
  ? [driverNamed(skillArg) ?? { name: skillArg, skill: Number(skillArg) }]
  : DRIVERS.filter((d) => d.name === 'expert' || d.name === 'perfect');

/**
 * The ways a driver could decide to press it.
 *
 * `clean` is the control. `citylap` and `anywhere` are the two #204 has already
 * measured and reports as ruled out - they are here so the rows compare rather
 * than being quoted from the issue. The last two are the ones nothing has run:
 * both ask the driver whether it wants throttle, which is what "the way out of
 * a corner" means from inside the car.
 *
 * Every one of them is subject to the same charge: `NITRO_DRAIN` is 0.5 a
 * second against `NITRO_RECHARGE` 0.16, so about a fifth of any lap can be
 * boosted whatever the policy. What differs is *which* fifth.
 */
const POLICIES = [
  { name: 'clean', press: () => false },
  {
    name: 'citylap',
    note: 'straight for half a second, and already quick',
    press: (w, _i, _t, s) => w.nitro > 0.4 && s.turned < 0.004 && w.speed > w.maxSpeed * 0.35,
  },
  {
    name: 'anywhere',
    note: 'whenever there is charge',
    press: (w) => w.nitro > 0.4,
  },
  {
    name: 'on throttle',
    note: 'only while the driver is asking for throttle',
    press: (w, intent) => Boolean(intent?.up) && w.nitro > 0.4,
  },
  {
    name: 'corner exit',
    note: 'on throttle, and below half the top speed',
    press: (w, intent) => Boolean(intent?.up) && w.speed < w.maxSpeed * 0.5 && w.nitro > 0.25,
  },
  {
    name: 'somewhere to use it',
    note: 'on throttle, and the road ahead allows real speed',
    press: (w, intent, target) =>
      Boolean(intent?.up) && target !== null && target > w.maxSpeed * 0.6 && w.nitro > 0.4,
  },
];

/** The smaller of the two ways round from one heading to another. */
function angleTo(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function lap(policy, skill, traffic) {
  const world = new CityWorld(undefined, { traffic, police: false });
  const s = { turned: 0, was: world.heading };
  let steps = 0;
  let onThrottle = 0;
  let boosted = 0;
  let wasted = 0;
  let over = 0;
  let damage = 0;
  let paceSum = 0;

  const hold = (w, intent, target) => {
    damage = Math.max(damage, w.hurt);
    // The unwedging path passes null: a three-point turn is the probe rescuing
    // itself, and counting it as driving would put the boost's usefulness in
    // the hands of how often the car got stuck.
    if (!intent) return {};
    steps++;
    paceSum += Math.abs(w.speed) / w.maxSpeed;
    if (intent.up) onThrottle++;
    // Above the speed the corner ahead allows, which is the driver braking
    // for something it was carrying too much speed into. This is the number
    // the "overspeed is scrubbed off in the next bend" claim lives or dies by.
    if (target !== null && Math.abs(w.speed) > target * 1.08) over++;

    s.turned = s.turned * 0.94 + Math.abs(angleTo(w.heading, s.was)) * 0.06;
    s.was = w.heading;

    const want = policy.press(w, intent, target, s);
    if (want) {
      boosted++;
      if (!intent.up) wasted++;
    }
    return { nitro: want };
  };

  let elapsed = 0;
  let units = 0;
  let crashes = 0;
  let finished = true;
  let run = null;
  for (let i = 0; i < laps; i++) {
    run = driveRoute(world, route, K, { seconds: 300, none: NONE, hold, skill });
    elapsed += run.elapsed;
    // What the lap actually covered. `average` is over that lap's own clock, so
    // this is the only way to add two laps up without knowing the route length.
    units += run.average * run.elapsed;
    crashes += run.crashes;
    finished = finished && run.finished;
  }

  return {
    ...run,
    finished,
    elapsed,
    crashes,
    avg: units / elapsed / K.REFERENCE_TOP_SPEED,
    damage,
    pace: paceSum / Math.max(1, steps),
    onThrottle: onThrottle / Math.max(1, steps),
    boosted: boosted / Math.max(1, steps),
    // Of the charge actually spent, how much went in while the driver was not
    // asking to go faster. Boosting into a brake is the shape of the bug.
    wasted: boosted === 0 ? 0 : wasted / boosted,
    over: over / Math.max(1, steps),
  };
}

/**
 * What the ladder table measures, as opposed to what a lap measures.
 *
 * `citylap` reports `held` as `race.playerDist / elapsed`, and `playerDist` is
 * *gates passed*, not ground covered: `advancePlayer` only counts a checkpoint
 * when the car comes within `CHECKPOINT_RANGE` of it. So a lap driven wide
 * scores nothing for the gate it missed and keeps paying the clock, and the two
 * numbers come apart. This prints them side by side.
 */
async function raceLap(policy, skill) {
  const { RIVALS } = await server.ssrLoadModule('/src/game/rivals.ts');
  const rival = RIVALS[RIVALS.length - 1];
  const world = new CityWorld(undefined, { traffic: true, police: false });
  world.beaten = RIVALS.length - 1;
  world.rep.total = Math.max(world.rep.total, rival.rep);
  world.x = route.start.x;
  world.z = route.start.z;
  world.y = 0;
  world.step(K.STEP, { ...NONE, confirm: true });
  if (world.race.state !== 'countdown') throw new Error(`race did not start (${world.race.state})`);
  for (let t = 0; t < K.CITY_COUNTDOWN + 1 && world.race.state === 'countdown'; t += K.STEP) {
    world.step(K.STEP, NONE);
  }

  const s = { turned: 0, was: world.heading };
  let ground = 0;
  let missed = 0;
  let seen = -1;
  const hold = (w, intent, target) => {
    if (!intent) return {};
    // A gate that goes by without the counter moving. Counted on the *lap*
    // rolling over rather than per step: the checkpoint index resets to 0.
    if (seen >= 0 && w.race.checkpoint !== seen && w.race.checkpoint !== (seen + 1) % 99) missed++;
    seen = w.race.checkpoint;
    s.turned = s.turned * 0.94 + Math.abs(angleTo(w.heading, s.was)) * 0.06;
    s.was = w.heading;
    return { nitro: policy.press(w, intent, target, s) };
  };

  let laps = 0;
  while (world.race.state !== 'idle' && world.race.state !== 'finished' && laps < K.ROUTE_LAPS + 2) {
    laps++;
    const run = driveRoute(world, route, K, { seconds: 300, none: NONE, hold, skill });
    ground += run.average * run.elapsed;
  }
  const el = world.race.elapsed;
  return {
    held: el > 0 ? world.race.playerDist / (el * world.maxSpeed) : 0,
    real: el > 0 ? ground / el / K.REFERENCE_TOP_SPEED : 0,
    playerDist: world.race.playerDist,
    ground,
    elapsed: el,
    missed,
  };
}

if (process.argv.includes('--race')) {
  console.log('WHAT THE LADDER TABLE MEASURES');
  console.log(`  "${route.name}" against the bottom rival, in traffic\n`);
  const rows = [['driver', 'policy', 'elapsed', 'held (scored)', 'held (ground)', 'gates skipped']];
  for (const tier of tiers) {
    for (const policy of POLICIES.filter((p) => p.name === 'clean' || p.name === 'citylap')) {
      const r = await raceLap(policy, tier.skill);
      rows.push([
        policy.name === 'clean' ? tier.name : '',
        policy.name,
        `${r.elapsed.toFixed(1)} s`,
        `${Math.round(r.held * 100)}%`,
        `${Math.round(r.real * 100)}%`,
        String(r.missed),
      ]);
    }
  }
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const row of rows) {
    console.log('  ' + row.map((c, i) => (i <= 1 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('   '));
  }
  console.log(
    '\n  "scored" is what the ladder reports; "ground" is distance actually covered over the\n' +
      '  same clock. Where they disagree, the table is measuring gates rather than pace.\n',
  );
  await server.close();
  process.exit(0);
}

console.log('NITROUS PROBE (#204)');
console.log(`  "${route.name}", ${route.kind} · top speed ${K.REFERENCE_TOP_SPEED} units/s`);
console.log(
  `  charge allows about ${Math.round(
    (K.NITRO_RECHARGE / (K.NITRO_DRAIN + K.NITRO_RECHARGE)) * 100,
  )}% of a lap on the boost, whatever the policy\n`,
);

const head = [
  'driver',
  'policy',
  'time',
  'avg',
  'vs clean',
  'on throttle',
  'boosting',
  'of that, off throttle',
  'over the limit',
  'crashes',
  'damage',
];

for (const tier of tiers) {
  for (const traffic of roads) {
    const rows = [head];
    let control = null;
    for (const policy of POLICIES) {
      const r = lap(policy, tier.skill, traffic);
      if (policy.name === 'clean') control = r;
      rows.push([
        policy.name === 'clean' ? `${tier.name}, ${traffic ? 'traffic' : 'empty'}` : '',
        policy.name,
        r.finished ? `${r.elapsed.toFixed(1)} s` : '-',
        `${Math.round(r.avg * 100)}%`,
        control && policy.name !== 'clean'
          ? `${r.avg >= control.avg ? '+' : ''}${Math.round((r.avg - control.avg) * 100)} pts`
          : '-',
        `${Math.round(r.onThrottle * 100)}%`,
        `${Math.round(r.boosted * 100)}%`,
        `${Math.round(r.wasted * 100)}%`,
        `${Math.round(r.over * 100)}%`,
        String(r.crashes),
        `${Math.round(r.damage * 100)}%`,
      ]);
      if (policy.note) rows.push(['', `  ${policy.note}`, '', '', '', '', '', '', '', '', '']);
    }

    const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
    console.log('');
    for (const row of rows) {
      console.log(
        '  ' +
          row
            .map((cell, i) => (i <= 1 ? cell.padEnd(widths[i]) : cell.padStart(widths[i])))
            .join('   '),
      );
    }
  }
}

console.log(
  '\n  "on throttle" is the fraction of the lap the driver wants to go faster, and it is\n' +
    '  the ceiling on what any acceleration boost can be worth: a lap spent at the speed\n' +
    '  the corners allow has nowhere to put a bigger engine.\n',
);

await server.close();
