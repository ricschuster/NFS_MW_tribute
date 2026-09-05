import { describe, it, expect } from 'vitest';
import { Collectibles } from './collectibles';
import { RepLedger } from './rep';
import { kestrelBay } from './city/index';
import {
  BILLBOARD_COUNT,
  BILLBOARD_HIT,
  CAMERA_RANGE,
  CAMERA_MIN_SPEED,
  BILLBOARD_SPACING,
  CAMERA_SPACING,
  UNITS_PER_METRE,
} from './constants';

const city = kestrelBay();

describe('what there is to find in Kestrel Bay', () => {
  it('scatters billboards across the map rather than piling them up', () => {
    const boards = city.collectibles.filter((c) => c.kind === 'billboard');
    expect(boards.length).toBe(BILLBOARD_COUNT);

    for (let i = 0; i < boards.length; i++) {
      for (let j = i + 1; j < boards.length; j++) {
        const gap = Math.hypot(
          boards[i].at.x - boards[j].at.x,
          boards[i].at.z - boards[j].at.z,
        );
        expect(gap).toBeGreaterThanOrEqual(BILLBOARD_SPACING - 1);
      }
    }
  });

  // A camera on a residential street is a camera nobody ever goes past fast
  // enough for it to be worth anything.
  it('only puts cameras on roads worth speeding on', () => {
    const cameras = city.collectibles.filter((c) => c.kind === 'camera');
    expect(cameras.length).toBeGreaterThan(0);
    for (const camera of cameras) {
      const road = city.roads[camera.road];
      expect(['arterial', 'boulevard', 'interstate']).toContain(road.class);
    }
  });

  it('keeps the cameras apart too', () => {
    const cameras = city.collectibles.filter((c) => c.kind === 'camera');
    for (let i = 0; i < cameras.length; i++) {
      for (let j = i + 1; j < cameras.length; j++) {
        const gap = Math.hypot(
          cameras[i].at.x - cameras[j].at.x,
          cameras[i].at.z - cameras[j].at.z,
        );
        expect(gap).toBeGreaterThanOrEqual(CAMERA_SPACING - 1);
      }
    }
  });

  it('gives every one a stable id, so a save file means something', () => {
    const ids = new Set(city.collectibles.map((c) => c.id));
    expect(ids.size).toBe(city.collectibles.length);
  });

  it('keeps them on the map', () => {
    for (const item of city.collectibles) {
      expect(item.at.x).toBeGreaterThanOrEqual(city.bounds.minX);
      expect(item.at.x).toBeLessThanOrEqual(city.bounds.maxX);
      expect(item.at.z).toBeGreaterThanOrEqual(city.bounds.minZ);
      expect(item.at.z).toBeLessThanOrEqual(city.bounds.maxZ);
    }
  });

  it('is the same city twice', () => {
    const again = kestrelBay();
    expect(again.collectibles.length).toBe(city.collectibles.length);
    expect(again.collectibles[0]).toEqual(city.collectibles[0]);
  });
});

describe('finding them', () => {
  const board = city.collectibles.find((c) => c.kind === 'billboard')!;
  const camera = city.collectibles.find((c) => c.kind === 'camera')!;
  const at = (item: typeof board, off = 0) => ({ x: item.at.x + off, z: item.at.z, y: item.y });

  it('smashes a billboard you drive into, once', () => {
    const found = new Collectibles(city);
    const rep = new RepLedger();

    found.update(1 / 60, at(board), 0.5, rep, 1);
    expect(found.smashed.has(board.id)).toBe(true);
    const paid = rep.total;
    expect(paid).toBeGreaterThan(0);

    found.update(1 / 60, at(board), 0.5, rep, 1);
    expect(rep.total).toBe(paid);
  });

  it('leaves one you only drove near', () => {
    const found = new Collectibles(city);
    found.update(1 / 60, at(board, BILLBOARD_HIT * 3), 0.5, new RepLedger(), 1);
    expect(found.smashed.has(board.id)).toBe(false);
  });

  it('is not smashed from the deck above it', () => {
    const found = new Collectibles(city);
    found.update(1 / 60, { ...at(board), y: board.y + 12 * UNITS_PER_METRE }, 0.5, new RepLedger(), 1);
    expect(found.smashed.has(board.id)).toBe(false);
  });

  it('clocks a camera you pass at speed', () => {
    const found = new Collectibles(city);
    const rep = new RepLedger();
    found.update(1 / 60, at(camera), 0.8, rep, 1);

    expect(found.clocked.get(camera.id)).toBeCloseTo(0.8);
    expect(rep.total).toBeGreaterThan(0);
    expect(found.flash?.best).toBe(true);
  });

  it('ignores a camera you crawl past', () => {
    const found = new Collectibles(city);
    found.update(1 / 60, at(camera), CAMERA_MIN_SPEED * 0.5, new RepLedger(), 1);
    expect(found.clocked.has(camera.id)).toBe(false);
  });

  // Parking beside a camera and blipping the throttle must not be a scoring
  // strategy: it fires on the way in, and not again until you have left.
  it('fires once per pass, not once per frame', () => {
    const found = new Collectibles(city);
    const rep = new RepLedger();
    found.update(1 / 60, at(camera), 0.5, rep, 1);
    const paid = rep.total;
    for (let i = 0; i < 60; i++) found.update(1 / 60, at(camera), 0.9, rep, 1);
    expect(rep.total).toBe(paid);
  });

  it('keeps only your best, and pays only when you beat it', () => {
    const found = new Collectibles(city);
    const rep = new RepLedger();
    const away = at(camera, CAMERA_RANGE * 4);

    found.update(1 / 60, at(camera), 0.5, rep, 1);
    const first = rep.total;
    found.update(1 / 60, away, 0.5, rep, 1);

    // Slower: recorded as a pass, but it is not a best and pays nothing.
    found.update(1 / 60, at(camera), 0.4, rep, 1);
    expect(found.clocked.get(camera.id)).toBeCloseTo(0.5);
    expect(rep.total).toBe(first);
    expect(found.flash?.best).toBe(false);

    found.update(1 / 60, away, 0.4, rep, 1);
    found.update(1 / 60, at(camera), 0.9, rep, 1);
    expect(found.clocked.get(camera.id)).toBeCloseTo(0.9);
    expect(rep.total).toBeGreaterThan(first);
  });

  it('pays more for going past faster', () => {
    const slow = new RepLedger();
    const fast = new RepLedger();
    new Collectibles(city).update(1 / 60, at(camera), 0.4, slow, 1);
    new Collectibles(city).update(1 / 60, at(camera), 1, fast, 1);
    expect(fast.total).toBeGreaterThan(slow.total);
  });

  it('remembers a collection it is handed', () => {
    const found = new Collectibles(city);
    found.load([board.id], [[camera.id, 0.77]]);
    expect(found.smashed.has(board.id)).toBe(true);
    expect(found.clocked.get(camera.id)).toBe(0.77);
    expect(found.remaining).toBe(found.billboards.length - 1);

    // And does not pay again for what it already has.
    const rep = new RepLedger();
    found.update(1 / 60, at(board), 0.5, rep, 1);
    expect(rep.total).toBe(0);
  });
});
