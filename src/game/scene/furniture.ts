import * as THREE from 'three';
import {
  UNITS_PER_METRE,
  LAMP_HEIGHT,
  SIGN_HEIGHT,
  BARRIER_HEIGHT,
  BARRIER_SPACING,
} from '../constants';
import type { StreetProp } from '../city/types';

const M = UNITS_PER_METRE;

/**
 * The provider for street furniture, on the same seam as the buildings: the
 * city says a lamp stands here facing that way, and this decides what a lamp
 * looks like. Swapping in modelled lamp posts later touches only this file.
 *
 * Each kind is one instanced mesh, or two where a piece needs two colours - a
 * lamp is a dark post and a bright head, and the head is most of what you
 * actually see at night.
 */
export class StreetFurniture {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(props: StreetProp[]) {
    const lamps = props.filter((p) => p.kind === 'lamp');
    const signs = props.filter((p) => p.kind === 'sign');
    const barriers = props.filter((p) => p.kind === 'barrier');

    // Posts share one geometry and one material across lamps and signs; only
    // their heights differ, and an instance can be scaled.
    this.add('lamp-posts', lamps, '#3a3f45', 0.22 * M, LAMP_HEIGHT, 0.22 * M, 0);
    this.add('lamp-heads', lamps, '#ffe9b8', 0.8 * M, 0.32 * M, 0.34 * M, LAMP_HEIGHT);
    this.add('sign-posts', signs, '#43484f', 0.16 * M, SIGN_HEIGHT, 0.16 * M, 0);
    this.add('sign-plates', signs, '#9fb4c4', 1.1 * M, 0.34 * M, 0.1 * M, SIGN_HEIGHT * 0.78);
    this.add('barriers', barriers, '#8d939a', BARRIER_SPACING, BARRIER_HEIGHT, 0.3 * M, 0);
  }

  /** One instanced box per prop, sized and stood at `base` above the road. */
  private add(
    name: string,
    props: StreetProp[],
    colour: string,
    width: number,
    height: number,
    depth: number,
    base: number,
  ): void {
    if (props.length === 0) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0); // origin at the base, so scale is height
    const material = new THREE.MeshLambertMaterial({ color: colour });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, props.length);
    mesh.name = name;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(width, height, depth);
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    props.forEach((prop, i) => {
      quaternion.setFromAxisAngle(up, prop.angle);
      position.set(prop.at.x, base, prop.at.z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    this.meshes.push(mesh);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const thing of this.owned) thing.dispose();
    this.meshes.length = 0;
  }
}
