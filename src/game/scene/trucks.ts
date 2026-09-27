import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UNITS_PER_METRE } from '../constants';
import type { GraphCar } from '../graphcar';
import { haulTruckParts } from './setpieces';

const M = UNITS_PER_METRE;

/**
 * The quarry's moving haul trucks (#330), drawn with the same model as the
 * parked ones (`scene/setpieces.ts`), which is what keeps a truck that is
 * driving and a truck that is standing looking like the same machine.
 *
 * Built once, parts merged by colour, and each truck is a group of meshes that
 * share those geometries: four trucks are four transforms, and the sim says
 * where each one is. Nothing here knows how they got there.
 */
export class CityTrucks {
  readonly group = new THREE.Group();
  private readonly trucks: THREE.Group[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(count: number) {
    const byColour = new Map<string, THREE.BufferGeometry[]>();
    for (const part of haulTruckParts()) {
      if (!byColour.has(part.colour)) byColour.set(part.colour, []);
      byColour.get(part.colour)!.push(part.geometry);
    }
    const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
    for (const [colour, geometries] of byColour) {
      const geometry = mergeGeometries(geometries.map((g) => (g.index ? g.toNonIndexed() : g)));
      for (const g of geometries) g.dispose();
      const material = new THREE.MeshLambertMaterial({ color: colour });
      this.owned.push(geometry, material);
      parts.push({ geometry, material });
    }
    for (let i = 0; i < count; i++) {
      const truck = new THREE.Group();
      for (const { geometry, material } of parts) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        truck.add(mesh);
      }
      truck.scale.setScalar(M);
      truck.visible = false;
      truck.name = 'haul-truck';
      this.trucks.push(truck);
      this.group.add(truck);
    }
  }

  /** Put each truck where the sim has it. */
  update(cars: readonly GraphCar[]): void {
    this.trucks.forEach((truck, i) => {
      const car = cars[i];
      truck.visible = !!car;
      if (!car) return;
      truck.position.set(car.x, car.y, car.z);
      truck.rotation.y = car.heading;
    });
  }

  dispose(): void {
    for (const thing of this.owned) thing.dispose();
  }
}
