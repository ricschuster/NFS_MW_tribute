// Can you outrun them?
//
// The police run at fractions of *your* top speed, and `HEAT_LEVELS` keeps
// every one of those fractions under 1 on purpose. The comment on it says why:
// a pursuit you cannot outrun on speed alone is a pursuit with no answer. That
// invariant has been broken twice by accident - once by elite cars at 105%, and
// once by a car profile - and neither time did a test go red, because nothing
// compared the two numbers.
//
// This compares them. It is fast, deterministic and has no driver in it: the
// player figure is measured by holding the throttle on an empty straight, and
// the police figure is arithmetic over the constants.
//
// The fractions are car-independent by construction. `police.update` is handed
// `CityWorld.maxSpeed`, which already has the car profile and its mods in it, so
// a slow car gets slow police. What is *not* in that number is damage and
// shredded tyres: both are applied to the player's own cap and neither reaches
// the police, so those rows are where the invariant actually goes.
//
// Exit status covers the clean car only. That case is settled and is currently
// true, so breaking it should stop a PR. The hurt and shredded rows are
// reported and not asserted, and #170 is why - but read them for what they
// are. Being faster than them stops a pursuit being hopeless; it is not how
// you get away. `seenBy` wants a unit within `SEEN_RANGE` with line of sight,
// so a corner breaks contact at any speed, and `npm run endings -- --damage 1`
// measures a wrecked car escaping about as often as a clean one. A red row
// here means "cannot pull away on a straight", not "cannot escape".
//
// Usage:
//   npm run pace
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});
const { CityWorld, roadHeightAt } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');

const NONE = { left: false, right: false, up: false, down: false, confirm: false, nitro: false };
const pct = (n) => `${Math.round(n * 100)}%`;

/**
 * Put the car on the longest surface road in the city, aimed along it.
 *
 * The default spawn sits on whatever boulevard is nearest downtown, which was
 * a safe stand-in for "an empty straight" while the street grid gave every
 * neighbourhood long axis-aligned arterials. On this branch's authored map
 * (ADR-0009) the only surface roads are the routed boulevards, and the spawn
 * can land within sight of a bend - the reference car went off-road at 78% of
 * its top speed, 3.9 s in, and that peak (not the road) is what a straight
 * throttle test then reported. A `CityRoad` is a single straight segment by
 * construction (#115), so the longest one is a real straight of that length,
 * not an assumption about where the car happens to start.
 *
 * Dirt is excluded for the same reason bridges and ramps are: `DIRT_SPEED_FRAC`
 * caps a car at 85% of its top speed by design (#294), so once the airfield and
 * the quarry access road (#295) gave the network its two longest straights,
 * both dirt, this measured the surface instead of the car - a clean run read
 * as CAUGHT at heat 3 through 6 with nothing wrong underneath it.
 *
 * A repair shop within reach is excluded too: `CityWorld.repairs` zeroes
 * damage every step a car sits in range of one (#95), which made the damaged
 * rows measure a shop instead of the car the moment the longest clean straight
 * happened to run past one.
 *
 * Started a few metres past the near end rather than at the midpoint, so the
 * whole length is ahead of the car rather than half of it.
 */
function placeOnLongestStraight(world) {
  const nearShop = (road) => {
    const a = world.city.nodes[road.a].pos;
    const b = world.city.nodes[road.b].pos;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return world.city.repairs.some((shop) => Math.hypot(shop.at.x - mid.x, shop.at.z - mid.z) < K.REPAIR_RANGE * 4);
  };
  let best = null;
  for (const road of world.city.roads) {
    if (road.bridge || road.class === 'interstate' || road.class === 'ramp') continue;
    if (road.surface !== 'asphalt') continue;
    if (!best || road.length > best.length) {
      if (nearShop(road)) continue;
      best = road;
    }
  }
  if (!best) return;
  const a = world.city.nodes[best.a].pos;
  const b = world.city.nodes[best.b].pos;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const along = Math.min(5 * K.UNITS_PER_METRE, best.length * 0.1);
  world.x = a.x + (dx / best.length) * along;
  world.z = a.z + (dz / best.length) * along;
  world.y = roadHeightAt(world.city, best, world.x, world.z);
  world.heading = Math.atan2(dx, dz);
  world.onRoad = best;
}

/**
 * The player's real top speed in a given condition, as a fraction of the
 * reference car's.
 *
 * Measured rather than derived: the damage and shred caps are applied inline in
 * the drive loop, so reading them off the constants would be reading the
 * intent instead of the behaviour, which is the mistake this tool exists to
 * catch. Traffic and police are off, so nothing gets in the way.
 */
function topSpeed({ damage = 0, shredded = false, nitro = false }) {
  const world = new CityWorld(undefined, { traffic: false, police: false });
  placeOnLongestStraight(world);
  world.damage = damage;
  let best = 0;
  for (let t = 0; t < 120; t += K.STEP) {
    // Re-armed every step: the strip runs out after SHRED_TIME, and this is
    // asking what the car can do *while* on ruined tyres.
    if (shredded) world.shredded = K.SHRED_TIME;
    world.step(K.STEP, { ...NONE, up: true, nitro });
    best = Math.max(best, world.speed);
  }
  return best / K.REFERENCE_TOP_SPEED;
}

const conditions = [
  { name: 'clean', asserted: true, at: {} },
  { name: 'clean + nitrous', asserted: true, at: { nitro: true } },
  { name: 'half damaged', asserted: false, at: { damage: 0.5 } },
  { name: 'wrecked', asserted: false, at: { damage: 1 } },
  { name: 'wrecked + nitrous', asserted: false, at: { damage: 1, nitro: true } },
  { name: 'shredded', asserted: false, at: { shredded: true } },
];

/** The quickest unit that turns up at a level, and what it does. */
function fastestAt(level) {
  let best = null;
  for (const kind of level.units) {
    const speed = level.speed * K.COP_UNITS[kind].pace;
    if (!best || speed > best.speed) best = { kind, speed };
  }
  return best;
}

console.log('PACE CHECK');
console.log('the fastest car they send at each heat level, against yours\n');

const fastest = K.HEAT_LEVELS.map(fastestAt);
const head = ['condition', 'your top', ...fastest.map((_, i) => `heat ${i + 1}`)];
const rows = [head, ['', '', ...fastest.map((f) => f.kind)], ['', '', ...fastest.map((f) => pct(f.speed))]];

let broken = 0;
const measured = [];
for (const condition of conditions) {
  const mine = topSpeed(condition.at);
  measured.push({ ...condition, mine });
  const cells = fastest.map((f) => {
    const clear = mine > f.speed;
    if (!clear && condition.asserted) broken++;
    return clear ? `+${Math.round((mine - f.speed) * 100)}` : `CAUGHT`;
  });
  rows.push([condition.name, pct(mine), ...cells]);
}

const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
rows.forEach((row, i) => {
  console.log(
    '  ' + row.map((cell, j) => (j === 0 ? cell.padEnd(widths[j]) : cell.padStart(widths[j]))).join('   '),
  );
  if (i === 2) console.log('  ' + widths.map((w) => '-'.repeat(w)).join('   '));
});

console.log('\n  a number is how many points of top speed you have in hand.');
console.log('  CAUGHT means they are faster than you and speed alone will not do it.\n');

const wrecked = measured.find((m) => m.name === 'wrecked');
const slowest = Math.min(...fastest.map((f) => f.speed));
if (wrecked.mine < slowest) {
  console.log(`note: a wrecked car does ${pct(wrecked.mine)} and the slowest unit in the game does`);
  console.log(`      ${pct(slowest)}, so damage cannot be pulled away from on a straight.`);
  console.log('      It can still be escaped: contact breaks on line of sight, not on');
  console.log('      speed, and `npm run endings -- --damage 1` measures a wrecked car');
  console.log('      getting away about as often as a clean one. #170 is the question of');
  console.log('      whether that is the design, and it is a decision rather than a bug.\n');
}

if (broken) {
  console.log(`PACE CHECK FAILED: ${broken} level(s) out of reach in an undamaged car.`);
  console.log('A pursuit that cannot be outrun on speed alone is a pursuit with no answer.');
} else {
  console.log('pace check passed: every level is outrunnable in an undamaged car.');
}

await server.close();
process.exit(broken ? 1 : 0);
