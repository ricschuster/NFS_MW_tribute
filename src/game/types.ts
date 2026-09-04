export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Projected {
  x: number;
  y: number;
  w: number;
  scale: number;
}

/** A single vertex of a road segment: its world, camera-relative, and screen coords. */
export interface SegmentPoint {
  world: Vec3;
  camera: Vec3;
  screen: Projected;
}

export interface ColorSet {
  road: string;
  grass: string;
  rumble: string;
  /** Lane divider colour; omit for segments without lane markings. */
  lane?: string;
}

/** A car sitting on the road: traffic, and later cops. */
export interface Car {
  /** Lateral position across the road, -1..1 = edges (like the player's X). */
  offset: number;
  /** World-z along the track. */
  z: number;
  /** World units per second. 0 = parked, negative = oncoming. */
  speed: number;
  /** Body colour. */
  color: string;
  /** Index of the segment this car currently belongs to (for fast reassignment). */
  segmentIndex: number;
}

/** One slice of road between two z-planes (p1 near, p2 far). */
export interface Segment {
  index: number;
  p1: SegmentPoint;
  p2: SegmentPoint;
  /** Horizontal curve applied across this segment. */
  curve: number;
  color: ColorSet;
  /** True while this segment is rendered "wrapped" past the end of the track. */
  looped: boolean;
  /** Fog amount in [0,1]; 1 = fully visible, 0 = fully fogged. */
  fog: number;
  /** Screen y of the occlusion line when this segment was drawn; clips sprites behind hills. */
  clip: number;
  /** Cars currently resting on this segment, drawn with its projection. */
  cars: Car[];
}
