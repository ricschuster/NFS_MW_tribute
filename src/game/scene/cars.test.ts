import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCar, CarPool } from './cars';

/**
 * Headlights (#221).
 *
 * A playtest liked the run into night and then said the obvious thing about it:
 * "headlights would be good, currently very dark at night otherwise". Cars had
 * tail lights and nothing at the front, so an oncoming car after dark was a
 * dark shape and the road ahead was unlit.
 *
 * These are cheap structural checks rather than a judgement about how it looks -
 * that is what `HOUR=2 npm run cityshot -- --view hour` is for. What they catch
 * is the light going out: a rename, a reordered child list, or a pool that
 * stops being told what time it is.
 */
const lit = (car: THREE.Object3D) =>
  car.children.filter((part) => part.name === 'headlight') as THREE.Mesh[];

describe('a car', () => {
  it('has a light at each corner of the front', () => {
    const car = makeCar('#ff0000');
    expect(lit(car)).toHaveLength(2);
    // One either side of the centreline, both at the front.
    const xs = lit(car).map((l) => l.position.x);
    expect(Math.sign(xs[0])).toBe(-Math.sign(xs[1]));
    for (const lamp of lit(car)) expect(lamp.position.z).toBeGreaterThan(0);
  });

  it('throws a beam that starts out', () => {
    const car = makeCar('#ff0000');
    const beam = car.getObjectByName('beam') as THREE.Mesh;
    expect(beam).toBeDefined();
    // Ahead of the car, not under it.
    expect(beam.position.z).toBeGreaterThan(0);
    // Off by day, and off is off rather than merely transparent: an additive
    // quad at zero opacity still costs a draw.
    expect(beam.visible).toBe(false);
  });

  it('is a police car with lights of its own, and still has headlights', () => {
    const cop = makeCar('#101010', true);
    expect(cop.getObjectByName('lightbar')).toBeDefined();
    expect(lit(cop)).toHaveLength(2);
  });
});

describe('a pool of cars at night', () => {
  const placed = () => {
    const scene = new THREE.Scene();
    const pool = new CarPool(scene);
    pool.begin();
    pool.place(0, 0, 0, '#ff0000');
    pool.place(100, 0, 0, '#00ff00');
    pool.end();
    return { pool, scene };
  };

  it('turns the lights on when the street lamps come on', () => {
    const { pool, scene } = placed();
    pool.setNight(1);
    const cars = scene.children.filter((c) => c.type === 'Group');
    expect(cars.length).toBeGreaterThan(0);
    for (const car of cars) {
      const beam = car.getObjectByName('beam') as THREE.Mesh;
      expect(beam.visible).toBe(true);
      expect((beam.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
    }
  });

  it('turns them off again by day', () => {
    const { pool, scene } = placed();
    pool.setNight(1);
    pool.setNight(0);
    for (const car of scene.children.filter((c) => c.type === 'Group')) {
      expect((car.getObjectByName('beam') as THREE.Mesh).visible).toBe(false);
    }
  });

  it('leaves cars it did not place this frame alone', () => {
    // The pool holds meshes for the busiest moment of a session and hides the
    // rest; lighting all of them would put beams on the road where no car is.
    const scene = new THREE.Scene();
    const pool = new CarPool(scene);
    pool.begin();
    pool.place(0, 0, 0, '#ff0000');
    pool.place(100, 0, 0, '#00ff00');
    pool.end();
    pool.begin();
    pool.place(0, 0, 0, '#ff0000');
    pool.end();
    pool.setNight(1);

    const cars = scene.children.filter((c) => c.type === 'Group');
    const beams = cars.map((c) => (c.getObjectByName('beam') as THREE.Mesh).visible);
    expect(beams.filter(Boolean)).toHaveLength(1);
  });
});
