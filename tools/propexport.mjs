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
//   npm run propexport -- --place midtown-south   # a suburb from tools/suburbs.mjs -> screenshots/midtown-south-propeditor.html
import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { SUBURBS } from './suburbs.mjs';

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
// A suburb (#477, #487) is a midtown from `tools/suburbs.mjs`; they all export
// the same way, so they share a kind.
const suburb = SUBURBS[which];
const KIND = suburb ? 'midtown' : { airfield: 'airfield', marrow: 'airfield', quarry: 'quarry', docks: 'docks', wharf: 'docks', lookout: 'lookout', fort: 'lookout', highmoor: 'highmoor', tidewater: 'tidewater' }[which];
if (!KIND) throw new Error(`unknown place '${which}': airfield, quarry, docks, lookout, highmoor, tidewater or ${Object.keys(SUBURBS).join(', ')}`);
// Highmoor Park (#460) and Tidewater Park (#461) are districts of the plan, not
// places: a circle round the outline stands in for one, so the crop and the
// rest of the page work the same way.
// A suburb is a midtown of the plan, which has no name of its own there.
const parkArea = KIND === 'highmoor' || KIND === 'tidewater'
  ? plan.PLAN_DISTRICTS.find((a) => a.name === (KIND === 'highmoor' ? 'Highmoor Park' : 'Tidewater Park'))
  : KIND === 'midtown'
    ? { ...plan.PLAN_DISTRICTS.filter((a) => a.kind === 'midtown')[suburb.index], name: suburb.name }
    : null;
const field = parkArea
  ? (() => {
      const xs = parkArea.poly.map((p) => p.x), zs = parkArea.poly.map((p) => p.z);
      const at = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
      return { name: parkArea.name, at, radius: Math.max(Math.max(...xs) - at.x, Math.max(...zs) - at.z) };
    })()
  : plan.PLAN_PLACES.find((p) => p.kind === KIND);
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
const MARGIN = KIND === 'airfield' ? 250 : KIND === 'docks' ? 400 : KIND === 'lookout' ? 450 : KIND === 'highmoor' || KIND === 'tidewater' || KIND === 'midtown' ? 60 : radius * 0.85;
const OUT = suburb ? suburb.prefix : { airfield: '', quarry: 'quarry-', docks: 'wharf-', lookout: 'fort-', highmoor: 'highmoor-', tidewater: 'tidewater-' }[KIND];
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

// The drawn roads the crop touches (#477), so the editor can change them: the
// polylines `docs/roads-edited.json` holds, which `propsync` merges an edit
// back into by id. Each city segment says which of them it lies on, so the
// editor can draw and check against a road as it is being moved rather than
// as it was exported.
const edited = JSON.parse(readFileSync('docs/roads-edited.json', 'utf8'));
const drawn = edited.roads.filter((r) => r.points.some(([x, z]) => x >= box.minX - 50 && x <= box.maxX + 50 && z >= box.minZ - 50 && z <= box.maxZ + 50));
const onLine = (q, pts) => {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(ax + dx * t - q[0], az + dz * t - q[1]) < 2) return true;
  }
  return false;
};
const drawnWidths = {};
// A road whose loose end `roadsync` pulled onto the road it was reaching for
// (`stitch`) has its last segment end somewhere the drawing does not: one end
// on the drawn line, the other within the stitch reach of the drawn road's own
// end. That segment is the road too, and is replaced by the road as drawn,
// rather than left as a stray piece the editor cannot move.
const nearEnd = (q, pts) => [pts[0], pts[pts.length - 1]].some((e) => Math.hypot(e[0] - q[0], e[1] - q[1]) <= 70);
for (const seg of roads) {
  const owner = drawn.find((r) => onLine(seg.a, r.points) && onLine(seg.b, r.points))
    ?? drawn.find((r) => (onLine(seg.a, r.points) && nearEnd(seg.b, r.points)) || (onLine(seg.b, r.points) && nearEnd(seg.a, r.points)));
  if (!owner) continue;
  seg.road = owner.id;
  drawnWidths[owner.id] = Math.max(drawnWidths[owner.id] ?? 0, seg.width);
}
const roadWidths = {};
for (const seg of roads) if (seg.class === 'street' || seg.class === 'boulevard') roadWidths[seg.class] = Math.max(roadWidths[seg.class] ?? 0, seg.width);

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
// The woods (#460) are generated round the placed props, so the page shows
// them to place against, not to edit: move a table and the trees make room on
// the next sync.
furniture.tree = city.setPieces.filter((p) => p.kind === 'tree' && inBox(p.at)).map((p) => [r1(toM(p.at.x)), r1(toM(p.at.z)), r2(p.angle)]);

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
  drawn,
  drawnWidths,
  roadWidths,
  district: parkArea?.kind ?? 'midtown',
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
const AUTHORED = suburb ? suburb.module : { airfield: 'marrowprops', quarry: 'quarryprops', docks: 'wharfprops', lookout: 'fortprops', highmoor: 'highmoorprops', tidewater: 'tidewaterprops' }[KIND];
const EXPORT = suburb ? suburb.exportName : { airfield: 'MARROW_PROPS', quarry: 'QUARRY_PROPS', docks: 'WHARF_PROPS', lookout: 'FORT_PROPS', highmoor: 'HIGHMOOR_PROPS', tidewater: 'TIDEWATER_PROPS' }[KIND];
const server2 = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
out.initial = (await server2.ssrLoadModule(`/src/game/city/${AUTHORED}.ts`))[EXPORT];
// Kestrel Head: the enclosures the last sync found from the walls (#454), so a
// wall moved in the editor can be checked against what got cobbled and raised.
const castle = KIND === 'lookout' ? (await server2.ssrLoadModule('/src/game/city/castle.ts')).CASTLE_AREAS : null;
const carPark = KIND === 'highmoor' ? (await server2.ssrLoadModule('/src/game/city/highmoor.ts')).HIGHMOOR_CAR_PARK : null;
await server2.close();
// Highmoor Park: its outline, the car park, and the Descent's line, so the
// furniture is placed against what the park is for.
if (carPark) {
  const pts = (list) => list.map((p) => [r1(toM(p.x)), r1(toM(p.z))]);
  const descent = city.routes.find((r) => r.name === 'Highmoor Descent');
  out.guides = [
    { poly: pts(parkArea.poly), label: 'Highmoor Park', color: '#f2c230' },
    { poly: pts(carPark), label: 'Car park - gravel', color: '#e0d8c0' },
    ...(descent ? [{ line: pts(descent.points), label: 'Highmoor Descent', color: '#ff5a5a' }] : []),
  ];
}
// Tidewater Park (#461): its outline and Tidewater Drive's line, so the
// buildings and benches are placed against the lawns the race leaves open.
if (KIND === 'tidewater') {
  const pts = (list) => list.map((p) => [r1(toM(p.x)), r1(toM(p.z))]);
  const drive = city.routes.find((r) => r.name === 'Tidewater Drive');
  out.guides = [
    { poly: pts(parkArea.poly), label: 'Tidewater Park', color: '#f2c230' },
    ...(drive ? [{ line: [...pts(drive.points), pts(drive.points)[0]], label: 'Tidewater Drive', color: '#ff5a5a' }] : []),
  ];
}
// A suburb (#477, #487): its outline, and the line of the race through it.
if (suburb) {
  const pts = (list) => list.map((p) => [r1(toM(p.x)), r1(toM(p.z))]);
  const run = suburb.route && city.routes.find((r) => r.name === suburb.route);
  out.guides = [
    { poly: pts(parkArea.poly), label: suburb.name, color: '#f2c230' },
    ...(run ? [{ line: [...pts(run.points), pts(run.points)[0]], label: suburb.route, color: '#ff5a5a' }] : []),
  ];
}
if (castle) {
  const area = (poly, label, color) => ({ poly: poly.map((p) => [r1(toM(p.x)), r1(toM(p.z))]), label, color });
  out.guides = [
    area(castle.bailey, 'Bailey - cobbled', '#e0b050'),
    area(castle.court, 'Inner castle - cobbled, raised', '#6fc3ff'),
    area(castle.ward, 'South ward - cobbled, raised', '#8be08b'),
  ];
}
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
