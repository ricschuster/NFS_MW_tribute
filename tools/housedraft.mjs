// Draft an area's houses into its props file (#477).
//
// The houses on a suburb's streets are generated once and then edited, the
// owner's call: this runs the generator (`suburbHousesFor` in
// `city/suburb.ts`) over the city as it stands, without the houses already
// there, and writes the result into the area's props file, keeping any prop
// in it that is not a house. Edit them in the area editor, then
// `npm run propsync -- --place midtown`. Rerun after moving streets: it
// replaces every house in the file, so a hand edit to a house is lost and a
// hand-placed prop that is not a house is kept.
//
// Usage:
//   npm run housedraft                 # Midtown north
//   npm run housedraft -- --dry        # count, write nothing
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const FILE = 'docs/midtown-props-edited.json';
const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const { CITY_SEED } = await server.ssrLoadModule('/src/game/constants.ts');
const { inWater } = await server.ssrLoadModule('/src/game/city/grid.ts');
const { suburbHousesFor } = await server.ssrLoadModule('/src/game/city/suburb.ts');
const city = new CityWorld(undefined, { traffic: false, police: false }).city;
await server.close();

const homes = new Set(['house', 'apartment']);
const houses = suburbHousesFor(
  city.terrain,
  city.roads,
  city.nodes,
  (x, z) => inWater(city, x, z),
  city.setPieces.filter((p) => !homes.has(p.kind)),
  [...city.collectibles.map((c) => c.at), ...city.breakables.map((b) => b.at)],
  city.routes.map((r) => r.points),
);
const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { props: [] };
const kept = (old.props ?? []).filter((p) => !homes.has(p.kind));
const props = [...kept, ...houses.map((h, i) => ({ id: `h${i + 1}`, ...h }))];
console.log(`${houses.filter((h) => h.kind === 'house').length} houses, ${houses.filter((h) => h.kind === 'apartment').length} apartments; ${kept.length} other props kept`);
if (!DRY) {
  writeFileSync(FILE, JSON.stringify({ seed: `0x${(CITY_SEED >>> 0).toString(16)}`, place: 'Midtown north', savedAt: new Date().toISOString(), props }, null, 2) + '\n');
  console.log(`wrote ${FILE}`);
}
