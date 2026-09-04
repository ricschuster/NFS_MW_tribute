import type { Segment } from './types';
import { Input } from './input';
import { Road } from './road';
import { Traffic } from './traffic';
import { project, renderSegment, renderFog, renderCarSprite } from './render';
import {
  WIDTH,
  HEIGHT,
  ROAD_WIDTH,
  SEGMENT_LENGTH,
  CAMERA_HEIGHT,
  CAMERA_DEPTH,
  DRAW_DISTANCE,
  FOG_DENSITY,
  FOG_COLOR,
  CENTRIFUGAL,
  STEP,
  CAR_WIDTH_WORLD,
  CAR_ASPECT,
} from './constants';
import {
  accelerate,
  limit,
  increase,
  interpolate,
  percentRemaining,
  exponentialFog,
} from './math';

/** Top display speed, in km/h, used purely for the HUD readout. */
const DISPLAY_MAX_KMH = 320;

/**
 * The game: owns state, steps physics on a fixed timestep, and renders the
 * pseudo-3D road plus the player car and HUD each animation frame.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new Input();
  private readonly road = new Road();
  private readonly traffic = new Traffic();

  // Player state.
  private position = 0; // world-z along the track
  private playerX = 0; // -1..1 = road edges; beyond = off-road
  private speed = 0;

  // Derived physics tuning.
  private readonly maxSpeed = SEGMENT_LENGTH / STEP; // cap so we never skip a segment
  private readonly accel = this.maxSpeed / 5;
  private readonly braking = -this.maxSpeed;
  private readonly decel = -this.maxSpeed / 5;
  private readonly offRoadDecel = -this.maxSpeed / 2;
  private readonly offRoadLimit = this.maxSpeed / 4;
  private readonly playerZ = CAMERA_HEIGHT * CAMERA_DEPTH; // camera-to-car distance

  private last = 0;
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.road.build();
    this.traffic.build(this.road, this.maxSpeed);
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    this.accumulator += dt;
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.update(STEP);
    }
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number): void {
    const playerSegment = this.road.findSegment(this.position + this.playerZ);
    const speedPercent = this.speed / this.maxSpeed;
    const dx = dt * 2 * speedPercent; // steering is proportional to speed

    this.position = increase(this.position, dt * this.speed, this.road.trackLength);

    if (this.input.left) this.playerX -= dx;
    if (this.input.right) this.playerX += dx;

    // curves fling the car toward the outside of the bend
    this.playerX -= dx * speedPercent * playerSegment.curve * CENTRIFUGAL;

    if (this.input.up) this.speed = accelerate(this.speed, this.accel, dt);
    else if (this.input.down) this.speed = accelerate(this.speed, this.braking, dt);
    else this.speed = accelerate(this.speed, this.decel, dt);

    // off-road: bleed speed hard
    if ((this.playerX < -1 || this.playerX > 1) && this.speed > this.offRoadLimit) {
      this.speed = accelerate(this.speed, this.offRoadDecel, dt);
    }

    this.playerX = limit(this.playerX, -2, 2);
    this.speed = limit(this.speed, 0, this.maxSpeed);

    this.traffic.update(dt, this.road);
  }

  private render(): void {
    const { ctx, road } = this;

    const baseSegment = road.findSegment(this.position);
    const basePercent = percentRemaining(this.position, SEGMENT_LENGTH);
    const playerSegment = road.findSegment(this.position + this.playerZ);
    const playerPercent = percentRemaining(this.position + this.playerZ, SEGMENT_LENGTH);
    const playerY = interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

    this.renderBackground();

    let maxy = HEIGHT;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);

    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const segment = road.segments[(baseSegment.index + n) % road.segments.length];
      segment.looped = segment.index < baseSegment.index;
      segment.fog = exponentialFog(n / DRAW_DISTANCE, FOG_DENSITY);
      segment.clip = maxy; // occlusion line for any cars resting on this segment

      const cameraZ = this.position - (segment.looped ? road.trackLength : 0);
      project(segment.p1, this.playerX * ROAD_WIDTH - x, playerY + CAMERA_HEIGHT, cameraZ, CAMERA_DEPTH, WIDTH, HEIGHT, ROAD_WIDTH);
      project(segment.p2, this.playerX * ROAD_WIDTH - x - dx, playerY + CAMERA_HEIGHT, cameraZ, CAMERA_DEPTH, WIDTH, HEIGHT, ROAD_WIDTH);

      x += dx;
      dx += segment.curve;

      const behindCamera = segment.p1.camera.z <= CAMERA_DEPTH;
      const backFace = segment.p2.screen.y >= segment.p1.screen.y;
      const occludedByHill = segment.p2.screen.y >= maxy;
      if (behindCamera || backFace || occludedByHill) continue;

      renderSegment(
        ctx,
        WIDTH,
        segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w,
        segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w,
        segment.color,
      );
      renderFog(ctx, 0, segment.p2.screen.y, WIDTH, segment.p1.screen.y - segment.p2.screen.y, segment.fog, FOG_COLOR);

      maxy = segment.p1.screen.y;
    }

    this.renderTraffic(baseSegment);
    this.renderCar();
    this.renderHud();
  }

  /**
   * Draw traffic back-to-front (far segments first) so nearer cars overlap
   * farther ones. Each car uses its segment's projection from the road pass.
   */
  private renderTraffic(baseSegment: Segment): void {
    const { ctx, road } = this;
    for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
      const segment = road.segments[(baseSegment.index + n) % road.segments.length];
      if (segment.cars.length === 0) continue;

      const s = segment.p1.screen;
      // skip segments not validly projected this frame (behind camera)
      if (segment.p1.camera.z <= CAMERA_DEPTH || s.scale <= 0) continue;

      const w = (s.scale * CAR_WIDTH_WORLD * WIDTH) / 2;
      const h = w * CAR_ASPECT;
      for (const car of segment.cars) {
        const cx = s.x + car.offset * s.w;
        renderCarSprite(ctx, cx, s.y, w, h, car.color, segment.clip);
      }
    }
  }

  private renderBackground(): void {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#141032');
    sky.addColorStop(0.55, '#43305a');
    sky.addColorStop(1, '#c9683a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  private renderCar(): void {
    const ctx = this.ctx;
    const steer = (this.input.left ? -1 : 0) + (this.input.right ? 1 : 0);
    const cx = WIDTH / 2 + steer * 10;
    const cy = HEIGHT - 150;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 68, 96, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // wheels
    ctx.fillStyle = '#0c0c0f';
    ctx.fillRect(cx - 86, cy + 50, 16, 18);
    ctx.fillRect(cx + 70, cy + 50, 16, 18);

    // body (silver, MW M3-GTR flavoured)
    ctx.fillStyle = '#c7ccd6';
    ctx.fillRect(cx - 80, cy + 40, 160, 28); // rear
    ctx.fillRect(cx - 66, cy + 4, 132, 42); // hood

    // cabin
    ctx.fillStyle = '#16233f';
    ctx.fillRect(cx - 44, cy, 88, 28);

    // blue racing stripe
    ctx.fillStyle = '#2a6cff';
    ctx.fillRect(cx - 10, cy, 20, 68);

    // brake lights
    ctx.fillStyle = this.input.down ? '#ff3b30' : '#5a1512';
    ctx.fillRect(cx - 74, cy + 48, 24, 12);
    ctx.fillRect(cx + 50, cy + 48, 24, 12);
  }

  private renderHud(): void {
    const ctx = this.ctx;
    const kmh = Math.round((this.speed / this.maxSpeed) * DISPLAY_MAX_KMH);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(20, 20, 196, 74);

    ctx.fillStyle = '#e8462b';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('SPEED', 36, 46);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px system-ui, sans-serif';
    ctx.fillText(String(kmh), 36, 84);

    ctx.fillStyle = '#9aa0aa';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('km/h', 128, 84);
  }
}
