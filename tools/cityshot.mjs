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

const VIEWS = flag('--view') ? [flag('--view')] : ['aerial', 'downtown', 'bridge', 'street', 'overpass', 'drive', 'pursuit', 'crash'];

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
  const url =
    view === 'drive' || view === 'pursuit' || view === 'crash'
      ? `${base}/?renderer=drive`
      : `${base}/?renderer=city&view=${view}`;
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
  const shot = view === 'drive' || view === 'pursuit' || view === 'crash' ? '.stage' : '#game3d';
  await page.locator(shot).screenshot({ path: `${OUT}/city-${view}.png` });
  if (view === 'drive' || view === 'pursuit' || view === 'crash') {
    await page.keyboard.up('ArrowUp');
    if (view === 'pursuit') await page.keyboard.up('b');
  }
  console.log(`captured ${OUT}/city-${view}.png`);
}

await browser.close();
await server.close();
