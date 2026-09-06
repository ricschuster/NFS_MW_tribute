import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Rooftops } from './roofs';
import type { Building, BuildingKind } from '../city/types';

function building(over: Partial<Building> = {}): Building {
  return {
    footprint: { minX: 0, maxX: 2000, minZ: 0, maxZ: 3000 },
    height: 9000,
    kind: 'tower',
    district: 'downtown',
    variant: 0.4,
    ...over,
  };
}

/** Every placed instance of a mesh, as position and scale. */
function placed(mesh: THREE.InstancedMesh) {
  const out: { pos: THREE.Vector3; scale: THREE.Vector3 }[] = [];
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    matrix.decompose(pos, new THREE.Quaternion(), scale);
    out.push({ pos, scale });
  }
  return out;
}

const meshes = (buildings: Building[]) => {
  const roofs = new Rooftops(buildings);
  return { plant: roofs.meshes[0], masts: roofs.meshes[1] };
};

describe('what stands on the roofs', () => {
  it('stands on the roof, not through it or over it', () => {
    const b = building();
    const { plant } = meshes([b]);
    for (const item of placed(plant)) {
      expect(item.pos.y).toBeCloseTo(b.height, 6);
    }
  });

  it('stays on the building it belongs to', () => {
    const b = building();
    const { plant } = meshes([b]);
    for (const item of placed(plant)) {
      // Centre plus half the box has to be inside the footprint, or there is
      // plant hanging off the side of a tower.
      expect(item.pos.x - item.scale.x / 2).toBeGreaterThanOrEqual(b.footprint.minX);
      expect(item.pos.x + item.scale.x / 2).toBeLessThanOrEqual(b.footprint.maxX);
      expect(item.pos.z - item.scale.z / 2).toBeGreaterThanOrEqual(b.footprint.minZ);
      expect(item.pos.z + item.scale.z / 2).toBeLessThanOrEqual(b.footprint.maxZ);
    }
  });

  // A shed is usually the widest thing on its block, so the fraction that
  // gives a tower a plant room gives a warehouse a bungalow.
  it('keeps a warehouse s roof units in proportion', () => {
    const wide = { footprint: { minX: 0, maxX: 20000, minZ: 0, maxZ: 20000 }, variant: 0.4 };
    const tower = placed(meshes([building({ ...wide, kind: 'tower' })]).plant);
    const shed = placed(meshes([building({ ...wide, kind: 'shed', height: 900 })]).plant);
    expect(shed[0].scale.x).toBeLessThan(tower[0].scale.x);
  });

  it('puts masts only on towers, and not on all of those', () => {
    // Swept over the whole range rather than probed at one variant, so the
    // test does not have to know the hash that turns a variant into a choice.
    const sweep = (kind: BuildingKind) =>
      meshes(Array.from({ length: 200 }, (_, i) => building({ kind, variant: i / 200 }))).masts
        .count;
    const towers = sweep('tower');
    expect(towers).toBeGreaterThan(0);
    expect(towers).toBeLessThan(200);
    // A forest of aerials over midtown is worse than none.
    expect(sweep('block')).toBe(0);
    expect(sweep('shed')).toBe(0);
  });

  it('gives the same city the same roofs', () => {
    const city = [building({ variant: 0.13 }), building({ variant: 0.77 })];
    const first = placed(meshes(city).plant);
    const second = placed(meshes(city).plant);
    expect(second).toEqual(first);
  });

  // Not every roof: a box on all of them is as uniform as a box on none.
  it('leaves some roofs bare', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      building({ variant: i / 200, kind: 'block' }),
    );
    const { plant } = meshes(many);
    expect(plant.count).toBeGreaterThan(0);
    expect(plant.count).toBeLessThan(many.length);
  });
});
