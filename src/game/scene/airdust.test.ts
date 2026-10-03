import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AirDust, wrapAround } from './airdust';

describe('air dust', () => {
  it('wraps a mote back into the box about the camera', () => {
    expect(wrapAround(0, 0, 10)).toBe(0);
    expect(wrapAround(11, 0, 10)).toBe(-9);
    expect(wrapAround(-11, 0, 10)).toBe(9);
    expect(wrapAround(1005, 1000, 10)).toBe(1005);
    expect(wrapAround(1011, 1000, 10)).toBe(991);
  });

  it('stays within the box however far the camera goes', () => {
    const dust = new AirDust();
    const camera = new THREE.Vector3(0, 800, 0);
    for (let i = 0; i < 20; i++) {
      camera.x += 50_000;
      dust.update(1 / 60, camera, 1);
    }
    const p = dust.points.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      expect(Math.abs(p.getX(i) - camera.x)).toBeLessThanOrEqual(18 * 135 + 1);
    }
    dust.dispose();
  });

  it('is dark at night, where dust is not lit', () => {
    const dust = new AirDust();
    dust.update(1 / 60, new THREE.Vector3(), 0);
    expect((dust.points.material as THREE.PointsMaterial).opacity).toBe(0);
    dust.dispose();
  });
});
