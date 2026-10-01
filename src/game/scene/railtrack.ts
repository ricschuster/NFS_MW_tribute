import * as THREE from 'three';
import { TERRAIN_RENDER_STEP, UNITS_PER_METRE } from '../constants';
import type { City, CityRoad } from '../city/types';

/**
 * The track on a railway (#489): two lines of sleepers and rails down a road
 * whose surface is `rail`, over the ballast `carriageways` paints under them.
 *
 * Double track, because a main line is, and a railway is given the width
 * for it (`RAIL_LANES`); anything drawn narrower gets one track down its
 * middle rather than a second track off the edge of its ballast. The rails are drawn,
 * not solid: the sim drives the road under them like gravel, and a rail a
 * car could catch on would turn an escape route into a trap.
 *
 * The sleepers are one merged mesh with their uv measured *along* the line,
 * not an instanced quad with world uvs the way the ballast is: world uvs are
 * fixed to the map's axes, and sleepers have to run square to the track
 * whichever way it goes. The rails are instanced boxes, four to a piece.
 */

const M = UNITS_PER_METRE;
/** Centre of each track from the middle of the line, in metres, on a line wide enough for two. */
const TRACKS = [-2.25, 2.25];
/** Narrower than this and a line is one track down its middle. */
const DOUBLE_WIDTH = 7.5;
/** Half the gauge: standard gauge is 1.435 m between the rails. */
const RAIL_HALF = 0.72;
const SLEEPER_LENGTH = 2.6;
/** Sleeper spacing along the track. */
const SLEEPER_PITCH = 0.66;
/** Pad on each end of a piece, so two pieces at a bend meet without a gap. */
const PAD = 0.4;

export function railTrack(
  city: City,
  roads: readonly CityRoad[],
  groundUnder: (x: number, z: number) => number,
): { meshes: THREE.Object3D[]; owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] } {
  const pieces: { a: THREE.Vector3; b: THREE.Vector3; from: number; tracks: number[] }[] = [];
  for (const road of roads) {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const steps = Math.max(1, Math.ceil(road.length / TERRAIN_RENDER_STEP));
    const tracks = road.width / M >= DOUBLE_WIDTH ? TRACKS : [0];
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const ax = a.x + (b.x - a.x) * t0;
      const az = a.z + (b.z - a.z) * t0;
      const bx = a.x + (b.x - a.x) * t1;
      const bz = a.z + (b.z - a.z) * t1;
      pieces.push({
        a: new THREE.Vector3(ax, groundUnder(ax, az), az),
        b: new THREE.Vector3(bx, groundUnder(bx, bz), bz),
        from: (road.length * t0) / M,
        tracks,
      });
    }
  }
  if (pieces.length === 0) return { meshes: [], owned: [] };

  const up = new THREE.Vector3(0, 1, 0);
  const frame = (a: THREE.Vector3, b: THREE.Vector3) => {
    const forward = new THREE.Vector3().subVectors(b, a).normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const normal = new THREE.Vector3().crossVectors(forward, right).normalize();
    return { forward, right, normal };
  };

  // Sleepers: one quad per track per piece, uv v counting sleepers along it.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const { a, b, from, tracks } of pieces) {
    const { forward, right, normal } = frame(a, b);
    const length = a.distanceTo(b) / M;
    for (const track of tracks) {
      const base = positions.length / 3;
      for (const [along, v] of [
        [-PAD, (from - PAD) / SLEEPER_PITCH],
        [length + PAD, (from + length + PAD) / SLEEPER_PITCH],
      ]) {
        for (const [side, u] of [
          [-SLEEPER_LENGTH / 2, 0],
          [SLEEPER_LENGTH / 2, 1],
        ]) {
          const p = a
            .clone()
            .addScaledVector(forward, along * M)
            .addScaledVector(right, (track + side) * M)
            .addScaledVector(normal, 0.06 * M);
          positions.push(p.x, p.y, p.z);
          normals.push(normal.x, normal.y, normal.z);
          uvs.push(u, v);
        }
      }
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const sleeperGeometry = new THREE.BufferGeometry();
  sleeperGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sleeperGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  sleeperGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  sleeperGeometry.setIndex(indices);
  const sleeperTexture = new THREE.CanvasTexture(sleeperTile());
  sleeperTexture.wrapS = THREE.ClampToEdgeWrapping;
  sleeperTexture.wrapT = THREE.RepeatWrapping;
  sleeperTexture.anisotropy = 8;
  sleeperTexture.colorSpace = THREE.SRGBColorSpace;
  const sleeperMaterial = new THREE.MeshLambertMaterial({
    map: sleeperTexture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const sleepers = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
  sleepers.name = 'rail-sleepers';
  sleepers.receiveShadow = true;

  // Rails: a unit box per rail per piece, scaled and pitched to the piece.
  const railGeometry = new THREE.BoxGeometry(1, 1, 1);
  const railMaterial = new THREE.MeshLambertMaterial({ color: '#8f9498' });
  const count = pieces.reduce((sum, piece) => sum + piece.tracks.length * 2, 0);
  const rails = new THREE.InstancedMesh(railGeometry, railMaterial, count);
  rails.name = 'rail-rails';
  rails.castShadow = true;
  const matrix = new THREE.Matrix4();
  let i = 0;
  for (const { a, b, tracks } of pieces) {
    const { forward, right, normal } = frame(a, b);
    const length = a.distanceTo(b) + 2 * PAD * M;
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    for (const track of tracks) {
      for (const rail of [-RAIL_HALF, RAIL_HALF]) {
        matrix.makeBasis(
          right.clone().multiplyScalar(0.08 * M),
          normal.clone().multiplyScalar(0.16 * M),
          forward.clone().multiplyScalar(length),
        );
        const at = mid
          .clone()
          .addScaledVector(right, (track + rail) * M)
          .addScaledVector(normal, 0.18 * M);
        matrix.setPosition(at);
        rails.setMatrixAt(i++, matrix);
      }
    }
  }
  rails.instanceMatrix.needsUpdate = true;

  return {
    meshes: [sleepers, rails],
    owned: [sleeperGeometry, sleeperMaterial, sleeperTexture, railGeometry, railMaterial],
  };
}

/** One sleeper across the tile, the rest of it see-through to the ballast. */
function sleeperTile(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = '#4a3f35';
  ctx.fillRect(0, 8, 32, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 18, 32, 2);
  return canvas;
}
