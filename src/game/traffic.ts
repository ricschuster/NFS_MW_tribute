import type { Car } from './types';
import type { Road } from './road';
import { SEGMENT_LENGTH, TRAFFIC_COUNT, CAR_COLORS } from './constants';
import { increase } from './math';

function choice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Manages the traffic cars on the track. Each car is attached to the segment
 * it currently rests on so the renderer can draw it back-to-front using that
 * segment's projection, and reassigned as it moves.
 */
export class Traffic {
  cars: Car[] = [];

  /**
   * Populate the track with a mix of parked, slower same-direction, and
   * oncoming cars. `maxSpeed` is the player's top speed, used to scale traffic
   * speeds so they read as slow/fast relative to the player.
   */
  build(road: Road, maxSpeed: number): void {
    this.cars = [];
    const len = road.segments.length;
    // keep the first and last stretch clear so nothing spawns on the player
    const span = Math.max(1, len - 40);

    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      const roll = Math.random();
      let speed: number;
      let offset: number;

      if (roll < 0.4) {
        // parked / stalled
        speed = 0;
        offset = choice([-0.9, -0.5, 0.5, 0.9]);
      } else if (roll < 0.8) {
        // slower traffic travelling your way
        speed = maxSpeed * (0.12 + Math.random() * 0.2);
        offset = choice([-0.5, 0, 0.5]);
      } else {
        // oncoming, hugging the opposite lane
        speed = -maxSpeed * (0.1 + Math.random() * 0.12);
        offset = choice([0.6, 0.9]);
      }

      const z = (20 + Math.floor(Math.random() * span)) * SEGMENT_LENGTH;
      const segmentIndex = Math.floor(z / SEGMENT_LENGTH) % len;
      const car: Car = { offset, z, speed, color: choice(CAR_COLORS), segmentIndex };

      this.cars.push(car);
      road.segments[segmentIndex].cars.push(car);
    }
  }

  /** Advance moving cars and keep each one attached to its current segment. */
  update(dt: number, road: Road): void {
    const len = road.segments.length;
    for (const car of this.cars) {
      if (car.speed !== 0) {
        car.z = increase(car.z, dt * car.speed, road.trackLength);
      }
      const newIndex = Math.floor(car.z / SEGMENT_LENGTH) % len;
      if (newIndex !== car.segmentIndex) {
        const from = road.segments[car.segmentIndex].cars;
        const at = from.indexOf(car);
        if (at >= 0) from.splice(at, 1);
        road.segments[newIndex].cars.push(car);
        car.segmentIndex = newIndex;
      }
    }
  }
}
