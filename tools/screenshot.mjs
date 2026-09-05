// Visual verification: drive the game in a headless browser and screenshot the
// canvas at a few states, so a change to the rendering can actually be eyeballed.
//
// Usage:
//   npm run dev              # in one terminal (serves the game)
//   npm run shot             # in another; writes PNGs to ./screenshots/
//
// Requires the Chromium browser once:  npx playwright install chromium
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.SHOT_URL ?? 'http://localhost:5173/';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });

/** Run `scenario` on a fresh page, then screenshot the canvas to OUT/<name>.png. */
async function capture(name, scenario) {
  const page = await browser.newPage({ viewport: { width: 1120, height: 760 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const tap = async (key) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(140);
    await page.keyboard.up(key);
  };
  await scenario(page, tap);
  await page.locator('#game').screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
  console.log(`captured ${OUT}/${name}.png`);
}

await capture('title', async () => {});

await capture('drive', async (page, tap) => {
  await tap('Enter');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2600);
});

await capture('pursuit', async (page, tap) => {
  await tap('Enter');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2000);
  await page.keyboard.up('ArrowUp'); // ease off so a cop closes into the mirror
  await page.waitForTimeout(2200);
});

await capture('countdown', async (page, tap) => {
  await tap('Enter'); // start playing
  await page.waitForTimeout(200);
  await tap('Enter'); // start a race immediately
  await page.waitForTimeout(500);
});

await capture('race', async (page, tap) => {
  await tap('Enter');
  await page.waitForTimeout(200);
  await tap('Enter');
  await page.waitForTimeout(3200); // let the 3-2-1 finish
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2200);
});

await browser.close();
console.log('done');
