import { NITRO_COUNTER_HOLD } from './constants';
import type { Vec2 } from './city/types';

/**
 * What refills the nitrous besides waiting (#351).
 *
 * The reference game runs a counter for each of these next to the
 * speedometer and fills the bar from them, which turns the boost from a timer
 * into a reward: the way to have more of it is to drive the way the game wants
 * you to. Crosstown's is passive only until this, at a rate that made the
 * risky line and the safe one cost the same.
 *
 * Drifting is the reference's fifth source and is not here, because it is not
 * a thing this car does: velocity always resolves along the heading (#82), so
 * there is no slip angle to be sustaining. It needs a slip model first.
 */
export type NitroSource = 'nearMiss' | 'oncoming' | 'air' | 'slipstream';

export const NITRO_LABELS: Record<NitroSource, string> = {
  nearMiss: 'NEAR MISS',
  oncoming: 'ONCOMING',
  air: 'AIR',
  slipstream: 'SLIPSTREAM',
};

/** A counter the HUD shows: how much of this has been done in the current run of it. */
export interface NitroCounter {
  source: NitroSource;
  /** A count for near misses, seconds for the rest. */
  value: number;
  /** Seconds since it last went up; the counter clears at `NITRO_COUNTER_HOLD`. */
  idle: number;
}

/**
 * The running counters, one per source, each cleared once that source has
 * been quiet for a moment - so "ONCOMING 3.4" is one stretch on the wrong side
 * of the road, not the session's total.
 */
export class NitroCounters {
  readonly active: NitroCounter[] = [];

  add(source: NitroSource, value: number): void {
    const counter = this.active.find((c) => c.source === source);
    if (counter) {
      counter.value += value;
      counter.idle = 0;
    } else {
      this.active.push({ source, value, idle: 0 });
    }
  }

  step(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.active[i].idle += dt;
      if (this.active[i].idle > NITRO_COUNTER_HOLD) this.active.splice(i, 1);
    }
  }
}

/**
 * How far to the *left* of the centreline a car is, relative to the way it is
 * going: positive on the wrong side of a road whose traffic keeps right.
 *
 * Measured against the direction of travel rather than the road's own a-to-b,
 * because a road has no direction: the same side is right going one way and
 * wrong going the other. Right is `(-z, x)` of the travel direction, which is
 * the sim's convention - facing +z, your right hand points at -x.
 */
export function leftOfCentre(a: Vec2, b: Vec2, at: Vec2, heading: number): number {
  const length = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
  const dx = (b.x - a.x) / length;
  const dz = (b.z - a.z) / length;
  const along = Math.sin(heading) * dx + Math.cos(heading) * dz >= 0 ? 1 : -1;
  const tx = dx * along;
  const tz = dz * along;
  const right = (at.x - a.x) * -tz + (at.z - a.z) * tx;
  return -right;
}
