import { UNITS_PER_METRE } from '../constants';
import { MARROW_PROPS } from './marrowprops';
import { groundAt } from './terrain';
import type { Terrain } from './terrain';
import type { AuthoredProp, Breakable, Jump, JumpKind, SetPiece, SetPieceKind } from './types';

const M = UNITS_PER_METRE;

/**
 * What a set piece is solid as, in metres in its own frame: `u` across,
 * `v` along its heading, and `y0`..`y1` from the ground it stands on. A box
 * `w` by `l`, or a post of radius `r`.
 *
 * Deliberately less than what is drawn, and never more. A cargo plane is its
 * fuselage and, four and a half metres up, its wing: high enough to drive
 * under, low enough to catch a jump that came up short (#307). A hanging
 * fuselage is its posts and, overhead, its hull; a tree is its trunk and the
 * middle of its crown. What a car can hit should be what it looks like it
 * would hit.
 */
type Solid = { u: number; v: number; y0: number; y1: number } & ({ w: number; l: number } | { r: number });

const post = (u: number, v: number, r: number, y1: number): Solid => ({ u, v, r, y0: 0, y1 });

export const SET_PIECE_SOLIDS: Record<SetPieceKind, Solid[]> = {
  'plane-belly': [
    { u: 0, v: 0, w: 4.4, l: 30, y0: 0, y1: 4.4 },
    { u: 0, v: 2, w: 32, l: 4, y0: 4.45, y1: 4.95 },
    { u: 0, v: -15.5, w: 0.4, l: 3.6, y0: 3.5, y1: 9 },
  ],
  'plane-nose': [{ u: 0, v: 3, w: 4, l: 10, y0: 0, y1: 7 }],
  fuselage: [{ u: 0, v: 0, w: 4, l: 18, y0: 0, y1: 3.8 }],
  'fuselage-hung': [
    post(-3.5, -7.3, 0.4, 8.5),
    post(3.5, -7.3, 0.4, 8.5),
    post(-3.5, 7.3, 0.4, 8.5),
    post(3.5, 7.3, 0.4, 8.5),
    { u: 0, v: 0, w: 4, l: 22, y0: 3.8, y1: 7.8 },
  ],
  helicopter: [{ u: 0, v: 1.5, w: 2.6, l: 6, y0: 0, y1: 3 }],
  silo: [post(0, 0, 4, 18.6)],
  'water-tower': [
    post(-3.5, -3.5, 0.4, 14.5),
    post(3.5, -3.5, 0.4, 14.5),
    post(-3.5, 3.5, 0.4, 14.5),
    post(3.5, 3.5, 0.4, 14.5),
    { u: 0, v: 0, r: 4.3, y0: 14.45, y1: 22 },
  ],
  crane: [
    { u: 0, v: 0, w: 6, l: 6, y0: 0, y1: 1 },
    { u: 0, v: 0, w: 1.6, l: 1.6, y0: 0, y1: 25.6 },
    { u: 0, v: 12, w: 1.2, l: 30, y0: 24.4, y1: 25.6 },
  ],
  mast: [
    { u: 0, v: 0, w: 4, l: 4, y0: 0, y1: 1 },
    { u: 0, v: 0, w: 1.6, l: 1.6, y0: 0, y1: 31 },
  ],
  bunker: [{ u: 0, v: 0, w: 12, l: 8, y0: 0, y1: 3.6 }],
  'blast-wall': [{ u: 0, v: 0, w: 6, l: 2.4, y0: 0, y1: 3.9 }],
  shed: [{ u: 0, v: 0, w: 9, l: 14, y0: 0, y1: 7.4 }],
  cone: [],
  tree: [post(0, 0, 0.6, 3), { u: 0, v: 0, r: 2, y0: 3, y1: 11.6 }],
};

/** The editor's names for the kinds of jump. */
const JUMP_VARIANTS: Record<string, JumpKind> = {
  'built ramp': 'ramp',
  'grass mound': 'mound',
  'lifted slab': 'slab',
};

/** How far a set piece's solid parts can reach from its centre, in metres. */
const SOLID_REACH = 28;

/**
 * Marrow Field's hand-placed props (#295), as city data.
 *
 * Gates and stacks join the breakables that already exist, numbered on from
 * `firstId` so a smashed one is remembered by the same id the sim uses for
 * every other. Jumps become `Jump`s (#307), their kind read off the variant
 * the editor saved. The rest are set pieces, sat on the ground where they
 * were placed.
 */
export function airfieldProps(
  terrain: Terrain,
  firstId: number,
  props: readonly AuthoredProp[] = MARROW_PROPS,
): { pieces: SetPiece[]; breakables: Breakable[]; jumps: Jump[] } {
  const pieces: SetPiece[] = [];
  const jumps: Jump[] = [];
  const breakables: Breakable[] = [];
  let id = firstId;
  for (const prop of props) {
    const at = { x: prop.x * M, z: prop.z * M };
    const y = groundAt(terrain, at.x, at.z);
    if (prop.kind === 'jump') {
      jumps.push({ kind: JUMP_VARIANTS[prop.variant ?? ''] ?? 'ramp', at, y, angle: prop.angle });
      continue;
    }
    if (prop.kind === 'gate' || prop.kind === 'stack') {
      // The same half-widths `breakablesFor` gives its own, except that a gate
      // placed in the editor was sized to the road it was snapped across.
      const half = prop.kind === 'gate' ? ((prop.w ?? 12) / 2) * M : 2.2 * M;
      breakables.push({ id: id++, kind: prop.kind, at, y, angle: prop.angle, half, placed: true });
      continue;
    }
    pieces.push({ kind: prop.kind, at, y, angle: prop.angle });
  }
  return { pieces, breakables, jumps };
}

/**
 * Does a car of `radius` and `height`, standing at (`x`, `z`) with its wheels
 * at `y`, touch a set piece's solid parts? Only where the two overlap in
 * height as well as on the map, so a car can pass under a wing on the ground
 * and over a fuselage in the air.
 */
export function hitsSetPiece(
  pieces: readonly SetPiece[],
  x: number,
  z: number,
  y: number,
  radius: number,
  height: number,
): boolean {
  const reach = SOLID_REACH * M + radius;
  for (const piece of pieces) {
    const dx = x - piece.at.x;
    const dz = z - piece.at.z;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const s = Math.sin(piece.angle);
    const c = Math.cos(piece.angle);
    // Into the piece's own frame: `v` along its heading, `u` across it, in
    // metres - the same frame the editor draws and `SET_PIECE_SOLIDS` uses.
    const v = (dx * s + dz * c) / M;
    const u = (dx * c - dz * s) / M;
    const r = radius / M;
    const bottom = (y - piece.y) / M;
    const top = bottom + height / M;
    for (const solid of SET_PIECE_SOLIDS[piece.kind]) {
      if (top < solid.y0 || bottom > solid.y1) continue;
      if ('r' in solid) {
        if (Math.hypot(u - solid.u, v - solid.v) < solid.r + r) return true;
        continue;
      }
      const nu = Math.max(solid.u - solid.w / 2, Math.min(u, solid.u + solid.w / 2));
      const nv = Math.max(solid.v - solid.l / 2, Math.min(v, solid.v + solid.l / 2));
      if (Math.hypot(u - nu, v - nv) < r) return true;
    }
  }
  return false;
}
