import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { groundAt } from './city/terrain';

const M = UNITS_PER_METRE;
const { city } = new CityWorld(undefined, { traffic: false, police: false });
const at = (x: number, z: number) => ({ x: x * M, z: z * M });

/** The road nearest a point, in metres. */
function roadAt(p: { x: number; z: number }) {
  let best = city.roads[0];
  let gap = Infinity;
  for (const road of city.roads) {
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
    if (d < gap) {
      gap = d;
      best = road;
    }
  }
  return best;
}

describe('Kestrel Head (#454)', () => {
  it('races uphill to the fort: the Kestrel Climb', () => {
    const climb = city.routes.find((route) => route.name === 'Kestrel Climb')!;
    expect(climb.kind).toBe('sprint');
    const first = climb.points[0];
    const last = climb.points[climb.points.length - 1];
    const rise = (groundAt(city.terrain, last.x, last.z) - groundAt(city.terrain, first.x, first.z)) / M;
    expect(rise).toBeGreaterThan(90);
    expect(Math.hypot(last.x / M - 1340, last.z / M + 400)).toBeLessThan(10);
  });

  it('keeps a second way down: a gravel track off the far side, to the road below', () => {
    expect(roadAt(at(1410, -560)).surface).toBe('gravel');
    expect(roadAt(at(1228, -1028)).surface).toBe('gravel');
    // The track reaches the road it was routed to: a gravel end within a few metres of it.
    const ends = city.roads
      .filter((road) => road.surface === 'gravel')
      .flatMap((road) => [city.nodes[road.a], city.nodes[road.b]])
      .map((node) => Math.hypot(node.pos.x / M - 1091, node.pos.z / M + 1802));
    expect(Math.min(...ends)).toBeLessThan(30);
  });

  it('leaves the road up the hill tarmac, however it meets the gravel', () => {
    // A drawn surface is the road's own (`ownSurface`): it does not spread down
    // the road that leads to it the way a place's surface does.
    for (const [x, z] of [[1300, -330], [1178, -322], [616, 134]]) expect(roadAt(at(x, z)).surface).toBe('asphalt');
  });
});
