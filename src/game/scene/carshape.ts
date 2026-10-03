import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarBody } from '../cars';

/**
 * The shape of a car (#11).
 *
 * Until now a car was two boxes with no wheels, which is what a car looks like
 * to someone who has been told about cars. The chase camera sits behind this
 * object for the entire game, so it is the single most-looked-at thing in
 * Kestrel Bay and the cheapest place to spend geometry.
 *
 * Still generated, still low-poly, still no imported asset (#584): a body is
 * a loft, a stack of cross-sections along the car's length, each a ring of
 * eight points, so the deck can rise to a cowl and fall to a nose, the plan
 * can round at both ends and the flank can lean in. The greenhouse is a second
 * loft of four rings (base, roof front, roof rear, base), which is what makes
 * a raked screen, quarter windows and a rear glass rather than a box with
 * windows. The roof, the pillars and the mirrors are painted and share the
 * body's material, so the pool's one repaint colours all of them.
 *
 * Nothing here knows about the sim. Sizes come in as one width and the rest is
 * proportion, so a lorry is this function with a bigger number.
 */

type V3 = [number, number, number];

/**
 * Close a stack of rings into one solid. Every ring has the same number of
 * points in the same order round the section; consecutive rings are joined
 * into quads and the two ends are capped flat (with their own vertices, so a
 * cap does not smooth into the flank). The winding is fixed up afterwards: the
 * rings may run either way round, and the solid is only right if its faces
 * point out of it.
 */
function loft(rings: V3[][]): THREE.BufferGeometry {
  const n = rings[0].length;
  const pos: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(...p);
  const side: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + j;
      const d = (i + 1) * n + ((j + 1) % n);
      side.push(a, b, c, b, d, c);
    }
  }
  const at = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const centre = new THREE.Vector3();
  for (let k = 0; k < pos.length / 3; k++) centre.add(at(k));
  centre.divideScalar(pos.length / 3);
  // Outward means away from the middle of the solid.
  let facing = 0;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const mid = new THREE.Vector3();
  for (let t = 0; t < side.length; t += 3) {
    const [a, b, c] = [at(side[t]), at(side[t + 1]), at(side[t + 2])];
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    mid.copy(a).add(b).add(c).divideScalar(3).sub(centre);
    facing += e1.cross(e2).dot(mid);
  }
  const index = side.slice();
  if (facing < 0) for (let t = 0; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
  // Caps: a fan from each end ring's middle, turned to face along the axis.
  for (const [ring, axis] of [[0, -1], [rings.length - 1, 1]] as const) {
    const first = pos.length / 3;
    const c = new THREE.Vector3();
    for (let j = 0; j < n; j++) c.add(at(ring * n + j));
    c.divideScalar(n);
    pos.push(c.x, c.y, c.z);
    for (let j = 0; j < n; j++) pos.push(...rings[ring][j]);
    for (let j = 0; j < n; j++) {
      const a = first;
      const b = first + 1 + j;
      const d = first + 1 + ((j + 1) % n);
      e1.subVectors(at(b), at(a));
      e2.subVectors(at(d), at(a));
      if (e1.cross(e2).z * axis >= 0) index.push(a, b, d);
      else index.push(a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A flat four-cornered panel, wound so that it faces along `out`. */
function panel(p: V3, q: V3, r: V3, s: V3, out: V3): THREE.BufferGeometry {
  const pts = [p, q, r, s].map((v) => new THREE.Vector3(...v));
  const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
  const order = n.dot(new THREE.Vector3(...out)) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([p, q, r, s].flat(), 3));
  g.setIndex(order);
  g.computeVertexNormals();
  return g;
}

/** Linear interpolation through `[t, value]` keys, clamped at both ends. */
function keyed(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * How each body style differs from the coupe it started as (#434). Lengths
 * and heights are multiples of the coupe's; the rest say where the glass goes
 * and how big the wheels are. A frame has almost no glass and its wheels stand
 * outside the body; a roadster has a windscreen and nothing behind it; a
 * pickup's cab sits forward over a long bed.
 */
interface BodyShape {
  length: number;
  height: number;
  /** How far the nose drops, as a share of the height. */
  nose: number;
  /** How wide the body is at the top, and overall. */
  taper: number;
  width: number;
  glassLength: number;
  glassHeight: number;
  /** Where the roof ends over the glass, front and back: 1 is straight up. */
  roofFront: number;
  roofBack: number;
  /** Where the glass sits along the car, as a share of its length. */
  glassAt: number;
  tyre: number;
  /** How far out the wheels are, as a share of the width. */
  track: number;
  /** How high the floor is, as a multiple of the coupe's. */
  lift: number;
  /** How high the boot lid is, as a share of the height. */
  tail: number;
  /** A load bed behind the cab, which drops the deck there. */
  bed: boolean;
  /** No roof: the glass is a windscreen and the back of it is painted. */
  open: boolean;
  /** How much of the rear quarter is a solid painted pillar, 0 to 1. */
  pillar: number;
  /** A pillar between the doors. */
  bpillar: boolean;
  /** Height of a rear wing over the boot, as a share of the height; 0 for none. */
  spoiler: number;
}

const COUPE: BodyShape = {
  length: 1, height: 1, nose: 0.22, taper: 0.9, width: 1, glassLength: 0.5, glassHeight: 0.72,
  roofFront: 0.34, roofBack: 0.66, glassAt: -0.04, tyre: 0.175, track: 0.4, lift: 1,
  tail: 0.9, bed: false, open: false, pillar: 0.5, bpillar: false, spoiler: 0,
};

const BODIES: Record<CarBody, BodyShape> = {
  coupe: COUPE,
  hatch: { ...COUPE, length: 0.9, height: 1.12, nose: 0.14, glassLength: 0.6, glassHeight: 0.8, roofFront: 0.4, roofBack: 0.95, glassAt: -0.1, tail: 1, pillar: 0.3 },
  saloon: { ...COUPE, length: 1.1, height: 1.02, nose: 0.16, glassHeight: 0.75, roofFront: 0.45, roofBack: 0.5, glassAt: 0, pillar: 0.2, bpillar: true },
  roadster: { ...COUPE, length: 0.95, height: 0.9, nose: 0.2, glassLength: 0.22, glassHeight: 0.4, roofFront: 0.3, roofBack: 0.25, glassAt: 0.1, tail: 0.95, open: true },
  frame: { ...COUPE, length: 0.9, height: 0.55, nose: 0.1, taper: 0.7, width: 0.72, glassLength: 0.12, glassHeight: 0.5, roofFront: 0.2, roofBack: 0.3, glassAt: 0.05, tyre: 0.2, track: 0.5, open: true },
  wedge: { ...COUPE, length: 1.05, height: 0.8, nose: 0.32, glassLength: 0.45, glassHeight: 0.62, roofFront: 0.3, roofBack: 0.6, glassAt: 0.02, pillar: 0.7, spoiler: 0.2 },
  suv: { ...COUPE, length: 1.03, height: 1.55, nose: 0.08, taper: 0.94, glassLength: 0.62, glassHeight: 0.85, roofFront: 0.55, roofBack: 0.95, glassAt: -0.05, tyre: 0.21, lift: 1.4, tail: 1, pillar: 0.2, bpillar: true },
  pickup: { ...COUPE, length: 1.2, height: 1.45, nose: 0.06, taper: 0.95, glassLength: 0.3, glassHeight: 0.85, roofFront: 0.6, roofBack: 0.95, glassAt: 0.12, tyre: 0.22, lift: 1.5, bed: true, pillar: 0, bpillar: false },
};

/**
 * Car paint (#580, behind `?look=pbr`): `CityView` sets this before any car
 * is built. A lacquered body is a different material, not a tweak of Lambert's,
 * and the callers only ever touch `.color`, which both have.
 */
export const CAR_PAINT = { clearcoat: false };

export interface CarParts {
  /** The painted shell, roof and pillars included. Must stay a car's first child. */
  body: THREE.Mesh;
  glass: THREE.Mesh;
  wheels: THREE.Mesh[];
  /** Everything else that belongs on the car: arches, bumpers, grille, mirrors, wing. */
  extras: THREE.Mesh[];
  /** Where a lightbar or a spoiler would sit, in local units. */
  roof: number;
  width: number;
  length: number;
  /** The body's own height and where its floor sits, for lights and bands. */
  height: number;
  floor: number;
}

/**
 * Build one car's meshes, sized off `width`, sitting on y = 0.
 *
 * Returned as parts rather than a group so the caller decides what goes in and
 * in what order - the pool leans on the body being a car's first child, and a
 * cop needs to slip a door band in between. Every geometry is in the car's own
 * space, so none of the meshes is moved from the origin.
 */
export function carParts(width: number, aspect: number, style: CarBody = 'coupe'): CarParts {
  const b = BODIES[style];
  const w = width;
  const length = w * 1.9 * b.length;
  const height = w * aspect * 0.62 * b.height;
  // A road car's wheel is about a third of its width across. A quarter, which
  // is what this had first, is a wheel taller than the body it is under.
  const tyre = w * b.tyre;
  // The body's underside sits below the axle line, which is what stops a car
  // reading as a box balanced on four wheels.
  const floor = w * 0.175 * 0.66 * b.lift;
  const half = w * b.width * 0.47;
  const wheelZ = length * 0.32;

  // The deck line along the car, tail (0) to nose (1), as a share of the
  // height: the boot, the cowl where the screen starts, the bonnet falling away.
  const noseY = 1 - b.nose - 0.1;
  const deck: [number, number][] = b.bed
    ? [[0, 0.62], [0.4, 0.62], [0.44, 0.97], [0.7, 1], [0.86, (1 + noseY) / 2], [1, noseY]]
    : [[0, b.tail - 0.04], [0.14, b.tail], [0.36, 1], [0.62, 1], [0.84, (1 + noseY) / 2], [1, noseY]];
  const deckAt = (z: number) => floor + height * keyed(deck, z / length + 0.5);

  // The shell: fourteen stations, each eight points round. The plan rounds in
  // over the last third at each end and the underside lifts there too, which
  // is the approach and departure angle.
  const rings: V3[][] = [];
  const stations = 14;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const z = (t - 0.5) * length;
    const u = Math.abs(2 * t - 1);
    const plan = u < 0.7 ? 1 : 1 - 0.2 * ((u - 0.7) / 0.3) ** 2;
    const hw = half * plan;
    const top = deckAt(z);
    const lift = u < 0.8 ? 0 : 0.14 * ((u - 0.8) / 0.2) ** 2;
    const bottom = floor + height * lift;
    const span = top - bottom;
    const sh = hw * b.taper * 0.93;
    rings.push([
      [-hw * 0.9, bottom, z],
      [-hw, bottom + span * 0.12, z],
      [-hw, bottom + span * 0.62, z],
      [-sh, top, z],
      [sh, top, z],
      [hw, bottom + span * 0.62, z],
      [hw, bottom + span * 0.12, z],
      [hw * 0.9, bottom, z],
    ]);
  }
  const painted: THREE.BufferGeometry[] = [loft(rings)];

  // The greenhouse, as four rings: the screen's foot, the roof's front edge,
  // the roof's back edge and the rear glass's foot. At the two feet the top
  // edge sits on the base, so the side glass is a triangle there and the
  // windscreen is the slope between the first ring and the second.
  const cLen = length * b.glassLength;
  const cMid = length * b.glassAt;
  const zA = cMid + cLen / 2;
  const zB = cMid + (cLen / 2) * b.roofFront;
  const zC = cMid - (cLen / 2) * b.roofBack;
  const zD = cMid - cLen / 2;
  const roofY = floor + height * (1 + b.glassHeight / 2);
  const baseHalf = half * 0.8;
  const roofHalf = half * 0.58;
  const foot = (z: number): V3[] => {
    const y = deckAt(z) - height * 0.02;
    return [[-baseHalf, y, z], [-baseHalf * 0.96, y + 1, z], [baseHalf * 0.96, y + 1, z], [baseHalf, y, z]];
  };
  const crown = (z: number): V3[] => {
    const y = deckAt(z) - height * 0.02;
    return [[-baseHalf, y, z], [-roofHalf, roofY, z], [roofHalf, roofY, z], [baseHalf, y, z]];
  };
  const cabin = [foot(zA), crown(zB), crown(zC), foot(zD)];
  const glassGeometry = loft(cabin).toNonIndexed();
  glassGeometry.computeVertexNormals();

  // A side panel over part of the cabin's flank, between two of its rings,
  // pushed out a hair so it paints over the glass rather than fighting it.
  const standoff = w * 0.006;
  const flank = (from: V3[], to: V3[], u0: number, u1: number, sign: number): THREE.BufferGeometry => {
    const lerp = (p: V3, q: V3, u: number): V3 => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
    // Left side is points 0 and 1 of a ring, right side is 3 and 2.
    const lo = sign < 0 ? [0, 1] : [3, 2];
    const pts = [
      lerp(from[lo[0]], to[lo[0]], u0), lerp(from[lo[1]], to[lo[1]], u0),
      lerp(from[lo[1]], to[lo[1]], u1), lerp(from[lo[0]], to[lo[0]], u1),
    ].map((p): V3 => [p[0] + sign * standoff, p[1], p[2]]);
    return panel(pts[0], pts[1], pts[2], pts[3], [sign, 0, 0]);
  };
  const [, rB, rC, rD] = cabin;
  if (!b.open) {
    // The roof: a thin plate on the crown, a little wider than the glass under it.
    const lip = w * 0.01;
    const plate = (z: number): V3[] => [
      [-roofHalf - lip, roofY - height * 0.04, z],
      [-roofHalf - lip, roofY + lip, z],
      [roofHalf + lip, roofY + lip, z],
      [roofHalf + lip, roofY - height * 0.04, z],
    ];
    painted.push(loft([plate(zB + lip), plate(zC - lip)]));
    for (const sign of [-1, 1]) {
      // The rear quarter: a solid pillar from the roof's back edge forwards
      // along the rear slope by `pillar`.
      if (b.pillar > 0) painted.push(flank(rC, rD, 0, b.pillar, sign));
      if (b.bpillar) painted.push(flank(rB, rC, 0.46, 0.54, sign));
    }
  } else {
    // No roof: the screen's header and the sheet behind the seats are paint.
    const lip = w * 0.01;
    const header = (z: number): V3[] => [
      [-roofHalf - lip, roofY - height * 0.03, z],
      [-roofHalf - lip, roofY + lip, z],
      [roofHalf + lip, roofY + lip, z],
      [roofHalf + lip, roofY - height * 0.03, z],
    ];
    painted.push(loft([header(zB + lip), header(zC - lip)]));
    painted.push(panel(rC[1], rC[2], rD[2], rD[1], [0, 0, -1]));
  }

  const bodyMaterial = CAR_PAINT.clearcoat
    ? new THREE.MeshPhysicalMaterial({
        roughness: 0.6,
        metalness: 0.05,
        envMapIntensity: 0.6,
        clearcoat: 0.3,
        clearcoatRoughness: 0.55,
        specularIntensity: 0.15,
      })
    : new THREE.MeshLambertMaterial();
  const body = new THREE.Mesh(mergeGeometries(painted.map((g) => g.toNonIndexed()))!, bodyMaterial);

  const glass = new THREE.Mesh(
    glassGeometry,
    // Dark and slightly shiny. Phong rather than Lambert for one small mesh:
    // glass with no specular is a black hole where a windscreen should be.
    new THREE.MeshPhongMaterial({
      color: '#141a26',
      shininess: 70,
      specular: '#8fa8c8',
      flatShading: true,
    }),
  );

  // One geometry and one material shared by all four wheels: they are
  // identical, and four of anything is worth not allocating four times.
  const wheelGeometry = new THREE.CylinderGeometry(tyre, tyre, w * 0.17, 12);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: '#15161a' });
  // The rim is a pale disc standing a hair proud of the tyre's sidewall, with
  // a dark dish in it, which is enough to read as a wheel at chase distance.
  const rimGeometry = new THREE.CylinderGeometry(tyre * 0.62, tyre * 0.62, w * 0.178, 10).rotateZ(Math.PI / 2);
  const rimMaterial = new THREE.MeshLambertMaterial({ color: '#aab0b9' });
  const dishGeometry = new THREE.CylinderGeometry(tyre * 0.36, tyre * 0.36, w * 0.184, 10).rotateZ(Math.PI / 2);
  const dishMaterial = new THREE.MeshLambertMaterial({ color: '#30343b' });
  const wheels: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      // Just inside the flank, so the car sits on its wheels rather than
      // beside them, and set in from the ends: overhang is what makes a car
      // look like a van.
      wheel.position.set(side * w * b.track, tyre, end * wheelZ);
      wheel.add(new THREE.Mesh(rimGeometry, rimMaterial), new THREE.Mesh(dishGeometry, dishMaterial));
      wheels.push(wheel);
    }
  }

  const extras: THREE.Mesh[] = [];
  const trim = new THREE.MeshLambertMaterial({ color: '#0e0f13' });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    extras.push(mesh);
    return mesh;
  };

  // Wheel arches: the dark gap round a tyre, drawn as the top half of a disc
  // on the flank. A frame's wheels stand outside its body, so it has none.
  if (b.track * w < half) {
    const arch = new THREE.CircleGeometry(tyre * 1.16, 12, 0, Math.PI);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const mesh = add(arch.clone().rotateY((side * Math.PI) / 2), trim, side * (half + 1), tyre, end * wheelZ);
        mesh.name = 'arch';
      }
    }
  }

  // Bumpers and the grille: dark, a little proud of the ends.
  const endW = half * 1.62;
  for (const end of [-1, 1]) {
    add(new THREE.BoxGeometry(endW, height * 0.17, length * 0.03), trim, 0, floor + height * 0.2, end * length * 0.495);
  }
  add(new THREE.BoxGeometry(w * 0.32, height * 0.1, length * 0.03), trim, 0, floor + height * 0.4, length * 0.497);

  // Door mirrors, in the body's paint (the same material, so one repaint
  // colours them), at the foot of the screen.
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(w * 0.07, height * 0.09, length * 0.035), bodyMaterial, side * (baseHalf + w * 0.04), deckAt(zA) + height * 0.04, zA - length * 0.04);
  }

  // A load bed: a dark floor and low painted walls round it, on the deck the
  // lowered tail leaves behind the cab.
  if (b.bed) {
    const bedLength = length * 0.4;
    const zBed = -length * 0.5 + bedLength / 2 + length * 0.01;
    const yBed = deckAt(zBed);
    const wall = height * 0.14;
    add(new THREE.BoxGeometry(half * 1.8, height * 0.02, bedLength), trim, 0, yBed + 1, zBed);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(w * 0.05, wall, bedLength), bodyMaterial, side * half * 0.93, yBed + wall / 2, zBed);
    }
    add(new THREE.BoxGeometry(half * 1.94, wall, w * 0.05), bodyMaterial, 0, yBed + wall / 2, -length * 0.5 + w * 0.03);
    add(new THREE.BoxGeometry(half * 1.94, wall, w * 0.05), bodyMaterial, 0, yBed + wall / 2, zBed + bedLength / 2);
  }

  // A wing, on two posts, over the boot.
  if (b.spoiler > 0) {
    const zw = -length * 0.46;
    const yw = deckAt(zw) + height * b.spoiler;
    add(new THREE.BoxGeometry(w * 0.84 * b.width, height * 0.06, length * 0.1), bodyMaterial, 0, yw, zw);
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(w * 0.05, height * b.spoiler, length * 0.03), trim, side * w * 0.3, yw - (height * b.spoiler) / 2, zw);
    }
  }

  return {
    body,
    glass,
    wheels,
    extras,
    roof: roofY,
    width: w,
    length,
    height,
    floor,
  };
}
