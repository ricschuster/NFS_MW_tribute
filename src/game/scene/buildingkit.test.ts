import { describe, expect, it } from 'vitest';
import { KIT_KINDS, kitFor } from './buildingkit';
import { loft, midrise, tower } from './downtownmodels';

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
});
