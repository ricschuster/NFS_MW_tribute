import { UNITS_PER_METRE } from '../constants';
import { PLAN_DISTRICTS } from './plan';
import type { Apron, AuthoredProp, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * A lawn's size by its variant, in metres: across, then along its heading.
 * The prop editor holds the same table, and a width set there wins.
 */
export const LAWN_SIZES: Record<string, [number, number]> = { small: [30, 30], medium: [45, 45], large: [70, 50] };

/**
 * Downtown's ground (the once-over, 2026-10-02): paved from edge to edge, and
 * grass only where a lawn is placed. The owner's call. Downtown's pavements
 * (#268) stopped at the building line, so everything behind it - the gaps
 * between towers, the squares, the corners the drafter left open - was lawn,
 * and a city centre with grass to every back wall read as a business park.
 *
 * One apron over the whole district, then one per lawn on top of it, which
 * takes the paving back off (`look: 'grass'`, painted after the paving and
 * read first by `onApron`). Paving the district rather than each gap is what
 * makes it affordable: the ground's shader pays per apron a fragment is near,
 * and every gap downtown would be hundreds of them.
 *
 * What looks paved drives paved (`city/aprons.ts`), so downtown's open ground
 * keeps a car to `APRON_SPEED_FRAC` of its top speed, not the quarter grass
 * allows, and the police follow at the same fraction. That is a change to how
 * downtown drives, made knowingly: a real city centre's lots are tarmac, and
 * the buildings still stand in the way.
 */
export function downtownAprons(props: readonly AuthoredProp[]): Apron[] {
  const district = PLAN_DISTRICTS.find((a) => a.kind === 'downtown');
  if (!district) return [];
  const paving: Apron = { outline: district.poly, margin: 3 * M, look: 'flags', yard: false };
  const lawns = props.filter((p) => p.kind === 'lawn').map((p): Apron => ({ outline: lawnOutline(p), margin: 1.5 * M, look: 'grass', yard: false }));
  return [paving, ...lawns];
}

/** A lawn's rectangle, in world units, turned to its heading. */
export function lawnOutline(p: AuthoredProp): Vec2[] {
  const [w0, l] = LAWN_SIZES[p.variant ?? 'medium'] ?? LAWN_SIZES.medium;
  const w = p.w ?? w0;
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
