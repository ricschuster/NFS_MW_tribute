import * as THREE from 'three';
import type { Building, BuildingKind } from '../city/types';

/**
 * The seam between what the city says is there and what gets drawn (#84).
 *
 * The generator emits descriptions and never touches three.js. A provider
 * turns them into meshes. Today every kind is a scaled box; tomorrow a
 * provider can hand back a modelled mesh for `tower` and keep boxes for the
 * rest, and nothing in `city/` changes. That is the whole point: upgrading the
 * art has to be a module swap, not a rewrite.
 *
 * Whatever the geometry, it has to survive instancing, because there are
 * thousands of these and one draw call per building would be the frame budget
 * gone. `InstancedMesh` works with any geometry, so a provider groups by kind
 * and returns one instanced mesh per kind rather than one mesh per building.
 */
export interface BuildingProvider {
  /** One instanced mesh per kind present, ready to add to the scene. */
  build(buildings: Building[]): THREE.Object3D[];
  dispose(): void;
}

/** Per-district palettes. Colour is doing the work of texture for now. */
const PALETTE: Record<string, string[]> = {
  downtown: ['#8d97a6', '#7d8896', '#9aa5b3', '#6f7a88', '#69788c'],
  midtown: ['#b9a894', '#a89880', '#c4b7a4', '#9d8f7d', '#ad9d88'],
  waterfront: ['#cfd8dc', '#bcc9cf', '#dde5e8', '#aebcc4'],
  industrial: ['#8a7f72', '#9c9184', '#776f64', '#a39786'],
};

/**
 * The default provider: one box per building, instanced per kind.
 *
 * A box geometry is built with its origin at the centre of its base rather
 * than at its middle, so an instance can be scaled to a building's height
 * without also having to be lifted half of it off the ground.
 */
export class BoxBuildings implements BuildingProvider {
  private readonly meshes: THREE.InstancedMesh[] = [];

  build(buildings: Building[]): THREE.Object3D[] {
    const byKind = new Map<BuildingKind, Building[]>();
    for (const building of buildings) {
      const list = byKind.get(building.kind);
      if (list) list.push(building);
      else byKind.set(building.kind, [building]);
    }

    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();

    for (const [kind, group] of byKind) {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.translate(0, 0.5, 0); // origin at the base, so scale is height
      // Not `vertexColors`: an InstancedMesh colours itself from `instanceColor`,
      // and asking for vertex colours on a geometry that has none renders black.
      const material = new THREE.MeshLambertMaterial();
      const mesh = new THREE.InstancedMesh(geometry, material, group.length);
      mesh.name = `buildings:${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      group.forEach((building, i) => {
        const { footprint } = building;
        const width = footprint.maxX - footprint.minX;
        const depth = footprint.maxZ - footprint.minZ;
        matrix.makeScale(width, building.height, depth);
        matrix.setPosition(
          (footprint.minX + footprint.maxX) / 2,
          0,
          (footprint.minZ + footprint.maxZ) / 2,
        );
        mesh.setMatrixAt(i, matrix);

        const palette = PALETTE[building.district] ?? PALETTE.midtown;
        colour.set(palette[Math.floor(building.variant * palette.length)] ?? palette[0]);
        // Nudge each building off its palette entry, so a row of them is not
        // one flat wall of the same grey.
        const shade = 0.88 + building.variant * 0.24;
        mesh.setColorAt(i, colour.multiplyScalar(shade));
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.meshes.push(mesh);
    }

    return this.meshes;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.meshes.length = 0;
  }
}
