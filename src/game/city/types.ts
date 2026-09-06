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
  /**
   * Which way the road is, across the prop's facing: -1 or 1.
   *
   * A lamp reaches over the carriageway rather than standing straight up, and
   * nothing on the drawing side can work out which way that is - a prop knows
   * where it is but not what it is beside. The generator does know, because it
   * put the lamp a kerb's width off a centreline it was holding at the time,
   * so it says. Zero for props with no side to them.
   */
  reach: -1 | 0 | 1;
  kind: FurnitureKind;
  variant: number;
}

/**
 * Something to find in the city (#93).
 *
 * A billboard is smashed by driving into it. A speed camera clocks whatever
 * passes it and keeps your best. Both are city *data* for the same reason
 * buildings are: the sim has to be able to collide with one without a renderer
 * in the room, and the playtests have to be able to build a city headlessly.
 */
export type CollectibleKind = 'billboard' | 'camera';

export interface Collectible {
  /** Stable within one seed: it is what a save file records. */
  id: number;
  kind: CollectibleKind;
  at: Vec2;
  /** Height of the road it stands beside. */
  y: number;
  /** Facing, in radians about y. A billboard faces the traffic; a camera watches it. */
  angle: number;
  /** Which road it belongs to, so a camera knows what road it is clocking. */
  road: number;
}

/**
 * A car parked in the city, waiting to be found (#67).
 *
 * City data like everything else here: the sim has to be able to say "you have
 * driven into the Ardent" without a renderer in the room, and a seed has to
 * put the same car in the same lot every time.
 */
export interface StreetFind {
  /** Which car is parked here, by `CarProfile.id`. */
  car: string;
  at: Vec2;
  y: number;
  /** Which way it is parked. */
  angle: number;
}

/**
 * A circuit through the city (#70).
 *
 * A closed loop of real streets, generated from the road graph. `points` is
 * the line to drive; `checkpoints` are the gates you have to pass through in
 * order, which is what stops a lap being a straight line between two corners.
 */
/**
 * What kind of event a route hosts (#70, #72).
 *
 * A circuit is three laps against a field, won on position. A speed run is one
 * lap alone, won on the average speed you held over it.
 */
export type RouteKind = 'circuit' | 'speedrun';

export interface CityRoute {
  id: number;
  name: string;
  kind: RouteKind;
  points: Vec2[];
  checkpoints: Vec2[];
  /** Where the lap starts and finishes. */
  start: Vec2;
  /** One lap, in world units. */
  length: number;
  laps: number;
}

/**
 * A place the police will jump you (#92).
 *
 * Not a route and not a lot: an ambush needs nothing but a spot to be
 * stationary in and a heat level to be surrounded at, so that is all it is.
 */
export interface AmbushSpot {
  at: Vec2;
  /** The heat it springs at, 1 to 6. Picking a spot is picking a difficulty. */
  level: number;
}

/**
 * A drive-through repair shop (#95).
 *
 * A position on a road and nothing else. It has to be something you go
 * *through* rather than something you stop at: a repair you have to park for
 * is housekeeping, and a repair you take at a hundred and eighty during a
 * pursuit is a decision.
 */
export interface RepairShop {
  at: Vec2;
  /** Facing, along the road it sits beside. */
  angle: number;
  y: number;
}

/**
 * Something that breaks when you drive through it (#57).
 *
 * A gate across a yard entrance or a stack of pallets on an industrial kerb.
 * City data like everything else here: the sim has to be able to bring one
 * down without a renderer in the room.
 */
export type BreakableKind = 'gate' | 'stack';

export interface Breakable {
  id: number;
  kind: BreakableKind;
  at: Vec2;
  y: number;
  /** Facing: a gate stands across this, a stack sits along it. */
  angle: number;
  /** Half its width, so the sim knows what "through it" means. */
  half: number;
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
  collectibles: Collectible[];
  finds: StreetFind[];
  routes: CityRoute[];
  ambushes: AmbushSpot[];
  repairs: RepairShop[];
  breakables: Breakable[];
}
