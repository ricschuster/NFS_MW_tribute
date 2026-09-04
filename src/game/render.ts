import type { SegmentPoint, ColorSet } from './types';
import { LANES } from './constants';

/**
 * Project a world-space segment point into screen space, mutating its
 * `camera` and `screen` fields in place. This is the core of the pseudo-3D
 * effect: farther points (larger camera.z) get a smaller scale.
 */
export function project(
  p: SegmentPoint,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  cameraDepth: number,
  width: number,
  height: number,
  roadWidth: number,
): void {
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;
  p.screen.scale = cameraDepth / p.camera.z;
  p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width) / 2);
  p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height) / 2);
  p.screen.w = Math.round((p.screen.scale * roadWidth * width) / 2);
}

function polygon(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function rumbleWidth(projectedRoadWidth: number, lanes: number): number {
  return projectedRoadWidth / Math.max(6, 2 * lanes);
}

function laneMarkerWidth(projectedRoadWidth: number, lanes: number): number {
  return projectedRoadWidth / Math.max(32, 8 * lanes);
}

/**
 * Draw one road segment as a trapezoid (near edge p1, far edge p2), plus its
 * grass fill, rumble strips and lane markers.
 */
export function renderSegment(
  ctx: CanvasRenderingContext2D,
  width: number,
  x1: number, y1: number, w1: number,
  x2: number, y2: number, w2: number,
  color: ColorSet,
): void {
  const r1 = rumbleWidth(w1, LANES);
  const r2 = rumbleWidth(w2, LANES);
  const l1 = laneMarkerWidth(w1, LANES);
  const l2 = laneMarkerWidth(w2, LANES);

  // grass spans the full width behind this slice of road
  ctx.fillStyle = color.grass;
  ctx.fillRect(0, y2, width, y1 - y2);

  // rumble strips
  polygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, color.rumble);
  polygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, color.rumble);

  // road surface
  polygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);

  // lane dividers
  if (color.lane) {
    const laneW1 = (w1 * 2) / LANES;
    const laneW2 = (w2 * 2) / LANES;
    let laneX1 = x1 - w1 + laneW1;
    let laneX2 = x2 - w2 + laneW2;
    for (let lane = 1; lane < LANES; lane++, laneX1 += laneW1, laneX2 += laneW2) {
      polygon(
        ctx,
        laneX1 - l1 / 2, y1,
        laneX1 + l1 / 2, y1,
        laneX2 + l2 / 2, y2,
        laneX2 - l2 / 2, y2,
        color.lane,
      );
    }
  }
}

/**
 * Draw a car sprite (rear view) standing on the road at (`cx`, `groundY`) with
 * drawn size `w` x `h`. Anything below `clip` (behind a hill) is masked out.
 */
export function renderCarSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  w: number,
  h: number,
  color: string,
  clip: number,
): void {
  const x = cx - w / 2;
  const y = groundY - h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ctx.canvas.width, clip);
  ctx.clip();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, w * 0.55, Math.max(1, h * 0.14), 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h * 0.82);

  // rear window
  ctx.fillStyle = 'rgba(10,12,20,0.6)';
  ctx.fillRect(x + w * 0.16, y + h * 0.08, w * 0.68, h * 0.4);

  // tail lights
  ctx.fillStyle = '#ff4433';
  ctx.fillRect(x + w * 0.06, y + h * 0.56, w * 0.16, h * 0.16);
  ctx.fillRect(x + w * 0.78, y + h * 0.56, w * 0.16, h * 0.16);

  ctx.restore();
}

/** Overlay fog on a band of the screen; `fog` of 1 draws nothing. */
export function renderFog(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  width: number, height: number,
  fog: number,
  fogColor: string,
): void {
  if (fog >= 1) return;
  ctx.globalAlpha = 1 - fog;
  ctx.fillStyle = fogColor;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
}
