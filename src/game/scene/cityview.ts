import * as THREE from 'three';
import type { City } from '../city/types';
import { UNITS_PER_METRE } from '../constants';
import { segmentIntersection } from '../city/grid';
import { CameraDirector } from './cameras';
import type { Hud } from './hud';
import { Cityscape } from './cityscape';
import { makeCar, CarPool } from './cars';
import type { CityWorld } from '../cityworld';
import { STEP, COP_UNITS } from '../constants';
import type { InputState } from '../world';

const M = UNITS_PER_METRE;

/**
 * A camera you can fly around Kestrel Bay with (#84).
 *
 * The car cannot be driven in the city yet - its motion model is still
 * road-relative until #86 - so this is how the city gets looked at in the
 * meantime, and how `npm run cityshot` screenshots it. It is scaffolding, but
 * not throwaway scaffolding: a free camera over the world stays useful as a
 * debug and photo view once there is a car down there.
 *
 * Named viewpoints exist so screenshots are comparable between runs. A shot of
 * "wherever the camera drifted to" cannot show that a change made anything
 * better or worse.
 */
export type Viewpoint = 'aerial' | 'downtown' | 'bridge' | 'street' | 'overpass';

interface Shot {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const HAZE = new THREE.Color('#b9d0e2');

export class CityView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cityscape: Cityscape;
  private readonly city: City;
  private readonly skyDome: THREE.Mesh;

  /** Where the camera is looking, in yaw/pitch, so flying feels like flying. */
  private yaw = 0;
  private pitch = -0.35;
  private readonly velocity = new THREE.Vector3();
  private readonly held = new Set<string>();
  private dragging = false;
  private last = performance.now();

  /** When set, the camera chases this car instead of flying free. */
  private world: CityWorld | null = null;
  private hud: Hud | null = null;
  private readonly car = makeCar('#d8442f');
  private readonly trafficCars: CarPool;
  private readonly copCars: CarPool;
  private readonly wreckCars: CarPool;
  private siren = 0;
  private readonly director: CameraDirector;
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement, city: City) {
    this.city = city;

    // A 5 km city seen from 2 km up spans a depth range a normal buffer cannot
    // hold: road markings 6 cm above the asphalt z-fight into streaks by the
    // far side of the map. A logarithmic buffer spends its precision where the
    // geometry actually is.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene.background = HAZE;
    // The map has an edge, and fog is what stops you seeing it end. Its range
    // is set per frame from how high the camera is: fog tuned for a street is
    // an opaque wall from 2 km up, and fog tuned for altitude does nothing at
    // street level.
    this.scene.fog = new THREE.Fog(HAZE, 400 * M, 2600 * M);

    // A city 5 km across needs a far plane to match. The near plane is kept
    // well off zero so the depth buffer still has precision left at distance.
    // Far enough to reach the sea drawn beyond the map edge, or the horizon
    // gets clipped away and the bay ends in mid-air.
    this.camera = new THREE.PerspectiveCamera(60, 1, 2 * M, 14000 * M);

    const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
    sun.position.set(-0.5, 1, 0.4).multiplyScalar(1000 * M);
    this.scene.add(sun);
    // Generous fill: under a single hard sun every face turned away goes black
    // and the city reads as silhouettes rather than as buildings.
    this.scene.add(new THREE.HemisphereLight('#cfe6f7', '#7d7466', 1.7));

    this.skyDome = this.sky();
    this.scene.add(this.skyDome);

    this.cityscape = new Cityscape(city);
    this.scene.add(this.cityscape.group);

    this.car.visible = false;
    this.scene.add(this.car);
    this.trafficCars = new CarPool(this.scene);
    this.copCars = new CarPool(this.scene, true);
    // Wrecks come out of their own pool rather than the one they were in: a
    // wrecked cruiser has stopped being a cop car, lightbar included.
    this.wreckCars = new CarPool(this.scene);
    // Honour the same preference the Canvas game does: no orbit, no cuts, no
    // shake, just a camera behind the car.
    this.director = new CameraDirector(
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    );

    this.look('aerial');
    this.listen(canvas);
  }

  /**
   * Drive `world` instead of flying. The camera becomes a chase camera and the
   * car appears; #88 is where cameras become a first-class concept, so this is
   * the simplest thing that lets the city be driven in the meantime.
   */
  drive(world: CityWorld, hud: Hud | null = null): void {
    this.world = world;
    this.hud = hud;
    this.car.visible = true;
  }

  /** A gradient dome, so the horizon is a horizon and not a flat wall of colour. */
  private sky(): THREE.Mesh {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(5000 * M, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color('#4d86c4') }, bottom: { value: HAZE } },
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz - cameraPosition;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 bottom;
          varying vec3 vWorld;
          void main() {
            float h = clamp(pow(max(normalize(vWorld).y, 0.0), 0.55), 0.0, 1.0);
            gl_FragColor = vec4(mix(bottom, top, h), 1.0);
          }`,
      }),
    );
    sky.frustumCulled = false;
    return sky;
  }

  /** The average centre of every superblock of one district. */
  private districtCentre(kind: string): THREE.Vector3 {
    const cells = this.city.superblocks.filter((s) => s.district === kind);
    const at = new THREE.Vector3();
    for (const cell of cells) {
      at.x += (cell.bounds.minX + cell.bounds.maxX) / 2 / cells.length;
      at.z += (cell.bounds.minZ + cell.bounds.maxZ) / 2 / cells.length;
    }
    return at;
  }

  /** Put the camera at a named viewpoint, so two runs can be compared. */
  look(where: Viewpoint): void {
    const shot = this.shotFor(where);
    this.camera.position.copy(shot.position);

    const to = shot.target.clone().sub(shot.position);
    this.yaw = Math.atan2(-to.x, -to.z);
    this.pitch = Math.asin(to.clone().normalize().y);
    this.aim();
  }

  private shotFor(where: Viewpoint): Shot {
    const centre = new THREE.Vector3(
      (this.city.bounds.minX + this.city.bounds.maxX) / 2,
      0,
      (this.city.bounds.minZ + this.city.bounds.maxZ) / 2,
    );

    if (where === 'aerial') {
      // From the south, so north is at the top and the shot lines up with the
      // map `npm run city` draws. Two pictures of the same city that disagree
      // about which way is up are worth less than either alone.
      return {
        position: new THREE.Vector3(centre.x, 2200 * M, centre.z - 2900 * M),
        target: centre,
      };
    }

    if (where === 'downtown') {
      const at = this.districtCentre('downtown');
      return { position: new THREE.Vector3(at.x - 700 * M, 280 * M, at.z + 900 * M), target: at };
    }

    if (where === 'overpass') {
      // Look along a street at the point the interstate crosses over it. This
      // is the shot that shows what ADR-0004 bought: two roads, one map
      // position, no way to turn from one onto the other. It has to be taken
      // from the street below, so find a real crossing rather than guessing at
      // a spot - guessing puts the camera inside a building.
      const shot = this.underAnOverpass();
      if (shot) return shot;
      return { position: new THREE.Vector3(centre.x, 200 * M, centre.z), target: centre };
    }

    if (where === 'bridge') {
      const span = this.city.roads.find((road) => road.bridge);
      if (!span) return { position: new THREE.Vector3(centre.x, 200 * M, centre.z), target: centre };
      // Stand off the end of the crossing and look along it, so the shot is of
      // the bridge rather than of the water near one.
      const a = this.city.nodes[span.a].pos;
      const b = this.city.nodes[span.b].pos;
      const at = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      return {
        position: at.clone().addScaledVector(along, -320 * M).setY(70 * M),
        target: at,
      };
    }

    // Street level, looking down a downtown street: the view the game will
    // have. Standing on a road matters - the middle of a district is a block,
    // and a camera put there is inside a building looking at its own wall.
    const streets = this.city.roads.filter((road) => road.district === 'downtown' && !road.bridge);
    const street = streets.reduce((best, road) => (road.length > best.length ? road : best), streets[0]);
    const from = this.city.nodes[street.a].pos;
    const to = this.city.nodes[street.b].pos;
    const along = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
    const eye = new THREE.Vector3(from.x, 5 * M, from.z);
    return { position: eye, target: eye.clone().addScaledVector(along, 600 * M).setY(24 * M) };
  }

  /** Stand on a street, looking at the deck passing over it. */
  private underAnOverpass(): Shot | null {
    const { nodes, roads } = this.city;
    const deck = roads.filter((r) => r.class === 'interstate' && nodes[r.a].y > 4 * M);
    const streets = roads.filter(
      (r) => (r.class === 'street' || r.class === 'arterial') && r.length > 120 * M,
    );

    for (const span of deck) {
      const ia = nodes[span.a].pos;
      const ib = nodes[span.b].pos;
      for (const road of streets) {
        const ra = nodes[road.a].pos;
        const rb = nodes[road.b].pos;
        const cross = segmentIntersection(ia, ib, ra, rb);
        if (!cross) continue;

        // Stand back down the street, far enough that the deck is in frame.
        const back = Math.min(150 * M, road.length * 0.8);
        const len = Math.max(1, Math.hypot(rb.x - ra.x, rb.z - ra.z));
        const dir = { x: (rb.x - ra.x) / len, z: (rb.z - ra.z) / len };
        const away = (cross.x - ra.x) * dir.x + (cross.z - ra.z) * dir.z > 0 ? -1 : 1;

        return {
          position: new THREE.Vector3(cross.x + dir.x * back * away, 6 * M, cross.z + dir.z * back * away),
          target: new THREE.Vector3(cross.x, nodes[span.a].y * 0.65, cross.z),
        };
      }
    }
    return null;
  }

  private aim(): void {
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.camera.lookAt(this.camera.position.clone().add(forward));
  }

  private listen(canvas: HTMLCanvasElement): void {
    addEventListener('keydown', (e) => this.held.add(e.key.toLowerCase()));
    addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));

    canvas.addEventListener('pointerdown', () => (this.dragging = true));
    addEventListener('pointerup', () => (this.dragging = false));
    addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= e.movementX * 0.003;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.003));
    });
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /** Fly, then draw. Speed scales with height, so the whole map is reachable. */
  frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    if (this.world) {
      this.driveFrame(dt, this.world);
      return;
    }

    const held = (...keys: string[]) => keys.some((k) => this.held.has(k));
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const push = new THREE.Vector3();
    if (held('w', 'arrowup')) push.add(forward);
    if (held('s', 'arrowdown')) push.sub(forward);
    if (held('d', 'arrowright')) push.add(right);
    if (held('a', 'arrowleft')) push.sub(right);
    if (held('e', ' ')) push.y += 1;
    if (held('q', 'shift')) push.y -= 1;

    // Faster the higher you are, or crossing 5 km at street speed is a chore.
    const speed = (60 + this.camera.position.y * 0.9) * (held('control') ? 4 : 1);
    this.velocity.lerp(push.normalize().multiplyScalar(speed), 0.18);
    this.camera.position.addScaledVector(this.velocity, dt);
    this.camera.position.y = Math.max(2 * M, this.camera.position.y);

    // The dome has to travel with the camera. Centred on the world origin it
    // is a finite ball you can see the edge of as soon as you are not standing
    // in the middle of the map.
    this.skyDome.position.copy(this.camera.position);

    const fog = this.scene.fog as THREE.Fog;
    fog.near = Math.max(300 * M, this.camera.position.y * 0.5);
    fog.far = Math.max(2600 * M, this.camera.position.y * 4);

    this.aim();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Step the sim on its fixed timestep, then follow the car.
   *
   * The accumulator is not optional: physics has to run at `STEP` regardless of
   * frame rate or the car behaves differently on different machines, which is
   * the same reason `game.ts` does it.
   */
  private driveFrame(dt: number, world: CityWorld): void {
    const held = (...keys: string[]) => keys.some((k) => this.held.has(k));
    const input: InputState = {
      up: held('w', 'arrowup'),
      down: held('s', 'arrowdown'),
      left: held('a', 'arrowleft'),
      right: held('d', 'arrowright'),
      nitro: held('shift'),
      confirm: held('enter', ' '),
    };

    // Slow motion is a multiplier on how much time the accumulator is fed, not
    // a change to the timestep: physics still runs at STEP, there is just less
    // of it per frame (#94).
    this.accumulator = Math.min(this.accumulator + dt * this.director.timeScale, 0.25);
    while (this.accumulator >= STEP) {
      world.step(STEP, input);
      this.accumulator -= STEP;
    }

    this.car.position.set(world.x, world.y, world.z);
    this.car.rotation.y = world.heading;
    if (held('b')) this.director.glanceBack();

    this.trafficCars.begin();
    for (const car of world.traffic.cars) {
      this.trafficCars.place(car.x, car.y, car.z, car.colour).rotation.y = car.heading;
    }
    this.trafficCars.end();

    this.copCars.begin();
    for (const cop of world.police.cops) {
      const unit = COP_UNITS[cop.kind];
      this.copCars.place(cop.x, cop.y, cop.z, unit.colour, unit.scale).rotation.y = cop.heading;
    }
    // Parked cruisers come out of the same pool: they are cop cars, lightbars
    // and all, and a roadblock reads at distance because the lights do (#59).
    for (const block of world.police.roadblocks) {
      for (const car of block.cars) {
        const unit = COP_UNITS[car.kind];
        this.copCars.place(car.x, car.y, car.z, unit.colour, unit.scale).rotation.y = car.heading;
      }
    }
    this.siren += dt;
    this.copCars.flashLightbars(this.siren);
    this.copCars.end();

    this.wreckCars.begin();
    for (const wreck of world.wrecks) {
      const car = this.wreckCars.place(wreck.x, wreck.y, wreck.z, wreck.colour, wreck.scale, 0.34);
      // Rolled onto its side rather than sitting level, so a wreck reads as a
      // wreck from the far end of the street.
      car.rotation.set(0, wreck.heading, wreck.roll);
    }
    this.wreckCars.end();

    // The camera is the director's business now (#88), not this loop's.
    const shot = this.director.update(dt, world);
    this.camera.position.copy(shot.position);
    this.camera.lookAt(shot.target);
    if (Math.abs(this.camera.fov - shot.fov) > 0.01) {
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
    }

    const fog = this.scene.fog as THREE.Fog;
    fog.near = 300 * M;
    fog.far = 2600 * M;
    this.skyDome.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.hud?.draw(world);
  }

  start(): void {
    const loop = () => {
      this.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  dispose(): void {
    this.cityscape.dispose();
    this.renderer.dispose();
  }
}
