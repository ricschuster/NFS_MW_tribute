// Check the built site really installs and really plays offline (#98).
//
// A PWA is one of those things that is either true or a promise nobody
// checked: the manifest can be valid, the worker can register, and the game
// can still fail the moment the network goes because one file was never
// precached. This serves `dist/`, loads it, waits for the worker to take
// control, cuts the network off and reloads.
//
// Usage: npm run pwa   (after npm run build)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join('dist', normalize(path === '/' ? '/index.html' : path));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((done) => server.listen(0, done));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const context = await browser.newContext();
const page = await context.newPage();

let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed = true;
};

await page.goto(base, { waitUntil: 'load' });

const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  const res = await fetch(link.getAttribute('href'));
  return res.ok ? res.json() : null;
});
check('manifest loads', manifest !== null);
if (manifest) {
  check('has a name', typeof manifest.name === 'string' && manifest.name.length > 0, manifest.name);
  check('opens in its own window', manifest.display === 'standalone', manifest.display);
  check('has a start url', typeof manifest.start_url === 'string', manifest.start_url);
  check('has a 512 icon', manifest.icons?.some((i) => i.sizes === '512x512'));
  check('has a maskable icon', manifest.icons?.some((i) => i.purpose === 'maskable'));

  for (const icon of manifest.icons ?? []) {
    const ok = await page.evaluate(
      (src) => fetch(src).then((r) => r.ok),
      new URL(icon.src, base + '/').toString(),
    );
    check(`icon ${icon.src} exists`, ok);
  }
}

// The worker has to take control, not merely register: a registration that
// never activates caches nothing.
const controlled = await page
  .waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check('service worker takes control', controlled);

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  if (names.length === 0) return 0;
  const cache = await caches.open(names[0]);
  return (await cache.keys()).length;
});
check('precached the build', cached > 5, `${cached} entries`);

// The real test: no network at all.
await context.setOffline(true);
await page.reload({ waitUntil: 'load' });
const alive = await page.evaluate(
  () => document.querySelector('canvas#game') !== null && document.title.length > 0,
);
check('loads with the network off', alive);

// `/` is Kestrel Bay now (#165), so the reload above already asks for the
// biggest chunk. What is still worth its own check is a navigation with a
// query string on it - `?renderer=city`, a URL the README hands out - because
// that is not the same cache entry as `./` and is the case that breaks.
await page.goto(`${base}/?renderer=city`, { waitUntil: 'load' }).catch(() => {});
const city = await page
  .waitForSelector('#game3d', { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
check('draws Kestrel Bay with the network off', city);

await browser.close();
server.close();
console.log(failed ? '\nPWA check failed' : '\nPWA check passed');
process.exit(failed ? 1 : 0);
