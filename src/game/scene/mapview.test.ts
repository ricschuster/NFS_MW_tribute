import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toMap } from './mapping';

/**
 * Which way round a top-down map goes.
 *
 * Settled by arithmetic rather than by looking, for the same reason #182 was:
 * the coloured line on a map is usually *a* road, so a mirrored map still
 * looks like a map of the city, and the only thing that gives it away is
 * turning a corner and finding the turn on the other side.
 *
 * The question is what the driver sees. A camera behind the car looking along
 * its heading has a right-hand side, and the map has a right-hand side, and
 * they have to be the same side.
 */
describe('which way the world is drawn', () => {
  /** Where a world point lands on screen, from a camera behind the car. */
  function onScreen(heading: number, point: { x: number; z: number }): number {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 1, 100000);
    // Behind the car, looking along its heading - the chase camera's frame.
    camera.position.set(-Math.sin(heading) * 100, 20, -Math.cos(heading) * 100);
    camera.lookAt(new THREE.Vector3(Math.sin(heading) * 100, 0, Math.cos(heading) * 100));
    camera.updateMatrixWorld();
    const projected = new THREE.Vector3(point.x, 0, point.z).project(camera);
    return projected.x; // negative is the left of the screen, positive the right
  }

  /** Where the same point lands on a map centred on the car. */
  const onMap = (point: { x: number; z: number }) => toMap(point, { x: 0, z: 0 }).x;

  // The car faces +z, which is up a north-up map. A landmark at +x is then
  // either to its left or to its right, and the 3D view and the map have to
  // agree about which.
  it('puts a landmark on the same side in the view and on the map', () => {
    const east = { x: 400, z: 0 };
    // Both negative, or both positive. The sign is the whole assertion.
    expect(Math.sign(onMap(east))).toBe(Math.sign(onScreen(0, east)));
  });

  it('puts what is ahead of you up the map', () => {
    const ahead = { x: 0, z: 400 };
    expect(toMap(ahead, { x: 0, z: 0 }).y).toBeLessThan(0);
  });

  // A heading-up map rotates by *plus* the heading, and that is only right
  // once the mirror is there: with the old un-mirrored plotting it had to be
  // minus, which is what #182 arrived at and why the mirror survived it.
  it('turns with the car, so what is ahead stays up', () => {
    for (const heading of [0, 0.9, Math.PI / 2, 2.4, Math.PI, -1.1]) {
      const ahead = { x: Math.sin(heading) * 400, z: Math.cos(heading) * 400 };
      const local = toMap(ahead, { x: 0, z: 0 });
      // Rotating map coordinates by +heading, as the minimap does.
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const y = local.x * sin + local.y * cos;
      const x = local.x * cos - local.y * sin;
      expect(y).toBeLessThan(0); // up the screen
      expect(Math.abs(x)).toBeLessThan(1); // and straight up it
    }
  });
});
