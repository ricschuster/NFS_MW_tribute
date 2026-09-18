import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UNITS_PER_METRE } from '../constants';
import type { SetPiece, SetPieceKind } from '../city/types';

const M = UNITS_PER_METRE;

/**
 * The set pieces (#295), on the same provider seam as everything else:
 * `city/setpieces.ts` says where each one stands and what it is solid as, and
 * this says what it looks like.
 *
 * Every model is a handful of primitives in metres, built once per kind with
 * its length along +z and its front at +z - the frame the editor draws and the
 * sim collides in - and instanced at `UNITS_PER_METRE` scale. Parts are merged
 * by colour, so a kind is one draw call per colour however many are placed.
 * Boxes and cylinders for now, the way the buildings started (#11): what these
 * have to get right first is their size and where they stand.
 */

type Part = { geometry: THREE.BufferGeometry; colour: string };

const WEATHERED = '#7b8185';
const DARK_METAL = '#4b5054';
const RUST = '#8a5a3c';
const CONCRETE = '#9b9b92';
const DIRT = '#6b5a42';

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
/** A cylinder lying along z, `top` at the +z end. */
const tube = (top: number, bottom: number, length: number, segments = 12) =>
  new THREE.CylinderGeometry(top, bottom, length, segments).rotateX(Math.PI / 2);
const upright = (top: number, bottom: number, height: number, segments = 14) =>
  new THREE.CylinderGeometry(top, bottom, height, segments);

function cargoPlane(): Part[] {
  // High-winged, belly on the ground, as the one the Cargo Plane Jump clears.
  const body = [
    at(tube(2.2, 2.2, 22), 0, 2.2, 0),
    at(tube(0.7, 2.2, 4), 0, 2.2, 13),
    at(tube(2.2, 0.9, 6), 0, 2.6, -14),
    at(box(32, 0.45, 4), 0, 4.7, 2),
    at(box(0.4, 5.5, 3.6), 0, 6.2, -15.5),
    at(box(11, 0.3, 2.4), 0, 5, -16),
  ];
  const engines = [-6.5, 6.5].flatMap((x) => [
    at(tube(0.9, 0.9, 4.5), x, 4.1, 3.2),
    at(box(0.25, 4.2, 0.2), x, 4.1, 5.6),
    at(box(4.2, 0.25, 0.2), x, 4.1, 5.6),
  ]);
  return [...body.map((geometry) => ({ geometry, colour: WEATHERED })), ...engines.map((geometry) => ({ geometry, colour: DARK_METAL }))];
}

function noseBuried(): Part[] {
  // Built level, then tipped nose-down about its middle and lifted so the
  // nose ends up a metre and a half into the ground and the tail in the air.
  const tip = THREE.MathUtils.degToRad(32);
  const half = 8;
  const lift = half * Math.sin(tip) - 1.5;
  const tilt = new THREE.Matrix4().makeTranslation(0, lift, 0).multiply(new THREE.Matrix4().makeRotationX(tip));
  const plane = [
    at(tube(1.9, 1.9, 13), 0, 0, 0.5),
    at(tube(1.9, 0.7, 3), 0, 0, -7.5),
    at(box(28, 0.4, 3.4), 0, -0.6, 1.5),
    at(box(0.35, 4, 2.6), 0, 2.4, -7.5),
    at(box(9, 0.3, 2), 0, 0.6, -7.8),
  ].map((g) => g.applyMatrix4(tilt));
  const mound = at(new THREE.ConeGeometry(4.5, 2.2, 12), 0, 1.1, half * Math.cos(tip));
  return [...plane.map((geometry) => ({ geometry, colour: WEATHERED })), { geometry: mound, colour: DIRT }];
}

function fuselage(): Part[] {
  const hull = tube(2, 2, 16).rotateZ(0.3);
  const torn = tube(2, 1.6, 2).rotateZ(0.3);
  return [
    { geometry: at(hull, 0, 1.8, 0), colour: WEATHERED },
    { geometry: at(torn, 0, 1.8, 8.6), colour: DARK_METAL },
  ];
}

function hungFuselage(): Part[] {
  const frames = [-7.3, 7.3].flatMap((z) => [
    at(box(0.5, 8.4, 0.5), -3.5, 4.2, z),
    at(box(0.5, 8.4, 0.5), 3.5, 4.2, z),
    at(box(7.5, 0.5, 0.5), 0, 8.3, z),
    at(box(0.12, 2, 0.12), 0, 7.2, z),
  ]);
  const plane = [at(tube(2, 2, 18), 0, 5.8, 0), at(tube(0.6, 2, 3), 0, 5.8, 10.5), at(tube(2, 0.8, 3), 0, 6.1, -10.5), at(box(12, 0.3, 2.8), 0, 5.2, 1)];
  return [...frames.map((geometry) => ({ geometry, colour: RUST })), ...plane.map((geometry) => ({ geometry, colour: WEATHERED }))];
}

function helicopter(): Part[] {
  const body = [
    at(box(2.6, 2.4, 5), 0, 1.7, 1.5),
    at(tube(0.8, 1.3, 1.8), 0, 1.5, 4.9),
    at(box(0.5, 0.6, 8), 0, 2.3, -5),
    at(box(0.2, 1.8, 1.1), 0, 3, -8.8),
    at(upright(0.2, 0.2, 0.8, 6), 0, 3.3, 1.5),
  ];
  const rotor = [at(box(14, 0.1, 0.4), 0, 3.7, 1.5), at(box(0.4, 0.1, 14), 0, 3.7, 1.5)];
  const skids = [-1.2, 1.2].map((x) => at(box(0.15, 0.15, 4.8), x, 0.2, 1.5));
  const pad = at(upright(8, 8, 0.12, 24), 0, 0.06, 0);
  return [
    ...body.map((geometry) => ({ geometry, colour: '#56604c' })),
    ...[...rotor, ...skids].map((geometry) => ({ geometry, colour: DARK_METAL })),
    { geometry: pad, colour: CONCRETE },
  ];
}

function silo(): Part[] {
  return [
    { geometry: at(upright(4, 4, 16, 18), 0, 8, 0), colour: '#9aa3a3' },
    { geometry: at(new THREE.ConeGeometry(4.2, 2.6, 18), 0, 17.3, 0), colour: '#7f8888' },
  ];
}

function waterTower(): Part[] {
  const legs = [-3.5, 3.5].flatMap((x) => [-3.5, 3.5].map((z) => at(box(0.5, 14.5, 0.5), x, 7.25, z)));
  const braces = [at(box(7.5, 0.3, 0.3), 0, 7, -3.5), at(box(7.5, 0.3, 0.3), 0, 7, 3.5), at(box(0.3, 0.3, 7.5), -3.5, 7, 0), at(box(0.3, 0.3, 7.5), 3.5, 7, 0)];
  return [
    ...[...legs, ...braces].map((geometry) => ({ geometry, colour: '#5f4a3a' })),
    { geometry: at(upright(4.3, 4.3, 5.5, 18), 0, 17.2, 0), colour: RUST },
    { geometry: at(new THREE.ConeGeometry(4.5, 2.2, 18), 0, 21, 0), colour: '#734a33' },
  ];
}

function crane(): Part[] {
  const steel = [
    at(box(1.6, 24, 1.6), 0, 12.5, 0),
    at(box(1.2, 1.2, 30), 0, 25, 12),
    at(box(1.2, 1, 9), 0, 25, -7.5),
    at(box(2.2, 2.2, 2.2), 0, 23.6, 1.6),
    at(box(0.1, 10, 0.1), 0, 19.5, 22),
  ];
  return [
    ...steel.map((geometry) => ({ geometry, colour: '#b79a3a' })),
    { geometry: at(box(2.6, 2.2, 2.4), 0, 24, -11.5), colour: CONCRETE },
    { geometry: at(box(6, 1, 6), 0, 0.5, 0), colour: CONCRETE },
  ];
}

function mast(): Part[] {
  return [
    { geometry: at(upright(0.35, 1.5, 30, 4).rotateY(Math.PI / 4), 0, 15.5, 0), colour: '#a3a7a9' },
    { geometry: at(box(0.5, 0.5, 0.5), 0, 30.8, 0), colour: '#b8433a' },
    { geometry: at(box(4, 0.6, 4), 0, 0.3, 0), colour: CONCRETE },
  ];
}

function bunker(): Part[] {
  return [
    { geometry: at(box(12, 3, 8), 0, 1.5, 0), colour: CONCRETE },
    { geometry: at(box(13, 0.6, 9), 0, 3.3, 0), colour: '#8c8c84' },
    { geometry: at(box(2.2, 2.2, 0.2), 0, 1.1, 4.02), colour: '#2a2a28' },
  ];
}

function blastWall(): Part[] {
  return [
    { geometry: at(box(6, 3.6, 0.8), 0, 2.1, 0), colour: '#a3a39a' },
    { geometry: at(box(6, 0.5, 2.4), 0, 0.25, 0), colour: '#a3a39a' },
  ];
}

function shed(): Part[] {
  // A gable roof is a three-sided cylinder lying along the shed, flattened.
  const r = 5.6;
  const roof = new THREE.CylinderGeometry(r, r, 14.6, 3).rotateX(-Math.PI / 2).scale(1, 0.34, 1);
  return [
    { geometry: at(box(9, 4.5, 14), 0, 2.25, 0), colour: '#7a5a44' },
    { geometry: at(roof, 0, 4.5 + (r / 2) * 0.34, 0), colour: '#8b4f33' },
    { geometry: at(box(4, 3.4, 0.2), 0, 1.7, 7.02), colour: '#2e2a26' },
  ];
}

function cone(): Part[] {
  return [
    { geometry: at(new THREE.ConeGeometry(0.28, 0.75, 10), 0, 0.42, 0), colour: '#e0661f' },
    { geometry: at(box(0.45, 0.05, 0.45), 0, 0.025, 0), colour: '#1d1d1d' },
  ];
}

function tree(): Part[] {
  const needles = [
    at(new THREE.ConeGeometry(3, 5, 9), 0, 4.8, 0),
    at(new THREE.ConeGeometry(2.4, 4.5, 9), 0, 7.2, 0),
    at(new THREE.ConeGeometry(1.6, 4, 9), 0, 9.6, 0),
  ];
  return [
    { geometry: at(upright(0.3, 0.4, 3, 7), 0, 1.5, 0), colour: '#4a3526' },
    ...needles.map((geometry) => ({ geometry, colour: '#2e5234' })),
  ];
}

const MODELS: Record<SetPieceKind, () => Part[]> = {
  'plane-belly': cargoPlane,
  'plane-nose': noseBuried,
  fuselage,
  'fuselage-hung': hungFuselage,
  helicopter,
  silo,
  'water-tower': waterTower,
  crane,
  mast,
  bunker,
  'blast-wall': blastWall,
  shed,
  cone,
  tree,
};

/**
 * A tree's size, from its heading, so a clump is not fifty copies of one
 * tree. The heading is already scattered, so it serves as the seed and the
 * data does not need a field for it.
 */
const treeScale = (angle: number) => 0.8 + (((Math.sin(angle * 12.9898) * 43758.5453) % 1) + 1) % 1 * 0.55;

export class CitySetPieces {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(pieces: readonly SetPiece[]) {
    const byKind = new Map<SetPieceKind, SetPiece[]>();
    for (const piece of pieces) {
      if (!byKind.has(piece.kind)) byKind.set(piece.kind, []);
      byKind.get(piece.kind)!.push(piece);
    }

    const dummy = new THREE.Object3D();
    for (const [kind, list] of byKind) {
      const parts = MODELS[kind]();
      const byColour = new Map<string, THREE.BufferGeometry[]>();
      for (const part of parts) {
        if (!byColour.has(part.colour)) byColour.set(part.colour, []);
        byColour.get(part.colour)!.push(part.geometry);
      }
      for (const [colour, geometries] of byColour) {
        const geometry = mergeGeometries(geometries.map((g) => (g.index ? g.toNonIndexed() : g)));
        for (const g of geometries) g.dispose();
        const material = new THREE.MeshLambertMaterial({ color: colour });
        this.owned.push(geometry, material);

        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        mesh.name = `setpiece-${kind}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        for (let i = 0; i < list.length; i++) {
          const piece = list[i];
          dummy.position.set(piece.at.x, piece.y, piece.at.z);
          dummy.rotation.set(0, piece.angle, 0);
          dummy.scale.setScalar(M * (kind === 'tree' ? treeScale(piece.angle) : 1));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.meshes.push(mesh);
      }
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const thing of this.owned) thing.dispose();
  }
}
