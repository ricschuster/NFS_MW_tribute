import { describe, expect, it } from 'vitest';
import { CAR_RADIUS, PILLAR_CLEAR, PILLAR_WIDTH, STEP, UNITS_PER_METRE } from './constants';
import { CityWorld, type InputState } from './cityworld';
import { distanceToSegment } from './city/grid';
import { groundAt } from './city/terrain';

const M = UNITS_PER_METRE;
const world = new CityWorld(undefined, { traffic: false, police: false });
const { city } = world;

describe('the freeway stands on pairs of pillars (#487)', () => {
  it('holds the deck up along its length', () => {
    // 45 m apart, in pairs, along a loop of well over ten kilometres.
    expect(city.pillars.length).toBeGreaterThan(200);
  });

  it('puts no pillar on a road, so nothing that passes under the deck meets a wall', () => {
    const onRoads: string[] = [];
    for (const road of city.roads) {
      const a = city.nodes[road.a];
      const b = city.nodes[road.b];
      if (road.class === 'interstate' || (a.level !== 'surface' && b.level !== 'surface')) continue;
      for (const pillar of city.pillars) {
        const gap = distanceToSegment(pillar.at.x, pillar.at.z, a.pos.x, a.pos.z, b.pos.x, b.pos.z) - road.width / 2;
        if (gap < PILLAR_WIDTH / 2 + PILLAR_CLEAR - 1) onRoads.push(`${Math.round(pillar.at.x / M)},${Math.round(pillar.at.z / M)}`);
      }
    }
    expect(onRoads).toEqual([]);
  });

  it('stops a car driven at one', () => {
    const pillar = city.pillars.find((p) => p.height > 10 * M)!;
    const car = new CityWorld(undefined, { traffic: false, police: false });
    car.x = pillar.at.x - 20 * M;
    car.z = pillar.at.z;
    car.y = groundAt(car.city.terrain, car.x, car.z);
    car.heading = Math.PI / 2; // along +x, straight at it
    const input: InputState = { left: false, right: false, up: true, down: false, confirm: false, nitro: false };
    let closest = Infinity;
    for (let t = 0; t < 4; t += STEP) {
      car.step(STEP, input);
      if (Math.abs(car.z - pillar.at.z) < PILLAR_WIDTH / 2) closest = Math.min(closest, Math.abs(car.x - pillar.at.x));
    }
    // It got there - nothing else stopped it first - and did not go through.
    expect(closest).toBeLessThan(PILLAR_WIDTH / 2 + CAR_RADIUS + 3 * M);
    expect(closest).toBeGreaterThan(PILLAR_WIDTH / 2 + CAR_RADIUS * 0.9);
  });
});
