import * as THREE from 'three';
import { CAR_WIDTH_WORLD, CAR_ASPECT } from '../constants';

const BODY_W = CAR_WIDTH_WORLD;
const BODY_H = CAR_WIDTH_WORLD * CAR_ASPECT * 0.62;
const BODY_L = CAR_WIDTH_WORLD * 1.9;

/**
 * A car as a handful of boxes. Deliberately crude: issue #84's geometry
 * provider is where real meshes will come from, and until then the shape only
 * has to read as a car from behind at speed.
 */
export function makeCar(color: string, cop = false): THREE.Group {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_W, BODY_H, BODY_L),
    new THREE.MeshLambertMaterial({ color: cop ? '#15171d' : color }),
  );
  body.position.y = BODY_H / 2 + BODY_W * 0.1;
  car.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_W * 0.84, BODY_H * 0.8, BODY_L * 0.46),
    new THREE.MeshLambertMaterial({ color: '#1a2030' }),
  );
  cabin.position.set(0, BODY_H * 1.28, -BODY_L * 0.06);
  car.add(cabin);

  if (cop) {
    // white door band, so a cop reads as a cop rather than a dark car
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_W * 1.01, BODY_H * 0.34, BODY_L * 0.9),
      new THREE.MeshLambertMaterial({ color: '#e9edf2' }),
    );
    band.position.y = BODY_H * 0.62;
    car.add(band);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_W * 0.66, BODY_H * 0.22, BODY_L * 0.14),
      new THREE.MeshBasicMaterial({ color: '#3b6bff' }),
    );
    bar.name = 'lightbar';
    bar.position.y = BODY_H * 1.78;
    car.add(bar);
  }

  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_W * 0.18, BODY_H * 0.2, BODY_L * 0.04),
      new THREE.MeshBasicMaterial({ color: '#ff4433' }),
    );
    light.position.set(side * BODY_W * 0.33, BODY_H * 0.75, -BODY_L / 2);
    car.add(light);
  }

  return car;
}

/**
 * A pool of car meshes reused frame to frame. Traffic comes and goes as the
 * player moves, and allocating meshes per frame would churn the heap.
 */
export class CarPool {
  private readonly pool: THREE.Group[] = [];
  private used = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly cop = false,
  ) {}

  /** Take a car from the pool, placed and coloured for this frame. */
  place(x: number, y: number, z: number, color: string): THREE.Group {
    let car = this.pool[this.used];
    if (!car) {
      car = makeCar(color, this.cop);
      this.pool.push(car);
      this.scene.add(car);
    }
    car.visible = true;
    car.position.set(x, y, z);
    if (!this.cop) {
      const body = car.children[0] as THREE.Mesh;
      (body.material as THREE.MeshLambertMaterial).color.set(color);
    }
    this.used++;
    return car;
  }

  /** Call before placing this frame's cars. */
  begin(): void {
    this.used = 0;
  }

  /** Hide whatever was not used this frame. */
  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /** Flash every visible lightbar in step; `phase` is seconds. */
  flashLightbars(phase: number): void {
    const blue = Math.floor(phase * 6) % 2 === 0;
    for (let i = 0; i < this.used; i++) {
      const bar = this.pool[i].getObjectByName('lightbar') as THREE.Mesh | undefined;
      if (bar) (bar.material as THREE.MeshBasicMaterial).color.set(blue ? '#3b6bff' : '#ff3b30');
    }
  }
}
