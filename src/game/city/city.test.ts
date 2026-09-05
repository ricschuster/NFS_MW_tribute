import { describe, it, expect } from 'vitest';
import { generateCity } from './generate';
import { kestrelBay } from './index';
import { Rng } from './rng';
import { CITY_SEED, DISTRICTS } from '../constants';
import type { City, CityRoad, Rect } from './types';

const city = kestrelBay();

/** The rectangle a road's carriageway actually covers. */
function carriageway(city: City, road: CityRoad): Rect {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const half = road.width / 2;
  return {
    minX: Math.min(a.x, b.x) - (road.axis === 'x' ? 0 : half),
    maxX: Math.max(a.x, b.x) + (road.axis === 'x' ? 0 : half),
    minZ: Math.min(a.z, b.z) - (road.axis === 'z' ? 0 : half),
    maxZ: Math.max(a.z, b.z) + (road.axis === 'z' ? 0 : half),
  };
}

/** Overlap by more than `slack`, so touching kerb to kerb does not count. */
function overlaps(a: Rect, b: Rect, slack = 1): boolean {
  return (
    a.minX < b.maxX - slack &&
    b.minX < a.maxX - slack &&
    a.minZ < b.maxZ - slack &&
    b.minZ < a.maxZ - slack
  );
}

describe('Rng', () => {
  it('gives the same stream back for the same seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    const draw = (r: Rng) => [r.float(), r.float(), r.float()];
    expect(draw(a)).toEqual(draw(b));
  });

  it('stays inside [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateCity', () => {
  it('is a pure function of its seed', () => {
    expect(generateCity(CITY_SEED)).toEqual(generateCity(CITY_SEED));
  });

  it('generates a different city from a different seed', () => {
    const other = generateCity(CITY_SEED + 1);
    expect(other.roads.length).not.toBe(0);
    expect(other).not.toEqual(city);
  });

  it('never calls Math.random', () => {
    const real = Math.random;
    Math.random = () => {
      throw new Error('city generation must not use Math.random');
    };
    try {
      expect(() => generateCity(99)).not.toThrow();
    } finally {
      Math.random = real;
    }
  });

  it('builds a city of a plausible size', () => {
    expect(city.roads.length).toBeGreaterThan(200);
    expect(city.nodes.length).toBeGreaterThan(100);
    expect(city.blocks.length).toBeGreaterThan(100);
  });

  it('hands back the same pinned city every time', () => {
    expect(kestrelBay()).toBe(city);
    expect(kestrelBay().seed).toBe(CITY_SEED);
  });
});

describe('the street network', () => {
  it('keeps every node inside the city bounds', () => {
    for (const node of city.nodes) {
      expect(node.pos.x).toBeGreaterThanOrEqual(city.bounds.minX);
      expect(node.pos.x).toBeLessThanOrEqual(city.bounds.maxX);
      expect(node.pos.z).toBeGreaterThanOrEqual(city.bounds.minZ);
      expect(node.pos.z).toBeLessThanOrEqual(city.bounds.maxZ);
    }
  });

  it('gives every road two distinct ends and a real length', () => {
    for (const road of city.roads) {
      expect(road.a).not.toBe(road.b);
      expect(road.length).toBeGreaterThan(0);
      expect(road.width).toBeGreaterThan(0);
      expect(road.speed).toBeGreaterThan(0);
    }
  });

  it('runs each road along its stated axis, from the lower end', () => {
    for (const road of city.roads) {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      if (road.axis === 'x') {
        expect(b.z).toBeCloseTo(a.z, 3);
        expect(b.x).toBeGreaterThan(a.x);
      } else {
        expect(b.x).toBeCloseTo(a.x, 3);
        expect(b.z).toBeGreaterThan(a.z);
      }
      expect(road.length).toBeCloseTo(Math.hypot(b.x - a.x, b.z - a.z), 3);
    }
  });

  it('links roads and nodes both ways', () => {
    for (const road of city.roads) {
      expect(city.nodes[road.a].roads).toContain(road.id);
      expect(city.nodes[road.b].roads).toContain(road.id);
    }
    for (const node of city.nodes) {
      expect(node.roads.length).toBeGreaterThan(0);
      for (const id of node.roads) {
        expect([city.roads[id].a, city.roads[id].b]).toContain(node.id);
      }
    }
  });

  it('has no duplicate roads between the same pair of nodes', () => {
    const seen = new Set<string>();
    for (const road of city.roads) {
      const key = `${road.a}-${road.b}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  // The point of laying arterials edge to edge first: you can drive from
  // anywhere to anywhere, and no seed can strand a district.
  it('is one connected network you can drive across', () => {
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const node = city.nodes[queue.pop() as number];
      for (const id of node.roads) {
        const road = city.roads[id];
        const next = road.a === node.id ? road.b : road.a;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(city.nodes.length);
  });

  it('runs arterials right across the city', () => {
    const arterials = city.roads.filter((r) => r.class === 'arterial');
    expect(arterials.length).toBeGreaterThan(0);
    // Each arterial line is cut into pieces, but the pieces must reach both edges.
    const spanning = (axis: 'x' | 'z') => {
      const lines = new Map<number, { min: number; max: number }>();
      for (const road of arterials.filter((r) => r.axis === axis)) {
        const a = city.nodes[road.a].pos;
        const b = city.nodes[road.b].pos;
        const at = axis === 'x' ? a.z : a.x;
        const lo = axis === 'x' ? Math.min(a.x, b.x) : Math.min(a.z, b.z);
        const hi = axis === 'x' ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
        const line = lines.get(at) ?? { min: Infinity, max: -Infinity };
        lines.set(at, { min: Math.min(line.min, lo), max: Math.max(line.max, hi) });
      }
      return lines;
    };
    for (const [, line] of spanning('x')) {
      expect(line.min).toBeCloseTo(city.bounds.minX, 3);
      expect(line.max).toBeCloseTo(city.bounds.maxX, 3);
    }
    for (const [, line] of spanning('z')) {
      expect(line.min).toBeCloseTo(city.bounds.minZ, 3);
      expect(line.max).toBeCloseTo(city.bounds.maxZ, 3);
    }
  });
});

describe('districts', () => {
  it('places all four kinds', () => {
    const kinds = new Set(city.superblocks.map((s) => s.district));
    expect([...kinds].sort()).toEqual(['downtown', 'industrial', 'midtown', 'waterfront']);
  });

  it('puts the waterfront on the shore', () => {
    const waterfront = city.superblocks.filter((s) => s.district === 'waterfront');
    for (const cell of waterfront) {
      expect(cell.bounds.maxZ).toBeCloseTo(city.shoreZ, 3);
    }
  });

  it('gives each district its own street character', () => {
    for (const road of city.roads) {
      if (road.class === 'arterial') continue;
      const character = DISTRICTS[road.district];
      expect(road.lanes).toBe(character.lanes);
      expect(road.speed).toBe(character.speed);
    }
  });

  // Block size is what makes a district read as a place, so it has to survive
  // generation: downtown blocks must actually come out smaller than industrial ones.
  it('builds smaller blocks downtown than out on the industrial edge', () => {
    const area = (kind: string) => {
      const blocks = city.blocks.filter((b) => b.district === kind);
      const total = blocks.reduce(
        (sum, b) => sum + (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxZ - b.bounds.minZ),
        0,
      );
      return total / blocks.length;
    };
    expect(area('downtown')).toBeLessThan(area('midtown'));
    expect(area('midtown')).toBeLessThan(area('industrial'));
  });
});

describe('blocks', () => {
  it('gives every block a positive area inside the city', () => {
    for (const b of city.blocks) {
      expect(b.bounds.maxX).toBeGreaterThan(b.bounds.minX);
      expect(b.bounds.maxZ).toBeGreaterThan(b.bounds.minZ);
      expect(b.bounds.minX).toBeGreaterThanOrEqual(city.bounds.minX);
      expect(b.bounds.maxX).toBeLessThanOrEqual(city.bounds.maxX);
      expect(b.bounds.minZ).toBeGreaterThanOrEqual(city.bounds.minZ);
      expect(b.bounds.maxZ).toBeLessThanOrEqual(city.bounds.maxZ);
    }
  });

  it('never overlaps another block', () => {
    for (let i = 0; i < city.blocks.length; i++) {
      for (let j = i + 1; j < city.blocks.length; j++) {
        expect(overlaps(city.blocks[i].bounds, city.blocks[j].bounds)).toBe(false);
      }
    }
  });

  // #84 extrudes buildings from these and #86 keeps the car out of them, so a
  // block that eats into a carriageway is a building standing in the road.
  it('never overlaps a carriageway', () => {
    const roads = city.roads.map((r) => carriageway(city, r));
    for (const block of city.blocks) {
      for (const road of roads) {
        expect(overlaps(block.bounds, road)).toBe(false);
      }
    }
  });
});
