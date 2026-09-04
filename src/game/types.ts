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
}
