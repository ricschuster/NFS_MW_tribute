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
  /**
   * What this area is called, where it is distinct enough to have earned a
   * name of its own rather than just a kind - the way a place already does.
   * Not every area has one yet.
   */
  name?: string;
  /** Closed, in world units, wound either way. */
  poly: Vec2[];
  /**
   * How built up this area is against others of its kind, multiplying the
   * superblock's own roll.
   *
   * Three areas can be midtown and not be the same place. The northern one is
   * the far side of the map from downtown and should read as the edge of the
   * city rather than more of it; the one behind downtown should read as the
   * inner suburb it is. Without this the only lever is `DISTRICTS`, which moves
   * all three at once.
   */
  density?: number;
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
  /** What it is called. Places are the map's landmarks and a landmark has a name. */
  name: string;
  at: Vec2;
  /**
   * How far its own ground reaches, where that is a radius. The airfield's
   * shape is its runway instead.
   */
  radius: number;
  /**
   * The ground the place owns, traced by the owner in the District Plan
   * (2026-10-02): the whole of its island, not just the works at its middle.
   * Not a district - a district says the ground is built up, and these
   * islands are the places and the country round them - so the generator's
   * routing and `planDistrictAt` never see it. What is placed over the
   * island's open ground asks this.
   */
  area?: Vec2[];
}

/** Metres in, world units out, for a place's outline. */
const places = (poly: [number, number][]): Vec2[] => poly.map(([x, z]) => ({ x: m(x), z: m(z) }));

/** Metres in, world units out, so the plan reads as it was drawn. */
const area = (
  kind: DistrictKind,
  poly: [number, number][],
  density?: number,
  name?: string,
): PlanArea => ({
  kind,
  ...(name === undefined ? {} : { name }),
  poly: poly.map(([x, z]) => ({ x: m(x), z: m(z) })),
  ...(density === undefined ? {} : { density }),
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
  // Downtown: 1.2 km², nearly all of it land, 3 m above the sea. Small on
  // purpose - a dense core, not a third of the city. Trimmed to the shore for
  // #268: it used to take in 0.4 km² of the bay and the channel beside Sablet
  // Wharf. The inland edges are unchanged, and the strip on the downtown bank
  // of the channel is downtown's to its tip; the wharf ends at the water.
  // Redrawn by the owner in the District Plan (2026-10-02): the north-west
  // edge out to midtown's corner and the shore edge down to the water.

  area('downtown', [
    [125, -2500], [-124, -1899], [-1220, -1514], [-1150, -1799],
    [-1115, -1919], [-1170, -2190], [-1735, -2823], [-1516, -2785],
    [-1310, -2710], [-950, -2699], [-605, -2734], [-63, -2886],
  ], 1.35),

  // The industrial edge, inland of downtown. Unchanged in character.
  area('industrial', [
    [2525, -2500], [2800, -1750], [1875, -1750], [1400, -1900],
    [1225, -2500], [1150, -2825], [1875, -3150], [2335, -2960],
  ]),

  // Highmoor Park, the hill: 87 m mean, 122 m peak, and 41% of it too steep
  // for a street. Deliberate, and the one area chosen for its ground rather
  // than in spite of it - it is a hill with a road up it, and nothing else on
  // the map rewards climbing. Kestrel Head, the lookout, sits on its high
  // ground.
  //
  // Pulled in about a tenth from where it was traced: it still covers the same
  // three superblocks - 113 m, 91 m and the 122 m summit with the lookout on it -
  // and stops running out into ground the plan does not mean to claim.
  area('park', [
    [1245, 423], [1547, -256], [1098, -664], [513, -207], [963, 491],
  ], undefined, 'Highmoor Park'),
  // Tidewater Park, the coastal park behind downtown. Its twin on island E was
  // dropped: the island is the docks (ADR-0009 rule 6). It reaches up to take
  // the row of the southern midtown that sat between it and the hill - half
  // and half of the ground the two were sharing - so the parkland behind
  // downtown is continuous instead of being a strip under a row of suburb.
  area('park', [
    [1700, -3225], [1250, -3325], [625, -3225], [150, -3125],
    [-75, -3050], [150, -2500], [1000, -2500], [1050, -2800],
  ], undefined, 'Tidewater Park'),

  // Three midtowns, which are most of the built-up extent: suburban, bigger
  // blocks, curving streets, low buildings.
  area('midtown', [
    [1250, -2100], [1089, -1711], [700, -1550], [311, -1711],
    [-75, -1875], [125, -2350], [700, -2400], [1150, -2480],
  ]),
  area('midtown', [
    [-275, -1775], [-1248, -1484], [-1450, -875], [-1225, 50],
    [-1200, 750], [-975, 775], [-825, 125], [-775, -750], [-200, -1525],
  ]),
  area('midtown', [
    [1150, 3150], [575, 3350], [0, 3325], [-375, 2975], [-675, 2200],
    [-875, 1475], [-675, 1375], [-350, 1950], [50, 2650], [400, 2700],
    [950, 2625], [1325, 2550],
  ], 0.55),

  // Ashford Point, the waterfront, on its own body of land across the
  // channel: 4.2 km², the largest area on the plan, and the loosest. Few
  // roads, well spaced, large lots and a lot of open ground - the affluent
  // enclave, not the port the waterfront used to mean.
  //
  // Half density on top of that. It is the biggest area on the map and it came
  // out with the densest street grid on it, which is the opposite of affluent -
  // 4.2 km² at midtown's grain is more city than downtown, laid where the plan
  // asks for the fewest roads anywhere.
  //
  // Its corners pulled out to the shore by the owner (2026-10-02), where the
  // traced outline used to stop short of the point and the north beaches.
  area('waterfront', [
    [-2172, 1584], [-1895, 2675], [-3340, 2750], [-4045, 2250],
    [-4470, 1650], [-4330, 495], [-3220, 525], [-1840, 815],
  ], 0.7, 'Ashford Point'),
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
  { kind: 'docks', name: 'Sablet Wharf', at: { x: m(-1634), z: m(-1955) }, radius: m(450),
    area: places([
      [-1652, -980], [-1561, -1169], [-1512, -1281], [-1407, -1491],
      [-1344, -1701], [-1302, -1848], [-1302, -1995], [-1330, -2156],
      [-1414, -2296], [-1533, -2450], [-1673, -2597], [-1792, -2723],
      [-1897, -2835], [-1988, -2912], [-2079, -2870], [-2114, -2758],
      [-2093, -2527], [-2058, -2268], [-1981, -1981], [-1869, -1624],
      [-1806, -1372], [-1736, -1106],
    ]),
  },
  // The airfield's island. Its shape is the runway, not a radius.
  { kind: 'airfield', name: 'Marrow Field', at: { x: m(-1269), z: m(2012) }, radius: m(700),
    area: places([
      [-747, 3087], [-855, 3069], [-972, 3051], [-1116, 2988],
      [-1260, 2934], [-1368, 2871], [-1467, 2844], [-1557, 2808],
      [-1638, 2745], [-1647, 2610], [-1638, 2484], [-1647, 2385],
      [-1674, 2310], [-1710, 2214], [-1758, 2124], [-1800, 2028],
      [-1830, 1950], [-1872, 1878], [-1914, 1770], [-1938, 1692],
      [-1944, 1566], [-1938, 1416], [-1914, 1232], [-1848, 1136],
      [-1796, 1084], [-1748, 1024], [-1708, 976], [-1672, 920],
      [-1612, 876], [-1524, 872], [-1452, 880], [-1368, 888],
      [-1288, 904], [-1228, 928], [-1176, 944], [-1132, 1004],
      [-1120, 1076], [-1096, 1164], [-1068, 1260], [-1038, 1320],
      [-1002, 1422], [-960, 1530], [-950, 1605], [-935, 1695],
      [-915, 1790], [-885, 1910], [-865, 1945], [-835, 2120],
      [-810, 2215], [-780, 2370], [-745, 2560], [-725, 2660],
      [-690, 2785], [-686, 2880], [-686, 2954], [-694, 3012],
      [-714, 3054],
    ]),
  },
  // The quarry, on the eastern body: hill country rather than canyon country,
  // and a quarry cuts its own walls, so it does not need pre-existing drama.
  { kind: 'quarry', name: 'Halloway Quarry', at: { x: m(-2704), z: m(-812) }, radius: m(600),
    area: places([
      [-1764, 729], [-2043, 684], [-2223, 648], [-2466, 603],
      [-2790, 522], [-3123, 405], [-3384, 333], [-3654, 234],
      [-3906, 126], [-4032, 36], [-4077, -72], [-4014, -261],
      [-3924, -477], [-3888, -765], [-3843, -1062], [-3816, -1224],
      [-3771, -1476], [-3762, -1665], [-3699, -1890], [-3627, -2070],
      [-3546, -2232], [-3447, -2376], [-3384, -2475], [-3290, -2550],
      [-3215, -2635], [-3150, -2670], [-3055, -2725], [-2950, -2790],
      [-2890, -2820], [-2810, -2855], [-2715, -2865], [-2670, -2855],
      [-2600, -2820], [-2545, -2720], [-2460, -2555], [-2380, -2400],
      [-2316, -2280], [-2238, -2082], [-2154, -1914], [-2088, -1770],
      [-2022, -1560], [-1968, -1404], [-1904, -1253], [-1820, -1008],
      [-1743, -805], [-1694, -644], [-1638, -448], [-1568, -245],
      [-1524, -120], [-1464, 18], [-1446, 114], [-1398, 234],
      [-1386, 342], [-1446, 486], [-1578, 606], [-1670, 672],
      [-1708, 704],
    ]),
  },
  // The top of the canyon run, on the hill park's high ground.
  { kind: 'lookout', name: 'Kestrel Head', at: { x: m(1250), z: m(-250) }, radius: m(150) },
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

/**
 * How built up the plan wants this point to be, as a multiplier on the
 * superblock's own roll. One for anywhere the plan says nothing about.
 */
export function planDensityAt(at: Vec2): number {
  for (const region of PLAN_DISTRICTS) {
    if (inArea(region.poly, at)) return region.density ?? 1;
  }
  return 1;
}
