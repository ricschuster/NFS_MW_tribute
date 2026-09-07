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
import { driveRoute, driverNamed } from './citydriver.mjs';

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

// ---------------------------------------------------------------------------
// The ladder (#166).
//
// `npm run feel` raced a reference driver against all ten rivals and reported
// which it beat clean and which needed the boost; that is where
// `RIVAL_DIFF_SPEED_FRAC` came from and how #105 was known to have worked
// rather than believed to have. The probe drove `World`, so it retired with
// the track (#165), and since then a change to the car could move the whole
// ladder without anything going red.
//
// Every rival is raced twice on the same circuit, so the ten rows compare with
// each other: once with the boost never pressed, and once with it used the way
// a player would - on the straights, where #105 made it worth pressing.
// ---------------------------------------------------------------------------

const { RIVALS } = await server.ssrLoadModule('/src/game/rivals.ts');

/**
 * Who drives the ladder.
 *
 * An expert, because this file's own rule is that a change is judged against a
 * driver somebody could be rather than against the control. It said "expert" in
 * its header from #192 and passed no `skill` at all, so it has been racing the
 * perfect driver ever since - and `RIVAL_BASE_SPEED_FRAC` was calibrated
 * against that. `--driver perfect` gets the old rows back for comparison.
 */
const ladderDriver = driverNamed(flag('--driver') ?? 'expert');
if (!ladderDriver) throw new Error(`no driver named "${flag('--driver')}"`);

/** The smaller of the two ways round from one heading to another. */
function angleTo(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The circuit every rival is raced on. One route, so the rows compare. */
const proving = city.routes.find((r) => r.kind === 'circuit');

/**
 * Race one rival, and hand back what happened.
 *
 * The race is started through the game's own door - park on the line and press
 * confirm - rather than by reaching into `CityRace`, because #91 gates a start
 * on Rep and the last probe to do this did not pay: every race after the first
 * silently never started and the table read as ten losses. It throws rather
 * than reporting a loss if the start does not take.
 */
function race(rival, index, boost) {
  // With traffic, because that is what a race is: nothing turns it off, and
  // the empty-road number describes a game nobody plays (#171).
  const world = new CityWorld(undefined, { traffic: true, police: false });
  // Standing at the front of the ladder with the Rep to be taken seriously.
  world.beaten = index;
  world.rep.total = Math.max(world.rep.total, rival.rep);
  world.x = proving.start.x;
  world.z = proving.start.z;
  world.y = 0;

  world.step(K.STEP, { ...NONE, confirm: true });
  if (world.race.state !== 'countdown') {
    throw new Error(
      `#${rival.rank} ${rival.name}: the race did not start (state ${world.race.state}, ` +
        `rep ${world.rep.total}, needs ${rival.rep}). A probe that reports this as a loss is lying.`,
    );
  }
  if (world.race.challenger?.rank !== rival.rank) {
    throw new Error(`#${rival.rank} ${rival.name}: raced #${world.race.challenger?.rank} instead`);
  }

  for (let t = 0; t < K.CITY_COUNTDOWN + 1 && world.race.state === 'countdown'; t += K.STEP) {
    world.step(K.STEP, NONE);
  }

  // Read at the flag, not afterwards. A finished race holds its result for a
  // couple of seconds and then puts itself away, and `driveRoute` returns only
  // at the end of a lap - so looking after the drive found state `'idle'`, the
  // field gone and nothing to report. The step callback is the only place that
  // sees the moment it happens.
  let result = null;
  let wasHeading = world.heading;
  let turned = 0;
  // Ground actually covered, against the clock the race is scored on. `held`
  // below is `playerDist`, which is *gates passed* and not distance - so where
  // these two disagree the table is reporting the scoring and not the driving.
  //
  // Summed per step rather than per lap. `driveRoute` returns at the end of a
  // lap and the flag falls in the middle of one, so a per-lap total is short by
  // however much of the last lap was in flight - which is most of a lap, and
  // reads as the car having covered half the ground it did.
  let ground = 0;
  /** Steps with the boost actually lit, so a policy that never fires cannot hide. */
  let lit = 0;
  let steps = 0;
  const watch = (w) => {
    ground += Math.abs(w.speed) * K.STEP;
    if (!result && w.race.state === 'finished') {
      const challenger = w.race.field.find((r) => r.rival.rank === rival.rank);
      result = {
        won: w.race.won,
        position: w.race.position,
        // Metres of route between the two of you at the flag. Positive is you.
        gap: challenger ? (w.race.playerDist - challenger.dist) / M : null,
        // What each of you actually held, as a fraction of top speed. This is
        // the pair of numbers a calibration needs: the field runs at a
        // *configured* fraction along the route line, and the driver holds
        // whatever the corners and the traffic leave it.
        held: w.race.elapsed > 0 ? w.race.playerDist / (w.race.elapsed * w.maxSpeed) : 0,
        real: w.race.elapsed > 0 ? ground / w.race.elapsed / K.REFERENCE_TOP_SPEED : 0,
        lit: steps > 0 ? lit / steps : 0,
      };
    }
    // Used where it is worth using (#105), which means *on a straight*. The
    // first version of this pressed it whenever there was charge and speed,
    // and measured a boosted lap 3 points slower than a clean one - which is
    // exactly the regression #105 fixed in the game and this probe then
    // reintroduced in the driver. Overspeed carried into a bend is scrubbed
    // off again by the grip limit, so a boost taken into a corner is worse
    // than no boost at all.
    //
    // "Straight" is measured rather than asked: how much the car has turned
    // over the last half second.
    turned = turned * 0.94 + Math.abs(angleTo(w.heading, wasHeading)) * 0.06;
    wasHeading = w.heading;
    if (!boost) return {};
    const nitro = w.nitro > 0.4 && turned < 0.004 && w.speed > w.maxSpeed * 0.35;
    steps++;
    if (nitro) lit++;
    return { nitro };
  };

  // A lap at a time: `driveRoute` stops at the end of one, and a circuit is
  // three. Two extra passes, because the last lap ends a little past the line.
  let laps = 0;
  while (!result && world.race.state !== 'idle' && laps < K.ROUTE_LAPS + 2) {
    laps++;
    driveRoute(world, proving, K, {
      seconds: 300,
      none: NONE,
      hold: watch,
      skill: ladderDriver.skill,
    });
  }

  // A result is a thing that happened, not the absence of one. The first
  // version of this asked whether the state was still `'running'` - and the
  // state is called `'racing'`, so every race "finished" without a lap being
  // driven and the table read ten first places with a zero gap. Which is the
  // lie #166 was filed about, arriving in a different place.
  if (!result) {
    throw new Error(
      `#${rival.rank} ${rival.name}: no result after ${laps} laps ` +
        `(state '${world.race.state}', lap ${world.race.lap}). Nothing here should report one.`,
    );
  }
  return { finished: true, ...result };
}

console.log('\nTHE LADDER');
console.log(
  `  every rival on "${proving.name}", driven by ${ladderDriver.name === 'perfect' ? 'the perfect driver' : `an ${ladderDriver.name}`} in traffic, clean and boosted\n`,
);

const ladderHead = ['rival', 'their pace', 'clean', 'scored', 'ground', 'gap', 'boosted', 'scored', 'ground', 'gap', 'on boost'];
const ladderRows = [ladderHead];

for (let i = RIVALS.length - 1; i >= 0; i--) {
  const rival = RIVALS[i];
  const clean = race(rival, i, false);
  const boosted = race(rival, i, true);
  if (!clean.finished || !boosted.finished) {
    throw new Error(`#${rival.rank} ${rival.name}: the race never finished`);
  }

  const key = `ladder_${String(rival.rank).padStart(2, '0')}`;
  metrics[`${key}_won`] = clean.won;
  metrics[`${key}_gap_m`] = clean.gap === null ? null : Math.round(clean.gap);
  metrics[`${key}_boost_won`] = boosted.won;
  metrics[`${key}_boost_gap_m`] = boosted.gap === null ? null : Math.round(boosted.gap);
  metrics[`${key}_boost_lit`] = round(boosted.lit);

  const shown = (r) => (r.gap === null ? '-' : `${r.gap > 0 ? '+' : ''}${Math.round(r.gap)} m`);
  const pace = K.RIVAL_BASE_SPEED_FRAC + rival.difficulty * K.RIVAL_DIFF_SPEED_FRAC;
  metrics[`${key}_you_held`] = round(clean.held);
  ladderRows.push([
    `#${rival.rank} ${rival.name}`,
    `${Math.round(pace * 100)}%`,
    clean.won ? 'won' : `${clean.position}th`,
    `${Math.round(clean.held * 100)}%`,
    `${Math.round(clean.real * 100)}%`,
    shown(clean),
    boosted.won ? 'won' : `${boosted.position}th`,
    `${Math.round(boosted.held * 100)}%`,
    `${Math.round(boosted.real * 100)}%`,
    shown(boosted),
    `${Math.round(boosted.lit * 100)}%`,
  ]);
}

const lw = ladderHead.map((_, i) => Math.max(...ladderRows.map((r) => r[i].length)));
for (const row of ladderRows) {
  console.log(
    '  ' + row.map((cell, i) => (i === 0 ? cell.padEnd(lw[i]) : cell.padStart(lw[i]))).join('   '),
  );
}

// The property the handoff claims, checked rather than asserted: the top of the
// ladder should be lost clean and won with the boost, or #105 bought nothing.
// It is reported rather than thrown, because whether the ladder is right is a
// judgement and this is an instrument.
// The table is built from the boss down, because `RIVALS` runs rank 10 first
// and this iterates it backwards - so row 1 is #1 and the last row is #10.
// Reading those the other way round reported the property inverted.
const boss = ladderRows[1];
const bottom = ladderRows[ladderRows.length - 1];
const asDesigned = boss[2] !== 'won' && bottom[2] === 'won';
console.log('\n  designed for: the bottom of the ladder won in the car you start in,');
console.log('                the boss lost in it - the top of the ladder wants a better car');
console.log(
  `  measured:     bottom ${bottom[2]} clean, boss ${boss[2]} clean` +
    (asDesigned ? '   (as designed)' : '   <- NOT what it is designed for'),
);
// A boost that never lights is not a measurement of the boost, and this probe
// spent #204's whole lifetime reporting one. `turned < 0.004` is unreachable for
// any driver with a reaction time and a wander, so every row below `perfect`
// compares a clean lap against an identical clean lap.
const litBoss = ladderRows[1][10];
if (litBoss === '0%') {
  console.log(
    `\n  the boost was never pressed (${litBoss} of the lap): this policy asks for half a` +
      '\n  second of dead-straight heading, which no driver with a reaction time holds.' +
      '\n  The boosted rows above are clean rows. See #204.',
  );
} else {
  // Measured by `npm run nitro`, and it is not what #204 assumed. Speed carried
  // into a bend is *not* what the boost costs: the fraction of a lap spent above
  // the speed the next corner allows is flat at 5-6% whether the boost is used
  // or not. What the boost buys is a faster exit, and in traffic that is spent
  // arriving at the car in front sooner - it comes back as damage (16% to 98%
  // over a lap), not as scrubbed overspeed. On an empty road the same policy is
  // worth eight points.
  console.log(
    `\n  the boost is worth ${boss[7]} against ${boss[3]} clean on this circuit.` +
      '\n  It pays on an empty road and costs in traffic, and what it costs is damage\n' +
      '  rather than speed scrubbed off in bends. `npm run nitro` is the breakdown.',
  );
}
if (!asDesigned) {
  console.log(
    '\n  The field runs at a configured fraction of your top speed along the route\n' +
      '  line; you hold whatever the corners and the traffic leave you. Those two\n' +
      '  columns are what a calibration has to reconcile - `RIVAL_BASE_SPEED_FRAC`\n' +
      '  was set against the track sim that #165 deleted, where a reference lap\n' +
      '  averaged 91% of top speed rather than the 25-50% a city lap does.',
  );
}

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
