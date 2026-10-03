import * as THREE from 'three';
import { CAR_WIDTH_WORLD, CAR_ASPECT } from '../constants';
import { carParts, CAR_PAINT } from './carshape';
import type { CarBody } from '../cars';
import { lampGlowTexture } from './signage';

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
export function makeCar(color: string, cop = false, style: CarBody = 'coupe'): THREE.Group {
  const car = new THREE.Group();
  const parts = carParts(BODY_W, CAR_ASPECT, style);
  // The lights sit on the body this is, not the coupe's (#434).
  const bodyH = parts.height;
  const bodyL = parts.length;

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
    light.position.set(side * BODY_W * 0.33, parts.floor + bodyH * 0.45, -bodyL * 0.49);
    car.add(light);

    // And the other end (#221). There were tail lights and no headlights, so
    // an oncoming car at night was a dark shape with nothing at the front of
    // it. Unlit material, like the tail lights: a lens reads as lit because it
    // is brighter than the paint, not because the sun is on it.
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_W * 0.2, BODY_H * 0.18, BODY_L * 0.04),
      new THREE.MeshBasicMaterial({ color: HEADLIGHT_OFF }),
    );
    lamp.name = 'headlight';
    lamp.position.set(side * BODY_W * 0.32, parts.floor + bodyH * 0.4, bodyL * 0.49);
    car.add(lamp);
  }

  // Contact shadow (#580, behind `?look=pbr` with the car paint): the sun's
  // shadow map does not reach the dark crease under a car, which is what stops
  // it floating. A black quad on the road under it, made of the lamp glow's
  // radial falloff (black times a warm alpha texture is a soft black blot),
  // a little bigger than the footprint. Under the beam's height, over the road.
  if (CAR_PAINT.clearcoat) {
    const blot = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#000000',
        map: lampGlowTexture(),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        fog: true,
      }),
    );
    blot.name = 'contact';
    blot.position.y = 4;
    blot.scale.set(BODY_W * 1.9, 1, BODY_L * 1.45);
    blot.castShadow = false;
    blot.receiveShadow = false;
    car.add(blot);
  }

  // The light the headlights actually throw, which is the half that makes a
  // night street drivable rather than merely occupied.
  //
  // A quad on the road rather than a spotlight, for `lamp-glow`'s reason
  // (#180): a real light per car is a slideshow and a quad is nothing. It uses
  // the same radial texture the lamps do, stretched down the road ahead, so
  // the two kinds of light on the tarmac are made of the same thing.
  // Built whether or not the texture is: `lampGlowTexture` needs a canvas and
  // returns null without one, and a beam that exists only in a browser is a
  // beam nothing can test. Without the map this is a flat quad, which is
  // exactly what a headless run never draws.
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: lampGlowTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  );
  beam.name = 'beam';
  // Just off the deck, ahead of the nose. Any higher and it floats over a
  // kerb; any lower and it z-fights the road it is lighting.
  beam.position.set(0, 6, BODY_L * 1.9);
  beam.scale.set(BODY_W * 3.6, 1, BODY_L * 5.5);
  beam.castShadow = false;
  beam.receiveShadow = false;
  beam.visible = false;
  car.add(beam);

  return car;
}

/** A headlight lens with nothing behind it: pale, but not a lamp. */
const HEADLIGHT_OFF = '#6f7481';
/** Lit. Warm rather than white, or it reads as another police light. */
const HEADLIGHT_ON = '#fff2cf';

/**
 * A pool of car meshes reused frame to frame. Traffic comes and goes as the
 * player moves, and allocating meshes per frame would churn the heap.
 */
export class CarPool {
  /** Every mesh made, with the body it was made as (#434). */
  private readonly pool: { car: THREE.Group; style: CarBody }[] = [];
  /** This frame's cars, in the order they were placed. */
  private placed: THREE.Group[] = [];
  private readonly taken = new Set<THREE.Group>();

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
    style: CarBody = 'coupe',
  ): THREE.Group {
    // A free mesh of the same body, or a new one: a pickup cannot be repainted
    // into a coupe, so the pool keeps them apart.
    let car = this.pool.find((entry) => entry.style === style && !this.taken.has(entry.car))?.car;
    if (!car) {
      car = makeCar(color, this.cop, style);
      this.pool.push({ car, style });
      this.scene.add(car);
    }
    this.taken.add(car);
    this.placed.push(car);
    car.visible = true;
    car.position.set(x, y, z);
    car.scale.setScalar(scale);
    // Cops are coloured too now that there are six kinds of them (#58): a
    // heavy SUV has to be readable as one before it is alongside you.
    const body = car.children[0] as THREE.Mesh;
    const paint = (body.material as THREE.MeshLambertMaterial).color;
    paint.set(color);
    if (dim !== 1) paint.multiplyScalar(dim);
    return car;
  }

  /** Call before placing this frame's cars. */
  begin(): void {
    this.placed = [];
    this.taken.clear();
  }

  /** Hide whatever was not used this frame. */
  end(): void {
    for (const entry of this.pool) if (!this.taken.has(entry.car)) entry.car.visible = false;
  }

  /**
   * Turn the lights on as the city's do (#221).
   *
   * Driven by the same `lamps` figure `Cityscape.setNight` takes, so the cars
   * and the street agree about what time it is - the whole reason #180 put one
   * number behind both.
   *
   * Only over cars placed this frame: the pool holds meshes for the busiest
   * moment of the session and most of them are hidden most of the time.
   */
  setNight(amount: number): void {
    const lit = Math.max(0, Math.min(1, amount));
    for (const car of this.placed) {
      const beam = car.getObjectByName('beam') as THREE.Mesh | undefined;
      if (beam) {
        const material = beam.material as THREE.MeshBasicMaterial;
        // Well under 1, for `lamp-glow`'s reason, and under the lamps' own
        // strength as well: a beam brighter than the street lighting reads as a
        // spotlight sheet laid on the tarmac rather than as headlights.
        material.opacity = lit * 0.30;
        beam.visible = lit > 0.02;
      }
      for (const part of car.children) {
        if (part.name !== 'headlight') continue;
        ((part as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(
          lit > 0.02 ? HEADLIGHT_ON : HEADLIGHT_OFF,
        );
      }
    }
  }

  /**
   * Flash lightbars in step; `phase` is seconds.
   *
   * `from` skips the cars placed before it, which is how a patrol car keeps
   * its lights off (#177): a marked car going about its business with the
   * lightbar running is a pursuit as far as anyone glancing at it is
   * concerned, and the whole point of a patrol is that it is not one yet.
   */
  flashLightbars(phase: number, from = 0): void {
    const blue = Math.floor(phase * 6) % 2 === 0;
    for (let i = from; i < this.placed.length; i++) {
      const bar = this.placed[i].getObjectByName('lightbar') as
        THREE.Mesh | undefined;
      if (bar)
        (bar.material as THREE.MeshBasicMaterial).color.set(
          blue ? '#3b6bff' : '#ff3b30',
        );
    }
  }
}
