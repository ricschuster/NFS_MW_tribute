import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAR_WIDTH_WORLD } from '../constants';

/**
 * An authored car body (`?look=models`, ADR-0013 route D, #584).
 *
 * `tools/cars/kestrel.py` writes the .glb in metres with its nose on +z. The
 * loader keeps the contract the procedural cars already have: the paintable body
 * is a car's first child, the wheels are separate meshes flagged
 * `userData.wheel` (so `poseWheels` spins and steers them), and the lamps use
 * the names and unlit materials the night code looks for. Geometry is baked
 * into game units here, so a model costs nothing per frame.
 */

/** The model's own width, from the script's `HW`: body half-width 0.86 m. */
const MODEL_WIDTH = 1.72;
/** The procedural body is `half = w * 0.47` either side, so 0.94 of the car width. */
const BODY_SHARE = 0.94;

let source: THREE.Group | null = null;

/** Fetch and parse the model once. Resolves whether or not it loaded: the procedural car is the fallback. */
export async function loadKestrelModel(url = `${import.meta.env.BASE_URL}models/kestrel.glb`): Promise<void> {
  if (source) return;
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    source = gltf.scene;
  } catch (error) {
    console.warn('kestrel model not loaded, keeping the procedural car', error);
  }
}

export function hasKestrelModel(): boolean {
  return source !== null;
}

/** Darker low on the flank and at the ends: the dirt and shadow a sunlit car has under its sills. */
function shade(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const at = geometry.attributes.position;
  const rgb = new Float32Array(at.count * 3);
  for (let i = 0; i < at.count; i++) {
    const low = THREE.MathUtils.smoothstep(at.getY(i), box.min.y, box.min.y + (box.max.y - box.min.y) * 0.5);
    const end = 1 - THREE.MathUtils.smoothstep(Math.abs(at.getZ(i)), (box.max.z) * 0.7, box.max.z);
    const v = 0.55 + 0.45 * low * (0.8 + 0.2 * end);
    rgb.set([v, v, v], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
}

/** The meshes under one glTF node: a node with several materials loads as a group of primitives. */
function primitives(node: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  node.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) found.push(child as THREE.Mesh);
  });
  return found;
}

/**
 * The model as a new car's children, in game units.
 *
 * The loader splits a multi-material node into one mesh per material, so a
 * wheel is merged back into one mesh (it must spin as one), and the body is left
 * as primitives with the paint one first: `CarPool` and the view repaint
 * `children[0].material.color`, which wants a single material.
 */
export function kestrelParts(): THREE.Mesh[] | null {
  if (!source) return null;
  const k = (CAR_WIDTH_WORLD * BODY_SHARE) / MODEL_WIDTH;
  const out: THREE.Mesh[] = [];
  source.updateMatrixWorld(true);
  const nodes = new Map<string, THREE.Mesh[]>();
  for (const mesh of primitives(source)) {
    // The primitive's own name is the node's, or its parent group's.
    const owner = mesh.parent && mesh.parent !== source && !mesh.parent.name.startsWith('kestrel') ? mesh.parent : mesh;
    const name = (owner.name || mesh.name).toLowerCase();
    nodes.set(name, [...(nodes.get(name) ?? []), mesh]);
  }
  for (const [name, meshes] of nodes) {
    if (name.startsWith('wheel')) {
      // Built about its hub; the node's position is the hub.
      const hub = new THREE.Vector3().setFromMatrixPosition(meshes[0].matrixWorld);
      const geometry = mergeGeometries(meshes.map((m) => m.geometry.clone()), true);
      geometry.scale(k, k, k);
      geometry.computeBoundingSphere();
      const wheel = new THREE.Mesh(geometry, meshes.map((m) => m.material as THREE.Material));
      wheel.name = name;
      wheel.position.copy(hub).multiplyScalar(k);
      wheel.userData.wheel = true;
      wheel.userData.tyreRadius = geometry.boundingSphere?.radius ?? 0;
      out.push(wheel);
      continue;
    }
    for (const mesh of meshes) {
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).scale(k, k, k);
      // The paint is repainted per car, so each car owns its copy: shared, the
      // last car placed would colour every Kestrel in the city. Mirrors are
      // not repainted and stay the model's colour.
      const painted = (mesh.material as THREE.Material).name === 'paint';
      let own = mesh.material;
      if (painted) {
        // The procedural cars' lacquer (carshape.ts), so the two read as one
        // family under the sky, with the same baked dirt on the lower flank.
        own = new THREE.MeshPhysicalMaterial({
          roughness: 0.6, metalness: 0.05, envMapIntensity: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.55,
          specularIntensity: 0.15, vertexColors: true, name: 'paint',
        });
        shade(geometry);
      }
      const part = new THREE.Mesh(geometry, own);
      part.name = name;
      if (name.startsWith('lamp_head')) {
        part.material = new THREE.MeshBasicMaterial({ color: '#6f7481' });
        part.name = 'headlight';
      } else if (name.startsWith('lamp_tail') || name === 'tail_bar') {
        part.material = new THREE.MeshBasicMaterial({ color: '#ff4a38' });
      }
      out.push(part);
    }
  }
  // The paint first, as `CarPool.place` expects.
  const isPaint = (m: THREE.Mesh) => m.name === 'a_body' && (m.material as THREE.Material).name === 'paint';
  out.sort((a, b) => Number(isPaint(b)) - Number(isPaint(a)));
  return out;
}
