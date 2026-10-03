// Look-development contact sheet (#579, part of #11).
//
// Renders a fixed set of shots of the city under each requested set of look
// switches (`src/game/scene/look.ts`) and lays them out in one image, with the
// reference game's frame for the same kind of scene beside each row. A phase of
// the look is signed off by attaching this sheet before and after.
//
// The reference frames are third-party, git-ignored and live in `reference/`;
// they are study material for comparison and never go in a commit. A row whose
// frame is missing just has no reference column, so the tool works on a clean
// checkout.
//
// Shots are chosen by rule from the generated city, not by coordinate, so they
// survive the map being edited: the longest downtown street, the street
// with the most trees in Highmoor Park, the densest cluster of silos in Industrial,
// the warehouse wall nearest a road, the longest tunnel, the longest bridge looking
// along it, and the downtown street again
// at dusk. Heading follows the road.
//
// Usage:
//   npm run looksheet                                # today's look -> screenshots/looksheet.png
//   npm run looksheet -- --look 'none;grade;grade,ao'  # one column per ';'-separated switch set ('none' = off)
//   npm run looksheet -- --shot industrial           # one row (downtown, woods, industrial, wall, tunnel, haze, dusk)
//   npm run looksheet -- --out screenshots/before.png
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { SHOTS, place } from './lookshots.mjs';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const only = flag('--shot');
const shots = only ? SHOTS.filter((s) => s.name === only) : SHOTS;
if (shots.length === 0) throw new Error(`no shot "${only}": ${SHOTS.map((s) => s.name).join(', ')}`);
const columns = (flag('--look') ?? 'none').split(';').flatMap((v) => v.split(/\s+/)).filter(Boolean);
const OUT = flag('--out') ?? 'screenshots/looksheet.png';
mkdirSync('screenshots', { recursive: true });

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = `http://localhost:${server.config.server.port ?? server.httpServer?.address()?.port}`;
const browser = await chromium.launch({
  // The GPU by default (a shot takes seconds, not two minutes); LOOK_GL=software
  // falls back to SwiftShader on a machine with no usable GPU.
  args:
    process.env.LOOK_GL === 'software'
      ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
      : ['--no-sandbox', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.setDefaultNavigationTimeout(120000);
page.on('pageerror', (err) => console.error(`  page error: ${err.message}`));

const png = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const cells = [];
for (const shot of shots) {
  const row = { shot, refs: null, frames: [] };
  const ref = `reference/${shot.ref}`;
  if (existsSync(ref)) row.refs = `data:image/jpeg;base64,${readFileSync(ref).toString('base64')}`;
  for (const look of columns) {
    await page.goto(`${base}/${look === 'none' ? '' : `?look=${look}`}`, { waitUntil: 'load' });
    await page.waitForSelector('#game3d', { timeout: 20000 });
    await page.waitForFunction(() => globalThis.crosstown?.view?.director?.mode === 'chase', undefined, { timeout: 60000 });
    await page.evaluate(place, shot);
    await page.waitForTimeout(2600);
    row.frames.push({ look, img: png(await page.locator('.stage').screenshot({ timeout: 120000 })) });
    console.log(`  ${shot.name} / ${look}`);
  }
  cells.push(row);
}

const html = `<!doctype html><meta charset=utf-8><style>
body{margin:0;background:#111;color:#ddd;font:14px system-ui}
.row{display:flex;gap:6px;margin:6px}.cell{width:512px}.cell img{width:512px;display:block}
.cap{padding:2px 6px;font-size:12px;color:#9ab}
</style>${cells
  .map(
    (r) => `<div class=row>${
      r.refs ? `<div class=cell><img src="${r.refs}"><div class=cap>${r.shot.name}: reference</div></div>` : ''
    }${r.frames
      .map((f) => `<div class=cell><img src="${f.img}"><div class=cap>${r.shot.name}: look=${f.look}</div></div>`)
      .join('')}</div>`,
  )
  .join('')}`;
// The game page keeps rendering on the CPU (SwiftShader) until closed, and
// starves the sheet's own screenshot.
await page.close();
const width = 6 + (columns.length + (cells.some((r) => r.refs) ? 1 : 0)) * 518;
const sheet = await browser.newPage({ viewport: { width, height: 400 } });
await sheet.setContent(html);
await sheet.waitForLoadState('load');
await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
await sheet.screenshot({ path: OUT, fullPage: true, timeout: 120000 });
console.log(`wrote ${OUT}`);
await browser.close();
await server.close();
