// Does the district plan still fit the ground it was traced on?
//
// #272 is the plan for Kestrel Bay as data: district polygons and named places,
// drawn by hand over the generated relief at seed 0x4b657374. A plan traced on
// one landscape is only a plan for as long as that landscape holds still, and
// the generator moves under it every time the water or the terrain changes.
// This re-measures it, so "the plan still fits" is a number rather than a
// memory.
//
// It reproduces #271's audit table - area, how much of it is land, mean height,
// and how much is too steep for a street - and draws the plan over the map so
// the two can be looked at together.
//
// Usage:
//   npm run plan                 # the table
//   npm run plan -- --draw       # and screenshots/plan.png
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const draw = args.includes('--draw');

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { makeTerrain, groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const constants = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_SEED, CITY_WIDTH, CITY_DEPTH, UNITS_PER_METRE } = constants;

const bounds = {
  minX: -CITY_WIDTH / 2,
  minZ: -CITY_DEPTH / 2,
  maxX: CITY_WIDTH / 2,
  maxZ: CITY_DEPTH / 2,
};
const water = makeWater(new Rng(CITY_SEED), bounds);
const terrain = makeTerrain(CITY_SEED, bounds, water);
await server.close();

// The plan, verbatim from #272. World metres.
const PLAN = {
  downtown: [
    [[125,-2500],[-124,-1899],[-1100,-1525],[-1125,-2025],[-1825,-2875],[-1100,-2725],[-550,-2775],[-124,-3101]],
  ],
  midtown: [
    [[1250,-2100],[1089,-1711],[700,-1550],[311,-1711],[-75,-1875],[125,-2450],[700,-2650],[1150,-2700]],
    [[-275,-1775],[-1175,-1500],[-1450,-875],[-1225,50],[-1200,750],[-975,775],[-825,125],[-775,-750],[-200,-1525]],
    [[1150,3150],[575,3350],[0,3325],[-375,2975],[-675,2200],[-875,1475],[-675,1375],[-350,1950],[50,2650],[400,2700],[950,2625],[1325,2550]],
  ],
  waterfront: [
    [[-2325,1575],[-1900,2675],[-3250,2675],[-4050,2250],[-4475,1650],[-4275,600],[-3225,525],[-2000,825]],
  ],
  industrial: [
    [[2525,-2500],[2800,-1750],[1875,-1750],[1400,-1900],[1225,-2500],[1150,-2825],[1875,-3150],[2335,-2960]],
  ],
  park: [
    [[-1600,-1050],[-1325,-1900],[-1375,-2250],[-1800,-2750],[-2050,-2900],[-2175,-2675],[-1950,-1550]],
    [[1700,-3225],[1250,-3325],[625,-3225],[150,-3125],[-75,-3050],[150,-2500],[1000,-2800]],
    [[1275,475],[1600,-275],[1100,-725],[450,-225],[950,550]],
  ],
};

// The places, from #272's table. A point and what it is; the geometry is #271's
// to build.
const PLACES = {
  docks: [-1634, -1955],
  airfield: [-1269, 2012],
  quarry: [-2704, -812],
  lookout: [1250, -250],
};
const RUNWAY = [[-1571, 971], [-719, 3080]];

const m = (v) => v * UNITS_PER_METRE;
const toM = (v) => v / UNITS_PER_METRE;

function inside(poly, x, z) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/** The steepest slope at a point, from the height field either side of it. */
function grade(x, z) {
  const h = m(25);
  const dx = (groundAt(terrain, x + h, z) - groundAt(terrain, x - h, z)) / (2 * h);
  const dz = (groundAt(terrain, x, z + h) - groundAt(terrain, x, z - h)) / (2 * h);
  return Math.hypot(dx, dz);
}

const STREET_CAP = 0.1; // ADR-0008 rule 3: streets take 10%.
const SAMPLE = m(25);

/** Measure one polygon, in metres, by sampling its bounding box. */
function measure(poly) {
  const xs = poly.map((p) => m(p[0]));
  const zs = poly.map((p) => m(p[1]));
  const box = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
  const tally = new Map();
  let n = 0, land = 0, sum = 0, steep = 0, peak = -Infinity;
  for (let x = box.minX; x <= box.maxX; x += SAMPLE) {
    for (let z = box.minZ; z <= box.maxZ; z += SAMPLE) {
      if (!inside(poly, toM(x), toM(z))) continue;
      n++;
      if (water.isWater(x, z)) continue;
      land++;
      const b = bodyAt(x, z);
      if (b >= 0) tally.set(b, (tally.get(b) ?? 0) + 1);
      const h = groundAt(terrain, x, z);
      sum += h;
      if (h > peak) peak = h;
      if (grade(x, z) > STREET_CAP) steep++;
    }
  }
  const cell = toM(SAMPLE) ** 2;
  return {
    area: (n * cell) / 1e6,
    land: n ? land / n : 0,
    mean: land ? toM(sum / land) : 0,
    peak: land ? toM(peak) : 0,
    steep: land ? steep / land : 0,
    on: [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id, k]) => `${bodyName.get(id)} ${pct(k / land)}`),
  };
}

// The bodies of land, flood-filled, so "which island is this on" is answered
// from the water rather than assumed. The plan's own table assigns each body a
// purpose, and that only means anything if the polygons land where it says.
const BODY_STEP = m(60);
const bodyCols = Math.ceil((bounds.maxX - bounds.minX) / BODY_STEP) + 1;
const bodyRows = Math.ceil((bounds.maxZ - bounds.minZ) / BODY_STEP) + 1;
const body = new Int16Array(bodyCols * bodyRows).fill(-1);
const bodySize = [];
{
  const dry = new Uint8Array(bodyCols * bodyRows);
  for (let i = 0; i < dry.length; i++) {
    const x = bounds.minX + (i % bodyCols) * BODY_STEP;
    const z = bounds.minZ + Math.floor(i / bodyCols) * BODY_STEP;
    dry[i] = water.isWater(x, z) ? 0 : 1;
  }
  for (let i = 0; i < dry.length; i++) {
    if (!dry[i] || body[i] !== -1) continue;
    const id = bodySize.length;
    let n = 0;
    const queue = [i];
    body[i] = id;
    while (queue.length) {
      const c = queue.pop();
      n++;
      const cx = c % bodyCols;
      const cz = Math.floor(c / bodyCols);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= bodyCols || nz >= bodyRows) continue;
        const k = nz * bodyCols + nx;
        if (!dry[k] || body[k] !== -1) continue;
        body[k] = id;
        queue.push(k);
      }
    }
    bodySize.push((n * toM(BODY_STEP) ** 2) / 1e6);
  }
}
/** Which body of land a point is on, or -1 for water. */
function bodyAt(x, z) {
  const cx = Math.round((x - bounds.minX) / BODY_STEP);
  const cz = Math.round((z - bounds.minZ) / BODY_STEP);
  if (cx < 0 || cz < 0 || cx >= bodyCols || cz >= bodyRows) return -1;
  return body[cz * bodyCols + cx];
}
// Named biggest-first, so "main" is stable across a change to the water.
const byArea = bodySize.map((area, id) => ({ id, area })).sort((a, b) => b.area - a.area);
const bodyName = new Map(byArea.map((b, i) => [b.id, ['main', 'B', 'C', 'D', 'E', 'F', 'G'][i] ?? `#${b.id}`]));

const pct = (v) => `${Math.round(v * 100)}%`;
console.log(`plan vs. ground  ·  seed 0x${CITY_SEED.toString(16)}  ·  ${toM(CITY_WIDTH) / 1000} x ${toM(CITY_DEPTH) / 1000} km\n`);
console.log(`  ${bodySize.length} bodies of land: ${byArea.map((b) => `${bodyName.get(b.id)} ${b.area.toFixed(1)} km²`).join(', ')}\n`);
console.log('  area                 km²   land   mean    peak   steep   on');
for (const [kind, polys] of Object.entries(PLAN)) {
  polys.forEach((poly, i) => {
    const r = measure(poly);
    const name = polys.length > 1 ? `${kind} ${i + 1}` : kind;
    console.log(
      `  ${name.padEnd(18)} ${r.area.toFixed(2).padStart(5)}  ${pct(r.land).padStart(5)}` +
        `  ${Math.round(r.mean).toString().padStart(4)} m  ${Math.round(r.peak).toString().padStart(4)} m` +
        `   ${pct(r.steep).padStart(4)}   ${r.on.join(' + ')}`,
    );
  });
}

console.log('\n  place        on land   height   nearest water   body');
for (const [name, [px, pz]] of Object.entries(PLACES)) {
  const x = m(px);
  const z = m(pz);
  const dry = !water.isWater(x, z);
  let near = Infinity;
  for (let r = SAMPLE; r < m(2000) && near === Infinity; r += SAMPLE) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      if (water.isWater(x + Math.cos(a) * r, z + Math.sin(a) * r)) { near = r; break; }
    }
  }
  console.log(
    `  ${name.padEnd(12)} ${(dry ? 'yes' : 'NO').padStart(6)}   ${Math.round(toM(groundAt(terrain, x, z)))
      .toString()
      .padStart(4)} m   ${(near === Infinity ? '>2000' : String(Math.round(toM(near)))).padStart(9)} m   ${
      bodyAt(x, z) >= 0 ? bodyName.get(bodyAt(x, z)) : '-'
    }`,
  );
}

// Where the plan disagrees with itself, or with the generator.
//
// A hand-traced plan is drawn in one pass over one picture, so two areas can
// end up on the same ground without anyone noticing - and the generator has its
// own idea of where the city is (`water.town`), which nothing in the plan was
// obliged to agree with.
{
  const flat = [];
  for (const [kind, polys] of Object.entries(PLAN)) {
    polys.forEach((poly, i) => flat.push([polys.length > 1 ? `${kind} ${i + 1}` : kind, poly]));
  }
  const clashes = [];
  for (let a = 0; a < flat.length; a++) {
    for (let b = a + 1; b < flat.length; b++) {
      const xs = flat[a][1].map((p) => m(p[0]));
      const zs = flat[a][1].map((p) => m(p[1]));
      let shared = 0;
      let n = 0;
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += SAMPLE) {
        for (let z = Math.min(...zs); z <= Math.max(...zs); z += SAMPLE) {
          if (!inside(flat[a][1], toM(x), toM(z))) continue;
          n++;
          if (inside(flat[b][1], toM(x), toM(z))) shared++;
        }
      }
      if (shared > 0) clashes.push(`${flat[a][0]} and ${flat[b][0]} share ${pct(shared / n)} of the first`);
    }
  }
  for (const [name, [px, pz]] of Object.entries(PLACES)) {
    for (const [label, poly] of flat) {
      if (inside(poly, px, pz)) clashes.push(`the ${name} sit inside ${label}`);
    }
  }
  const downtown = PLAN.downtown[0];
  const cx = m(downtown.reduce((s, p) => s + p[0], 0) / downtown.length);
  const cz = m(downtown.reduce((s, p) => s + p[1], 0) / downtown.length);
  const away = toM(Math.hypot(water.town.x - cx, water.town.z - cz));
  console.log('\n  where the plan and the generator disagree');
  for (const c of clashes) console.log(`  · ${c}`);
  console.log(
    `  · water.town is ${Math.round(away)} m from the middle of the plan's downtown, ` +
      `${inside(downtown, toM(water.town.x), toM(water.town.z)) ? 'inside it' : 'outside it'}`,
  );
  for (const [label, poly] of flat) {
    if (inside(poly, toM(water.town.x), toM(water.town.z))) console.log(`  · water.town is inside ${label}`);
  }
}

// The runway is the one place whose *shape* has to fit, not just its middle.
{
  const [a, b] = RUNWAY;
  const steps = 80;
  let wet = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = m(a[0] + ((b[0] - a[0]) * i) / steps);
    const z = m(a[1] + ((b[1] - a[1]) * i) / steps);
    if (water.isWater(x, z)) wet++;
    const h = toM(groundAt(terrain, x, z));
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  console.log(
    `\n  runway ${Math.round(len)} m at ${Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI)}°` +
      `  ·  ${pct(wet / (steps + 1))} of it in the water  ·  ground ${Math.round(lo)} to ${Math.round(hi)} m`,
  );
}

if (draw) {
  const W = 1400;
  const scale = W / CITY_WIDTH;
  const H = Math.round(CITY_DEPTH * scale);
  // The repo's own convention: -x to the right (scene/mapping.ts, #182).
  const sx = (x) => (bounds.maxX - x) * scale;
  const sy = (z) => (bounds.maxZ - z) * scale;

  const parts = [`<rect width="${W}" height="${H}" fill="#1d6076"/>`];
  // The land, hill-shaded, at terrain resolution.
  const step = terrain.cell;
  for (let z = bounds.minZ; z < bounds.maxZ; z += step) {
    for (let x = bounds.minX; x < bounds.maxX; x += step) {
      if (water.isWater(x, z)) continue;
      const h = toM(groundAt(terrain, x, z));
      const t = Math.max(0, Math.min(1, h / 120));
      const r = Math.round(96 + t * 130);
      const g = Math.round(132 + t * 90);
      const b = Math.round(96 + t * 50);
      parts.push(
        `<rect x="${(sx(x + step) - 0.5).toFixed(1)}" y="${(sy(z + step) - 0.5).toFixed(1)}" width="${(
          step * scale + 1
        ).toFixed(1)}" height="${(step * scale + 1).toFixed(1)}" fill="rgb(${r},${g},${b})"/>`,
      );
    }
  }
  const COLOR = {
    downtown: '#5c6bc0',
    midtown: '#66897a',
    waterfront: '#d08770',
    industrial: '#8d6e63',
    park: '#4caf50',
  };
  for (const [kind, polys] of Object.entries(PLAN)) {
    for (const poly of polys) {
      const d = poly.map(([x, z]) => `${sx(m(x)).toFixed(1)},${sy(m(z)).toFixed(1)}`).join(' ');
      parts.push(
        `<polygon points="${d}" fill="${COLOR[kind]}" fill-opacity="0.45" stroke="${COLOR[kind]}" stroke-width="2.5"/>`,
      );
    }
    const [first] = polys;
    const cx = first.reduce((s, p) => s + sx(m(p[0])), 0) / first.length;
    const cy = first.reduce((s, p) => s + sy(m(p[1])), 0) / first.length;
    parts.push(
      `<text x="${cx.toFixed(0)}" y="${cy.toFixed(0)}" fill="#fff" font-family="monospace" font-size="15" text-anchor="middle">${kind}</text>`,
    );
  }
  for (const [name, [px, pz]] of Object.entries(PLACES)) {
    const x = sx(m(px));
    const y = sy(m(pz));
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#ffd54f" stroke="#333"/>`);
    parts.push(
      `<text x="${(x + 12).toFixed(0)}" y="${(y + 5).toFixed(0)}" fill="#ffd54f" font-family="monospace" font-size="14">${name}</text>`,
    );
  }
  {
    const [a, b] = RUNWAY;
    parts.push(
      `<line x1="${sx(m(a[0])).toFixed(1)}" y1="${sy(m(a[1])).toFixed(1)}" x2="${sx(m(b[0])).toFixed(1)}" y2="${sy(
        m(b[1]),
      ).toFixed(1)}" stroke="#ffd54f" stroke-width="4" stroke-dasharray="10 6"/>`,
    );
  }
  const tx = sx(water.town.x);
  const ty = sy(water.town.z);
  parts.push(`<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="9" fill="none" stroke="#fff" stroke-width="3"/>`);
  parts.push(
    `<text x="${(tx + 14).toFixed(0)}" y="${(ty + 5).toFixed(0)}" fill="#fff" font-family="monospace" font-size="14">water.town</text>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join(
    '',
  )}</svg>`;
  mkdirSync('screenshots', { recursive: true });
  writeFileSync('screenshots/plan.svg', svg);
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: 'screenshots/plan.png' });
    await browser.close();
    console.log('\nwrote screenshots/plan.png');
  } catch {
    console.log('\nwrote screenshots/plan.svg (no Chromium for a PNG)');
  }
}
