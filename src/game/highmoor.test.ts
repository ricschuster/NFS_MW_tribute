import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { PLAN_DISTRICTS, inArea } from './city/plan';
import { inWater } from './city/grid';
import { HIGHMOOR_PROPS } from './city/highmoorprops';

const M = UNITS_PER_METRE;
const { city } = new CityWorld(undefined, { traffic: false, police: false });
const park = PLAN_DISTRICTS.find((area) => area.name === 'Highmoor Park')!;

describe("Highmoor Park's once-over (2026-10-03)", () => {
  it('has every one of the owner\'s picks', () => {
    const kinds = new Set(HIGHMOOR_PROPS.map((p) => p.kind));
    for (const kind of [
      'picnic-table', 'bin', 'ranger-hut', 'toilet-block', 'kiosk', 'picnic-shelter',
      'waymarker', 'field-gate', 'stone-wall', 'log', 'log-pile', 'boulder',
      'timber-lookout', 'radio-mast', 'campfire', 'tent', 'camper-van', 'path',
    ] as const) expect(kinds.has(kind), kind).toBe(true);
    expect(HIGHMOOR_PROPS.some((p) => p.kind === 'path' && p.variant === 'trail')).toBe(true);
  });

  it('puts every prop in the park and on dry land', () => {
    const placed = city.setPieces.filter((piece) => ['ranger-hut', 'timber-lookout', 'radio-mast', 'campfire', 'camper-van', 'tent'].includes(piece.kind));
    expect(placed.length).toBeGreaterThanOrEqual(10);
    for (const piece of placed) {
      expect(inArea(park.poly, piece.at), piece.kind).toBe(true);
      expect(inWater(city, piece.at.x, piece.at.z), piece.kind).toBe(false);
    }
  });

  it('makes its picnic shelter breakable', () => {
    const shelters = city.breakables.filter((b) => b.kind === 'picnic-shelter' && inArea(park.poly, b.at));
    expect(shelters.length).toBe(HIGHMOOR_PROPS.filter((p) => p.kind === 'picnic-shelter').length);
  });

  it('keeps the woods off its trails', () => {
    const trails = HIGHMOOR_PROPS.filter((p) => p.kind === 'path' && p.variant === 'trail');
    const trees = city.setPieces.filter((piece) => piece.kind === 'tree' && inArea(park.poly, piece.at));
    expect(trees.length).toBeGreaterThan(300);
    for (const t of trails) {
      const half = (t.w ?? 0) / 2;
      const c = Math.cos(t.angle ?? 0), s = Math.sin(t.angle ?? 0);
      for (const tree of trees) {
        const dx = tree.at.x / M - t.x, dz = tree.at.z / M - t.z;
        const along = dx * c + dz * s, across = -dx * s + dz * c;
        expect(Math.abs(along) < half && Math.abs(across) < 1.5, `tree on trail at ${t.x},${t.z}`).toBe(false);
      }
    }
  });
});
