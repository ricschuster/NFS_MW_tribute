// How much traffic is on screen (#348), without anybody having to drive.
//
// The owner's recorded drive (#347, docs/research/human-pace-347.md) measured
// Crosstown at 1.29 vehicles on screen a second, 56% of seconds with none and
// three or more in 22%, against the reference game's 0.60, 60% and at most
// 10%. Tuning toward that by asking for a new recording after every change is
// not a loop anyone can run, so this is the same measurement headless.
//
// A stand-in for the player drives the public roads at a free-roam pace,
// turning at random at junctions, with the real traffic around it. A chase
// camera is put where `CameraDirector` puts it, and every civilian is counted
// the way the telemetry recorder counts one: once its drawn box is
// `TELEMETRY_DETECTABLE` of the screen's height. The stand-in is on the graph,
// not driven: it measures traffic, not driving, so it never crashes, never
// stops and never leaves the road. That leans the count low against a person,
// who spends time stopped with the traffic catching up.
//
// Usage:
//   npm run trafficview                      # 12 starts, 2 minutes each
//   npm run trafficview -- --kmh 160 --starts 20 --minutes 3
import { createServer } from 'vite';
import * as THREE from 'three';

const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const KMH = flag('--kmh', 130);
const STARTS = flag('--starts', 12);
const MINUTES = flag('--minutes', 2);
const WARM = 20; // seconds for traffic to fill in around a new start

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });
const { CityWorld } = await server.ssrLoadModule('/src/game/cityworld.ts');
const K = await server.ssrLoadModule('/src/game/constants.ts');
const { advanceAlong, exitsFrom, placeOnRoad, directionOf } = await server.ssrLoadModule('/src/game/graphcar.ts');
const { screenHeight } = await server.ssrLoadModule('/src/game/scene/onscreen.ts');
const { CAR_BOX, TELEMETRY_DETECTABLE } = await server.ssrLoadModule('/src/game/telemetry.ts');
const { Rng } = await server.ssrLoadModule('/src/game/city/rng.ts');

const M = K.UNITS_PER_METRE;
const world = new CityWorld(undefined, { traffic: true, police: false });
const city = world.city;
const rng = new Rng(348);

const drivable = (road) =>
  road.class !== 'interstate' &&
  road.class !== 'ramp' &&
  (road.surface ?? 'asphalt') === 'asphalt' &&
  city.nodes[road.a].level === 'surface';
const starts = city.roads.filter((r) => drivable(r) && r.length > 30 * M);

const camera = new THREE.PerspectiveCamera(K.CHASE_FOV, 1024 / 640, 2 * M, 14000 * M);
const eye = new THREE.Vector3();
const look = new THREE.Vector3();

const samples = [];
for (let s = 0; s < STARTS; s++) {
  const road = starts[Math.floor(rng.float() * starts.length)];
  const you = { road, t: 0.5, forward: rng.float() < 0.5, speed: (KMH / 3.6) * M, x: 0, z: 0, y: 0, heading: 0, damage: 0 };
  placeOnRoad(city, you, 0);
  world.traffic.cars.length = 0;
  let hour = 15;
  const perSecond = Math.round(1 / K.STEP);
  for (let n = 0; n < (WARM + MINUTES * 60) * perSecond; n++) {
    advanceAlong(city, you, K.STEP, (car, node) => {
      const ways = exitsFrom(city, car, node).filter(drivable);
      return ways.length ? ways[Math.floor(rng.float() * ways.length)] : null;
    }, 0);
    hour = (hour + (K.STEP / 60 / K.DAY_MINUTES) * 24) % 24;
    world.traffic.update(K.STEP, { x: you.x, z: you.z, y: you.y, onRoad: you.road, hour });
    if (n < WARM * perSecond || n % perSecond !== 0) continue;

    // The chase camera, as `CameraDirector` frames it with no lag.
    const dir = directionOf(city, you);
    const pace = Math.min(1, you.speed / world.maxSpeed);
    camera.fov = K.CHASE_FOV + (K.CHASE_FOV_FAST - K.CHASE_FOV) * pace;
    camera.updateProjectionMatrix();
    eye.set(you.x - dir.x * K.CHASE_BACK, you.y + K.CHASE_HEIGHT, you.z - dir.z * K.CHASE_BACK);
    look.set(you.x + dir.x * 12 * M, you.y + 2 * M, you.z + dir.z * 12 * M);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    const seen = world.traffic.cars.filter(
      (car) => screenHeight(camera, car.x, car.y, car.z, car.heading, CAR_BOX.w, CAR_BOX.l, CAR_BOX.h) >= TELEMETRY_DETECTABLE,
    ).length;
    samples.push({ seen, district: you.road.district, cars: world.traffic.cars.length });
  }
}

const report = (label, group) => {
  if (group.length === 0) return;
  const mean = group.reduce((a, s) => a + s.seen, 0) / group.length;
  const any = group.filter((s) => s.seen > 0);
  const whenAny = any.length ? any.reduce((a, s) => a + s.seen, 0) / any.length : 0;
  const pct = (n) => `${Math.round((100 * n) / group.length)}%`.padStart(5);
  const cars = group.reduce((a, s) => a + s.cars, 0) / group.length;
  console.log(
    `  ${label.padEnd(12)} ${String(group.length).padStart(6)}  ${mean.toFixed(2).padStart(6)}  ${pct(group.length - any.length)}  ${whenAny.toFixed(1).padStart(6)}  ${pct(group.filter((s) => s.seen >= 3).length)}  ${cars.toFixed(0).padStart(5)}`,
  );
};

console.log(`TRAFFIC ON SCREEN (#348)  ${STARTS} starts x ${MINUTES} min at ${KMH} km/h, counted at ${TELEMETRY_DETECTABLE * 100}% of screen height`);
console.log('               seconds    mean  none  when any   3+   cars alive');
report('all', samples);
for (const d of ['downtown', 'midtown', 'waterfront', 'industrial', 'park']) report(d, samples.filter((s) => s.district === d));
console.log('  reference game          0.60   60%     1.5   <=10%');
console.log('  owner, recorded (#347)  1.29   56%     2.9    22%');
process.exit(0);
