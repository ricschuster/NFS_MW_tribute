import * as THREE from 'three';
import { CAR_WIDTH_WORLD, CAR_ASPECT } from '../constants';
import { carParts } from './carshape';

const BODY_W = CAR_WIDTH_WORLD;
const BODY_H = CAR_WIDTH_WORLD * CAR_ASPECT * 0.62;
const BODY_L = CAR_WIDTH_WORLD * 1.9;

/**
 * One car, built out of `carshape`'s parts.
 *
 * The body goes in first and stays first: `CarPool.place` repaints
 * `children[0]` every frame for every car on screen, and a name lookup there
 * would be a scene-graph walk per car per frame for no gain.
 */
export function makeCar(color: string, cop = false): THREE.Group {
  const car = new THREE.Group();
  const parts = carParts(BODY_W, CAR_ASPECT);

  const body = parts.body;
  (body.material as THREE.MeshLambertMaterial).color.set(
    cop ? '#15171d' : color,
  );
  car.add(body);
  car.add(parts.glass);
  for (const wheel of parts.wheels) car.add(wheel);

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
    // On the roof the shape actually has, rather than at a height guessed
    // from the body: the greenhouse is raked now and its top is not the top
    // of a box.
    bar.position.y = parts.roof;
    car.add(bar);
  }

  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_W * 0.18, BODY_H * 0.2, BODY_L * 0.04),
      new THREE.MeshBasicMaterial({ color: '#ff4433' }),
    );
    light.position.set(side * BODY_W * 0.33, BODY_H * 0.75, -BODY_L * 0.49);
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

  /**
   * Take a car from the pool, placed, coloured and sized for this frame.
   *
   * `dim` darkens the body without needing a second material: a wreck is the
   * same car with the paint burnt off it (#94).
   */
  place(
    x: number,
    y: number,
    z: number,
    color: string,
    scale = 1,
    dim = 1,
  ): THREE.Group {
    let car = this.pool[this.used];
    if (!car) {
      car = makeCar(color, this.cop);
      this.pool.push(car);
      this.scene.add(car);
    }
    car.visible = true;
    car.position.set(x, y, z);
    car.scale.setScalar(scale);
    // Cops are coloured too now that there are six kinds of them (#58): a
    // heavy SUV has to be readable as one before it is alongside you.
    const body = car.children[0] as THREE.Mesh;
    const paint = (body.material as THREE.MeshLambertMaterial).color;
    paint.set(color);
    if (dim !== 1) paint.multiplyScalar(dim);
    this.used++;
    return car;
  }

  /** Call before placing this frame's cars. */
  begin(): void {
    this.used = 0;
  }

  /** Hide whatever was not used this frame. */
  end(): void {
    for (let i = this.used; i < this.pool.length; i++)
      this.pool[i].visible = false;
  }

  /** Flash every visible lightbar in step; `phase` is seconds. */
  flashLightbars(phase: number): void {
    const blue = Math.floor(phase * 6) % 2 === 0;
    for (let i = 0; i < this.used; i++) {
      const bar = this.pool[i].getObjectByName('lightbar') as
        THREE.Mesh | undefined;
      if (bar)
        (bar.material as THREE.MeshBasicMaterial).color.set(
          blue ? '#3b6bff' : '#ff3b30',
        );
    }
  }
}
