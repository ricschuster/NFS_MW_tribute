import * as THREE from 'three';
import type { Building } from '../city/types';
import { UNITS_PER_METRE } from '../constants';

/**
 * What stands on the roofs (#11).
 *
 * Every building in Kestrel Bay ends in a flat top, and a skyline of flat tops
 * is the giveaway that a city was extruded rather than built. From the
 * elevated interstate, and from anywhere with a view across downtown, roofs
 * are a large fraction of what is on screen and none of it has anything on it.
 *
 * Plant and masts, both instanced, both derived from the building's own
 * `variant` so the same seed gets the same city. Nothing here is emitted by
 * the generator: a rooftop box is geometry, and geometry lives on this side of
 * the seam. `variant` is the hook the generator provides for exactly this.
 *
 * Cheap on purpose. Roughly one extra box per building and a mast on the tall
 * ones, in two draw calls; a parapet would need four boxes per building and
 * would quadruple the city's triangle count for a rim most of the time seen
 * edge-on.
 */
export class Rooftops {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(buildings: Building[]) {
    const plant = this.instanced('roof-plant', '#5a5f66', buildings.length);
    const masts = this.instanced('roof-masts', '#4a4f57', buildings.length);

    const matrix = new THREE.Matrix4();
    let plantCount = 0;
    let mastCount = 0;

    for (const building of buildings) {
      const { footprint, variant } = building;
      const width = footprint.maxX - footprint.minX;
      const depth = footprint.maxZ - footprint.minZ;
      const across = Math.min(width, depth);
      // Sheds are single-storey industrial units and their roofs carry
      // ducting, but a shed is also usually the widest thing on its block, so
      // the same fraction would put a bungalow-sized box on it.
      const scale = building.kind === 'shed' ? 0.16 : 0.3;

      // Two independent numbers out of one seeded variant, so the size and
      // the position do not move together in a way the eye picks up as a
      // pattern down a street.
      const a = fract(variant * 7.31);
      const b = fract(variant * 13.79);

      if (a > 0.22) {
        const size = across * scale * (0.7 + a * 0.6);
        const tall = size * (0.5 + b * 0.7);
        matrix.makeScale(size, tall, size * (0.6 + a * 0.8));
        matrix.setPosition(
          (footprint.minX + footprint.maxX) / 2 + (a - 0.5) * (width - size) * 0.7,
          building.height,
          (footprint.minZ + footprint.maxZ) / 2 + (b - 0.5) * (depth - size) * 0.7,
        );
        plant.setMatrixAt(plantCount++, matrix);
      }

      // A mast only on the tall ones, and not on all of them: a forest of
      // aerials is as uniform as no aerials at all.
      if (building.kind === 'tower' && b > 0.55) {
        const thick = 0.5 * UNITS_PER_METRE;
        matrix.makeScale(thick, building.height * (0.06 + b * 0.1), thick);
        matrix.setPosition(
          (footprint.minX + footprint.maxX) / 2,
          building.height,
          (footprint.minZ + footprint.maxZ) / 2,
        );
        masts.setMatrixAt(mastCount++, matrix);
      }
    }

    plant.count = plantCount;
    masts.count = mastCount;
    plant.instanceMatrix.needsUpdate = true;
    masts.instanceMatrix.needsUpdate = true;
    this.meshes.push(plant, masts);
  }

  private instanced(name: string, colour: string, capacity: number): THREE.InstancedMesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0); // origin at the base, so scale is height
    const material = new THREE.MeshLambertMaterial({ color: colour });
    this.owned.push(geometry, material);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  dispose(): void {
    for (const thing of this.owned) thing.dispose();
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
  }
}

/** The fractional part of a scaled seed. Two of these out of one variant. */
function fract(n: number): number {
  return n - Math.floor(n);
}
