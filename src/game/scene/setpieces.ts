import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UNITS_PER_METRE } from '../constants';
import type { SetPiece, SetPieceKind } from '../city/types';
import { CHAPEL_GROWN, HOUSE_GROWN, PALAS_GROWN } from '../city/setpieces';

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

/** A heap of crushed rock, tipped from a conveyor: a cone with a lumpy shoulder. */
const HEAP = { grey: '#8e9092', sand: '#c4a875', rust: '#a4623f' } as const;
function stockpile(variant?: string): Part[] {
  const colour = HEAP[(variant as keyof typeof HEAP) ?? 'grey'] ?? HEAP.grey;
  return [
    { geometry: at(new THREE.ConeGeometry(11, 8.5, 16), 0, 4.25, 0), colour },
    { geometry: at(new THREE.ConeGeometry(6.5, 5.5, 12), 5.5, 2.75, 3), colour },
  ];
}

/** A belt climbing 14 m over 42, on trestles: 4 m clear at the low end, so a car passes under. */
function conveyor(): Part[] {
  const rise = 14;
  const run = 40;
  const tilt = Math.atan2(rise, run);
  const length = Math.hypot(rise, run) + 2;
  const heightAt = (v: number) => 4 + ((v + 20) * rise) / run;
  const legs = [-20, -7, 6, 19].flatMap((v) => [
    at(box(0.3, heightAt(v), 0.3), -0.75, heightAt(v) / 2, v),
    at(box(0.3, heightAt(v), 0.3), 0.75, heightAt(v) / 2, v),
    at(box(1.8, 0.25, 0.25), 0, heightAt(v) * 0.55, v),
  ]);
  // Rotated about its own middle, then lifted to the height of the trestles there.
  const mid = heightAt(0);
  const belt = box(1.6, 0.45, length).rotateX(-tilt).translate(0, mid + 0.3, 0);
  const rails = [-0.8, 0.8].map((x) => box(0.12, 0.5, length).rotateX(-tilt).translate(x, mid + 0.6, 0));
  return [
    ...legs.map((geometry) => ({ geometry, colour: '#d9a21b' })),
    { geometry: belt, colour: '#26282a' },
    ...rails.map((geometry) => ({ geometry, colour: '#9aa0a3' })),
  ];
}

const YELLOW = '#dfae22';
function haulTruck(): Part[] {
  const wheels = [-2.9, 2.9].flatMap((x) => [-2.6, 1.2, 3.6].map((z) => at(new THREE.CylinderGeometry(1.35, 1.35, 1.1, 14).rotateZ(Math.PI / 2), x, 1.35, z)));
  return [
    { geometry: at(box(3.4, 1.1, 10), 0, 1.9, 0), colour: DARK_METAL },
    { geometry: at(box(6.2, 2.6, 6.8), 0, 3.7, -1.4), colour: YELLOW },
    { geometry: at(box(6.4, 0.5, 7.2), 0, 5.2, -1.4), colour: '#c6961c' },
    { geometry: at(box(3.6, 2.4, 2.8), 0, 3.4, 3.7), colour: YELLOW },
    { geometry: at(box(3.2, 1, 0.15), 0, 3.8, 5.15), colour: '#1f2a30' },
    ...wheels.map((geometry) => ({ geometry, colour: '#1c1c1c' })),
  ];
}

function excavator(): Part[] {
  const boom = at(box(0.7, 0.8, 6.5), 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.55)).translate(0, 4.4, 5.2);
  const arm = at(box(0.5, 0.6, 4.2), 0, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(0.9)).translate(0, 5.2, 8.3);
  return [
    ...[-1.55, 1.55].map((x) => ({ geometry: at(box(1.1, 1.1, 5.2), x, 0.55, 0), colour: '#2b2b2b' })),
    { geometry: at(box(3.4, 1.3, 4.4), 0, 1.75, 0), colour: YELLOW },
    { geometry: at(box(2.1, 1.9, 2), 0, 3.35, 0.9), colour: YELLOW },
    { geometry: at(box(1.9, 1.1, 0.12), 0, 3.5, 1.95), colour: '#1f2a30' },
    { geometry: at(box(2.6, 1.2, 1.4), 0, 2.4, -2), colour: '#c6961c' },
    { geometry: boom, colour: YELLOW },
    { geometry: arm, colour: YELLOW },
    { geometry: at(box(1.5, 1, 1.1), 0, 3.6, 10.2), colour: DARK_METAL },
  ];
}

function cabin(): Part[] {
  return [
    { geometry: at(box(3, 2.7, 8.4), 0, 1.4, 0), colour: '#d7d9d6' },
    { geometry: at(box(3.2, 0.2, 8.6), 0, 2.8, 0), colour: '#b9bcb8' },
    { geometry: at(box(0.15, 1.1, 1.4), 1.52, 1.5, -1.6), colour: '#3a4a52' },
    { geometry: at(box(0.15, 1.1, 1.4), 1.52, 1.5, 1.6), colour: '#3a4a52' },
    { geometry: at(box(0.15, 1.9, 0.9), -1.52, 1.1, 3), colour: '#5a4a38' },
  ];
}

/** A hopper on steel legs, feeding a crusher: the rust-red shape at the end of a belt. */
function crusher(): Part[] {
  const legs = [-3, 3].flatMap((x) => [-3, 3].map((z) => at(box(0.6, 4, 0.6), x, 2, z)));
  return [
    ...legs.map((geometry) => ({ geometry, colour: DARK_METAL })),
    { geometry: at(box(7.6, 3.2, 7.6), 0, 5.6, 0), colour: RUST },
    { geometry: at(new THREE.CylinderGeometry(4.6, 2.2, 3.4, 4, 1, false).rotateY(Math.PI / 4), 0, 8.9, 0), colour: '#7a4c33' },
    { geometry: at(box(1.2, 5, 1.2), 3.4, 8.6, -3.4), colour: '#9aa0a3' },
  ];
}

/** Blasted rock along the road edge: a few low lumps, none of them round. */
function rubble(): Part[] {
  const lump = (x: number, z: number, r: number, h: number) => at(new THREE.ConeGeometry(r, h, 5), x, h / 2, z);
  return [
    { geometry: lump(0, 0, 2.1, 1.7), colour: '#b3afa4' },
    { geometry: lump(1.7, 0.9, 1.4, 1.1), colour: '#9c988d' },
    { geometry: lump(-1.4, 1.2, 1.2, 0.9), colour: '#c2beb2' },
    { geometry: lump(0.4, -1.7, 1.3, 1), colour: '#a5a196' },
  ];
}

/**
 * A row of forty-foot containers, twelve side by side and stacked two to four
 * high (#410). Coloured the way a real yard is, a few shipping lines' colours
 * in no order, so a block is not a brick. The colours are a fixed pattern
 * rather than per instance - one mesh per colour is what keeps five hundred
 * blocks to a handful of draw calls - and the pattern shifts with each tier.
 */
const CONTAINER_COLOURS = ['#9c3b2b', '#2f5d8a', '#3c6e47', '#b5652a', '#8a8f93', '#c9a227', '#6b3f73', '#d8d6cf'];
function containerBlock(variant?: string): Part[] {
  const tiers = variant === 'four high' ? 4 : variant === 'three high' ? 3 : 2;
  const parts: Part[] = [];
  for (let tier = 0; tier < tiers; tier++) {
    for (let i = 0; i < 12; i++) {
      const colour = CONTAINER_COLOURS[(i * 5 + tier * 3 + (i >> 2)) % CONTAINER_COLOURS.length];
      parts.push({ geometry: at(box(2.38, 2.55, 12.2), -13.42 + i * 2.44, 1.3 + tier * 2.6, 0), colour });
    }
  }
  return parts;
}

/**
 * A ship-to-shore crane: four legs on rails 28 m apart, straddling the quay
 * road, a portal over it, and the boom reaching out over the water on +x with
 * its backreach over the yard. The tallest thing on the wharf, which is the
 * point: it is how a player finds the docks from across the bay.
 */
function stsCrane(): Part[] {
  const legs = [-14, 14].flatMap((x) => [-12, 12].map((z) => at(box(1.4, 38, 1.4), x, 19, z)));
  const frame = [
    at(box(30, 2, 1.6), 0, 36, -12),
    at(box(30, 2, 1.6), 0, 36, 12),
    at(box(1.6, 2, 26), -14, 37, 0),
    at(box(1.6, 2, 26), 14, 37, 0),
    at(box(1.4, 1, 24), -14, 1.5, 0),
    at(box(1.4, 1, 24), 14, 1.5, 0),
  ];
  const boom = [at(box(85, 2.4, 2.4), 17.5, 41, -1.5), at(box(85, 2.4, 2.4), 17.5, 41, 1.5), at(box(3, 16, 3), -4, 50, 0)];
  const stays = [
    at(box(0.5, 0.5, 30).rotateY(Math.PI / 2).rotateZ(-0.52), 9, 49, 0),
    at(box(0.5, 0.5, 30).rotateY(Math.PI / 2).rotateZ(0.52), -15, 49, 0),
  ];
  return [
    ...[...legs, ...frame, ...boom, ...stays].map((geometry) => ({ geometry, colour: '#c8452f' })),
    { geometry: at(box(8, 5, 6), -10, 44.5, 0), colour: '#d9d6cc' },
    { geometry: at(box(3, 3, 3), 6, 38.5, 0), colour: '#3a4a52' },
  ];
}

/** A portal-frame shed: clad walls, a shallow roof, and loading doors down the long side. */
function warehouse(variant?: string): Part[] {
  const [w, l, h] = variant === 'small' ? [30, 60, 10] : [50, 130, 14];
  const doors = Math.floor(l / 16);
  const parts: Part[] = [
    { geometry: at(box(w, h, l), 0, h / 2, 0), colour: '#9aa3a8' },
    { geometry: at(box(w + 1.2, 0.8, l + 1.2), 0, h + 0.4, 0), colour: '#6f787d' },
    { geometry: at(box(w * 0.5, 1.6, l), 0, h + 1.2, 0), colour: '#6f787d' },
  ];
  for (let i = 0; i < doors; i++) {
    parts.push({ geometry: at(box(0.2, 5, 5), w / 2 + 0.1, 2.5, -l / 2 + 8 + i * 16), colour: '#2e3538' });
  }
  return parts;
}

/** Four tall legs and a frame on top: it drives over a container and picks it up. */
function straddleCarrier(): Part[] {
  const legs = [-2.2, 2.2].flatMap((x) => [-4.2, 4.2].map((z) => at(box(0.7, 13, 0.7), x, 6.5, z)));
  return [
    ...legs.map((geometry) => ({ geometry, colour: '#e0b21a' })),
    { geometry: at(box(5, 1.5, 9.5), 0, 13.8, 0), colour: '#e0b21a' },
    { geometry: at(box(1.8, 2, 2.2), 1.6, 15.5, 3.4), colour: '#3a4a52' },
    ...[-2.2, 2.2].flatMap((x) => [-4.2, 4.2].map((z) => ({ geometry: at(box(0.9, 1.2, 1.2), x, 0.6, z), colour: '#222222' }))),
  ];
}

/** A heavy forklift with a telescopic boom: the thing that stacks the corner of a yard. */
function reachStacker(): Part[] {
  return [
    { geometry: at(box(4.2, 2.4, 9), 0, 1.9, 0), colour: '#e0b21a' },
    { geometry: at(box(2, 2.2, 2.2), 1, 4.1, -2), colour: '#3a4a52' },
    { geometry: at(box(1, 1, 10).rotateX(-0.35), 0, 5.2, 2.5), colour: '#e0b21a' },
    { geometry: at(box(4.4, 0.6, 1), 0, 7, 6.8), colour: DARK_METAL },
    ...[-1.8, 1.8].flatMap((x) => [-3, 3].map((z) => ({ geometry: at(tube(1, 1, 0.8).rotateY(Math.PI / 2), x, 1, z), colour: '#222222' }))),
  ];
}

const STONE = '#8d877a';
const STONE_DARK = '#6f6a5f';

/**
 * A length of the fort's wall (#454): dressed stone, twenty metres, with a
 * walkway and merlons along the top. Broken down, it stands a little over
 * three metres with its top gone ragged - the ruin you can see over and
 * cannot drive through.
 */
function rampart(variant?: string): Part[] {
  if (variant === 'broken') {
    return [
      { geometry: at(box(3, 2.4, 20), 0, 1.2, 0), colour: STONE },
      { geometry: at(box(3, 0.8, 7), 0, 2.8, -5.5), colour: STONE_DARK },
      { geometry: at(box(2.6, 0.6, 4), 0, 2.7, 6), colour: STONE_DARK },
    ];
  }
  const merlons = [];
  for (let i = 0; i < 8; i++) merlons.push(at(box(0.8, 1, 1.4), 1.1, 6.5, -8.75 + i * 2.5));
  return [
    { geometry: at(box(3, 6, 20), 0, 3, 0), colour: STONE },
    { geometry: at(box(3.4, 0.4, 20.2), 0, 6, 0), colour: STONE_DARK },
    ...merlons.map((geometry) => ({ geometry, colour: STONE })),
  ];
}

/** The angled corner work of a fort: a five-sided platform, battered at the foot. */
function bastion(): Part[] {
  return [
    { geometry: at(upright(9, 10.5, 7, 5), 0, 3.5, 0), colour: STONE },
    { geometry: at(upright(9.3, 9.3, 0.5, 5), 0, 7.2, 0), colour: STONE_DARK },
  ];
}

/**
 * A gatehouse the road runs through: two squat towers either side of the
 * carriageway and an arch between them eight metres up.
 */
function fortGate(): Part[] {
  const towers = [-13, 13].map((x) => at(box(5, 11, 8), x, 5.5, 0));
  const caps = [-13, 13].map((x) => at(box(5.8, 0.6, 8.8), x, 11.3, 0));
  return [
    ...towers.map((geometry) => ({ geometry, colour: STONE })),
    { geometry: at(box(21, 3, 8), 0, 9.5, 0), colour: STONE },
    ...caps.map((geometry) => ({ geometry, colour: STONE_DARK })),
  ];
}

/**
 * The signal station: a round stone tower with a parapet and an iron beacon
 * basket on top. The thing on the skyline that says where the fort is.
 */
function signalTower(): Part[] {
  return [
    { geometry: at(upright(4, 4.6, 18, 12), 0, 9, 0), colour: STONE },
    { geometry: at(upright(4.6, 4.6, 1.4, 12), 0, 18.7, 0), colour: STONE_DARK },
    { geometry: at(upright(0.25, 0.25, 4, 6), 0, 21.4, 0), colour: DARK_METAL },
    { geometry: at(upright(1.4, 0.7, 1.2, 8), 0, 23.8, 0), colour: DARK_METAL },
    { geometry: at(box(1.4, 2.4, 0.2), 0, 1.2, 4.55), colour: '#2e2a26' },
  ];
}

/** An old muzzle-loader on its carriage, pointing out over the wall. */
function cannon(): Part[] {
  return [
    { geometry: at(box(1.6, 0.7, 2.6), 0, 0.45, -0.4), colour: '#5a4a38' },
    { geometry: at(tube(0.22, 0.34, 3.2), 0, 1.05, 0.6), colour: '#2f3336' },
    ...[-0.85, 0.85].map((x) => ({ geometry: at(tube(0.45, 0.45, 0.15).rotateY(Math.PI / 2), x, 0.45, 0.4), colour: '#3b2f25' })),
  ];
}

/**
 * A keep: the castle's great tower, on a five-sided plan with one point aimed
 * the way it is turned - down the approach, where an attack would come from -
 * so a shot glances off. Thirty metres, with a parapet and the signal
 * station's beacon on top: the one thing on the skyline that says where the
 * castle is.
 */
function keep(): Part[] {
  return [
    { geometry: at(upright(6.6, 7.4, 28, 5), 0, 14, 0), colour: STONE },
    { geometry: at(upright(7, 7, 2, 5), 0, 29, 0), colour: STONE_DARK },
    { geometry: at(upright(0.3, 0.3, 4, 6), 0, 32, 0), colour: DARK_METAL },
    { geometry: at(upright(1.6, 0.8, 1.4, 8), 0, 34.6, 0), colour: DARK_METAL },
    { geometry: at(box(1.6, 3, 0.3), 0, 7.5, -6.2), colour: '#2e2a26' },
  ];
}

/** The four walls of a roofless building, `w` across and `l` long, with a door gap in the front. */
function shell(w: number, l: number, h: number, thick: number, door: number, colour: string): Part[] {
  const side = (x: number) => at(box(thick, h, l), x, h / 2, 0);
  const back = at(box(w, h, thick), 0, h / 2, -l / 2 + thick / 2);
  const front = (w - door) / 2;
  return [
    { geometry: side(-w / 2 + thick / 2), colour },
    { geometry: side(w / 2 - thick / 2), colour },
    { geometry: back, colour },
    { geometry: at(box(front, h, thick), -w / 2 + front / 2, h / 2, l / 2 - thick / 2), colour },
    { geometry: at(box(front, h, thick), w / 2 - front / 2, h / 2, l / 2 - thick / 2), colour },
  ];
}

/**
 * The hall of the inner castle: a tall roofless range with rows of window
 * openings and a pointed-arch doorway, the part of a ruin people photograph.
 */
function palas(): Part[] {
  const windows = [];
  for (let i = 0; i < 5; i++) {
    for (const x of [-8.05, 8.05]) windows.push(at(box(0.2, 2.6, 1.6), x, 8, -12 + i * 6));
  }
  const arch = new THREE.CylinderGeometry(2, 2, 0.3, 3).rotateX(Math.PI / 2).rotateZ(Math.PI);
  return [
    ...shell(16, 34, 12, 1.6, 4, STONE),
    ...windows.map((geometry) => ({ geometry, colour: '#2e2a26' })),
    { geometry: at(box(4, 3.4, 1.8), 0, 5.7, 16.2), colour: STONE },
    { geometry: at(arch, 0, 4.6, 16.3), colour: STONE_DARK },
  ];
}

/** The chapel: a roofless nave and a rounded end wall, with a narrow door. */
function chapel(): Part[] {
  const apse = new THREE.CylinderGeometry(5, 5, 7, 12, 1, true, -Math.PI / 2, Math.PI);
  return [
    ...shell(10, 18, 9, 1.2, 2.2, STONE),
    { geometry: at(apse, 0, 3.5, 9), colour: STONE },
    { geometry: at(box(1, 3, 0.2), 0, 5, -9.1), colour: '#2e2a26' },
  ];
}

/** A round tower standing on the curtain wall, crenellated. */
function wallTower(): Part[] {
  const merlons = [];
  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2;
    merlons.push(at(box(1, 1.2, 1), Math.sin(t) * 4.6, 14.6, Math.cos(t) * 4.6));
  }
  return [
    { geometry: at(upright(4.8, 5.2, 14, 12), 0, 7, 0), colour: STONE },
    ...merlons.map((geometry) => ({ geometry, colour: STONE })),
  ];
}

/** A low roofless outbuilding of the bailey - a stable, a granary, a gatekeeper's lodge. */
function ruinHouse(variant?: string): Part[] {
  return variant === 'small' ? shell(8, 12, 4.5, 0.9, 1.8, STONE_DARK) : shell(12, 24, 4.5, 1, 3, STONE_DARK);
}

/**
 * Dressed stone come down off a wall: a few squared blocks where they fell and
 * a column drum on its side. Low enough to see over, not to drive through.
 */
function masonry(): Part[] {
  const drum = tube(0.7, 0.7, 2.2, 10).rotateY(0.5);
  return [
    { geometry: at(box(1.8, 1, 1.2).rotateY(0.3), -0.6, 0.5, -2.2), colour: STONE },
    { geometry: at(box(1.4, 0.9, 1.4).rotateY(-0.4), 0.8, 0.45, -0.6), colour: STONE_DARK },
    { geometry: at(box(1.6, 0.8, 1).rotateY(1.1), -0.5, 0.4, 1), colour: STONE },
    { geometry: at(box(1, 0.7, 1).rotateY(0.2), 0.3, 1.25, -2.1), colour: '#9a9486' },
    { geometry: at(drum, 0.6, 0.7, 2.6), colour: '#9a9486' },
  ];
}

/** A well in the courtyard: a round stone curb, two posts and a beam across with its winch. */
function well(): Part[] {
  return [
    { geometry: at(upright(2.2, 2.4, 1.2, 14), 0, 0.6, 0), colour: STONE },
    { geometry: at(upright(1.7, 1.7, 0.05, 14), 0, 1.2, 0), colour: '#1f2224' },
    ...[-1.9, 1.9].map((x) => ({ geometry: at(box(0.3, 3.2, 0.3), x, 1.6, 0), colour: '#5a4a38' })),
    { geometry: at(box(4.2, 0.3, 0.3), 0, 3.2, 0), colour: '#5a4a38' },
    { geometry: at(tube(0.25, 0.25, 1.6, 8).rotateY(Math.PI / 2), 0, 2.6, 0), colour: '#3b2f25' },
  ];
}

const TIMBER = '#7a5a3c';
const TIMBER_DARK = '#5a4230';

/** A picnic table with its two benches, the kind every park has. */
function picnicTable(): Part[] {
  return [
    { geometry: at(box(0.8, 0.06, 2.2), 0, 0.75, 0), colour: TIMBER },
    ...[-0.75, 0.75].map((x) => ({ geometry: at(box(0.3, 0.05, 2.2), x, 0.45, 0), colour: TIMBER })),
    ...[-0.55, 0.55].flatMap((z) => [-0.4, 0.4].map((x) => ({ geometry: at(box(0.08, 0.75, 0.08), x, 0.375, z), colour: TIMBER_DARK }))),
    ...[-0.55, 0.55].map((z) => ({ geometry: at(box(1.8, 0.06, 0.08), 0, 0.3, z), colour: TIMBER_DARK })),
  ];
}

/** A slatted bench on two iron ends, facing the way it is turned. */
function bench(): Part[] {
  return [
    { geometry: at(box(0.45, 0.05, 1.8), 0, 0.45, 0), colour: TIMBER },
    { geometry: at(box(0.05, 0.35, 1.8), -0.22, 0.7, 0), colour: TIMBER },
    ...[-0.8, 0.8].map((z) => ({ geometry: at(box(0.5, 0.45, 0.06), 0, 0.225, z), colour: '#2f3336' })),
  ];
}

/** A coin telescope on a post at the viewpoint, pointed out over the city. */
function telescope(): Part[] {
  return [
    { geometry: at(upright(0.12, 0.16, 1.4, 8), 0, 0.7, 0), colour: '#2f3336' },
    { geometry: at(box(0.4, 0.4, 0.4), 0, 1.55, 0), colour: '#3d6b52' },
    { geometry: at(tube(0.12, 0.18, 1, 10).rotateX(-0.15), 0, 1.7, 0.3), colour: '#3d6b52' },
  ];
}

/**
 * The working quarry's machinery is drawn bigger than life. A car here is
 * 4.8 m across, so a haul truck at its real 6.5 m is scarcely wider than the
 * thing driving past it: these are built to real proportions and then grown
 * (`SET_PIECE_SOLIDS` grows the same amounts), so each still looks like itself.
 */
const grown = (model: (variant?: string) => Part[], k: number) => (variant?: string) =>
  model(variant).map((part) => ({ ...part, geometry: part.geometry.scale(k, k, k) }));

const MODELS: Record<SetPieceKind, (variant?: string) => Part[]> = {
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
  stockpile: grown(stockpile, 2),
  conveyor: grown(conveyor, 2),
  'haul-truck': grown(haulTruck, 2.5),
  excavator: grown(excavator, 2.5),
  cabin: grown(cabin, 1.8),
  crusher: grown(crusher, 2),
  rubble: grown(rubble, 3),
  'container-block': containerBlock,
  'sts-crane': stsCrane,
  warehouse,
  'straddle-carrier': straddleCarrier,
  'reach-stacker': reachStacker,
  rampart,
  bastion,
  'fort-gate': fortGate,
  'signal-tower': signalTower,
  cannon,
  keep,
  palas: grown(palas, PALAS_GROWN),
  chapel: grown(chapel, CHAPEL_GROWN),
  'wall-tower': wallTower,
  'ruin-house': grown(ruinHouse, HOUSE_GROWN),
  masonry: grown(masonry, 2),
  well,
  'picnic-table': grown(picnicTable, 2),
  bench: grown(bench, 2),
  telescope: grown(telescope, 1.6),
};

/** The haul truck's parts, for the moving ones (#330) to draw with the same model the parked ones use. */
export const haulTruckParts = (): Part[] => MODELS['haul-truck']();

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
    // By what it looks like, not just what it is: a stockpile's rock is a
    // variant, and one mesh has one colour per part.
    const byKind = new Map<string, SetPiece[]>();
    for (const piece of pieces) {
      const key = piece.variant ? `${piece.kind}:${piece.variant}` : piece.kind;
      if (!byKind.has(key)) byKind.set(key, []);
      byKind.get(key)!.push(piece);
    }

    const dummy = new THREE.Object3D();
    for (const [key, list] of byKind) {
      const kind = list[0].kind;
      const parts = MODELS[kind](list[0].variant);
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
        mesh.name = `setpiece-${key}`;
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
