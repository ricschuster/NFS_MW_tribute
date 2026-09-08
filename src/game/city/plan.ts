/**
 * The map of Kestrel Bay, drawn rather than derived (ADR-0009).
 *
 * Every district here was placed by rule until now - three seeded anchors and
 * three radii - and four months of that produced a map its author did not want
 * (#269). So it was drawn: traced by hand in an editor over the generated
 * relief, then audited against the ground underneath (#271), and recorded as
 * data in #272 because an issue outlives a link.
 *
 * This is that plan. It is city data in exactly the sense `RIVALS` and
 * `DISTRICTS` are - a design document that happens to compile - and the reason
 * it is worth having in this form is that a district which reads wrong is now a
 * polygon somebody moves in a minute, rather than a constant somebody tunes and
 * a city somebody regenerates and a picture somebody judges.
 *
 * **Coordinates are world metres against a fixed landmass.** That is what makes
 * an authored plan coherent at all, and it is why ADR-0009 rule 2 took the seed
 * out of `makeWater`: a polygon pinned in metres and a coastline that moves with
 * the seed are two answers to where the coast is. `npm run plan` re-measures
 * every area against the ground the generator makes today, and it is a guard
 * rather than a probe - if a polygon leaves the land, that is a failure.
 *
 * The seed still varies the city: which streets are inside a district, which
 * blocks are skipped, what stands on them, and where the content lands. It no
 * longer varies where downtown is.
 */
import { UNITS_PER_METRE } from '../constants';
import type { DistrictKind, Vec2 } from './types';

const m = (metres: number) => metres * UNITS_PER_METRE;

/** An area of the map, and what kind of place it is. */
export interface PlanArea {
  kind: DistrictKind;
  /** Closed, in world units, wound either way. */
  poly: Vec2[];
}

/**
 * The named places (#271): a dock, an airfield, a quarry, a lookout.
 *
 * Not districts, and the distinction is the point. A district says how streets
 * and blocks are laid out; these have their own geometry and want **a road in**
 * rather than a grid over. Forcing them through `DistrictKind` is how the port
 * came to define a quarter of the city's street layout.
 */
export type PlaceKind = 'docks' | 'airfield' | 'quarry' | 'lookout';

export interface PlanPlace {
  kind: PlaceKind;
  at: Vec2;
  /**
   * How far its own ground reaches, where that is a radius. The airfield's
   * shape is its runway instead.
   */
  radius: number;
}

/** Metres in, world units out, so the plan reads as it was drawn. */
const area = (kind: DistrictKind, poly: [number, number][]): PlanArea => ({
  kind,
  poly: poly.map(([x, z]) => ({ x: m(x), z: m(z) })),
});

/**
 * The districts, verbatim from #272.
 *
 * What the four kinds mean changed with the plan (#271), and the table in
 * `constants.ts` is where that is written down: downtown is *small*, midtown is
 * suburban and most of the built-up extent, and the waterfront is **affluent**
 * rather than the port it used to be. The port is a place now, on island E.
 *
 * Ordered so the most specific wins where two overlap: a point is in the first
 * area that contains it. They should not overlap - the audit checks it - but a
 * hand-traced plan is drawn in one pass over one picture, and the docks and a
 * coastal park were found sharing an island exactly that way.
 */
export const PLAN_DISTRICTS: PlanArea[] = [
  // Downtown: 1.5 km², 75% land, 3 m above the sea. Small on purpose - a dense
  // core, not a third of the city.
  area('downtown', [
    [125, -2500], [-124, -1899], [-1100, -1525], [-1125, -2025],
    [-1825, -2875], [-1100, -2725], [-550, -2775], [-124, -3101],
  ]),

  // The industrial edge, inland of downtown. Unchanged in character.
  area('industrial', [
    [2525, -2500], [2800, -1750], [1875, -1750], [1400, -1900],
    [1225, -2500], [1150, -2825], [1875, -3150], [2335, -2960],
  ]),

  // The hill park: 87 m mean, 122 m peak, and 41% of it too steep for a street.
  // Deliberate, and the one area chosen for its ground rather than in spite of
  // it - it is a hill with a road up it, and nothing else on the map rewards
  // climbing. The lookout sits on its high ground.
  area('park', [
    [1275, 475], [1600, -275], [1100, -725], [450, -225], [950, 550],
  ]),
  // The coastal park behind downtown. Its twin on island E was dropped: the
  // island is the docks (ADR-0009 rule 6).
  area('park', [
    [1700, -3225], [1250, -3325], [625, -3225], [150, -3125],
    [-75, -3050], [150, -2500], [1000, -2800],
  ]),

  // Three midtowns, which are most of the built-up extent: suburban, bigger
  // blocks, curving streets, low buildings.
  area('midtown', [
    [1250, -2100], [1089, -1711], [700, -1550], [311, -1711],
    [-75, -1875], [125, -2450], [700, -2650], [1150, -2700],
  ]),
  area('midtown', [
    [-275, -1775], [-1175, -1500], [-1450, -875], [-1225, 50],
    [-1200, 750], [-975, 775], [-825, 125], [-775, -750], [-200, -1525],
  ]),
  area('midtown', [
    [1150, 3150], [575, 3350], [0, 3325], [-375, 2975], [-675, 2200],
    [-875, 1475], [-675, 1375], [-350, 1950], [50, 2650], [400, 2700],
    [950, 2625], [1325, 2550],
  ]),

  // The waterfront, on its own body of land across the channel: 4.2 km², the
  // largest area on the plan, and the loosest. Few roads, well spaced, large
  // lots and a lot of open ground.
  area('waterfront', [
    [-2325, 1575], [-1900, 2675], [-3250, 2675], [-4050, 2250],
    [-4475, 1650], [-4275, 600], [-3225, 525], [-2000, 825],
  ]),
];

/**
 * The places, from #272.
 *
 * Each is on a different body of land, which is what makes four of the five
 * crossings earn themselves - the first time that has been true of this map.
 */
export const PLAN_PLACES: PlanPlace[] = [
  // The port, on the 0.7 km² south-east island: flat, a kilometre off downtown,
  // one bridge in. Somewhere you can be trapped is worth more than somewhere you
  // drive through, which is the best pursuit geography the map can offer.
  { kind: 'docks', at: { x: m(-1634), z: m(-1955) }, radius: m(450) },
  // The airfield's island. Its shape is the runway, not a radius.
  { kind: 'airfield', at: { x: m(-1269), z: m(2012) }, radius: m(700) },
  // The quarry, on the eastern body: hill country rather than canyon country,
  // and a quarry cuts its own walls, so it does not need pre-existing drama.
  { kind: 'quarry', at: { x: m(-2704), z: m(-812) }, radius: m(600) },
  // The top of the canyon run, on the hill park's high ground.
  { kind: 'lookout', at: { x: m(1250), z: m(-250) }, radius: m(150) },
];

/**
 * The runway: 2300 m at 68 degrees, corner to corner across the airfield
 * island's long axis.
 *
 * Measured rather than chosen - it is the longest straight line that fits on
 * that island - and the angle is kept for the same reason. A runway on a
 * diagonal reads as sited; one squared up to the map reads as a rectangle
 * stamped on a rectangle.
 */
export const PLAN_RUNWAY: [Vec2, Vec2] = [
  { x: m(-1571), z: m(971) },
  { x: m(-719), z: m(3080) },
];

/** Is this point inside a closed polygon? Ray cast, counting crossings. */
export function inArea(poly: Vec2[], at: Vec2): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > at.z !== b.z > at.z && at.x < ((b.x - a.x) * (at.z - a.z)) / (b.z - a.z) + a.x) {
      hit = !hit;
    }
  }
  return hit;
}

/**
 * Which district a point is in, or null for the country between them.
 *
 * Null is a real answer and the reason `CITY_BUILT_UP` could be deleted: the
 * grid used to be bounded by a radius around `water.town`, which is why four of
 * the five bodies of land had no city on them. The city is where the plan says
 * it is, and everywhere else is the periphery (#260).
 */
export function planDistrictAt(at: Vec2): DistrictKind | null {
  for (const region of PLAN_DISTRICTS) {
    if (inArea(region.poly, at)) return region.kind;
  }
  return null;
}

/** The middle of the first area of a kind - what the plan means by "downtown". */
export function planCentre(kind: DistrictKind): Vec2 {
  const region = PLAN_DISTRICTS.find((a) => a.kind === kind);
  if (!region) throw new Error(`no ${kind} in the plan`);
  let x = 0;
  let z = 0;
  for (const p of region.poly) {
    x += p.x;
    z += p.z;
  }
  return { x: x / region.poly.length, z: z / region.poly.length };
}
