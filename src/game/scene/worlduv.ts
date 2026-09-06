import * as THREE from 'three';

/**
 * Texturing an `InstancedMesh` in world units (#11).
 *
 * Everything large in this city is instanced: thousands of buildings in three
 * meshes, one slab per block. That means one geometry and one material shared
 * by every instance, and instances that differ by scale - a unit box scaled to
 * whatever the building or the block turns out to be.
 *
 * UVs baked into a shared geometry are therefore useless for anything with a
 * real-world size. A window would stretch to whatever shape its tower is; a
 * paving slab would be a different size on every block. What is wanted is the
 * opposite: the same texture at the same physical scale everywhere, however
 * the instance is stretched.
 *
 * So the coordinate is computed in the vertex shader instead. The instance's
 * scale is the column lengths of `instanceMatrix`; multiplying the unit box's
 * local position by it gives a position in world units, and dividing that by a
 * tile size gives a UV. `onBeforeCompile` rather than a `ShaderMaterial`, so
 * everything three.js does about lighting, fog and shadows still happens and
 * the only thing changed is where the UV comes from.
 *
 * The fragile part is that this is string replacement against three.js's own
 * shader chunks: if an upgrade renames one, `replace` finds nothing, changes
 * nothing, throws nothing, and the city renders untextured. That is what the
 * tests in `worlduv.test.ts` are for.
 */

/**
 * Which faces get the texture.
 *
 * `walls` textures the four sides and leaves the top and bottom alone - a
 * building, where a wall's coordinates smeared over a roof is a window grid
 * stretched across it. `top` is the other way round, for a slab whose upper
 * face is the one anybody sees.
 */
export type WorldUvFaces = 'walls' | 'top';

export interface WorldUvOptions {
  faces: WorldUvFaces;
  /** Tile size in world units, across and up (or across and along, for `top`). */
  tile: { u: number; v: number };
  /** Distinguishes this patch from others in three.js's program cache. */
  key: string;
  /**
   * What to do with the faces the texture does not cover, as a multiplier.
   *
   * Defaults to 1: leave them as the instance colour. A building wants its
   * roof darker than its walls - a roof is tar and gravel and plant, not
   * painted render - and from the interstate or from the air that is most of
   * what the city is made of.
   */
  otherFaces?: number;
}

/** Patch a material so its `map` is sampled in world units off the instance. */
export function worldUvs(material: THREE.Material, options: WorldUvOptions): void {
  const { faces, tile, key, otherFaces = 1 } = options;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTileU = { value: tile.u };
    shader.uniforms.uTileV = { value: tile.v };
    shader.uniforms.uOtherFaces = { value: otherFaces };

    // `abs(normal).y` is 1 on the top and bottom of an axis-aligned box and 0
    // on its sides, which is the whole test either mode needs.
    const pick =
      faces === 'walls'
        ? `vWorldFace = 1.0 - step(0.5, worldN.y);
           vec2 worldXy = worldN.x > 0.5
             ? vec2(worldPos.z, worldPos.y)
             : vec2(worldPos.x, worldPos.y);`
        : `vWorldFace = step(0.5, worldN.y);
           vec2 worldXy = vec2(worldPos.x, worldPos.z);`;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTileU;
        uniform float uTileV;
        varying vec2 vWorldUv;
        varying float vWorldFace;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 worldSize = vec3(
          length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz),
          length(instanceMatrix[2].xyz)
        );
        vec3 worldPos = position * worldSize;
        vec3 worldN = abs(normal);
        ${pick}
        vWorldUv = vec2(worldXy.x / uTileU, worldXy.y / uTileV);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uOtherFaces;
        varying vec2 vWorldUv;
        varying float vWorldFace;`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 worldTexel = texture2D(map, vWorldUv);
          vec4 worldOther = vec4(vec3(uOtherFaces), 1.0);
          diffuseColor *= mix(worldOther, worldTexel, vWorldFace);
        #endif`,
      );
  };

  // Three.js caches compiled programs. Two patches sharing a key share a
  // program, and whichever compiled first would texture the other.
  material.customProgramCacheKey = () => `worlduv:${faces}:${key}`;
}
