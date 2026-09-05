import * as THREE from 'three';

/**
 * A strip of quads running away from the camera, rebuilt every frame.
 *
 * The road is still authored as the flat segment list in `road.ts`, so its 3D
 * geometry changes as the player moves through it. Rather than allocating new
 * geometry each frame, a Ribbon owns fixed buffers sized for the draw distance
 * and rewrites them in place.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;

  private readonly position: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  private readonly geometry: THREE.BufferGeometry;

  /** `crossSections` is the number of edges, so one more than the quad count. */
  constructor(crossSections: number, material: THREE.Material) {
    const vertices = crossSections * 2; // left and right of each edge
    this.position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    this.color = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    this.color.setUsage(THREE.DynamicDrawUsage);

    // Two triangles per quad, wound counter-clockwise seen from above so the
    // strip faces the camera. Winding them the other way leaves the road
    // back-face culled and the screen empty.
    const indices = new Uint32Array((crossSections - 1) * 6);
    for (let i = 0; i < crossSections - 1; i++) {
      const a = i * 2;
      indices.set([a, a + 3, a + 1, a, a + 2, a + 3], i * 6);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('color', this.color);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false; // the buffers move every frame
    this.mesh.renderOrder = 0;
  }

  /** Write one cross-section: its centre, half-width, height and colour. */
  setEdge(i: number, centreX: number, halfWidth: number, y: number, z: number, rgb: THREE.Color): void {
    const v = i * 2;
    this.position.setXYZ(v, centreX - halfWidth, y, z);
    this.position.setXYZ(v + 1, centreX + halfWidth, y, z);
    this.color.setXYZ(v, rgb.r, rgb.g, rgb.b);
    this.color.setXYZ(v + 1, rgb.r, rgb.g, rgb.b);
  }

  /** Draw only the first `crossSections` edges written this frame. */
  commit(crossSections: number): void {
    this.geometry.setDrawRange(0, Math.max(0, (crossSections - 1) * 6));
    this.position.needsUpdate = true;
    this.color.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
