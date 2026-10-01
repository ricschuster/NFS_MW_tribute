import * as THREE from 'three';
import { TOWER, TOWER_HEIGHTS } from '../city/setpieces';

/**
 * Downtown's buildings (#268), as set pieces: its old core's terraces and
 * warehouses, its office towers, and the landmarks the owner picked with
 * Vancouver's downtown as the example - each an original drawn from what that
 * kind of building is (a sail-roofed cruise terminal, a lookout tower with a
 * saucer on top), never a copy of one.
 *
 * The same rules as `setpieces.ts`: boxes, cylinders and the odd extrusion in
 * metres, length along +z with the front at +z, merged by colour so a kind is
 * one draw call per colour. Window detail is bands and strips rather than
 * punched windows wherever a building is tall, since a tower of punched
 * windows is thousands of boxes and a band reads the same at the distance a
 * tower is seen from.
 */

export type Part = { geometry: THREE.BufferGeometry; colour: string };

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const box = (w: number, h: number, l: number) => new THREE.BoxGeometry(w, h, l);
const upright = (top: number, bottom: number, height: number, segments = 16) => new THREE.CylinderGeometry(top, bottom, height, segments);
/** A dome: the top half of a sphere, its base at y = 0. */
const dome = (r: number, segments = 24) => new THREE.SphereGeometry(r, segments, Math.max(6, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
/** A gable: a triangular prism with its ridge along z, base at y = 0. */
const gableZ = (width: number, height: number, length: number) =>
  new THREE.CylinderGeometry(1, 1, length, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0).scale(width / Math.sqrt(3), height / 1.5, 1);
/** The same with its ridge along x. */
const gableX = (width: number, height: number, length: number) => gableZ(length, height, width).rotateY(Math.PI / 2);
/** A thin box from `a` to `b`: a cable or a brace. */
const strut = (a: THREE.Vector3, b: THREE.Vector3, thick: number) => {
  const length = a.distanceTo(b);
  const g = box(thick, thick, length);
  g.lookAt(new THREE.Vector3().subVectors(b, a));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};
/** A four-sided pyramid or hipped roof over a `w` by `l` rectangle, `top` the fraction left flat. */
const hip = (w: number, l: number, h: number, top = 0) =>
  new THREE.CylinderGeometry(top, 1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w / Math.SQRT2, h, l / Math.SQRT2);

const WINDOW = '#3a4a52';
const GLASS = '#3f6074';
const GLASS_LIGHT = '#7d9fb2';
const SPANDREL = '#d9dcdc';
const STONE = '#cfc6b2';
const STONE_DARK = '#a69c88';
const CONCRETE = '#a3a39b';
const WHITE = '#eeeeea';
const COPPER = '#5f9c86';
const SLATE = '#4c5155';
const GOLD = '#c9a85a';

const WALLS: Record<string, string> = { brick: '#9a5b45', stone: '#cbbfa6', render: '#d8d2c6', red: '#8c4a3a', brown: '#6e4a36', concrete: CONCRETE };
const FASCIA: Record<string, string> = { brick: '#2f5e46', stone: '#7a2f2a', render: '#2f4d7a' };

/**
 * An old-core townhouse: four storeys, narrow, a shopfront under a fascia on
 * the ground floor, a cornice, and a chimney stack. Terraced, it is the old
 * town's street wall.
 */
export function townhouse(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'brick'] ?? WALLS.brick;
  const windows = [6, 9, 12].flatMap((y) => [-1.8, 1.8].flatMap((x) => [6.02, -6.02].map((z) => ({ geometry: at(box(1.3, 1.9, 0.1), x, y, z), colour: WINDOW }))));
  return [
    { geometry: at(box(7, 15, 12), 0, 7.5, 0), colour: wall },
    { geometry: at(box(7.3, 0.6, 12.3), 0, 15.1, 0), colour: STONE_DARK },
    { geometry: at(box(6, 2.8, 0.1), 0, 1.8, 6.02), colour: '#2f3e46' },
    { geometry: at(box(7, 0.7, 0.2), 0, 3.6, 6.06), colour: FASCIA[variant ?? 'brick'] ?? FASCIA.brick },
    { geometry: at(box(1.6, 2.4, 1.2), 2.4, 16.4, -3), colour: '#7a4c3a' },
    ...windows,
  ];
}

/**
 * A warehouse loft on the quay: six storeys of brick, a stone band over the
 * ground floor, rows of tall windows, and a timber water tank on the roof.
 */
export function loft(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'red'] ?? WALLS.red;
  const windows = [2.4, 6, 9.4, 12.8, 16.2].flatMap((y) =>
    [-9, -5.4, -1.8, 1.8, 5.4, 9].flatMap((x) => [8.02, -8.02].map((z) => ({ geometry: at(box(2, 2.4, 0.1), x, y, z), colour: WINDOW }))),
  );
  const legs = [-1.2, 1.2].flatMap((x) => [-1.2, 1.2].map((z) => ({ geometry: at(box(0.3, 2, 0.3), 6 + x, 20, -4 + z), colour: '#3b3b3b' })));
  return [
    { geometry: at(box(22, 19, 16), 0, 9.5, 0), colour: wall },
    { geometry: at(box(22.1, 0.6, 16.1), 0, 4.1, 0), colour: STONE },
    { geometry: at(box(22.4, 0.8, 16.4), 0, 19.2, 0), colour: STONE_DARK },
    { geometry: at(upright(1.6, 1.6, 3, 12), 6, 22.5, -4), colour: '#6b4a32' },
    { geometry: at(new THREE.ConeGeometry(1.8, 1.2, 12), 6, 24.6, -4), colour: '#4a3424' },
    ...legs,
    ...windows,
  ];
}

/**
 * A mid-rise block between the old core and the towers: seven storeys of
 * ribbon windows, a glazed ground floor, and plant on the roof.
 */
export function midrise(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'stone'] ?? WALLS.stone;
  const bands = Array.from({ length: 6 }, (_, k) => ({ geometry: at(box(20.1, 1.6, 15.1), 0, 5.4 + 3.4 * k, 0), colour: WINDOW }));
  return [
    { geometry: at(box(20, 26, 15), 0, 13, 0), colour: wall },
    { geometry: at(box(20.15, 3, 15.15), 0, 1.6, 0), colour: '#2f3e46' },
    { geometry: at(box(20.4, 0.6, 15.4), 0, 26.3, 0), colour: STONE_DARK },
    { geometry: at(box(6, 2.4, 5), -3, 27.8, -2), colour: CONCRETE },
    ...bands,
  ];
}

/**
 * An office tower, 30 m square, its height by its look (`TOWER_HEIGHTS`):
 * glass with a pale spandrel at every floor, stone with strips of windows
 * running its height, or art deco, stepping back in three tiers to a dark
 * crown and a gilded spire.
 */
export function tower(variant?: string): Part[] {
  const look = variant ?? 'glass';
  const h = TOWER_HEIGHTS[look] ?? TOWER_HEIGHTS.glass;
  const { w, l } = TOWER;
  if (look.startsWith('stone')) {
    const strips = [-12, -8, -4, 0, 4, 8, 12].flatMap((u) => [
      { geometry: at(box(1.6, h - 10, 0.1), u, 6 + (h - 10) / 2, l / 2 + 0.02), colour: WINDOW },
      { geometry: at(box(1.6, h - 10, 0.1), u, 6 + (h - 10) / 2, -l / 2 - 0.02), colour: WINDOW },
      { geometry: at(box(0.1, h - 10, 1.6), w / 2 + 0.02, 6 + (h - 10) / 2, u), colour: WINDOW },
      { geometry: at(box(0.1, h - 10, 1.6), -w / 2 - 0.02, 6 + (h - 10) / 2, u), colour: WINDOW },
    ]);
    return [
      { geometry: at(box(w, h, l), 0, h / 2, 0), colour: STONE },
      { geometry: at(box(w + 1, 6, l + 1), 0, 3, 0), colour: STONE_DARK },
      { geometry: at(box(w + 1, 1.5, l + 1), 0, h - 0.5, 0), colour: STONE_DARK },
      { geometry: at(box(12, 4, 12), 0, h + 2, 0), colour: CONCRETE },
      ...strips,
    ];
  }
  if (look === 'deco') {
    const warm = '#c2b69c';
    const t1 = h * 0.62, t2 = h * 0.2, t3 = h * 0.1;
    const piers = [-10.5, -3.5, 3.5, 10.5].flatMap((u) => [
      { geometry: at(box(2.4, t1 - 6, 0.1), u, 6 + (t1 - 6) / 2, l / 2 + 0.02), colour: WINDOW },
      { geometry: at(box(2.4, t1 - 6, 0.1), u, 6 + (t1 - 6) / 2, -l / 2 - 0.02), colour: WINDOW },
      { geometry: at(box(0.1, t1 - 6, 2.4), w / 2 + 0.02, 6 + (t1 - 6) / 2, u), colour: WINDOW },
      { geometry: at(box(0.1, t1 - 6, 2.4), -w / 2 - 0.02, 6 + (t1 - 6) / 2, u), colour: WINDOW },
    ]);
    return [
      { geometry: at(box(w, t1, l), 0, t1 / 2, 0), colour: warm },
      { geometry: at(box(24, t2, 24), 0, t1 + t2 / 2, 0), colour: warm },
      { geometry: at(box(17, t3, 17), 0, t1 + t2 + t3 / 2, 0), colour: warm },
      { geometry: at(hip(17, 17, h * 0.08, 0.3), 0, t1 + t2 + t3, 0), colour: '#2f3a3f' },
      { geometry: at(box(24.4, 1, 24.4), 0, t1 + t2 - 0.5, 0), colour: GOLD },
      { geometry: at(upright(0.25, 0.6, 14, 8), 0, h + 7, 0), colour: GOLD },
      ...piers,
    ];
  }
  // Glass, at three heights; the tall one has a crown of fins.
  const floors = Math.floor((h - 8) / 4);
  const spandrels = Array.from({ length: floors }, (_, k) => ({ geometry: at(box(w + 0.3, 0.7, l + 0.3), 0, 8 + 4 * k, 0), colour: SPANDREL }));
  const crown =
    look === 'glass-tall'
      ? [-9, -3, 3, 9].map((u) => ({ geometry: at(box(1, 10, l), u, h + 5, 0), colour: SPANDREL }))
      : [{ geometry: at(box(18, 4, 18), 0, h + 2, 0), colour: CONCRETE }];
  return [
    { geometry: at(box(w, h, l), 0, h / 2, 0), colour: look === 'glass-low' ? GLASS_LIGHT : GLASS },
    { geometry: at(box(w + 0.4, 6, l + 0.4), 0, 3, 0), colour: '#26313a' },
    ...spandrels,
    ...crown,
  ];
}

/**
 * The lookout tower, downtown's tallest at about 180 m (the owner's skyline):
 * an office block to 118 m, a concrete shaft on up, and a round lookout - a
 * saucer of glass with a restaurant ring - at the top, an antenna over it.
 */
export function lookoutTower(): Part[] {
  const rings = Array.from({ length: 27 }, (_, k) => ({ geometry: at(box(32.2, 1.8, 32.2), 0, 8 + 4 * k, 0), colour: WINDOW }));
  return [
    { geometry: at(box(32, 118, 32), 0, 59, 0), colour: '#bab5a8' },
    { geometry: at(box(32.4, 6, 32.4), 0, 3, 0), colour: '#26313a' },
    ...rings,
    { geometry: at(upright(5.5, 6, 52, 16), 0, 144, 0), colour: CONCRETE },
    { geometry: at(box(2.4, 118, 0.6), 0, 59, 16.3), colour: GOLD },
    { geometry: at(upright(17, 12, 4, 32), 0, 164, 0), colour: WHITE },
    { geometry: at(upright(17.6, 17, 4, 32), 0, 168, 0), colour: GLASS_LIGHT },
    { geometry: at(upright(15, 17.6, 2.4, 32), 0, 171.2, 0), colour: WHITE },
    { geometry: at(upright(0.35, 0.6, 12, 6), 0, 178.4, 0), colour: '#8a8f93' },
  ];
}

/**
 * A twisting residential tower: forty floors of glass slabs, each turned a
 * little further than the one below, on a stone podium - the skyline's other
 * shape, after the lookout.
 */
export function twistTower(): Part[] {
  const floors = 38;
  const twist = 0.9;
  const parts: Part[] = [{ geometry: at(box(36, 8, 36), 0, 4, 0), colour: STONE }];
  for (let k = 0; k < floors; k++) {
    const a = (k / floors) * twist;
    const y = 8 + 3.8 * k;
    parts.push({ geometry: at(box(26, 3.3, 26).rotateY(a), 0, y + 1.65, 0), colour: GLASS });
    parts.push({ geometry: at(box(26.6, 0.5, 26.6).rotateY(a), 0, y + 3.55, 0), colour: SPANDREL });
  }
  return parts;
}

/**
 * A château-style railway hotel: a stone block under a steep copper roof,
 * turrets at its front corners, chimney stacks, and rows of windows.
 */
export function chateauHotel(): Part[] {
  const stone = '#c9bea6';
  const windows = [5, 9.5, 14, 18.5, 23, 27.5, 32, 36.5].flatMap((y) =>
    [-18, -12, -6, 0, 6, 12, 18].flatMap((x) => [16.02, -16.02].map((z) => ({ geometry: at(box(1.8, 2.4, 0.1), x, y, z), colour: WINDOW }))),
  );
  const turrets = [-20, 20].flatMap((x) => [
    { geometry: at(upright(3.4, 3.4, 10, 12), x, 44, 14), colour: stone },
    { geometry: at(new THREE.ConeGeometry(3.8, 9, 12), x, 53.5, 14), colour: COPPER },
  ]);
  return [
    { geometry: at(box(44, 42, 32), 0, 21, 0), colour: stone },
    { geometry: at(box(45, 3, 33), 0, 1.5, 0), colour: STONE_DARK },
    { geometry: at(hip(46, 34, 22, 0.3), 0, 42, 0), colour: COPPER },
    { geometry: at(box(2, 6, 2), -10, 60, 0), colour: STONE_DARK },
    { geometry: at(box(2, 6, 2), 10, 60, 0), colour: STONE_DARK },
    { geometry: at(box(5, 4, 0.2), 0, 2.6, 16.1), colour: '#3d3a36' },
    ...turrets,
    ...windows,
  ];
}

/**
 * A stadium by the freeway: an oval bowl 230 m by 190 with a band of glass
 * round it, a shallow white roof held up on a ring of masts, and four
 * entrances.
 */
export function stadium(): Part[] {
  const [a, b] = [115, 95];
  // Masts round the rim, each holding the roof on a cable down to a ring
  // a third of the way in.
  const masts = Array.from({ length: 12 }, (_, k) => {
    const t = (k / 12) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(t) * (a + 2), 62, Math.sin(t) * (b + 2));
    const hold = new THREE.Vector3(Math.cos(t) * a * 0.62, 47, Math.sin(t) * b * 0.62);
    return [
      { geometry: at(upright(0.8, 1, 26, 8), top.x, 49, top.z), colour: WHITE },
      { geometry: strut(top, hold, 0.35), colour: '#8a8f93' },
    ];
  }).flat();
  const doors = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((t) => ({
    geometry: at(box(14, 8, 2).rotateY(-t + Math.PI / 2), Math.cos(t) * a, 4, Math.sin(t) * b),
    colour: '#26313a',
  }));
  return [
    { geometry: at(upright(1, 1, 38, 48).scale(a, 1, b), 0, 19, 0), colour: '#c3c4bf' },
    { geometry: at(upright(1, 1, 6, 48).scale(a + 0.5, 1, b + 0.5), 0, 27, 0), colour: WINDOW },
    { geometry: at(dome(1, 48).scale(a - 2, 13, b - 2), 0, 38, 0), colour: WHITE },
    ...masts,
    ...doors,
  ];
}

/**
 * A library behind a colosseum: a curved arcaded wall of warm stone wrapped
 * round the front of a glass block, tier on tier of arches open to the
 * street.
 */
export function library(): Part[] {
  const sand = '#c9a882';
  const [a, b] = [40, 30];
  const arches: Part[] = [];
  for (const y of [3.5, 9, 14.5, 20, 25.5]) {
    for (let k = 1; k < 18; k++) {
      const t = (k / 18) * Math.PI;
      const x = Math.cos(t) * (a + 0.3), z = Math.sin(t) * (b + 0.3);
      // The arch faces out along the ellipse's normal.
      const face = Math.atan2(Math.cos(t) * b, Math.sin(t) * a);
      arches.push({ geometry: at(box(2.4, 3.8, 0.4).rotateY(face), x, y, z), colour: '#3a4048' });
    }
  }
  return [
    // The curved wall: the front half of an open ellipse, single-sided, seen from the street.
    { geometry: at(new THREE.CylinderGeometry(1, 1, 29, 40, 1, true, -Math.PI / 2, Math.PI).scale(a, 1, b), 0, 14.5, 0), colour: sand },
    { geometry: at(box(46, 34, 40), 0, 17, -10), colour: GLASS_LIGHT },
    { geometry: at(box(46.4, 1, 40.4), 0, 34.5, -10), colour: sand },
    ...arches,
  ];
}

/** A row of `n` columns `spacing` apart along x, `h` tall from `y0`, at depth `z`. */
const columns = (n: number, spacing: number, h: number, y0: number, z: number, colour: string): Part[] =>
  Array.from({ length: n }, (_, k) => ({ geometry: at(upright(0.9, 1.1, h, 12), (k - (n - 1) / 2) * spacing, y0 + h / 2, z), colour }));

/**
 * A gallery in an old courthouse: neoclassical, a portico of six columns
 * under a pediment, steps down to a plaza, and a copper dome on a drum over
 * the middle.
 */
export function gallery(): Part[] {
  const stone = '#d8d0bd';
  const steps = [0, 1, 2].map((i) => ({ geometry: at(box(36, 0.7, 8 - i * 2), 0, 0.35 + i * 0.7, 21 - i), colour: STONE_DARK }));
  return [
    { geometry: at(box(72, 20, 42), 0, 10, -3), colour: stone },
    { geometry: at(box(73, 1.2, 43), 0, 20.4, -3), colour: STONE_DARK },
    ...steps,
    ...columns(6, 5, 14, 2.1, 21, stone),
    { geometry: at(box(30, 2.4, 6), 0, 17.3, 21), colour: stone },
    { geometry: at(gableX(30, 5, 6), 0, 18.5, 21), colour: stone },
    { geometry: at(upright(9, 9, 6, 24), 0, 23, -3), colour: stone },
    { geometry: at(dome(9.4), 0, 26, -3), colour: COPPER },
    { geometry: at(upright(1.2, 1.4, 3, 10), 0, 36.5, -3), colour: stone },
  ];
}

/**
 * A Gothic cathedral in grey stone: a long nave under a steep roof, buttresses
 * down its sides with tall windows between them, and a tower and spire over
 * the door at the front.
 */
export function cathedral(): Part[] {
  const stone = '#9e978a';
  const buttresses = [-26, -17, -8, 1, 10].flatMap((z) => [-1, 1].map((s) => ({ geometry: at(box(2, 16, 3), s * 11, 8, z), colour: STONE_DARK })));
  const windows = [-21.5, -12.5, -3.5, 5.5, 14.5].flatMap((z) => [-1, 1].map((s) => ({ geometry: at(box(0.2, 10, 2.4), s * 10.05, 11, z), colour: WINDOW })));
  return [
    { geometry: at(box(20, 22, 52), 0, 11, -6), colour: stone },
    { geometry: at(gableZ(21, 12, 52), 0, 22, -6), colour: SLATE },
    ...buttresses,
    ...windows,
    { geometry: at(box(12, 40, 12), 0, 20, 26), colour: stone },
    { geometry: at(new THREE.ConeGeometry(6.4, 26, 4).rotateY(Math.PI / 4), 0, 53, 26), colour: SLATE },
    { geometry: at(box(4, 7, 0.2), 0, 3.5, 32.1), colour: '#3d3a36' },
    { geometry: at(upright(2.6, 2.6, 0.2, 20).rotateX(Math.PI / 2), 0, 28, 32.1), colour: WINDOW },
  ];
}

/**
 * City hall, classical (the owner's pick): a wide stone front, a portico of
 * eight columns under a pediment, and a clock tower over the middle with a
 * clock on each face and a copper cupola.
 */
export function cityHall(): Part[] {
  const stone = '#d6cdb8';
  const windows = [5, 10, 15].flatMap((y) =>
    [-34, -29, -24, 24, 29, 34].flatMap((x) => [17.02, -17.02].map((z) => ({ geometry: at(box(1.8, 2.6, 0.1), x, y, z), colour: WINDOW }))),
  );
  const clocks = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].flatMap((t) => [
    { geometry: at(upright(3.2, 3.2, 0.3, 24).rotateX(Math.PI / 2).rotateY(t), Math.sin(t) * 6.1, 41, Math.cos(t) * 6.1), colour: WHITE },
    { geometry: at(box(0.3, 2.4, 0.2).rotateY(t), Math.sin(t) * 6.3, 41.8, Math.cos(t) * 6.3), colour: '#26292b' },
  ]);
  return [
    { geometry: at(box(76, 22, 34), 0, 11, 0), colour: stone },
    { geometry: at(box(77, 2, 35), 0, 1, 0), colour: STONE_DARK },
    { geometry: at(box(77, 1.2, 35), 0, 22.4, 0), colour: STONE_DARK },
    ...windows,
    ...columns(8, 5, 16, 2, 19.5, stone),
    { geometry: at(box(42, 2.4, 6), 0, 19.2, 19.5), colour: stone },
    { geometry: at(gableX(42, 6, 6), 0, 20.4, 19.5), colour: stone },
    { geometry: at(box(12, 24, 12), 0, 34, 0), colour: stone },
    ...clocks,
    { geometry: at(upright(4.5, 4.5, 4, 16), 0, 48, 0), colour: stone },
    { geometry: at(dome(4.8, 16), 0, 50, 0), colour: COPPER },
    { geometry: at(upright(0.2, 0.4, 4, 6), 0, 56, 0), colour: GOLD },
  ];
}

/**
 * A cruise terminal on the water: a long low hall with a band of glass, and a
 * row of white fabric sails peaked along its roof - the waterfront's
 * signature, at the end of a pier.
 */
export function cruiseTerminal(): Part[] {
  const sails = [-72, -36, 0, 36, 72].flatMap((z, k) => [
    { geometry: at(hip(30, 30, 18 + (k % 2) * 4), 0, 14, z), colour: '#f4f4f0' },
    { geometry: at(upright(0.4, 0.5, 6, 6), 0, 32 + (k % 2) * 4 + 3, z), colour: '#8a8f93' },
  ]);
  return [
    // The pier it stands on, down into the water.
    { geometry: at(box(56, 8, 200), 0, -4, 0), colour: '#5b5f60' },
    { geometry: at(box(56, 14, 200), 0, 7, 0), colour: '#dcdcd6' },
    { geometry: at(box(56.2, 5, 200.2), 0, 9, 0), colour: GLASS_LIGHT },
    { geometry: at(box(56.4, 0.8, 200.4), 0, 14.2, 0), colour: WHITE },
    ...sails,
  ];
}

/**
 * A geodesic dome on the shore: a faceted silver ball forty-odd metres across
 * on a ring of legs, a science centre's kind of building.
 */
export function geodesicDome(): Part[] {
  const legs = Array.from({ length: 8 }, (_, k) => {
    const t = (k / 8) * Math.PI * 2;
    return { geometry: at(upright(0.9, 1.2, 8, 8), Math.cos(t) * 14, 4, Math.sin(t) * 14), colour: CONCRETE };
  });
  return [
    { geometry: at(upright(18, 20, 2, 24), 0, 1, 0), colour: CONCRETE },
    ...legs,
    { geometry: at(new THREE.IcosahedronGeometry(22, 3), 0, 24, 0), colour: '#c9ced4' },
  ];
}

/**
 * A flatiron: a wedge of a building filling a sharp junction, wide at the
 * back and three windows across at its rounded prow, with a band of windows
 * at every floor and a cornice on top.
 */
export function flatiron(variant?: string): Part[] {
  const wall = WALLS[variant ?? 'stone'] ?? WALLS.stone;
  // In plan, z towards the prow; the shape is drawn in x and -z, then stood up.
  const plan = (grow: number) => {
    const s = new THREE.Shape();
    s.moveTo(-13 * grow, 22 * grow);
    s.lineTo(13 * grow, 22 * grow);
    s.lineTo(3 * grow, -21 * grow);
    s.quadraticCurveTo(0, -23 * grow, -3 * grow, -21 * grow);
    s.closePath();
    return s;
  };
  const slab = (grow: number, h: number, y: number) =>
    new THREE.ExtrudeGeometry(plan(grow), { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0);
  const bands = Array.from({ length: 8 }, (_, k) => ({ geometry: slab(1.012, 1.6, 4.2 + 3.6 * k), colour: WINDOW }));
  return [
    { geometry: slab(1, 34, 0), colour: wall },
    { geometry: slab(1.03, 1.2, 34), colour: STONE_DARK },
    { geometry: slab(1.02, 3, 0), colour: '#2f3e46' },
    ...bands,
  ];
}
