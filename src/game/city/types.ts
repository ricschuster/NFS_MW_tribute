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

/** Arterials cross the whole city and carry the traffic; streets fill a district. */
export type RoadClass = 'arterial' | 'street';

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
}

/** A junction. Roads meet here, and this is what routing walks. */
export interface CityNode {
  id: number;
  pos: Vec2;
  /** Ids of the roads meeting at this node. */
  roads: number[];
}

/** One stretch of road between two junctions. Always axis-aligned. */
export interface CityRoad {
  id: number;
  /** Endpoint node ids. `a` is always the lower coordinate along `axis`. */
  a: number;
  b: number;
  axis: Axis;
  class: RoadClass;
  district: DistrictKind;
  lanes: number;
  /** Kerb to kerb, in world units. */
  width: number;
  /** The speed this road is built for, in world units per second. */
  speed: number;
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

/** A city block: the land between the roads, for #84 to put buildings on. */
export interface CityBlock {
  bounds: Rect;
  district: DistrictKind;
}

/** The area bounded by four arterials. One district, one street pattern. */
export interface Superblock {
  bounds: Rect;
  district: DistrictKind;
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
}
