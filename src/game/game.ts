import type { Segment } from './types';
import { Input } from './input';
import { Road } from './road';
import { Traffic } from './traffic';
import { Police } from './police';
import { project, renderSegment, renderFog, renderCarSprite, renderCopSprite } from './render';
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
  CAR_WIDTH_OFFSET,
  MIN_STEER,
  REVERSE_SPEED_FRAC,
  MAX_HEAT_LEVEL,
} from './constants';
import {
  accelerate,
  limit,
  increase,
  interpolate,
  percentRemaining,
  exponentialFog,
  overlap,
} from './math';

/** Top display speed, in km/h, used purely for the HUD readout. */
const DISPLAY_MAX_KMH = 320;
/** Seconds the BUSTED overlay holds before the pursuit resets. */
const BUST_HOLD = 3;
/** Seconds the ESCAPED banner lingers. */
const ESCAPED_FLASH = 2.5;

/**
 * The game: owns state, steps physics on a fixed timestep, and renders the
 * pseudo-3D road plus the player car and HUD each animation frame.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new Input();
  private readonly road = new Road();
  private readonly traffic = new Traffic();
  private readonly police = new Police();

  // Player state.
  private position = 0; // world-z along the track
  private playerX = 0; // -1..1 = road edges; beyond = off-road
  private speed = 0;
  private crashFlash = 0; // 1 right after a crash, decays to 0 (shake + flash)
  private busted = false; // frozen in the BUSTED state
  private bustHold = 0; // seconds left on the BUSTED overlay
  private escapedFlash = 0; // seconds left on the ESCAPED banner

  // Derived physics tuning.
  private readonly maxSpeed = SEGMENT_LENGTH / STEP; // cap so we never skip a segment
  private readonly accel = this.maxSpeed / 5;
  private readonly braking = -this.maxSpeed;
  private readonly decel = -this.maxSpeed / 5;
  private readonly offRoadDecel = -this.maxSpeed / 2;
  private readonly offRoadLimit = this.maxSpeed / 4;
  private readonly maxReverse = -this.maxSpeed * REVERSE_SPEED_FRAC;
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
    // BUSTED: freeze the world, hold the overlay, then clear the pursuit
    if (this.busted) {
      this.bustHold -= dt;
      if (this.bustHold <= 0) {
        this.busted = false;
        this.speed = 0;
        this.police.reset();
      }
      return;
    }

    const playerSegment = this.road.findSegment(this.position + this.playerZ);
    const speedPercent = this.speed / this.maxSpeed;
    // curve push scales with actual speed; steering keeps a floor so you can
    // peel out of a lane even when stopped (e.g. right after a crash)
    const curveDx = dt * 2 * speedPercent;
    const steerDx = dt * 2 * Math.max(Math.abs(speedPercent), MIN_STEER);

    this.position = increase(this.position, dt * this.speed, this.road.trackLength);

    if (this.input.left) this.playerX -= steerDx;
    if (this.input.right) this.playerX += steerDx;

    // curves fling the car toward the outside of the bend
    this.playerX -= curveDx * speedPercent * playerSegment.curve * CENTRIFUGAL;

    if (this.input.up) {
      this.speed = accelerate(this.speed, this.accel, dt);
    } else if (this.input.down) {
      // brake, then reverse once stopped
      this.speed = accelerate(this.speed, this.braking, dt);
    } else if (this.speed > 0) {
      this.speed = Math.max(0, accelerate(this.speed, this.decel, dt));
    } else if (this.speed < 0) {
      // coast a reversing car back up toward a standstill
      this.speed = Math.min(0, accelerate(this.speed, -this.decel, dt));
    }

    // off-road: bleed speed hard
    if ((this.playerX < -1 || this.playerX > 1) && this.speed > this.offRoadLimit) {
      this.speed = accelerate(this.speed, this.offRoadDecel, dt);
    }

    this.playerX = limit(this.playerX, -2, 2);
    this.speed = limit(this.speed, this.maxReverse, this.maxSpeed);

    this.traffic.update(dt, this.road);
    this.checkCollisions();

    this.police.update(
      dt,
      { z: this.position + this.playerZ, offset: this.playerX, speed: this.speed },
      this.maxSpeed,
      this.road.trackLength,
    );

    if (this.police.busted) {
      this.busted = true;
      this.bustHold = BUST_HOLD;
      this.speed = 0;
    }
    if (this.police.justEscaped) this.escapedFlash = ESCAPED_FLASH;

    this.crashFlash = Math.max(0, this.crashFlash - dt * 2);
    this.escapedFlash = Math.max(0, this.escapedFlash - dt);
  }

  /**
   * Crash the player into any overlapping traffic. Scans the player's segment
   * and the next one (closing speeds can exceed one segment per step), bleeds
   * speed on impact, and snaps the player just behind the car.
   */
  private checkCollisions(): void {
    if (this.speed <= 0) return;
    const road = this.road;
    const baseZ = this.position + this.playerZ;

    for (let s = 0; s < 2; s++) {
      const segment = road.findSegment(baseZ + s * SEGMENT_LENGTH);
      for (const car of segment.cars) {
        if (this.speed <= car.speed) continue; // only when closing on it
        if (!overlap(this.playerX, CAR_WIDTH_OFFSET, car.offset, CAR_WIDTH_OFFSET, 0.8)) continue;

        const shared = Math.max(car.speed, 0);
        this.speed = shared * (shared / this.speed); // drop below the car's speed (0 for parked/oncoming)
        // settle a little behind the car so we're not glued to its bumper
        this.position = increase(car.z, -this.playerZ - SEGMENT_LENGTH, road.trackLength);
        this.crashFlash = 1;
        return;
      }
    }
  }

  private render(): void {
    const { ctx, road } = this;

    const baseSegment = road.findSegment(this.position);
    const basePercent = percentRemaining(this.position, SEGMENT_LENGTH);
    const playerSegment = road.findSegment(this.position + this.playerZ);
    const playerPercent = percentRemaining(this.position + this.playerZ, SEGMENT_LENGTH);
    const playerY = interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

    // crash shake: jitter the whole world (the HUD stays put)
    ctx.save();
    if (this.crashFlash > 0) {
      const k = this.crashFlash * 9;
      ctx.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k);
    }

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
    this.renderCops();
    this.renderCar();
    ctx.restore();

    // red flash on impact, in screen space so it doesn't shake with the world
    if (this.crashFlash > 0) {
      ctx.fillStyle = `rgba(255,60,40,${0.35 * this.crashFlash})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

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

  /** Draw the pursuing cops, farthest first, using each one's segment projection. */
  private renderCops(): void {
    const cops = this.police.cops;
    if (cops.length === 0) return;

    const { ctx, road } = this;
    // farthest-first so a nearer cop overlaps a farther one
    const ordered = [...cops].sort((a, b) => b.distance - a.distance);
    for (const cop of ordered) {
      const segment = road.findSegment(cop.z);
      const s = segment.p1.screen;
      if (segment.p1.camera.z <= CAMERA_DEPTH || s.scale <= 0) continue;

      const w = (s.scale * CAR_WIDTH_WORLD * WIDTH) / 2;
      const h = w * CAR_ASPECT;
      const cx = s.x + cop.offset * s.w;
      renderCopSprite(ctx, cx, s.y, w, h, this.police.lightPhase, segment.clip);
    }
  }

  private renderBackground(): void {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#141032');
    sky.addColorStop(0.55, '#43305a');
    sky.addColorStop(1, '#c9683a');
    ctx.fillStyle = sky;
    // over-fill so the crash shake never exposes an edge
    ctx.fillRect(-12, -12, WIDTH + 24, HEIGHT + 24);
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

    this.renderHeatMeter();
    this.renderStatusOverlays();
  }

  /** Heat bar with discrete level pips, shown while there's any heat. */
  private renderHeatMeter(): void {
    const police = this.police;
    if (police.heat <= 0 && !police.pursuing) return;

    const ctx = this.ctx;
    const bx = WIDTH - 236;
    const by = 20;
    const bw = 216;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, 62);

    // flashing PURSUIT label
    if (police.pursuing) {
      const on = Math.floor(police.lightPhase * 6) % 2 === 0;
      ctx.fillStyle = on ? '#3b6bff' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(bx + 20, by + 20, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(police.pursuing ? 'PURSUIT' : 'COOLING', bx + 36, by + 25);

    // heat bar
    const barX = bx + 16;
    const barY = by + 36;
    const barW = bw - 32;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, barY, barW, 12);
    const hue = 45 - police.heat * 45; // yellow -> red
    ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
    ctx.fillRect(barX, barY, barW * police.heat, 12);

    // level pips
    for (let i = 0; i < MAX_HEAT_LEVEL; i++) {
      ctx.fillStyle = i < police.level ? '#ffffff' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(barX + barW - 10 - i * 14, barY - 16, 10, 10);
    }
  }

  /** Center-screen BUSTED / ESCAPED banners. */
  private renderStatusOverlays(): void {
    const ctx = this.ctx;

    if (this.busted) {
      ctx.fillStyle = 'rgba(120,0,0,0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 84px system-ui, sans-serif';
      ctx.fillText('BUSTED', WIDTH / 2, HEIGHT / 2);
      ctx.fillStyle = '#ffd0d0';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Pulled over', WIDTH / 2, HEIGHT / 2 + 40);
      ctx.textAlign = 'left';
      return;
    }

    if (this.escapedFlash > 0) {
      const alpha = Math.min(1, this.escapedFlash / ESCAPED_FLASH);
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(90, 220, 130, ${alpha})`;
      ctx.font = 'bold 60px system-ui, sans-serif';
      ctx.fillText('COPS SHAKEN', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.textAlign = 'left';
    }
  }
}
