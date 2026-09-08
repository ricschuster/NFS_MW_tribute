import { createServer } from 'vite';
const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { generateCity } = await server.ssrLoadModule('/src/game/city/generate.ts');
const { CITY_SEED } = await server.ssrLoadModule('/src/game/constants.ts');
const t0 = Date.now();
const city = generateCity(CITY_SEED);
console.log('generate ms', Date.now() - t0, 'roads', city.roads.length);
await server.close();
