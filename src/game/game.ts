import type { Segment } from './types';
import { Input } from './input';
import { World, type InputState } from './world';
import { GameAudio } from './audio';
import { TouchControls } from './touch';
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
  STEP,
  CAR_WIDTH_WORLD,
  CAR_ASPECT,
  MAX_HEAT_LEVEL,
  ESCAPED_FLASH,
  RACE_DISTANCE,
  COP_OUTRUN_DISTANCE,
  PROP_SPACING,
  PROP_WORLD,
  PROP_OFFSET,
} from './constants';
import { interpolate, percentRemaining, exponentialFog } from './math';

/** Top display speed, in km/h, used purely for the HUD readout. */
const DISPLAY_MAX_KMH = 320;

/** Cheap stable integer hash, for deterministic (non-flickering) scenery. */
function hash32(n: number): number {
  let h = n | 0;
  h = (h << 13) ^ h;
  return ((h * (h * h * 15731 + 789221) + 1376312589) & 0x7fffffff) >>> 0;
}

/**
 * Presentation layer: owns the canvas, keyboard input, and the animation loop,
 * and renders the {@link World} it advances. All simulation lives in World.
 */
export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new Input();
  private readonly audio = new GameAudio();
  private readonly touch: TouchControls;
  private world = new World();

  private phase: 'title' | 'playing' | 'paused' = 'title';
  private last = 0;
  private accumulator = 0;
  private prevConfirm = false;
  private prevPause = false;
  private prevMute = false;
  // suppress a held ENTER (used to start/resume) so it doesn't also start a race
  private suppressConfirm = false;
  private reducedMotion = false;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.touch = new TouchControls(canvas, () => this.audio.start());

    // respect the OS "reduce motion" preference (shake, speed lines, strobing)
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = mq?.matches ?? false;
    mq?.addEventListener?.('change', (e) => {
      this.reducedMotion = e.matches;
    });
  }

  /** Lightbar / pursuit flash state; steady (no strobe) under reduced motion. */
  private lightsOn(): boolean {
    return this.reducedMotion ? true : Math.floor(this.world.police.lightPhase * 6) % 2 === 0;
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;

    const confirmHeld = this.input.confirm || this.touch.confirm;
    const confirmEdge = confirmHeld && !this.prevConfirm;
    this.prevConfirm = confirmHeld;
    const pauseEdge = this.input.pause && !this.prevPause;
    this.prevPause = this.input.pause;
    const muteEdge = this.input.mute && !this.prevMute;
    this.prevMute = this.input.mute;

    // any key gesture is enough to start the audio context
    if (confirmEdge || pauseEdge || muteEdge) this.audio.start();
    if (muteEdge) this.audio.toggleMute();

    if (this.phase === 'title') {
      if (confirmEdge) this.enterPlaying();
    } else if (this.phase === 'paused') {
      if (this.input.restart) this.restart();
      else if (pauseEdge || confirmEdge) this.resume();
    } else {
      // playing
      if (pauseEdge) {
        this.phase = 'paused';
      } else {
        if (!confirmHeld) this.suppressConfirm = false;
        this.accumulator += dt;
        while (this.accumulator >= STEP) {
          this.accumulator -= STEP;
          this.world.step(STEP, this.worldInput());
        }
      }
    }

    const police = this.world.police;
    this.audio.update({
      playing: this.phase === 'playing',
      speedFrac: Math.abs(this.world.speed) / this.world.maxSpeed,
      boosting: this.world.boosting,
      sirenLevel: police.pursuing ? Math.min(1, 0.4 + police.heat) : 0,
    });

    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  private enterPlaying(): void {
    this.phase = 'playing';
    this.suppressConfirm = true;
    this.accumulator = 0;
  }

  private resume(): void {
    this.phase = 'playing';
    this.suppressConfirm = true;
  }

  private restart(): void {
    this.world = new World(); // fresh drive; Blacklist progress persists via localStorage
    this.enterPlaying();
  }

  /** The world only sees a live ENTER once it's been released after a start/resume. */
  private worldInput(): InputState {
    const i = this.input;
    const t = this.touch;
    return {
      left: i.left || t.left,
      right: i.right || t.right,
      up: i.up || t.up,
      down: i.down || t.down,
      nitro: i.nitro || t.nitro,
      confirm: (i.confirm || t.confirm) && !this.suppressConfirm,
    };
  }

  private render(): void {
    this.renderScene();
    if (this.phase === 'title') {
      this.renderTitle();
    } else {
      this.renderHud();
      this.renderMirror();
      if (this.phase === 'paused') this.renderPaused();
    }
    this.renderTouchControls(); // on top, when touch is in use
  }

  private renderTouchControls(): void {
    if (!this.touch.active) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of this.touch.buttons) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.down ? 'rgba(232,70,43,0.5)' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(b.r * 0.5)}px system-ui, sans-serif`;
      ctx.fillText(b.label, b.x, b.y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  private renderScene(): void {
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
    if (world.crashFlash > 0 && !this.reducedMotion) {
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

    this.renderProps(baseSegment);
    this.renderTraffic(baseSegment);
    this.renderRival();
    this.renderCar();
    ctx.restore();

    // red flash on impact, in screen space so it doesn't shake with the world
    if (world.crashFlash > 0) {
      ctx.fillStyle = `rgba(255,60,40,${0.35 * world.crashFlash})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    this.renderSpeedLines();
  }

  private renderTitle(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8462b';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillText('MOST WANTED', WIDTH / 2, HEIGHT / 2 - 30);

    ctx.fillStyle = '#c9ccd4';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('A pseudo-3D tribute', WIDTH / 2, HEIGHT / 2 + 6);

    const blink = 0.55 + 0.45 * Math.sin(this.last * 0.005);
    ctx.fillStyle = `rgba(143, 208, 255, ${blink})`;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press ENTER to drive', WIDTH / 2, HEIGHT / 2 + 66);

    ctx.fillStyle = '#9aa0aa';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('WASD steer · SHIFT nitro · ENTER race · P pause · M mute', WIDTH / 2, HEIGHT - 40);
    ctx.textAlign = 'left';
  }

  private renderPaused(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText('PAUSED', WIDTH / 2, HEIGHT / 2);

    ctx.fillStyle = '#9aa0aa';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('P or ESC to resume  ·  R to restart', WIDTH / 2, HEIGHT / 2 + 44);
    ctx.textAlign = 'left';
  }

  /** Radial speed streaks while boosting, for a sense of raw pace. */
  private renderSpeedLines(): void {
    if (!this.world.boosting || this.reducedMotion) return;
    const ctx = this.ctx;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - 40;
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 210, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r1 = 220 + Math.random() * 140;
      const r2 = r1 + 90 + Math.random() * 140;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.restore();
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

      const w = Math.min(WIDTH * 0.52, (s.scale * CAR_WIDTH_WORLD * WIDTH) / 2);
      const h = w * CAR_ASPECT;
      for (const car of segment.cars) {
        const cx = s.x + car.offset * s.w;
        renderCarSprite(ctx, cx, s.y, w, h, car.color, segment.clip);
      }
    }
  }

  /**
   * Rear-view mirror: cops trail the player, so they show here (behind you) by
   * their real trailing distance, rather than being faked ahead in the main
   * view. A closer cop sits lower and larger in the mirror.
   */
  private renderMirror(): void {
    const police = this.world.police;
    if (!police.pursuing) return;

    const ctx = this.ctx;
    const mw = 320;
    const mh = 96;
    const mx = (WIDTH - mw) / 2;
    const my = 12;
    const cxm = mx + mw / 2;
    const roadTopY = my + mh * 0.28;
    const bottomHalf = mw * 0.42;
    const topHalf = mw * 0.06;
    const rowHalf = (y: number): number =>
      topHalf + (bottomHalf - topHalf) * ((y - roadTopY) / (my + mh - roadTopY));

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();

    // sky, grass, and a road trapezoid vanishing toward the top (looking back)
    ctx.fillStyle = '#241a30';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#0f7f26';
    ctx.fillRect(mx, roadTopY, mw, my + mh - roadTopY);
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.moveTo(cxm - topHalf, roadTopY);
    ctx.lineTo(cxm + topHalf, roadTopY);
    ctx.lineTo(cxm + bottomHalf, my + mh);
    ctx.lineTo(cxm - bottomHalf, my + mh);
    ctx.closePath();
    ctx.fill();

    const on = this.lightsOn();
    // farthest first so nearer cops draw on top
    const cops = [...police.cops].sort((a, b) => b.distance - a.distance);
    for (const cop of cops) {
      const f = Math.min(1, cop.distance / COP_OUTRUN_DISTANCE); // 0 near .. 1 far
      const y = my + mh - 8 - f * (mh * 0.66);
      const scale = 1 - f * 0.72;
      const cx = cxm - cop.offset * rowHalf(y) * 0.8; // mirror flips left/right
      const cw = 40 * scale;
      const ch = 24 * scale;
      ctx.fillStyle = '#15171d';
      ctx.fillRect(cx - cw / 2, y - ch, cw, ch);
      ctx.fillStyle = on ? '#3b6bff' : '#ff3b30';
      ctx.fillRect(cx - cw / 2, y - ch - 4 * scale, cw / 2, 4 * scale);
      ctx.fillStyle = on ? '#ff3b30' : '#3b6bff';
      ctx.fillRect(cx, y - ch - 4 * scale, cw / 2, 4 * scale);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('REAR VIEW', cxm, my + mh + 13);
    ctx.textAlign = 'left';
  }

  /**
   * Draw roadside scenery (trees / billboards / lamp posts) far-to-near, placed
   * deterministically by segment index so it's stable frame to frame. Purely
   * visual: props sit beyond the road edge and are clipped behind hills.
   */
  private renderProps(baseSegment: Segment): void {
    const ctx = this.ctx;
    const road = this.world.road;
    for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
      const segment = road.segments[(baseSegment.index + n) % road.segments.length];
      if (segment.index % PROP_SPACING !== 0) continue;

      const s = segment.p1.screen;
      if (segment.p1.camera.z <= CAMERA_DEPTH || s.scale <= 0) continue;

      const slot = Math.floor(segment.index / PROP_SPACING);
      const side = slot % 2 === 0 ? -1 : 1;
      const kind = slot % 3; // 0 tree, 1 billboard, 2 lamp
      const cx = s.x + side * PROP_OFFSET * s.w;
      const u = Math.min(WIDTH * 0.5, (s.scale * PROP_WORLD * WIDTH) / 2);
      if (u < 2) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, segment.clip);
      ctx.clip();
      this.drawProp(kind, cx, s.y, u, slot);
      ctx.restore();
    }
  }

  private drawProp(kind: number, cx: number, groundY: number, u: number, slot: number): void {
    const ctx = this.ctx;
    // shared ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, groundY, u * 0.5, Math.max(1, u * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();

    if (kind === 0) {
      // tree: trunk + two foliage blobs
      ctx.fillStyle = '#4a2f1a';
      ctx.fillRect(cx - u * 0.09, groundY - u * 0.7, u * 0.18, u * 0.7);
      ctx.fillStyle = '#1f7a2e';
      ctx.beginPath();
      ctx.arc(cx, groundY - u * 0.9, u * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#248a34';
      ctx.beginPath();
      ctx.arc(cx - u * 0.22, groundY - u * 0.7, u * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 1) {
      // billboard: post + panel
      ctx.fillStyle = '#3a3a42';
      ctx.fillRect(cx - u * 0.05, groundY - u * 0.95, u * 0.1, u * 0.95);
      const pw = u * 1.15;
      const ph = u * 0.62;
      const py = groundY - u * 0.95 - ph;
      ctx.fillStyle = '#12325a';
      ctx.fillRect(cx - pw / 2, py, pw, ph);
      ctx.fillStyle = '#e8462b';
      ctx.fillRect(cx - pw / 2, py, pw, ph * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(cx - pw * 0.36, py + ph * 0.42, pw * 0.72, ph * 0.12);
      ctx.fillRect(cx - pw * 0.36, py + ph * 0.66, pw * 0.5, ph * 0.12);
    } else {
      // lamp post: pole + head + warm glow
      ctx.fillStyle = '#4a4a52';
      ctx.fillRect(cx - u * 0.05, groundY - u * 1.15, u * 0.1, u * 1.15);
      const armDir = slot % 2 === 0 ? 1 : -1;
      ctx.fillRect(cx, groundY - u * 1.15, armDir * u * 0.32, u * 0.08);
      const hx = cx + armDir * u * 0.32;
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.ellipse(hx, groundY - u * 1.12, u * 0.12, u * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(hx, groundY - u * 1.05, u * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Draw the rival racer while it's ahead of the player during a race. */
  private renderRival(): void {
    const world = this.world;
    const car = world.rivalCar;
    const rival = world.raceRival;
    if (!car || !rival) return;
    const visible =
      world.raceMode === 'countdown' ||
      (world.raceMode === 'racing' && car.dist - world.playerRaceDist > 0);
    if (!visible) return;

    const segment = world.road.findSegment(car.z);
    const s = segment.p1.screen;
    if (segment.p1.camera.z <= CAMERA_DEPTH || s.scale <= 0) return;

    const w = (s.scale * CAR_WIDTH_WORLD * WIDTH) / 2;
    const h = w * CAR_ASPECT;
    const cx = s.x + car.offset * s.w;
    renderCarSprite(this.ctx, cx, s.y, w, h, rival.color, segment.clip);
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

    this.renderSkyline();
  }

  /** A distant city silhouette at the horizon, parallaxing gently with steering. */
  private renderSkyline(): void {
    const ctx = this.ctx;
    const horizon = Math.round(HEIGHT * 0.46);
    const shift = -this.world.playerX * 30;
    const step = 66;

    for (let k = -2; k <= Math.ceil(WIDTH / step) + 2; k++) {
      const h = 42 + (hash32(k) % 104);
      const w = step - 8;
      const bx = k * step + shift;
      const by = horizon - h;

      ctx.fillStyle = '#241a3a';
      ctx.fillRect(bx, by, w, h);

      // a few lit windows, keyed to building-local coords so they don't flicker
      ctx.fillStyle = 'rgba(255,210,120,0.45)';
      let row = 0;
      for (let wy = by + 8; wy < horizon - 6; wy += 12, row++) {
        let col = 0;
        for (let wx = bx + 6; wx < bx + w - 4; wx += 12, col++) {
          if (hash32(k * 131 + row * 17 + col) % 4 === 0) ctx.fillRect(wx, wy, 4, 5);
        }
      }
    }
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

    // nitrous flames out the back
    if (this.world.boosting) {
      ctx.fillStyle = 'rgba(90,160,255,0.9)';
      ctx.fillRect(cx - 30, cy + 66, 20, 22 + Math.random() * 18);
      ctx.fillRect(cx + 10, cy + 66, 20, 22 + Math.random() * 18);
      ctx.fillStyle = 'rgba(224,240,255,0.95)';
      ctx.fillRect(cx - 26, cy + 66, 12, 12 + Math.random() * 12);
      ctx.fillRect(cx + 14, cy + 66, 12, 12 + Math.random() * 12);
    }

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

    // nitrous meter
    const ny = 104;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(20, ny, 196, 28);
    ctx.fillStyle = '#8fd0ff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('NITRO', 32, ny + 19);
    const nbX = 92;
    const nbW = 112;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(nbX, ny + 9, nbW, 10);
    ctx.fillStyle = world.boosting ? '#bfe4ff' : '#3b6bff';
    ctx.fillRect(nbX, ny + 9, nbW * world.nitro, 10);

    this.renderHeatMeter();
    this.renderStatusOverlays();
    this.renderRaceHud();

    if (this.audio.muted) {
      ctx.fillStyle = '#9aa0aa';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('MUTED (M)', 22, HEIGHT - 18);
    }
  }

  /** Blacklist HUD: challenge prompt, countdown, race progress, or result. */
  private renderRaceHud(): void {
    const ctx = this.ctx;
    const world = this.world;
    ctx.textAlign = 'center';

    if (world.raceMode === 'cruise' && !world.busted) {
      const rival = world.currentRival;
      const label = rival ? `ENTER  ▶  Challenge #${rival.rank} ${rival.name}` : 'BLACKLIST CLEARED';
      ctx.font = 'bold 16px system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(WIDTH / 2 - tw / 2 - 16, HEIGHT - 58, tw + 32, 34);
      ctx.fillStyle = rival ? '#ffffff' : '#5adc82';
      ctx.fillText(label, WIDTH / 2, HEIGHT - 36);
    } else if (world.raceMode === 'countdown') {
      if (world.raceRival) {
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillStyle = '#e8462b';
        ctx.fillText(`#${world.raceRival.rank}  ${world.raceRival.name}`, WIDTH / 2, 60);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 140px system-ui, sans-serif';
      ctx.fillText(String(Math.max(1, Math.ceil(world.countdown))), WIDTH / 2, HEIGHT / 2 + 44);
    } else if (world.raceMode === 'racing') {
      this.renderRaceProgress();
    } else if (world.raceMode === 'result') {
      this.renderRaceResult();
    }

    ctx.textAlign = 'left';
  }

  private renderRaceProgress(): void {
    const ctx = this.ctx;
    const world = this.world;
    const rival = world.raceRival;
    const barW = 440;
    const barX = WIDTH / 2 - barW / 2;
    const barY = 44;
    const barH = 10;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 14, barY - 28, barW + 28, 54);

    if (rival) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(`#${rival.rank}  ${rival.name.toUpperCase()}`, WIDTH / 2, barY - 10);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, barY, barW, barH);

    const rivalPct = world.rivalCar ? Math.min(1, world.rivalCar.dist / RACE_DISTANCE) : 0;
    const playerPct = Math.min(1, world.playerRaceDist / RACE_DISTANCE);
    ctx.fillStyle = rival ? rival.color : '#c33';
    ctx.fillRect(barX + rivalPct * barW - 3, barY - 4, 6, barH + 8);
    ctx.fillStyle = '#2a6cff';
    ctx.fillRect(barX + playerPct * barW - 3, barY - 4, 6, barH + 8);
  }

  private renderRaceResult(): void {
    const ctx = this.ctx;
    const world = this.world;
    const won = world.raceResult === 'won';

    ctx.fillStyle = won ? 'rgba(0,50,20,0.55)' : 'rgba(50,0,0,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = won ? '#5adc82' : '#ff5a5a';
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.fillText(won ? 'YOU WIN' : 'YOU LOSE', WIDTH / 2, HEIGHT / 2 - 8);

    const next = world.currentRival; // already advanced on a win
    const sub = won
      ? next
        ? `Rank up — next: #${next.rank} ${next.name}`
        : 'BLACKLIST CLEARED. You are Most Wanted.'
      : 'Line up and try again';
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(sub, WIDTH / 2, HEIGHT / 2 + 34);

    ctx.fillStyle = '#9aa0aa';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('ENTER to continue', WIDTH / 2, HEIGHT / 2 + 70);
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
      const on = this.lightsOn();
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
