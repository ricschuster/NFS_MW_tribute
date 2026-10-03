import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UNITS_PER_METRE } from '../constants';
import type { Breakable } from '../city/types';

const M = UNITS_PER_METRE;

/**
 * Gates, stacks and café tables, on the same provider seam as everything else (#57).
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
    const tables = items.filter((item) => item.kind === 'cafe-tables');

    // A gate is a wide thin panel across the mouth of a yard; a stack is a
    // squat block of pallets on a kerb. Both read at a distance by shape.
    this.add('gates', gates, '#b0763a', standing(new THREE.BoxGeometry(12 * M, 3 * M, 0.5 * M)));
    this.add('stacks', stacks, '#8a6a3f', standing(new THREE.BoxGeometry(4.4 * M, 2.4 * M, 3 * M)));
    // Café tables (downtown's once-over): a terrace of three round tables
    // under parasols, white tables and red parasols, one mesh for each colour.
    this.add('cafe-tables', tables, '#ece8de', terrace('tables'));
    this.add('cafe-parasols', tables, '#c94f3d', terrace('parasols'));
  }

  private add(name: string, items: Breakable[], colour: string, geometry: THREE.BufferGeometry): void {
    if (items.length === 0) {
      geometry.dispose();
      return;
    }

    const material = new THREE.MeshLambertMaterial({ color: colour });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = name;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      dummy.position.set(items[i].at.x, items[i].y, items[i].at.z);
      dummy.rotation.set(0, items[i].angle, 0);
      // Across whatever it was sized to: a gate placed by hand spans the road
      // it was snapped across (#295), which is wider than a yard's mouth.
      dummy.scale.set(name === 'gates' ? (items[i].half * 2) / (12 * M) : 1, 1, 1);
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

/** A box stood on the ground rather than centred on it. */
function standing(geometry: THREE.BoxGeometry): THREE.BufferGeometry {
  return geometry.translate(0, geometry.parameters.height / 2, 0);
}

/**
 * Three café tables in a row along the terrace, each with two chairs, or the
 * parasols over them: one part of the terrace each, so each is one colour.
 * Drawn twice life size, like the park's benches.
 */
function terrace(part: 'tables' | 'parasols'): THREE.BufferGeometry {
  const k = 2 * M;
  const pieces = [-1.2, 0, 1.2].flatMap((z) => {
    if (part === 'parasols') {
      return [
        new THREE.ConeGeometry(0.9, 0.35, 10).translate(0, 2.2, z),
        new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(0, 1.4, z),
      ];
    }
    return [
      new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12).translate(0, 0.74, z),
      new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6).translate(0, 0.36, z),
      ...[-0.55, 0.55].map((x) => new THREE.BoxGeometry(0.4, 0.45, 0.4).translate(x, 0.225, z)),
    ];
  });
  const merged = mergeGeometries(pieces.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of pieces) g.dispose();
  return merged.scale(k, k, k);
}
