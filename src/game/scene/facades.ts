import * as THREE from "three";
import type { BuildingKind } from "../city/types";
import { UNITS_PER_METRE } from "../constants";

/**
 * Windows for the boxes (#11).
 *
 * The city has been flat-shaded boxes since #84, and the single cheapest thing
 * that stops a box reading as a box is a window grid: it gives the eye a floor
 * height, and a floor height gives the building a size. Without one a
 * forty-storey tower and a two-storey shed are the same object at different
 * distances.
 *
 * Generated rather than drawn, for the same reason the city is: nothing
 * shipped here is anyone else's, and a seed is smaller than a texture atlas.
 *
 * The hard part is that these are `InstancedMesh`es. One geometry and one
 * material are shared by every building of a kind, so UVs baked into the
 * geometry would stretch a window to whatever shape its building is - and the
 * whole point is that a window is the same size everywhere. The fix is to
 * texture in *world* units: the vertex shader reads the instance's scale out
 * of `instanceMatrix`, multiplies the unit box's local position by it, and
 * hands the fragment shader a coordinate in metres. A three-metre floor is
 * three metres whether it is on a tower or a shed.
 */

/**
 * How big one tile is on the wall, in metres: a storey tall and a bay wide.
 *
 * Per kind, because a warehouse does not have storeys. Giving the shed a
 * seven-metre tile puts one band of roof glazing near the top of a typical
 * unit instead of a stripe every three metres, which is what it looked like
 * with a tower's floor height - a warehouse with twelve floors of windows.
 */
const TILE: Record<BuildingKind, { bay: number; storey: number }> = {
  tower: { bay: 2.6, storey: 3.4 },
  block: { bay: 3.2, storey: 3.6 },
  shed: { bay: 1.8, storey: 7 },
};

/**
 * Draw one kind's facade tile: one storey tall, one bay wide, and repeated.
 *
 * Drawn at a size that is a power of two so mipmapping has something to work
 * with - a facade seen down a long street is mostly minified, and an unmipped
 * window grid at that distance is a field of aliasing crawl.
 */
function facadeTile(kind: BuildingKind): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // White is "leave the instance colour alone": the tile multiplies the
  // per-building colour rather than replacing it, so the district palettes
  // from #75 still do the work of telling downtown from the waterfront.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  if (kind === "shed") {
    // Industrial: profiled steel sheeting is vertical corrugation with a
    // horizontal seam where two sheets lap, and a band of roof glazing high
    // up. On a seven-metre tile that lands one band near the top of a typical
    // unit rather than a stripe every floor.
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    for (let x = 0; x < size; x += 7) ctx.fillRect(x, 0, 3, size);
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(0, size * 0.62, size, 2);
    ctx.fillStyle = "rgba(26,34,42,0.5)";
    ctx.fillRect(0, size * 0.1, size, size * 0.1);
    return canvas;
  }

  const inset = kind === "tower" ? 0.08 : 0.16;
  const x0 = size * inset;
  const w = size * (1 - inset * 2);
  // The glass sits in the upper part of the storey, with the spandrel - the
  // solid panel between one floor's ceiling and the next one's sill - below
  // it. Centring the window instead is the giveaway that a facade was drawn
  // by someone who did not look at a building.
  const y0 = size * 0.16;
  const h = size * (kind === "tower" ? 0.62 : 0.5);

  ctx.fillStyle = "rgba(16,22,30,0.62)";
  ctx.fillRect(x0, y0, w, h);
  // A lighter top edge: glass reflects the sky, and the reflection is
  // brightest where the pane meets its head.
  ctx.fillStyle = "rgba(190,215,240,0.30)";
  ctx.fillRect(x0, y0, w, Math.max(1, h * 0.14));
  // Mullion down the middle of a tower's bay: it doubles the apparent
  // resolution of the grid for one rectangle of cost.
  if (kind === "tower") {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x0 + w / 2 - 1, y0, 2, h);
  }
  // The floor slab, darkest right under the glass.
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.fillRect(0, y0 + h, size, Math.max(1, size * 0.05));
  return canvas;
}

const cache = new Map<BuildingKind, THREE.CanvasTexture>();

/** The facade texture for a kind, built once and shared. */
export function facadeTexture(kind: BuildingKind): THREE.CanvasTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const texture = new THREE.CanvasTexture(facadeTile(kind));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, texture);
  return texture;
}

/** Drop the shared textures. For a scene teardown that means it. */
export function disposeFacades(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}

/**
 * Patch a material so its map is sampled in world units off the instance.
 *
 * `onBeforeCompile` rather than a `ShaderMaterial`, so the building keeps
 * every bit of three.js's lighting, fog and shadow handling. All this changes
 * is where the UV comes from.
 */
export function facadeUvs(material: THREE.Material, kind: BuildingKind): void {
  const tile = TILE[kind];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBay = { value: tile.bay * UNITS_PER_METRE };
    shader.uniforms.uStorey = { value: tile.storey * UNITS_PER_METRE };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uBay;
        uniform float uStorey;
        varying vec2 vFacadeUv;
        varying float vFacadeWall;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // Column lengths of the instance matrix are its scale, which for these
        // boxes is the building's width, height and depth in world units.
        vec3 facadeSize = vec3(
          length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz),
          length(instanceMatrix[2].xyz)
        );
        vec3 facadePos = position * facadeSize;
        vec3 facadeN = abs(normal);
        // Roofs and floors get no windows, and would get a grid stretched
        // across them if they were textured with the wall's coordinates.
        vFacadeWall = 1.0 - step(0.5, facadeN.y);
        vec2 facadeXy = facadeN.x > 0.5
          ? vec2(facadePos.z, facadePos.y)
          : vec2(facadePos.x, facadePos.y);
        vFacadeUv = vec2(facadeXy.x / uBay, facadeXy.y / uStorey);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vFacadeUv;
        varying float vFacadeWall;`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec4 facadeTexel = texture2D(map, vFacadeUv);
          diffuseColor *= mix(vec4(1.0), facadeTexel, vFacadeWall);
        #endif`,
      );
  };
  // Any change to the patch above has to invalidate the cached program, and
  // three.js keys that cache partly on this.
  material.customProgramCacheKey = () => `facade:${kind}`;
}
