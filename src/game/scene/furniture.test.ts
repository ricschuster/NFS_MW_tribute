import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { StreetFurniture } from './furniture';
import { LAMP_REACH } from '../constants';
import type { StreetProp } from '../city/types';

/**
 * A lamp's arm has to reach over the road and not into the building behind
 * it, and there is nothing in a static screenshot that says which of those
 * happened - both look like a lamp with an arm until you notice the head is
 * inside a wall. The direction comes from `reach`, and getting its sign or
 * its axis wrong is a silent, city-wide error.
 */
function lamp(over: Partial<StreetProp> = {}): StreetProp {
  return { at: { x: 0, z: 0 }, y: 0, angle: 0, reach: 1, kind: 'lamp', variant: 0.5, ...over };
}

/** The world position of instance 0 of a named mesh. */
function firstAt(furniture: StreetFurniture, name: string): THREE.Vector3 {
  const mesh = furniture.meshes.find((m) => m.name === name);
  if (!mesh) throw new Error(`no mesh named ${name}`);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

describe('a street lamp', () => {
  // angle 0 means the street runs along +z, so across it is x.
  it('reaches out over the road, the way the prop says', () => {
    const right = new StreetFurniture([lamp({ reach: 1 })]);
    const left = new StreetFurniture([lamp({ reach: -1 })]);
    expect(firstAt(right, 'lamp-heads').x).toBeCloseTo(LAMP_REACH, 4);
    expect(firstAt(left, 'lamp-heads').x).toBeCloseTo(-LAMP_REACH, 4);
    // And the post itself stays on the kerb where the city put it.
    expect(firstAt(right, 'lamp-posts').x).toBeCloseTo(0, 4);
  });

  it('reaches across the street it stands beside, not along it', () => {
    // A street running along +x: the arm has to move in z.
    const along = new StreetFurniture([lamp({ angle: Math.PI / 2, reach: 1 })]);
    const head = firstAt(along, 'lamp-heads');
    expect(Math.abs(head.z)).toBeCloseTo(LAMP_REACH, 4);
    expect(head.x).toBeCloseTo(0, 4);
  });

  it('hangs its head off the end of its arm', () => {
    const one = new StreetFurniture([lamp()]);
    const arm = firstAt(one, 'lamp-arms');
    const head = firstAt(one, 'lamp-heads');
    // The arm is placed at its midpoint, so the head is twice as far out.
    expect(head.x).toBeCloseTo(arm.x * 2, 4);
    expect(head.y).toBeLessThan(arm.y + 1);
  });

  it('leaves a prop with no side to it where it stands', () => {
    const sign: StreetProp = {
      at: { x: 500, z: -300 },
      y: 0,
      angle: 0.7,
      reach: 0,
      kind: 'sign',
      variant: 0,
    };
    const at = firstAt(new StreetFurniture([sign]), 'sign-plates');
    expect(at.x).toBeCloseTo(500, 4);
    expect(at.z).toBeCloseTo(-300, 4);
  });
});
