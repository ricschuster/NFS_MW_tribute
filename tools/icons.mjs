// Generate the app icons for the PWA (#98).
//
// Drawn rather than stored: the mark is a few shapes, and a script that emits
// it is smaller than the PNGs, reviewable in a diff, and re-runnable at any
// size the day a platform wants a new one.
//
// It renders through the headless Chromium that `npm run shot` already needs,
// so this adds no dependency. The output is committed, because a build should
// not need a browser.
//
// Usage: npm run icons
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'public';
mkdirSync(OUT, { recursive: true });

/**
 * The mark: a road running away between two blocks, with the lane dashes on
 * it. Original, and the same red the player's car is.
 *
 * `pad` is the safe-area inset a maskable icon needs - Android crops one to
 * whatever shape the launcher uses, so everything that has to survive has to
 * sit inside the middle 80%.
 */
const mark = (size, pad, round) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${round}" fill="#12161d"/>
  <g transform="translate(50 50) scale(${1 - pad * 2}) translate(-50 -50)">
    <path d="M50 8 L86 92 L64 92 L50 52 L36 92 L14 92 Z" fill="#3a4250"/>
    <path d="M50 14 L80 92 L68 92 L50 44 L32 92 L20 92 Z" fill="#5a6472"/>
    <g fill="#f2f4f7">
      <rect x="47.5" y="30" width="5" height="12" rx="1.5"/>
      <rect x="47" y="50" width="6" height="14" rx="1.5"/>
      <rect x="46.5" y="72" width="7" height="16" rx="1.5"/>
    </g>
    <path d="M50 4 L62 26 L38 26 Z" fill="#e8462b"/>
  </g>
</svg>`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();

for (const [name, size, pad, round] of [
  // The radius is in viewBox units, not pixels: the same number at both sizes,
  // or the big one comes out a circle.
  ['icon-192.png', 192, 0.04, 20],
  ['icon-512.png', 512, 0.04, 20],
  // Maskable: no rounding of our own (the launcher does that) and a wide safe
  // area, so a circular crop does not take the top off the chevron.
  ['icon-maskable-512.png', 512, 0.14, 0],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}</style>${mark(size, pad, round)}`,
  );
  await page.locator('svg').screenshot({ path: `${OUT}/${name}`, omitBackground: false });
  console.log(`wrote ${OUT}/${name}`);
}

await browser.close();
