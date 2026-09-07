// Can every ramp be driven up?
//
// #212: eleven of thirteen could not, and nothing went red. The interstate is
// a third of what Kestrel Bay is structurally and the ramps are the only way
// onto it, so "the deck is reachable" is an invariant rather than a nicety -
// this is a guard in the same sense `npm run pace` is, and it exits non-zero.
//
// Two things made it unclimbable and both were geometry. A ramp laid straight
// at its junction ran down an existing street for its whole length, and two
// roads sharing a footprint is a place the car cannot choose between:
// `surfaceAt` takes whichever is nearest the height the car is at, the street
// below is flat, the ramp is rising, so the flat one won every step and the
// car drove the length of its own on-ramp at ground level. And a ramp is solid
// against blocks below `CAR_RADIUS * 2`, so anything it passed over while low
// walled the car in.
//
// The driver here is deliberately stupid - point up the ramp, hold the
// throttle - because a ramp that needs skill to climb is also broken.
//
// Usage:
//   npm run ramps
//   npm run ramps -- --trace 4    # watch one climb
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { surfaceAt } = await server.ssrLoadModule('/src/game/city/grid.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');
const M = K.UNITS_PER_METRE;
const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const trace = flag('--trace') === null ? null : Number(flag('--trace'));

const city = new CityWorld(undefined, { traffic: false, police: false }).city;
// The climbing part only: the short spur that joins a foot to its junction is
// also class 'ramp' and is flat, so it is not a climb to test.
const ramps = city.roads.filter((road) => {
  if (road.class !== 'ramp') return false;
  return Math.abs(city.nodes[road.a].y - city.nodes[road.b].y) > M;
});

console.log('RAMP PROBE (#212)');
console.log(`  ${ramps.length} climbing ramps · hold the throttle and see what happens\n`);

const rows = [['ramp', 'length', 'grade', 'reached', 'of', 'impacts', 'damage']];
let failed = 0;

for (const [i, ramp] of ramps.entries()) {
  // A fresh world each time: damage carries over otherwise, and a car at full
  // damage has less top speed and less grip, so ramp 5 would be measuring the
  // crashes from ramp 1.
  const world = new CityWorld(undefined, { traffic: false, police: false });
  const a = city.nodes[ramp.a];
  const b = city.nodes[ramp.b];
  const bottom = a.y <= b.y ? a : b;
  const top = a.y <= b.y ? b : a;

  const dx = top.pos.x - bottom.pos.x;
  const dz = top.pos.z - bottom.pos.z;
  const run = Math.hypot(dx, dz);
  // Started *on* the ramp rather than behind it: extending backwards along the
  // line puts the car wherever that line happens to go, which was sometimes
  // inside a building and read as the ramp being blocked.
  world.x = bottom.pos.x + (dx / run) * M * 5;
  world.z = bottom.pos.z + (dz / run) * M * 5;
  world.y = 0;
  world.heading = Math.atan2(dx, dz);
  world.speed = 0;

  let peak = 0;
  let impacts = 0;
  let wasFlash = 0;
  for (let t = 0; t < 30; t += K.STEP) {
    world.step(K.STEP, { ...NONE, up: true });
    if (world.crashFlash > 0.9 && wasFlash <= 0.9) impacts++;
    wasFlash = world.crashFlash;
    peak = Math.max(peak, world.y);
    if (trace === i && Math.round(t / K.STEP) % 30 === 0) {
      const s = surfaceAt(city, world.grid, world.x, world.z, world.y);
      console.log(
        `  t=${t.toFixed(1)} y=${(world.y / M).toFixed(2)}m spd=${Math.round(world.speed)} ` +
          `on=${s.road ? s.road.class : 'NOTHING'} hurt=${Math.round(world.hurt * 100)}%`,
      );
    }
  }

  // Most of the way up is up: the last stretch onto the deck is a transition
  // the car eases through, and stopping a metre short is not being stuck.
  const made = peak > top.y * 0.9;
  if (!made) failed++;
  rows.push([
    `${made ? 'ok  ' : 'FAIL'} #${i}`,
    `${Math.round(ramp.length / M)} m`,
    `${(((top.y - bottom.y) / ramp.length) * 100).toFixed(1)}%`,
    `${(peak / M).toFixed(1)} m`,
    `${(top.y / M).toFixed(1)} m`,
    String(impacts),
    `${Math.round(world.hurt * 100)}%`,
  ]);
}

const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const row of rows) {
  console.log('  ' + row.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('   '));
}

console.log(
  `\n  ${ramps.length - failed} of ${ramps.length} ramps reach their deck.` +
    (failed ? `\n  ${failed} cannot be driven up, which makes the interstate unreachable there.` : ''),
);

await server.close();
if (failed) process.exit(1);
