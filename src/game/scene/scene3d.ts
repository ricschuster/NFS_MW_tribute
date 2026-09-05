import * as THREE from 'three';
import type { World } from '../world';
import {
  ROAD_WIDTH,
  SEGMENT_LENGTH,
  DRAW_DISTANCE,
  CAMERA_HEIGHT,
  LANES,
  FOG_COLOR,
  CAR_WIDTH_WORLD,
} from '../constants';
import { percentRemaining } from '../math';
import { Ribbon } from './ribbon';
import { CarPool } from './cars';

/**
 * A gradient sky dome that meets the fog at the horizon. A flat background
 * colour leaves the sky and the far road the same shade, which erases the
 * horizon line the Canvas renderer draws explicitly.
 */
function makeSky(horizon: THREE.Color): THREE.Mesh {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SEGMENT_LENGTH * DRAW_DISTANCE, 20, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#2a2247') },
        bottom: { value: horizon },
      },
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
          float h = clamp(pow(max(normalize(vWorld).y, 0.0), 0.5), 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.name = 'sky';
  return sky;
}

/**
 * A three.js rendering of the same `World` the Canvas renderer draws, so the
 * two can be compared side by side while the renderer is rebuilt (ADR-0004,
 * issue #81).
 *
 * It is still the *old* world model: the car has a distance along a fixed
 * track and an offset across it, not a position and a heading. What changes
 * here is only how it is drawn - the road is built as real geometry in a
 * camera-local frame, exactly as the projected-segment renderer lays it out,
 * with the curve accumulated per segment. Issue #82 is what gives the car a
 * real place in the world; issue #83 replaces this track with a city.
 */
export class Scene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;

  private readonly grass: Ribbon;
  private readonly verge: Ribbon;
  private readonly road: Ribbon;
  private readonly lanes: Ribbon[] = [];

  private readonly traffic: CarPool;
  private readonly police: CarPool;
  private readonly rival: CarPool;
  private readonly player: THREE.Group;

  /**
   * Segments built behind the camera. The projected renderer never needs these
   * because its camera sits on the player, but a chase camera has to stand back
   * from the car and would otherwise look out over a hole where the road ends.
   */
  private static readonly BEHIND = 20;

  /** Accumulated curve offset and height per drawn segment, reused for cars. */
  private readonly laneX = new Float32Array(DRAW_DISTANCE + Scene3D.BEHIND + 1);
  private readonly laneY = new Float32Array(DRAW_DISTANCE + Scene3D.BEHIND + 1);
  private drawn = 0;

  private readonly scratch = new THREE.Color();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const fog = new THREE.Color(FOG_COLOR);
    this.scene.background = fog;
    this.scene.add(makeSky(fog));
    // the projected renderer fogs by segment; linear fog over the same draw
    // distance is the closest equivalent
    this.scene.fog = new THREE.Fog(fog, SEGMENT_LENGTH * 40, SEGMENT_LENGTH * DRAW_DISTANCE * 0.8);

    this.camera = new THREE.PerspectiveCamera(58, 1, SEGMENT_LENGTH * 0.2, SEGMENT_LENGTH * DRAW_DISTANCE * 1.2);

    // Night lighting to match the palette the Canvas renderer uses today.
    // Issue #75 is where this becomes Kestrel Bay daylight.
    const key = new THREE.DirectionalLight('#9fb6d8', 1.5);
    key.position.set(-1, 2.4, 1);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight('#4a5a7a', '#101a14', 1.4));

    // The road is drawn unlit, which is not a shortcut: the Canvas renderer
    // fills flat colours with no lighting, so matching it keeps the two
    // renderers comparable. The cars are lit, which is what separates them
    // from the road surface.
    const surface = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // Ground as a very wide ribbon rather than a flat plane, so it follows the
    // hills the road climbs instead of cutting through them.
    this.grass = new Ribbon(DRAW_DISTANCE + Scene3D.BEHIND + 1, surface);
    this.verge = new Ribbon(DRAW_DISTANCE + Scene3D.BEHIND + 1, surface);
    this.road = new Ribbon(DRAW_DISTANCE + Scene3D.BEHIND + 1, surface);
    // lane markings sit just above the road; a polygon offset keeps them from
    // fighting it in the depth buffer at distance
    const markings = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    for (let i = 1; i < LANES; i++) {
      this.lanes.push(new Ribbon(DRAW_DISTANCE + Scene3D.BEHIND + 1, markings));
    }

    this.scene.add(this.grass.mesh, this.verge.mesh, this.road.mesh);
    for (const lane of this.lanes) this.scene.add(lane.mesh);

    this.traffic = new CarPool(this.scene);
    this.police = new CarPool(this.scene, true);
    this.rival = new CarPool(this.scene);

    this.player = new THREE.Group();
    this.scene.add(this.player);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Draw `world` as it stands this frame. */
  render(world: World, reducedMotion: boolean): void {
    this.buildRoad(world);
    this.placeCars(world);
    this.placeCamera(world, reducedMotion);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Lay the road out ahead of the camera. This is the same walk the projected
   * renderer does - accumulate `dx` from each segment's curve, add it to a
   * running `x` - except the result is used as a real lateral position rather
   * than a screen offset.
   */
  private buildRoad(world: World): void {
    const road = world.road;
    const base = road.findSegment(world.position);
    const basePercent = percentRemaining(world.position, SEGMENT_LENGTH);
    const playerSegment = road.findSegment(world.position + world.playerZ);
    const playerY = playerSegment.p1.world.y;

    const total = road.segments.length;
    const behind = Scene3D.BEHIND;
    const at = (offset: number) => road.segments[((base.index + offset) % total + total) % total];

    // The curve walk: dx accumulates each segment's curve, x accumulates dx.
    // x is zero at the camera's own segment, so the camera stays on the road
    // centre line exactly as it does in the projected renderer.
    const xs = this.laneX;
    let x = 0;
    let dx = -(base.curve * basePercent);
    for (let n = 0; n <= DRAW_DISTANCE; n++) {
      xs[behind + n] = x;
      x += dx;
      dx += at(n).curve;
    }
    // ...and the same recurrence run in reverse to reach behind the camera
    x = 0;
    dx = -(base.curve * basePercent);
    for (let n = 1; n <= behind; n++) {
      dx -= at(-n).curve;
      x -= dx;
      xs[behind - n] = x;
    }

    const laneHalf = ROAD_WIDTH / Math.max(32, 8 * LANES);
    let i = 0;
    for (; i <= DRAW_DISTANCE + behind; i++) {
      const offset = i - behind;
      const segment = at(offset);
      const z = offset * SEGMENT_LENGTH - basePercent * SEGMENT_LENGTH;
      const y = segment.p1.world.y - playerY;
      const cx = xs[i];
      this.laneY[i] = y;

      const c = segment.color;
      this.grass.setEdge(i, cx, ROAD_WIDTH * 16, y - SEGMENT_LENGTH * 0.12, z, this.scratch.set(c.grass));
      this.verge.setEdge(i, cx, ROAD_WIDTH * 1.28, y - SEGMENT_LENGTH * 0.06, z, this.scratch.set(c.rumble));
      this.road.setEdge(i, cx, ROAD_WIDTH, y, z, this.scratch.set(c.road));

      // lane dividers: dashed by colouring them as road on dark segments
      for (let lane = 0; lane < this.lanes.length; lane++) {
        const centre = cx - ROAD_WIDTH + ((lane + 1) * (ROAD_WIDTH * 2)) / LANES;
        this.lanes[lane].setEdge(i, centre, laneHalf, y, z, this.scratch.set(c.lane ?? c.road));
      }
    }

    this.drawn = i;
    this.grass.commit(i);
    this.verge.commit(i);
    this.road.commit(i);
    for (const lane of this.lanes) lane.commit(i);
  }

  /** The road's centre and height `segmentsAhead` of the camera. */
  private lateral(segmentsAhead: number): { x: number; y: number } {
    const i = Math.max(0, Math.min(this.drawn - 1, Math.floor(segmentsAhead) + Scene3D.BEHIND));
    return { x: this.laneX[i], y: this.laneY[i] };
  }

  private placeCars(world: World): void {
    const road = world.road;
    const base = road.findSegment(world.position);
    const total = road.segments.length;

    this.traffic.begin();
    for (const car of world.traffic.cars) {
      const n = (car.segmentIndex - base.index + total) % total;
      if (n > DRAW_DISTANCE) continue;
      const { x, y } = this.lateral(n);
      const z = ((car.z - world.position + road.trackLength) % road.trackLength);
      if (z > DRAW_DISTANCE * SEGMENT_LENGTH) continue;
      this.traffic.place(x + car.offset * ROAD_WIDTH, y, z, car.color);
    }
    this.traffic.end();

    // Cops trail the player, so in a real 3D world they belong behind the car
    // rather than faked ahead. They are out of shot in a forward view; the
    // rear-view mirror in the HUD is still how you see them (issue #88 adds
    // cameras that can look back).
    this.police.begin();
    for (const cop of world.police.cops) {
      const z = world.playerZ - cop.distance;
      const { x, y } = this.lateral(0);
      this.police.place(x + cop.offset * ROAD_WIDTH, y, z, '#15171d');
    }
    this.police.end();
    this.police.flashLightbars(world.police.lightPhase);

    this.rival.begin();
    const rival = world.rivalCar;
    if (rival && world.raceRival) {
      const z = (rival.z - world.position + road.trackLength) % road.trackLength;
      if (z < DRAW_DISTANCE * SEGMENT_LENGTH) {
        const { x, y } = this.lateral(z / SEGMENT_LENGTH);
        this.rival.place(x + rival.offset * ROAD_WIDTH, y, z, world.raceRival.color);
      }
    }
    this.rival.end();

    // the player's own car, held at the same distance ahead of the camera the
    // projected renderer draws it at
    if (this.player.children.length === 0) {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(CAR_WIDTH_WORLD, CAR_WIDTH_WORLD * 0.44, CAR_WIDTH_WORLD * 1.9),
        new THREE.MeshLambertMaterial({ color: '#eef1f4' }),
      );
      body.position.y = CAR_WIDTH_WORLD * 0.32;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(CAR_WIDTH_WORLD * 0.84, CAR_WIDTH_WORLD * 0.34, CAR_WIDTH_WORLD * 0.9),
        new THREE.MeshLambertMaterial({ color: '#243044' }),
      );
      cabin.position.set(0, CAR_WIDTH_WORLD * 0.66, -CAR_WIDTH_WORLD * 0.12);
      this.player.add(body, cabin);
    }
    const at = this.lateral(world.playerZ / SEGMENT_LENGTH);
    this.player.position.set(world.playerX * ROAD_WIDTH, at.y, world.playerZ);
    // the car has a heading now, so point the mesh where it is actually going
    this.player.rotation.y = -world.heading;
  }

  private placeCamera(world: World, reducedMotion: boolean): void {
    let shakeX = 0;
    let shakeY = 0;
    if (world.crashFlash > 0 && !reducedMotion) {
      const k = world.crashFlash * ROAD_WIDTH * 0.03;
      shakeX = (Math.random() * 2 - 1) * k;
      shakeY = (Math.random() * 2 - 1) * k;
    }

    // Stand back from the car and look slightly down at it. The projected
    // renderer draws the player as a sprite pinned near the bottom of the
    // screen, so its camera sits right on the car; real geometry needs room.
    const x = world.playerX * ROAD_WIDTH;
    this.camera.position.set(x + shakeX, CAMERA_HEIGHT * 1.5 + shakeY, world.playerZ - SEGMENT_LENGTH * 15);
    // The projected renderer looks straight down the track and draws the
    // player's car as a sprite pinned near the bottom of the screen, so its
    // camera never has to see it. Here the car is real geometry, so the camera
    // needs a chase pitch or the car sits below the frame entirely. That is the
    // first place the two renderers genuinely differ.
    this.camera.lookAt(x, CAMERA_HEIGHT * 0.3, world.playerZ + SEGMENT_LENGTH * 20);
    // the dome travels with the camera so it never clips or slides
    const sky = this.scene.getObjectByName('sky');
    if (sky) sky.position.copy(this.camera.position);
  }

  dispose(): void {
    this.grass.dispose();
    this.verge.dispose();
    this.road.dispose();
    for (const lane of this.lanes) lane.dispose();
    this.renderer.dispose();
  }
}
