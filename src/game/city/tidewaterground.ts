import { UNITS_PER_METRE } from '../constants';
import { groundAt, type Terrain } from './terrain';
import type { Apron, AuthoredProp, GroundPropKind, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * Tidewater Park's ground props, in metres: across (`w`, which runs the
 * length of a path or a beach and which the editor lets you change), then
 * along the heading (`l`, a path's width or a beach's depth). The prop
 * editor holds the same table.
 */
export const TIDEWATER_GROUND_SIZES: Record<string, Record<string, [number, number]>> = {
  path: { path: [30, 5], promenade: [30, 12], trail: [30, 4] },
  plaza: { small: [30, 30], medium: [45, 35], large: [60, 45] },
  beach: { narrow: [40, 30], medium: [40, 45], wide: [40, 60] },
};
const LOOKS: Record<Exclude<GroundPropKind, 'lawn'>, Record<string, Apron['look']>> = {
  // A trail is Highmoor Park's (2026-10-03): gravel through the woods.
  path: { path: 'concrete', promenade: 'flags', trail: 'gravel' },
  plaza: { small: 'flags', medium: 'flags', large: 'flags' },
  beach: { narrow: 'sand', medium: 'sand', wide: 'sand' },
};
const FIRST: Record<Exclude<GroundPropKind, 'lawn'>, string> = { path: 'path', plaza: 'medium', beach: 'medium' };

const isGround = (p: AuthoredProp): p is AuthoredProp & { kind: 'path' | 'plaza' | 'beach' } =>
  p.kind === 'path' || p.kind === 'plaza' || p.kind === 'beach';

/** A ground prop's size, in metres: across, then along its heading. */
export function groundSize(p: AuthoredProp): [number, number] {
  if (!isGround(p)) return [0, 0];
  const sizes = TIDEWATER_GROUND_SIZES[p.kind];
  const [w, l] = sizes[p.variant ?? FIRST[p.kind]] ?? sizes[FIRST[p.kind]];
  return [p.w ?? w, l];
}

/**
 * A rectangle `w` across and `l` along a prop's heading, in world units, its
 * first edge running across: the order `scene/drives.ts` drapes a strip in.
 */
export function rectangle(p: AuthoredProp, w: number, l: number): Vec2[] {
  const along = { x: Math.sin(p.angle), z: Math.cos(p.angle) };
  const across = { x: along.z, z: -along.x };
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => ({
    x: (p.x + across.x * u * (w / 2) + along.x * v * (l / 2)) * M,
    z: (p.z + across.z * u * (w / 2) + along.z * v * (l / 2)) * M,
  }));
}

/**
 * Tidewater Park's paths, promenade, plaza and beach (the once-over,
 * 2026-10-02), as drives: four-cornered strips draped over the ground by
 * `scene/drives.ts`, the way Ashford Point's drives are, rather than aprons
 * in the ground's shader, which every fragment of the ground pays for once
 * per apron and a park's worth of path segments would be dozens of.
 *
 * What looks paved drives paved (`city/aprons.ts`): the paths, the promenade
 * and the plaza hold `APRON_SPEED_FRAC`; sand is drawn like paving and driven
 * like grass. A path is placed as straight pieces, overlapping at the joints,
 * so the editor moves a bend by moving one piece.
 */
export function tidewaterGround(props: readonly AuthoredProp[]): Apron[] {
  return props.filter(isGround).map((p) => {
    const [w, l] = groundSize(p);
    const look = LOOKS[p.kind][p.variant ?? FIRST[p.kind]] ?? LOOKS[p.kind][FIRST[p.kind]];
    return { outline: rectangle(p, w, l), margin: 0.5 * M, look, yard: false };
  });
}

/**
 * The flat pads under Tidewater Park's pitches, courts and playground, in
 * metres across and along their heading, a little bigger than what stands
 * on them. A set piece is drawn at one height, the ground under its middle,
 * and the park falls a couple of metres across a pitch: unlevelled, one
 * touchline would be buried and the other in the air.
 */
export const PAD_SIZES: Partial<Record<AuthoredProp['kind'], [number, number]>> = {
  'football-pitch': [80, 120],
  'tennis-court': [34, 62],
  playground: [34, 26],
};
/** How far out from a pad the ground grades back to what it was. */
const PAD_BANK = 12;

/** A pad's corners, in world units. */
export function padOutline(p: AuthoredProp): Vec2[] | null {
  const size = PAD_SIZES[p.kind];
  if (!size) return null;
  return rectangle(p, size[0], size[1]);
}

/**
 * Level the ground under every pad (`PAD_SIZES`), to the mean of the ground
 * it covers, and grade it back to the lawn over `PAD_BANK`. Run with the
 * ponds, before any road is laid, so everything after sees the pads; the
 * drafter keeps a pad clear of every road and pond, so this only ever moves
 * lawn.
 */
export function levelTidewaterPads(terrain: Terrain, props: readonly AuthoredProp[]): void {
  const { cells, cols, rows, cell, bounds } = terrain;
  for (const p of props) {
    const size = PAD_SIZES[p.kind];
    if (!size) continue;
    const along = { x: Math.sin(p.angle), z: Math.cos(p.angle) };
    const across = { x: along.z, z: -along.x };
    const halfW = (size[0] / 2) * M;
    const halfL = (size[1] / 2) * M;
    const at = { x: p.x * M, z: p.z * M };
    // How far outside the pad's rectangle a point is (0 inside it).
    const outside = (x: number, z: number) => {
      const dx = x - at.x, dz = z - at.z;
      const u = Math.abs(dx * across.x + dz * across.z) - halfW;
      const v = Math.abs(dx * along.x + dz * along.z) - halfL;
      return Math.hypot(Math.max(0, u), Math.max(0, v));
    };
    const reach = Math.hypot(halfW, halfL) + PAD_BANK * M;
    const minCol = Math.max(0, Math.floor((at.x - reach - bounds.minX) / cell));
    const maxCol = Math.min(cols - 1, Math.ceil((at.x + reach - bounds.minX) / cell));
    const minRow = Math.max(0, Math.floor((at.z - reach - bounds.minZ) / cell));
    const maxRow = Math.min(rows - 1, Math.ceil((at.z + reach - bounds.minZ) / cell));
    let sum = 0, n = 0;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (outside(bounds.minX + col * cell, bounds.minZ + row * cell) > 0) continue;
        sum += cells[row * cols + col];
        n++;
      }
    }
    const level = n > 0 ? sum / n : groundAt(terrain, at.x, at.z);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const d = outside(bounds.minX + col * cell, bounds.minZ + row * cell) / M;
        if (d >= PAD_BANK) continue;
        const k = row * cols + col;
        cells[k] = level + (cells[k] - level) * (d / PAD_BANK);
      }
    }
  }
}
