import type { Segment } from './types';
import { COLORS, SEGMENT_LENGTH, RUMBLE_LENGTH } from './constants';
import { easeIn, easeInOut } from './math';

/** Building-block sizes used to author a track. */
const ROAD = {
  LENGTH: { NONE: 0, SHORT: 25, MEDIUM: 50, LONG: 100 },
  CURVE: { NONE: 0, EASY: 2, MEDIUM: 4, HARD: 6 },
  HILL: { NONE: 0, LOW: 20, MEDIUM: 40, HIGH: 60 },
} as const;

/**
 * Holds the generated list of road segments and knows how to author a track
 * from straights, curves and hills. Segment geometry is fixed at build time;
 * only the projection (in render.ts) changes each frame.
 */
export class Road {
  segments: Segment[] = [];
  trackLength = 0;

  build(): void {
    this.segments = [];

    this.addStraight(ROAD.LENGTH.SHORT);
    this.addHill(ROAD.LENGTH.MEDIUM, ROAD.HILL.LOW);
    this.addCurve(ROAD.LENGTH.MEDIUM, ROAD.CURVE.MEDIUM, ROAD.HILL.LOW);
    this.addStraight(ROAD.LENGTH.SHORT);
    this.addCurve(ROAD.LENGTH.LONG, -ROAD.CURVE.MEDIUM, ROAD.HILL.MEDIUM);
    this.addSCurves();
    this.addHill(ROAD.LENGTH.LONG, ROAD.HILL.HIGH);
    this.addCurve(ROAD.LENGTH.LONG, ROAD.CURVE.HARD, -ROAD.HILL.LOW);
    this.addStraight(ROAD.LENGTH.MEDIUM);

    this.trackLength = this.segments.length * SEGMENT_LENGTH;
  }

  /** The segment containing world-z position `z` (wraps around the track). */
  findSegment(z: number): Segment {
    return this.segments[Math.floor(z / SEGMENT_LENGTH) % this.segments.length];
  }

  private lastY(): number {
    return this.segments.length === 0
      ? 0
      : this.segments[this.segments.length - 1].p2.world.y;
  }

  private addSegment(curve: number, y: number): void {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      p1: {
        world: { x: 0, y: this.lastY(), z: n * SEGMENT_LENGTH },
        camera: { x: 0, y: 0, z: 0 },
        screen: { x: 0, y: 0, w: 0, scale: 0 },
      },
      p2: {
        world: { x: 0, y, z: (n + 1) * SEGMENT_LENGTH },
        camera: { x: 0, y: 0, z: 0 },
        screen: { x: 0, y: 0, w: 0, scale: 0 },
      },
      curve,
      color: Math.floor(n / RUMBLE_LENGTH) % 2 ? COLORS.DARK : COLORS.LIGHT,
      looped: false,
      fog: 0,
    });
  }

  /** Author a stretch that eases into `curve`/`y`, holds, then eases back out. */
  private addRoad(enter: number, hold: number, leave: number, curve: number, y: number): void {
    const startY = this.lastY();
    const endY = startY + y * SEGMENT_LENGTH;
    const total = enter + hold + leave;

    for (let n = 0; n < enter; n++) {
      this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    }
    for (let n = 0; n < hold; n++) {
      this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
    }
    for (let n = 0; n < leave; n++) {
      this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
    }
  }

  private addStraight(num: number): void {
    this.addRoad(num, num, num, ROAD.CURVE.NONE, ROAD.HILL.NONE);
  }

  private addCurve(num: number, curve: number, height: number): void {
    this.addRoad(num, num, num, curve, height);
  }

  private addHill(num: number, height: number): void {
    this.addRoad(num, num, num, ROAD.CURVE.NONE, height);
  }

  private addSCurves(): void {
    this.addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, -ROAD.CURVE.EASY, ROAD.HILL.NONE);
    this.addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.CURVE.MEDIUM, ROAD.HILL.MEDIUM);
    this.addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.CURVE.EASY, -ROAD.HILL.LOW);
    this.addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, -ROAD.CURVE.EASY, ROAD.HILL.MEDIUM);
    this.addRoad(ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, ROAD.LENGTH.MEDIUM, -ROAD.CURVE.MEDIUM, -ROAD.HILL.MEDIUM);
  }
}
