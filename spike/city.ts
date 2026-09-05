// Throwaway spike for ADR-0004: what does a generated Kestrel Bay actually look
// like? A street grid, extruded blocks, an elevated interstate crossing over
// them, and a car you can drive around it with a chase camera.
//
// Deliberately self-contained and disposable. It shares nothing with src/game
// and is not wired into the build. Run it with `npm run dev` and open
// http://localhost:5173/spike/city.html
import * as THREE from 'three';

// ---------------------------------------------------------------- constants

const BLOCK = 44; // city block, edge to edge
const ROAD = 14; // road width between blocks
const CELL = BLOCK + ROAD;
const GRID = 14; // GRID x GRID blocks
const EXTENT = (GRID * CELL) / 2;

/** Deterministic PRNG, so the same city comes back every run. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0x1a2b3c);

/** ?view=aerial looks at the whole city, for judging the generated layout. */
const AERIAL = new URLSearchParams(location.search).get('view') === 'aerial';

// ------------------------------------------------------------------- scene

const scene = new THREE.Scene();
const HAZE = new THREE.Color('#c6dcee'); // horizon colour; fog blends into it
scene.background = HAZE;
// fog sells distance at street level, but from the air it just erases the city
scene.fog = AERIAL ? null : new THREE.Fog(HAZE, 200, 700);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 1400);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.body.appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Bright coastal daylight: a low-ish sun for long shadows down the streets,
// plus a sky/ground hemisphere fill so the shaded faces do not go black.
const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
sun.position.set(-160, 220, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 700;
const S = 240;
sun.shadow.camera.left = -S;
sun.shadow.camera.right = S;
sun.shadow.camera.top = S;
sun.shadow.camera.bottom = -S;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);
// generous fill: with a single hard sun the faces turned away go near-black,
// which reads as silhouettes rather than buildings
scene.add(new THREE.HemisphereLight('#cfe6f7', '#8e8578', 1.9));

// Gradient sky dome. A flat background colour makes the horizon vanish; the
// 2012 game's look is largely a bright hazy horizon under a deeper blue.
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(900, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#5f9fd8') },
      bottom: { value: HAZE },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vWorld;
      void main() {
        float h = clamp(pow(max(normalize(vWorld).y, 0.0), 0.55), 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, h), 1.0);
      }`,
  }),
);
skyDome.frustumCulled = false;
scene.add(skyDome);

// ------------------------------------------------------------------ ground

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID * CELL + 400, GRID * CELL + 400),
  new THREE.MeshLambertMaterial({ color: '#3b3f45' }), // asphalt
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/** Lane markings down the middle of every street, as thin bright strips. */
function addLaneMarkings() {
  const geo = new THREE.PlaneGeometry(0.5, 5);
  const mat = new THREE.MeshBasicMaterial({ color: '#d8d2c0' });
  const dashesPerCell = 6;
  const count = GRID * (GRID + 1) * dashesPerCell * 2;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
  const one = new THREE.Vector3(1, 1, 1);
  let i = 0;

  for (let a = 0; a <= GRID; a++) {
    const along = -EXTENT + a * CELL - ROAD / 2;
    for (let b = 0; b < GRID; b++) {
      for (let d = 0; d < dashesPerCell; d++) {
        const t = -EXTENT + b * CELL + (d + 0.5) * (CELL / dashesPerCell);
        q.copy(flat);
        m.compose(new THREE.Vector3(along, 0.02, t), q, one);
        mesh.setMatrixAt(i++, m);
        q.copy(turned);
        m.compose(new THREE.Vector3(t, 0.02, along), q, one);
        mesh.setMatrixAt(i++, m);
      }
    }
  }
  mesh.count = i;
  scene.add(mesh);
}
addLaneMarkings();

// --------------------------------------------------------------- buildings

/**
 * Districts by distance from the centre, the way Kestrel Bay runs from a downtown
 * core out to the waterfront and the industrial edge. Height and palette are
 * what make them read as different places.
 */
function district(cx: number, cz: number) {
  const d = Math.hypot(cx, cz) / EXTENT;
  if (d < 0.34) return { name: 'downtown', min: 26, max: 78, palette: ['#8d97a6', '#7d8896', '#9aa5b3', '#6f7a88'] };
  if (d < 0.62) return { name: 'midtown', min: 12, max: 34, palette: ['#b9a894', '#a89880', '#c4b7a4', '#9d8f7d'] };
  if (cz > EXTENT * 0.45) return { name: 'waterfront', min: 8, max: 20, palette: ['#cfd8dc', '#bcc9cf', '#dde5e8'] };
  return { name: 'industrial', min: 6, max: 16, palette: ['#8a7f72', '#9c9184', '#776f64', '#a39786'] };
}

const buildings: { pos: THREE.Vector3; scale: THREE.Vector3; color: THREE.Color }[] = [];
const pavements: { pos: THREE.Vector3; scale: THREE.Vector3 }[] = [];

for (let gx = 0; gx < GRID; gx++) {
  for (let gz = 0; gz < GRID; gz++) {
    const cx = -EXTENT + gx * CELL + BLOCK / 2;
    const cz = -EXTENT + gz * CELL + BLOCK / 2;
    const dist = district(cx, cz);

    pavements.push({
      pos: new THREE.Vector3(cx, 0.14, cz),
      scale: new THREE.Vector3(BLOCK + 3, 0.28, BLOCK + 3),
    });

    // a couple of parks, so the grid is not relentless
    if (rand() < 0.06) continue;

    // split the block into 1-3 lots per axis
    const nx = 1 + Math.floor(rand() * 3);
    const nz = 1 + Math.floor(rand() * 3);
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        if (rand() < 0.12) continue; // gap in the block
        const lotW = BLOCK / nx;
        const lotD = BLOCK / nz;
        const w = lotW * (0.72 + rand() * 0.2);
        const d = lotD * (0.72 + rand() * 0.2);
        const h = dist.min + rand() * rand() * (dist.max - dist.min); // skewed low
        const x = cx - BLOCK / 2 + (ix + 0.5) * lotW;
        const z = cz - BLOCK / 2 + (iz + 0.5) * lotD;
        buildings.push({
          pos: new THREE.Vector3(x, h / 2 + 0.28, z),
          scale: new THREE.Vector3(w, h, d),
          color: new THREE.Color(dist.palette[Math.floor(rand() * dist.palette.length)]),
        });
      }
    }
  }
}

/** One InstancedMesh for every box in the city; thousands of draw calls would not hold 60fps. */
function instanceBoxes(
  items: { pos: THREE.Vector3; scale: THREE.Vector3; color?: THREE.Color }[],
  material: THREE.Material,
  vertexColors: boolean,
) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  items.forEach((it, i) => {
    m.compose(it.pos, q, it.scale);
    mesh.setMatrixAt(i, m);
    if (vertexColors && it.color) mesh.setColorAt(i, it.color);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

instanceBoxes(pavements, new THREE.MeshLambertMaterial({ color: '#6d6f70' }), false);
// Note: no `vertexColors` here. InstancedMesh.setColorAt drives `instanceColor`,
// which three.js picks up on its own; turning on vertexColors instead makes the
// shader look for a geometry colour attribute BoxGeometry does not have, and
// every building renders black.
instanceBoxes(buildings, new THREE.MeshLambertMaterial({ color: '#ffffff' }), true);

// ------------------------------------------------- the elevated interstate
// The feature that decided ADR-0004: a road at height crossing over the
// surface streets, which no ribbon or ground-plane renderer can express.

const DECK_Y = 15;
const DECK_W = 22;
const deckMat = new THREE.MeshLambertMaterial({ color: '#4a4e54' });
const pillarMat = new THREE.MeshLambertMaterial({ color: '#8f8f92' });

function elevatedRun(alongZ: boolean, offset: number) {
  const len = GRID * CELL + 400;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? DECK_W : len, 1.4, alongZ ? len : DECK_W), deckMat);
  deck.position.set(alongZ ? offset : 0, DECK_Y, alongZ ? 0 : offset);
  deck.castShadow = true;
  deck.receiveShadow = true;
  scene.add(deck);

  // parapets, which is most of what makes a deck read as a road rather than a slab
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(alongZ ? 0.8 : len, 1.6, alongZ ? len : 0.8),
      pillarMat,
    );
    wall.position.set(
      alongZ ? offset + (side * DECK_W) / 2 : 0,
      DECK_Y + 1.4,
      alongZ ? 0 : offset + (side * DECK_W) / 2,
    );
    wall.castShadow = true;
    scene.add(wall);
  }

  const pillars: { pos: THREE.Vector3; scale: THREE.Vector3 }[] = [];
  for (let t = -len / 2 + 30; t < len / 2; t += CELL) {
    pillars.push({
      pos: new THREE.Vector3(alongZ ? offset : t, DECK_Y / 2, alongZ ? t : offset),
      scale: new THREE.Vector3(3.4, DECK_Y, 3.4),
    });
  }
  instanceBoxes(pillars, pillarMat, false);
}

// one running each way, crossing near the middle of downtown
elevatedRun(true, -EXTENT + 4 * CELL - ROAD / 2);
elevatedRun(false, -EXTENT + 9 * CELL - ROAD / 2);

// ---------------------------------------------------------------- the car

function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.62, 4.4),
    new THREE.MeshLambertMaterial({ color: '#eef1f4' }),
  );
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.56, 2.0),
    new THREE.MeshLambertMaterial({ color: '#243044' }),
  );
  cabin.position.set(0, 1.16, -0.15);
  cabin.castShadow = true;
  g.add(cabin);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.02, 4.42),
    new THREE.MeshLambertMaterial({ color: '#2f6fd0' }),
  );
  stripe.position.y = 0.94;
  g.add(stripe);

  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.34, 14);
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#15171a' });
  for (const [x, z] of [
    [-1.02, 1.42],
    [1.02, 1.42],
    [-1.02, -1.42],
    [1.02, -1.42],
  ]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.44, z);
    w.castShadow = true;
    g.add(w);
  }
  return g;
}

const car = buildCar();
car.position.set(-EXTENT + CELL * 2 - ROAD / 2, 0, -EXTENT + 40);
scene.add(car);

// ------------------------------------------------------------------ input

const held = new Set<string>();
addEventListener('keydown', (e) => {
  held.add(e.key.toLowerCase());
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
const down = (...keys: string[]) => keys.some((k) => held.has(k));

// --------------------------------------------------------------- driving
// A first pass at what issue #82 has to do: the car has a heading and a speed
// rather than a distance along a track, so it can be pointed anywhere.

const MAX_SPEED = 62; // world units/sec
const ACCEL = 26;
const BRAKE = 46;
const DRAG = 6;
let speed = 0;
let heading = 0;

const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();
const speedEl = document.getElementById('speed')!;

function step(dt: number) {
  if (down('w', 'arrowup')) speed += ACCEL * dt;
  else if (down('s', 'arrowdown')) speed -= BRAKE * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), DRAG * dt);
  speed = Math.max(-MAX_SPEED * 0.35, Math.min(MAX_SPEED, speed));

  // steering authority falls off with speed, as it does in the 2D game today
  const frac = Math.abs(speed) / MAX_SPEED;
  const rate = 2.1 * (1 - 0.55 * frac * frac) * Math.min(1, frac * 6);
  if (down('a', 'arrowleft')) heading += rate * dt * Math.sign(speed || 1);
  if (down('d', 'arrowright')) heading -= rate * dt * Math.sign(speed || 1);

  car.position.x += Math.sin(heading) * speed * dt;
  car.position.z += Math.cos(heading) * speed * dt;
  car.rotation.y = heading;

  const limit = EXTENT + 120;
  car.position.x = Math.max(-limit, Math.min(limit, car.position.x));
  car.position.z = Math.max(-limit, Math.min(limit, car.position.z));

  collideWithBlocks();
}

/**
 * Keep the car on the streets. A cheap stand-in for issue #86: the grid is
 * regular, so "am I inside a block" is modulo arithmetic rather than a spatial
 * index. The real thing has to handle a generated network and building faces.
 */
function collideWithBlocks() {
  const pad = 1.4; // roughly the car's half-width
  const lx = (((car.position.x + EXTENT) % CELL) + CELL) % CELL;
  const lz = (((car.position.z + EXTENT) % CELL) + CELL) % CELL;
  if (lx > BLOCK + pad || lz > BLOCK + pad) return; // out on a road already

  // leave by whichever edge is nearest
  const left = lx + pad;
  const right = BLOCK - lx + pad;
  const back = lz + pad;
  const fwd = BLOCK - lz + pad;
  const least = Math.min(left, right, back, fwd);
  if (least === left) car.position.x -= left;
  else if (least === right) car.position.x += right;
  else if (least === back) car.position.z -= back;
  else car.position.z += fwd;
  speed *= 0.25; // hitting a building hurts
}

// ----------------------------------------------------------------- camera

const camPos = new THREE.Vector3();
const camAim = new THREE.Vector3();

function updateCamera(dt: number) {
  if (AERIAL) {
    camera.position.set(EXTENT * 0.8, EXTENT * 1.45, -EXTENT * 0.8);
    camera.lookAt(0, 0, 0);
    camera.fov = 42;
    camera.updateProjectionMatrix();
    return;
  }
  const back = 12.5;
  const height = 5.4;
  const want = new THREE.Vector3(
    car.position.x - Math.sin(heading) * back,
    car.position.y + height,
    car.position.z - Math.cos(heading) * back,
  );
  // lag behind the car; the lag is most of the sensation of speed
  camPos.lerp(want, 1 - Math.pow(0.0016, dt));
  camera.position.copy(camPos);

  camAim.lerp(
    new THREE.Vector3(
      car.position.x + Math.sin(heading) * 14,
      car.position.y + 1.6,
      car.position.z + Math.cos(heading) * 14,
    ),
    1 - Math.pow(0.0009, dt),
  );
  camera.lookAt(camAim);

  // widen the field of view with speed
  const target = 62 + 16 * (Math.max(0, speed) / MAX_SPEED);
  camera.fov += (target - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

camPos.set(car.position.x, 6, car.position.z - 12);
camAim.copy(car.position);

// ------------------------------------------------------------------- loop

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  accumulator += dt;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  updateCamera(dt);

  // keep the shadow frustum with the car, or the city loses its shadows
  sun.position.set(car.position.x - 160, 220, car.position.z + 120);
  sun.target.position.copy(car.position);
  sun.target.updateMatrixWorld();
  skyDome.position.copy(camera.position);

  speedEl.innerHTML = `${Math.round((Math.abs(speed) / MAX_SPEED) * 320)} <small>km/h</small>`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
