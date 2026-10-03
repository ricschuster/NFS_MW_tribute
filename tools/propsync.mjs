// Turn the prop editor's placements into the generator's input.
//
// The same loop the roads and the freeway closed: placed by hand in the
// editor (`npm run propexport`), saved to the page's store, read back into
// `docs/props-edited.json`, and written from there into a module the
// generator imports. The JSON is the record of what somebody decided; the
// module is that record in the shape the generator wants it.
//
// Metres, not world units, like `roads.ts` and `freeway.ts`: this file is read
// by people comparing it to the editor, and the editor speaks metres.
//
// Usage:
//   npm run propsync                        # docs/props-edited.json -> src/game/city/marrowprops.ts
//   npm run propsync -- --place quarry      # docs/quarry-props-edited.json -> src/game/city/quarryprops.ts
//   npm run propsync -- --place docks       # docs/wharf-props-edited.json -> src/game/city/wharfprops.ts
//   npm run propsync -- --place lookout     # docs/fort-props-edited.json -> src/game/city/fortprops.ts
//   npm run propsync -- --place midtown-south   # a suburb, from tools/suburbs.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { castleAreas } from './castleareas.mjs';
import { SUBURBS } from './suburbs.mjs';

const args = process.argv.slice(2);
const PLACES = {
  airfield: { json: 'docs/props-edited.json', out: 'src/game/city/marrowprops.ts', name: 'Marrow Field', exportName: 'MARROW_PROPS', issue: '#295' },
  quarry: { json: 'docs/quarry-props-edited.json', out: 'src/game/city/quarryprops.ts', name: 'Halloway Quarry', exportName: 'QUARRY_PROPS', issue: '#323' },
  docks: { json: 'docs/wharf-props-edited.json', out: 'src/game/city/wharfprops.ts', name: 'Sablet Wharf', exportName: 'WHARF_PROPS', issue: '#410' },
  highmoor: { json: 'docs/highmoor-props-edited.json', out: 'src/game/city/highmoorprops.ts', name: 'Highmoor Park', exportName: 'HIGHMOOR_PROPS', issue: '#460' },
  tidewater: { json: 'docs/tidewater-props-edited.json', out: 'src/game/city/tidewaterprops.ts', name: 'Tidewater Park', exportName: 'TIDEWATER_PROPS', issue: '#461' },
  ...Object.fromEntries(Object.entries(SUBURBS).map(([place, s]) => [place, { json: s.json, out: `src/game/city/${s.module}.ts`, name: s.name, exportName: s.exportName, issue: s.issue, yards: !!s.yards }])),
  lookout: {
    json: 'docs/fort-props-edited.json', out: 'src/game/city/fortprops.ts', name: 'Kestrel Head', exportName: 'FORT_PROPS', issue: '#454',
    // The castle's enclosures are found from its walls (`castleareas.mjs`): a
    // point inside each, and the lines across the junction by the back gate,
    // which is open to the courtyard and the ward and belongs to neither.
    areas: {
      seeds: { bailey: [1300, -340], court: [1395, -455], ward: [1489, -640] },
      seams: [[[1418, -537], [1357, -535]], [[1418, -537], [1422, -600]]],
    },
  },
};
const which = args.includes('--place') ? args[args.indexOf('--place') + 1] : 'airfield';
if (!PLACES[which]) {
  console.error(`unknown place ${which}: ${Object.keys(PLACES).join(', ')}`);
  process.exit(1);
}
const source = args.find((a) => a.endsWith('.json')) ?? PLACES[which].json;
const { out, name: place, exportName, issue, areas: areaConfig, yards: hasYards } = PLACES[which];
const raw = JSON.parse(readFileSync(source, 'utf8'));
// The store hands back the document; accept it bare or under a wrapper.
const doc = raw.props ? raw : raw.data ?? raw;
const props = doc.props ?? [];
// A yard (#489) is drawn in the area editor like a road and saved with the
// roads, but it is paved ground, not a road: it goes into the area's module
// as an outline, and never into the road network.
const yards = (doc.roads ?? []).filter((r) => r.kind === 'yard' && r.points.length >= 3);
if (Array.isArray(doc.roads)) doc.roads = doc.roads.filter((r) => r.kind !== 'yard');
// A save with roads and no props is a road review (#487), made before any
// house is placed; with neither it is a bad read.
if (props.length === 0 && !Array.isArray(doc.roads)) {
  console.error(`no props in ${source}`);
  process.exit(1);
}

const KINDS = [
  'gate', 'stack', 'plane-belly', 'plane-nose', 'fuselage', 'fuselage-hung', 'helicopter',
  'silo', 'water-tower', 'crane', 'mast', 'bunker', 'blast-wall', 'shed', 'cone', 'tree', 'jump', 'billboard',
  'stockpile', 'conveyor', 'haul-truck', 'excavator', 'cabin', 'crusher', 'rubble', 'outcrop',
  'container-block', 'sts-crane', 'warehouse', 'straddle-carrier', 'reach-stacker',
  'rampart', 'bastion', 'fort-gate', 'signal-tower', 'cannon', 'keep', 'palas', 'chapel', 'wall-tower', 'ruin-house', 'masonry', 'well',
  'picnic-table', 'bench', 'telescope',
  'bandstand', 'toilet-block', 'cafe',
  'house', 'apartment', 'shop', 'flat', 'villa', 'manor', 'hedge', 'street-tree',
  'chimney', 'tank', 'gantry', 'rails', 'wagon',
  'townhouse', 'loft', 'midrise', 'tower', 'lookout-tower', 'twist-tower', 'chateau-hotel', 'stadium',
  'library', 'gallery', 'cathedral', 'city-hall', 'cruise-terminal', 'geodesic-dome', 'flatiron',
  'bus-shelter', 'bollard', 'planter', 'bin', 'fountain', 'statue', 'kiosk', 'dumpster', 'food-truck', 'cafe-tables', 'lawn',
  'playground', 'boathouse', 'jetty', 'rowing-boat', 'football-pitch', 'tennis-court', 'picnic-shelter', 'beach-hut',
  'lifeguard-tower', 'lighthouse', 'railing', 'path', 'plaza', 'beach',
  'waymarker', 'field-gate', 'stone-wall', 'log', 'log-pile', 'boulder', 'ranger-hut', 'timber-lookout',
  'tent', 'campfire', 'camper-van', 'radio-mast',
];
const unknown = props.filter((p) => !KINDS.includes(p.kind));
if (unknown.length) {
  console.error(`unknown kinds: ${[...new Set(unknown.map((p) => p.kind))].join(', ')}`);
  process.exit(1);
}

const num = (v) => String(Math.round(v * 1000) / 1000);
const str = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lines = props.map((p) => {
  const parts = [`kind: ${str(p.kind)}`, `x: ${num(p.x)}`, `z: ${num(p.z)}`, `angle: ${num(p.angle)}`];
  if (p.w != null) parts.push(`w: ${num(p.w)}`);
  if (p.variant) parts.push(`variant: ${str(p.variant)}`);
  if (p.note) parts.push(`note: ${str(p.note)}`);
  return `  { ${parts.join(', ')} },`;
});

// One array literal of more than a thousand props is more than TypeScript will
// check against the union of kinds (TS2590, downtown's once-over): a big area
// is written in parts of `CHUNK`, joined, and every other area as it was.
const CHUNK = 900;
const chunks = [];
for (let i = 0; i < lines.length; i += CHUNK) chunks.push(lines.slice(i, i + CHUNK));
const body = `// Generated by \`npm run propsync\` from ${source} - do not edit by hand.
// Place props in the ${place} Props editor (\`npm run propexport${which === 'airfield' ? '' : ` -- --place ${which}`}\`), save,
// read the save back into ${source}, and run the sync again.
//
// Seed ${doc.seed}, saved ${doc.savedAt ?? 'at an unknown time'}.
import type { AuthoredProp } from './types';

/** ${place}'s set dressing, in metres, as placed in the editor (${issue}). */
${
  lines.length <= CHUNK
    ? `export const ${exportName}: AuthoredProp[] = [\n${lines.join('\n')}\n];`
    : `${chunks.map((chunk, i) => `const PART_${i + 1}: AuthoredProp[] = [\n${chunk.join('\n')}\n];`).join('\n')}\nexport const ${exportName}: AuthoredProp[] = [${chunks.map((_, i) => `...PART_${i + 1}`).join(', ')}];`
}
${
  hasYards
    ? `
/** ${place}'s yards (#489): outlines in metres, paved, drivable and closed to traffic. */
export const ${exportName.replace(/_PROPS$/, '_YARDS')}: [number, number][][] = ${
        yards.length ? `[\n${yards.map((y) => `  [${y.points.map(([x, z]) => `[${num(x)}, ${num(z)}]`).join(', ')}],`).join('\n')}\n]` : '[]'
      };
`
    : ''
}`;
writeFileSync(out, body);

// The area editor's roads (#477), when the save carries them: merged into
// `docs/roads-edited.json` by id - a road the editor changed replaces the
// drawn one, a new one is added, a deleted one goes - and then `roadsync`
// lays the city from it, the same as a save from the road editor. The Road
// Editor's own store is then behind the file: write the file back into it
// (its `edits/roads` doc) so the two editors start from the same network.
if (Array.isArray(doc.roads)) {
  const roadsPath = 'docs/roads-edited.json';
  const rawRoads = readFileSync(roadsPath, 'utf8');
  const network = JSON.parse(rawRoads);
  const gone = new Set(doc.removedRoads ?? []);
  const byId = new Map(doc.roads.map((r) => [r.id, r]));
  let changed = 0, added = 0;
  network.roads = network.roads.filter((r) => !gone.has(r.id)).map((r) => {
    const mine = byId.get(r.id);
    if (!mine) return r;
    byId.delete(r.id);
    const next = { ...r, kind: mine.kind, district: mine.district ?? r.district, points: mine.points };
    if (mine.surface) next.surface = mine.surface; else delete next.surface;
    if (mine.deadEnd) next.deadEnd = true; else delete next.deadEnd;
    if (JSON.stringify(next) !== JSON.stringify(r)) changed++;
    return next;
  });
  for (const r of byId.values()) {
    network.roads.push({ ...r, bridge: !!r.bridge, isNew: true });
    added++;
  }
  writeFileSync(roadsPath, JSON.stringify(network, null, 2) + (rawRoads.endsWith('\n') ? '\n' : ''));
  console.log(`merged roads into ${roadsPath}  ·  ${changed} changed, ${added} added, ${gone.size} removed`);
  const run = spawnSync('node', ['tools/roadsync.mjs'], { stdio: 'inherit' });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
const count = {};
for (const p of props) count[p.kind] = (count[p.kind] ?? 0) + 1;
console.log(
  `wrote ${out}  ·  ${props.length} props  ·  ` +
    Object.entries(count)
      .map(([k, n]) => `${n} ${k}`)
      .join(', '),
);

// Kestrel Head: the castle's enclosures, read off the walls just written, so
// the cobbles and the raised ground follow wherever the walls were moved to.
if (areaConfig) {
  const areas = castleAreas(props, areaConfig.seeds, areaConfig.seams);
  const pts = (poly) => poly.map(([x, z]) => `[${x}, ${z}]`).join(', ');
  const file = `// Generated by \`npm run propsync -- --place lookout\` from the castle's walls - do not edit by hand.
// The enclosures of Kestrel Head's castle (#454) in world metres, found by
// \`tools/castleareas.mjs\`: what is cobbled, and what the ground is raised under.
import { UNITS_PER_METRE } from '../constants';
import type { Vec2 } from './types';

const points = (list: [number, number][]): Vec2[] => list.map(([x, z]) => ({ x: x * UNITS_PER_METRE, z: z * UNITS_PER_METRE }));

/** The outer bailey along the road up, the inner castle round the summit, and the south ward along the ridge. */
export const CASTLE_AREAS: { bailey: Vec2[]; court: Vec2[]; ward: Vec2[] } = {
${Object.entries(areas).map(([k, v]) => `  ${k}: points([${pts(v)}]),`).join('\n')}
};
`;
  writeFileSync('src/game/city/castle.ts', file);
  console.log(`wrote src/game/city/castle.ts  ·  ${Object.entries(areas).map(([k, v]) => `${k} ${v.length} points`).join(', ')}`);
}
