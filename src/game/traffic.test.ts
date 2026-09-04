import { describe, it, expect } from 'vitest';
import { Road } from './road';
import { Traffic } from './traffic';
import { SEGMENT_LENGTH, TRAFFIC_COUNT } from './constants';

function assignedTotal(road: Road): number {
  return road.segments.reduce((sum, s) => sum + s.cars.length, 0);
}

function freshTraffic(): { road: Road; traffic: Traffic } {
  const road = new Road();
  road.build();
  const traffic = new Traffic();
  traffic.build(road, 12000);
  return { road, traffic };
}

describe('Traffic.build', () => {
  it('spawns TRAFFIC_COUNT cars, each attached to exactly one segment', () => {
    const { road, traffic } = freshTraffic();
    expect(traffic.cars.length).toBe(TRAFFIC_COUNT);
    expect(assignedTotal(road)).toBe(TRAFFIC_COUNT);
  });

  it("puts every car in the segment matching its z", () => {
    const { road, traffic } = freshTraffic();
    for (const car of traffic.cars) {
      const expected = Math.floor(car.z / SEGMENT_LENGTH) % road.segments.length;
      expect(car.segmentIndex).toBe(expected);
      expect(road.segments[expected].cars).toContain(car);
    }
  });
});

describe('Traffic.update', () => {
  it('keeps attachment consistent as cars move (no leaks or duplicates)', () => {
    const { road, traffic } = freshTraffic();
    for (let i = 0; i < 50; i++) traffic.update(0.1, road);
    expect(assignedTotal(road)).toBe(TRAFFIC_COUNT);
  });

  it('advances a moving car and reattaches it to the right segment', () => {
    const { road, traffic } = freshTraffic();
    const car = traffic.cars[0];
    car.speed = SEGMENT_LENGTH * 5; // 5 segments per second
    const startZ = car.z;

    traffic.update(1, road);

    expect(car.z).toBeCloseTo(startZ + SEGMENT_LENGTH * 5);
    const expected = Math.floor(car.z / SEGMENT_LENGTH) % road.segments.length;
    expect(car.segmentIndex).toBe(expected);
    expect(road.segments[expected].cars).toContain(car);
    expect(assignedTotal(road)).toBe(TRAFFIC_COUNT);
  });

  it('leaves parked cars (speed 0) on their segment', () => {
    const { road, traffic } = freshTraffic();
    const car = traffic.cars[0];
    car.speed = 0;
    const idx = car.segmentIndex;
    for (let i = 0; i < 20; i++) traffic.update(0.5, road);
    expect(car.segmentIndex).toBe(idx);
  });
});
