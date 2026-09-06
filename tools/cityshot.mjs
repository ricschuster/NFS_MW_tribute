// City shots: screenshot generated Kestrel Bay from a few fixed viewpoints, so
// a change to the geometry can be looked at instead of argued about.
//
// `npm run city` draws the layout from above and answers "is the map shaped
// right". This answers "does it look like a city", which is a different
// question and the one #84 is about.
//
// Unlike `npm run shot`, this starts its own dev server, so there is nothing to
// run in another terminal.
//
// Usage:
//   npm run cityshot                      # all viewpoints -> screenshots/city-*.png
//   npm run cityshot -- --view downtown   # just one
//
// `drive`, `pursuit`, `crash` and `takedown` are not viewpoints but modes: they
// put a car in the city and photograph what the player would be looking at.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const DRIVING = new Set([
  'drive', 'pursuit', 'crash', 'takedown', 'roadblock', 'enforcer', 'spikes',
  'helicopter', 'billboard', 'collection', 'streetfind', 'race',
]);
const VIEWS = flag('--view')
  ? [flag('--view')]
  : [
      'aerial', 'downtown', 'bridge', 'street', 'overpass',
      'drive', 'pursuit', 'crash', 'takedown', 'roadblock', 'enforcer', 'spikes',
      'helicopter', 'billboard', 'collection', 'streetfind', 'race',
    ];

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();

// What the scene actually costs, since "will it hold 60fps" is a question about
// draw calls and triangles rather than about how big the city looks.
{
  const { kestrelBay } = await server.ssrLoadModule('/src/game/city/index.ts');
  const city = kestrelBay();
  const kinds = new Set(city.buildings.map((b) => b.kind)).size;
  const tris = city.buildings.length * 12 + city.blocks.length * 12 + city.roads.filter((r) => r.bridge).length * 12;
  console.log(
    `scene: ${city.buildings.length} buildings in ${kinds} instanced meshes, ` +
      `${city.blocks.length} pavements, ~${(tris / 1000).toFixed(0)}k triangles before markings`,
  );
  const furniture = {};
  for (const prop of city.furniture) furniture[prop.kind] = (furniture[prop.kind] ?? 0) + 1;
  console.log(
    `furniture: ${Object.entries(furniture).map(([k, n]) => `${n} ${k}s`).join(', ')} ` +
      `(5 instanced meshes)`,
  );
  console.log(`draw calls: about ${kinds + 11} (sea, ground, 2 water, pavements, markings, bridges, buildings, furniture)`);
}
const port = server.config.server.port ?? server.httpServer?.address()?.port;
const base = `http://localhost:${port}`;

// Headless Chromium has no GPU, so WebGL has to come from SwiftShader. Without
// these the page loads, the canvas stays black, and nothing says why.
const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (err) => console.error(`  page error: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error(`  console: ${msg.text()}`);
});

for (const view of VIEWS) {
  // `drive` is not a viewpoint but a mode: put a car in the city, hold the
  // throttle for a moment, and photograph what the player would be looking at.
  const url = DRIVING.has(view) ? `${base}/?renderer=drive` : `${base}/?renderer=city&view=${view}`;
  await page.goto(url, { waitUntil: 'load' });
  // Generating the city and building its instanced meshes takes a moment, and
  // a screenshot taken before that is a picture of an empty sky.
  await page.waitForSelector('#game3d', { timeout: 20000 });
  await page.waitForTimeout(2500);

  if (view === 'drive') {
    // Long enough for traffic to reach the street the car is on: it spawns out
    // of sight, so a shot taken immediately is of an empty city.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(7000);
  }

  if (view === 'crash') {
    // Held into a turn, the car reaches a building within a few seconds. The
    // shot is taken straight after, while the crash camera is still running.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(6500);
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(400);
  }

  if (view === 'takedown') {
    // Driving into a cop hard enough to wreck one is a matter of luck, and a
    // shot that depends on luck cannot be compared between runs. The dev-only
    // handle on the sim sets the contact up exactly instead: a cruiser coming
    // the other way, met head on in its own lane at 60% of top speed.
    //
    // The two `step` calls are the point. Headless Chromium renders this scene
    // at a couple of frames a second, so a frame is fifteen physics steps and
    // the cars pass through each other between the ones that matter. Stepping
    // the sim by hand makes the ram exactly the one the playtests assert on.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowUp');
    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const none = { up: false, down: false, left: false, right: false, nitro: false, confirm: false };
      const metre = 135; // UNITS_PER_METRE; the sim does not export it to the page
      const road = world.onRoad;
      const a = world.city.nodes[road.a].pos;
      const b = world.city.nodes[road.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = Math.max(1, dx * dx + dz * dz);
      const px = world.x + Math.sin(world.heading) * 25 * metre;
      const pz = world.z + Math.cos(world.heading) * 25 * metre;
      const along = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
      // Facing back down the road, so it closes rather than driving away.
      const forward = Math.sin(world.heading) * dx + Math.cos(world.heading) * dz < 0;
      world.police.cops.push({
        road,
        t: forward ? along : 1 - along,
        forward,
        speed: 0,
        damage: 0,
        x: px,
        z: pz,
        y: world.y,
        heading: world.heading + Math.PI,
        kind: 'cruiser',
      });

      // One step for the pursuit to settle the cop into its own lane, then
      // stand in that lane in front of it. Lining up on the line between the
      // two cars is not the same thing: a cop sits a lane off the centreline,
      // so it would arrive at an angle and only shunt.
      world.step(1 / 60, none);
      const cop = world.police.cops[0];
      if (!cop) return;
      world.x = cop.x + Math.sin(cop.heading) * 4 * metre;
      world.z = cop.z + Math.cos(cop.heading) * 4 * metre;
      world.y = cop.y;
      world.heading = cop.heading + Math.PI;
      world.speed = world.maxSpeed * 0.6;
      world.step(1 / 60, none);
    });
    // Inside the cut, which runs on the director's own clock.
    await page.waitForTimeout(1200);
  }

  if (view === 'roadblock') {
    // Drive first, so the car is out on a street with the chase camera settled
    // behind it - the director runs on real seconds and headless renders at a
    // couple of frames a second, so an earlier version of this shot was a
    // picture of the opening orbit with the barrier out of frame.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(7000);
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });

    // The barrier is authored rather than placed by the pursuit, and that is
    // the honest trade: where one goes is asserted on in the playtests, and
    // what this picture is for is whether it reads as a wall with a way
    // through it from the driver's seat. Same shape, same renderer, same HUD.
    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const metre = 135;
      const at = 25 * metre;
      const x = world.x + Math.sin(world.heading) * at;
      const z = world.z + Math.cos(world.heading) * at;
      // Across the way the car is pointing.
      const ax = Math.cos(world.heading);
      const az = -Math.sin(world.heading);
      const half = 10 * metre;
      const slot = 650 * 1.9;
      const gap = half * 0.45;

      const cars = [];
      const slots = Math.max(2, Math.round((half * 2) / slot));
      for (let i = 0; i < slots; i++) {
        const offset = -half + ((half * 2) / slots) * (i + 0.5);
        if (Math.abs(offset - gap) < 3.8 * metre) continue;
        cars.push({
          x: x + ax * offset,
          z: z + az * offset,
          y: world.y,
          heading: Math.atan2(ax, az),
          kind: 'state',
        });
      }
      // A pursuit has to be running or the block is swept up on the next
      // step: the police do not leave cruisers parked across a road they have
      // stopped chasing anyone on.
      world.police.state = 'pursuit';
      world.police.roadblocks.push({ road: world.onRoad, x, z, y: world.y, ax, az, half, gap, cars });
      world.police.heat = 0.6;
      world.speed = 0;
      world.crashFlash = 0;
    });
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
  }

  if (view === 'enforcer') {
    // Same shape as the roadblock shot: drive out onto a street, wait for the
    // chase camera, then put the thing being photographed in front of the car.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(7000);
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });

    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const metre = 135;
      world.police.state = 'pursuit';
      world.police.heat = 0.7;
      // The scripted drive is timed off the wall clock, so it does not always
      // end in the same place: sometimes it ends against a building, and then
      // the crash camera would be what is running when the shutter opens.
      world.crashFlash = 0;

      // On the graph, not just at a position. The pursuit re-derives every
      // cop's place from its road and how far along it each step, so a cop
      // pushed in with a position and `t: 0.5` is silently teleported to the
      // middle of that road on the very next one.
      const road = world.onRoad;
      const a = world.city.nodes[road.a].pos;
      const b = world.city.nodes[road.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = Math.max(1, dx * dx + dz * dz);
      // Well back, because it closes at about 90 m of simulated time a second
      // and the shot is taken a frame or two later.
      const px = world.x + Math.sin(world.heading) * 70 * metre;
      const pz = world.z + Math.cos(world.heading) * 70 * metre;
      const along = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
      // Facing back down the road at the car: head on is the whole point of it.
      const forward = Math.sin(world.heading) * dx + Math.cos(world.heading) * dz < 0;

      world.police.cops.push({
        road,
        t: forward ? along : 1 - along,
        forward,
        speed: 0,
        damage: 0,
        x: px,
        z: pz,
        y: world.y,
        heading: world.heading + Math.PI,
        kind: 'enforcer',
        role: 'enforcer',
      });
      world.speed = 0;
    });
    await page.waitForTimeout(600);
  }


  if (view === 'spikes') {
    // Drive out, wait for the chase camera, then lay a strip in front of the
    // car with the sliver of clean road it always leaves.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(7000);
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });

    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const metre = 135;
      // Far enough out that the car in the foreground is not standing on it.
      const at = 40 * metre;
      const half = world.onRoad.width / 2;
      world.police.state = 'pursuit';
      world.police.heat = 0.75;
      world.crashFlash = 0;
      world.police.spikes.push({
        road: world.onRoad,
        x: world.x + Math.sin(world.heading) * at,
        z: world.z + Math.cos(world.heading) * at,
        y: world.y,
        ax: Math.cos(world.heading),
        az: -Math.sin(world.heading),
        from: -half,
        to: half * 0.4,
      });
      // And the cost, in the same frame: one strip ahead and the clock from
      // one already run over. Not a state the game puts you in on its own, but
      // it puts both halves of the mechanic in one picture.
      world.shredded = 5;
      world.speed = 0;
    });
    await page.waitForTimeout(1200);
  }

  if (view === 'helicopter') {
    // Drive out, wait for the chase camera, then put an aircraft on station
    // overhead with its light on. What it does is invisible, so the picture is
    // of the pool of light and the warning that goes with it.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(7000);
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });

    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const metre = 135;
      world.police.state = 'pursuit';
      world.police.heat = 0.9;
      world.crashFlash = 0;
      world.police.helicopter = {
        // Well up the street and off to one side. The chase camera looks
        // roughly level, so an aircraft directly overhead is above the frame:
        // it has to be far enough ahead to be inside the field of view.
        // Where it flies anyway: out in front, low, over the street. Its
        // height is not ours to set - the pursuit puts it back at
        // `HELI_HEIGHT` on the very next step.
        x: world.x + Math.sin(world.heading) * 120 * metre,
        z: world.z + Math.cos(world.heading) * 120 * metre,
        y: world.y + 28 * metre,
        heading: world.heading,
        onStation: 80,
        spotting: true,
      };
      world.speed = 0;
    });
    await page.waitForTimeout(1400);
  }

  if (view === 'billboard' || view === 'collection') {
    // Stand the car in front of a billboard it has not had yet. Waiting for a
    // scripted drive to find one of ninety is waiting a long time.
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });
    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const metre = 135;
      const board = world.collectibles.billboards.find((b) => !world.collectibles.smashed.has(b.id));
      if (!board) return;
      // Back from it, facing it: `angle` is the way the board faces, so the
      // car stands out along that and looks the other way.
      world.x = board.at.x + Math.sin(board.angle) * 26 * metre;
      world.z = board.at.z + Math.cos(board.angle) * 26 * metre;
      world.y = board.y;
      world.heading = board.angle + Math.PI;
      world.speed = 0;
      world.crashFlash = 0;
      world.rep.total = 18400;
      // Some of the collection already found, so the map has both states in it.
      const some = world.collectibles.billboards.slice(1, 34).map((b) => b.id);
      world.collectibles.load(some, world.collectibles.cameras.slice(0, 9).map((c) => [c.id, 0.8]));
    });
    await page.waitForTimeout(1200);
    if (view === 'collection') {
      await page.keyboard.down('Tab');
      await page.waitForTimeout(900);
    }
  }

  if (view === 'streetfind') {
    // Stand off a parked car, looking at it. Finding one of seven by driving
    // is the player's job, not the screenshot's.
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });
    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const metre = 135;
      const find = world.finds.waiting[3];
      if (!find) return;
      world.x = find.at.x + 22 * metre;
      world.z = find.at.z + 22 * metre;
      world.y = find.y;
      world.heading = Math.atan2(find.at.x - world.x, find.at.z - world.z);
      world.speed = 0;
      world.crashFlash = 0;
      world.rep.total = 22600;
    });
    // Long enough for the chase camera to catch up with the teleport: it eases
    // rather than cutting, and headless gives it about two frames a second.
    await page.waitForTimeout(2600);
  }

  if (view === 'race') {
    // Start a circuit and run a few seconds of it, so the shot has the lap
    // counter, the position, the arrow, the gate and the rival in it.
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', {
      timeout: 60000,
    });
    await page.evaluate(() => {
      const { world } = globalThis.crosstown;
      const route = world.city.routes[0];
      world.x = route.start.x;
      world.z = route.start.z;
      world.y = 0;
      world.crashFlash = 0;
      world.rep.total = 31200;
      // The countdown is stepped through by hand: at two frames a second the
      // three seconds of lights would take most of a minute of real time.
      const none = { up: false, down: false, left: false, right: false, nitro: false, confirm: false };
      world.step(1 / 60, { ...none, confirm: true });
      for (let t = 0; t < 3.2; t += 1 / 60) world.step(1 / 60, none);
      // Then a little way round the lap, so the arrow has somewhere to point.
      world.heading = Math.atan2(
        route.checkpoints[0].x - world.x,
        route.checkpoints[0].z - world.z,
      );
      world.speed = world.maxSpeed * 0.45;
    });
    // Long enough to be up among the field rather than last off the line: the
    // shot is of a race, and a race is cars around you.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(4000);
    await page.keyboard.up('Shift');
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(400);
  }

  if (view === 'pursuit') {
    // Long enough for the cops to arrive, driving a loop so the car stays in
    // the middle of the city rather than parking against the coast.
    for (let i = 0; i < 16; i++) {
      await page.keyboard.down('ArrowUp');
      await page.keyboard.down(i % 2 ? 'ArrowRight' : 'ArrowLeft');
      await page.waitForTimeout(1600);
      await page.keyboard.up(i % 2 ? 'ArrowRight' : 'ArrowLeft');
    }
    // Then glance behind, which is the only way to photograph something that
    // is by definition behind you.
    await page.keyboard.down('b');
    await page.waitForTimeout(600);
  }

  const blank = await page.evaluate(() => {
    const canvas = document.getElementById('game3d');
    return !canvas || canvas.width === 0;
  });
  if (blank) console.error(`  ${view}: no canvas`);

  // The HUD is a separate canvas over the world, so a shot of the WebGL canvas
  // alone is a shot with no HUD in it. Capture the stage for the driving views.
  const shot = DRIVING.has(view) ? '.stage' : '#game3d';
  await page.locator(shot).screenshot({ path: `${OUT}/city-${view}.png` });
  if (DRIVING.has(view)) {
    if (view === 'collection') await page.keyboard.up('Tab');
    await page.keyboard.up('ArrowUp');
    if (view === 'pursuit') await page.keyboard.up('b');
  }
  console.log(`captured ${OUT}/city-${view}.png`);
}

await browser.close();
await server.close();
