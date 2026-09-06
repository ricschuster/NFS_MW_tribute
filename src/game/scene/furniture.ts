import * as THREE from 'three';
import {
  UNITS_PER_METRE,
  LAMP_HEIGHT,
  SIGN_HEIGHT,
  BARRIER_HEIGHT,
  BARRIER_SPACING,
  LAMP_REACH,
} from '../constants';
import { signTexture } from './signage';
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
    // A street lamp reaches out over the carriageway; one standing straight up
    // with a box on top is a bollard with a light on it. The arm and the head
    // are pushed sideways in the prop's own frame, in the direction the
    // generator says the road is, which is the whole reason `reach` exists.
    this.add(
      'lamp-arms',
      lamps,
      '#3a3f45',
      LAMP_REACH,
      0.16 * M,
      0.16 * M,
      LAMP_HEIGHT - 0.16 * M,
      LAMP_REACH / 2,
    );
    this.add(
      'lamp-heads',
      lamps,
      '#ffe9b8',
      0.7 * M,
      0.3 * M,
      0.34 * M,
      LAMP_HEIGHT - 0.3 * M,
      LAMP_REACH,
    );
    this.add('sign-posts', signs, '#43484f', 0.16 * M, SIGN_HEIGHT, 0.16 * M, 0);
    // A plate with a face on it rather than a grey slab (#11). The texture is
    // a border and a bar, which is what a sign reads as at the distance one is
    // actually seen from; a legend would need a font, an atlas and a
    // per-instance uv to say something nobody can read at speed.
    this.add(
      'sign-plates',
      signs,
      '#ffffff',
      1.1 * M,
      0.34 * M,
      0.08 * M,
      SIGN_HEIGHT * 0.78,
      0,
      signTexture() ?? undefined,
    );
    // A second, smaller plate under the first. Two plates on a post is the
    // silhouette of a street corner; one is a lollipop.
    this.add('sign-plates:lower', signs, '#7f8a95', 0.7 * M, 0.2 * M, 0.07 * M, SIGN_HEIGHT * 0.58);

    // A bridge parapet, which is what these actually are (#84 puts them along
    // the bridge decks). Two things were wrong with the box.
    //
    // It was 6 m *across* the road and 0.3 m along it, because `add` rotates
    // local x to be across - that is how a lamp arm reaches over the
    // carriageway - and the length was being passed as the width. Every bridge
    // in Kestrel Bay had ribs sticking out sideways from the deck every six
    // metres.
    //
    // And a parapet is not one slab: it is a wall with a coping along the top,
    // slightly wider than the wall, which is the line you actually see from
    // the road.
    this.add('barrier-walls', barriers, '#8d939a', 0.3 * M, BARRIER_HEIGHT * 0.82, BARRIER_SPACING, 0);
    this.add(
      'barrier-coping',
      barriers,
      '#b4bac1',
      0.42 * M,
      BARRIER_HEIGHT * 0.18,
      BARRIER_SPACING,
      BARRIER_HEIGHT * 0.82,
    );
  }

  /**
   * One instanced box per prop, sized and stood at `base` above the road.
   *
   * `out` shifts the box sideways towards the road, in the prop's own rotated
   * frame: the angle turns +z along the street, so across it is local x, and
   * `reach` says which way. A prop with no side to it has `reach` 0 and is not
   * moved, whatever `out` says.
   */
  private add(
    name: string,
    props: StreetProp[],
    colour: string,
    width: number,
    height: number,
    depth: number,
    base: number,
    out = 0,
    map?: THREE.Texture,
  ): void {
    if (props.length === 0) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0); // origin at the base, so scale is height
    // A box's own uvs, not `worldUvs`: a sign plate is the same size on every
    // instance, so the face wants to be stretched onto it rather than tiled at
    // world scale like paving.
    const material = new THREE.MeshLambertMaterial({ color: colour, map });
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
      // Local x rotated into the world by the prop's own facing.
      const sideways = out * prop.reach;
      position.set(
        prop.at.x + Math.cos(prop.angle) * sideways,
        prop.y + base,
        prop.at.z - Math.sin(prop.angle) * sideways,
      );
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
