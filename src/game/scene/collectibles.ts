import * as THREE from 'three';
import {
  UNITS_PER_METRE,
  BILLBOARD_WIDTH,
  BILLBOARD_HEIGHT,
  BILLBOARD_POST,
  CAMERA_HEIGHT_ABOVE,
} from '../constants';
import type { Collectible } from '../city/types';

const M = UNITS_PER_METRE;

/**
 * The provider for billboards and speed cameras (#93), on the same seam as the
 * buildings and the street furniture: the city says one stands here facing
 * that way, and this decides what it looks like.
 *
 * One instanced mesh per part, which is what makes ninety billboards free. A
 * smashed board is hidden by scaling its instance to nothing rather than by
 * rebuilding the mesh - the frame stays, which is what a smashed billboard
 * looks like, and the update is one matrix rather than a hundred and twenty.
 */
export class CityCollectibles {
  readonly meshes: THREE.InstancedMesh[] = [];

  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private readonly billboards: Collectible[];
  /** Boards already hidden, so a frame that changes nothing costs nothing. */
  private readonly hidden = new Set<number>();
  private faces: THREE.InstancedMesh | null = null;

  constructor(items: Collectible[]) {
    this.billboards = items.filter((c) => c.kind === 'billboard');
    const cameras = items.filter((c) => c.kind === 'camera');

    // Chunky enough to read as a hoarding leg from across the street. A
    // smashed board leaves this standing, so it is also the only thing telling
    // you which ones you have already had.
    this.add('billboard-posts', this.billboards, '#4a4f56', 1.1 * M, BILLBOARD_POST, 0.9 * M, 0);
    this.faces = this.add(
      'billboard-faces',
      this.billboards,
      '#e8e2d2',
      BILLBOARD_WIDTH,
      BILLBOARD_HEIGHT,
      0.35 * M,
      BILLBOARD_POST,
    );

    this.add('camera-posts', cameras, '#3d4249', 0.28 * M, CAMERA_HEIGHT_ABOVE, 0.28 * M, 0);
    // The head sits on a short arm over the road, which is what makes a camera
    // read as a camera and not as another lamp post.
    this.add(
      'camera-heads',
      cameras,
      '#f0d24a',
      0.9 * M,
      0.7 * M,
      1.4 * M,
      CAMERA_HEIGHT_ABOVE * 0.92,
    );
  }

  /** One instanced box per item, stood at `base` above the road it belongs to. */
  private add(
    name: string,
    items: Collectible[],
    colour: string,
    width: number,
    height: number,
    depth: number,
    base: number,
  ): THREE.InstancedMesh | null {
    if (items.length === 0) return null;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({ color: colour });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = name;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      dummy.position.set(item.at.x, item.y + base + height / 2, item.at.z);
      dummy.rotation.set(0, item.angle, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.meshes.push(mesh);
    return mesh;
  }

  /**
   * Take the faces off the billboards that have been smashed.
   *
   * Only the face goes: the posts stay standing, so a smashed billboard is a
   * bare frame rather than a hole where a landmark used to be. It is also how
   * you can tell at a glance which ones you have already had.
   */
  setSmashed(smashed: ReadonlySet<number>): void {
    const faces = this.faces;
    if (!faces || smashed.size === this.hidden.size) return;

    const dummy = new THREE.Object3D();
    let changed = false;
    for (let i = 0; i < this.billboards.length; i++) {
      const id = this.billboards[i].id;
      if (!smashed.has(id) || this.hidden.has(id)) continue;
      this.hidden.add(id);
      dummy.position.set(0, -1e6, 0); // out of the world, and out of the shadow of it
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      faces.setMatrixAt(i, dummy.matrix);
      changed = true;
    }
    if (changed) faces.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const thing of this.owned) thing.dispose();
  }
}
