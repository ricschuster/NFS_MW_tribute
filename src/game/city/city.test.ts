import { describe, it, expect } from 'vitest';
import { generateCity } from './generate';
import { kestrelBay } from './index';
import { Rng } from './rng';
import { CITY_SEED, DISTRICTS } from '../constants';
import { makeWater } from './water';
import type { City, CityRoad, Rect } from './types';

// The same water the pinned city was cut against: `makeWater` is the first
// thing generation draws from the seed, so a fresh Rng reproduces it exactly.
const water = makeWater(new Rng(CITY_SEED), kestrelBay().bounds);

const touchesWater = (r: Rect) => {
  for (const x of [r.minX, (r.minX + r.maxX) / 2, r.maxX]) {
    for (const z of [r.minZ, (r.minZ + r.maxZ) / 2, r.maxZ]) {
      if (water.isWater(x, z)) return true;
    }
  }
  return false;
};

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

/**
 * A uniform grid over the map, so "what is near this rectangle" does not mean
 * "compare it against everything". ADR-0005 called this out: at 20 km² the
 * all-pairs versions of the tests below take longer than the whole suite.
 */
const BUCKET = 400 * 135; // ~400 m, a few blocks across
function index(items: Rect[]): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  items.forEach((r, id) => {
    for (let gx = Math.floor(r.minX / BUCKET); gx <= Math.floor(r.maxX / BUCKET); gx++) {
      for (let gz = Math.floor(r.minZ / BUCKET); gz <= Math.floor(r.maxZ / BUCKET); gz++) {
        const k = `${gx}|${gz}`;
        const cell = grid.get(k);
        if (cell) cell.push(id);
        else grid.set(k, [id]);
      }
    }
  });
  return grid;
}

/** The ids whose bucket any part of `r` falls in. */
function near(grid: Map<string, number[]>, r: Rect): Set<number> {
  const found = new Set<number>();
  for (let gx = Math.floor(r.minX / BUCKET); gx <= Math.floor(r.maxX / BUCKET); gx++) {
    for (let gz = Math.floor(r.minZ / BUCKET); gz <= Math.floor(r.maxZ / BUCKET); gz++) {
      for (const id of grid.get(`${gx}|${gz}`) ?? []) found.add(id);
    }
  }
  return found;
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

  it('carries most of the city on arterials that cross it', () => {
    const arterials = city.roads.filter((r) => r.class === 'arterial');
    expect(arterials.length).toBeGreaterThan(0);
    // Water cuts arterials short, so they no longer all reach both edges. What
    // has to stay true is that each line still crosses most of the map: an
    // arterial reduced to a stub is a skeleton that is not holding anything up.
    const reach = (axis: 'x' | 'z') => {
      const lines = new Map<number, number>();
      for (const road of arterials.filter((r) => r.axis === axis)) {
        lines.set(road.axis === 'x' ? city.nodes[road.a].pos.z : city.nodes[road.a].pos.x,
          (lines.get(road.axis === 'x' ? city.nodes[road.a].pos.z : city.nodes[road.a].pos.x) ?? 0) + road.length);
      }
      return [...lines.values()];
    };
    const width = city.bounds.maxX - city.bounds.minX;
    const depth = city.bounds.maxZ - city.bounds.minZ;
    const crossing = (lengths: number[], full: number) =>
      lengths.filter((l) => l > full * 0.6).length;
    expect(crossing(reach('x'), width)).toBeGreaterThanOrEqual(4);
    expect(crossing(reach('z'), depth)).toBeGreaterThanOrEqual(4);
  });
});

describe('districts', () => {
  it('places all four kinds', () => {
    const kinds = new Set(city.superblocks.map((s) => s.district));
    expect([...kinds].sort()).toEqual(['downtown', 'industrial', 'midtown', 'waterfront']);
  });

  it('puts every waterfront district on the water', () => {
    const waterfront = city.superblocks.filter((s) => s.district === 'waterfront');
    expect(waterfront.length).toBeGreaterThan(0);
    for (const cell of waterfront) {
      expect(touchesWater(cell.bounds)).toBe(true);
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

describe('water', () => {
  it('generates a bay and a river with real outlines', () => {
    expect(city.water.map((w) => w.kind).sort()).toEqual(['bay', 'river']);
    for (const body of city.water) {
      expect(body.outline.length).toBeGreaterThan(10);
    }
  });

  // The cut is the whole point of ADR-0005: the network is generated over the
  // map and then clipped, so a road left standing in the bay means it did not
  // happen. Bridges are the deliberate exception.
  it('never leaves a road in the water unless it is a bridge', () => {
    const wet: string[] = [];
    for (const road of city.roads) {
      if (road.bridge) continue;
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      for (let i = 0; i <= 10; i++) {
        const x = a.x + ((b.x - a.x) * i) / 10;
        const z = a.z + ((b.z - a.z) * i) / 10;
        if (water.isWater(x, z)) wet.push(`road ${road.id} at ${Math.round(x)},${Math.round(z)}`);
      }
    }
    expect(wet.slice(0, 5)).toEqual([]);
  });

  it('only calls a road a bridge where it actually crosses water', () => {
    const bridges = city.roads.filter((r) => r.bridge);
    expect(bridges.length).toBeGreaterThan(0);
    for (const road of bridges) {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      expect(water.isWater((a.x + b.x) / 2, (a.z + b.z) / 2)).toBe(true);
    }
  });

  it('keeps the crossings few, so they are chokepoints', () => {
    const crossings = city.roads.filter((r) => r.bridge).length;
    expect(crossings).toBeGreaterThan(0);
    expect(crossings).toBeLessThan(12);
  });

  it('never puts a block in the water', () => {
    const wet = city.blocks.filter((b) => touchesWater(b.bounds));
    expect(wet.length).toBe(0);
  });
});

// The repair pass (ADR-0005 rule 3) exists because cutting a network against
// water can strand a district, and no one seed proves it does not. So sweep.
describe('every seed makes a drivable city', () => {
  const seeds = [1, 2, 7, 42, 777, 5150, 123456, 0x4b657374];
  for (const seed of seeds) {
    it(`seed ${seed} is connected, complete and on land`, () => {
      const c = generateCity(seed);

      const seen = new Set<number>([0]);
      const queue = [0];
      while (queue.length > 0) {
        const node = c.nodes[queue.pop() as number];
        for (const id of node.roads) {
          const road = c.roads[id];
          const next = road.a === node.id ? road.b : road.a;
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(c.nodes.length);

      expect(new Set(c.superblocks.map((s) => s.district)).size).toBe(4);
      expect(c.roads.length).toBeGreaterThan(500);
      expect(c.blocks.length).toBeGreaterThan(200);
    });
  }
});

describe('buildings', () => {
  it('puts buildings on the city', () => {
    expect(city.buildings.length).toBeGreaterThan(1000);
  });

  it('gives every building a real footprint and height', () => {
    for (const b of city.buildings) {
      expect(b.footprint.maxX).toBeGreaterThan(b.footprint.minX);
      expect(b.footprint.maxZ).toBeGreaterThan(b.footprint.minZ);
      expect(b.height).toBeGreaterThan(0);
      expect(b.variant).toBeGreaterThanOrEqual(0);
      expect(b.variant).toBeLessThan(1);
    }
  });

  // Buildings are the reason blocks are kept clear of the carriageway, so a
  // building outside its block is a building in the road.
  it('keeps every building inside a block', () => {
    const grid = index(city.blocks.map((b) => b.bounds));
    const escaped: string[] = [];
    for (const b of city.buildings) {
      const inside = [...near(grid, b.footprint)].some((id) => {
        const block = city.blocks[id].bounds;
        return (
          b.footprint.minX >= block.minX - 1 &&
          b.footprint.maxX <= block.maxX + 1 &&
          b.footprint.minZ >= block.minZ - 1 &&
          b.footprint.maxZ <= block.maxZ + 1
        );
      });
      if (!inside) escaped.push(`${Math.round(b.footprint.minX)},${Math.round(b.footprint.minZ)}`);
    }
    expect(escaped.slice(0, 5)).toEqual([]);
  });

  it('never puts a building in the water', () => {
    expect(city.buildings.filter((b) => touchesWater(b.footprint)).length).toBe(0);
  });

  // Districts have to be visibly different places, and height is most of what
  // does that: a downtown that is the same height as the docks is not downtown.
  it('builds downtown taller than anywhere else', () => {
    const mean = (kind: string) => {
      const heights = city.buildings.filter((b) => b.district === kind).map((b) => b.height);
      return heights.reduce((s, h) => s + h, 0) / heights.length;
    };
    expect(mean('downtown')).toBeGreaterThan(mean('midtown'));
    expect(mean('midtown')).toBeGreaterThan(mean('industrial'));
  });

  it('leaves the tall buildings rare', () => {
    const downtown = city.buildings.filter((b) => b.district === 'downtown');
    const heights = downtown.map((b) => b.height).sort((a, b) => a - b);
    const median = heights[Math.floor(heights.length / 2)];
    const tallest = heights[heights.length - 1];
    expect(tallest).toBeGreaterThan(median * 2);
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
    const bounds = city.blocks.map((b) => b.bounds);
    const grid = index(bounds);
    const clashes: string[] = [];
    for (let i = 0; i < bounds.length; i++) {
      for (const j of near(grid, bounds[i])) {
        if (j > i && overlaps(bounds[i], bounds[j])) clashes.push(`${i} overlaps ${j}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  // #84 extrudes buildings from these and #86 keeps the car out of them, so a
  // block that eats into a carriageway is a building standing in the road.
  it('never overlaps a carriageway', () => {
    const roads = city.roads.map((r) => carriageway(city, r));
    const grid = index(roads);
    const clashes: string[] = [];
    for (const block of city.blocks) {
      for (const id of near(grid, block.bounds)) {
        if (overlaps(block.bounds, roads[id])) clashes.push(`block over road ${id}`);
      }
    }
    expect(clashes).toEqual([]);
  });
});
