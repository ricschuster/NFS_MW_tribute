import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';
import { groundAt } from '../city/terrain';
import type { Apron, City } from '../city/types';

const M = UNITS_PER_METRE;
/** How far a drive is sampled along its length, to follow the ground. */
const STEP = 3 * M;
/** Over the ground by this much, and pulled forward in depth, so the two never fight. */
const LIFT = 0.08 * M;
const COLOURS: Record<Apron['look'], string> = { cobbles: '#6f665c', gravel: '#8c826f', concrete: '#9a9890', flags: '#9a9890', grass: '#4f7d3c', sand: '#d6c69a' };

/**
 * Ashford Point's drives and forecourts (#293), downtown's pavements and
 * squares (#268), and Tidewater Park's paths, plaza and beach (2026-10-02),
 * one mesh per look: each a
 * four-cornered strip draped over the ground, sampled along its length. Its
 * own geometry rather than the ground shader's apron loop (`wharfground.ts`),
 * which every fragment of the ground pays for once per apron.
 */
export function drivesFor(city: City): THREE.Mesh[] {
  const byLook = new Map<Apron['look'], number[]>();
  for (const drive of [...city.drives, ...city.pavements]) {
    if (drive.outline.length !== 4) continue;
    const positions = byLook.get(drive.look) ?? [];
    byLook.set(drive.look, positions);
    const [a0, a1, b1, b0] = drive.outline;
    const along = Math.hypot((a1.x + b1.x - a0.x - b0.x) / 2, (a1.z + b1.z - a0.z - b0.z) / 2);
    const across = Math.hypot((b0.x + b1.x - a0.x - a1.x) / 2, (b0.z + b1.z - a0.z - a1.z) / 2);
    const steps = Math.max(1, Math.ceil(along / STEP));
    // Across as well as along: a drive is two edges and a straight line
    // between them, but Tidewater Park's beach (2026-10-02) is sixty metres
    // from the promenade down to the sea, and a straight line across that runs
    // under the shore's bulge, where the grass shows through the sand.
    const rows = Math.max(1, Math.ceil(across / STEP));
    const at = (t: number, u: number) => {
      const lx = a0.x + (a1.x - a0.x) * t, lz = a0.z + (a1.z - a0.z) * t;
      const rx = b0.x + (b1.x - b0.x) * t, rz = b0.z + (b1.z - b0.z) * t;
      const x = lx + (rx - lx) * u, z = lz + (rz - lz) * u;
      return [x, groundAt(city.terrain, x, z) + LIFT, z];
    };
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      for (let j = 0; j < rows; j++) {
        const u0 = j / rows, u1 = (j + 1) / rows;
        const l0 = at(t0, u0), l1 = at(t1, u0), r0 = at(t0, u1), r1 = at(t1, u1);
        positions.push(...l0, ...r0, ...l1, ...l1, ...r0, ...r1);
      }
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
