import { describe, it, expect } from 'vitest';
import {
  CITY_FREEWAY,
  CITY_LAND_STREAM,
  CITY_SEED,
  INTERSTATE_HEIGHT,
  RAMP_CONNECTOR_ANGLE,
  ROUTE_COUNTRY,
  TUNNEL_COUNT,
  UNITS_PER_METRE,
} from '../constants';
import { FREEWAY_LOOP, FREEWAY_RAMPS, FREEWAY_TUNNELS } from './freeway';
import { kestrelBay } from './index';
import { addInterstate, nearestOnLoop, rampMarkerProblem } from './interstate';
import { rampConnectors } from './rampconnectors';
import { AUTHORED_ROADS } from './roads';
import { Rng } from './rng';
import { groundAt } from './terrain';
import { makeWater } from './water';
import type { CityNode, CityRoad } from './types';

// The water `generate.ts` cuts the city against, which is the water the
// freeway is built over: drawn from the frozen land stream, not the seed.
const water = makeWater(new Rng(CITY_LAND_STREAM), kestrelBay().bounds);
const m = (metres: number) => metres * UNITS_PER_METRE;

// The editor checks a marker as it is dragged, but the editor is a page
// nobody has to open. These are the same rules held against the source, so a
// marker moved badly and synced in fails here rather than in a playthrough
// that finds a ramp missing (#371).
describe('the authored ramp markers', () => {
  it('has every tunnel authored, so the height profile they are checked against is the built one', () => {
    expect(FREEWAY_TUNNELS.length).toBeGreaterThanOrEqual(TUNNEL_COUNT);
  });

  it.each(FREEWAY_RAMPS.map((p, i) => [i + 1, p] as const))('marker %i can take a ramp', (_, marker) => {
    const at = `(${Math.round(marker.x / UNITS_PER_METRE)}, ${Math.round(marker.z / UNITS_PER_METRE)})`;
    expect(`${at}: ${rampMarkerProblem(FREEWAY_LOOP, FREEWAY_TUNNELS, marker, water) ?? 'ok'}`).toBe(`${at}: ok`);
  });
});

// The real city when it has the freeway; while `CITY_FREEWAY` is off, the
// loop built over the real water and terrain onto a copy of the real network,
// so the ramps are held to the same things either side of the switch.
const withFreeway = (() => {
  const city = kestrelBay();
  if (CITY_FREEWAY) return { nodes: city.nodes, roads: city.roads };
  const nodes: CityNode[] = structuredClone(city.nodes);
  const roads: CityRoad[] = structuredClone(city.roads);
  addInterstate(new Rng(CITY_SEED), city.bounds, nodes, roads, water, city.terrain, FREEWAY_LOOP, FREEWAY_TUNNELS, FREEWAY_RAMPS);
  return { nodes, roads };
})();

describe('the authored ramps', () => {
  const city = kestrelBay();
  const { nodes, roads } = withFreeway;
  const ramps = roads.filter((r) => r.class === 'ramp');

  it('builds one ramp per marker and no others', () => {
    expect(ramps.length).toBe(FREEWAY_RAMPS.length);
  });

  it.each(FREEWAY_RAMPS.map((p, i) => [i + 1, p] as const))('ramp %i runs from the full-height deck to the ground at its marker', (_, marker) => {
    const ramp = ramps.find((r) => [r.a, r.b].some((id) => Math.hypot(nodes[id].pos.x - marker.x, nodes[id].pos.z - marker.z) < m(1)));
    expect(ramp).toBeDefined();
    const [foot, deck] = nodes[ramp!.a].level === 'surface' ? [nodes[ramp!.a], nodes[ramp!.b]] : [nodes[ramp!.b], nodes[ramp!.a]];
    expect(foot.level).toBe('surface');
    expect(foot.y).toBeCloseTo(groundAt(city.terrain, foot.pos.x, foot.pos.z));
    expect(deck.level).toBe('elevated');
    expect(deck.y).toBeCloseTo(INTERSTATE_HEIGHT);
  });

  it('refuses a marker that cannot take a ramp rather than leaving it out', () => {
    const onTheDeck = [FREEWAY_LOOP[3]];
    expect(() =>
      addInterstate(new Rng(CITY_SEED), city.bounds, [], [], water, city.terrain, FREEWAY_LOOP, FREEWAY_TUNNELS, onTheDeck),
    ).toThrow(/cannot take a ramp/);
  });
});

// Straight lines, which is only right while every one of them is dry and
// climbable (`rampconnectors.ts`): a marker moved somewhere that stops being
// true fails here, which is the moment to give the connectors a router.
describe('the ramp connectors', () => {
  const city = kestrelBay();
  const connectors = rampConnectors(FREEWAY_LOOP, FREEWAY_RAMPS, AUTHORED_ROADS);
  const vertices = new Set(AUTHORED_ROADS.flatMap((r) => r.points));
  const step = m(10);

  it('joins every ramp to a drawn road', () => {
    expect(connectors.length).toBe(FREEWAY_RAMPS.length);
    connectors.forEach((c, i) => {
      expect(c.points[0]).toBe(FREEWAY_RAMPS[i]);
      expect(vertices.has(c.points[c.points.length - 1])).toBe(true);
    });
  });

  it.each(connectors.map((c, i) => [i + 1, c] as const))('connector %i is dry, climbable and clear of its ramp', (_, c) => {
    const [foot, end] = c.points;
    const run = Math.hypot(end.x - foot.x, end.z - foot.z);
    const steps = Math.max(1, Math.ceil(run / step));
    let steepest = 0;
    for (let i = 0; i <= steps; i++) {
      const x = foot.x + ((end.x - foot.x) * i) / steps;
      const z = foot.z + ((end.z - foot.z) * i) / steps;
      expect(water.isWater(x, z)).toBe(false);
      if (i === 0) continue;
      const px = foot.x + ((end.x - foot.x) * (i - 1)) / steps;
      const pz = foot.z + ((end.z - foot.z) * (i - 1)) / steps;
      const rise = Math.abs(groundAt(city.terrain, x, z) - groundAt(city.terrain, px, pz));
      steepest = Math.max(steepest, rise / (run / steps));
    }
    expect(steepest).toBeLessThan(ROUTE_COUNTRY.cap);

    const deck = nearestOnLoop(FREEWAY_LOOP, foot);
    const away = Math.atan2(end.z - foot.z, end.x - foot.x) - Math.atan2(deck.z - foot.z, deck.x - foot.x);
    expect(Math.abs(Math.atan2(Math.sin(away), Math.cos(away)))).toBeGreaterThanOrEqual(RAMP_CONNECTOR_ANGLE);
  });

  // Only asked of the real city: with the switch off there are no connectors
  // laid, and a foot with nothing to find makes its own node.
  it.skipIf(!CITY_FREEWAY)('meets its ramp at one node, the foot', () => {
    const { nodes, roads } = withFreeway;
    for (const marker of FREEWAY_RAMPS) {
      const feet = nodes.filter((n) => n.level === 'surface' && Math.hypot(n.pos.x - marker.x, n.pos.z - marker.z) < m(1));
      expect(feet.length).toBe(1);
      expect(feet[0].roads.map((id) => roads[id].class).sort()).toEqual(['boulevard', 'ramp']);
    }
  });
});
