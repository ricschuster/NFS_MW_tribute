// Export Marrow Field for the prop editor.
//
// The road editor's move, one place at a time: the ground, the roads and
// everything the generator already put there come out of the real city, and
// placing things by hand happens in a page over them rather than as
// coordinates guessed in a text file. A prop that looks right in a list of
// numbers and sits across the taxiway is the thing this exists to prevent.
//
// Cropped to the field rather than the whole map, because props are placed at
// the scale of a cone and the relief has to be fine enough to put one on: the
// road editor's 12 m cells are a background for a road, and a background for a
// bunker needs to be a good deal finer than the bunker.
//
// Writes the data as JSON and, from `tools/propeditor.html`, the editor page
// with the data inlined - an editor that has to fetch its own data is an
// editor with a server.
//
// Usage:
//   npm run propexport                      # Marrow Field -> screenshots/props.json, propeditor.html
//   npm run propexport -- --place quarry    # Halloway Quarry -> screenshots/quarry-props.json, quarry-propeditor.html
//   npm run propexport -- --place docks     # Sablet Wharf -> screenshots/wharf-props.json, wharf-propeditor.html
//   npm run propexport -- --place lookout   # Kestrel Head -> screenshots/fort-props.json, fort-propeditor.html
import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { generateCity } = await server.ssrLoadModule('/src/game/city/generate.ts');
const { groundAt } = await server.ssrLoadModule('/src/game/city/terrain.ts');
const { makeWater } = await server.ssrLoadModule('/src/game/city/water.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');
const plan = await server.ssrLoadModule('/src/game/city/plan.ts');
const C = await server.ssrLoadModule('/src/game/constants.ts');
const { CITY_SEED, CITY_LAND_STREAM, UNITS_PER_METRE } = C;

const city = generateCity(CITY_SEED);
const water = makeWater(new Rng(CITY_LAND_STREAM), city.bounds);
await server.close();

const U = UNITS_PER_METRE;
const toM = (v) => v / U;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// The field is the airfield place's circle *and* the runway, which runs well
// past the circle at both ends: 2.3 km of runway against a 700 m radius.
const argv = process.argv.slice(2);
const which = argv.includes('--place') ? argv[argv.indexOf('--place') + 1] : 'airfield';
const KIND = { airfield: 'airfield', marrow: 'airfield', quarry: 'quarry', docks: 'docks', wharf: 'docks', lookout: 'lookout', fort: 'lookout' }[which];
if (!KIND) throw new Error(`unknown place '${which}': airfield, quarry, docks or lookout`);
const field = plan.PLAN_PLACES.find((p) => p.kind === KIND);
// Only an airfield has a runway; a quarry is a circle, and the crop reaches
// past it to take in the rim road, the yard and the road in (the yard sits
// about 1.5 radii out, so the box is not just the place's own circle).
const runway = KIND === 'airfield' ? plan.PLAN_RUNWAY.map((p) => ({ x: toM(p.x), z: toM(p.z) })) : [];
const centre = { x: toM(field.at.x), z: toM(field.at.z) };
const radius = toM(field.radius);
// The wharf is a peninsula 1.5 km long in a 450 m circle, and the Pier Jump
// lands 300 m out across the east channel: the crop reaches for both.
// The lookout's circle is 150 m and the fort stands on the summit 260 m from
// its centre, with the track leaving the south gate: the crop takes in both.
const MARGIN = KIND === 'airfield' ? 250 : KIND === 'docks' ? 400 : KIND === 'lookout' ? 450 : radius * 0.85;
const OUT = { airfield: '', quarry: 'quarry-', docks: 'wharf-', lookout: 'fort-' }[KIND];
const box = {
  minX: Math.floor(Math.min(centre.x - radius, ...runway.map((p) => p.x)) - MARGIN),
  maxX: Math.ceil(Math.max(centre.x + radius, ...runway.map((p) => p.x)) + MARGIN),
  minZ: Math.floor(Math.min(centre.z - radius, ...runway.map((p) => p.z)) - MARGIN),
  maxZ: Math.ceil(Math.max(centre.z + radius, ...runway.map((p) => p.z)) + MARGIN),
};
const inBox = (p, pad = 0) =>
  toM(p.x) >= box.minX - pad && toM(p.x) <= box.maxX + pad && toM(p.z) >= box.minZ - pad && toM(p.z) <= box.maxZ + pad;

// **4 m a cell**, which interpolates the terrain's own grid rather than
// sampling it. One byte a cell as in `roadexport`: 255 is water, anything else
// is metres above the sea. The page hill-shades it, and reads it back to say
// how far the ground falls under a prop - a bunker on a slope is #253's
// problem arriving early.
const ringHas = (ring, x, z) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
};
const STEP = 4;
const cols = Math.ceil((box.maxX - box.minX) / STEP);
const rows = Math.ceil((box.maxZ - box.minZ) / STEP);
const WATER = 255;
const cells = new Uint8Array(cols * rows);
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const x = (box.minX + col * STEP) * U;
    const z = (box.minZ + row * STEP) * U;
    // The quarry's ponds are on the finished city rather than in `water`, so
    // ask the city's own bodies as well: a prop dropped in one is as wrong as
    // one in the bay.
    const inPond = city.water.some(
      (b) => b.kind === 'pond' && ringHas(b.outline, x, z),
    );
    cells[row * cols + col] = water.isWater(x, z) || inPond
      ? WATER
      : Math.max(0, Math.min(254, Math.round(toM(groundAt(city.terrain, x, z)))));
  }
}

// Segments rather than chains: the field is a few hundred of them, and the
// editor wants each one's width and surface to test a footprint against,
// which a chain would have to carry per piece anyway.
const roads = city.roads
  .filter((r) => r.class !== 'interstate' && r.class !== 'ramp')
  .filter((r) => inBox(city.nodes[r.a].pos, 50) || inBox(city.nodes[r.b].pos, 50))
  .map((r) => {
    const a = city.nodes[r.a].pos;
    const b = city.nodes[r.b].pos;
    return {
      a: [r1(toM(a.x)), r1(toM(a.z))],
      b: [r1(toM(b.x)), r1(toM(b.z))],
      width: r1(toM(r.width)),
      surface: r.surface,
      class: r.class,
      bridge: r.bridge,
    };
  });

const buildings = city.buildings
  .filter((b) => inBox({ x: (b.footprint.minX + b.footprint.maxX) / 2, z: (b.footprint.minZ + b.footprint.maxZ) / 2 }))
  .map((b) => ({
    kind: b.kind,
    derelict: !!b.derelict,
    height: r1(toM(b.height)),
    rect: [r1(toM(b.footprint.minX)), r1(toM(b.footprint.minZ)), r1(toM(b.footprint.maxX)), r1(toM(b.footprint.maxZ))],
  }));

const furniture = {};
for (const f of city.furniture.filter((f) => inBox(f.at))) {
  (furniture[f.kind] ??= []).push([r1(toM(f.at.x)), r1(toM(f.at.z)), r2(f.angle)]);
}

const out = {
  seed: `0x${(CITY_SEED >>> 0).toString(16)}`,
  place: field.name,
  box,
  centre: [r1(centre.x), r1(centre.z)],
  radius,
  runway: runway.map((p) => [r1(p.x), r1(p.z)]),
  kind: KIND,
  height: { step: STEP, cols, rows, water: WATER, cells: Buffer.from(cells).toString('base64') },
  roads,
  buildings,
  furniture,
  collectibles: city.collectibles
    .filter((c) => inBox(c.at))
    .map((c) => ({ kind: c.kind, at: [r1(toM(c.at.x)), r1(toM(c.at.z))], angle: r2(c.angle) })),
  breakables: city.breakables
    .filter((b) => inBox(b.at))
    .map((b) => ({ kind: b.kind, at: [r1(toM(b.at.x)), r1(toM(b.at.z))], angle: r2(b.angle), half: r1(toM(b.half)) })),
  repairs: city.repairs.filter((r) => inBox(r.at)).map((r) => [r1(toM(r.at.x)), r1(toM(r.at.z))]),
  ambushes: city.ambushes.filter((a) => inBox(a.at)).map((a) => ({ at: [r1(toM(a.at.x)), r1(toM(a.at.z))], level: a.level })),
};

// What the place already has, so a first save from a new editor keeps it; and
// for the wharf, the layout its roads were drawn round (#410) and ideas for
// its jumps, drawn under the props and never saved.
const AUTHORED = { airfield: 'marrowprops', quarry: 'quarryprops', docks: 'wharfprops', lookout: 'fortprops' }[KIND];
const EXPORT = { airfield: 'MARROW_PROPS', quarry: 'QUARRY_PROPS', docks: 'WHARF_PROPS', lookout: 'FORT_PROPS' }[KIND];
const server2 = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
out.initial = (await server2.ssrLoadModule(`/src/game/city/${AUTHORED}.ts`))[EXPORT];
await server2.close();
if (KIND === 'docks') {
  out.guides = JSON.parse(readFileSync('docs/research/sablet-wharf/port-layout.json', 'utf8'));
  out.ideas = JSON.parse(readFileSync('docs/research/sablet-wharf/jump-ideas.json', 'utf8'));
}

mkdirSync('screenshots', { recursive: true });
const json = JSON.stringify(out);
writeFileSync(`screenshots/${OUT}props.json`, json);
// A function replacer, because the base64 raster is full of `$` sequences
// that a replacement *string* would read as patterns.
const page = readFileSync('tools/propeditor.html', 'utf8')
  .replace(/__PLACE__/g, () => field.name)
  .replace('__DATA__', () => json);
writeFileSync(`screenshots/${OUT}propeditor.html`, page);

const fmt = Object.entries(furniture)
  .map(([k, v]) => `${v.length} ${k}`)
  .join(', ');
console.log(
  `wrote screenshots/${OUT}props.json + ${OUT}propeditor.html  ·  ${out.place}, ${box.maxX - box.minX} x ${box.maxZ - box.minZ} m  ·  ` +
    `${roads.length} road segments, ${buildings.length} buildings, ${fmt}  ·  ${(json.length / 1024).toFixed(0)} KB`,
);
