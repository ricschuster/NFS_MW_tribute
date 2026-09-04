import type { Segment } from './types';
import { Input } from './input';
import { World } from './world';
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
  STEP,
  CAR_WIDTH_WORLD,
  CAR_ASPECT,
  MAX_HEAT_LEVEL,
  ESCAPED_FLASH,
} from './constants';
import { interpolate, percentRemaining, exponentialFog } from './math';

/** Top display speed, in km/h, used purely for the HUD readout. */
const DISPLAY_MAX_KMH = 320;

/**
 * Presentation layer: owns the canvas, keyboard input, and the animation loop,
 * and renders the {@link World} it advances. All simulation lives in World.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new Input();
  private readonly world = new World();

  private last = 0;
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
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
      this.world.step(STEP, this.input);
    }
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private render(): void {
    const ctx = this.ctx;
    const world = this.world;
    const road = world.road;

    const baseSegment = road.findSegment(world.position);
    const basePercent = percentRemaining(world.position, SEGMENT_LENGTH);
    const playerSegment = road.findSegment(world.position + world.playerZ);
    const playerPercent = percentRemaining(world.position + world.playerZ, SEGMENT_LENGTH);
    const playerY = interpolate(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

    // crash shake: jitter the whole world (the HUD stays put)
    ctx.save();
    if (world.crashFlash > 0) {
      const k = world.crashFlash * 9;
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

      const cameraZ = world.position - (segment.looped ? road.trackLength : 0);
      project(segment.p1, world.playerX * ROAD_WIDTH - x, playerY + CAMERA_HEIGHT, cameraZ, CAMERA_DEPTH, WIDTH, HEIGHT, ROAD_WIDTH);
      project(segment.p2, world.playerX * ROAD_WIDTH - x - dx, playerY + CAMERA_HEIGHT, cameraZ, CAMERA_DEPTH, WIDTH, HEIGHT, ROAD_WIDTH);

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
    if (world.crashFlash > 0) {
      ctx.fillStyle = `rgba(255,60,40,${0.35 * world.crashFlash})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    this.renderHud();
  }

  /**
   * Draw traffic back-to-front (far segments first) so nearer cars overlap
   * farther ones. Each car uses its segment's projection from the road pass.
   */
  private renderTraffic(baseSegment: Segment): void {
    const ctx = this.ctx;
    const road = this.world.road;
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
    const cops = this.world.police.cops;
    if (cops.length === 0) return;

    const ctx = this.ctx;
    const road = this.world.road;
    // farthest-first so a nearer cop overlaps a farther one
    const ordered = [...cops].sort((a, b) => b.distance - a.distance);
    for (const cop of ordered) {
      const segment = road.findSegment(cop.z);
      const s = segment.p1.screen;
      if (segment.p1.camera.z <= CAMERA_DEPTH || s.scale <= 0) continue;

      const w = (s.scale * CAR_WIDTH_WORLD * WIDTH) / 2;
      const h = w * CAR_ASPECT;
      const cx = s.x + cop.offset * s.w;
      renderCopSprite(ctx, cx, s.y, w, h, this.world.police.lightPhase, segment.clip);
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
    const world = this.world;
    const kmh = Math.round((world.speed / world.maxSpeed) * DISPLAY_MAX_KMH);

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
    const police = this.world.police;
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

    if (this.world.busted) {
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

    if (this.world.escapedFlash > 0) {
      const alpha = Math.min(1, this.world.escapedFlash / ESCAPED_FLASH);
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(90, 220, 130, ${alpha})`;
      ctx.font = 'bold 60px system-ui, sans-serif';
      ctx.fillText('COPS SHAKEN', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.textAlign = 'left';
    }
  }
}
