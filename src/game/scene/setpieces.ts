import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIRCRAFT_GROWN, HAUL_TRUCK_GROWN, UNITS_PER_METRE } from '../constants';
import type { SetPiece, SetPieceKind } from '../city/types';
import { CHAPEL_GROWN, ESTATE_FOOTING, HOUSE_GROWN, PALAS_GROWN, WAREHOUSE_FOOTING } from '../city/setpieces';

import {
  townhouse, loft, midrise, tower, lookoutTower, twistTower, chateauHotel, stadium,
  library, gallery, cathedral, cityHall, cruiseTerminal, geodesicDome, flatiron,
} from './downtownmodels';
import { triplanar } from './triplanar';
import { wallFinish, type WallKind } from './materials';
const M = UNITS_PER_METRE;

/**
 * Which photo finish a wall colour takes under `?look=materials` (#581).
 *
 * Models name their parts by colour and nothing else, so the colour is what
 * says "this is the wall": the brick tones are brick, the render, stone and
 * concrete tones are concrete, and the warehouse's grey cladding is corrugated
 * steel. Glass, roofs, doors and every other colour keep their flat shade.
 */
const WALL_FINISH_BY_COLOUR: Record<string, WallKind> = {
  '#9a5b45': 'brick',
  '#8c4a3a': 'brick',
  '#6e4a36': 'brick',
  '#a3a39b': 'concrete',
  '#d8d2c6': 'concrete',
  '#e4dcc4': 'concrete',
  '#cbbfa6': 'concrete',
  '#8fa6b8': 'concrete',
  '#9fb39a': 'concrete',
  '#9aa3a8': 'steel',
};

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

function tree(variant?: string): Part[] {
  // A broadleaf (Tidewater Park's once-over, 2026-10-02): a city park's
  // planes and oaks among the pines, a round crown of three lumps on a
  // longer trunk.
  if (variant === 'broadleaf') {
    return [
      { geometry: at(upright(0.32, 0.45, 4.4, 7), 0, 2.2, 0), colour: '#5a4230' },
      ...[
        [3.2, 0, 7, 0],
        [2.4, 1.7, 6, 0.8],
        [2.3, -1.5, 6.2, -1],
      ].map(([r, x, y, z]) => ({ geometry: at(new THREE.IcosahedronGeometry(r, 1), x, y, z), colour: '#4f7d3a' })),
    ];
  }
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
 * Bedrock showing through the grass on a hilltop (the quarry island, 2026-10-02):
 * two weathered slabs tilted out of the ground and a scatter of fallen stones
 * round them. Angular and grey with a little lichen, where the quarry's rubble
 * is pale and fresh-broken, so a hill's rock does not read as a heap of spoil.
 */
function outcrop(): Part[] {
  const stone = (r: number, sx: number, sy: number, sz: number, tilt = 0, turn = 0) =>
    new THREE.DodecahedronGeometry(r, 0).scale(sx, sy, sz).rotateZ(tilt).rotateY(turn);
  return [
    { geometry: at(stone(3.2, 1.25, 1.1, 0.8, 0.35, 0.4), -1.2, 1.9, 0.3), colour: '#8b8d88' },
    { geometry: at(stone(2.6, 1, 1.25, 0.75, -0.3, 1.9), 2.1, 1.7, -0.9), colour: '#7c7f7b' },
    { geometry: at(stone(1.4, 1.2, 0.7, 1), 0.6, 0.5, 3.4), colour: '#94968f' },
    { geometry: at(stone(1.1, 1, 0.6, 1.3, 0.2, 0.8), -3.9, 0.4, -2.2), colour: '#868a80' },
    { geometry: at(stone(0.9, 1.2, 0.6, 1, 0, 2.6), 4.2, 0.3, 2.1), colour: '#7f8a6e' },
    { geometry: at(stone(1.6, 1.1, 0.35, 1, 0.1, 1.2), -0.4, 3.4, 0.6), colour: '#7f8a6e' },
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
    // Down to its footing, so a shed on a slope does not show daylight under it.
    { geometry: at(box(w, h + WAREHOUSE_FOOTING, l), 0, (h - WAREHOUSE_FOOTING) / 2, 0), colour: '#9aa3a8' },
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
 * A park bandstand (#461): an eight-sided platform up a step, eight slim
 * columns and a painted roof coming to a point, the kind a city park put up
 * a century ago for Sunday brass bands.
 */
function bandstand(): Part[] {
  const columns = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return { geometry: at(upright(0.14, 0.14, 2.7, 8), Math.cos(a) * 3.9, 2.45, Math.sin(a) * 3.9), colour: '#e8e4da' };
  });
  return [
    { geometry: at(upright(4.4, 4.5, 1.1, 8), 0, 0.55, 0), colour: '#b9b2a4' },
    { geometry: at(box(2, 0.5, 1.4), 0, 0.25, 4.8), colour: '#b9b2a4' },
    ...columns,
    { geometry: at(upright(4.8, 4.8, 0.3, 8), 0, 3.95, 0), colour: '#e8e4da' },
    { geometry: at(new THREE.ConeGeometry(4.9, 1.6, 8), 0, 4.9, 0), colour: '#3f6b5a' },
    { geometry: at(upright(0.08, 0.08, 0.9, 6), 0, 6.1, 0), colour: DARK_METAL },
  ];
}

/** A park's toilet block: low brick walls, a flat roof, a door at each end. */
function toiletBlock(): Part[] {
  return [
    { geometry: at(box(5, 2.9, 8), 0, 1.45, 0), colour: '#8c5a46' },
    { geometry: at(box(5.4, 0.3, 8.4), 0, 3.05, 0), colour: '#5b5f60' },
    ...[-1, 1].map((end) => ({ geometry: at(box(1.1, 2.1, 0.12), 0, 1.05, end * 4.02), colour: '#2f4a3e' })),
    { geometry: at(box(0.12, 0.5, 5.6), 2.52, 2.4, 0), colour: '#cfd4d0' },
  ];
}

/**
 * The park café: a single-storey pavilion with a wall of windows down one
 * side, a striped awning over it and a few tables outside.
 */
function cafe(): Part[] {
  const tables = [-4, 0, 4].map((z) => ({ geometry: at(upright(0.55, 0.55, 0.75, 10), 5.6, 0.38, z), colour: '#e8e4da' }));
  return [
    { geometry: at(box(7, 3.2, 12), 0, 1.6, 0), colour: '#e2dccd' },
    { geometry: at(box(0.12, 2.2, 10), 3.52, 1.5, 0), colour: '#3a4a52' },
    { geometry: at(box(7.6, 0.4, 12.6), 0, 3.4, 0), colour: '#5b5f60' },
    { geometry: at(box(2.4, 0.1, 12).rotateZ(-0.3), 4.6, 2.9, 0), colour: '#c94f3d' },
    ...tables,
  ];
}

const WALLS: Record<string, string> = { cream: '#e4dcc4', brick: '#9a5b45', blue: '#8fa6b8', green: '#9fb39a', render: '#d8d2c6' };
const ROOFS: Record<string, string> = { cream: '#6b4a3a', brick: '#4f4a48', blue: '#56504a', green: '#6b4a3a', render: '#5b5f60' };

/**
 * A suburban house (#477): two storeys under a pitched roof running across
 * the front, a door and windows facing the street, and a chimney. The
 * variant is the colour of its walls.
 */
function house(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'cream'] ?? WALLS.cream;
  // A three-sided cylinder on its side is a gable roof: ridge along the
  // front, apex up, eaves the depth of the house.
  const roof = new THREE.CylinderGeometry(7, 7, 10.6, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.42, 1);
  const windows = [-2.8, 2.8].flatMap((x) => [1.5, 4].map((y) => ({ geometry: at(box(1.4, 1.2, 0.1), x, y, 6.02), colour: '#3a4a52' })));
  return [
    { geometry: at(box(10, 5.5, 12), 0, 2.75, 0), colour: wall },
    { geometry: at(roof, 0, 5.5 + 7 * 0.5 * 0.42, 0), colour: ROOFS[variant ?? 'cream'] ?? ROOFS.cream },
    { geometry: at(box(1.2, 2.2, 0.12), 0, 1.1, 6.03), colour: '#5a3e2e' },
    ...windows,
    { geometry: at(box(0.9, 2.6, 0.9), 3.4, 8.2, -2.5), colour: '#7a4c3a' },
  ];
}

/** A low apartment block (#477): three storeys, a flat roof, rows of windows front and back. */
function apartment(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'brick'] ?? WALLS.brick;
  const rows = [1.6, 4.8, 8].flatMap((y) => [-9, -5, -1, 3, 7].flatMap((x) => [6.02, -6.02].map((z) => ({ geometry: at(box(1.8, 1.4, 0.1), x + 1, y, z), colour: '#3a4a52' }))));
  return [
    { geometry: at(box(24, 9.6, 12), 0, 4.8, 0), colour: wall },
    { geometry: at(box(24.4, 0.4, 12.4), 0, 9.8, 0), colour: ROOFS[variant ?? 'brick'] ?? ROOFS.brick },
    { geometry: at(box(2.2, 2.6, 0.14), -11 + 2.5, 1.3, 6.04), colour: '#3d3a36' },
    ...rows,
  ];
}

/**
 * The shop's sign and awning, and the wall it goes with, by variant: a high
 * street is a row of fronts that do not match.
 */
const FASCIAS: Record<string, { fascia: string; wall: string }> = {
  red: { fascia: '#a8352c', wall: WALLS.brick },
  green: { fascia: '#2f5e46', wall: WALLS.render },
  blue: { fascia: '#2f4d7a', wall: WALLS.cream },
  black: { fascia: '#26292b', wall: WALLS.brick },
};

/**
 * A high-street shop (#488): a glazed shopfront under a painted fascia and an
 * awning, and two floors of flats above it behind a parapet. Narrow, so a
 * row of them reads as a terrace of separate shops rather than one block.
 */
function shop(variant?: string): Part[] {
  const look = FASCIAS[variant ?? 'red'] ?? FASCIAS.red;
  const windows = [5.6, 8.4].flatMap((y) => [-2, 2].map((x) => ({ geometry: at(box(1.4, 1.6, 0.1), x, y, 6.02), colour: '#3a4a52' })));
  return [
    { geometry: at(box(8, 10.4, 12), 0, 5.2, 0), colour: look.wall },
    { geometry: at(box(8.2, 0.5, 12.2), 0, 10.65, 0), colour: '#5b5f60' },
    { geometry: at(box(6.6, 2.6, 0.1), 0, 1.9, 6.02), colour: '#2f3e46' },
    { geometry: at(box(8, 0.8, 0.2), 0, 3.7, 6.06), colour: look.fascia },
    { geometry: at(box(7.6, 0.08, 1.6).rotateX(0.3), 0, 3.05, 6.8), colour: look.fascia },
    ...windows,
  ];
}

/**
 * A block of flats on the high street (#488): four storeys, a stone band over
 * the ground floor, a door in the middle, windows front and back. Taller than
 * the suburbs' apartment blocks, because a high street is where the town
 * gets denser on its way to downtown.
 */
function flat(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'brick'] ?? WALLS.brick;
  const upper = [4.9, 8, 11.1].flatMap((y) => [-6, -2.5, 2.5, 6].flatMap((x) => [6.02, -6.02].map((z) => ({ geometry: at(box(1.6, 1.6, 0.1), x, y, z), colour: '#3a4a52' }))));
  const ground = [-6, -3.5, 3.5, 6].map((x) => ({ geometry: at(box(1.6, 1.6, 0.1), x, 1.8, 6.02), colour: '#3a4a52' }));
  return [
    { geometry: at(box(16, 13, 12), 0, 6.5, 0), colour: wall },
    { geometry: at(box(16.4, 0.5, 12.4), 0, 13.25, 0), colour: ROOFS[variant ?? 'brick'] ?? ROOFS.brick },
    { geometry: at(box(16.1, 0.3, 12.1), 0, 3.3, 0), colour: '#d8d2c6' },
    { geometry: at(box(2.4, 2.8, 0.14), 0, 1.4, 6.04), colour: '#3d3a36' },
    ...ground,
    ...upper,
  ];
}

const BRICK = '#8c4a3a';
const TANK_WHITE = '#d9d6cc';

/**
 * A works chimney (#489): a tapering brick stack forty-five metres high on a
 * square plinth, with darker bands and a soot-black crown. The landmark that
 * says "works" from anywhere in the area.
 */
function chimney(): Part[] {
  const bands = [12, 24, 36].map((y) => ({ geometry: at(upright(2.55 - (y / 45) * 0.75, 2.6 - (y / 45) * 0.75, 0.6, 16), 0, y, 0), colour: '#5e3328' }));
  return [
    { geometry: at(box(7, 3, 7), 0, 1.5, 0), colour: CONCRETE },
    { geometry: at(upright(1.6, 2.3, 42, 16), 0, 24, 0), colour: BRICK },
    ...bands,
    { geometry: at(upright(1.75, 1.75, 1.4, 16), 0, 45.3, 0), colour: '#26292b' },
  ];
}

/**
 * A storage tank (#489): a squat white drum with a shallow cone roof, a
 * walkway railing round the top and a stair up the side. Large or small.
 */
function tank(variant?: string): Part[] {
  const [r, h] = variant === 'small' ? [7, 10] : [14, 14];
  const stair = at(box(1.2, h * 1.15, 1.2).rotateZ(0.6), r + 0.4, h / 2, 0);
  return [
    { geometry: at(upright(r, r, h, 32), 0, h / 2, 0), colour: TANK_WHITE },
    { geometry: at(new THREE.ConeGeometry(r * 1.01, r * 0.18, 32), 0, h + r * 0.09, 0), colour: '#b9b5aa' },
    { geometry: at(upright(r + 0.6, r + 0.6, 0.25, 32), 0, h + 0.9, 0), colour: DARK_METAL },
    { geometry: at(upright(r + 0.05, r + 0.05, 0.6, 32), 0, 0.3, 0), colour: CONCRETE },
    { geometry: stair, colour: DARK_METAL },
  ];
}

/**
 * A gantry crane (#489): two legs each side of a yard, a box-girder beam
 * across fourteen metres up and a hoist trolley on it, the kind that runs on
 * rails down a stockyard. A car drives under it between the legs.
 */
function gantry(): Part[] {
  const legs = [-16, 16].flatMap((x) => [-2.5, 2.5].map((z) => at(box(1.4, 15, 1.4), x, 7.5, z)));
  const feet = [-16, 16].map((x) => at(box(2, 1, 7), x, 0.5, 0));
  const beams = [-1, 1].map((z) => at(box(35, 2.4, 1.2), 0, 15.6, z));
  return [
    ...[...legs, ...feet, ...beams].map((geometry) => ({ geometry, colour: '#d9a12b' })),
    { geometry: at(box(4, 2.2, 4), -4, 17.9, 0), colour: DARK_METAL },
    { geometry: at(box(0.1, 9, 0.1), -4, 11.5, 0), colour: DARK_METAL },
    { geometry: at(box(2.4, 0.8, 1.6), -4, 6.6, 0), colour: DARK_METAL },
  ];
}

/** Forty metres of rail siding (#489): a ballast bed, sleepers and two rails, flat enough to drive over. */
function rails(): Part[] {
  const sleepers = Array.from({ length: 60 }, (_, i) => at(box(2.6, 0.12, 0.25), 0, 0.2, -19.5 + i * 0.66));
  return [
    { geometry: at(box(3.4, 0.16, 40), 0, 0.08, 0), colour: '#7d776c' },
    ...sleepers.map((geometry) => ({ geometry, colour: '#4a3c30' })),
    ...[-0.72, 0.72].map((x) => ({ geometry: at(box(0.08, 0.16, 40), x, 0.32, 0), colour: '#8f9498' })),
  ];
}

/** A rail wagon on a siding (#489): a box van, or a tank wagon, on two bogies. */
function wagon(variant?: string): Part[] {
  const bogies = [-4.8, 4.8].map((z) => ({ geometry: at(box(2.4, 0.9, 2.8), 0, 0.75, z), colour: '#26292b' }));
  const frame = { geometry: at(box(2.9, 0.4, 14), 0, 1.4, 0), colour: '#26292b' };
  if (variant === 'tank') {
    return [
      ...bogies,
      frame,
      { geometry: at(tube(1.4, 1.4, 12.6, 16), 0, 3, 0), colour: '#2f3336' },
      { geometry: at(upright(0.5, 0.5, 0.6, 10), 0, 4.6, 0), colour: '#2f3336' },
    ];
  }
  return [...bogies, frame, { geometry: at(box(2.9, 2.7, 13.6), 0, 2.95, 0), colour: RUST }, { geometry: at(box(2.95, 2.3, 2.6), 0, 2.85, 0), colour: '#6f4a33' }];
}

/**
 * A hipped roof over a `w` by `l` box: a four-sided pyramid squashed to the
 * plan, which reads as a grander house than the suburbs' gables.
 */
const hipRoof = (w: number, h: number, l: number) =>
  new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w, h, l);
const WINDOW = '#3a4a52';
/** Wall from its footing, so the downhill side of a slope shows no daylight under it. */
const walled = (w: number, h: number, l: number, x: number, z: number) =>
  at(box(w, h + ESTATE_FOOTING, l), x, (h - ESTATE_FOOTING) / 2, z);

/**
 * A villa (#293), a size up from a suburb house: two full storeys under a
 * hipped roof, a door off-centre, and a garage to one side with its own flat
 * roof. The front faces +z, like the house's.
 */
function villa(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'cream'] ?? WALLS.cream;
  const roof = ROOFS[variant ?? 'cream'] ?? ROOFS.cream;
  const windows = [-8.5, -5.5, -0.5, 2.5].flatMap((x) => [1.6, 4.9].map((y) => ({ geometry: at(box(1.6, 1.4, 0.1), x, y, 6.02), colour: WINDOW })));
  return [
    { geometry: walled(15, 7, 12, -3, 0), colour: wall },
    { geometry: at(hipRoof(15.8, 3.4, 12.8), -3, 7 + 1.7, 0), colour: roof },
    { geometry: at(box(1.6, 2.4, 0.12), -3, 1.2, 6.03), colour: '#5a3e2e' },
    { geometry: at(box(2.4, 0.2, 1.4), -3, 2.7, 6.7), colour: roof },
    ...windows,
    { geometry: walled(6, 3.6, 7, 7.5, 2.5), colour: wall },
    { geometry: at(box(6.3, 0.3, 7.3), 7.5, 3.75, 2.5), colour: roof },
    { geometry: at(box(4.6, 2.6, 0.1), 7.5, 1.3, 6.03), colour: '#d8d4cc' },
    { geometry: at(box(1, 2.6, 1), -8, 9.4, -2.5), colour: '#7a4c3a' },
  ];
}

/**
 * A manor (#293), the few really big houses, alone on the ridge: a
 * three-storey main block under a hipped roof, two wings forward round a
 * forecourt, a columned porch at the door and chimneys at either end.
 */
function manor(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'cream'] ?? WALLS.cream;
  const roof = ROOFS[variant ?? 'cream'] ?? ROOFS.cream;
  const front = [-12, -9, -6, 6, 9, 12].flatMap((x) => [2, 5.3, 8.4].map((y) => ({ geometry: at(box(1.6, 1.6, 0.1), x, y, 3.02), colour: WINDOW })));
  const wings = [-12.5, -9.5, 9.5, 12.5].flatMap((x) => [2, 5.3].map((y) => ({ geometry: at(box(1.6, 1.6, 0.1), x, y, 11.02), colour: WINDOW })));
  const columns = [-3, -1, 1, 3].map((x) => ({ geometry: at(upright(0.35, 0.4, 6), x, 3, 4.6), colour: '#ece6d8' }));
  return [
    { geometry: walled(30, 10, 14, 0, -4), colour: wall },
    { geometry: at(hipRoof(30.8, 4, 14.8), 0, 12, -4), colour: roof },
    ...[-11, 11].flatMap((x) => [
      { geometry: walled(8, 8, 12, x, 5), colour: wall },
      { geometry: at(hipRoof(8.6, 3, 12.6), x, 9.5, 5), colour: roof },
    ]),
    ...columns,
    { geometry: at(box(8.4, 0.9, 3), 0, 6.45, 4.4), colour: '#ece6d8' },
    { geometry: at(box(2, 3.2, 0.12), 0, 1.6, 3.03), colour: '#4a3426' },
    ...front,
    ...wings,
    ...[-13, 13].map((x) => ({ geometry: at(box(1.4, 3.4, 1.4), x, 13.2, -6), colour: '#7a4c3a' })),
  ];
}

/** A clipped privet hedge either side of the path to a front door (#477). */
function hedge(): Part[] {
  return [-5, 5].map((x) => ({ geometry: at(box(6, 1.3, 1.2), x, 0.65, 0), colour: '#3f6a37' }));
}

/** A broadleaf street tree (#477): a plane or a lime, round-headed, not a conifer. */
function streetTree(): Part[] {
  return [
    { geometry: at(upright(0.25, 0.35, 3.6, 8), 0, 1.8, 0), colour: '#5a4632' },
    { geometry: at(new THREE.IcosahedronGeometry(3.2, 1).scale(1, 0.9, 1), 0, 6.4, 0), colour: '#4f7d3c' },
    { geometry: at(new THREE.IcosahedronGeometry(2.2, 1), 1.4, 7.6, -0.8), colour: '#5b8a45' },
  ];
}

const STREET_IRON = '#2f3336';
const PALE_STONE = '#b9b2a4';

/**
 * A bus shelter (downtown's once-over): a glass back and ends on a dark
 * frame, a flat roof, a bench inside and a timetable panel on one end. Open
 * at the front, which faces the kerb.
 */
function busShelter(): Part[] {
  return [
    ...[-1.95, 1.95].flatMap((x) => [-0.75, 0.75].map((z) => ({ geometry: at(box(0.08, 2.4, 0.08), x, 1.2, z), colour: STREET_IRON }))),
    { geometry: at(box(4.2, 0.12, 1.8), 0, 2.46, 0), colour: STREET_IRON },
    { geometry: at(box(3.8, 1.9, 0.04), 0, 1.2, -0.75), colour: '#9fc0cc' },
    ...[-1.95, 1.95].map((x) => ({ geometry: at(box(0.04, 1.9, 1.3), x, 1.2, -0.05), colour: '#9fc0cc' })),
    { geometry: at(box(2.4, 0.06, 0.4), 0, 0.48, -0.5), colour: '#6d7378' },
    { geometry: at(box(0.1, 1.6, 1.1), 1.98, 1.3, 0.1), colour: '#e6c84a' },
  ];
}

/** A cast-iron bollard: a post with a ring near its top. */
function bollard(): Part[] {
  return [
    { geometry: at(upright(0.1, 0.12, 1, 10), 0, 0.5, 0), colour: STREET_IRON },
    { geometry: at(upright(0.13, 0.13, 0.08, 10), 0, 0.82, 0), colour: '#b89a4a' },
  ];
}

/** A concrete planter with a clipped shrub in it. */
function planter(): Part[] {
  return [
    { geometry: at(box(2.4, 0.8, 1.2), 0, 0.4, 0), colour: CONCRETE },
    { geometry: at(new THREE.IcosahedronGeometry(0.75, 1).scale(1.4, 0.7, 0.75), 0, 1.15, 0), colour: '#3f6a37' },
  ];
}

/** A litter bin on the pavement. */
function bin(): Part[] {
  return [
    { geometry: at(upright(0.3, 0.26, 0.95, 12), 0, 0.475, 0), colour: '#2f4a3a' },
    { geometry: at(upright(0.32, 0.32, 0.08, 12), 0, 0.99, 0), colour: STREET_IRON },
  ];
}

/**
 * A square's fountain, in game metres: a wide stone basin of water, and a
 * column of two bowls rising out of the middle of it.
 */
function fountain(): Part[] {
  return [
    { geometry: at(upright(7, 7.2, 0.9, 28), 0, 0.45, 0), colour: PALE_STONE },
    { geometry: at(upright(6.5, 6.5, 0.1, 28), 0, 0.86, 0), colour: '#4f86a0' },
    { geometry: at(upright(0.7, 1, 3.4, 12), 0, 1.7, 0), colour: PALE_STONE },
    { geometry: at(upright(2.6, 1.2, 0.5, 18), 0, 2.6, 0), colour: PALE_STONE },
    { geometry: at(upright(1.4, 0.6, 0.4, 14), 0, 3.9, 0), colour: PALE_STONE },
    { geometry: at(upright(0.25, 0.4, 1.4, 8), 0, 4.6, 0), colour: '#cfe4ee' },
  ];
}

/**
 * A monument on a stepped plinth, in game metres: a bronze figure, or an
 * obelisk (`variant`).
 */
function statue(variant?: string): Part[] {
  const plinth = [
    { geometry: at(box(4.4, 0.6, 4.4), 0, 0.3, 0), colour: PALE_STONE },
    { geometry: at(box(3, 3, 3), 0, 2.1, 0), colour: PALE_STONE },
  ];
  if (variant === 'obelisk') {
    return [...plinth, { geometry: at(upright(0.7, 1.1, 10, 4).rotateY(Math.PI / 4), 0, 8.6, 0), colour: '#cfc8b8' }, { geometry: at(new THREE.ConeGeometry(0.75, 1.2, 4).rotateY(Math.PI / 4), 0, 14.2, 0), colour: '#cfc8b8' }];
  }
  const bronze = '#5d6b4f';
  return [
    ...plinth,
    { geometry: at(box(1.2, 1.8, 0.7), 0, 4.5, 0), colour: bronze },
    { geometry: at(box(1.4, 1.6, 0.8), 0, 6.2, 0), colour: bronze },
    { geometry: at(new THREE.IcosahedronGeometry(0.45, 1), 0, 7.4, 0), colour: bronze },
    { geometry: at(box(0.3, 1.4, 0.3).rotateZ(-0.6), 1, 7.1, 0), colour: bronze },
  ];
}

const KIOSK_COLOURS: Record<string, string> = { green: '#2f5d45', red: '#8c2f2a', blue: '#2d4f73' };

/** A news or coffee kiosk: a little hut with a shuttered counter and an awning. */
function kiosk(variant?: string): Part[] {
  const paint = KIOSK_COLOURS[variant ?? 'green'] ?? KIOSK_COLOURS.green;
  return [
    { geometry: at(box(3, 2.7, 2.5), 0, 1.35, 0), colour: paint },
    { geometry: at(box(2.2, 1, 0.06), 0, 1.5, 1.26), colour: '#e8e4da' },
    { geometry: at(box(3.4, 0.25, 2.9), 0, 2.85, 0), colour: '#33383b' },
    { geometry: at(box(3, 0.08, 0.9).rotateX(0.35), 0, 2.4, 1.6), colour: '#e8e4da' },
  ];
}

const DUMPSTER_COLOURS: Record<string, string> = { green: '#3b5e3a', blue: '#2d4a6b', grey: '#5d6266' };

/** A commercial dumpster behind a building, its lid down. */
function dumpster(variant?: string): Part[] {
  return [
    { geometry: at(box(2, 1.3, 1.8), 0, 0.75, 0), colour: DUMPSTER_COLOURS[variant ?? 'green'] ?? DUMPSTER_COLOURS.green },
    { geometry: at(box(2.05, 0.08, 1.9).rotateX(-0.08), 0, 1.45, 0), colour: '#2a2d2f' },
    ...[-0.8, 0.8].flatMap((x) => [-0.7, 0.7].map((z) => ({ geometry: at(box(0.15, 0.1, 0.15), x, 0.05, z), colour: '#2a2d2f' }))),
  ];
}

const VAN_COLOURS: Record<string, string> = { white: '#e8e6df', yellow: '#e2b33c', teal: '#3f8f8a', pink: '#d97b8f' };

/**
 * A food truck parked with its hatch open: a box body, a cab at the front,
 * the serving hatch and its awning on the left side, which faces the square.
 */
function foodTruck(variant?: string): Part[] {
  const paint = VAN_COLOURS[variant ?? 'white'] ?? VAN_COLOURS.white;
  return [
    { geometry: at(box(2.3, 2.6, 4.6), 0, 1.75, -0.9), colour: paint },
    { geometry: at(box(2.2, 1.8, 1.8), 0, 1.35, 2.3), colour: paint },
    { geometry: at(box(2, 0.7, 0.05), 0, 1.9, 3.21), colour: '#2b3540' },
    { geometry: at(box(0.05, 1, 2.6), -1.16, 2, -0.9), colour: '#2b3540' },
    { geometry: at(box(0.9, 0.06, 2.8).rotateZ(-0.35), -1.55, 2.75, -0.9), colour: '#c94f3d' },
    ...[-1.9, 2.2].flatMap((z) => [-1.05, 1.05].map((x) => ({ geometry: at(tube(0.42, 0.42, 0.3, 12).rotateY(Math.PI / 2), x, 0.42, z), colour: '#1e2022' }))),
  ];
}

const PLAY = { frame: '#d9a62e', slide: '#3a7fc0', climb: '#c94f3d', round: '#3f8f5a' };

/**
 * A playground (Tidewater Park's once-over): a red rubber pad with a swing
 * frame, a slide off a little platform, a climbing frame and a roundabout.
 */
function playground(): Part[] {
  const swingLegs = [-1.9, 1.9].flatMap((x) => [-1, 1].map((side) => ({ geometry: at(box(0.08, 2.5, 0.08).rotateX(side * 0.3), -3 + x, 1.2, 2 + side * 0.36), colour: PLAY.frame })));
  const swings = [-0.8, 0.8].flatMap((x) => [
    { geometry: at(box(0.5, 0.05, 0.25), -3 + x, 0.5, 2), colour: '#2f3336' },
    ...[-0.22, 0.22].map((dx) => ({ geometry: at(box(0.02, 1.85, 0.02), -3 + x + dx, 1.45, 2), colour: '#9a9890' })),
  ]);
  const climb = [-1.1, 1.1].flatMap((x) => [-1.1, 1.1].map((z) => ({ geometry: at(box(0.08, 2, 0.08), -3 + x, 1, -2.5 + z), colour: PLAY.climb })));
  const rungs = [0.7, 1.4, 2].flatMap((y) => [
    { geometry: at(box(2.2, 0.06, 0.06), -3, y, -3.6), colour: PLAY.climb },
    { geometry: at(box(2.2, 0.06, 0.06), -3, y, -1.4), colour: PLAY.climb },
    { geometry: at(box(0.06, 0.06, 2.2), -4.1, y, -2.5), colour: PLAY.climb },
    { geometry: at(box(0.06, 0.06, 2.2), -1.9, y, -2.5), colour: PLAY.climb },
  ]);
  return [
    { geometry: at(box(14, 0.05, 10), 0, 0.03, 0), colour: '#a5523f' },
    { geometry: at(box(3.8, 0.1, 0.1), -3, 2.4, 2), colour: PLAY.frame },
    ...swingLegs,
    ...swings,
    { geometry: at(box(1.2, 0.1, 1.2), 3.5, 1.5, 3), colour: PLAY.frame },
    ...[-0.55, 0.55].flatMap((x) => [-0.55, 0.55].map((z) => ({ geometry: at(box(0.08, 1.5, 0.08), 3.5 + x, 0.75, 3 + z), colour: PLAY.frame }))),
    { geometry: at(box(0.6, 0.06, 2.8).rotateX(-0.5), 3.5, 0.85, 1.15), colour: PLAY.slide },
    ...climb,
    ...rungs,
    { geometry: at(upright(1, 1, 0.12, 16), 3, 0.3, -3), colour: PLAY.round },
    { geometry: at(upright(0.06, 0.06, 0.8, 6), 3, 0.7, -3), colour: '#2f3336' },
  ];
}

/**
 * A boathouse on the big pond: white weatherboard under a gable roof, its
 * wide doors on the front, which faces the water.
 */
function boathouse(): Part[] {
  const roof = new THREE.CylinderGeometry(4.6, 4.6, 10.6, 3).rotateX(-Math.PI / 2).scale(1, 0.5, 1);
  return [
    { geometry: at(box(7, 3.4, 10), 0, 1.7, 0), colour: '#e8e4da' },
    { geometry: at(roof, 0, 3.4 + 4.6 * 0.5 * 0.5, 0), colour: '#3f5d6b' },
    { geometry: at(box(4.2, 2.8, 0.1), 0, 1.4, 5.02), colour: '#3f5d6b' },
    ...[-2.2, 2.2].map((z) => ({ geometry: at(box(0.1, 1, 1.6), 3.52, 2, z), colour: '#3a4a52' })),
  ];
}

/** A timber jetty out over the pond on piles, its deck a step above the water. */
function jetty(): Part[] {
  const piles = [-8, -4, 0, 4, 8].flatMap((z) => [-1.05, 1.05].map((x) => ({ geometry: at(upright(0.12, 0.12, 2.2, 6), x, -0.6, z), colour: TIMBER_DARK })));
  return [{ geometry: at(box(2.4, 0.2, 18), 0, 0.5, 0), colour: TIMBER }, ...piles];
}

const BOATS: Record<string, string> = { white: '#e8e6df', green: '#3f6b52', red: '#a8463a', blue: '#2d4f73' };

/** A rowing boat, its gunwale just above the water, oars shipped along the thwarts. */
function rowingBoat(variant?: string): Part[] {
  const hull = BOATS[variant ?? 'white'] ?? BOATS.white;
  return [
    { geometry: at(box(1.3, 0.45, 2.6), 0, 0.12, -0.2), colour: hull },
    { geometry: at(box(0.8, 0.4, 0.7), 0, 0.14, 1.4), colour: hull },
    { geometry: at(box(1.2, 0.04, 2.5), 0, 0.3, -0.2), colour: TIMBER },
    ...[-0.6, 0.6].map((z) => ({ geometry: at(box(1.25, 0.06, 0.25), 0, 0.36, z), colour: TIMBER_DARK })),
    ...[-0.35, 0.35].map((x) => ({ geometry: at(box(0.06, 0.05, 2.6), x, 0.42, 0), colour: TIMBER })),
  ];
}

/**
 * A football pitch, in game metres, on its levelled pad
 * (`city/tidewaterground.ts`): white lines on the grass, a goal at each end.
 */
function footballPitch(): Part[] {
  const W = 64, L = 100, T = 0.4, Y = 0.06;
  const line = (w: number, l: number, x: number, z: number) => ({ geometry: at(box(w, 0.04, l), x, Y, z), colour: '#eef0ea' });
  const circle = (r: number, z: number) => ({ geometry: at(new THREE.RingGeometry(r - T / 2, r + T / 2, 40).rotateX(-Math.PI / 2), 0, Y + 0.02, z), colour: '#eef0ea' });
  const goal = (end: number) => [
    ...[-5.85, 5.85].map((x) => ({ geometry: at(box(0.25, 3.9, 0.25), x, 1.95, end * L / 2), colour: '#f4f4f0' })),
    { geometry: at(box(11.95, 0.25, 0.25), 0, 3.9, end * L / 2), colour: '#f4f4f0' },
    // The net's frame, not the net: a solid sheet reads as a grey box.
    { geometry: at(box(11.7, 0.12, 0.12), 0, 0.06, end * (L / 2 + 3)), colour: '#c9ccc8' },
    ...[-5.85, 5.85].flatMap((x) => [
      { geometry: at(box(0.12, 0.12, 3), x, 0.06, end * (L / 2 + 1.5)), colour: '#c9ccc8' },
      { geometry: at(box(0.1, 0.1, 4.9).rotateX(end * 0.92), x, 1.95, end * (L / 2 + 1.5)), colour: '#c9ccc8' },
    ]),
  ];
  return [
    ...[-W / 2, W / 2].map((x) => line(T, L, x, 0)),
    ...[-L / 2, L / 2].map((z) => line(W, T, 0, z)),
    line(W, T, 0, 0),
    circle(9, 0),
    ...[-1, 1].flatMap((end) => [
      line(40, T, 0, end * (L / 2 - 16.5)),
      ...[-20, 20].map((x) => line(T, 16.5, x, end * (L / 2 - 8.25))),
      line(18, T, 0, end * (L / 2 - 5.5)),
      ...[-9, 9].map((x) => line(T, 5.5, x, end * (L / 2 - 2.75))),
      ...goal(end),
    ]),
  ];
}

/**
 * A tennis court in its fenced enclosure: a blue court on a green surround,
 * white lines, a net across the middle, and a chain-link fence drawn as its
 * posts and rails so the court is seen through it.
 */
function tennisCourt(): Part[] {
  const Y = 0.05;
  const line = (w: number, l: number, x: number, z: number) => ({ geometry: at(box(w, 0.02, l), x, Y + 0.03, z), colour: '#eef0ea' });
  const posts: Part[] = [];
  for (let z = -18; z <= 18; z += 3) for (const x of [-9, 9]) posts.push({ geometry: at(box(0.08, 3, 0.08), x, 1.5, z), colour: '#2f4a3a' });
  for (let x = -6; x <= 6; x += 3) for (const z of [-18, 18]) posts.push({ geometry: at(box(0.08, 3, 0.08), x, 1.5, z), colour: '#2f4a3a' });
  const rails = [1, 3].flatMap((y) => [
    ...[-9, 9].map((x) => ({ geometry: at(box(0.05, 0.05, 36), x, y, 0), colour: '#2f4a3a' })),
    ...[-18, 18].map((z) => ({ geometry: at(box(18, 0.05, 0.05), 0, y, z), colour: '#2f4a3a' })),
  ]);
  return [
    { geometry: at(box(18, 0.04, 36), 0, Y - 0.01, 0), colour: '#4f7d5a' },
    { geometry: at(box(10.97, 0.04, 23.77), 0, Y + 0.01, 0), colour: '#3f6fa0' },
    ...[-5.44, -4.11, 4.11, 5.44].map((x) => line(0.06, 23.77, x, 0)),
    ...[-11.88, 11.88].map((z) => line(10.97, 0.06, 0, z)),
    ...[-6.4, 6.4].map((z) => line(8.23, 0.06, 0, z)),
    line(0.06, 12.8, 0, 0),
    { geometry: at(box(12.8, 0.9, 0.03), 0, 0.5, 0), colour: '#2a2d2f' },
    { geometry: at(box(12.8, 0.06, 0.05), 0, 0.95, 0), colour: '#f4f4f0' },
    ...[-6.4, 6.4].map((x) => ({ geometry: at(box(0.1, 1.07, 0.1), x, 0.53, 0), colour: '#2f3336' })),
    ...posts,
    ...rails,
  ];
}

const HUTS: Record<string, string> = { blue: '#4f86b8', yellow: '#e2c24a', red: '#c94f3d', green: '#5f9d6a', mint: '#9fd3c0', pink: '#e39aa8' };

/** A beach hut: a painted timber box under a pitched roof, its door to the sea. */
function beachHut(variant?: string): Part[] {
  const paint = HUTS[variant ?? 'blue'] ?? HUTS.blue;
  const roof = new THREE.CylinderGeometry(1.5, 1.5, 2.9, 3).rotateX(-Math.PI / 2).scale(1, 0.5, 1);
  return [
    { geometry: at(box(2.2, 2.4, 2.6), 0, 1.2, 0), colour: paint },
    { geometry: at(roof, 0, 2.4 + 1.5 * 0.5 * 0.5, 0), colour: '#f4f4f0' },
    { geometry: at(box(1, 1.9, 0.06), 0, 0.95, 1.31), colour: '#f4f4f0' },
    { geometry: at(box(2.4, 0.15, 0.8), 0, 0.08, 1.6), colour: TIMBER },
  ];
}

/** A lifeguard tower: a cabin on stilts, a ramp up to it, a flag on top. */
function lifeguardTower(): Part[] {
  return [
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => ({ geometry: at(box(0.15, 2.4, 0.15), x, 1.2, z), colour: '#e8e4da' }))),
    { geometry: at(box(2.4, 0.15, 2.4), 0, 2.45, 0), colour: TIMBER },
    { geometry: at(box(1.8, 1.6, 1.8), 0, 3.3, -0.2), colour: '#c94f3d' },
    { geometry: at(box(2.2, 0.12, 2.2), 0, 4.15, -0.2), colour: '#f4f4f0' },
    { geometry: at(box(0.8, 0.08, 3.4).rotateX(0.62), 0, 1.25, 2.6), colour: TIMBER },
    { geometry: at(upright(0.04, 0.04, 1.6, 6), 0.9, 5, -0.9), colour: '#2f3336' },
    { geometry: at(box(0.05, 0.5, 0.8), 0.9, 5.5, -0.5), colour: '#e2c24a' },
  ];
}

/**
 * A lighthouse on the park's point, in game metres: a tapering tower in red
 * and white bands, a gallery, a lantern and its cap, and a keeper's store at
 * its foot, behind it.
 */
function lighthouse(): Part[] {
  const bands = Array.from({ length: 6 }, (_, i) => {
    const r0 = 4.2 - i * 0.2, r1 = 4.2 - (i + 1) * 0.2;
    return { geometry: at(upright(r1, r0, 4, 20), 0, 2 + i * 4, 0), colour: i % 2 ? '#b8382e' : '#f2f0ea' };
  });
  const roof = new THREE.CylinderGeometry(5, 5, 9.4, 3).rotateX(-Math.PI / 2).scale(1, 0.45, 1);
  return [
    ...bands,
    { geometry: at(upright(4, 4, 0.4, 20), 0, 24.2, 0), colour: '#2f3336' },
    { geometry: at(upright(3.8, 3.8, 1, 20), 0, 24.9, 0), colour: '#2f3336' },
    { geometry: at(upright(2.4, 2.4, 3, 12), 0, 26.4, 0), colour: '#f1e9b0' },
    { geometry: at(new THREE.ConeGeometry(2.9, 2, 12), 0, 28.9, 0), colour: '#7a2620' },
    { geometry: at(upright(0.1, 0.1, 1.6, 6), 0, 30.6, 0), colour: '#2f3336' },
    { geometry: at(box(8, 4.4, 9), 0, 2.2, -9), colour: '#f2f0ea' },
    { geometry: at(roof, 0, 4.4 + 5 * 0.5 * 0.45, -9), colour: '#5b5f60' },
    { geometry: at(box(1.4, 2.4, 0.1), 0, 1.2, -4.45), colour: '#2f4a3e' },
  ];
}

/** A length of seafront railing: posts and two painted rails. */
function railing(): Part[] {
  return [
    ...[-2.5, -1.25, 0, 1.25, 2.5].map((x) => ({ geometry: at(box(0.06, 1.1, 0.06), x, 0.55, 0), colour: '#2f6b7a' })),
    ...[0.55, 1.05].map((y) => ({ geometry: at(box(5.06, 0.05, 0.05), 0, y, 0), colour: '#2f6b7a' })),
  ];
}

/**
 * A pipe rack (Industrial's once-over): twenty metres of elevated pipe run on
 * three steel frames, six metres up so a car drives under it, with four pipes
 * in two colours and an expansion loop in the middle.
 */
function pipeRack(): Part[] {
  const frames = [-9, 0, 9].flatMap((z) => [
    ...[-1.8, 1.8].map((x) => ({ geometry: at(box(0.4, 6, 0.4), x, 3, z), colour: DARK_METAL })),
    { geometry: at(box(4.2, 0.4, 0.4), 0, 6, z), colour: DARK_METAL },
  ]);
  const pipes = [-1.4, -0.5, 0.5, 1.4].map((x, i) => ({ geometry: at(tube(0.3 + (i % 2) * 0.1, 0.3 + (i % 2) * 0.1, 20, 10), x, 6.7, 0), colour: ['#b8b4a8', '#8a5a3c', '#3f6fa0', '#b8b4a8'][i] }));
  return [...frames, ...pipes, { geometry: at(box(3.2, 0.3, 0.3), 0, 7.4, 0), colour: '#b8b4a8' }];
}

/** A cooling tower: the hyperbolic shell, a dark rim and a pale drift of stain below it. */
function coolingTower(): Part[] {
  const profile = Array.from({ length: 16 }, (_, i) => {
    const t = i / 15;
    return new THREE.Vector2(11.5 + 3.5 * Math.pow(2 * t - 0.62, 2) * 2.1 + 0.6 * (1 - t), t * 55);
  });
  return [
    { geometry: new THREE.LatheGeometry(profile, 28), colour: '#aeaaa0' },
    { geometry: at(upright(profile[15].x + 0.3, profile[15].x + 0.3, 0.8, 28), 0, 54.6, 0), colour: '#5f625f' },
    { geometry: at(upright(profile[0].x + 0.4, profile[0].x + 0.4, 3, 28), 0, 1.5, 0), colour: CONCRETE },
  ];
}

/** Six metres of chain-link fence: two posts, a mesh panel and a top rail. */
function fenceLine(): Part[] {
  return [
    ...[-3, 3].map((x) => ({ geometry: at(box(0.12, 2.5, 0.12), x, 1.25, 0), colour: '#5a5f62' })),
    { geometry: at(box(6, 2, 0.04), 0, 1.3, 0), colour: '#a9b0b3' },
    { geometry: at(box(6.1, 0.08, 0.08), 0, 2.4, 0), colour: '#5a5f62' },
  ];
}

/** A flare stack: a slim steel tower on a base, a flame tip at sixty metres and a stay ring. */
function flareStack(): Part[] {
  return [
    { geometry: at(box(6, 2, 6), 0, 1, 0), colour: CONCRETE },
    { geometry: at(upright(0.7, 1, 56, 12), 0, 30, 0), colour: '#7b8185' },
    { geometry: at(upright(1.1, 0.8, 2, 12), 0, 59, 0), colour: DARK_METAL },
    { geometry: at(new THREE.ConeGeometry(0.9, 3.2, 8), 0, 61.6, 0), colour: '#f08a24' },
    ...[20, 40].map((y) => ({ geometry: at(new THREE.TorusGeometry(1.2, 0.08, 4, 12).rotateX(Math.PI / 2), 0, y, 0), colour: DARK_METAL })),
  ];
}

/** A gas holder: a round steel drum in a guide frame, its crown domed and its stair spiralling up. */
function gasHolder(): Part[] {
  const ribs = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { geometry: at(box(0.5, 30, 0.5), Math.cos(a) * 21.4, 15, Math.sin(a) * 21.4), colour: '#5a5f62' };
  });
  return [
    { geometry: at(upright(20.5, 20.5, 26, 32), 0, 13, 0), colour: '#8f9a94' },
    { geometry: at(new THREE.SphereGeometry(20.5, 32, 6, 0, Math.PI * 2, 0, 0.35).scale(1, 0.5, 1), 0, 26, 0), colour: '#7b8185' },
    ...ribs,
    { geometry: at(upright(21.6, 21.6, 0.5, 32), 0, 30, 0), colour: '#5a5f62' },
    { geometry: at(upright(22, 22, 1.2, 32), 0, 0.6, 0), colour: CONCRETE },
  ];
}

const STONE_WALL = ['#8e8a7e', '#7d7a70', '#9a968a'];
const BARK = '#5e4630';
const CUT = '#c8a67a';

/** A waymarker: a timber post with a coloured band and two finger arms. */
function waymarker(): Part[] {
  return [
    { geometry: at(box(0.14, 1.4, 0.14), 0, 0.7, 0), colour: TIMBER },
    { geometry: at(box(0.16, 0.12, 0.16), 0, 1.15, 0), colour: '#d9a62e' },
    { geometry: at(box(0.7, 0.14, 0.04), 0.3, 1.3, 0.09).rotateY(0), colour: TIMBER_DARK },
    { geometry: at(box(0.04, 0.14, 0.6), -0.09, 1.05, -0.25), colour: TIMBER_DARK },
  ];
}

/**
 * A five-bar field gate standing open, swung back along its fence line from
 * the post it hangs on, and a step stile beside it: across the piece, so it
 * is placed along the side of a path, not over it.
 */
function fieldGate(): Part[] {
  return [
    ...[-2.2, 2.2].map((x) => ({ geometry: at(box(0.18, 1.5, 0.18), x, 0.75, 0), colour: TIMBER_DARK })),
    ...[0.25, 0.5, 0.75, 1, 1.25].map((y) => ({ geometry: at(box(3.6, 0.08, 0.06), -0.2, y, 0), colour: '#cfc8b8' })),
    ...[-1.9, 1.5].map((x) => ({ geometry: at(box(0.08, 1.1, 0.06), x, 0.75, 0), colour: '#cfc8b8' })),
    { geometry: at(box(3.8, 0.08, 0.06).rotateZ(0.3), -0.2, 0.75, 0), colour: '#cfc8b8' },
    // The stile, at the latch end: two steps over a short rail.
    { geometry: at(box(0.9, 0.08, 0.3), 2.2, 0.35, 0.3), colour: TIMBER },
    { geometry: at(box(0.9, 0.08, 0.3), 2.2, 0.35, -0.3), colour: TIMBER },
    { geometry: at(box(0.9, 0.08, 0.06), 2.2, 0.9, 0), colour: TIMBER },
  ];
}

/**
 * A length of dry-stone wall: a battered core of three stone colours and a
 * row of coping stones set on edge along the top.
 */
function stoneWall(): Part[] {
  const courses = [0, 1, 2].map((i) => ({ geometry: at(box(6.25, 0.32, 0.7 - i * 0.1), 0, 0.16 + i * 0.32, 0), colour: STONE_WALL[i] }));
  const coping = Array.from({ length: 12 }, (_, i) => ({ geometry: at(box(0.42, 0.18, 0.42).rotateY(i * 0.7), -2.9 + i * 0.53, 1.03, 0), colour: STONE_WALL[(i + 1) % 3] }));
  return [...courses, ...coping];
}

/** A fallen trunk lying along the piece, a stub of a branch off it. */
function log(): Part[] {
  return [
    { geometry: at(tube(0.22, 0.27, 6, 9), 0, 0.25, 0), colour: BARK },
    { geometry: at(upright(0.2, 0.2, 0.02, 9).rotateX(Math.PI / 2), 0, 0.25, 3.01), colour: CUT },
    { geometry: at(box(0.1, 0.1, 1.2).rotateY(0.7), 0.4, 0.35, -1.2), colour: BARK },
  ];
}

/** A woodman's stack of cut logs, three courses of ends to the front. */
function logPile(): Part[] {
  const parts: Part[] = [];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6 - row; i++) {
      const x = -1.25 + row * 0.25 + i * 0.5;
      const y = 0.22 + row * 0.38;
      parts.push({ geometry: at(tube(0.2, 0.2, 2, 8), x, y, 0), colour: BARK });
      parts.push({ geometry: at(upright(0.18, 0.18, 0.02, 8).rotateX(Math.PI / 2), x, y, 1.01), colour: CUT });
    }
  }
  return parts;
}

/** A boulder, three weathered stones in one, the large one half as big again. */
function boulder(variant?: string): Part[] {
  const k = variant === 'large' ? 1.7 : 1;
  const stone = (r: number, sx: number, sy: number, sz: number, turn: number) =>
    new THREE.DodecahedronGeometry(r * k, 0).scale(sx, sy, sz).rotateY(turn);
  return [
    { geometry: at(stone(1, 1.15, 0.85, 1, 0.4), 0, 0.75 * k, 0), colour: '#8b8d88' },
    { geometry: at(stone(0.55, 1, 0.8, 1.1, 1.3), 0.7 * k, 0.35 * k, 0.6 * k), colour: '#7c7f7b' },
    { geometry: at(stone(0.5, 1.2, 0.35, 1, 2.2), -0.3 * k, 1.4 * k, -0.1 * k), colour: '#7f8a6e' },
  ];
}

/**
 * The ranger's hut: a log cabin under a pitched green roof with a porch on
 * the front and a notice board by the door.
 */
function rangerHut(): Part[] {
  const roof = new THREE.CylinderGeometry(3, 3, 6.6, 3).rotateX(-Math.PI / 2).scale(1, 0.55, 1);
  return [
    { geometry: at(box(4.5, 2.8, 5), 0, 1.4, -1), colour: '#8a6440' },
    ...[0.5, 1.2, 1.9, 2.6].map((y) => ({ geometry: at(box(4.6, 0.08, 5.1), 0, y, -1), colour: TIMBER_DARK })),
    { geometry: at(roof, 0, 2.8 + 3 * 0.55 * 0.5, -0.5), colour: '#3f5d4a' },
    { geometry: at(box(4.5, 0.15, 1.6), 0, 0.08, 2.3), colour: TIMBER },
    ...[-2.1, 2.1].map((x) => ({ geometry: at(box(0.15, 2.6, 0.15), x, 1.3, 2.9), colour: TIMBER_DARK })),
    { geometry: at(box(0.9, 2, 0.08), -0.8, 1, 1.52), colour: '#4a3a2a' },
    { geometry: at(box(0.9, 0.7, 0.08), 1.2, 1.7, 1.52), colour: '#d8d2c0' },
  ];
}

/**
 * A timber fire lookout: four splayed legs braced in X's, a stair up one
 * side, and a glazed cabin under a pyramid roof at the top.
 */
function timberLookout(): Part[] {
  const legs = [-2, 2].flatMap((x) => [-2, 2].map((z) => ({ geometry: at(box(0.25, 9.2, 0.25), x, 4.6, z), colour: TIMBER_DARK })));
  const braces = [2.2, 6.6].flatMap((y) => [
    ...[-2, 2].map((z) => ({ geometry: at(box(5.6, 0.12, 0.12).rotateZ(z > 0 ? 0.65 : -0.65), 0, y, z), colour: TIMBER })),
    ...[-2, 2].map((x) => ({ geometry: at(box(0.12, 0.12, 5.6).rotateX(x > 0 ? 0.65 : -0.65), x, y, 0), colour: TIMBER })),
  ]);
  const roof = new THREE.ConeGeometry(4, 1.6, 4).rotateY(Math.PI / 4);
  return [
    ...legs,
    ...braces,
    { geometry: at(box(5, 0.25, 5), 0, 9.1, 0), colour: TIMBER },
    { geometry: at(box(4.4, 1, 4.4), 0, 9.7, 0), colour: '#8a6440' },
    { geometry: at(box(4.5, 1.2, 4.5), 0, 10.8, 0), colour: '#2b3540' },
    { geometry: at(roof, 0, 12.2, 0), colour: '#3f5d4a' },
    { geometry: at(box(0.9, 0.08, 10).rotateX(-0.95), 2.9, 4.6, 0), colour: TIMBER },
  ];
}

const TENTS: Record<string, string> = { orange: '#d9772e', green: '#3f6b42', blue: '#2f5d8a', red: '#a8463a' };

/** A ridge tent, its door at the front, pegged out on a groundsheet. */
function tent(variant?: string): Part[] {
  const canvas = TENTS[variant ?? 'orange'] ?? TENTS.orange;
  const ridge = new THREE.CylinderGeometry(1.25, 1.25, 3, 3).rotateX(-Math.PI / 2).rotateZ(Math.PI).scale(1, 1.2, 1);
  return [
    { geometry: at(box(2.6, 0.03, 3.3), 0, 0.02, 0), colour: '#3a3f3a' },
    { geometry: at(ridge, 0, 0.75, 0), colour: canvas },
    { geometry: at(box(0.7, 0.9, 0.04), 0, 0.45, 1.51), colour: '#2b2a28' },
  ];
}

/** A fire ring: a circle of stones round the embers, and four log seats round that. */
function campfire(): Part[] {
  const stones = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * 2 * Math.PI;
    return { geometry: at(new THREE.DodecahedronGeometry(0.2, 0).scale(1.2, 0.8, 1), Math.cos(a) * 0.65, 0.15, Math.sin(a) * 0.65), colour: '#7c7f7b' };
  });
  const seats = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * 2 * Math.PI + 0.4;
    return { geometry: at(tube(0.18, 0.18, 1.3, 8).rotateY(a + Math.PI / 2), Math.cos(a) * 1.8, 0.18, Math.sin(a) * 1.8), colour: BARK };
  });
  return [
    ...stones,
    { geometry: at(upright(0.5, 0.5, 0.05, 10), 0, 0.03, 0), colour: '#2a2522' },
    { geometry: at(new THREE.ConeGeometry(0.25, 0.5, 6), 0, 0.3, 0), colour: '#d9772e' },
    ...seats,
  ];
}

const CAMPERS: Record<string, string> = { cream: '#e8dcc0', teal: '#5f9c96', orange: '#d9772e', white: '#e8e6df' };

/** A camper van: a two-tone body, a pop-top roof and an awning out on the left. */
function camperVan(variant?: string): Part[] {
  const paint = CAMPERS[variant ?? 'cream'] ?? CAMPERS.cream;
  return [
    { geometry: at(box(2.1, 1.1, 5.4), 0, 0.95, 0), colour: paint },
    { geometry: at(box(2.1, 0.9, 5.2), 0, 1.95, -0.1), colour: '#f2efe6' },
    { geometry: at(box(1.9, 0.5, 3), 0, 2.65, -0.6), colour: paint },
    { geometry: at(box(1.9, 0.6, 0.05), 0, 2, 2.56), colour: '#2b3540' },
    { geometry: at(box(0.05, 0.55, 2.8), -1.06, 2, -0.6), colour: '#2b3540' },
    { geometry: at(box(1.6, 0.05, 3).rotateZ(-0.12), -1.85, 2.3, -0.6), colour: '#c94f3d' },
    ...[-1.7, 1.8].flatMap((z) => [-1, 1].map((x) => ({ geometry: at(tube(0.36, 0.36, 0.28, 12).rotateY(Math.PI / 2), x, 0.38, z), colour: '#1e2022' }))),
  ];
}

/** A round strut of radius `r` from `a` to `b`. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 4).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/**
 * The radio mast on the summit, in game metres: a guyed lattice mast in red
 * and white bands, dishes and aerials near the top, and an equipment hut in a
 * fenced compound at its foot.
 */
function radioMast(): Part[] {
  const H = 46, BANDS = 8;
  const legs: Part[] = [];
  for (let i = 0; i < BANDS; i++) {
    const y0 = (H / BANDS) * i, y1 = (H / BANDS) * (i + 1);
    const r0 = 1.4 - (0.8 * y0) / H, r1 = 1.4 - (0.8 * y1) / H;
    const colour = i % 2 ? '#f2f0ea' : '#c0392b';
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 2 * Math.PI;
      const x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, x1 = Math.cos(a) * r1, z1 = Math.sin(a) * r1;
      legs.push({ geometry: strut(new THREE.Vector3(x0, y0, z0 + 2), new THREE.Vector3(x1, y1, z1 + 2), 0.1), colour });
    }
    // A ring of bracing at the top of each band.
    legs.push({ geometry: at(new THREE.TorusGeometry(r1, 0.06, 4, 3).rotateX(Math.PI / 2), 0, y1, 2), colour: '#9a9890' });
  }
  const fence: Part[] = [];
  for (let t = -8; t <= 8; t += 2) {
    for (const [x, z] of [[t, -8], [t, 8], [-8, t], [8, t]]) fence.push({ geometry: at(box(0.08, 2.4, 0.08), x, 1.2, z), colour: '#5b5f60' });
  }
  for (const y of [0.3, 2.3]) {
    fence.push(...[-8, 8].map((z) => ({ geometry: at(box(16, 0.05, 0.05), 0, y, z), colour: '#5b5f60' })));
    fence.push(...[-8, 8].map((x) => ({ geometry: at(box(0.05, 0.05, 16), x, y, 0), colour: '#5b5f60' })));
  }
  return [
    ...legs,
    { geometry: at(box(0.25, 6, 0.25), 0, H + 3, 2), colour: '#9a9890' },
    { geometry: at(upright(1.1, 1.1, 0.25, 16).rotateX(Math.PI / 2), 0, H - 6, 3.2), colour: '#e8e6df' },
    { geometry: at(upright(0.8, 0.8, 0.25, 16).rotateZ(Math.PI / 2), 1.3, H - 12, 2), colour: '#e8e6df' },
    { geometry: at(box(4, 3, 3), -4, 1.5, -4), colour: '#c9ccc8' },
    { geometry: at(box(4.3, 0.2, 3.3), -4, 3.1, -4), colour: '#5b5f60' },
    { geometry: at(box(15.8, 0.04, 15.8), 0, 0.03, 0), colour: '#8c826f' },
    ...fence,
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
  // Life size on the Cargo Plane Jump, which is cleared over it (`CARGO_PLANE`).
  'plane-belly': (variant?: string) => (variant === 'jump' ? cargoPlane() : grown(cargoPlane, AIRCRAFT_GROWN)(variant)),
  'plane-nose': grown(noseBuried, AIRCRAFT_GROWN),
  fuselage: grown(fuselage, AIRCRAFT_GROWN),
  'fuselage-hung': grown(hungFuselage, AIRCRAFT_GROWN),
  helicopter: grown(helicopter, AIRCRAFT_GROWN),
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
  'haul-truck': grown(haulTruck, HAUL_TRUCK_GROWN),
  excavator: grown(excavator, 2.5),
  cabin: grown(cabin, 1.8),
  crusher: grown(crusher, 2),
  rubble: grown(rubble, 3),
  outcrop,
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
  bandstand: grown(bandstand, HOUSE_GROWN),
  'toilet-block': grown(toiletBlock, HOUSE_GROWN),
  cafe: grown(cafe, HOUSE_GROWN),
  house: grown(house, HOUSE_GROWN),
  apartment: grown(apartment, HOUSE_GROWN),
  shop: grown(shop, HOUSE_GROWN),
  flat: grown(flat, HOUSE_GROWN),
  villa: grown(villa, HOUSE_GROWN),
  manor: grown(manor, HOUSE_GROWN),
  chimney,
  tank,
  gantry,
  rails,
  wagon,
  hedge,
  'street-tree': streetTree,
  // Downtown (#268): the old core at the high street's scale, the towers and
  // landmarks at game size (`downtownmodels.ts`).
  townhouse: grown(townhouse, HOUSE_GROWN),
  loft: grown(loft, HOUSE_GROWN),
  midrise: grown(midrise, HOUSE_GROWN),
  tower,
  'lookout-tower': lookoutTower,
  'twist-tower': twistTower,
  'chateau-hotel': chateauHotel,
  stadium,
  library,
  gallery,
  cathedral,
  'city-hall': cityHall,
  'cruise-terminal': cruiseTerminal,
  'geodesic-dome': geodesicDome,
  flatiron,
  // Downtown's once-over (2026-10-02), grown as `city/setpieces.ts` grows their solids.
  'bus-shelter': grown(busShelter, 2),
  bollard: grown(bollard, 2),
  planter: grown(planter, 2),
  bin: grown(bin, 2),
  fountain,
  statue,
  kiosk: grown(kiosk, HOUSE_GROWN),
  dumpster: grown(dumpster, HOUSE_GROWN),
  'food-truck': grown(foodTruck, 2),
  // Tidewater Park's once-over (2026-10-02), grown as `city/setpieces.ts` grows their solids.
  playground: grown(playground, 2),
  boathouse: grown(boathouse, HOUSE_GROWN),
  jetty: grown(jetty, HOUSE_GROWN),
  'rowing-boat': grown(rowingBoat, 2),
  'football-pitch': footballPitch,
  'tennis-court': grown(tennisCourt, HOUSE_GROWN),
  'beach-hut': grown(beachHut, HOUSE_GROWN),
  'lifeguard-tower': grown(lifeguardTower, HOUSE_GROWN),
  lighthouse,
  railing: grown(railing, 2),
  // Highmoor Park's once-over (2026-10-03), grown as `city/setpieces.ts` grows their solids.
  waymarker: grown(waymarker, 2),
  'field-gate': grown(fieldGate, 2),
  'stone-wall': grown(stoneWall, HOUSE_GROWN),
  log: grown(log, 2),
  'log-pile': grown(logPile, 2),
  boulder: grown(boulder, 2),
  'ranger-hut': grown(rangerHut, HOUSE_GROWN),
  'timber-lookout': grown(timberLookout, HOUSE_GROWN),
  tent: grown(tent, 2),
  campfire: grown(campfire, 2),
  'camper-van': grown(camperVan, 2),
  'radio-mast': radioMast,
  // Industrial's once-over (2026-10-03), in game metres.
  'pipe-rack': pipeRack,
  'cooling-tower': coolingTower,
  'fence-line': fenceLine,
  'flare-stack': flareStack,
  'gas-holder': gasHolder,
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

  constructor(pieces: readonly SetPiece[], options: { photo?: boolean } = {}) {
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
        const finish = options.photo ? WALL_FINISH_BY_COLOUR[colour] : undefined;
        let material: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
        if (finish) {
          material = new THREE.MeshStandardMaterial({ color: colour, metalness: 0 });
          triplanar(material, wallFinish(finish), finish);
        } else {
          material = new THREE.MeshLambertMaterial({ color: colour });
        }
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
