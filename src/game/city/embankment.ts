import { EMBANKMENT_SETBACK, EMBANKMENT_STEP } from '../constants';
import { nearWater, type Water } from './water';
import type { Vec2 } from './types';

/**
 * The roads that follow the water (#241).
 *
 * Water is generated first and the street grid is cut against it (ADR-0005),
 * which left 106 of the network's 109 dead ends as streets that ran to the bank
 * and stopped - a median of four metres from the river. Railing those off was
 * the first attempt and it was wrong: a city does not have a hundred streets
 * ending at a barrier by the water, it has a road *along* the water that the
 * streets end onto.
 *
 * **It used to be three roads and three algorithms** - the coast walked as
 * `shoreAt(x)`, and each river bank found by stepping out from the middle of the
 * channel. All three assumed the bay was north and the river ran south, which
 * ADR-0008 ended: land is now lobes joined by channels and the water is on every
 * side of everything.
 *
 * What replaced them is one idea. `water.coast` is the shoreline as closed
 * loops, traced from the land field, and **every** waterside is on one of them -
 * the sea, the channels and the river alike, because the trace does not know
 * the difference. So the embankment is those loops offset inland by
 * `EMBANKMENT_SETBACK`, and the quay is what the offset leaves behind.
 *
 * Like the boulevards, the result goes into the generator as ordinary spans
 * *before* the graph is built, so it is clipped against the water, split at
 * every street it crosses, and repaired if it strands anything - by the same
 * code as everything else. That is why an embankment turns a stub into a
 * T-junction without anything here knowing what a junction is.
 */
export function embankmentRoutes(water: Water): Vec2[][] {
  const routes: Vec2[][] = [];
  for (const loop of water.coast) {
    for (const run of runsAlong(loop, water)) routes.push(run);
  }
  return routes;
}

/**
 * One coastline offset inland, as the stretches of it a road could actually
 * follow.
 *
 * A loop is walked at `EMBANKMENT_STEP` rather than at every traced point,
 * because the trace is at the water's resolution and a road is not. A run ends
 * where the offset point lands in water - which is what happens on the inside of
 * a tight bay, where the offsets from both sides meet and cross - and runs of a
 * couple of samples are dropped, since three points round a headland is not a
 * quayside.
 */
function runsAlong(loop: Vec2[], water: Water): Vec2[][] {
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  const end = () => {
    if (run.length > 3) runs.push(run);
    run = [];
  };

  let since = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const previous = loop[(i - 1 + loop.length) % loop.length];
    const next = loop[(i + 1) % loop.length];
    since += Math.hypot(loop[i].x - previous.x, loop[i].z - previous.z);
    if (since < EMBANKMENT_STEP) continue;
    since = 0;

    const at = inland(loop[i], previous, next, water);
    if (at === null) {
      end();
      continue;
    }
    run.push(at);
  }
  end();

  return runs;
}

/**
 * A point on the coast, moved inland by the setback.
 *
 * Which way is inland is decided by *asking*, not by working out the winding of
 * the loop. Both offsets are tried and the dry one wins. That is one line
 * instead of an argument about handedness, it cannot be wrong, and it is right
 * even where the trace's winding is not - a saddle cell in marching squares is
 * cut the same way every time whether or not that agrees with its neighbours.
 */
function inland(at: Vec2, previous: Vec2, next: Vec2, water: Water): Vec2 | null {
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const len = Math.hypot(dx, dz);
  if (len < 1) return null;

  for (const side of [1, -1]) {
    const p = {
      x: at.x - (side * dz * EMBANKMENT_SETBACK) / len,
      z: at.z + (side * dx * EMBANKMENT_SETBACK) / len,
    };
    // Dry, and not about to be: a carriageway laid right on the line would be
    // in the water the first time the coast wanders.
    if (!nearWater(water, p.x, p.z, EMBANKMENT_SETBACK * 0.35)) return p;
  }
  return null;
}
