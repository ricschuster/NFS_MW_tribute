import { describe, it, expect } from 'vitest';
import { Road } from './road';
import { SEGMENT_LENGTH, RUMBLE_LENGTH, COLORS } from './constants';

describe('Road.build', () => {
  const road = new Road();
  road.build();

  it('produces segments and a matching trackLength', () => {
    expect(road.segments.length).toBeGreaterThan(0);
    expect(road.trackLength).toBe(road.segments.length * SEGMENT_LENGTH);
  });

  it('indexes segments sequentially with contiguous z', () => {
    road.segments.forEach((seg, i) => {
      expect(seg.index).toBe(i);
      expect(seg.p1.world.z).toBe(i * SEGMENT_LENGTH);
      expect(seg.p2.world.z).toBe((i + 1) * SEGMENT_LENGTH);
    });
  });

  it('alternates the rumble colour band every RUMBLE_LENGTH segments', () => {
    expect(road.segments[0].color).toBe(COLORS.LIGHT);
    expect(road.segments[RUMBLE_LENGTH].color).toBe(COLORS.DARK);
  });

  it('is vertically continuous (each segment starts where the last ended)', () => {
    for (let i = 1; i < road.segments.length; i++) {
      expect(road.segments[i].p1.world.y).toBe(road.segments[i - 1].p2.world.y);
    }
  });
});

describe('Road.findSegment', () => {
  const road = new Road();
  road.build();

  it('maps a z position to its containing segment', () => {
    expect(road.findSegment(0).index).toBe(0);
    expect(road.findSegment(SEGMENT_LENGTH * 1.5).index).toBe(1);
  });

  it('wraps around the end of the track', () => {
    const beyond = road.trackLength + SEGMENT_LENGTH * 2.5;
    expect(road.findSegment(beyond).index).toBe(2);
  });
});
