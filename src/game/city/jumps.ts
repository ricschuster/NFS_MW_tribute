import { UNITS_PER_METRE } from '../constants';
import type { Jump, JumpKind } from './types';

const M = UNITS_PER_METRE;

/**
 * What each kind of jump is shaped like (#307), in metres: `w` across, `l`
 * along its heading from the back edge to the lip at +l/2, and `rise` how
 * high the lip stands over the ground.
 *
 * The launch angle is the slope *at the lip*, not the average slope, because
 * that is the direction the car is travelling when the ground runs out.
 *
 * - A **ramp** is built: a straight plank, 15 degrees all the way up.
 * - A **mound** is earth: it starts gently and is steepest at the top, 21
 *   degrees at the lip, which is what makes a heap of dirt a kicker rather
 *   than a hump - a mound that levelled off at its crest would roll the car
 *   over the top instead of throwing it.
 * - A **slab** is a lifted edge of broken apron: short, low and sharp, a hop
 *   rather than a flight.
 */
export const JUMP_SHAPES: Record<JumpKind, { w: number; l: number; rise: number }> = {
  ramp: { w: 8, l: 12, rise: 3.2 },
  mound: { w: 10, l: 12, rise: 3 },
  slab: { w: 4, l: 3, rise: 0.6 },
};

/** Height above the ground at fraction `t` (0 at the back, 1 at the lip), in metres. */
export function jumpProfile(kind: JumpKind, t: number): number {
  const { rise } = JUMP_SHAPES[kind];
  const k = Math.max(0, Math.min(1, t));
  return kind === 'mound' ? rise * (1 - Math.cos((k * Math.PI) / 2)) : rise * k;
}

/** The slope of the profile at the lip, as rise over run. */
export function lipSlope(kind: JumpKind): number {
  const { l, rise } = JUMP_SHAPES[kind];
  return kind === 'mound' ? (rise * Math.PI) / (2 * l) : rise / l;
}

/** Which jump is under a point, how far up it, and how high it stands there. */
export interface OnJump {
  jump: Jump;
  /** Along the jump from its centre, in metres: the lip is at +l/2. */
  v: number;
  /** Height of the jump's surface above the ground at this point, in world units. */
  height: number;
}

/**
 * The jump under (`x`, `z`), if any. Jumps are few - a handful per place -
 * so this is a straight scan rather than something indexed.
 */
export function jumpUnder(jumps: readonly Jump[], x: number, z: number): OnJump | null {
  for (const jump of jumps) {
    const { w, l } = JUMP_SHAPES[jump.kind];
    const dx = x - jump.at.x;
    const dz = z - jump.at.z;
    if (Math.abs(dx) > l * M && Math.abs(dz) > l * M) continue;
    const s = Math.sin(jump.angle);
    const c = Math.cos(jump.angle);
    const v = (dx * s + dz * c) / M;
    const u = (dx * c - dz * s) / M;
    if (Math.abs(u) > w / 2 || Math.abs(v) > l / 2) continue;
    return { jump, v, height: jumpProfile(jump.kind, (v + l / 2) / l) * M };
  }
  return null;
}
