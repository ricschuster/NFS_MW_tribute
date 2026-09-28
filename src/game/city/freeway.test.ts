import { describe, it, expect } from 'vitest';
import { CITY_LAND_STREAM, CITY_SEED, INTERSTATE_HEIGHT, TUNNEL_COUNT, UNITS_PER_METRE } from '../constants';
import { FREEWAY_LOOP, FREEWAY_RAMPS, FREEWAY_TUNNELS } from './freeway';
import { kestrelBay } from './index';
import { addInterstate, rampMarkerProblem } from './interstate';
import { Rng } from './rng';
import { groundAt } from './terrain';
import { makeWater } from './water';
import type { CityNode, CityRoad } from './types';

// The water `generate.ts` cuts the city against, which is the water the
// freeway is built over: drawn from the frozen land stream, not the seed.
const water = makeWater(new Rng(CITY_LAND_STREAM), kestrelBay().bounds);

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

// Built against the real city, not a stand-in: the loop over the real water
// and terrain, onto a copy of the real network, with `CITY_FREEWAY` still off
// so this is the only place it is built at all.
describe('the authored ramps', () => {
  const city = kestrelBay();
  const nodes: CityNode[] = structuredClone(city.nodes);
  const roads: CityRoad[] = structuredClone(city.roads);
  const before = nodes.length;
  addInterstate(new Rng(CITY_SEED), city.bounds, nodes, roads, water, city.terrain, FREEWAY_LOOP, FREEWAY_TUNNELS, FREEWAY_RAMPS);
  const ramps = roads.filter((r) => r.class === 'ramp');

  it('builds one ramp per marker and no others', () => {
    expect(ramps.length).toBe(FREEWAY_RAMPS.length);
  });

  it.each(FREEWAY_RAMPS.map((p, i) => [i + 1, p] as const))('ramp %i runs from the full-height deck to the ground at its marker', (_, marker) => {
    const foot = nodes.find((n) => n.id >= before && n.pos.x === marker.x && n.pos.z === marker.z);
    expect(foot).toBeDefined();
    expect(foot!.level).toBe('surface');
    expect(foot!.y).toBeCloseTo(groundAt(city.terrain, marker.x, marker.z));
    const ramp = ramps.find((r) => r.a === foot!.id || r.b === foot!.id);
    expect(ramp).toBeDefined();
    const deck = nodes[ramp!.a === foot!.id ? ramp!.b : ramp!.a];
    expect(deck.level).toBe('elevated');
    expect(deck.y).toBeCloseTo(INTERSTATE_HEIGHT);
  });

  it('refuses a marker that cannot take a ramp rather than leaving it out', () => {
    const onTheDeck = [FREEWAY_LOOP[3]];
    expect(() =>
      addInterstate(new Rng(CITY_SEED), city.bounds, [...nodes], [...roads], water, city.terrain, FREEWAY_LOOP, FREEWAY_TUNNELS, onTheDeck),
    ).toThrow(/cannot take a ramp/);
  });
});
