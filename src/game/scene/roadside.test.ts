import { describe, it, expect } from 'vitest';
import { bendKerbs, deckRails, guardrails } from './roadside';
import { generateCity } from '../city/generate';
import { CITY_SEED } from '../constants';

const city = generateCity(CITY_SEED);

describe('roadside clutter (#582)', () => {
  it('rails the open deck and the water side, and stripes some bends', () => {
    expect(deckRails(city).length).toBeGreaterThan(0);
    expect(guardrails(city).length).toBeGreaterThan(0);
    expect(bendKerbs(city).length).toBeGreaterThan(0);
  });

  it('puts no deck rail on a road wholly underground', () => {
    const underground = city.roads.filter(
      (r) => r.class === 'interstate' && city.nodes[r.a].level === 'tunnel' && city.nodes[r.b].level === 'tunnel',
    );
    expect(underground.length).toBeGreaterThan(0);
    expect(deckRails(city).length).toBe(
      2 * city.roads.filter((r) => (r.class === 'interstate' || r.class === 'ramp') && !underground.includes(r)).length,
    );
  });

  it('alternates the kerb colours', () => {
    const blocks = bendKerbs(city);
    expect(blocks.some((b) => b.colour === 0)).toBe(true);
    expect(blocks.some((b) => b.colour === 1)).toBe(true);
  });
});
