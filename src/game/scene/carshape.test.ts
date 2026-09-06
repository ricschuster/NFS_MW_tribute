import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { carParts } from './carshape';
import { makeCar } from './cars';

const WIDTH = 650;
const ASPECT = 0.7;

/** The world-space box of a mesh, with its own position applied. */
function boxOf(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh);
}

describe('the shape of a car', () => {
  it('stands on its wheels', () => {
    const { body, wheels } = carParts(WIDTH, ASPECT);
    for (const wheel of wheels) {
      const box = boxOf(wheel);
      // Touching the road, not floating over it and not sunk into it.
      expect(box.min.y).toBeGreaterThan(-1);
      expect(box.min.y).toBeLessThan(WIDTH * 0.02);
    }
    // And the body is clear of the road, which is the difference between a
    // car and a box with wheels drawn beside it.
    expect(boxOf(body).min.y).toBeGreaterThan(0);
  });

  it('keeps its wheels under its body', () => {
    const { body, wheels } = carParts(WIDTH, ASPECT);
    const half = boxOf(body).max.x;
    for (const wheel of wheels) {
      const box = boxOf(wheel);
      // A little proud of the flank is a stance; a lot is an off-roader.
      expect(box.max.x).toBeLessThan(half * 1.2);
      expect(Math.abs(box.max.z)).toBeLessThan(boxOf(body).max.z);
    }
  });

  it('is a wedge, nose down', () => {
    const { body } = carParts(WIDTH, ASPECT);
    const pos = body.geometry.attributes.position as THREE.BufferAttribute;
    let nose = -Infinity;
    let tail = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.z > 0) nose = Math.max(nose, v.y);
      else tail = Math.max(tail, v.y);
    }
    expect(nose).toBeLessThan(tail);
  });

  it('puts the glass above the body and inside it', () => {
    const { body, glass } = carParts(WIDTH, ASPECT);
    const b = boxOf(body);
    const g = boxOf(glass);
    expect(g.max.y).toBeGreaterThan(b.max.y);
    expect(g.max.x).toBeLessThan(b.max.x);
  });

  it('scales entirely off its width', () => {
    const small = carParts(100, ASPECT);
    const big = carParts(400, ASPECT);
    expect(big.length / small.length).toBeCloseTo(4, 6);
    expect(boxOf(big.body).max.y / boxOf(small.body).max.y).toBeCloseTo(4, 6);
  });
});

describe('an assembled car', () => {
  // `CarPool.place` repaints `children[0]` for every car on screen every
  // frame, so the body being first is load-bearing rather than incidental.
  it('has its body first, so the pool can repaint it', () => {
    const car = makeCar('#ff0000');
    const body = car.children[0] as THREE.Mesh;
    expect(body.isMesh).toBe(true);
    expect(
      (body.material as THREE.MeshLambertMaterial).color.getHexString(),
    ).toBe('ff0000');
  });

  it('gives a cop a lightbar, on the roof it actually has', () => {
    const car = makeCar('#223344', true);
    const bar = car.getObjectByName('lightbar');
    expect(bar).toBeDefined();
    const glass = car.children[1] as THREE.Mesh;
    expect(bar!.position.y).toBeGreaterThan(boxOf(glass).min.y);
  });
});
