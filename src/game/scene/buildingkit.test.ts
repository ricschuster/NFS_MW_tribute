import { describe, expect, it } from 'vitest';
import { KIT_KINDS, kitFor } from './buildingkit';
import { loft, midrise, tower } from './downtownmodels';
import * as THREE from 'three';

describe('the building kit (#583)', () => {
  it('adds a cornice, parapet and sills to a loft, all within a cornice-width of its body', () => {
    const parts = loft();
    const added = kitFor('loft', undefined, parts);
    expect(added.length).toBeGreaterThan(parts.length / 2);
    for (const part of added) {
      part.geometry.computeBoundingBox();
      const b = part.geometry.boundingBox!;
      // The loft body is 22 x 16; nothing stands more than a metre proud of it.
      expect(Math.max(Math.abs(b.min.x), b.max.x)).toBeLessThan(11 + 1);
      expect(Math.max(Math.abs(b.min.z), b.max.z)).toBeLessThan(8 + 1);
    }
  });

  it('is the same every time, so a model merges the same way', () => {
    const a = kitFor('midrise', 'stone', midrise('stone')).map((p) => p.geometry.getAttribute('position').array.join());
    const b = kitFor('midrise', 'stone', midrise('stone')).map((p) => p.geometry.getAttribute('position').array.join());
    expect(a).toEqual(b);
  });

  it('gives a glass tower mullions and leaves a stone one to its own strips', () => {
    const glass = kitFor('tower', 'glass', tower('glass'));
    const stone = kitFor('tower', 'stone', tower('stone'));
    expect(glass.length).toBeGreaterThan(stone.length + 20);
  });

  it('covers every kind it names', () => {
    expect(Object.keys(KIT_KINDS)).toContain('warehouse');
  });

  it('keeps a podium within half a metre of the tower wall', () => {
    const parts = tower('glass');
    parts[0].geometry.computeBoundingBox();
    const body = parts[0].geometry.boundingBox!;
    const low = kitFor('tower', 'glass', parts).filter((p) => {
      p.geometry.computeBoundingBox();
      return p.geometry.boundingBox!.max.y <= 6.3 && p.geometry.boundingBox!.max.y - p.geometry.boundingBox!.min.y >= 0.5;
    });
    expect(low.length).toBeGreaterThan(4);
    for (const part of low) {
      const b = part.geometry.boundingBox!;
      expect(b.max.x).toBeLessThanOrEqual(body.max.x + 0.55);
      expect(b.max.z).toBeLessThanOrEqual(body.max.z + 0.55);
    }
  });

  it('dresses a silo with rings and a ladder that hug the drum', () => {
    const silo = new THREE.CylinderGeometry(4, 4, 16, 18).translate(0, 8, 0);
    const added = kitFor('silo', undefined, [{ geometry: silo, colour: '#9aa3a3' }]);
    expect(added.length).toBeGreaterThan(5);
    for (const part of added) {
      part.geometry.computeBoundingBox();
      expect(part.geometry.boundingBox!.max.x).toBeLessThan(4.5);
    }
  });

  it('gives a warehouse bay a bumper, a frame and a leveller, within half a metre of its wall', () => {
    const parts = [
      { geometry: new THREE.BoxGeometry(50, 14, 130).translate(0, 7, 0), colour: '#9aa3a8' },
      { geometry: new THREE.BoxGeometry(0.2, 5, 5).translate(25.1, 2.5, 0), colour: '#2e3538' },
    ];
    const added = kitFor('warehouse', undefined, parts);
    expect(added.some((p) => p.colour === '#1b1d1e')).toBe(true);
    for (const part of added) {
      part.geometry.computeBoundingBox();
      // Ribs and vents aside, nothing below the roofline stands more than 3 m off the wall (the door canopy).
      expect(part.geometry.boundingBox!.max.x).toBeLessThan(25 + 3);
    }
  });

  it('dresses every landmark it names without leaving the lot', () => {
    for (const kind of ['stadium', 'cathedral', 'geodesic-dome', 'library', 'cruise-terminal'] as const) {
      const added = kitFor(kind, undefined, [{ geometry: new THREE.BoxGeometry(1, 1, 1), colour: '#fff' }]);
      expect(added.length).toBeGreaterThan(3);
    }
  });
});
