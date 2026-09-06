import * as THREE from 'three';
import type { Building, BuildingKind } from '../city/types';
import { disposeFacades, facadeTexture, facadeUvs } from './facades';

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

/**
 * Per-district palettes. Colour is doing the work of texture for now.
 *
 * Pulled further apart in #75 so the districts read as places rather than as
 * one texture: cool grey-blue glass downtown, warm sand through midtown,
 * bleached blue-white along the water, and rust and dust out on the industrial
 * edge. The two light palettes are deliberately a shade off white - under a
 * bright sun with bloom over it, a white wall is a white rectangle.
 */
const PALETTE: Record<string, string[]> = {
  downtown: ['#7c8796', '#6b7887', '#8d99a8', '#5f6d7e', '#55697f'],
  midtown: ['#c0ad95', '#ac9a80', '#cdbfa8', '#9e8f79', '#b3a086'],
  waterfront: ['#c2cdd3', '#aebbc3', '#d2dbe0', '#a2b0b9'],
  industrial: ['#8a7566', '#9c8b78', '#77675a', '#a3907c'],
};

/**
 * Where a tower steps back, if it does.
 *
 * A tower that goes straight up for forty storeys is an extrusion, and a
 * skyline of them reads as one because every silhouette is the same shape at
 * a different size. Real towers step: the upper section is narrower and
 * starts partway up, which is the cheapest thing that makes two towers of the
 * same height look like two buildings.
 *
 * Towers only, and not all of them - a city where every tower steps is as
 * uniform as one where none do. Derived from `variant`, like the colour, so
 * the same seed gets the same skyline.
 *
 * The base keeps the full footprint the generator gave it, so nothing about
 * collision changes: the narrower part is above anything a car can reach.
 *
 * Exported so the rule can be tested without a canvas in the room - building
 * the meshes needs a facade texture, and a texture needs a DOM.
 */
export function setbackOf(
  building: Building,
  width: number,
  depth: number,
): { at: number; inset: number } | null {
  if (building.kind !== 'tower') return null;
  const a = building.variant * 11.13;
  const pick = a - Math.floor(a);
  if (pick < 0.45) return null;

  const b = building.variant * 5.77;
  const spread = b - Math.floor(b);
  return {
    at: building.height * (0.5 + spread * 0.28),
    // Inset off the *narrower* side, so a long thin tower does not step back
    // past its own centreline and vanish.
    inset: Math.min(width, depth) * (0.09 + pick * 0.11),
  };
}

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
      // The map is sampled in world units by the patch in `facades.ts`, not
      // through the geometry's own UVs, so that one window is one window on
      // every building however it is scaled.
      const material = new THREE.MeshLambertMaterial({ map: facadeTexture(kind) });
      facadeUvs(material, kind);
      const mesh = new THREE.InstancedMesh(geometry, material, group.length);
      mesh.name = `buildings:${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // The upper half of a stepped tower, in its own instanced mesh sharing
      // the same material. One extra draw call for the kind, and only the
      // towers that step have an instance in it.
      const upper = new THREE.InstancedMesh(geometry, material, Math.max(1, group.length));
      upper.name = `buildings:${kind}:upper`;
      upper.castShadow = true;
      upper.receiveShadow = true;
      let stepped = 0;

      group.forEach((building, i) => {
        const { footprint } = building;
        const width = footprint.maxX - footprint.minX;
        const depth = footprint.maxZ - footprint.minZ;
        const midX = (footprint.minX + footprint.maxX) / 2;
        const midZ = (footprint.minZ + footprint.maxZ) / 2;

        const palette = PALETTE[building.district] ?? PALETTE.midtown;
        colour.set(palette[Math.floor(building.variant * palette.length)] ?? palette[0]);
        // Nudge each building off its palette entry, so a row of them is not
        // one flat wall of the same grey.
        const shade = 0.88 + building.variant * 0.24;
        colour.multiplyScalar(shade);

        const step = setbackOf(building, width, depth);
        // Without a step this is the whole building, and with one it is the
        // base the upper section stands on. Either way it is the piece the
        // car can hit, and it keeps the full footprint the city gave it, so
        // collision sees exactly what it saw before.
        matrix.makeScale(width, step ? step.at : building.height, depth);
        matrix.setPosition(midX, 0, midZ);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, colour);

        if (step) {
          matrix.makeScale(width - step.inset * 2, building.height - step.at, depth - step.inset * 2);
          matrix.setPosition(midX, step.at, midZ);
          upper.setMatrixAt(stepped, matrix);
          upper.setColorAt(stepped, colour);
          stepped++;
        }
      });

      upper.count = stepped;
      upper.instanceMatrix.needsUpdate = true;
      if (upper.instanceColor) upper.instanceColor.needsUpdate = true;
      if (stepped > 0) this.meshes.push(upper);
      else upper.dispose();

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
    disposeFacades();
  }
}
