import { PROP_SPACING, PROP_OFFSET } from './constants';

/** One piece of roadside scenery. */
export interface Prop {
  /** 0 tree, 1 billboard, 2 lamp post. */
  kind: number;
  /** Which verge it stands on: -1 left, 1 right. */
  side: number;
  /** Lateral position in offset units; past +-1, so always off the tarmac. */
  offset: number;
  /** Placement counter, used to vary how it is drawn. */
  slot: number;
}

/**
 * The prop standing on `segmentIndex`, or null where that segment carries none.
 *
 * Placement is a pure function of the segment index rather than a stored list,
 * so the simulation (which collides with props) and the renderer (which draws
 * them) agree without either one owning the data.
 */
export function propAt(segmentIndex: number): Prop | null {
  if (segmentIndex % PROP_SPACING !== 0) return null;
  const slot = Math.floor(segmentIndex / PROP_SPACING);
  const side = slot % 2 === 0 ? -1 : 1;
  return { kind: slot % 3, side, offset: side * PROP_OFFSET, slot };
}
