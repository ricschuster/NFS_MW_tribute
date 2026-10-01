import { describe, expect, it } from 'vitest';
import { kestrelBay } from './index';
import { onApron } from './aprons';
import { distanceToSegment } from './grid';

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

  it('stops short of the junctions, so no pavement is laid over another road', () => {
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
