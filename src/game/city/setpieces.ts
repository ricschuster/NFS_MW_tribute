import { UNITS_PER_METRE } from '../constants';
import { MARROW_PROPS } from './marrowprops';
import { groundAt } from './terrain';
import type { Terrain } from './terrain';
import type { AuthoredProp, Breakable, SetPiece, SetPieceKind } from './types';

const M = UNITS_PER_METRE;

/**
 * What a set piece is solid as, in metres in its own frame: `u` across,
 * `v` along its heading. A box `w` by `l`, or a post of radius `r`.
 *
 * Deliberately less than what is drawn. A cargo plane on its belly is solid
 * down its fuselage and nowhere else, because its wing is high enough to
 * drive under and doing that is the reason to put one in a field; a hanging
 * fuselage is its posts; a tree is its trunk. What a car can hit should be
 * what it looks like it would hit, and a wing tip four metres up is not that.
 */
type Solid = { u: number; v: number; w: number; l: number } | { u: number; v: number; r: number };

export const SET_PIECE_SOLIDS: Record<SetPieceKind, Solid[]> = {
  'plane-belly': [{ u: 0, v: 0, w: 4.4, l: 30 }],
  'plane-nose': [{ u: 0, v: 3, w: 4, l: 10 }],
  fuselage: [{ u: 0, v: 0, w: 4, l: 18 }],
  'fuselage-hung': [
    { u: -3.5, v: -7.3, r: 0.4 },
    { u: 3.5, v: -7.3, r: 0.4 },
    { u: -3.5, v: 7.3, r: 0.4 },
    { u: 3.5, v: 7.3, r: 0.4 },
  ],
  helicopter: [{ u: 0, v: 1.5, w: 2.6, l: 6 }],
  silo: [{ u: 0, v: 0, r: 4 }],
  'water-tower': [
    { u: -3.5, v: -3.5, r: 0.4 },
    { u: 3.5, v: -3.5, r: 0.4 },
    { u: -3.5, v: 3.5, r: 0.4 },
    { u: 3.5, v: 3.5, r: 0.4 },
  ],
  crane: [{ u: 0, v: 0, w: 6, l: 6 }],
  mast: [{ u: 0, v: 0, w: 4, l: 4 }],
  bunker: [{ u: 0, v: 0, w: 12, l: 8 }],
  'blast-wall': [{ u: 0, v: 0, w: 6, l: 2.4 }],
  shed: [{ u: 0, v: 0, w: 9, l: 14 }],
  cone: [],
  tree: [{ u: 0, v: 0, r: 0.6 }],
};

/** How far a set piece's solid parts can reach from its centre, in metres. */
const SOLID_REACH = 18;

/**
 * Marrow Field's hand-placed props (#295), as city data.
 *
 * Gates and stacks join the breakables that already exist, numbered on from
 * `firstId` so a smashed one is remembered by the same id the sim uses for
 * every other. Jumps are left out until #307 gives the car something to do at
 * the top of one: a jump the car cannot leave is a lump in the road. The rest
 * are set pieces, sat on the ground where they were placed.
 */
export function airfieldProps(
  terrain: Terrain,
  firstId: number,
  props: readonly AuthoredProp[] = MARROW_PROPS,
): { pieces: SetPiece[]; breakables: Breakable[] } {
  const pieces: SetPiece[] = [];
  const breakables: Breakable[] = [];
  let id = firstId;
  for (const prop of props) {
    const at = { x: prop.x * M, z: prop.z * M };
    const y = groundAt(terrain, at.x, at.z);
    if (prop.kind === 'jump') continue;
    if (prop.kind === 'gate' || prop.kind === 'stack') {
      // The same half-widths `breakablesFor` gives its own, except that a gate
      // placed in the editor was sized to the road it was snapped across.
      const half = prop.kind === 'gate' ? ((prop.w ?? 12) / 2) * M : 2.2 * M;
      breakables.push({ id: id++, kind: prop.kind, at, y, angle: prop.angle, half, placed: true });
      continue;
    }
    pieces.push({ kind: prop.kind, at, y, angle: prop.angle });
  }
  return { pieces, breakables };
}

/**
 * Does a car of `radius` at (`x`, `z`), at height `y`, touch a set piece's
 * solid parts? Everything here stands on the ground, so something more than
 * a car's height above it - a deck, a bridge - passes over.
 */
export function hitsSetPiece(pieces: readonly SetPiece[], x: number, z: number, y: number, radius: number): boolean {
  const reach = SOLID_REACH * M + radius;
  for (const piece of pieces) {
    const dx = x - piece.at.x;
    const dz = z - piece.at.z;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    if (Math.abs(y - piece.y) > radius * 3) continue;
    const s = Math.sin(piece.angle);
    const c = Math.cos(piece.angle);
    // Into the piece's own frame: `v` along its heading, `u` across it, in
    // metres - the same frame the editor draws and `SET_PIECE_SOLIDS` uses.
    const v = (dx * s + dz * c) / M;
    const u = (dx * c - dz * s) / M;
    const r = radius / M;
    for (const solid of SET_PIECE_SOLIDS[piece.kind]) {
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
