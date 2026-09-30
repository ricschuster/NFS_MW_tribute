/**
 * A pier: a drawn road that ends out over the water on purpose (#410).
 *
 * The generator cuts every road against the water and keeps what is on land,
 * and the only way it crosses water is a bridge from one bank to another. A
 * road that stops in the middle of a channel was cut back to the shore, left
 * as a stub at the bank and trimmed. That is right for a road nobody meant to
 * end there, and wrong for Sablet Wharf's jetty, which is the whole point of
 * the road: a run-up out over the water to a jump the far bank is in reach of.
 *
 * So the author says so, with the flag a drawn road already has: `deadEnd`
 * means "this road stops where it means to", and a dead end whose last point
 * is in the water is a pier. No new field, so the editor and the sync need no
 * change. The part on land is laid like any road; the part over the water is
 * laid as deck, `bridge` like a crossing's, which is what keeps it through the
 * shoreline cut and the stub trimming both.
 */
import type { Water } from './water';
import type { AuthoredRoad } from './roads';
import type { Span } from './spans';
import type { Vec2 } from './types';

export interface Pier {
  /** The road up to the last point on land, laid like any other. */
  land: Vec2[];
  /** From that point to the end, over the water. */
  deck: Vec2[];
}

/** The pier this road is, or null if it is an ordinary road. */
export function pierOf(road: AuthoredRoad, water: Water): Pier | null {
  const { points } = road;
  if (!road.deadEnd || points.length < 2) return null;
  const end = points[points.length - 1];
  if (!water.isWater(end.x, end.z)) return null;
  // The last point on land, walking back from the end: everything after it is
  // over the water.
  let foot = points.length - 1;
  while (foot > 0 && water.isWater(points[foot].x, points[foot].z)) foot--;
  if (foot === 0 && water.isWater(points[0].x, points[0].z)) return null;
  return { land: points.slice(0, foot + 1), deck: points.slice(foot) };
}

/** The road with its deck left off: what the ground under it is graded for. */
export function withoutDeck(road: AuthoredRoad, water: Water): AuthoredRoad {
  const pier = pierOf(road, water);
  return pier ? { ...road, points: pier.land } : road;
}

/**
 * The deck as spans, ready to go into the network with the bridges. Level with
 * the quay at its foot, `height`: a pier that followed the ground down would
 * drop to the water in its first ten metres.
 */
export function deckSpans(road: AuthoredRoad, deck: Vec2[], height: number): Span[] {
  const spans: Span[] = [];
  for (let i = 1; i < deck.length; i++) {
    spans.push({
      from: deck[i - 1],
      to: deck[i],
      class: road.kind,
      district: road.district,
      required: true,
      bridge: true,
      deck: height,
    });
  }
  return spans;
}
