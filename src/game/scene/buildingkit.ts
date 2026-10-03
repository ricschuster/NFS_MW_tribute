import * as THREE from 'three';
import type { Part } from './downtownmodels';

/**
 * The building kit (#583, `?look=buildings`): detail added to a building's
 * parts, in metres, before the model is grown to game size.
 *
 * The models are boxes with painted-on windows, so a wall is a flat face with
 * dark rectangles. A real facade has depth: sills and lintels that catch the
 * light, mullions across a curtain wall, pilasters dividing the ground floor,
 * a cornice and parapet at the top, a canopy over a door, plant on the roof.
 * Each is a small box, derived here from what the model already says (where
 * its windows and doors are, how big its body is) so no model needs editing
 * and the kit is one switch away from off.
 *
 * Nothing sticks out of a wall by more than half a metre below the cornice:
 * the sim collides with the footprint, and a car that touches the wall should
 * not be seen sinking into a pilaster.
 *
 * Pure geometry, no textures, so it can be tested without a canvas.
 */

const WINDOW = '#3a4a52';
const DOORS = new Set(['#3d3a36', '#5a3e2e', '#3d3a36']);
const BAY_DOORS = '#2e3538';
const SHOPFRONT = '#2f3e46';

export const KIT_TRIM = '#dcd6c6';
const TRIM_DARK = '#8f8878';
const MULLION = '#1f2a31';
const PLANT = '#8c9195';
const CANOPY = '#2b2f31';
const SAFETY = '#d9b21f';
const PALE_STONE = '#b9b2a4';
const PLINTH = '#8a857a';
const SHUTTER = '#3f5a4a';
const CHIMNEY = '#7a4c3a';
const TANK_BAND = '#7f8888';

/** The kinds the kit dresses, and what each gets. */
export type KitStyle = 'street' | 'curtain' | 'shed' | 'house' | 'tank';
export const KIT_KINDS = {
  townhouse: 'street',
  loft: 'street',
  midrise: 'street',
  shop: 'street',
  flat: 'street',
  apartment: 'street',
  tower: 'curtain',
  warehouse: 'shed',
  house: 'house',
  villa: 'house',
  manor: 'house',
  silo: 'tank',
} as const satisfies Record<string, KitStyle>;

type Box = { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number };

function boxOf(geometry: THREE.BufferGeometry): Box {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  return {
    cx: (b.min.x + b.max.x) / 2,
    cy: (b.min.y + b.max.y) / 2,
    cz: (b.min.z + b.max.z) / 2,
    sx: b.max.x - b.min.x,
    sy: b.max.y - b.min.y,
    sz: b.max.z - b.min.z,
  };
}

const slab = (colour: string, sx: number, sy: number, sz: number, x: number, y: number, z: number): Part => ({
  geometry: new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z),
  colour,
});

/** A small deterministic 0..1 from a seed and a salt, so plant sits the same every run. */
const hash = (seed: number, salt: number) => {
  const s = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** A window's sill and lintel, on whichever face it is painted on. */
function dress(window: Box): Part[] {
  const onZ = window.sz < window.sx && window.sz < 0.4;
  const side = onZ ? Math.sign(window.cz) : Math.sign(window.cx);
  const out = 0.14 * side;
  const bottom = window.cy - window.sy / 2;
  const top = window.cy + window.sy / 2;
  const span = onZ ? window.sx : window.sz;
  const x = (u: number, o: number) => (onZ ? [window.cx + u, window.cz + o] : [window.cx + o, window.cz + u]);
  const place = (sy: number, wide: number, depth: number, y: number, o: number): Part => {
    const [px, pz] = x(0, o);
    return onZ ? slab(KIT_TRIM, span + wide, sy, depth, px, y, pz) : slab(KIT_TRIM, depth, sy, span + wide, px, y, pz);
  };
  return [
    place(0.16, 0.5, 0.34, bottom - 0.08, out + 0.1 * side),
    place(0.14, 0.3, 0.26, top + 0.07, out + 0.06 * side),
  ];
}

/** Everything the street kinds share: cornice, parapet, ground-floor piers, canopies, plant. */
function street(parts: Part[], seed: number): Part[] {
  const body = boxOf(parts[0].geometry);
  const w = body.sx;
  const l = body.sz;
  const top = body.cy + body.sy / 2;
  const added: Part[] = [];

  // Cornice: a deep band and an overhanging cap, the line a building is read by from the road.
  added.push(slab(KIT_TRIM, w + 0.5, 0.35, l + 0.5, 0, top - 0.35, 0));
  added.push(slab(KIT_TRIM, w + 0.9, 0.3, l + 0.9, 0, top - 0.05, 0));
  // A parapet above it, four thin walls, so a flat roof has an edge.
  const rim = 0.7;
  added.push(slab(TRIM_DARK, w + 0.2, rim, 0.25, 0, top + 0.1 + rim / 2, l / 2 - 0.1));
  added.push(slab(TRIM_DARK, w + 0.2, rim, 0.25, 0, top + 0.1 + rim / 2, -l / 2 + 0.1));
  added.push(slab(TRIM_DARK, 0.25, rim, l - 0.2, w / 2 - 0.1, top + 0.1 + rim / 2, 0));
  added.push(slab(TRIM_DARK, 0.25, rim, l - 0.2, -w / 2 + 0.1, top + 0.1 + rim / 2, 0));

  // Plant on the roof: one to three units and sometimes a stair head.
  const units = 1 + Math.floor(hash(seed, 1) * 3);
  for (let i = 0; i < units; i++) {
    const ux = (hash(seed, 2 + i) - 0.5) * (w - 4);
    // The models put their own tanks and plant at the back (-z), so the kit keeps to the front.
    const uz = hash(seed, 7 + i) * (l / 2 - 2);
    added.push(slab(PLANT, 1.6 + hash(seed, 11 + i) * 1.2, 1, 1.4, ux, top + 0.6 + 0.2, uz));
  }
  if (hash(seed, 20) > 0.5 && w > 10) added.push(slab(TRIM_DARK, 2.6, 2.4, 2.6, -w * 0.3, top + 1.3, l * 0.25));

  // Ground-floor piers along the front, and a canopy over each door.
  const groundTop = 3.4;
  const bays = Math.max(1, Math.round(w / 4));
  for (let i = 0; i <= bays; i++) {
    added.push(slab(TRIM_DARK, 0.5, groundTop, 0.3, -w / 2 + (w * i) / bays, groundTop / 2, l / 2 + 0.1));
  }
  for (const part of parts) {
    if (!DOORS.has(part.colour)) continue;
    const door = boxOf(part.geometry);
    if (door.cz < 0) continue;
    added.push(slab(CANOPY, door.sx + 1.2, 0.18, 1.3, door.cx, door.cy + door.sy / 2 + 0.35, door.cz + 0.6));
  }

  // Shopfronts: a stall riser under the glass, a transom bar over it, and
  // mullions between the panes, on the street face only.
  for (const part of parts) {
    if (part.colour !== SHOPFRONT) continue;
    const glass = boxOf(part.geometry);
    const face = glass.cz + glass.sz / 2;
    if (face < 0) continue;
    const bottom = glass.cy - glass.sy / 2;
    const topGlass = glass.cy + glass.sy / 2;
    added.push(slab(TRIM_DARK, glass.sx, 0.55, 0.2, glass.cx, bottom + 0.275, face + 0.06));
    added.push(slab(TRIM_DARK, glass.sx, 0.18, 0.2, glass.cx, topGlass - 0.5, face + 0.06));
    const pane = glass.sx > 12 ? 3 : 1.6;
    for (let u = -glass.sx / 2 + pane; u < glass.sx / 2 - 0.5; u += pane) {
      added.push(slab(MULLION, 0.12, glass.sy, 0.18, glass.cx + u, glass.cy, face + 0.05));
    }
  }

  // Windows: sills and lintels. A ribbon (wider than it is tall by far) gets mullions instead.
  for (const part of parts) {
    if (part.colour !== WINDOW) continue;
    const win = boxOf(part.geometry);
    const ribbon = win.sx > 6 && win.sy < 2.2;
    if (ribbon) {
      for (let u = -win.sx / 2 + 2.5; u < win.sx / 2 - 1; u += 2.5) {
        added.push(slab(MULLION, 0.2, win.sy, win.sz + 0.1, win.cx + u, win.cy, win.cz));
      }
      for (let u = -win.sz / 2 + 2.5; u < win.sz / 2 - 1; u += 2.5) {
        added.push(slab(MULLION, win.sx + 0.1, win.sy, 0.2, win.cx, win.cy, win.cz + u));
      }
    } else if (win.sy < 4) {
      added.push(...dress(win));
    }
  }
  return added;
}

/** A glass tower: a mullion grid down every face and a heavier podium cap. */
function curtain(parts: Part[], seed: number): Part[] {
  const body = boxOf(parts[0].geometry);
  const added: Part[] = [];
  // A glass body gets a mullion grid.
  if (parts[0].colour === '#3f6074' || parts[0].colour === '#7d9fb2') {
    const height = body.sy;
    const step = 3;
    for (let u = -body.sx / 2 + step; u < body.sx / 2 - 0.5; u += step) {
      added.push(slab(MULLION, 0.25, height - 6, 0.5, u, 6 + (height - 6) / 2, body.sz / 2 + 0.05));
      added.push(slab(MULLION, 0.25, height - 6, 0.5, u, 6 + (height - 6) / 2, -body.sz / 2 - 0.05));
      added.push(slab(MULLION, 0.5, height - 6, 0.25, body.sx / 2 + 0.05, 6 + (height - 6) / 2, u));
      added.push(slab(MULLION, 0.5, height - 6, 0.25, -body.sx / 2 - 0.05, 6 + (height - 6) / 2, u));
    }
  }
  else {
    // Stone and deco carry their own strips of window; what they lack is
    // floors. A trim band every twelve metres gives the shaft a rhythm.
    for (let y = 12; y < body.sy - 3; y += 12) {
      added.push(slab(KIT_TRIM, body.sx + 0.7, 0.6, body.sz + 0.7, 0, y, 0));
    }
  }
  // An entrance canopy on the front, five metres up: over the car, not in its way.
  added.push(slab(CANOPY, body.sx * 0.4, 0.4, 3.2, 0, 5, body.sz / 2 + 1.6));
  const top = body.cy + body.sy / 2;
  added.push(...podium(body));
  added.push(slab(PLANT, 3 + hash(seed, 3), 1.4, 2.2, (hash(seed, 4) - 0.5) * 12, top + 0.7, (hash(seed, 5) - 0.5) * 12));
  return added;
}

/**
 * A podium under a tower: a stone skin two floors high, dark glazing in
 * bays between piers on each face, and a cap. It stays within half a metre
 * of the wall, because the sim collides with the tower's footprint.
 */
function podium(body: Box): Part[] {
  const height = 6;
  const added: Part[] = [];
  const hx = body.sx / 2;
  const hz = body.sz / 2;
  added.push(slab(PALE_STONE, body.sx + 0.4, height, body.sz + 0.4, 0, height / 2, 0));
  added.push(slab(KIT_TRIM, body.sx + 1, 0.5, body.sz + 1, 0, height, 0));
  // Glazing strips, one per face, proud of the skin; piers every four metres.
  const glass = (across: number, onZ: boolean, side: number) => {
    const pos = (u: number, o: number) => (onZ ? [u, o * side] : [o * side, u]);
    const [gx, gz] = pos(0, (onZ ? hz : hx) + 0.3);
    added.push(onZ ? slab(SHOPFRONT, across - 1.5, 3, 0.2, gx, 2.6, gz) : slab(SHOPFRONT, 0.2, 3, across - 1.5, gx, 2.6, gz));
    const step = 4;
    for (let u = -across / 2 + 1; u <= across / 2 - 0.9; u += step) {
      const [px, pz] = pos(u, (onZ ? hz : hx) + 0.3);
      added.push(onZ ? slab(MULLION, 0.35, height - 1, 0.25, px, (height - 1) / 2 + 0.5, pz) : slab(MULLION, 0.25, height - 1, 0.35, px, (height - 1) / 2 + 0.5, pz));
    }
  };
  for (const side of [-1, 1]) {
    glass(body.sx, true, side);
    glass(body.sz, false, side);
  }
  return added;
}

/**
 * A house, villa or manor: a plinth, sills and lintels, shutters either side
 * of the windows, a step and surround at the door, a cap on each chimney, and
 * on a manor, quoins at the corners of the main block. All within a quarter
 * of a metre of the wall, in metres before the house is grown.
 */
function house(parts: Part[], kind: 'house' | 'villa' | 'manor'): Part[] {
  const body = boxOf(parts[0].geometry);
  const added: Part[] = [];
  const front = body.cz + body.sz / 2;
  added.push(slab(PLINTH, body.sx + 0.3, 0.5, body.sz + 0.3, body.cx, 0.25, body.cz));
  for (const part of parts) {
    if (part.colour === WINDOW) {
      const win = boxOf(part.geometry);
      if (win.sy >= 4) continue;
      added.push(...dress(win));
      if (kind !== 'manor' && win.sz < 0.4 && win.cz > 0) {
        for (const side of [-1, 1]) {
          added.push(slab(SHUTTER, 0.5, win.sy, 0.1, win.cx + side * (win.sx / 2 + 0.3), win.cy, win.cz + 0.1));
        }
      }
    } else if (DOORS.has(part.colour) || part.colour === '#4a3426') {
      const door = boxOf(part.geometry);
      if (door.cz < 0) continue;
      added.push(slab(KIT_TRIM, door.sx + 0.5, door.sy + 0.3, 0.1, door.cx, door.cy + 0.15, door.cz + 0.03));
      added.push(slab(TRIM_DARK, door.sx + 0.8, 0.2, 0.8, door.cx, 0.1, door.cz + 0.4));
    } else if (part.colour === CHIMNEY) {
      const stack = boxOf(part.geometry);
      added.push(slab(TRIM_DARK, stack.sx + 0.3, 0.2, stack.sz + 0.3, stack.cx, stack.cy + stack.sy / 2 + 0.1, stack.cz));
    }
  }
  if (kind === 'manor') {
    const top = body.cy + body.sy / 2;
    for (const x of [-1, 1]) {
      for (let y = 0.6; y < top - 0.5; y += 1.2) {
        const long = Math.floor(y / 1.2) % 2 === 0;
        added.push(slab(KIT_TRIM, long ? 1.2 : 0.8, 0.6, 0.15, x * (body.sx / 2 - 0.5), y, front + 0.05));
      }
    }
  }
  return added;
}

/** A grain silo: seam rings every three metres, a ladder, a rail round the top and a roof hatch. */
function tank(parts: Part[]): Part[] {
  const wall = boxOf(parts[0].geometry);
  const r = wall.sx / 2;
  const top = wall.cy + wall.sy / 2;
  const added: Part[] = [];
  for (let y = 3; y < top - 0.5; y += 3) {
    added.push({ geometry: new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.25, 18).translate(0, y, 0), colour: TANK_BAND });
  }
  added.push({ geometry: new THREE.CylinderGeometry(r + 0.2, r + 0.2, 0.2, 18).translate(0, top - 0.2, 0), colour: CANOPY });
  added.push(slab(MULLION, 0.5, top - 0.5, 0.12, 0, (top - 0.5) / 2, r + 0.1));
  for (const x of [-0.25, 0.25]) added.push(slab(TANK_BAND, 0.05, top - 0.5, 0.08, x, (top - 0.5) / 2, r + 0.18));
  added.push(slab(TANK_BAND, 1.2, 0.5, 1.2, 0, top + 2.4, 0));
  return added;
}

/** A shed: ribs down the long walls, a canopy over each bay door, a hazard-yellow bollard either side. */
function shed(parts: Part[]): Part[] {
  const body = boxOf(parts[0].geometry);
  const added: Part[] = [];
  const top = body.cy + body.sy / 2;
  for (let z = -body.sz / 2 + 6; z < body.sz / 2 - 2; z += 6) {
    added.push(slab('#7f888d', 0.3, body.sy - 0.4, 0.4, body.sx / 2 + 0.05, body.cy, z));
    added.push(slab('#7f888d', 0.3, body.sy - 0.4, 0.4, -body.sx / 2 - 0.05, body.cy, z));
  }
  added.push(slab('#7f888d', body.sx + 0.2, 0.5, 0.3, 0, top - 0.8, body.sz / 2 + 0.05));
  for (const part of parts) {
    if (part.colour !== BAY_DOORS) continue;
    const door = boxOf(part.geometry);
    added.push(slab(CANOPY, 1.2, 0.2, door.sz + 1.4, door.cx + 0.6, door.cy + door.sy / 2 + 0.5, door.cz));
    for (const dz of [-1, 1]) {
      added.push({ geometry: new THREE.CylinderGeometry(0.18, 0.18, 1.1, 8).translate(door.cx + 1.3, 0.55, door.cz + dz * (door.sz / 2 + 0.5)), colour: SAFETY });
    }
  }
  return added;
}

/**
 * The kit's additions for one model. Returns the new parts only; the caller
 * puts them after the originals. `seed` varies the roof plant, and is the
 * same for every instance of a model, which is what merging by colour needs.
 */
export function kitFor(kind: keyof typeof KIT_KINDS, variant: string | undefined, parts: Part[]): Part[] {
  let seed = 1;
  for (const ch of `${kind}:${variant ?? ''}`) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  switch (KIT_KINDS[kind]) {
    case 'street':
      return street(parts, seed);
    case 'curtain':
      return curtain(parts, seed);
    case 'shed':
      return shed(parts);
    case 'house':
      return house(parts, kind as 'house' | 'villa' | 'manor');
    case 'tank':
      return tank(parts);
  }
}
