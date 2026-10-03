import * as THREE from 'three';
import type { City } from '../city/types';
import { groundAt } from '../city/terrain';
import { UNITS_PER_METRE as M } from '../constants';

/**
 * The inside of the freeway's tunnels (#580, #257).
 *
 * The terrain is single-sided, so a camera below it sees straight through the
 * ground: a tunnel was an open trench under sky, with no roof, no walls and
 * nothing to say you were underground. This draws the tube. It is scene only -
 * `underground()` in `citypolice.ts` still decides what counts as cover, from
 * the same ground height, and nothing here is collidable.
 *
 * Sampled every `STEP` along each freeway road that dips below the ground, with
 * the roof held `COVER_GAP` under the surface so it never pokes through. Where
 * there is not headroom (the mouths, where the deck comes up out of the
 * ground) the tube simply stops, and that is the portal.
 *
 * Unlit on purpose: three's sun would light the lining like a wall outdoors.
 * The light is baked into vertex colour as a pool under each lamp, and the
 * lamps are emissive strips down both sides of the roof. No fog, for the same
 * reason: a tunnel does not go pale with distance.
 */
const STEP = 6 * M;
const LAMP_EVERY = 24 * M;
const MAX_HEIGHT = 8 * M;
// Tall enough that the chase camera (6 m up) sits inside the tube rather than
// above its roof. Under a riverbed there is less cover than that, so the roof
// may stand proud of the bed there: the water is over it.
const MIN_HEIGHT = 7 * M;
const WATER = -1.5 * M;
const COVER_GAP = 0.25 * M;
const DADO = 1.1 * M;

const WALL = new THREE.Color('#3c3f42');
const DADO_COLOUR = new THREE.Color('#585b5e');
const ROOF = new THREE.Color('#2a2c2f');

export function tunnelMeshes(city: City): { meshes: THREE.Mesh[]; owned: (THREE.BufferGeometry | THREE.Material)[] } {
  const position: number[] = [];
  const colour: number[] = [];
  const index: number[] = [];
  const lamps: { x: number; y: number; z: number; yaw: number; hw: number }[] = [];
  const tint = new THREE.Color();

  for (const road of city.roads) {
    if (road.class !== 'interstate' && road.class !== 'ramp') continue;
    const a = city.nodes[road.a];
    const b = city.nodes[road.b];
    if (a.level !== 'tunnel' && b.level !== 'tunnel') continue;
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const yaw = Math.atan2(dx, dz);
    const rx = dz / len;
    const rz = -dx / len;
    const hw = road.width / 2 + 0.6 * M;
    const n = Math.max(1, Math.round(len / STEP));

    let prev = -1;
    let lampAt = LAMP_EVERY / 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.pos.x + dx * t;
      const z = a.pos.z + dz * t;
      const y = a.y + (b.y - a.y) * t;
      const ground = groundAt(city.terrain, x, z);
      const room = ground - y - COVER_GAP;
      const height = Math.min(MAX_HEIGHT, ground < WATER ? Math.max(room, MIN_HEIGHT) : room);
      if (height < MIN_HEIGHT) {
        prev = -1;
        continue;
      }
      const s = len * t;
      // Brightest under a lamp, dim between: a pool of light, not a flat tone.
      const phase = Math.abs(((s + LAMP_EVERY / 2) % LAMP_EVERY) - LAMP_EVERY / 2) / (LAMP_EVERY / 2);
      const light = 0.3 + 0.7 * (1 - phase) ** 2;
      const rows: [number, number, THREE.Color][] = [
        [-1, 0, DADO_COLOUR],
        [-1, DADO, DADO_COLOUR],
        [-1, DADO + 0.01 * M, WALL],
        [-1, height, ROOF],
        [1, height, ROOF],
        [1, DADO + 0.01 * M, WALL],
        [1, DADO, DADO_COLOUR],
        [1, 0, DADO_COLOUR],
      ];
      const first = position.length / 3;
      for (const [side, up, base] of rows) {
        position.push(x + rx * hw * side, y + up, z + rz * hw * side);
        tint.copy(base).multiplyScalar(light);
        colour.push(tint.r, tint.g, tint.b);
      }
      if (prev >= 0) {
        for (let k = 0; k < rows.length - 1; k++) {
          const p = prev + k;
          const q = first + k;
          index.push(p, p + 1, q, p + 1, q + 1, q);
        }
      }
      prev = first;

      while (s >= lampAt - 1e-6) {
        for (const side of [-1, 1]) {
          lamps.push({ x: x + rx * hw * 0.45 * side, y: y + height - 0.12 * M, z: z + rz * hw * 0.45 * side, yaw, hw });
        }
        lampAt += LAMP_EVERY;
      }
    }
  }
  if (index.length === 0) return { meshes: [], owned: [] };

  const lining = new THREE.BufferGeometry();
  lining.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  lining.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  lining.setIndex(index);
  const liningMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const tube = new THREE.Mesh(lining, liningMaterial);
  tube.name = 'tunnel-lining';
  tube.frustumCulled = false;

  const strip = new THREE.BoxGeometry(0.7 * M, 0.14 * M, 5 * M);
  // Over 1 so the grade's bloom-ish roll-off has something to bite on.
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe9c0').multiplyScalar(1.8), fog: false });
  const lights = new THREE.InstancedMesh(strip, glow, lamps.length);
  const matrix = new THREE.Matrix4();
  lamps.forEach((lamp, i) => {
    matrix.makeRotationY(lamp.yaw).setPosition(lamp.x, lamp.y, lamp.z);
    lights.setMatrixAt(i, matrix);
  });
  lights.instanceMatrix.needsUpdate = true;
  lights.name = 'tunnel-lamps';
  lights.frustumCulled = false;

  return { meshes: [tube, lights], owned: [lining, liningMaterial, strip, glow] };
}
