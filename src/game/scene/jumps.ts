import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';
import { JUMP_SHAPES, jumpProfile } from '../city/jumps';
import type { Jump, JumpKind } from '../city/types';

const M = UNITS_PER_METRE;

/**
 * The jumps (#307), drawn from the same profile the sim rides: `jumpProfile`
 * is the one description of a jump's shape, so what the car is thrown off and
 * what the eye sees cannot disagree about where the lip is.
 */
const COLOURS: Record<JumpKind, string> = {
  ramp: '#8c6b45',
  mound: '#6a6440',
  slab: '#8e8e86',
};

/** Steps along the profile. A ramp is straight and needs one; a mound curves. */
const STEPS: Record<JumpKind, number> = { ramp: 1, mound: 10, slab: 1 };

/** A jump's surface, its two sides and the face under its lip, in metres. */
function jumpGeometry(kind: JumpKind): THREE.BufferGeometry {
  const { w, l } = JUMP_SHAPES[kind];
  const steps = STEPS[kind];
  const positions: number[] = [];
  // Written in the order that reads naturally below, pushed the other way round
  // so every face's normal points out of the jump.
  const tri = (a: number[], b: number[], c: number[]) => positions.push(...a, ...c, ...b);
  const at = (i: number) => {
    const t = i / steps;
    return { v: -l / 2 + l * t, h: jumpProfile(kind, t) };
  };
  for (let i = 0; i < steps; i++) {
    const p = at(i);
    const q = at(i + 1);
    // The running surface.
    tri([-w / 2, p.h, p.v], [w / 2, p.h, p.v], [w / 2, q.h, q.v]);
    tri([-w / 2, p.h, p.v], [w / 2, q.h, q.v], [-w / 2, q.h, q.v]);
    // The sides, down to the ground.
    tri([w / 2, 0, p.v], [w / 2, q.h, q.v], [w / 2, p.h, p.v]);
    tri([w / 2, 0, p.v], [w / 2, 0, q.v], [w / 2, q.h, q.v]);
    tri([-w / 2, 0, p.v], [-w / 2, p.h, p.v], [-w / 2, q.h, q.v]);
    tri([-w / 2, 0, p.v], [-w / 2, q.h, q.v], [-w / 2, 0, q.v]);
  }
  // The face under the lip.
  const lip = jumpProfile(kind, 1);
  tri([-w / 2, 0, l / 2], [w / 2, lip, l / 2], [w / 2, 0, l / 2]);
  tri([-w / 2, 0, l / 2], [-w / 2, lip, l / 2], [w / 2, lip, l / 2]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class CityJumps {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(jumps: readonly Jump[]) {
    const dummy = new THREE.Object3D();
    for (const kind of Object.keys(JUMP_SHAPES) as JumpKind[]) {
      const list = jumps.filter((jump) => jump.kind === kind);
      if (list.length === 0) continue;
      const geometry = jumpGeometry(kind);
      const material = new THREE.MeshLambertMaterial({ color: COLOURS[kind], side: THREE.DoubleSide });
      this.owned.push(geometry, material);
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      mesh.name = `jumps-${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let i = 0; i < list.length; i++) {
        // A few centimetres up, so the foot of the ramp is not fighting the
        // carriageway under it for the same pixels.
        dummy.position.set(list[i].at.x, list[i].y + 0.05 * M, list[i].at.z);
        dummy.rotation.set(0, list[i].angle, 0);
        dummy.scale.setScalar(M);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.meshes.push(mesh);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const thing of this.owned) thing.dispose();
  }
}
