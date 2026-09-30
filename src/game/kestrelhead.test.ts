import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { groundAt } from './city/terrain';
import { routeGradeAt, startingAt } from './city/routes';
import { slopeSpeed } from './slope';

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

describe('racing up it (#454)', () => {
  it('slows the field on the climb, the way the hill slows the car it is racing', () => {
    const climb = city.routes.find((route) => route.name === 'Kestrel Climb')!;
    expect(climb.heights?.length).toBe(climb.points.length);
    // Over the length of the climb, most of the way is uphill.
    let up = 0;
    const samples = 40;
    for (let i = 0; i < samples; i++) if (routeGradeAt(climb, (climb.length * (i + 0.5)) / samples) > 0.01) up++;
    expect(up).toBeGreaterThan(samples / 2);
    // And uphill costs pace.
    expect(slopeSpeed(routeGradeAt(climb, climb.length * 0.5))).toBeLessThanOrEqual(1);
  });

  it('keeps the heights with the points when a circuit is started somewhere else', () => {
    const rim = city.routes.find((route) => route.name === 'Halloway Rim')!;
    const turned = startingAt(rim, 0.37);
    expect(turned.heights?.length).toBe(turned.points.length);
    for (let i = 1; i < turned.points.length; i++) {
      const j = rim.points.indexOf(turned.points[i]);
      if (j >= 0) expect(turned.heights![i]).toBe(rim.heights![j]);
    }
  });
});
