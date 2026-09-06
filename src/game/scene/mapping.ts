/**
 * Which way round a map of Kestrel Bay goes.
 *
 * One function, used by the minimap, the full map and `npm run city`, because
 * three maps of one city that disagree about which way is up - or which way is
 * *left* - are worth less than any one of them.
 *
 * The arithmetic, once, so nobody has to do it again. Heading 0 is +z, and a
 * driver facing +z has their right hand pointing at -x: that is the same
 * right-handed cross product the steering uses, and `cityworld.ts` has the
 * comment about getting it wrong. A map seen from above with +z up the screen
 * therefore has **-x to the right**, and a map that draws +x to the right is
 * mirrored east to west.
 *
 * Both of ours were. #182 found that the minimap drew the road ahead of you
 * behind you and fixed it by flipping the rotation, which made "ahead is up"
 * true and left the mirror in place - so the turn you could see on your left
 * was drawn on your right, on both maps, and stayed that way until somebody
 * playing said the map felt flipped. `mapview.test.ts` settles it by
 * projecting a point through an actual camera rather than by reasoning about
 * it, which is the only way this has ever been got right.
 */
export interface MapPoint {
  /** Across the map. Positive is right of `at`. */
  x: number;
  /** Down the map. Positive is below `at`. */
  y: number;
}

/**
 * Where a world point sits on a map centred on `at`, in map units.
 *
 * Multiply by a scale and, for a heading-up map, rotate by **+heading** - the
 * mirror is why it is plus and not minus. North-up maps do not rotate at all.
 */
export function toMap(point: { x: number; z: number }, at: { x: number; z: number }): MapPoint {
  return { x: -(point.x - at.x), y: -(point.z - at.z) };
}
