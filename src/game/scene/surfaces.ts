import * as THREE from "three";
import { UNITS_PER_METRE } from "../constants";

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
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // White is "leave the material's colour alone": the tile multiplies it, so
  // the tarmac's actual shade still lives in `cityscape.ts` where the rest of
  // the palette is.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // Aggregate: the chips of stone in the mix. Fine and dense, and it is what
  // carries the sense of speed once the car is moving.
  speckle(size, 900, 11, (x, y, i) => {
    const shade = hash(i * 3.7);
    ctx.fillStyle = shade > 0.5 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.11)";
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + hash(i * 5.3) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Patches: repairs and staining, big enough to read from a distance where
  // the aggregate has long since blurred into flat grey again.
  speckle(size, 7, 71, (x, y, i) => {
    ctx.fillStyle =
      hash(i * 9.1) > 0.5 ? "rgba(0,0,0,0.055)" : "rgba(255,255,255,0.04)";
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
}
