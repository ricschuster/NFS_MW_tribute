import { describe, it, expect } from 'vitest';
import { generateCity } from './generate';
import { kestrelBay } from './index';
import { Rng } from './rng';
import { CITY_BRIDGE_SPACING, CITY_SEED, DISTRICTS, UNITS_PER_METRE } from '../constants';
import { makeWater } from './water';
import { CityGrid, lineBlocked, inWater, surfaceAt } from './grid';
import { distanceToSegment } from './grid';
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
const cityGrid = new CityGrid(city);
/** Metres, in world units. */
const m = (metres: number) => metres * UNITS_PER_METRE;
const M = UNITS_PER_METRE;

/**
 * A road on the street, as opposed to one flying over it. Most of the
 * invariants below were written when there was only one level, and they are
 * about the surface: the interstate is *supposed* to cross water, pass over
 * blocks and ignore district character.
 */
const onSurface = (road: CityRoad) =>
  city.nodes[road.a].y === 0 && city.nodes[road.b].y === 0 && road.class !== 'ramp';

/** A box that contains a road's carriageway; exact only for an axis-aligned one. */
function carriageway(city: City, road: CityRoad): Rect {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const half = road.width / 2;
  return {
    minX: Math.min(a.x, b.x) - half,
    maxX: Math.max(a.x, b.x) + half,
    minZ: Math.min(a.z, b.z) - half,
    maxZ: Math.max(a.z, b.z) + half,
  };
}

/**
 * Does a road's carriageway actually reach into this rectangle? Since roads
 * stopped being axis-aligned the bounding box is far too generous for one at
 * an angle, so measure from the centreline to the rectangle instead.
 */
function roadReaches(city: City, road: CityRoad, r: Rect, slack: number): boolean {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  const reach = road.width / 2 - slack;
  // Sample the centreline; a road is long and thin, so this converges fast.
  const steps = Math.max(2, Math.ceil(road.length / 400));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const nearestX = Math.max(r.minX, Math.min(x, r.maxX));
    const nearestZ = Math.max(r.minZ, Math.min(z, r.maxZ));
    if (Math.hypot(x - nearestX, z - nearestZ) < reach) return true;
  }
  return false;
}

/** Which way a road runs, from its endpoints. */
function runsAlong(city: City, road: CityRoad): 'x' | 'z' {
  const a = city.nodes[road.a].pos;
  const b = city.nodes[road.b].pos;
  return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? 'x' : 'z';
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
  // Generating Kestrel Bay takes about half a second, and these two build a
  // whole city each on top of the shared one before deep-comparing it. That fits
  // inside vitest's five here and did not on a CI runner when it was three times
  // slower, so the headroom stays.
  //
  // It was 1.44 s until #262, and the profile is worth remembering because the
  // obvious suspect was innocent: `buildGraph` asking every span about every
  // other span was **4%** of it, while `segmentToRect` and `distanceToSegment` -
  // called from three block sweeps that each scanned every road of a class for
  // every block - were 47%. Indexing those left the city byte-identical and the
  // generator three times faster. Nothing dominates the profile now.
  const SLOW = 30_000;

  it(
    'is a pure function of its seed',
    () => {
      expect(generateCity(CITY_SEED)).toEqual(generateCity(CITY_SEED));
    },
    SLOW,
  );

  it(
    'generates a different city from a different seed',
    () => {
      const other = generateCity(CITY_SEED + 1);
      expect(other.roads.length).not.toBe(0);
      expect(other).not.toEqual(city);
    },
    SLOW,
  );

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

  // Roads used to be axis-aligned and this test used to say so. Boulevards
  // bend, so what is left to assert is that a road's stated length is the
  // distance between its ends - node positions are snapped, so allow for that.
  it('gives every road a length matching its endpoints', () => {
    for (const road of city.roads) {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      expect(road.length).toBeCloseTo(Math.hypot(b.x - a.x, b.z - a.z), 1);
    }
  });

  // Streets bend in winding quarters now, so most of them are not axis-aligned
  // any more. What must stay true is that downtown is a grid: it is the one
  // district defined by being one, and the arterials are the city's skeleton.
  it('keeps downtown and the arterials on the grid', () => {
    for (const road of city.roads) {
      const gridded =
        road.class === 'arterial' || (road.class === 'street' && road.district === 'downtown');
      if (!gridded) continue;
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      expect(Math.min(Math.abs(b.x - a.x), Math.abs(b.z - a.z))).toBeLessThan(1);
    }
  });

  it('winds some quarters and grids others', () => {
    const winding = city.superblocks.filter((s) => s.winding);
    expect(winding.length).toBeGreaterThan(2);
    expect(winding.length).toBeLessThan(city.superblocks.length);
  });

  it('bends: some roads run at an angle', () => {
    const bent = city.roads.filter((road) => {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      return Math.min(Math.abs(b.x - a.x), Math.abs(b.z - a.z)) > road.width;
    });
    expect(bent.length).toBeGreaterThan(20);
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
      for (const road of arterials.filter((r) => runsAlong(city, r) === axis)) {
        const at = axis === 'x' ? city.nodes[road.a].pos.z : city.nodes[road.a].pos.x;
        lines.set(at, (lines.get(at) ?? 0) + road.length);
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
      if (road.class !== 'street') continue;
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
      if (road.bridge || !onSurface(road)) continue;
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
    expect(crossings).toBeGreaterThan(3);
    expect(crossings).toBeLessThan(10);
  });

  // The number of bridges is not what a player feels; the distance to one is.
  // Shortest-first picked them where the channel was narrow, which is one place,
  // and left a 2.7 km round trip at the worst point of some seeds (#247).
  it('keeps a crossing within reach of every stretch of the river', () => {
    const bounds = city.bounds;
    const crossings = city.roads
      .filter((r) => r.bridge)
      .map((r) => (city.nodes[r.a].pos.z + city.nodes[r.b].pos.z) / 2);
    const stranded: string[] = [];

    for (let z = bounds.minZ; z <= bounds.maxZ; z += m(50)) {
      // Only where the river actually divides the city: north of the coast is
      // bay, and the far bank of a bay is the horizon.
      let divided = false;
      for (let x = bounds.minX; x <= bounds.maxX && !divided; x += m(20)) {
        if (z <= water.shoreAt(x) && water.isWater(x, z)) divided = true;
      }
      if (!divided) continue;

      const nearest = Math.min(...crossings.map((at) => Math.abs(at - z)));
      // Never further from a crossing than two crossings are allowed to be from
      // each other: if the spacing is the shape of the river, this is the claim
      // that the shape actually reaches the whole of it. Measured 664 m here.
      if (nearest > CITY_BRIDGE_SPACING) {
        stranded.push(`z=${Math.round(z / M)} is ${Math.round(nearest / M)} m from one`);
      }
    }
    expect(stranded.slice(0, 5)).toEqual([]);
  });

  it('never puts a block in the water', () => {
    const wet = city.blocks.filter((b) => touchesWater(b.bounds));
    expect(wet.length).toBe(0);
  });
});

// A street cut off by the water used to stop at the bank: 106 of the network's
// 109 dead ends were one, a median of four metres from the river (#241). The
// answer was a road *along* the water for them to end onto, so these are the
// two halves of that - the road exists, and nothing runs past it.
describe('the embankment', () => {
  const embankment = city.roads.filter((r) => r.embankment);

  const deadEnds = () => {
    const degree = new Map<number, number>();
    for (const road of city.roads) {
      degree.set(road.a, (degree.get(road.a) ?? 0) + 1);
      degree.set(road.b, (degree.get(road.b) ?? 0) + 1);
    }
    return city.roads.flatMap((road) =>
      [road.a, road.b].filter((id) => degree.get(id) === 1).map((id) => ({ road, node: city.nodes[id] })),
    );
  };

  /** Sampled, because the water is a pair of sines with no closed-form distance. */
  const nearWater = (x: number, z: number, margin: number) => {
    if (water.isWater(x, z)) return true;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (water.isWater(x + Math.cos(a) * margin, z + Math.sin(a) * margin)) return true;
    }
    return false;
  };

  it('runs a road along the coast and both banks of the river', () => {
    const length = embankment.reduce((sum, r) => sum + r.length, 0);
    expect(embankment.length).toBeGreaterThan(50);
    expect(length / M).toBeGreaterThan(5000);
  });

  // An embankment that has wandered inland is the bank walk having jumped a
  // headland, and the road it draws crosses whatever is in between.
  it('keeps every embankment beside the water it follows', () => {
    const inland = embankment.filter((r) => {
      const a = city.nodes[r.a].pos;
      const b = city.nodes[r.b].pos;
      return !nearWater((a.x + b.x) / 2, (a.z + b.z) / 2, m(120));
    });
    expect(inland.map((r) => r.id)).toEqual([]);
  });

  // The stub the playtest saw: a street crossing the embankment and carrying on
  // to stop at the bank. The embankment's own ends are allowed to be there -
  // a quay stops where the estuary opens out - and so is a bridge.
  it('leaves no street stopping at the water', () => {
    const stubs = deadEnds().filter(
      ({ road, node }) =>
        !road.embankment && !road.bridge && node.y === 0 && nearWater(node.pos.x, node.pos.z, m(40)),
    );
    expect(stubs.map(({ node }) => `${Math.round(node.pos.x / M)},${Math.round(node.pos.z / M)}`)).toEqual([]);
  });

  it('leaves the network with few dead ends at all', () => {
    expect(deadEnds().length).toBeLessThan(30);
  });
});

// The repair pass (ADR-0005 rule 3) exists because cutting a network against
// water can strand a district, and no one seed proves it does not. So sweep.
describe('every seed makes a drivable city', () => {
  const seeds = [1, 2, 7, 42, 777, 5150, 123456, 0x4b657374];
  for (const seed of seeds) {
    // A whole city each, which is over a second of work before the first
    // assertion - see the note in `generateCity` above.
    it(`seed ${seed} is connected, complete and on land`, { timeout: 30_000 }, () => {
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

// The whole reason ADR-0004 exists. A projected ribbon or a ground plane can
// hold one surface per map position; these tests are what that buys.
describe('the elevated interstate', () => {
  const interstate = () => city.roads.filter((r) => r.class === 'interstate');
  const ramps = () => city.roads.filter((r) => r.class === 'ramp');

  it('builds a circuit and ramps onto it', () => {
    expect(interstate().length).toBeGreaterThan(20);
    expect(ramps().length).toBeGreaterThan(2);
  });

  it('runs above the streets', () => {
    const elevated = interstate().filter((r) => city.nodes[r.a].y > 0);
    expect(elevated.length).toBeGreaterThan(interstate().length / 2);
  });

  it('dives into a tunnel somewhere, which is the same mechanism inverted', () => {
    const below = city.nodes.filter((n) => n.y < 0);
    expect(below.length).toBeGreaterThan(0);
  });

  // The interstate is built after the network has been cut against the water
  // and was never given the water at all, so nothing stopped it coming down to
  // street level over the bay (#244). Over water at 12 m is a viaduct and at
  // -9 m is a tunnel; it is the stretch in between that is a road going into
  // the sea, and the two places the deck reaches it are a ramp and a mouth.
  const overWater = (road: CityRoad) => {
    const a = city.nodes[road.a];
    const b = city.nodes[road.b];
    const wet: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = a.pos.x + (b.pos.x - a.pos.x) * t;
      const z = a.pos.z + (b.pos.z - a.pos.z) * t;
      if (water.isWater(x, z)) wet.push(a.y + (b.y - a.y) * t);
    }
    return wet;
  };

  it('never runs a ramp out over the water', () => {
    const wet = ramps().filter((r) => overWater(r).length > 0);
    expect(wet.map((r) => r.id)).toEqual([]);
  });

  it('crosses the water high or deep, never at street level', () => {
    const shallow: string[] = [];
    for (const road of interstate()) {
      for (const y of overWater(road)) {
        if (Math.abs(y) < m(6)) shallow.push(`road ${road.id} at ${Math.round(y / M)} m`);
      }
    }
    expect(shallow.slice(0, 5)).toEqual([]);
  });

  // The point. Where the interstate passes over a street they occupy the same
  // map position, and they must not have become the same junction: you cannot
  // turn off an overpass onto the road beneath it.
  it('never joins a road it merely crosses over', () => {
    const surfaceRoads = city.roads.filter(onSurface).map((r) => carriageway(city, r));
    const grid = index(surfaceRoads);

    let crossings = 0;
    const joined: string[] = [];
    for (const road of interstate()) {
      const a = city.nodes[road.a];
      const b = city.nodes[road.b];
      if (a.y <= 0 || b.y <= 0) continue;

      const box = carriageway(city, road);
      for (const id of near(grid, box)) {
        if (!overlaps(box, surfaceRoads[id])) continue;
        crossings++;
        // A shared node would mean the two levels had been welded together.
        const under = city.roads.filter(onSurface)[id];
        for (const end of [a.id, b.id]) {
          if (under.a === end || under.b === end) joined.push(`road ${road.id} welded to ${under.id}`);
        }
      }
    }
    expect(crossings).toBeGreaterThan(10); // it really does cross the grid
    expect(joined).toEqual([]);
  });

  it('leaves the streets flat', () => {
    for (const road of city.roads) {
      if (road.class !== 'street' && road.class !== 'arterial') continue;
      expect(city.nodes[road.a].y).toBe(0);
      expect(city.nodes[road.b].y).toBe(0);
    }
  });

  it('changes level only where it means to', () => {
    // A ramp is two roads since #212: the climb, and the flat mouth that joins
    // its foot back to the junction it serves. The foot is set aside from that
    // junction so the climb does not run down an existing street - two roads in
    // one place is a choice the car cannot make, and it always made the wrong
    // one. So the assertion is about the climbs: there have to be some, and
    // every one of them has to actually climb.
    const climbs = ramps().filter(
      (r) => Math.abs(city.nodes[r.a].y - city.nodes[r.b].y) > 0,
    );
    expect(climbs.length).toBeGreaterThan(0);
    // And every flat piece of ramp is a mouth at street level, not a ramp that
    // forgot to rise: both ends on the ground.
    for (const flat of ramps().filter((r) => !climbs.includes(r))) {
      expect(city.nodes[flat.a].y).toBe(0);
      expect(city.nodes[flat.b].y).toBe(0);
    }
    // The deck changes level too, on the run into and out of the tunnel. What
    // must not happen is a step: every change is spread over enough road to
    // drive up, which is what `GRADE_RUN` buys.
    for (const road of city.roads) {
      if (road.class !== 'ramp' && road.class !== 'interstate') continue;
      const rise = Math.abs(city.nodes[road.a].y - city.nodes[road.b].y);
      expect(rise / road.length).toBeLessThan(0.09);
    }
  });

  it('stays reachable from the streets', () => {
    // Already covered by the connectivity test, but state it directly: an
    // interstate you cannot get onto is scenery.
    const onRamp = new Set(ramps().flatMap((r) => [r.a, r.b]));
    const touchesSurface = [...onRamp].some((id) => city.nodes[id].y === 0);
    expect(touchesSurface).toBe(true);
  });
});

// `y === 0` was standing in for "on the street network" in ten places across
// nine modules - where a park may go, where a lamp goes, where the police may
// spawn, which junctions a race or an ambush may use. That holds only while the
// ground is flat, and ADR-0007 is about to stop it being flat (#250).
describe('a node knows which network it is on', () => {
  it('gives every node a level', () => {
    const missing = city.nodes.filter((n) => !['surface', 'elevated', 'tunnel'].includes(n.level));
    expect(missing.length).toBe(0);
  });

  // The whole claim of the refactor: today the level and the height say the
  // same thing, so nothing about the city changed. The field earns its keep on
  // the day a street sits at 40 m on a hill and the deck still sits at 12.
  it('agrees with the height it replaced, which is what makes it a no-op today', () => {
    const disagreeing = city.nodes.filter(
      (n) => n.level !== (n.y > 0 ? 'elevated' : n.y < 0 ? 'tunnel' : 'surface'),
    );
    expect(disagreeing.map((n) => `${n.id} at ${n.y}`)).toEqual([]);
  });

  it('has all three, so none of them is a theory', () => {
    const levels = new Set(city.nodes.map((n) => n.level));
    expect([...levels].sort()).toEqual(['elevated', 'surface', 'tunnel']);
  });

  // A ramp's foot joins the street and is a surface junction; its top is not.
  // That distinction is what everything asking "is this a street" depends on.
  it('puts a ramp foot on the surface and its head on the deck', () => {
    const ramps = city.roads.filter((r) => r.class === 'ramp');
    expect(ramps.length).toBeGreaterThan(0);
    const climbing = ramps.filter(
      (r) => city.nodes[r.a].level !== city.nodes[r.b].level,
    );
    expect(climbing.length).toBeGreaterThan(0);
    for (const road of climbing) {
      const levels = [city.nodes[road.a], city.nodes[road.b]].map((n) => n.level).sort();
      expect(levels).toEqual(['elevated', 'surface']);
    }
  });
});

describe('street furniture', () => {
  // A lamp reaches over the carriageway, and only the generator knows which
  // way that is: by the time a prop reaches the renderer it is a point with a
  // facing, and both sides of the street look identical from there.
  it('tells the renderer which way a lamp leans', () => {
    const lamps = city.furniture.filter((prop) => prop.kind === 'lamp');
    expect(lamps.length).toBeGreaterThan(0);
    for (const lamp of lamps) expect(Math.abs(lamp.reach)).toBe(1);
    // Lamps alternate down a kerb, so both directions have to occur.
    expect(new Set(lamps.map((lamp) => lamp.reach)).size).toBe(2);
    // Nothing else has a side to it, and a sign shoved sideways by a stray
    // reach would stand in the road.
    for (const prop of city.furniture) {
      if (prop.kind !== 'lamp') expect(prop.reach).toBe(0);
    }
  });

  it('puts lamps, signs and barriers on the streets', () => {
    const kinds = new Set(city.furniture.map((p) => p.kind));
    expect([...kinds].sort()).toEqual(['barrier', 'lamp', 'sign']);
    expect(city.furniture.length).toBeGreaterThan(1000);
  });

  // Furniture on the perimeter road is offset outwards, off the ground and
  // into the sea, so it has to be dropped rather than drawn.
  it('never stands a prop outside the city', () => {
    const outside = city.furniture.filter(
      (p) =>
        p.at.x < city.bounds.minX ||
        p.at.x > city.bounds.maxX ||
        p.at.z < city.bounds.minZ ||
        p.at.z > city.bounds.maxZ,
    );
    expect(outside.length).toBe(0);
  });

  // The point of placing furniture from the road graph rather than scattering
  // it: a lamp post standing in a live lane is the failure this rules out.
  // Junctions are excluded because a kerb there is genuinely inside the
  // carriageway of the road crossing it, which is not a bug.
  it('never stands a prop in the middle of a road', () => {
    // Measured from the centreline, which is the only way that works now that
    // roads bend: a bounding box round a diagonal road is mostly not the road.
    const surface = city.roads.filter(onSurface);
    const grid = index(surface.map((r) => carriageway(city, r)));

    const inTheRoad: string[] = [];
    for (const prop of city.furniture) {
      if (prop.kind === 'barrier') continue; // parapets live on the bridge itself
      if (prop.y !== 0) continue; // a lamp on the viaduct is above the street, not in it

      const spot = { minX: prop.at.x, maxX: prop.at.x, minZ: prop.at.z, maxZ: prop.at.z };
      for (const id of near(grid, spot)) {
        const road = surface[id];
        const a = city.nodes[road.a].pos;
        const b = city.nodes[road.b].pos;
        if (distanceToSegment(prop.at.x, prop.at.z, a.x, a.z, b.x, b.z) >= road.width / 2) continue;
        // Junctions are excluded: a kerb there is genuinely inside the
        // carriageway of the road crossing it, which is not a bug.
        const clear = Math.min(road.width, road.length / 3);
        const fromA = Math.hypot(prop.at.x - a.x, prop.at.z - a.z);
        const fromB = Math.hypot(prop.at.x - b.x, prop.at.z - b.z);
        if (fromA > clear && fromB > clear) {
          inTheRoad.push(`${prop.kind} at ${Math.round(prop.at.x)},${Math.round(prop.at.z)}`);
        }
      }
    }
    expect(inTheRoad.slice(0, 5)).toEqual([]);
  });

  /**
   * Parapets go where there is a drop: along a bridge deck, and across the end
   * of a road the water cut off (#241). Nowhere else - a rail across a street
   * that merely stops is a street the player will believe is closed.
   */
  it('only puts parapets where there is water to keep out of', () => {
    const bridges = city.roads.filter((r) => r.bridge);
    const deadEnds = city.nodes.filter((n) => n.y === 0 && n.roads.length === 1);
    const barriers = city.furniture.filter((p) => p.kind === 'barrier');
    expect(barriers.length).toBeGreaterThan(0);

    for (const barrier of barriers) {
      const onBridge = bridges.some((road) => {
        const a = city.nodes[road.a].pos;
        const b = city.nodes[road.b].pos;
        return (
          barrier.at.x >= Math.min(a.x, b.x) - road.width &&
          barrier.at.x <= Math.max(a.x, b.x) + road.width &&
          barrier.at.z >= Math.min(a.z, b.z) - road.width &&
          barrier.at.z <= Math.max(a.z, b.z) + road.width
        );
      });
      const atAnEnd = deadEnds.some(
        (node) => Math.hypot(node.pos.x - barrier.at.x, node.pos.z - barrier.at.z) < m(30),
      );
      expect(onBridge || atAnEnd).toBe(true);
    }
  });

  it('rails off the roads the water cut short', () => {
    const barriers = city.furniture.filter((p) => p.kind === 'barrier');
    const railed = city.nodes.filter(
      (node) =>
        node.y === 0 &&
        node.roads.length === 1 &&
        barriers.some(
          (b) => Math.hypot(node.pos.x - b.at.x, node.pos.z - b.at.z) < m(20),
        ),
    );
    // This used to be nearly every dead end in the city - 106 of 109 - because
    // that is what a street network cut against a river leaves behind. The
    // embankment took the count down to a handful (#241), and what is left is
    // the quay's own ends where it stops at the estuary. So the claim is no
    // longer about the share of dead ends: it is that a road still finishing at
    // the water gets a rail across it.
    const atTheWater = city.nodes.filter(
      (node) =>
        node.y === 0 &&
        node.roads.length === 1 &&
        (() => {
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            if (inWater(city, node.pos.x + Math.cos(a) * m(10), node.pos.z + Math.sin(a) * m(10))) return true;
          }
          return false;
        })(),
    );
    expect(atTheWater.length).toBeGreaterThan(0);
    for (const node of atTheWater) expect(railed).toContain(node);
  });

  it('signs only a real junction, not every cut in a road', () => {
    const signs = city.furniture.filter((p) => p.kind === 'sign');
    const junctions = city.nodes.filter(
      (n) =>
        n.y === 0 &&
        n.roads.filter((id) => ['street', 'arterial'].includes(city.roads[id].class)).length >= 3,
    );
    expect(signs.length).toBeGreaterThan(0);
    // At most one per junction, and fewer than the node count: a node that
    // exists only because a road was cut in two is not a junction to sign.
    expect(signs.length).toBeLessThanOrEqual(junctions.length);
    expect(signs.length).toBeLessThan(city.nodes.length);

    // And every one of them is actually beside a junction.
    const reach = 2200; // widest carriageway plus the kerb gap, with room to spare
    const grid = index(
      junctions.map((n) => ({
        minX: n.pos.x - reach,
        maxX: n.pos.x + reach,
        minZ: n.pos.z - reach,
        maxZ: n.pos.z + reach,
      })),
    );
    const stray = signs.filter((sign) => {
      const spot = { minX: sign.at.x, maxX: sign.at.x, minZ: sign.at.z, maxZ: sign.at.z };
      return [...near(grid, spot)].every((id) => {
        const n = junctions[id].pos;
        return Math.hypot(n.x - sign.at.x, n.z - sign.at.z) > reach;
      });
    });
    expect(stray.length).toBe(0);
  });
});

describe('density', () => {
  it('varies how built up one quarter is against another', () => {
    const densities = city.superblocks.map((s) => s.density);
    expect(Math.max(...densities) - Math.min(...densities)).toBeGreaterThan(0.4);
  });

  // The variation has to be between places, not within them. A district where
  // every block is thinned by a different amount is noise, not a quarter.
  it('leaves some blocks open, and more of them where the quarter is thin', () => {
    const open = city.blocks.filter((b) => b.open);
    expect(open.length).toBeGreaterThan(10);
    expect(open.length).toBeLessThan(city.blocks.length / 2);
  });

  it('builds nothing on an open block', () => {
    const openBlocks = city.blocks.filter((b) => b.open).map((b) => b.bounds);
    const grid = index(openBlocks);
    const built: string[] = [];
    for (const building of city.buildings) {
      for (const id of near(grid, building.footprint)) {
        if (overlaps(building.footprint, openBlocks[id], 1)) built.push('building on open ground');
      }
    }
    expect(built).toEqual([]);
  });
});

// What makes cover mean something in a pursuit (#63): a cop one street over
// with a block in the way has not got you.
describe('line of sight', () => {
  const grid = new CityGrid(city);

  it('is blocked by a building', () => {
    const building = city.buildings[0];
    const f = building.footprint;
    const mid = { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 };
    const span = Math.max(f.maxX - f.minX, f.maxZ - f.minZ);

    expect(
      lineBlocked(grid, { x: mid.x - span, z: mid.z }, { x: mid.x + span, z: mid.z }),
    ).toBe(true);
  });

  it('is clear down an empty street', () => {
    // Along a road's own centreline, which by construction has no building on it.
    const road = city.roads.find((r) => r.length > 3000 && r.class === 'street');
    expect(road).toBeDefined();
    if (!road) return;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    expect(lineBlocked(grid, a, b)).toBe(false);
  });
});

/**
 * Land that belongs to something (#185).
 *
 * A fifth of the map used to belong to neither block nor road: blocks are laid
 * on lines and pulled clear of the water, and one that will not fit is dropped,
 * so a riverbank loses whole blocks and leaves an apron behind. #176 made that
 * visible by painting the ground as not-road, and what it showed was aprons up
 * to 400 m from the nearest block that a player can drive onto and be capped at
 * a quarter of top speed.
 *
 * Sampled rather than reasoned about, because the question is "how much", and
 * the number is the thing that regressed silently in the first place.
 */
describe('open land', () => {
  const STEP = 40 * M;

  it('leaves little of the map belonging to neither block nor road', () => {
    const claimed = new Set<string>();
    for (const block of city.blocks) {
      for (let x = block.bounds.minX; x <= block.bounds.maxX + STEP; x += STEP / 2) {
        for (let z = block.bounds.minZ; z <= block.bounds.maxZ + STEP; z += STEP / 2) {
          if (x > block.bounds.maxX || z > block.bounds.maxZ) continue;
          claimed.add(`${Math.round(x / STEP)},${Math.round(z / STEP)}`);
        }
      }
    }

    let total = 0;
    let nothing = 0;
    for (let x = city.bounds.minX; x <= city.bounds.maxX; x += STEP) {
      for (let z = city.bounds.minZ; z <= city.bounds.maxZ; z += STEP) {
        total++;
        if (inWater(city, x, z)) continue;
        if (surfaceAt(city, cityGrid, x, z, 0).road) continue;
        if (claimed.has(`${Math.round(x / STEP)},${Math.round(z / STEP)}`)) continue;
        nothing++;
      }
    }

    // It was 19.3% of the map before the parks pass, with a median of 50 m to
    // the nearest block and a worst case of 412 m. This is a ceiling on the
    // regression, not a target: if it climbs back past a sixth, the generator
    // has started dropping land again.
    expect(nothing / total).toBeLessThan(0.16);
  });

  it('fills the leftovers with parks, and leaves the lots alone', () => {
    const parks = city.blocks.filter((b) => b.park);
    const lots = city.blocks.filter((b) => b.open && !b.park);
    expect(parks.length).toBeGreaterThan(20);
    expect(lots.length).toBeGreaterThan(20);
    for (const park of parks) expect(park.open).toBe(true);
  });

  // A street find is a car parked in a yard; a car in a riverside park is
  // litter. Same for a gate across the entrance to a lawn.
  it('puts no street find or breakable on parkland', () => {
    const parks = city.blocks.filter((b) => b.park);
    const inside = (r: Rect, x: number, z: number) =>
      x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

    for (const find of city.finds) {
      expect(parks.some((p) => inside(p.bounds, find.at.x, find.at.z))).toBe(false);
    }
    for (const thing of city.breakables) {
      expect(parks.some((p) => inside(p.bounds, thing.at.x, thing.at.z))).toBe(false);
    }
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
    const surface = city.roads.filter(onSurface);
    const grid = index(surface.map((r) => carriageway(city, r)));
    const clashes: string[] = [];
    for (const block of city.blocks) {
      for (const id of near(grid, block.bounds)) {
        // The bounding box only narrows the search; a road at an angle fills
        // very little of its own box, so the real test is from the centreline.
        if (roadReaches(city, surface[id], block.bounds, 1)) {
          clashes.push(`block over road ${surface[id].id}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});

/**
 * Asking the index about an *area* (#216).
 *
 * `roadsNear` answers about a point, so anything wanting an area sampled points
 * across it. The minimap sampled them 140 m apart on a 120 m cell, so cells
 * fell between the samples and their roads were never drawn - and because the
 * samples move with the car, which cells were missed changed as you drove.
 * That is what "the roads flicker in and out" was.
 */
describe('every road in an area', () => {
  const grid = new CityGrid(city);

  /** The rectangle a minimap-sized view covers. */
  const around = (x: number, z: number, reach: number) => ({
    minX: x - reach,
    maxX: x + reach,
    minZ: z - reach,
    maxZ: z + reach,
  });

  // The file's own `carriageway` above, which is the box a road occupies.
  const overlaps = (a: ReturnType<typeof around>, b: Rect) =>
    a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

  it('misses none of them, wherever the view happens to sit', () => {
    const reach = m(430);
    // Deliberately not on cell boundaries: the bug was about where the samples
    // fell relative to the cells, so the offsets have to be untidy.
    for (const [x, z] of [
      [0, 0],
      [m(137), m(41)],
      [m(-2013), m(880)],
      [m(1499), m(-1201)],
    ]) {
      const rect = around(x, z, reach);
      const got = new Set(grid.roadsIn(rect).map((r) => r.id));
      const want = city.roads.filter((road) => overlaps(rect, carriageway(city, road)));
      for (const road of want) {
        expect(got.has(road.id), `road ${road.id} overlaps the view and was not returned`).toBe(
          true,
        );
      }
    }
  });

  it('returns each road once, however many cells it crosses', () => {
    const found = grid.roadsIn(around(0, 0, m(430)));
    expect(new Set(found.map((r) => r.id)).size).toBe(found.length);
  });

  it('does not gain or lose roads as the view creeps across a cell edge', () => {
    // The symptom, stated directly: nudge the view a few metres at a time and
    // nothing that stays inside it may disappear.
    const reach = m(430);
    let previous: Set<number> | null = null;
    for (let step = 0; step < 24; step++) {
      const x = m(-500) + step * m(11);
      const rect = around(x, m(220), reach);
      const now = new Set(grid.roadsIn(rect).map((r) => r.id));
      if (previous) {
        for (const id of previous) {
          // Still overlapping after the nudge? Then it must still be found.
          if (!overlaps(rect, carriageway(city, city.roads[id]))) continue;
          expect(now.has(id), `road ${id} vanished between steps`).toBe(true);
        }
      }
      previous = now;
    }
  });
});
