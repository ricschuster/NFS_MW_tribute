// Draft an area's houses, hedges and street trees into its props file (#477).
//
// A suburb's houses are generated once and then edited, the owner's call.
// By default this keeps the houses already in the area's props file - with
// whatever was done to them by hand - and drafts their front hedges and the
// street trees round them afresh (`suburbExtrasFor` in `city/suburb.ts`).
// With `--houses` it redrafts the houses too (`suburbHousesFor`), over the city
// as it stands without them, which loses any hand edit to a house; use it
// after moving streets. Either way a prop in the file that the draft does not
// make is kept. Then `npm run propsync -- --place <the same place>`.
//
// The area is a suburb from `tools/suburbs.mjs`, Midtown north by default;
// Ashford Point (`--place ashford`, #293) drafts estates: villas, some houses
// and a few manors.
//
// Usage:
//   npm run housedraft                 # hedges and trees round Midtown north's houses
//   npm run housedraft -- --houses     # the houses as well
//   npm run housedraft -- --place midtown-south --houses   # another suburb
//   npm run housedraft -- --dry        # count, write nothing
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';
import { suburbFrom } from './suburbs.mjs';

const DRY = process.argv.includes('--dry');
const HOUSES = process.argv.includes('--houses');
const suburb = suburbFrom(process.argv);
const DOWNTOWN = suburb.district === 'downtown';
if (suburb.district !== 'midtown' && suburb.district !== 'waterfront' && !DOWNTOWN) throw new Error(`${suburb.name} is not a suburb: its props are placed by hand in the area editor`);
const FILE = suburb.json;
const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { CITY_SEED } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { suburbHousesFor, suburbExtrasFor } = await server.ssrLoadModule('/src/game/city/suburb.ts');
const { highStreetLines } = await server.ssrLoadModule('/src/game/city/highstreet.ts');
const { downtownBuildingsFor } = await server.ssrLoadModule('/src/game/city/downtown.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { props: [] };

// Downtown (#268) is buildings, not houses: its old core, its towers and its
// landmarks, drafted by `downtownBuildingsFor` (`city/downtown.ts`) over the
// city without them, and only with `--houses` once there are any to lose.
if (DOWNTOWN) {
  const kinds = new Set(['townhouse', 'shop', 'flat', 'loft', 'midrise', 'tower', 'lookout-tower', 'twist-tower', 'chateau-hotel', 'stadium', 'library', 'gallery', 'cathedral', 'city-hall', 'cruise-terminal', 'geodesic-dome', 'flatiron']);
  const had = (old.props ?? []).filter((p) => kinds.has(p.kind));
  if (had.length && !HOUSES) {
    console.log(`${had.length} buildings kept; --houses redrafts them, losing any edit`);
    process.exit(0);
  }
  const { props: buildings, report } = downtownBuildingsFor(
    city.terrain,
    city.roads,
    city.nodes,
    (x, z) => inWater(city, x, z),
    city.setPieces.filter((p) => !kinds.has(p.kind)),
    [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)],
    city.pillars,
  );
  for (const line of report) console.log(`  ${line}`);
  const props = [...(old.props ?? []).filter((p) => !kinds.has(p.kind)), ...buildings.map((b, i) => ({ id: `b${i + 1}`, ...b }))];
  if (!DRY) {
    writeFileSync(FILE, JSON.stringify({ ...old, seed: `0x${(CITY_SEED >>> 0).toString(16)}`, place: suburb.name, savedAt: new Date().toISOString(), props }, null, 2) + '\n');
    console.log(`wrote ${FILE}`);
  }
  process.exit(0);
}
const homes = new Set(['house', 'apartment', 'shop', 'flat', 'villa', 'manor']);
const drafted = new Set([...homes, 'hedge', 'street-tree']);
// The suburb's high street (#488), if it has one: `HIGH_STREETS` in `city/highstreet.ts`.
const high = highStreetLines(suburb.index);
const inFile = (old.props ?? []).filter((p) => homes.has(p.kind));
const houses = !HOUSES && inFile.length ? inFile.map(({ id, ...p }) => p) : suburbHousesFor(
  city.terrain,
  city.roads,
  city.nodes,
  (x, z) => inWater(city, x, z),
  // Without anything this tool drafted: last time's hedges and trees would
  // otherwise stand in the way of the houses they were drafted round.
  city.setPieces.filter((p) => !drafted.has(p.kind)),
  [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)],
  city.routes.map((r) => r.points),
  [suburb.index],
  high,
  suburb.district,
);
const extras = suburbExtrasFor(houses, city.roads, city.nodes, (x, z) => inWater(city, x, z), city.routes.map((r) => r.points), [
  ...city.collectibles.map((c) => c.at),
  ...city.breakables.map((b) => b.at),
], [suburb.index], suburb.district, (city.drives ?? []).map((d) => d.outline));
const kept = (old.props ?? []).filter((p) => !drafted.has(p.kind));
const keptIds = new Map(inFile.map((p) => [`${p.kind}:${p.x}:${p.z}`, p.id]));
const props = [
  ...kept,
  ...houses.map((h, i) => ({ id: keptIds.get(`${h.kind}:${h.x}:${h.z}`) ?? `h${i + 1}`, ...h })),
  ...extras.map((e, i) => ({ id: `${e.kind === 'hedge' ? 'g' : 't'}${i + 1}`, ...e })),
];
const count = (k) => props.filter((p) => p.kind === k).length;
console.log(`${count('manor')} manors, ${count('villa')} villas, ${count('house')} houses, ${count('apartment')} apartments, ${count('shop')} shops, ${count('flat')} flats${HOUSES || !inFile.length ? ' (drafted)' : ' (kept)'}; ${count('hedge')} hedges, ${count('street-tree')} street trees; ${kept.length} other props kept`);
if (!DRY) {
  // Everything else in the file is kept: an editor save carries the area's
  // roads in it too, which `propsync` merges, and a draft is not a reason to lose them.
  writeFileSync(FILE, JSON.stringify({ ...old, seed: `0x${(CITY_SEED >>> 0).toString(16)}`, place: suburb.name, savedAt: new Date().toISOString(), props }, null, 2) + '\n');
  console.log(`wrote ${FILE}`);
}
