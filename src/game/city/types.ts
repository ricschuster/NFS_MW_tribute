/**
 * Kestrel Bay's data model.
 *
 * The city is data before it is anything else: `World` needs it for collision
 * and routing, the renderer needs it for geometry, and the playtests need to
 * build one without a canvas. Nothing in here knows about three.js.
 */

/** A point on the ground plane. The city is flat in y; the elevated road is #85. */
export interface Vec2 {
  x: number;
  z: number;
}

/** An axis-aligned rectangle on the ground plane. */
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Which axis a road runs along: 'x' varies in x at a fixed z, and vice versa. */
export type Axis = 'x' | 'z';

export type DistrictKind = 'downtown' | 'midtown' | 'waterfront' | 'industrial';

/**
 * Arterials cross the whole city and carry the traffic; streets fill a
 * district. A boulevard is the one that bends: laid over the finished grid as
 * a curve and spliced into it, because a pure grid has no line that sweeps.
 * The interstate runs above (or below) all of them, and ramps are the only
 * thing joining the two levels - which is what makes an overpass a route
 * choice rather than scenery.
 */
export type RoadClass = 'arterial' | 'street' | 'boulevard' | 'interstate' | 'ramp';

/**
 * What makes a district read as a place. Block size and how much it varies do
 * most of the work: a tight regular grid downtown, long shallow blocks facing
 * the water, and sprawling lots out in the industrial edge.
 */
export interface DistrictCharacter {
  /** Target block size across (x) and along (z), in world units, before jitter. */
  blockX: number;
  blockZ: number;
  /** How much block sizes vary, as a fraction of the target. 0 = a perfect grid. */
  jitter: number;
  /** Chance a local street is left out, merging the blocks either side of it. */
  skip: number;
  /** Lanes on a local street here. */
  lanes: number;
  /** The speed this district's streets are built for, in world units per second. */
  speed: number;
  /**
   * Chance a quarter of this district comes out winding rather than gridded.
   * A grid is right for a downtown and wrong for everywhere else, and the
   * variation belongs between quarters, like density.
   */
  winding: number;
}

/**
 * A junction. Roads meet here, and this is what routing walks.
 *
 * `y` is why ADR-0004 exists. Two roads at the same map position and different
 * heights are two different places, so node identity includes height: the
 * interstate crossing a street overhead shares no node with it, and you cannot
 * turn from one onto the other. That is the thing a projected ribbon or a
 * ground plane cannot represent at all.
 */
export interface CityNode {
  id: number;
  pos: Vec2;
  /** Height above the surface. 0 on the street, positive elevated, negative in a tunnel. */
  y: number;
  /** Ids of the roads meeting at this node. */
  roads: number[];
}

/**
 * One stretch of road between two junctions: a straight piece, but not
 * necessarily an axis-aligned one. A bend is a chain of these.
 *
 * There used to be an `axis` here, and every geometric test in the codebase
 * leant on it. ADR-0005 rule 4 made it a lie, so it is gone: direction comes
 * from the two endpoints, and "is this point on this road" is a distance to a
 * segment rather than a rectangle test.
 */
export interface CityRoad {
  id: number;
  /** Endpoint node ids. */
  a: number;
  b: number;
  class: RoadClass;
  district: DistrictKind;
  lanes: number;
  /** Kerb to kerb, in world units. */
  width: number;
  /** The speed this road is built for, in world units per second. */
  speed: number;
  /** Length across the map. A ramp's slope makes its real length a shade longer. */
  length: number;
  /** True where the road crosses water. Bridges are the chokepoints (ADR-0005). */
  bridge: boolean;
}

/** A bay or a river, as a closed outline in world space for #84 to build from. */
export interface WaterBody {
  kind: 'bay' | 'river';
  outline: Vec2[];
}

/**
 * What a building is, from the city's point of view. Kinds exist so the
 * renderer can choose a mesh per kind (#84): today every kind is a scaled box,
 * later some become modelled and the rest stay boxes, and nothing about the
 * generator changes.
 */
export type BuildingKind = 'tower' | 'block' | 'shed';

/**
 * One building, as a description rather than as geometry. The generator emits
 * these and never constructs a mesh: that seam is what lets the art be
 * upgraded without a rewrite, and it is also what lets #86 collide with the
 * city without a renderer in the room.
 */
export interface Building {
  /** Ground footprint, axis-aligned like the block it stands in. */
  footprint: Rect;
  height: number;
  kind: BuildingKind;
  district: DistrictKind;
  /** Seeded 0..1, so the provider can vary colour and detail deterministically. */
  variant: number;
}

/** How tall the buildings on a block are, and how the land is divided into lots. */
export interface BuildingCharacter {
  /** Target lot size along each axis, before jitter. */
  lot: number;
  /** How far a building stands back from its lot edge. */
  setback: number;
  minHeight: number;
  maxHeight: number;
  /** Chance a lot is left open: a yard, a car park, a scrap of park. */
  empty: number;
  /** Chance a lot gets something much taller than its neighbours. */
  landmark: number;
  kind: BuildingKind;
}

/** Street furniture: the same idea as the old roadside props, on real streets. */
export type FurnitureKind = 'lamp' | 'sign' | 'barrier';

/** One piece of street furniture, described rather than built. */
export interface StreetProp {
  at: Vec2;
  /** Height of the road it stands on: a lamp on the interstate is up there too. */
  y: number;
  /** Facing, in radians about y: along the road it stands beside. */
  angle: number;
  kind: FurnitureKind;
  variant: number;
}

/** A city block: the land between the roads, for #84 to put buildings on. */
export interface CityBlock {
  bounds: Rect;
  district: DistrictKind;
  /** Nothing is built here: a park, a yard, a lot. Some of a city has to be gaps. */
  open: boolean;
}

/** The area bounded by four arterials. One district, one street pattern. */
export interface Superblock {
  bounds: Rect;
  district: DistrictKind;
  /** True where the local streets bend instead of running straight across. */
  winding: boolean;
  /**
   * How built up this one is, around 1. Variation belongs *between* places
   * rather than within them: a district where every block is equally thinned
   * reads as noise, where a thin district next to a dense one reads as two
   * places.
   */
  density: number;
}

/** A generated city. A pure function of `seed`, and the same one every time. */
export interface City {
  seed: number;
  bounds: Rect;
  /** The bay and the river, as outlines. Everything else is land. */
  water: WaterBody[];
  nodes: CityNode[];
  roads: CityRoad[];
  blocks: CityBlock[];
  superblocks: Superblock[];
  buildings: Building[];
  furniture: StreetProp[];
}
