/**
 * The bodies of land.
 *
 * Which island a point is on is a question three separate things need and all
 * three used to guess at it. Its own module because the guesses were different
 * in each place and wrong in two of them.
 */
import { CITY_BODY_CELL } from '../constants';
import type { Rect, Vec2 } from './types';
import type { Water } from './water';

/**
 * The bodies of land, flood-filled at a coarse grid.
 *
 * Two things need this and both used to guess. A road to another body has to aim
 * at that body, and a lobe's *centre* is not one - the channel that severed the
 * lobe usually runs through its middle, so the centre is in the water and
 * snapping it to the nearest land puts the target back on the bank it started
 * from. And a **block** has to stay on its own superblock's body: a 560 m cell
 * on the coast reaches across a channel, the land on the far side is dry, and
 * blocks were laid on it - measured, 22 downtown blocks on the island the docks
 * are supposed to have to themselves, and midtown blocks on three bodies of land
 * that the plan gives no midtown at all.
 */
export interface LandBodies {
  /** Which body a point is on, or -1 for water and off the map. */
  at(x: number, z: number): number;
  /** Area, in world units squared, per body. */
  size: number[];
  /** The middle of each body, which may itself be in the water. */
  middle: Vec2[];
}

export function landBodies(bounds: Rect, water: Water): LandBodies {
  const step = CITY_BODY_CELL;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / step) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;
  const at = (i: number): Vec2 => ({
    x: bounds.minX + (i % cols) * step,
    z: bounds.minZ + Math.floor(i / cols) * step,
  });
  const dryCell = new Uint8Array(cols * rows);
  for (let i = 0; i < dryCell.length; i++) {
    const p = at(i);
    dryCell[i] = water.isWater(p.x, p.z) ? 0 : 1;
  }

  const body = new Int32Array(cols * rows).fill(-1);
  const size: number[] = [];
  const middle: Vec2[] = [];
  for (let start = 0; start < dryCell.length; start++) {
    if (!dryCell[start] || body[start] >= 0) continue;
    const id = size.length;
    const stack = [start];
    body[start] = id;
    let n = 0;
    let sx = 0;
    let sz = 0;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const p = at(i);
      n++;
      sx += p.x;
      sz += p.z;
      const c = i % cols;
      const r = Math.floor(i / cols);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (dryCell[j] && body[j] < 0) {
          body[j] = id;
          stack.push(j);
        }
      }
    }
    size.push(n * step * step);
    middle.push({ x: sx / n, z: sz / n });
  }

  return {
    at(x, z) {
      const c = Math.round((x - bounds.minX) / step);
      const r = Math.round((z - bounds.minZ) / step);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
      return body[r * cols + c];
    },
    size,
    middle,
  };
}
