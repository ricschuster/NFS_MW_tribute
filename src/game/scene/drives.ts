import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';
import { groundAt } from '../city/terrain';
import type { Apron, City, Vec2 } from '../city/types';

const M = UNITS_PER_METRE;
/** How far a drive is sampled along its length, to follow the ground. */
const STEP = 3 * M;
/** Over the ground by this much, and pulled forward in depth, so the two never fight. */
const LIFT = 0.08 * M;
const COLOURS: Record<Apron['look'], string> = { cobbles: '#6f665c', gravel: '#8c826f', concrete: '#9a9890' };

/**
 * Ashford Point's drives and forecourts (#293), one mesh per look: each a
 * four-cornered strip draped over the ground, sampled along its length. Its
 * own geometry rather than the ground shader's apron loop (`wharfground.ts`),
 * which every fragment of the ground pays for once per apron.
 */
export function drivesFor(city: City): THREE.Mesh[] {
  const byLook = new Map<Apron['look'], number[]>();
  for (const drive of city.drives) {
    if (drive.outline.length !== 4) continue;
    const positions = byLook.get(drive.look) ?? [];
    byLook.set(drive.look, positions);
    const [a0, a1, b1, b0] = drive.outline;
    const along = Math.hypot((a1.x + b1.x - a0.x - b0.x) / 2, (a1.z + b1.z - a0.z - b0.z) / 2);
    const steps = Math.max(1, Math.ceil(along / STEP));
    const at = (p: Vec2, q: Vec2, t: number) => {
      const x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      return [x, groundAt(city.terrain, x, z) + LIFT, z];
    };
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const l0 = at(a0, a1, t0), l1 = at(a0, a1, t1), r0 = at(b0, b1, t0), r1 = at(b0, b1, t1);
      positions.push(...l0, ...r0, ...l1, ...l1, ...r0, ...r1);
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const [look, positions] of byLook) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({
      color: COLOURS[look],
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = `drives-${look}`;
    meshes.push(mesh);
  }
  return meshes;
}
