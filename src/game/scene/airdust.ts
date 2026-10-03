import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';

/**
 * Dust in the air (#582, `?look=particles`).
 *
 * A few hundred motes in a box around the camera, drifting on a slow wind and
 * wrapped back in as the camera leaves them. They are why a still frame of a
 * lit street has air in it, and why driving through one has a sense of passing
 * something: nothing else in the view moves past at the camera's own scale.
 *
 * The box follows the camera and the motes' positions are modular in it, so the
 * cost is a fixed few hundred points however far the car goes, and nothing here
 * is stored in the world. The wrap is the whole algorithm; it is in `wrapAround`
 * so it can be tested without a renderer.
 */
const COUNT = 600;
/** Half the box's side, in metres. */
const REACH = 18;
/** How strongly a mote catches the light, at full sun. */
const BRIGHTNESS = 0.55;

/** `v` brought back into `centre +- reach` by whole boxes. */
export function wrapAround(v: number, centre: number, reach: number): number {
  const span = reach * 2;
  return centre - reach + ((((v - centre + reach) % span) + span) % span);
}

function softDot(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class AirDust {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;
  private readonly material: THREE.PointsMaterial;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly map = softDot();
  private clock = 0;

  constructor() {
    const reach = REACH * UNITS_PER_METRE;
    // A fixed seed: the same motes every run, and nothing from `Math.random`.
    let a = 0x9e3779b9;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.positions = new Float32Array(COUNT * 3);
    this.speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = (next() * 2 - 1) * reach;
      this.positions[i * 3 + 1] = next() * reach * 0.6;
      this.positions[i * 3 + 2] = (next() * 2 - 1) * reach;
      this.speeds[i] = 0.4 + next();
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.PointsMaterial({
      color: '#fff2d6',
      size: 0.16 * UNITS_PER_METRE,
      sizeAttenuation: true,
      map: this.map ?? undefined,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'air-dust';
    this.points.frustumCulled = false;
  }

  /** Move the motes and re-centre the box on `camera`; `sun` is 0..1 (night is dark and dust is not lit). */
  update(dt: number, camera: THREE.Vector3, sun: number): void {
    this.clock += dt;
    const reach = REACH * UNITS_PER_METRE;
    const drift = 0.35 * UNITS_PER_METRE;
    // Positions are stored in world coordinates and wrapped about the camera.
    const p = this.positions;
    for (let i = 0; i < COUNT; i++) {
      const s = this.speeds[i];
      let x = p[i * 3] + drift * s * dt;
      let y = p[i * 3 + 1] + Math.sin(this.clock * 0.5 + i) * 0.04 * UNITS_PER_METRE * dt;
      let z = p[i * 3 + 2] + drift * 0.4 * s * dt;
      x = wrapAround(x, camera.x, reach);
      z = wrapAround(z, camera.z, reach);
      y = wrapAround(y, camera.y + reach * 0.15, reach * 0.45);
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = BRIGHTNESS * Math.min(1, Math.max(0, sun));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.map?.dispose();
  }
}
