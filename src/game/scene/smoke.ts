import * as THREE from 'three';
import { CAR_WIDTH_WORLD, UNITS_PER_METRE } from '../constants';
import type { CityWorld } from '../cityworld';

const M = UNITS_PER_METRE;
/** How many puffs can be in the air at once; the oldest is reused after that. */
const PUFFS = 24;
/** Seconds between puffs while the wheels spin, alternating rear wheels. */
const EVERY = 0.06;
/** How long one lasts, and how big it gets. */
const LIFE = 1.1;
const START = 0.35 * M;
const GROW = 1.8 * M;
const RISE = 1.0 * M;
/** How fast a puff drifts back off the tyre it came from. */
const DRIFT = 2.4 * M;

interface Puff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  /** Which way it drifts, in the world, per second. */
  vx: number;
  vz: number;
}

/**
 * Smoke off the rear tyres during a burnout (#360).
 *
 * Drawing only: the sim says a burnout is happening (`CityWorld.burnout`) and
 * this puts grey puffs where the rear wheels are, rising and fading. A pool,
 * because a burnout is a second or two and the scene has no business
 * allocating for it; no particle system, because this is the only smoke in the
 * game and two dozen spheres are enough to read as one.
 */
export class TyreSmoke {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private next = 0;
  private since = 0;
  private side = 1;

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < PUFFS; i++) {
      const material = new THREE.MeshBasicMaterial({ color: '#d8d8d4', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.puffs.push({ mesh, material, age: LIFE, vx: 0, vz: 0 });
    }
  }

  update(dt: number, world: CityWorld): void {
    if (world.burnout > 0) {
      this.since += dt;
      while (this.since >= EVERY) {
        this.since -= EVERY;
        this.puff(world);
      }
    } else {
      this.since = 0;
    }

    for (const puff of this.puffs) {
      if (puff.age >= LIFE) continue;
      puff.age += dt;
      const t = Math.min(1, puff.age / LIFE);
      puff.mesh.visible = t < 1;
      puff.mesh.scale.setScalar(START + GROW * t);
      puff.mesh.position.x += puff.vx * dt;
      puff.mesh.position.z += puff.vz * dt;
      puff.mesh.position.y += RISE * dt;
      puff.material.opacity = 0.3 * (1 - t) * (1 - t);
    }
  }

  /** One puff at a rear wheel, the other one next time. */
  private puff(world: CityWorld): void {
    const puff = this.puffs[this.next];
    this.next = (this.next + 1) % PUFFS;
    const size = CAR_WIDTH_WORLD * world.car.scale;
    const fx = Math.sin(world.heading);
    const fz = Math.cos(world.heading);
    // Behind the car, and out to one side: right is (-z, x) of forward.
    const back = -size * 0.85;
    const out = size * 0.38 * this.side;
    this.side = -this.side;
    puff.mesh.position.set(world.x + fx * back - fz * out, world.y + 0.3 * M, world.z + fz * back + fx * out);
    // Back and a little out from its wheel, differently each time - but from
    // the slot rather than `Math.random`, so a shot of it is the same shot.
    const spread = Math.sin(this.next * 2.39996) * 0.6;
    const outward = Math.sign(out) * (0.4 + 0.3 * Math.cos(this.next * 1.7));
    puff.vx = (-fx * (1 - Math.abs(spread) * 0.3) - fz * outward + fz * spread * 0.2) * DRIFT;
    puff.vz = (-fz * (1 - Math.abs(spread) * 0.3) + fx * outward - fx * spread * 0.2) * DRIFT;
    puff.age = 0;
    puff.mesh.visible = true;
  }
}
