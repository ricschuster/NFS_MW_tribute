import * as THREE from 'three';

const point = new THREE.Vector3();

/**
 * How much of the screen's height a box takes up, as a fraction of it, seen
 * through `camera` as last updated: 0 when it is out of view. For the
 * telemetry recorder (#347) and `npm run trafficview` (#348), which count a
 * vehicle as on screen only once it is as big as the smallest one the
 * reference game's detector found.
 *
 * The box is `w` wide, `l` long and `h` tall, standing on `y` and turned to
 * `heading`. Corners behind the camera are dropped, and what is left is
 * clipped to the frame, so a car half off the edge counts for the half that is
 * on it. Its own module, not a `CityView` method, so a probe with no renderer
 * can ask the same question of a camera it placed itself.
 */
export function screenHeight(
  camera: THREE.PerspectiveCamera,
  x: number,
  y: number,
  z: number,
  heading: number,
  w: number,
  l: number,
  h: number,
): number {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let top = -Infinity;
  let bottom = Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const along of [-l / 2, l / 2]) {
    for (const across of [-w / 2, w / 2]) {
      for (const up of [0, h]) {
        const p = point.set(x + fx * along + fz * across, y + up, z + fz * along - fx * across);
        p.applyMatrix4(camera.matrixWorldInverse);
        if (p.z > -camera.near) continue;
        p.applyMatrix4(camera.projectionMatrix);
        top = Math.max(top, p.y);
        bottom = Math.min(bottom, p.y);
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
      }
    }
  }
  if (top < -1 || bottom > 1 || right < -1 || left > 1 || top === -Infinity) return 0;
  return (Math.min(1, top) - Math.max(-1, bottom)) / 2;
}
