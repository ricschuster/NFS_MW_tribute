import { describe, it, expect } from 'vitest';
import { CITY_LAND_STREAM, TUNNEL_COUNT, UNITS_PER_METRE } from '../constants';
import { FREEWAY_LOOP, FREEWAY_RAMPS, FREEWAY_TUNNELS } from './freeway';
import { kestrelBay } from './index';
import { rampMarkerProblem } from './interstate';
import { Rng } from './rng';
import { makeWater } from './water';

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
