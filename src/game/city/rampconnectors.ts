import { RAMP_CONNECTOR_ANGLE } from '../constants';
import { nearestOnLoop } from './interstate';
import type { AuthoredRoad } from './roads';
import type { DistrictKind, Vec2 } from './types';

/** A road from an authored ramp's foot to the drawn network. */
export interface RampConnector {
  /** The foot first, then the vertex it joins. */
  points: Vec2[];
  district: DistrictKind;
}

/**
 * The roads that join each authored ramp's foot to the streets (#371).
 *
 * A ramp anchor puts the foot of a ramp on open ground, and a ramp to nowhere
 * is a way onto the freeway nobody can reach. Each foot gets a straight
 * boulevard to the nearest **vertex** of a drawn road rather than the nearest
 * point on one: a vertex is already the end of a span, so the two meet at a
 * node that exists instead of a crossing `buildGraph` has to find, and a
 * connector ending exactly on a line is a floating-point question about
 * whether it touched.
 *
 * Straight rather than routed, because every one of the first seven came out
 * dry and under the grade cap as a line; `freeway.test.ts` holds them to both,
 * so a marker moved somewhere a straight line will not do fails there and
 * this can grow a router then. The one rule on which vertex is that the
 * connector may not double back under its own ramp (`RAMP_CONNECTOR_ANGLE`).
 *
 * Built before anything is laid rather than after the interstate, so the
 * connectors are cut and filled with the roads they join and go through the
 * same clip and junction splitting as every other span.
 */
export function rampConnectors(loop: Vec2[], ramps: Vec2[], roads: AuthoredRoad[]): RampConnector[] {
  const out: RampConnector[] = [];
  for (const foot of ramps) {
    const deck = nearestOnLoop(loop, foot);
    const up = Math.atan2(deck.z - foot.z, deck.x - foot.x);
    let best: { at: Vec2; gap: number; district: DistrictKind } | null = null;
    for (const road of roads) {
      if (road.kind === 'interstate' || road.kind === 'ramp') continue;
      for (const at of road.points) {
        const gap = Math.hypot(at.x - foot.x, at.z - foot.z);
        if (best && gap >= best.gap) continue;
        const away = Math.atan2(at.z - foot.z, at.x - foot.x) - up;
        if (Math.abs(Math.atan2(Math.sin(away), Math.cos(away))) < RAMP_CONNECTOR_ANGLE) continue;
        best = { at, gap, district: road.district };
      }
    }
    if (best) out.push({ points: [foot, best.at], district: best.district });
  }
  return out;
}
