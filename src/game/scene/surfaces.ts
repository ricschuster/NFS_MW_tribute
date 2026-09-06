import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';

/**
 * Ground textures (#11).
 *
 * The whole city stands on one flat-coloured plane: the road surface is the
 * ground plane, by the decision in `cityscape.ts`, so a single `#4a5057`
 * covers every street in Kestrel Bay. Flat colour is what makes tarmac read as
 * grey plastic, and it is worse in motion than in a screenshot - a surface
 * with nothing on it gives the eye nothing to measure speed against, so the
 * only motion cue in the game is the centre-line dashes.
 *
 * Generated, tileable and small. The one thing that matters is that it tiles
 * without a seam: a repeating tile is drawn hundreds of times across the map
 * and a bright edge on one turns into a visible grid from any height.
 */

/** How much ground one tile covers, in metres. */
const TILE_METRES = 8;

/**
 * A cheap deterministic hash, so the same city gets the same tarmac.
 *
 * `Math.random` is banned in `city/` for a reason and it is no better here:
 * a texture that changes between reloads makes screenshot comparison useless.
 */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Speckle the tile, wrapping anything that crosses an edge.
 *
 * Drawing a mark twice - once where it falls and once shifted by a tile - is
 * what makes the tile seamless. Without it every mark near an edge is cut in
 * half and the halves do not line up with their neighbours.
 */
function speckle(
  size: number,
  count: number,
  seed: number,
  draw: (x: number, y: number, i: number) => void,
): void {
  for (let i = 0; i < count; i++) {
    const x = hash(seed + i * 2) * size;
    const y = hash(seed + i * 2 + 1) * size;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        // Only the eight shifts that can reach back into the tile matter, and
        // drawing all nine is cheaper than working out which.
        draw(x + dx, y + dy, i);
      }
    }
  }
}

function asphaltTile(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // White is "leave the material's colour alone": the tile multiplies it, so
  // the tarmac's actual shade still lives in `cityscape.ts` where the rest of
  // the palette is.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Aggregate: the chips of stone in the mix. Fine and dense, and it is what
  // carries the sense of speed once the car is moving.
  speckle(size, 900, 11, (x, y, i) => {
    const shade = hash(i * 3.7);
    ctx.fillStyle = shade > 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.11)';
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + hash(i * 5.3) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Patches: repairs and staining, big enough to read from a distance where
  // the aggregate has long since blurred into flat grey again.
  speckle(size, 7, 71, (x, y, i) => {
    ctx.fillStyle =
      hash(i * 9.1) > 0.5 ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      size * (0.06 + hash(i * 2.2) * 0.12),
      size * (0.05 + hash(i * 4.4) * 0.1),
      hash(i * 6.6) * Math.PI,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });

  return canvas;
}

/**
 * How many times the tile repeats over a ground plane of this size.
 *
 * Pulled out and exported because it is the part that fails quietly. The
 * drawing either appears or does not, and a screenshot settles it; a repeat
 * left at 1, or computed from something that is not the ground's real size,
 * looks perfectly fine in a code review and ships a city whose tarmac is
 * stretched to the width of the map.
 */
export function tileRepeat(
  width: number,
  depth: number,
): { x: number; y: number } {
  const tile = TILE_METRES * UNITS_PER_METRE;
  return { x: width / tile, y: depth / tile };
}

/** How much ground one paving or grass tile covers, in metres. */
const BLOCK_TILE_METRES = 3.2;

/**
 * Paving slabs, for the kerb the buildings stand on.
 *
 * The joints are the point. A pavement is the surface the player is closest to
 * whenever they clip a kerb, and a flat grey slab the size of a city block
 * reads as a plinth rather than a pavement - it is the one surface where the
 * absence of a texture actively tells you how big the untextured thing is.
 */
function pavingTile(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Four slabs to the tile, so the joint spacing is under a metre without the
  // texture having to repeat that often.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (const at of [0, size / 2]) {
    ctx.fillRect(at, 0, 2, size);
    ctx.fillRect(0, at, size, 2);
  }
  // Each slab a slightly different shade: real paving is laid, not poured.
  for (let sx = 0; sx < 2; sx++) {
    for (let sy = 0; sy < 2; sy++) {
      const shade = hash(sx * 7.3 + sy * 3.1);
      ctx.fillStyle = shade > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(sx * (size / 2) + 2, sy * (size / 2) + 2, size / 2 - 4, size / 2 - 4);
    }
  }
  speckle(size, 260, 29, (x, y, i) => {
    ctx.fillStyle = hash(i * 1.9) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, 1.2, 1.2);
  });
  return canvas;
}

/**
 * Grass, for the blocks the generator left open.
 *
 * Mottle rather than blades: at any distance the player sees one of these
 * from, a blade of grass is well under a pixel, and what actually reads is the
 * unevenness of the colour.
 */
function grassTile(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  speckle(size, 90, 53, (x, y, i) => {
    ctx.fillStyle = hash(i * 2.7) > 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + hash(i * 3.3) * 9, 3 + hash(i * 5.1) * 7, hash(i) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  });
  speckle(size, 700, 97, (x, y, i) => {
    ctx.fillStyle = hash(i * 4.2) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, y, 1, 2);
  });
  return canvas;
}

/**
 * One tile of a block surface, in world units.
 *
 * Blocks are instanced and each is scaled to its own size, so the repeat
 * cannot live on the texture the way the ground's does - it is computed per
 * instance in the shader by `worldUvs`. This is the number it divides by.
 */
export const BLOCK_TILE = BLOCK_TILE_METRES * UNITS_PER_METRE;

const blockCache = new Map<'paving' | 'grass', THREE.CanvasTexture>();

/** The paving or grass texture, built once and shared. */
export function blockTexture(kind: 'paving' | 'grass'): THREE.CanvasTexture {
  const hit = blockCache.get(kind);
  if (hit) return hit;
  const texture = new THREE.CanvasTexture(kind === 'paving' ? pavingTile() : grassTile());
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  blockCache.set(kind, texture);
  return texture;
}

let cached: THREE.CanvasTexture | null = null;

/**
 * The tarmac texture, tiled to cover `width` by `depth` world units.
 *
 * The repeat is set from the ground's real size rather than left at 1, so one
 * tile is always the same number of metres however big the map turns out to
 * be. A seed that generates a wider city gets more tarmac, not stretched
 * tarmac.
 */
export function asphaltTexture(
  width: number,
  depth: number,
): THREE.CanvasTexture {
  const texture = cached ?? new THREE.CanvasTexture(asphaltTile());
  cached = texture;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // A road runs away to the horizon, so this surface is seen at the grazing
  // angles anisotropy exists for. Without it the far half of every street is
  // a smear.
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  const repeat = tileRepeat(width, depth);
  texture.repeat.set(repeat.x, repeat.y);
  texture.needsUpdate = true;
  return texture;
}

/** Drop the shared texture. For a scene teardown that means it. */
export function disposeSurfaces(): void {
  cached?.dispose();
  cached = null;
  for (const texture of blockCache.values()) texture.dispose();
  blockCache.clear();
}
