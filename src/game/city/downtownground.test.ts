import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from '../constants';
import { onApron } from './aprons';
import { DOWNTOWN_PROPS } from './downtownprops';
import { LAWN_SIZES, downtownAprons, lawnOutline } from './downtownground';
import { kestrelBay } from './index';
import { airfieldProps } from './setpieces';

const M = UNITS_PER_METRE;
const city = kestrelBay();

describe("downtown's once-over (2026-10-02)", () => {
  it('paves the district and leaves a lawn as grass in it', () => {
    const aprons = downtownAprons([{ kind: 'lawn', x: 0, z: 0, angle: 0, variant: 'small' }]);
    expect(aprons.map((a) => a.look)).toEqual(['flags', 'grass']);
    expect(aprons.every((a) => !a.yard)).toBe(true);
  });

  it('sizes a lawn by its variant, and a width set by hand wins', () => {
    const [w, l] = LAWN_SIZES.medium;
    const outline = lawnOutline({ kind: 'lawn', x: 10, z: 20, angle: 0, variant: 'medium' });
    expect(Math.max(...outline.map((p) => p.x)) - Math.min(...outline.map((p) => p.x))).toBeCloseTo(w * M);
    expect(Math.max(...outline.map((p) => p.z)) - Math.min(...outline.map((p) => p.z))).toBeCloseTo(l * M);
    const narrowed = lawnOutline({ kind: 'lawn', x: 10, z: 20, angle: 0, variant: 'medium', w: 12 });
    expect(Math.max(...narrowed.map((p) => p.x)) - Math.min(...narrowed.map((p) => p.x))).toBeCloseTo(12 * M);
  });

  it('drives paved on the plazas and as grass on the lawns', () => {
    // What looks paved drives paved (`city/aprons.ts`): a fountain stands on paving.
    const fountains = DOWNTOWN_PROPS.filter((p) => p.kind === 'fountain');
    expect(fountains.length).toBeGreaterThan(0);
    for (const f of fountains) expect(onApron(city, (f.x + 9) * M, f.z * M)).toBe(true);
    const lawns = DOWNTOWN_PROPS.filter((p) => p.kind === 'lawn');
    expect(lawns.length).toBeGreaterThan(0);
    for (const lawn of lawns) expect(onApron(city, lawn.x * M, lawn.z * M)).toBe(false);
  });

  it('makes café tables breakables and lawns nothing that stands', () => {
    const { pieces, breakables } = airfieldProps(city.terrain, 1000, [
      { kind: 'cafe-tables', x: 0, z: 0, angle: 0 },
      { kind: 'lawn', x: 0, z: 0, angle: 0, variant: 'small' },
      { kind: 'fountain', x: 50, z: 0, angle: 0 },
    ]);
    expect(breakables.map((b) => [b.kind, b.id])).toEqual([['cafe-tables', 1000]]);
    expect(pieces.map((p) => p.kind)).toEqual(['fountain']);
  });
});
