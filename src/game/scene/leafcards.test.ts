import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LEAF_KIND_BY_PIECE, isTrunk, leafGeometries, leafMaterial } from './leafcards';

describe('leaf-card trees', () => {
  it('builds the same cards every time', () => {
    const a = leafGeometries('conifer').map((g) => Array.from(g.attributes.position.array));
    const b = leafGeometries('conifer').map((g) => Array.from(g.attributes.position.array));
    expect(a).toEqual(b);
  });

  it('keeps a tree within its old envelope, in metres', () => {
    for (const kind of ['conifer', 'broadleaf'] as const) {
      const box = new THREE.Box3();
      for (const g of leafGeometries(kind)) {
        g.computeBoundingBox();
        box.union(g.boundingBox!);
      }
      expect(box.min.y).toBeGreaterThan(-0.5);
      expect(box.max.y).toBeLessThan(13);
      expect(Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z)).toBeLessThan(6);
    }
  });

  it('is a cutout, drawn from both sides', () => {
    const m = leafMaterial('broadleaf');
    expect(m.alphaTest).toBeGreaterThan(0);
    expect(m.side).toBe(THREE.DoubleSide);
  });

  it('covers every tree the set pieces draw', () => {
    expect(Object.keys(LEAF_KIND_BY_PIECE).sort()).toEqual(['street-tree', 'tree', 'tree:broadleaf']);
    expect(isTrunk('#4a3526')).toBe(true);
    expect(isTrunk('#2e5234')).toBe(false);
  });
});
