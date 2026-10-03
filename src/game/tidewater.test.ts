import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';
import { groundAt } from './city/terrain';
import { inWater } from './city/grid';
import { TIDEWATER_PONDS } from './city/tidewater';
import { TIDEWATER_PROPS } from './city/tidewaterprops';
import { PAD_SIZES, padOutline, tidewaterGround } from './city/tidewaterground';
import { insideOrNear, onApron } from './city/aprons';

const M = UNITS_PER_METRE;
const { city } = new CityWorld(undefined, { traffic: false, police: false });
const park = PLAN_DISTRICTS.find((area) => area.name === 'Tidewater Park')!;

describe('Tidewater Park (#461)', () => {
  it('has drives through it, paved and two lanes wide', () => {
    const drives = city.roads.filter((road) => {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      return road.class === 'street' && inArea(park.poly, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    });
    const length = drives.reduce((sum, road) => sum + road.length, 0) / M;
    expect(length).toBeGreaterThan(1500);
    for (const road of drives) expect(road.surface).toBe('asphalt');
  });

  it('runs a speed run round them, all of it inside the park', () => {
    const drive = city.routes.find((route) => route.name === 'Tidewater Drive')!;
    expect(drive.kind).toBe('speedrun');
    expect(drive.laps).toBe(1);
    expect(drive.length / M).toBeGreaterThan(1800);
    for (const p of drive.points) expect(inArea(park.poly, p)).toBe(true);
  });

  it('keeps the freeway in its tunnel under the park, as the owner chose', () => {
    const under = city.roads.filter((road) => {
      if (road.class !== 'interstate') return false;
      const a = city.nodes[road.a];
      const b = city.nodes[road.b];
      return inArea(park.poly, { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 }) && a.level === 'tunnel' && b.level === 'tunnel';
    });
    expect(under.reduce((sum, road) => sum + road.length, 0) / M).toBeGreaterThan(700);
  });

  it('has ponds in hollows, level and clear of every road', () => {
    const ponds = city.water.filter((body) => body.kind === 'pond' && inArea(park.poly, body.outline[0]));
    expect(ponds.length).toBe(TIDEWATER_PONDS.length);
    for (const pond of ponds) {
      // The water is at or under the ground all round its edge: not buried
      // along one side, and not standing above the lawn on the other.
      for (const p of pond.outline) {
        const edge = groundAt(city.terrain, p.x, p.z);
        expect(pond.level!).toBeLessThanOrEqual(edge + 0.5 * M);
      }
      const centre = TIDEWATER_PONDS[ponds.indexOf(pond)].at;
      expect(groundAt(city.terrain, centre.x, centre.z)).toBeLessThan(pond.level!);
      expect(inWater(city, centre.x, centre.z)).toBe(true);
    }
    for (const road of city.roads) {
      const a = city.nodes[road.a];
      if (a.level === 'tunnel') continue;
      for (const pond of ponds) expect(inWater(city, a.pos.x, a.pos.z) && inArea(pond.outline, a.pos)).toBe(false);
    }
  });

  it('has trees on its lawns, and none on the race or in the water', () => {
    const trees = city.setPieces.filter((piece) => piece.kind === 'tree' && inArea(park.poly, piece.at));
    expect(trees.length).toBeGreaterThan(150);
    const drive = city.routes.find((route) => route.name === 'Tidewater Drive')!;
    for (const tree of trees) {
      expect(inWater(city, tree.at.x, tree.at.z)).toBe(false);
      for (let i = 1; i < drive.points.length; i++) {
        const a = drive.points[i - 1];
        const b = drive.points[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((tree.at.x - a.x) * dx + (tree.at.z - a.z) * dz) / (dx * dx + dz * dz)));
        expect(Math.hypot(a.x + dx * t - tree.at.x, a.z + dz * t - tree.at.z) / M).toBeGreaterThan(20);
      }
    }
  });

  it('has its buildings: a bandstand, a café and toilets, on dry lawn and off the roads', () => {
    for (const kind of ['bandstand', 'cafe', 'toilet-block'] as const) {
      const placed = TIDEWATER_PROPS.filter((p) => p.kind === kind);
      expect(placed.length).toBeGreaterThan(0);
      for (const p of placed) {
        const piece = city.setPieces.find((q) => q.kind === kind && Math.hypot(q.at.x / M - p.x, q.at.z / M - p.z) < 0.5)!;
        expect(piece).toBeDefined();
        expect(inArea(park.poly, piece.at)).toBe(true);
        expect(inWater(city, piece.at.x, piece.at.z)).toBe(false);
        for (const road of city.roads) {
          if (city.nodes[road.a].level === 'tunnel') continue;
          const a = city.nodes[road.a].pos;
          const b = city.nodes[road.b].pos;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const t = Math.max(0, Math.min(1, ((piece.at.x - a.x) * dx + (piece.at.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
          expect(Math.hypot(a.x + dx * t - piece.at.x, a.z + dz * t - piece.at.z) / M).toBeGreaterThan(road.width / 2 / M + 12);
        }
      }
    }
  });
});

describe("Tidewater Park's once-over (2026-10-02)", () => {
  it('has every one of the owner\'s picks', () => {
    const kinds = new Set(TIDEWATER_PROPS.map((p) => p.kind));
    for (const kind of [
      'picnic-table', 'bin', 'bench', 'telescope', 'kiosk', 'food-truck',
      'playground', 'boathouse', 'jetty', 'rowing-boat', 'football-pitch', 'tennis-court', 'picnic-shelter',
      'path', 'beach', 'beach-hut', 'lifeguard-tower', 'lighthouse', 'railing', 'plaza', 'fountain',
    ] as const) expect(kinds.has(kind), kind).toBe(true);
    expect(TIDEWATER_PROPS.some((p) => p.kind === 'path' && p.variant === 'promenade')).toBe(true);
  });

  it('lays its paths, promenade, plaza and beach as drives: paved drives paved, sand does not', () => {
    const ground = tidewaterGround(TIDEWATER_PROPS);
    for (const g of ground) expect(city.drives).toContainEqual(g);
    const centre = (look: string) => {
      const g = ground.find((d) => d.look === look && !ground.some((o) => o !== d && o.look !== look && insideOrNear(o.outline, (d.outline[0].x + d.outline[2].x) / 2, (d.outline[0].z + d.outline[2].z) / 2, 0)))!;
      return { x: (g.outline[0].x + g.outline[2].x) / 2, z: (g.outline[0].z + g.outline[2].z) / 2 };
    };
    const path = centre('concrete');
    expect(onApron(city, path.x, path.z)).toBe(true);
    const sand = centre('sand');
    expect(onApron(city, sand.x, sand.z)).toBe(false);
  });

  it('levels the ground under its pitch, courts and playground', () => {
    const pads = TIDEWATER_PROPS.filter((p) => PAD_SIZES[p.kind]);
    expect(pads.length).toBeGreaterThanOrEqual(4);
    for (const p of pads) {
      const outline = padOutline(p)!;
      const heights: number[] = [];
      // Inset a cell from the edge, where the grade back to the lawn begins.
      for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
        const u = 0.1 + (0.8 * i) / 10, v = 0.1 + (0.8 * j) / 10;
        const x = outline[0].x + (outline[1].x - outline[0].x) * u + (outline[3].x - outline[0].x) * v;
        const z = outline[0].z + (outline[1].z - outline[0].z) * u + (outline[3].z - outline[0].z) * v;
        heights.push(groundAt(city.terrain, x, z));
      }
      expect((Math.max(...heights) - Math.min(...heights)) / M, p.kind).toBeLessThan(0.5);
    }
  });

  it('makes its picnic shelters breakable', () => {
    const shelters = city.breakables.filter((b) => b.kind === 'picnic-shelter');
    expect(shelters.length).toBe(TIDEWATER_PROPS.filter((p) => p.kind === 'picnic-shelter').length);
    for (const s of shelters) expect(inArea(park.poly, s.at)).toBe(true);
  });

  it('mixes broadleaves into its trees, and keeps them off its paths and pads', () => {
    const trees = city.setPieces.filter((piece) => piece.kind === 'tree' && inArea(park.poly, piece.at));
    const broad = trees.filter((t) => t.variant === 'broadleaf').length;
    expect(broad / trees.length).toBeGreaterThan(0.4);
    expect(broad / trees.length).toBeLessThan(0.8);
    const kept = [...tidewaterGround(TIDEWATER_PROPS).map((g) => g.outline), ...TIDEWATER_PROPS.map(padOutline).filter((o) => o !== null)];
    for (const tree of trees) for (const outline of kept) expect(insideOrNear(outline, tree.at.x, tree.at.z, 0)).toBe(false);
  });
});

