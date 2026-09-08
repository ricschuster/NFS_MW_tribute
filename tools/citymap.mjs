// City map: draw a generated Kestrel Bay from above, so a layout can be judged
// by looking at it instead of by reading numbers off a test.
//
// The generator is a pure function of a seed, which makes it easy to test and
// impossible to eyeball. This is the eyeball.
//
// Usage:
//   npm run city                       # the pinned seed -> screenshots/citymap.*
//   npm run city -- --seed 12345       # try another city
//   npm run city -- --out kestrel      # write screenshots/kestrel.*
//
// Loads the TypeScript generator through Vite's SSR loader, so there is no
// build step. Writes an SVG always, and a PNG too when Chromium is available.
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const OUT = 'screenshots';
const name = flag('--out') ?? 'citymap';
// `--terrain` draws the land alone: relief, water, and no city on top of it.
// Judging a landscape under three thousand roads is judging the roads.
const bare = args.includes('--terrain');

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { generateCity } = await server.ssrLoadModule('/src/game/city/generate.ts');
const { CITY_SEED, UNITS_PER_METRE } = await server.ssrLoadModule('/src/game/constants.ts');

const seed = flag('--seed') === null ? CITY_SEED : Number(flag('--seed'));
const city = generateCity(seed);
await server.close();

/** Colour per district, chosen to be told apart at a glance rather than to be pretty. */
const DISTRICT_COLOR = {
  downtown: '#5c6bc0',
  midtown: '#66897a',
  waterfront: '#3f8fa8',
  industrial: '#8a6d43',
};

const W = 1400;
const scale = W / (city.bounds.maxX - city.bounds.minX);
const H = Math.round((city.bounds.maxZ - city.bounds.minZ) * scale);

// Screen y runs down and world z runs north, so the shore ends up at the top.
// And x runs *right to left*: a map seen from above with +z up the screen has
// -x on the right, because a driver facing +z has their right hand pointing at
// -x. This drew +x rightwards, and so did both of the game's own maps, which
// meant all three agreed with each other and disagreed with the windscreen.
// `src/game/scene/mapping.ts` has the arithmetic and the test.
const sx = (x) => ((city.bounds.maxX - x) * scale).toFixed(1);
const sy = (z) => ((city.bounds.maxZ - z) * scale).toFixed(1);

const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="#111820"/>`);

// The land, shaded by height (ADR-0007). Hill-shading rather than a colour
// ramp, because what a map has to answer about relief is "which way does this
// slope and how steeply", and a ramp answers "how high is it" - which nobody
// standing in a street can see. The light comes from the north-west, which is
// the convention every paper map uses and the one an eye reads as raised rather
// than as a hole.
{
  const t = city.terrain;
  const step = Math.max(1, Math.round(t.cell * scale < 2 ? 2 / (t.cell * scale) : 1));
  // A shade wider than the step, so the cells overlap instead of leaving a
  // grid of hairline gaps that reads as hatching.
  const px = (t.cell * scale * step * 1.25).toFixed(2);
  const relief = [];
  for (let row = 0; row + step < t.rows; row += step) {
    for (let col = 0; col + step < t.cols; col += step) {
      const h = t.cells[row * t.cols + col];
      if (h <= 0) continue; // the water draws itself
      // Slope towards the light, from the two neighbours.
      const dx = t.cells[row * t.cols + col + step] - h;
      const dz = t.cells[(row + step) * t.cols + col] - h;
      const run = t.cell * step;
      const lit = Math.max(0, Math.min(1, 0.5 + (dx / run) * 6 + (dz / run) * 6));
      const high = Math.min(1, h / (90 * UNITS_PER_METRE));
      // A green that browns as it climbs, darkened or lifted by the slope. The
      // shade carries the shape and the hue carries the height, so a flat high
      // plateau and a steep low hill do not read as the same thing.
      const shade = 0.6 + 0.7 * lit;
      const r = Math.round(Math.min(255, (62 + 120 * high) * shade));
      const g = Math.round(Math.min(255, (92 + 62 * high) * shade));
      const b = Math.round(Math.min(255, (56 + 44 * high) * shade));
      const x = ((city.bounds.maxX - (t.bounds.minX + (col + step) * t.cell)) * scale).toFixed(1);
      const y = ((city.bounds.maxZ - (t.bounds.minZ + (row + step) * t.cell)) * scale).toFixed(1);
      relief.push(`<rect x="${x}" y="${y}" width="${px}" height="${px}" fill="rgb(${r},${g},${b})"/>`);
    }
  }
  parts.push(relief.join(''));
}

// The bay and the river. Drawn over the land, because the land is drawn
// everywhere and the water is a lid on the low parts of it.
for (const body of city.water) {
  // A path with sub-paths and even-odd filling, not a polygon: since ADR-0008
  // the sea is everywhere the land is not, so it is one outline with a hole in
  // it per body of land.
  const ring = (pts) => `M ${pts.map((p) => `${sx(p.x)},${sy(p.z)}`).join(' L ')} Z`;
  const d = [ring(body.outline), ...(body.holes ?? []).map(ring)].join(' ');
  parts.push(`<path d="${d}" fill="#22566b" fill-rule="evenodd"/>`);
}

if (!bare) for (const block of city.blocks) {
  const b = block.bounds;
  parts.push(
    `<rect x="${sx(b.maxX)}" y="${sy(b.maxZ)}" width="${((b.maxX - b.minX) * scale).toFixed(1)}" ` +
      `height="${((b.maxZ - b.minZ) * scale).toFixed(1)}" fill="${DISTRICT_COLOR[block.district]}" opacity="0.55"/>`,
  );
}

const STROKE = {
  interstate: '#c34bd0',
  ramp: '#8f5fd6',
  boulevard: '#e07a3f',
  arterial: '#e8d9a8',
  street: '#7d8890',
};
// Surface first, then the interstate over the top of it, which is also the
// order they sit in the world.
const order = (road) =>
  road.class === 'interstate' || road.class === 'ramp' ? 2 : road.class === 'boulevard' ? 1 : 0;
if (!bare) for (const road of [...city.roads].sort((p, q) => order(p) - order(q))) {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const w = Math.max(0.6, road.width * scale);
  // A tunnel is the same road with the sign flipped, and worth telling apart.
  const underground = city.nodes[road.a].y < 0 && city.nodes[road.b].y < 0;
  const stroke = road.bridge ? '#ff8a4c' : underground ? '#4a2d63' : STROKE[road.class];
  const wide = road.bridge ? w * 1.8 : road.class === 'interstate' ? w * 1.1 : w;
  parts.push(
    `<line x1="${sx(a.x)}" y1="${sy(a.z)}" x2="${sx(b.x)}" y2="${sy(b.z)}" ` +
      `stroke="${stroke}" stroke-width="${wide.toFixed(2)}" stroke-linecap="round"/>`,
  );
}

// District labels, one per superblock, so the layout reads at a glance.
if (!bare) for (const cell of city.superblocks) {
  const b = cell.bounds;
  parts.push(
    `<text x="${sx((b.minX + b.maxX) / 2)}" y="${sy((b.minZ + b.maxZ) / 2)}" fill="#fff" fill-opacity="0.45" ` +
      `font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">${cell.district}</text>`,
  );
}

const km = ((city.bounds.maxX - city.bounds.minX) / UNITS_PER_METRE / 1000).toFixed(1);
const deep = ((city.bounds.maxZ - city.bounds.minZ) / UNITS_PER_METRE / 1000).toFixed(1);
parts.push(
  `<text x="14" y="${H - 16}" fill="#cfd8dc" font-family="ui-monospace, monospace" font-size="16">` +
    `seed 0x${(seed >>> 0).toString(16)} · ${km} x ${deep} km · ${city.roads.length} roads · ` +
    `${city.nodes.length} junctions · ${city.blocks.length} blocks</text>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${name}.svg`, svg);
console.log(`wrote ${OUT}/${name}.svg`);

// A summary worth reading next to the picture.
const counts = {};
for (const cell of city.superblocks) counts[cell.district] = (counts[cell.district] ?? 0) + 1;
console.log(`seed 0x${(seed >>> 0).toString(16)}`);
const roadKm = city.roads.reduce((s, r) => s + r.length, 0) / UNITS_PER_METRE / 1000;
console.log(
  `  ${city.roads.length} roads, ${city.nodes.length} junctions, ${city.blocks.length} blocks, ` +
    `${roadKm.toFixed(1)} km of road`,
);
// One crossing may be cut into several sections, and one road may cross the
// water twice, so group the bridge sections that actually touch each other.
const elevated = city.roads.filter((r) => r.class === 'interstate');
const ramps = city.roads.filter((r) => r.class === 'ramp');
const tunnel = city.nodes.filter((n) => n.y < 0).length;
const boulevards = city.roads.filter((r) => r.class === 'boulevard');
console.log(
  `  boulevards: ${(boulevards.reduce((s, r) => s + r.length, 0) / UNITS_PER_METRE / 1000).toFixed(1)} km`,
);
console.log(
  `  interstate: ${(elevated.reduce((s, r) => s + r.length, 0) / UNITS_PER_METRE / 1000).toFixed(1)} km loop, ` +
    `${ramps.length} ramps, ${tunnel} nodes in tunnel`,
);
const bridges = city.roads.filter((r) => r.bridge);
const groups = [];
const placed = new Set();
for (const road of bridges) {
  if (placed.has(road.id)) continue;
  const group = [road.id];
  placed.add(road.id);
  for (let i = 0; i < group.length; i++) {
    const here = city.roads[group[i]];
    for (const end of [here.a, here.b]) {
      for (const id of city.nodes[end].roads) {
        if (city.roads[id].bridge && !placed.has(id)) {
          placed.add(id);
          group.push(id);
        }
      }
    }
  }
  groups.push(group);
}
const bridgeKm = bridges.reduce((s, r) => s + r.length, 0) / UNITS_PER_METRE / 1000;
console.log(`  ${groups.length} water crossings (${bridgeKm.toFixed(2)} km of bridge)`);
for (const [district, n] of Object.entries(counts).sort()) {
  const blocks = city.blocks.filter((b) => b.district === district);
  const side =
    blocks.reduce((s, b) => s + Math.sqrt((b.bounds.maxX - b.bounds.minX) * (b.bounds.maxZ - b.bounds.minZ)), 0) /
    (blocks.length || 1);
  console.log(
    `  ${district.padEnd(11)} ${String(n).padStart(2)} superblocks  ` +
      `${String(blocks.length).padStart(4)} blocks  ~${Math.round(side / UNITS_PER_METRE)} m a side`,
  );
}

// Rasterise so the map can be opened (and read by tools that only take images).
try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(svg);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await browser.close();
  console.log(`wrote ${OUT}/${name}.png`);
} catch (err) {
  console.log(`(no PNG: ${err.message.split('\n')[0]})`);
}
