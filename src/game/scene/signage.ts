import * as THREE from 'three';

/**
 * The face of a street sign (#11).
 *
 * A sign plate was a flat grey box, which at any distance is a grey box. What
 * makes a sign read as a sign is not the legend - nobody can read a street name
 * at 200 km/h - it is the border and the dark bar inside it, which is the shape
 * your eye already knows.
 *
 * Generated rather than shipped, like the tarmac and the facades, and cached
 * because every sign in the city shares one material.
 */
let cached: THREE.CanvasTexture | null = null;

/**
 * Null where there is no document.
 *
 * `StreetFurniture` is unit-tested headlessly - its placement maths is where
 * the parapet bug was, and that test is worth keeping able to run - and a
 * canvas needs a DOM. A sign with no face is still a sign in the right place,
 * which is all the test is asking about.
 */
export function signTexture(): THREE.CanvasTexture | null {
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const w = 128;
  const h = 40;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the sign face');

  // The plate.
  ctx.fillStyle = '#f2f4f6';
  ctx.fillRect(0, 0, w, h);
  // A border inset from the edge, which is most of what says "sign".
  ctx.strokeStyle = '#2c3440';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // The legend, as a bar rather than as letters. Real text would be a font
  // dependency, an atlas and a per-instance uv, and it would be unreadable at
  // the distance a sign is actually seen from.
  ctx.fillStyle = '#2c3440';
  ctx.fillRect(14, h / 2 - 4, w - 46, 8);
  ctx.fillRect(w - 26, h / 2 - 4, 12, 8);

  cached = new THREE.CanvasTexture(canvas);
  cached.anisotropy = 4;
  return cached;
}

export function disposeSignage(): void {
  cached?.dispose();
  cached = null;
}
