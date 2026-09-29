import { describe, it, expect } from 'vitest';
import { CityWorld } from './cityworld';
import { kestrelBay } from './city/index';
import { guidePath } from './guide';
import { CITY_COUNTDOWN, GUIDE_AHEAD, GUIDE_STEP, UNITS_PER_METRE } from './constants';

const M = UNITS_PER_METRE;
const city = kestrelBay();
const NONE = { up: false, down: false, left: false, right: false, nitro: false, confirm: false };
const lengthOf = (points: { x: number; z: number }[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);

// The lines on the road (#443) are drawn along whatever this returns.
describe('the way ahead', () => {
  it('is nothing with no race and nowhere to go', () => {
    const world = new CityWorld(city, { traffic: false, police: false });
    expect(guidePath(world)).toEqual([]);
  });

  it('follows the race route from the car, for the length the lines run', () => {
    const world = new CityWorld(city, { traffic: false, police: false });
    const route = world.city.routes.find((r) => r.kind === 'circuit')!;
    world.x = route.start.x;
    world.z = route.start.z;
    world.step(1 / 60, { ...NONE, confirm: true });
    for (let t = 0; t < CITY_COUNTDOWN + 0.2; t += 1 / 60) world.step(1 / 60, NONE);
    const path = guidePath(world);
    expect(path.length).toBeGreaterThan(10);
    expect(Math.hypot(path[0].x - world.x, path[0].z - world.z)).toBeLessThan(40 * M);
    expect(lengthOf(path)).toBeGreaterThan(GUIDE_AHEAD - 3 * GUIDE_STEP);
    expect(lengthOf(path)).toBeLessThanOrEqual(GUIDE_AHEAD + GUIDE_STEP);
  });

  it('follows the way to a Quick Menu destination from the nearest point of it', () => {
    const world = new CityWorld(city, { traffic: false, police: false });
    const repair = world.city.repairs[0];
    world.aimAt({ x: repair.at.x, z: repair.at.z, label: 'Repair shop' });
    expect(world.markerPath.length).toBeGreaterThan(1);
    const path = guidePath(world);
    expect(path.length).toBeGreaterThan(1);
    const nearest = Math.min(...world.markerPath.map((p) => Math.hypot(p.x - world.x, p.z - world.z)));
    expect(Math.hypot(path[0].x - world.x, path[0].z - world.z)).toBeLessThanOrEqual(nearest + 1);
    expect(lengthOf(path)).toBeLessThanOrEqual(GUIDE_AHEAD + GUIDE_STEP);
  });
});
