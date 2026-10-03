// Frame time per look switch (#579, part of #11).
//
// There was no frame-time tool before this, and every phase of the look costs
// something per frame, so each one needs a number beside its picture. For each
// shot and each switch set it loads the page, stands the car at the shot, lets
// the first frames compile, then averages the gaps between animation frames.
//
// Read it as a ratio, not as a frame rate. Headless Chromium draws on the CPU
// (SwiftShader), so the absolute milliseconds say nothing about a player's GPU;
// what carries over is how much one switch adds to the baseline in the same
// run. A report: it asserts nothing.
//
// Usage:
//   npm run looktime                                   # every shot, switches off
//   npm run looktime -- --look 'none;grade;all'        # ';'-separated switch sets
//   npm run looktime -- --shot downtown --frames 60
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { SHOTS, place } from './lookshots.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const only = flag('--shot');
const shots = only ? SHOTS.filter((s) => s.name === only) : SHOTS;
if (shots.length === 0) throw new Error(`no shot "${only}": ${SHOTS.map((s) => s.name).join(', ')}`);
const looks = (flag('--look') ?? 'none;all').split(';').map((v) => v.trim()).filter(Boolean);
const FRAMES = Number(flag('--frames') ?? 40);

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = `http://localhost:${server.config.server.port ?? server.httpServer?.address()?.port}`;
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (err) => console.error(`  page error: ${err.message}`));

const table = [];
for (const shot of shots) {
  const row = { shot: shot.name };
  for (const look of looks) {
    await page.goto(`${base}/${look === 'none' ? '' : `?look=${look}`}`, { waitUntil: 'load' });
    await page.waitForSelector('#game3d', { timeout: 20000 });
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', undefined, { timeout: 60000 });
    await page.evaluate(place, shot);
    const ms = await page.evaluate(
      (frames) =>
        new Promise((resolve) => {
          let n = 0;
          let start = 0;
          const tick = (now) => {
            // The first few frames pay for shader compiles and uploads.
            if (n === 5) start = now;
            if (n === 5 + frames) return resolve((now - start) / frames);
            n++;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      FRAMES,
    );
    row[look] = ms;
  }
  table.push(row);
}

const w = Math.max(12, ...looks.map((l) => l.length + 2));
const pad = (s, n) => String(s).padStart(n);
console.log(`ms per frame (SwiftShader, 640x400, ${FRAMES} frames; compare columns, not absolutes)`);
console.log(`${'shot'.padEnd(12)}${looks.map((l) => pad(l, w)).join('')}${looks.length > 1 ? pad('last/first', w) : ''}`);
for (const row of table) {
  const cols = looks.map((l) => pad(row[l].toFixed(1), w)).join('');
  const ratio = looks.length > 1 ? pad(`x${(row[looks.at(-1)] / row[looks[0]]).toFixed(2)}`, w) : '';
  console.log(`${row.shot.padEnd(12)}${cols}${ratio}`);
}
await browser.close();
await server.close();
