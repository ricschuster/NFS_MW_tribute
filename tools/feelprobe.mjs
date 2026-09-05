// Feel probe: drive the headless World with scripted inputs and report the
// numbers that "driving feel" is actually made of - how long 0-to-top takes,
// how fast a lane change is, how quickly a cop pins you, how long a race runs.
//
// The playtests assert invariants (they must not change); this asserts nothing.
// It measures, so tuning constants.ts is a before/after diff instead of a guess.
//
// Usage:
//   npm run feel                          # print the table
//   npm run feel -- --out feel.json       # also save the numbers
//   npm run feel -- --baseline feel.json  # print a delta column vs. that file
//
// Loads the TypeScript sim through Vite's SSR loader, so there is no build step
// and no extra dependency. Everything random (traffic layout, cop spawn lanes)
// runs off a seeded PRNG, so two runs of the same constants are identical.
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? null;
};

/** Mirrors the HUD scale in game.ts, purely so the numbers read like the game. */
const DISPLAY_MAX_KMH = 320;
const SEED = 0x9e3779b9;

/** Deterministic Math.random (mulberry32), reinstalled before every scenario. */
function seedRandom(seed = SEED) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { World } = await server.ssrLoadModule('/src/game/world.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');
const { BLACKLIST } = await server.ssrLoadModule('/src/game/blacklist.ts');
const { STEP, SEGMENT_LENGTH, LANES, MIN_STEER } = K;

const LANE_WIDTH = 2 / LANES; // road spans -1..1, so one lane is this wide in offset units

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const press = (partial) => ({ ...NONE, ...partial });

/**
 * Silence the pursuit for a scenario. Without this a cop reaches a slow car in
 * a few seconds and a bust freezes the world mid-measurement, which quietly
 * corrupts anything timed from a standstill. The police get measured on their
 * own, below.
 */
function noPolice(w) {
  w.police.update = () => {};
  return w;
}

/** Steer back toward the middle of the road, like a player holding a line. */
function centering(w, dead = 0.02) {
  if (w.playerX > dead) return { left: true };
  if (w.playerX < -dead) return { right: true };
  return {};
}

/**
 * Hold the line, but swerve around the nearest slower car ahead in the player's
 * lane. A crude stand-in for a player who is actually looking where they are
 * going, so traffic numbers are not just "what happens if you ram everything".
 */
function dodging(w, reaction = 0.6) {
  const base = w.position + w.playerZ;
  // look a fixed *time* ahead, not a fixed distance: at 320 km/h a few segments
  // is a tenth of a second of warning, which no player would have either
  const lookahead = Math.ceil((Math.max(0, w.speed) * reaction) / SEGMENT_LENGTH) + 2;
  for (let s = 0; s < lookahead; s++) {
    for (const car of w.road.findSegment(base + s * SEGMENT_LENGTH).cars) {
      if (car.speed >= w.speed) continue; // only cars we are closing on
      // collisions trigger inside 0.8 car widths, so start moving a bit wider
      if (Math.abs(car.offset - w.playerX) > K.CAR_WIDTH_OFFSET * 1.1) continue;
      const away = car.offset > w.playerX ? { left: true } : { right: true };
      // never dodge off the road; taking the hit is cheaper than the grass
      if (away.left && w.playerX < -0.85) return { right: true };
      if (away.right && w.playerX > 0.85) return { left: true };
      return away;
    }
  }
  return centering(w);
}

/** Throttle only as far as `frac` of top speed, holding the centre line. */
const holdSpeed = (w, frac) => press({ up: w.speed < w.maxSpeed * frac, ...centering(w) });

const POLICY = {
  /** Everything a good player does: flat out, on the line, boosting when charged. */
  expert: (w) => press({ up: true, nitro: true, ...centering(w) }),
  /** Flat out on the line, but never touches nitrous. */
  clean: (w) => press({ up: true, ...centering(w) }),
  /** Throttle pinned, no steering at all - the "curves do what they like" case. */
  flatout: () => press({ up: true }),
  /** Flat out with nitrous, swerving around traffic. */
  dodger: (w) => press({ up: true, nitro: true, ...dodging(w) }),
};

/** Step `world` for `seconds`, choosing the held input each step via `control`. */
function run(world, seconds, control) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) world.step(STEP, control(world, i * STEP));
}

/**
 * Step until `done(world, t)` returns truthy; returns the elapsed seconds, or
 * null if it never happened within `limit`.
 */
function until(world, control, done, limit = 60) {
  let t = 0;
  while (t < limit) {
    world.step(STEP, control(world, t));
    t += STEP;
    if (done(world, t)) return t;
  }
  return null;
}

/** Distance covered under `control` over `seconds`, integrated from speed. */
function distanceOver(world, seconds, control) {
  let d = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    world.step(STEP, control(world, i * STEP));
    d += Math.max(0, world.speed) * STEP;
  }
  return d;
}

/** A fresh clear-road world, already at `frac` of top speed and centred. */
function atSpeed(frac, seconds = 6) {
  seedRandom();
  const w = noPolice(new World({ traffic: false }));
  run(w, seconds, (w) => holdSpeed(w, frac));
  w.playerX = 0;
  return w;
}

/** Index of the sharpest segment on the track (the hardest bend to hold). */
function hardestCurve(road) {
  let best = 0;
  for (const s of road.segments) {
    if (Math.abs(s.curve) > Math.abs(road.segments[best].curve)) best = s.index;
  }
  return best;
}

/**
 * Index of a segment whose curve is closest to `magnitude` and which is part of
 * a sustained stretch, not a single frame of the ease in or out.
 */
function curveOfMagnitude(road, magnitude) {
  let best = 0;
  let bestErr = Infinity;
  for (const s of road.segments) {
    const ahead = road.segments[(s.index + 6) % road.segments.length];
    if (Math.abs(Math.abs(ahead.curve) - Math.abs(s.curve)) > 0.01) continue; // still easing
    const err = Math.abs(Math.abs(s.curve) - magnitude);
    if (err < bestErr) {
      bestErr = err;
      best = s.index;
    }
  }
  return best;
}

/** Drop the player into the bend at `idx`, keeping their current pace. */
function teleportToCurve(w, idx) {
  w.position = idx * SEGMENT_LENGTH - w.playerZ;
  w.playerX = 0;
  return idx;
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

const metrics = {};
const sections = [];
let current = null;

const section = (title) => sections.push((current = { title, rows: [] }));
/** Record one line of the report, and (when `key` is given) one comparable number. */
function row(label, value, note = '', key = null, num = null) {
  current.rows.push([label, value, note]);
  // round on the way in, so a saved baseline diffs on real changes rather than
  // on the last digit of an accumulated float
  if (key !== null) metrics[key] = Number.isFinite(num) ? Math.round(num * 1e4) / 1e4 : num;
}

const secs = (t) => (t === null ? 'never' : `${t.toFixed(2)} s`);
const kmh = (speed, max) => `${Math.round((speed / max) * DISPLAY_MAX_KMH)} km/h`;
const pct = (x) => `${(x * 100).toFixed(0)}%`;

function measureAcceleration() {
  section('ACCELERATION AND BRAKING (clear road)');
  const marks = [0.25, 0.5, 0.75, 0.9, 0.99];
  seedRandom();
  const w = noPolice(new World({ traffic: false }));
  const hit = {};
  let t = 0;
  while (t < 30 && Object.keys(hit).length < marks.length) {
    w.step(STEP, POLICY.clean(w));
    t += STEP;
    for (const m of marks) if (hit[m] === undefined && w.speed >= w.maxSpeed * m) hit[m] = t;
  }
  for (const m of marks) {
    row(`0 to ${pct(m)}`, secs(hit[m] ?? null), kmh(w.maxSpeed * m, w.maxSpeed), `accel_to_${m * 100}`, hit[m] ?? null);
  }

  // Braking and coasting, both measured from a standing top speed.
  const b = atSpeed(1);
  let braked = 0;
  let brakeTime = 0;
  while (b.speed > 0 && brakeTime < 20) {
    b.step(STEP, press({ down: true }));
    braked += Math.max(0, b.speed) * STEP;
    brakeTime += STEP;
  }
  row('top speed to stop (braking)', secs(brakeTime), `${Math.round(braked)} units`, 'brake_to_stop_s', brakeTime);

  const c = atSpeed(1);
  // steer only to stay on the road; off-road drag would flatter the coast time
  const coastTime = until(c, (w) => press(centering(w)), (w) => w.speed <= 0, 30);
  row('top speed to stop (coasting)', secs(coastTime), '', 'coast_to_stop_s', coastTime);

  const r = atSpeed(0);
  const revTime = until(r, (w) => press({ down: true, ...centering(w) }), (w) => w.speed <= -w.maxSpeed * K.REVERSE_SPEED_FRAC * 0.99, 20);
  row('0 to full reverse', secs(revTime), kmh(w.maxSpeed * K.REVERSE_SPEED_FRAC, w.maxSpeed), 'reverse_s', revTime);
}

function measureSteering() {
  section('STEERING (seconds to change one lane)');
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const times = [];
    for (const dir of ['left', 'right']) {
      const w = atSpeed(frac);
      const t = until(
        w,
        (w) => press({ [dir]: true, up: w.speed < w.maxSpeed * frac }),
        (w) => Math.abs(w.playerX) >= LANE_WIDTH,
        10,
      );
      if (t !== null) times.push(t);
    }
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const note = frac === 0 ? `steering floor (MIN_STEER ${MIN_STEER})` : '';
    row(`at ${pct(frac)} speed`, secs(avg), note, `lane_change_${frac * 100}_s`, avg);
  }
}

function measureCornering() {
  section('CORNERING (fastest speed that still holds the road)');
  seedRandom();
  const road = new World({ traffic: false }).road;

  /** Binary search the fastest pace that gets through the bend at `idx` on-road. */
  function fastestHold(idx) {
    const holds = (frac) => {
      const w = atSpeed(frac);
      teleportToCurve(w, idx);
      let worst = 0;
      const seconds = Math.min(12, 24000 / Math.max(1, w.maxSpeed * frac));
      run(w, seconds, (w) => {
        worst = Math.max(worst, Math.abs(w.playerX));
        return holdSpeed(w, frac);
      });
      return worst <= 1;
    };
    if (holds(1)) return 1;
    let lo = 0.2;
    let hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      if (holds(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  // The track is authored from easy / medium / hard curves, so report all three:
  // a difficulty spread matters more than any single bend.
  for (const [name, magnitude] of [['easy bend', 2], ['medium bend', 4], ['hardest bend', 6]]) {
    const idx = magnitude === 6 ? hardestCurve(road) : curveOfMagnitude(road, magnitude);
    const frac = fastestHold(idx);
    const note = frac >= 1 ? 'can be taken flat out' : `lift to ${kmh(frac, 1)}`;
    row(`${name} (curve ${Math.abs(road.segments[idx].curve).toFixed(1)})`, pct(frac), note, `corner_max_frac_${magnitude}`, frac);
  }

  // Flat out with no steering at all: how long before the bend spits you off?
  const hardest = hardestCurve(road);
  const f = atSpeed(1);
  teleportToCurve(f, hardest);
  const offTime = until(f, POLICY.flatout, (w) => Math.abs(w.playerX) > 1, 20);
  row('hardest bend, no steering, to off-road', secs(offTime), 'curve push vs. no correction', 'curve_offroad_s', offTime);

  // What flooring it blind actually costs, once off-road drag bites.
  const w = atSpeed(1);
  teleportToCurve(w, hardest);
  let slowest = w.maxSpeed;
  run(w, 6, (w) => {
    slowest = Math.min(slowest, w.speed);
    return POLICY.flatout(w);
  });
  row('speed left after 6 s of that', pct(slowest / w.maxSpeed), kmh(slowest, w.maxSpeed), 'curve_speed_kept', slowest / w.maxSpeed);
}

function measureNitro() {
  section('NITROUS');
  const w = atSpeed(1);
  w.nitro = 1;
  let peak = 0;
  const boost = until(
    w,
    (w) => {
      peak = Math.max(peak, w.speed);
      return press({ up: true, nitro: true, ...centering(w) });
    },
    (w) => w.nitro <= 0,
    20,
  );
  row('boost duration from full', secs(boost), '', 'nitro_boost_s', boost);
  row('peak speed while boosting', pct(peak / w.maxSpeed), kmh(peak, w.maxSpeed), 'nitro_peak_frac', peak / w.maxSpeed);

  const bleed = until(w, POLICY.clean, (x) => x.speed <= x.maxSpeed, 10);
  row('overspeed bleed-off after boost', secs(bleed), '', 'nitro_bleed_s', bleed);

  const r = atSpeed(1);
  r.nitro = 0;
  const recharge = until(r, POLICY.clean, (w) => w.nitro >= 1, 30);
  row('empty to full recharge', secs(recharge), '', 'nitro_recharge_s', recharge);

  // What a boost is worth: distance over a window, with and without it.
  const window = 12;
  const withNitro = distanceOver(atSpeed(1), window, POLICY.expert);
  const withoutNitro = distanceOver(atSpeed(1), window, POLICY.clean);
  const gain = withNitro / withoutNitro - 1;
  row(`distance gained over ${window} s`, `+${(gain * 100).toFixed(1)}%`, `${Math.round(withNitro - withoutNitro)} units`, 'nitro_gain_frac', gain);

  // Holding the key down never stops working: the charge refills for one step,
  // which is enough to boost again on the next one. Worth knowing it is free.
  const h = atSpeed(1);
  let sum = 0;
  let n = 0;
  run(h, window, (w) => { sum += w.speed; n++; return POLICY.expert(w); });
  row(`average speed holding nitrous ${window} s`, pct(sum / n / h.maxSpeed), kmh(sum / n, h.maxSpeed), 'nitro_held_frac', sum / n / h.maxSpeed);
}

function measurePursuit() {
  section('POLICE (steady speed held from the start, clear road)');
  for (const frac of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    seedRandom();
    const w = new World({ traffic: false });
    let spawned = null;
    let outcome = null;
    let at = null;
    let peakHeat = 0;
    let t = 0;
    while (t < 60 && outcome === null) {
      w.step(STEP, holdSpeed(w, frac));
      t += STEP;
      peakHeat = Math.max(peakHeat, w.police.heat);
      if (spawned === null && w.police.pursuing) spawned = t;
      if (w.busted) { outcome = 'BUSTED'; at = t; }
      else if (w.police.justEscaped) { outcome = 'escaped'; at = t; }
    }
    const since = at !== null && spawned !== null ? at - spawned : null;
    const label = `at ${pct(frac)} speed`;
    const value = outcome === null ? 'no outcome in 60 s' : `${outcome} ${secs(since)} after the cop appears`;
    row(label, value, `peak heat ${(peakHeat * 100).toFixed(0)}%`, `pursuit_${frac * 100}_s`, since);
    metrics[`pursuit_${frac * 100}_outcome`] = outcome;
  }

  // Cop speeds are the whole balance: below the player's top speed by design.
  row('cop top speed, heat 0', pct(K.COP_MAX_SPEED_FRAC), '', 'cop_speed_cold', K.COP_MAX_SPEED_FRAC);
  row('cop top speed, full heat', pct(K.COP_MAX_SPEED_FRAC + K.COP_HEAT_SPEED_FRAC), '', 'cop_speed_hot', K.COP_MAX_SPEED_FRAC + K.COP_HEAT_SPEED_FRAC);
}

function measureRaces() {
  section('BLACKLIST RACES (flat out with nitrous, clear road, countdown excluded)');
  /** Race rival `i` under `policy`, skipping the 3-2-1 from the clock. */
  function race(i, policy) {
    const rival = BLACKLIST[i];
    seedRandom();
    const w = new World({ traffic: false });
    w.beaten = i;
    w.step(STEP, press({ confirm: true })); // starts the countdown
    until(w, () => NONE, (w) => w.raceMode === 'racing', 10);
    const t = until(w, policy, (w) => w.raceMode === 'result', 120);
    const rivalSpeed = w.maxSpeed * (K.RIVAL_BASE_SPEED_FRAC + rival.difficulty * K.RIVAL_DIFF_SPEED_FRAC);
    const won = w.raceResult === 'won';
    return {
      rival,
      t: t ?? 0,
      won,
      rivalSpeed,
      margin: won
        ? (K.RACE_DISTANCE - w.rivalCar.dist) / rivalSpeed
        : (K.RACE_DISTANCE - w.playerRaceDist) / w.maxSpeed,
      maxSpeed: w.maxSpeed,
    };
  }

  const boosted = BLACKLIST.map((_, i) => race(i, POLICY.expert));
  for (const r of boosted) {
    row(
      `#${r.rival.rank} ${r.rival.name}`,
      `${r.won ? 'WON ' : 'lost'}  ${secs(r.t)}`,
      `${r.won ? 'by' : 'behind by'} ${r.margin.toFixed(2)} s  ·  rival at ${pct(r.rivalSpeed / r.maxSpeed)}`,
      `race_${r.rival.rank}_s`,
      r.t,
    );
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const wins = boosted.filter((r) => r.won).length;
  const avg = mean(boosted.map((r) => r.t));
  row('average race length', secs(avg), `${wins}/${BLACKLIST.length} won`, 'race_avg_s', avg);
  metrics.race_wins = wins;

  // The same fifteen races without touching nitrous, to separate "the boost is
  // strong" from "the rivals are slow".
  const noBoost = BLACKLIST.map((_, i) => race(i, POLICY.clean));
  const noBoostWins = noBoost.filter((r) => r.won).length;
  row('average with no nitrous', secs(mean(noBoost.map((r) => r.t))), `${noBoostWins}/${BLACKLIST.length} won`, 'race_avg_no_nitro_s', mean(noBoost.map((r) => r.t)));
  const closest = noBoost.reduce((a, b) => (b.margin < a.margin ? b : a));
  row(
    'closest finish with no nitrous',
    `${closest.margin.toFixed(2)} s`,
    `#${closest.rival.rank} ${closest.rival.name}, ${closest.won ? 'won' : 'lost'}`,
    'race_closest_margin_s',
    closest.margin,
  );
}

function measureTraffic() {
  section('TRAFFIC (60 s flat out with nitrous, no police)');

  /** Crashes and average pace over a minute under `control`. */
  function minute(traffic, control) {
    seedRandom();
    const w = noPolice(new World({ traffic }));
    let crashes = 0;
    let last = 0;
    let sum = 0;
    let n = 0;
    run(w, 60, (w) => {
      // crashFlash is set to 1 on impact and decays every step, so a rise in it
      // is one crash. It is already below 1 by the time we can observe it.
      if (w.crashFlash > last) crashes++;
      last = w.crashFlash;
      sum += w.speed;
      n++;
      return control(w);
    });
    return { crashes, frac: sum / n / w.maxSpeed };
  }

  const dodger = minute(true, POLICY.dodger);
  const rammer = minute(true, POLICY.expert);
  const clear = minute(false, POLICY.expert);

  row('crashes, swerving around cars', `${dodger.crashes}`, `${K.TRAFFIC_COUNT} cars on track`, 'crashes_dodging', dodger.crashes);
  row('crashes, holding the centre line', `${rammer.crashes}`, 'no avoidance at all', 'crashes_no_dodge', rammer.crashes);
  row('average speed, swerving', pct(dodger.frac), `${pct(1 - dodger.frac / clear.frac)} slower than an empty road`, 'traffic_mean_frac', dodger.frac);
  row('average speed, no avoidance', pct(rammer.frac), `${pct(1 - rammer.frac / clear.frac)} slower than an empty road`, 'traffic_rammed_frac', rammer.frac);
  row('average speed, empty road', pct(clear.frac), 'over 100% because nitrous is held down', 'clear_mean_frac', clear.frac);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

measureAcceleration();
measureSteering();
measureCornering();
measureNitro();
measurePursuit();
measureRaces();
measureTraffic();

const baselinePath = flag('--baseline');
const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;

const probe = new World({ traffic: false });
console.log('FEEL PROBE');
console.log(
  `seed 0x${SEED.toString(16)} · step ${STEP.toFixed(4)} s · top speed ${probe.maxSpeed} units/s (${DISPLAY_MAX_KMH} km/h on the HUD)`,
);
if (baseline) console.log(`baseline: ${baselinePath}`);

for (const s of sections) {
  console.log(`\n${s.title}`);
  const w0 = Math.max(...s.rows.map((r) => r[0].length));
  const w1 = Math.max(...s.rows.map((r) => r[1].length));
  for (const [label, value, note] of s.rows) {
    console.log(`  ${label.padEnd(w0)}   ${value.padStart(w1)}${note ? `   ${note}` : ''}`);
  }
}

if (baseline) {
  const changed = Object.keys(metrics).filter((k) => {
    const a = baseline[k];
    const b = metrics[k];
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-6;
    return a !== b;
  });
  console.log('\nCHANGED VS. BASELINE');
  if (changed.length === 0) console.log('  nothing moved');
  for (const k of changed) {
    const a = baseline[k];
    const b = metrics[k];
    const delta = typeof a === 'number' && typeof b === 'number' ? `  (${b > a ? '+' : ''}${(b - a).toFixed(3)})` : '';
    console.log(`  ${k.padEnd(24)} ${String(a)} -> ${String(b)}${delta}`);
  }
}

const outPath = flag('--out');
if (outPath) {
  writeFileSync(outPath, `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`\nwrote ${outPath}`);
}

await server.close();
