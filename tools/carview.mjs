// Renders one procedural car on a plain light-grey background from five
// angles, flat-lit, as the input for the image-to-3D pilot (#584, ADR-0013,
// tools/trellis/). Our own model only: never feed it anything from reference/.
// A report, not a guard. Own dev server and headless Chromium, no GPU needed.
//
// usage: node tools/carview.mjs <bodyStyle> <hexColour> <outDir>
//   e.g. node tools/carview.mjs fastback '#d8442f' /tmp/kestrel
// writes front34, side, rear34, rear, front (.png, 1024 square). The Kestrel
// is `fastback`; the styles are the keys of BODIES in scene/carshape.ts.
import { fileURLToPath } from 'node:url';
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const { createServer } = await import(`${REPO}/node_modules/vite/dist/node/index.js`);
const { chromium } = await import(`${REPO}/node_modules/playwright/index.mjs`);
const { mkdirSync, writeFileSync } = await import('node:fs');

const [style = 'fastback', colour = '#d8442f', out = '.'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const server = await createServer({ root: REPO, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = `http://localhost:${server.config.server.port ?? server.httpServer.address().port}`;

const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
page.on('console', (m) => m.type() === 'error' && console.log('page:', m.text()));
await page.goto(`${url}/robots.txt`);

const views = await page.evaluate(async ({ style, colour }) => {
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => import('three'));
  const { makeCar } = await import('/src/game/scene/cars.ts');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1024, 1024);
  document.body.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c8c8c8');
  scene.add(new THREE.HemisphereLight('#ffffff', '#777777', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.2);
  sun.position.set(6, 10, 8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#ffffff', 0.5);
  fill.position.set(-8, 4, -6);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#8c8c8c' }));
  ground.rotation.x = -Math.PI / 2;
  // no ground: a plain background suits image-to-3D better than a horizon
  const car = makeCar(colour, false, style);
  // The blob-shadow plane (scaled to ~2340 x 6792) would swamp the bounds.
  for (const c of [...car.children]) if (c.scale.z > 1000) car.remove(c);
  // The game works in a large internal unit; bring the car to ~5 units long.
  const raw = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
  car.scale.setScalar(5 / Math.max(raw.x, raw.z));
  scene.add(car);
  car.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(car);
  car.position.y -= box0.min.y;
  car.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  car.position.x -= mid.x; car.position.z -= mid.z; mid.x = 0; mid.z = 0;
  car.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const r = Math.max(size.x, size.z) * 2.3;
  // bearing 0 = looking at the car from its nose side (+z); the car's own
  // forward axis is read off below by the caller from the images.
  const shots = { front34: 0.75, side: 1.5708, rear34: 2.4, rear: 3.1416, front: 0 };
  const out = {};
  for (const [name, a] of Object.entries(shots)) {
    cam.position.set(mid.x + Math.sin(a) * r, mid.y + size.y * 0.55, mid.z + Math.cos(a) * r);
    cam.lookAt(mid);
    renderer.render(scene, cam);
    out[name] = renderer.domElement.toDataURL('image/png');
  }
  out.size = [size.x, size.y, size.z];
  return out;
}, { style, colour });

console.log('car size x,y,z:', views.size.map((n) => n.toFixed(2)).join(', '));
for (const [name, data] of Object.entries(views)) {
  if (name === 'size') continue;
  writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
await browser.close();
await server.close();
