import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';
import type { Breakable } from '../city/types';

const M = UNITS_PER_METRE;

/**
 * Gates and stacks, on the same provider seam as everything else (#57).
 *
 * One instanced mesh per kind, and a broken one is scaled away rather than
 * rebuilt - the same trick the smashed billboards use, and for the same
 * reason: a hundred of these come and go over a session and rebuilding a mesh
 * for each is a hitch in the middle of a pursuit.
 */
export class CityBreakables {
  readonly meshes: THREE.InstancedMesh[] = [];

  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private readonly items: Breakable[][] = [];
  private readonly hidden = new Set<number>();

  constructor(items: Breakable[]) {
    const gates = items.filter((item) => item.kind === 'gate');
    const stacks = items.filter((item) => item.kind === 'stack');

    // A gate is a wide thin panel across the mouth of a yard; a stack is a
    // squat block of pallets on a kerb. Both read at a distance by shape.
    this.add('gates', gates, '#b0763a', 12 * M, 3 * M, 0.5 * M, 0);
    this.add('stacks', stacks, '#8a6a3f', 4.4 * M, 2.4 * M, 3 * M, 0);
  }

  private add(
    name: string,
    items: Breakable[],
    colour: string,
    width: number,
    height: number,
    depth: number,
    base: number,
  ): void {
    if (items.length === 0) return;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({ color: colour });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = name;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      dummy.position.set(items[i].at.x, items[i].y + base + height / 2, items[i].at.z);
      dummy.rotation.set(0, items[i].angle, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.meshes.push(mesh);
    this.items.push(items);
  }

  /** Take away whatever has come down. */
  setBroken(broken: ReadonlySet<number>): void {
    if (broken.size === this.hidden.size) return;

    const dummy = new THREE.Object3D();
    for (let m = 0; m < this.meshes.length; m++) {
      let changed = false;
      for (let i = 0; i < this.items[m].length; i++) {
        const id = this.items[m][i].id;
        if (!broken.has(id) || this.hidden.has(id)) continue;
        this.hidden.add(id);
        dummy.position.set(0, -1e6, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        this.meshes[m].setMatrixAt(i, dummy.matrix);
        changed = true;
      }
      if (changed) this.meshes[m].instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const thing of this.owned) thing.dispose();
  }
}
