// Play the whole game, at every level it has one.
//
// Not a gate and not a baseline: this drives every part of Kestrel Bay that
// comes in levels and writes down what happened, so a person can read a
// session instead of a table. Four driver tiers, six heat levels, six events,
// five ambushes.
//
// It goes through `driveRoute`, which is the only driver that applies the
// skill model - the reaction lag, the lapses and the wander live in its hands,
// and `patrol.mjs` and `endings.mjs` both drive the car directly and are
// therefore always the perfect driver however they are asked. That is the
// whole reason this exists rather than another flag on those.
//
// Usage:
//   npm run playtest                     # everything
//   npm run playtest -- --only drivers   # drivers | heat | events | ambushes
import { createServer } from 'vite';
import { driveRoute, DRIVERS } from './citydriver.mjs';

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const ONLY = flag('--only');
const want = (name) => !ONLY || ONLY === name;

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { RIVALS } = await server.ssrLoadModule('/src/game/rivals.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const M = K.UNITS_PER_METRE;
const pct = (n) => `${Math.round(n * 100)}%`;
const kmh = (units) => Math.round((units / K.REFERENCE_TOP_SPEED) * 320);

/**
 * Watch a world step by step and write down what a player would have noticed.
 *
 * Everything here is a *change*, not a state: "a roadblock went up" rather than
 * "there is a roadblock", because what a session reads like is the list of
 * things that happened in it.
 */
function watcher(world) {
  const seen = [];
  let prev = null;
  let peakHeat = 0;
  let stuckFor = 0;
  let stuckCount = 0;

  return {
    seen,
    get peakHeat() {
      return peakHeat;
    },
    get stuckCount() {
      return stuckCount;
    },
    step(t) {
      const police = world.police;
      const now = {
        wanted: police.state !== 'clear',
        reason: police.startedBy,
        heat: police.level,
        searching: police.state === 'cooldown',
        blocks: police.roadblocks.length,
        spikes: police.spikes.length,
        enforcers: police.cops.filter((c) => c.role === 'enforcer').length,
        chasers: police.pursuers,
        busted: world.busted,
        shredded: world.shredded > 0.1,
        damage: world.damage,
        takedowns: world.takedowns,
        broken: world.broken.size,
        smashed: world.collectibles.smashed.size,
        cars: world.finds.owned.size,
      };
      if (police.state !== 'clear') peakHeat = Math.max(peakHeat, now.heat);

      // The stuck clock, which is a player experience rather than a state: a
      // car that cannot move is the one failure #179 exists for.
      stuckFor = world.canRecover ? stuckFor + K.STEP : 0;
      if (stuckFor > 0 && stuckFor <= K.STEP * 1.5) stuckCount++;

      const say = (line) => seen.push({ t, line });
      if (prev) {
        if (now.wanted && !prev.wanted) say(`PURSUIT opens - ${now.reason ?? 'no reason given'}`);
        if (now.heat > prev.heat && now.wanted) say(`heat ${prev.heat} -> ${now.heat}`);
        if (now.blocks > prev.blocks) say('roadblock across the road ahead');
        if (now.spikes > prev.spikes) say('spike strip going down');
        if (now.enforcers > prev.enforcers) say('Enforcer coming head on');
        if (now.shredded && !prev.shredded) say('tyres shredded');
        if (now.takedowns > prev.takedowns) say(`takedown (${now.takedowns})`);
        if (now.broken > prev.broken) say('brought something down on them');
        if (now.smashed > prev.smashed) say(`billboard smashed (${now.smashed})`);
        if (now.cars > prev.cars) say('took possession of a parked car');
        if (now.searching && !prev.searching) say('contact broken - they are searching');
        if (!now.searching && prev.searching && now.wanted) say('found again');
        if (now.busted && !prev.busted) say(`BUSTED at heat ${now.heat}`);
        if (!now.wanted && prev.wanted && !now.busted) say('ESCAPED');
        if (Math.floor(now.damage * 4) > Math.floor(prev.damage * 4)) {
          say(`damage ${pct(now.damage)}`);
        }
      }
      prev = now;
    },
  };
}

const at = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function report(title, note, lines) {
  console.log(`\n${title}`);
  if (note) console.log(`  ${note}`);
  for (const { t, line } of lines) console.log(`    ${at(t)}  ${line}`);
  if (lines.length === 0) console.log('    (nothing happened)');
}

const city = new CityWorld(undefined, { traffic: false, police: false }).city;
const circuits = city.routes.filter((r) => r.kind === 'circuit');
const runs = [];

/* ------------------------------------------------------------------ */
/* Four drivers, police live.                                          */
/* ------------------------------------------------------------------ */
if (want('drivers')) {
  console.log('\n\n=== FOUR DRIVERS, POLICE LIVE ===');
  console.log('one lap of two circuits each, everything on, nothing scripted\n');

  for (const driver of DRIVERS) {
    for (const route of circuits.slice(0, 2)) {
      const world = new CityWorld();
      const eye = watcher(world);
      let elapsed = 0;
      const run = driveRoute(world, route, K, {
        seconds: 300,
        none: NONE,
        skill: driver.skill,
        seed: 7,
        hold: (w) => {
          eye.step(elapsed);
          elapsed += K.STEP;
          return {};
        },
      });
      runs.push({
        section: 'drivers',
        who: driver.name,
        route: route.name,
        lap: run.lap,
        time: run.elapsed,
        avg: run.average / K.REFERENCE_TOP_SPEED,
        crashes: run.crashes,
        damage: world.damage,
        rep: world.rep.total,
        peakHeat: eye.peakHeat,
        stuck: eye.stuckCount,
        busted: world.busted,
      });
      report(
        `${driver.name.toUpperCase()} on ${route.name}`,
        `lap ${pct(run.lap)} in ${run.elapsed.toFixed(0)}s, avg ${pct(run.average / K.REFERENCE_TOP_SPEED)} ` +
          `(${kmh(run.average)} km/h), ${run.crashes} impacts, damage ${pct(world.damage)}, ` +
          `Rep ${Math.round(world.rep.total)}`,
        eye.seen,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Six heat levels.                                                    */
/* ------------------------------------------------------------------ */
if (want('heat')) {
  console.log('\n\n=== SIX HEAT LEVELS ===');
  console.log('a pursuit opened at each, driven by an expert until it ends\n');

  for (let level = 1; level <= K.HEAT_LEVEL_COUNT; level++) {
    const world = new CityWorld();
    const route = circuits[0];
    // Placed on the line first, then lit up: `rammed` is the one provocation
    // that needs no witness, so it is the only way to start a pursuit at a
    // chosen moment (#177).
    world.x = route.points[0].x;
    world.z = route.points[0].z;
    world.y = 0;
    world.police.heat = Math.min(1, (level - 0.5) / K.HEAT_LEVEL_COUNT);
    world.police.rammed(world);

    const eye = watcher(world);
    let elapsed = 0;
    let ended = null;
    let laps = 0;
    while (!ended && laps < 4) {
      laps++;
      driveRoute(world, route, K, {
        seconds: 240,
        none: NONE,
        skill: 0.85,
        seed: 11,
        hold: (w) => {
          // Stop writing things down once it is over. `driveRoute` returns at
          // the end of a lap, so a pursuit that ends in the first corner would
          // otherwise be followed by two minutes of the driver crashing about
          // with nothing chasing it.
          if (!ended) eye.step(elapsed);
          elapsed += K.STEP;
          if (!ended && w.busted) ended = { how: 'busted', at: elapsed };
          if (!ended && w.police.state === 'clear' && elapsed > 1) {
            ended = { how: 'escaped', at: elapsed };
          }
          return {};
        },
      });
    }
    runs.push({
      section: 'heat',
      level,
      how: ended?.how ?? 'neither',
      at: ended?.at ?? elapsed,
      peakHeat: eye.peakHeat,
      damage: world.damage,
      rep: world.rep.total,
    });
    report(
      `HEAT ${level}`,
      ended
        ? `${ended.how} after ${ended.at.toFixed(0)}s, peak heat ${eye.peakHeat}, damage ${pct(world.damage)}, Rep ${Math.round(world.rep.total)}`
        : `still wanted after ${elapsed.toFixed(0)}s, peak heat ${eye.peakHeat}`,
      eye.seen,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Six events.                                                         */
/* ------------------------------------------------------------------ */
if (want('events')) {
  console.log('\n\n=== SIX EVENTS ===');
  console.log('every circuit and speed run, entered the way a player enters one\n');

  for (const route of city.routes) {
    const world = new CityWorld();
    // Enough Rep that every rival takes the call, so the event under test is
    // the event and not the gate in front of it (#91).
    world.rep.total = RIVALS[RIVALS.length - 1].rep + 1000;
    world.x = route.start.x;
    world.z = route.start.z;
    world.y = 0;
    world.step(K.STEP, { ...NONE, confirm: true });
    if (world.race.state !== 'countdown') {
      console.log(`\n${route.name.toUpperCase()}: would not start (state ${world.race.state})`);
      continue;
    }
    const rival = world.race.challenger;
    for (let t = 0; t < K.CITY_COUNTDOWN + 1 && world.race.state === 'countdown'; t += K.STEP) {
      world.step(K.STEP, NONE);
    }

    const eye = watcher(world);
    let elapsed = 0;
    let result = null;
    let laps = 0;
    while (!result && world.race.state !== 'idle' && laps < route.laps + 2) {
      laps++;
      driveRoute(world, route, K, {
        seconds: 300,
        none: NONE,
        skill: 0.85,
        seed: 13,
        hold: (w) => {
          if (!result) eye.step(elapsed);
          elapsed += K.STEP;
          if (!result && w.race.state === 'finished') {
            result = {
              won: w.race.won,
              position: w.race.position,
              average: w.race.average,
              target: w.race.targetAverage,
              took: elapsed,
            };
          }
          return { nitro: w.nitro > 0.35 && w.speed > w.maxSpeed * 0.5 };
        },
      });
    }
    runs.push({ section: 'events', route: route.name, kind: route.kind, ...(result ?? {}) });
    report(
      `${route.name.toUpperCase()} (${route.kind})`,
      result
        ? route.kind === 'speedrun'
          ? `${result.won ? 'WON' : 'LOST'} in ${result.took.toFixed(0)}s - held ${pct(result.average)}, needed ${pct(result.target)}`
          : `${result.won ? 'WON' : 'LOST'} in ${result.took.toFixed(0)}s - ${result.position}th against #${rival?.rank} ${rival?.name}`
        : `no result after ${elapsed.toFixed(0)}s`,
      eye.seen,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Five ambushes.                                                      */
/* ------------------------------------------------------------------ */
if (want('ambushes')) {
  console.log('\n\n=== FIVE AMBUSHES ===');
  console.log('parked on each trap and sprung, then driven out\n');

  for (const spot of city.ambushes) {
    const world = new CityWorld();
    world.x = spot.at.x;
    world.z = spot.at.z;
    world.y = 0;
    world.step(K.STEP, { ...NONE, confirm: true });
    if (world.ambush.state !== 'running') {
      console.log(`\nAMBUSH at heat ${spot.level}: would not spring`);
      continue;
    }

    const eye = watcher(world);
    let elapsed = 0;
    let out = null;
    let laps = 0;
    // Driven away from on the nearest circuit's line, which is the closest
    // thing to "get out of here" this driver can do.
    const route = circuits.reduce((best, r) =>
      Math.hypot(r.start.x - spot.at.x, r.start.z - spot.at.z) <
      Math.hypot(best.start.x - spot.at.x, best.start.z - spot.at.z)
        ? r
        : best,
    );
    while (!out && laps < 3) {
      laps++;
      driveRoute(world, route, K, {
        seconds: 180,
        none: NONE,
        skill: 0.85,
        seed: 17,
        hold: (w) => {
          if (!out) eye.step(elapsed);
          elapsed += K.STEP;
          if (!out && w.ambush.state !== 'running') out = { how: w.ambush.state, at: elapsed };
          return {};
        },
      });
    }
    runs.push({ section: 'ambushes', level: spot.level, how: out?.how ?? 'unresolved', at: out?.at });
    report(
      `AMBUSH at heat ${spot.level}`,
      out ? `${out.how} after ${out.at.toFixed(0)}s` : `unresolved after ${elapsed.toFixed(0)}s`,
      eye.seen,
    );
  }
}

/* ------------------------------------------------------------------ */
console.log('\n\n=== THE WHOLE SESSION ===\n');
const table = (rows, head, cells) => {
  if (rows.length === 0) return;
  const all = [head, ...rows.map(cells)];
  const w = head.map((_, i) => Math.max(...all.map((r) => String(r[i]).length)));
  for (const r of all) {
    console.log('  ' + r.map((c, i) => String(c).padEnd(w[i])).join('   '));
  }
  console.log('');
};

table(
  runs.filter((r) => r.section === 'drivers'),
  ['driver', 'route', 'lap', 'time', 'avg', 'impacts', 'damage', 'peak heat', 'stuck', 'Rep'],
  (r) => [
    r.who,
    r.route,
    pct(r.lap),
    `${r.time.toFixed(0)}s`,
    pct(r.avg),
    r.crashes,
    pct(r.damage),
    r.peakHeat || '-',
    r.stuck,
    Math.round(r.rep),
  ],
);
table(
  runs.filter((r) => r.section === 'heat'),
  ['heat', 'ended', 'after', 'peak', 'damage', 'Rep'],
  (r) => [r.level, r.how, `${r.at.toFixed(0)}s`, r.peakHeat, pct(r.damage), Math.round(r.rep)],
);
table(
  runs.filter((r) => r.section === 'events'),
  ['event', 'kind', 'took', 'result'],
  (r) => [
    r.route,
    r.kind,
    r.took ? `${r.took.toFixed(0)}s` : '-',
    r.won === undefined
      ? 'no result'
      : r.kind === 'speedrun'
        ? `${r.won ? 'won' : 'lost'} - held ${pct(r.average)} of ${pct(r.target)}`
        : `${r.won ? 'won' : 'lost'} - ${r.position}th`,
  ],
);
table(
  runs.filter((r) => r.section === 'ambushes'),
  ['ambush', 'ended', 'after'],
  (r) => [`heat ${r.level}`, r.how, r.at ? `${r.at.toFixed(0)}s` : '-'],
);

await server.close();
