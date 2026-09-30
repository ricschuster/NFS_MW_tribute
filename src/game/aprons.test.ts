import { describe, expect, it } from 'vitest';
import { UNITS_PER_METRE } from './constants';
import { CityWorld } from './cityworld';
import { onApron } from './city/aprons';
import { surfaceAt } from './city/grid';
import { groundAt } from './city/terrain';

const M = UNITS_PER_METRE;
const world = new CityWorld(undefined, { traffic: false, police: false });
const { city } = world;

/** A point off every road, in the open, on paving or on grass as asked. */
function openGround(paved: boolean) {
  const centre = { x: -1634 * M, z: -1955 * M };
  for (let r = 0; r < 2500; r += 7) {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const x = centre.x + Math.cos(a) * r * M;
      const z = centre.z + Math.sin(a) * r * M;
      const y = groundAt(city.terrain, x, z);
      if (y < 1 * M || onApron(city, x, z) !== paved) continue;
      if (surfaceAt(city, world.grid, x, z, y).road) continue;
      const pieces = city.setPieces.some((p) => Math.hypot(p.at.x - x, p.at.z - z) < 25 * M);
      if (!pieces) return { x, z, y };
    }
  }
  throw new Error('no open ground found');
}

/** Put the car there at `frac` of top speed, throttle held, and see what it keeps. */
function hold(at: { x: number; z: number; y: number }, frac: number) {
  const w = new CityWorld(city, { traffic: false, police: false });
  w.x = at.x;
  w.z = at.z;
  w.y = at.y;
  w.speed = w.maxSpeed * frac;
  for (let i = 0; i < 20; i++) w.step(1 / 60, { left: false, right: false, up: true, down: false, confirm: false, nitro: false });
  return w.speed / w.maxSpeed;
}

describe('the wharf is paved (#410)', () => {
  it('has an apron, and the middle of the yard is on it', () => {
    const wharf = city.aprons.filter((apron) => apron.yard);
    expect(wharf.length).toBe(1);
    expect(wharf[0].look).toBe('concrete');
    expect(onApron(city, -1634 * M, -1955 * M)).toBe(true);
    expect(onApron(city, 0, 0)).toBe(false);
  });

  it('drives nearly as fast off the road on the paving as on the road', () => {
    expect(hold(openGround(true), 0.8)).toBeGreaterThan(0.78);
  });

  it('still holds a car back on open grass', () => {
    expect(hold(openGround(false), 0.8)).toBeLessThan(0.7);
  });
});

describe('the race on the quay (#451)', () => {
  const quay = city.routes.find((route) => route.name === 'Sablet Quay')!;
  /** The road under a point on the route: the nearest one. */
  const roadAt = (p: { x: number; z: number }) => {
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
  };

  it('is a two-lap circuit round the quay, on the wharf\'s own roads', () => {
    expect(quay).toBeDefined();
    expect(quay.kind).toBe('circuit');
    expect(quay.laps).toBe(2);
    expect(quay.length / M).toBeGreaterThan(2500);
    for (const p of quay.points) expect(roadAt(p).yard).toBe(true);
  });

  it('keeps civilian traffic out of the yard', () => {
    const w = new CityWorld(city, { police: false });
    w.x = quay.start.x;
    w.z = quay.start.z;
    for (let i = 0; i < 60 * 30; i++) {
      w.step(1 / 60, { left: false, right: false, up: false, down: false, confirm: false, nitro: false });
      for (const car of w.traffic.cars) expect(car.road.yard).toBeFalsy();
    }
  });
});

describe('Kestrel Head\'s castle is cobbled (#454)', () => {
  it('paves the bailey and the inner courtyard, and keeps them open to anyone', () => {
    const castle = city.aprons.filter((apron) => apron.look === 'cobbles');
    expect(castle.length).toBe(2);
    for (const apron of castle) expect(apron.yard).toBe(false);
    // In the bailey, beside the road; in the courtyard, by the keep.
    expect(onApron(city, 1297 * M, -325 * M)).toBe(true);
    expect(onApron(city, 1370 * M, -470 * M)).toBe(true);
    // And not outside the walls.
    expect(onApron(city, 1200 * M, -400 * M)).toBe(false);
  });
});
