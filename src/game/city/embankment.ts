import { EMBANKMENT_SETBACK, EMBANKMENT_STEP } from '../constants';
import { nearWater, type Water } from './water';
import type { Rect, Vec2 } from './types';

/**
 * The roads that follow the water (#241).
 *
 * Water is generated first and the street grid is cut against it (ADR-0005),
 * which left 106 of the network's 109 dead ends as streets that ran to the
 * bank and stopped - a median of four metres from the river. Railing those off
 * was the first attempt and it was wrong: a city does not have a hundred
 * streets ending at a barrier by the water, it has a road *along* the water
 * that the streets end onto.
 *
 * So this is the embankment. Three of them - the coast, and each bank of the
 * river - offset inland by `EMBANKMENT_SETBACK` so there is a strip of ground
 * between the carriageway and the drop.
 *
 * It is cheap to generate because the water is a formula rather than a traced
 * outline: `shoreAt(x)` gives the coast at an x outright, and a row of the
 * river is found by asking `isWater` across it. Walking those is all this does,
 * and asking the field rather than re-deriving the channel is what keeps this
 * and the clip agreeing about where the water is.
 *
 * Like the boulevards, these go into the generator as ordinary spans *before*
 * the graph is built, so they are clipped against the water, split at every
 * street they cross, and repaired if they strand anything - by the same code
 * as everything else. `boulevards.ts` explains at length why splicing a road
 * into a finished graph is the wrong shape of solution; this is the same
 * lesson, and it is why an embankment turns a stub into a T-junction without
 * anything here knowing what a junction is.
 */
export function embankmentRoutes(bounds: Rect, water: Water): Vec2[][] {
  const routes: Vec2[][] = [];

  // The coast. The bay lies north of `shoreAt`, so the road sits south of it.
  const coast: Vec2[] = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += EMBANKMENT_STEP) {
    coast.push({ x, z: water.shoreAt(x) - EMBANKMENT_SETBACK });
  }
  routes.push(coast);

  // Both banks of the river, walked down the map. `isWater` is the authority
  // on where the channel is - the same function everything else asks - so the
  // setback is measured by stepping away from the water until it runs out
  // rather than by re-deriving the channel's width here.
  //
  // Walked in *runs* rather than as one line. A row with no bank in it is not
  // the end of the road, and neither is a bank that has jumped: near the mouth
  // the channel widens under the coast, so consecutive samples can land on
  // opposite sides of a headland. Joining those two draws a road straight
  // across it - which is what the first version did, and it read as a boulevard
  // laid at random through the waterfront.
  for (const side of [-1, 1]) {
    for (const run of runsAlongBank(bounds, water, side)) routes.push(run);
  }

  return routes;
}

/**
 * One bank, as the stretches of it that are actually continuous.
 *
 * A run ends where the row has no bank in it at all, and where the walk has
 * jumped rather than bent - see `sameBank`. Runs of a couple of samples are
 * dropped: three points at the mouth of the estuary is not a quayside, it is a
 * spur into the sea.
 */
function runsAlongBank(bounds: Rect, water: Water, side: number): Vec2[][] {
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  const end = () => {
    if (run.length > 3) runs.push(run);
    run = [];
  };

  for (let z = bounds.minZ; z <= bounds.maxZ; z += EMBANKMENT_STEP) {
    const at = bankAt(bounds, water, z, side);
    if (at === null) {
      end();
      continue;
    }
    const last = run[run.length - 1];
    if (last && !sameBank(water, last, at)) end();
    run.push(at);
  }
  end();

  return runs;
}

/**
 * Are these two samples neighbours on one bank, or has the walk jumped?
 *
 * Asked of the ground between them rather than of how far apart they are. A
 * meander moves the bank a long way in one step and is still one quay; the walk
 * crossing a headland to the far side of the channel can move it less and is
 * two. What tells them apart is what the road between them would run over: an
 * embankment is by the water for its whole length, so if the midpoint is not
 * near the water then the line between these two is a road through the middle
 * of somewhere else.
 */
function sameBank(water: Water, a: Vec2, b: Vec2): boolean {
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  return !water.isWater(mid.x, mid.z) && nearWater(water, mid.x, mid.z, EMBANKMENT_SETBACK * 4);
}

/**
 * Where the bank is at this z, on this side of the channel, or null if the
 * whole row is water - which is what the estuary looks like near the coast.
 *
 * Found by walking out from the middle of the channel rather than computed, so
 * that this agrees with `isWater` by construction. The alternative is a second
 * copy of the river's geometry, and two descriptions of one river is how they
 * come apart.
 */
function bankAt(bounds: Rect, water: Water, z: number, side: number): Vec2 | null {
  // Start in the channel and step outward until there is ground.
  let x: number | null = null;
  const middle = midChannel(bounds, water, z);
  if (middle === null) return null;

  for (let d = 0; d < bounds.maxX - bounds.minX; d += EMBANKMENT_STEP / 2) {
    const probe = middle + side * d;
    if (probe < bounds.minX || probe > bounds.maxX) return null;
    if (!water.isWater(probe, z)) {
      x = probe;
      break;
    }
  }
  if (x === null) return null;

  // Back off from the edge, and give up if that lands in the water again -
  // a sliver of ground between two channels is not somewhere to put a road.
  const at = x + side * EMBANKMENT_SETBACK;
  if (water.isWater(at, z) || at < bounds.minX || at > bounds.maxX) return null;
  // North of the coast is bay, whatever the river is doing.
  if (z > water.shoreAt(at)) return null;
  return { x: at, z };
}

/** The middle of the channel at this z, or null where there is no channel. */
function midChannel(bounds: Rect, water: Water, z: number): number | null {
  let from: number | null = null;
  let to: number | null = null;
  for (let x = bounds.minX; x <= bounds.maxX; x += EMBANKMENT_STEP / 2) {
    // Only the river: north of the coast everything is water and the "channel"
    // would be the whole bay.
    if (z > water.shoreAt(x)) continue;
    if (!water.isWater(x, z)) continue;
    if (from === null) from = x;
    to = x;
  }
  if (from === null || to === null) return null;
  return (from + to) / 2;
}
