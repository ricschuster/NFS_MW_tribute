// Read a telemetry recording (#347) and report the two numbers it was made for.
//
// 1. A human's pace: each race's average speed as a fraction of the reference
//    car's top speed, beside what `citylap`'s reference driver holds on the same
//    route in traffic (docs/city-baseline.json). ADR-0011 wants about 0.6.
// 2. On-screen traffic: vehicles the camera could see, per sample, beside the
//    reference game's 0.60 a frame with 60% of frames empty
//    (docs/research/nfs-most-wanted-2012-gameplay.md).
//
// Recordings come from the game: F9 in dev, or in a built game with `?debug`.
//
// A recording keeps every vehicle's on-screen size, so it can be counted again
// at another threshold with `--detectable 0.03` (a fraction of screen height).
//
// Usage:
//   npm run telemetry -- crosstown-telemetry-*.json [--detectable 0.025]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const at = args.indexOf('--detectable');
const override = at < 0 ? null : Number(args.splice(at, 2)[1]);
const files = args;
if (files.length === 0) {
  console.error('usage: npm run telemetry -- <recording.json> [more.json ...]');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(new URL('../docs/city-baseline.json', import.meta.url), 'utf8'));
const key = (route) => route.toLowerCase().replace(/[^a-z]+/g, '_');
const pct = (n) => `${Math.round(n * 100)}%`;
const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

const samples = [];
let counting = null;
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.version === 1) {
    // The first recordings counted everything in view within a range.
    if (override !== null) throw new Error(`${file}: a version 1 recording has no sizes to count again`);
    counting = `in the camera's view within ${data.range} m (a version 1 recording)`;
    samples.push(...data.samples.map((s) => ({ ...s, file })));
  } else if (data.version === 2) {
    const floor = override ?? data.detectable;
    counting = `at ${(floor * 100).toFixed(1)}% of screen height or bigger`;
    for (const s of data.samples) {
      const traffic = override === null ? s.traffic : s.sizes.traffic.filter((h) => h >= floor).length;
      const police = override === null ? s.police : s.sizes.police.filter((h) => h >= floor).length;
      samples.push({ ...s, traffic, police, file });
    }
  } else throw new Error(`${file}: unknown telemetry version ${data.version}`);
}

console.log('TELEMETRY (#347)');
console.log(`${files.length} recording(s), ${samples.length} samples, ${(samples.length / 60).toFixed(1)} minutes`);
console.log(`cars: ${[...new Set(samples.map((s) => s.car))].join(', ')}\n`);

// Races: a run of consecutive samples in the same file with a race on. The
// countdown is part of the event but not of the pace, so stopped samples at
// the start of a run are dropped.
const races = [];
let run = null;
for (const s of samples) {
  const racing = s.event === 'race' && s.route;
  if (racing && run && run.file === s.file && run.route === s.route) run.samples.push(s);
  else {
    if (run) races.push(run);
    run = racing ? { file: s.file, route: s.route, samples: [s] } : null;
  }
}
if (run) races.push(run);

console.log('PACE IN RACES');
if (races.length === 0) console.log('  no races in the recording\n');
else {
  console.log('  route                 seconds   you   citylap in traffic');
  for (const race of races) {
    const first = race.samples.findIndex((s) => s.kmh > 0);
    const driven = first < 0 ? [] : race.samples.slice(first);
    const bot = baseline[`${key(race.route)}_traffic_avg`];
    console.log(
      `  ${race.route.padEnd(20)} ${String(driven.length).padStart(8)}   ${pct(mean(driven.map((s) => s.ofTop))).padStart(4)}   ${bot === undefined ? '-' : pct(bot)}`,
    );
  }
  console.log('  ADR-0011 wants about 60%.\n');
}

const roam = samples.filter((s) => s.event === null);
const moving = roam.filter((s) => s.kmh > 5);
console.log('FREE ROAM');
console.log(`  ${roam.length} s, ${pct(moving.length / Math.max(1, roam.length))} of it moving`);
console.log(`  average pace ${pct(mean(roam.map((s) => s.ofTop)))}, ${pct(mean(moving.map((s) => s.ofTop)))} while moving`);
console.log(`  in a pursuit ${pct(roam.filter((s) => s.pursuit !== 'clear').length / Math.max(1, roam.length))} of the time\n`);

const seen = samples.map((s) => s.traffic + s.police);
console.log('ON-SCREEN TRAFFIC');
console.log(`  vehicles in view  ${mean(seen).toFixed(2)} a sample (civilian ${mean(samples.map((s) => s.traffic)).toFixed(2)}, police ${mean(samples.map((s) => s.police)).toFixed(2)})`);
console.log(`  samples with none ${pct(seen.filter((n) => n === 0).length / Math.max(1, seen.length))}`);
console.log('  reference game    0.60 a frame, 60% of frames with none');
console.log(`  Counted ${counting}.`);
console.log('  Nothing tests whether a vehicle is hidden behind something, which a detector would miss.');
