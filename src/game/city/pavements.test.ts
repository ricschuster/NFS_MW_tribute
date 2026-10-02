import { describe, expect, it } from 'vitest';
import { kestrelBay } from './index';
import { onApron } from './aprons';
import { distanceToSegment } from './grid';
import { PLAN_DISTRICTS, inArea } from './plan';
import { UNITS_PER_METRE } from '../constants';

// Downtown's pavements (#268): paved from the kerb to the building line, and
// never laid over a road they do not belong to.
describe("downtown's pavements", () => {
  const city = kestrelBay();
  const middle = (outline: { x: number; z: number }[]) => ({
    x: outline.reduce((s, p) => s + p.x, 0) / outline.length,
    z: outline.reduce((s, p) => s + p.z, 0) / outline.length,
  });

  it('paves both sides of downtown', () => {
    expect(city.pavements.length).toBeGreaterThan(500);
  });

  it('drives paved: a car on a pavement is on an apron, not on the grass', () => {
    for (const pavement of city.pavements) {
      const at = middle(pavement.outline);
      expect(onApron(city, at.x, at.z)).toBe(true);
    }
  });

  it('is never laid over a road it does not belong to', () => {
    const surface = city.roads.filter((r) => r.class !== 'interstate' && r.class !== 'ramp');
    let over = 0;
    for (const pavement of city.pavements) {
      const at = middle(pavement.outline);
      for (const r of surface) {
        const a = city.nodes[r.a].pos, b = city.nodes[r.b].pos;
        if (distanceToSegment(at.x, at.z, a.x, a.z, b.x, b.z) < r.width / 2 - 0.5) over++;
      }
    }
    expect(over).toBe(0);
  });
});

// The corners (#268): where two streets meet, the pavement turns the corner
// with the kerb rather than stopping at each street's edge and leaving the
// square between them as grass.
describe("downtown's pavements at a junction", () => {
  const city = kestrelBay();
  const area = PLAN_DISTRICTS.find((a) => a.kind === 'downtown')!;
  const surface = city.roads.filter((r) => r.class !== 'interstate' && r.class !== 'ramp' && !r.bridge);
  const at = new Map<number, typeof surface>();
  for (const r of surface) for (const n of [r.a, r.b]) at.set(n, [...(at.get(n) ?? []), r]);

  it('paves the corner of nearly every junction', () => {
    let corners = 0;
    let paved = 0;
    for (const [n, here] of at) {
      const o = city.nodes[n].pos;
      if (here.length < 3 || !inArea(area.poly, o)) continue;
      const legs = here
        .map((r) => {
          const far = city.nodes[r.a === n ? r.b : r.a].pos;
          const length = Math.hypot(far.x - o.x, far.z - o.z);
          return { d: { x: (far.x - o.x) / length, z: (far.z - o.z) / length }, mid: r.width / 2 + 0.5 * UNITS_PER_METRE, length };
        })
        .filter((l) => l.length > 10 * UNITS_PER_METRE)
        .map((l) => ({ ...l, angle: Math.atan2(l.d.z, l.d.x) }))
        .sort((p, q) => p.angle - q.angle);
      for (let k = 0; k < legs.length; k++) {
        const i = legs[k], j = legs[(k + 1) % legs.length];
        let sweep = j.angle - i.angle;
        if (sweep <= 0) sweep += 2 * Math.PI;
        // A square corner, give or take, and the point half a metre in from
        // both kerbs: the strips alone stop short of it, which is the grass
        // this is about (41 of 304 were paved before the corners were).
        if (sweep < Math.PI / 3 || sweep > (2 * Math.PI) / 3) continue;
        const ni = { x: -i.d.z, z: i.d.x };
        const p = { x: o.x + ni.x * i.mid, z: o.z + ni.z * i.mid };
        // Slide along i until j's offset is its own middle.
        const nj = { x: j.d.z, z: -j.d.x };
        const offJ = (s: number) => (p.x + i.d.x * s - o.x) * nj.x + (p.z + i.d.z * s - o.z) * nj.z;
        const s = (j.mid - offJ(0)) / (offJ(1) - offJ(0));
        const x = p.x + i.d.x * s, z = p.z + i.d.z * s;
        if (surface.some((r) => {
          const a = city.nodes[r.a].pos, b = city.nodes[r.b].pos;
          return distanceToSegment(x, z, a.x, a.z, b.x, b.z) < r.width / 2;
        })) continue;
        corners++;
        if (onApron(city, x, z)) paved++;
      }
    }
    expect(corners).toBeGreaterThan(100);
    expect(paved / corners).toBeGreaterThan(0.95);
  });
});
