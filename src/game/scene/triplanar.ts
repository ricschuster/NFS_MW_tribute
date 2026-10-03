import * as THREE from 'three';
import { UNITS_PER_METRE } from '../constants';
import type { WallFinish } from './materials';
import { WALL_WEATHER, WEATHER_NOISE } from './weathering';

/**
 * A photo finish on an arbitrary instanced model (#581).
 *
 * `worldUvs` textures an axis-aligned box from its instance scale, which is
 * right for a slab and wrong for a set piece: a house is a merged model with
 * its own parts, rotated to any heading. Triplanar projection is the answer
 * that needs nothing from the geometry - the photo is projected along each
 * world axis and blended by which way the face points - so a wall is the same
 * brick at the same size whatever the model, heading or scale.
 *
 * Only walls take it. A face turned up or down keeps its flat colour (a roof is
 * not brick), through `wall`, which fades the whole effect out as the normal
 * leans towards vertical.
 *
 * Patched into three's standard material the same way `worldUvs` is, by string
 * replacement, so `triplanar.test.ts` fails if a chunk is renamed.
 */
export function triplanar(material: THREE.MeshStandardMaterial, finish: WallFinish, key: string): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPhotoColour = { value: finish.map };
    shader.uniforms.uPhotoNormal = { value: finish.normalMap };
    shader.uniforms.uPhotoRough = { value: finish.roughnessMap };
    shader.uniforms.uPhotoTile = {
      value: new THREE.Vector2(finish.tile.u * UNITS_PER_METRE, finish.tile.v * UNITS_PER_METRE),
    };
    shader.uniforms.uPhotoMean = { value: finish.mean };
    shader.uniforms.uPhotoHue = { value: finish.hue };
    shader.uniforms.uMetre = { value: UNITS_PER_METRE };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPhotoPos;
        varying vec3 vPhotoN;
        varying float vPhotoBase;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPhotoPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vPhotoBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;
        vPhotoN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uPhotoColour;
        uniform sampler2D uPhotoNormal;
        uniform sampler2D uPhotoRough;
        uniform vec2 uPhotoTile;
        uniform float uPhotoMean;
        uniform float uPhotoHue;
        uniform float uMetre;
        float photoGrime;
        varying vec3 vPhotoPos;
        varying vec3 vPhotoN;
        varying float vPhotoBase;
        ${WEATHER_NOISE}
        ${WALL_WEATHER}

        vec3 photoWeights() {
          vec3 w = pow(abs(normalize(vPhotoN)), vec3(4.0));
          return w / (w.x + w.y + w.z);
        }
        // 1 on a wall, 0 on a roof or a floor.
        float photoWall() {
          return 1.0 - smoothstep(0.55, 0.9, abs(normalize(vPhotoN).y));
        }
        vec2 photoUvX() { return vPhotoPos.zy / uPhotoTile; }
        vec2 photoUvY() { return vPhotoPos.xz / uPhotoTile.xx; }
        vec2 photoUvZ() { return vPhotoPos.xy / uPhotoTile; }
        vec4 photoSample(sampler2D t) {
          vec3 w = photoWeights();
          return texture2D(t, photoUvX()) * w.x + texture2D(t, photoUvY()) * w.y + texture2D(t, photoUvZ()) * w.z;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 photo = photoSample(uPhotoColour).rgb;
          float luma = dot(photo, vec3(0.2126, 0.7152, 0.0722));
          vec3 shade = mix(vec3(luma), photo, uPhotoHue) / uPhotoMean;
          diffuseColor.rgb *= mix(vec3(1.0), shade, photoWall());
          // Weathering (weathering.ts): dirt where the wall meets the ground,
          // rain runs down from above. Horizontal coordinate is whichever of
          // x and z runs along this face.
          vec3 wn = normalize(vPhotoN);
          float along = (abs(wn.x) > abs(wn.z) ? vPhotoPos.z : vPhotoPos.x) / uMetre;
          vec2 dirt = wallWeather((vPhotoPos.y - vPhotoBase) / uMetre, along);
          float wallMask = photoWall();
          diffuseColor.rgb *= 1.0 - (0.55 * dirt.x + 0.28 * dirt.y) * wallMask;
          photoGrime = dirt.x * wallMask;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, photoSample(uPhotoRough).g, photoWall());
        roughnessFactor = mix(roughnessFactor, 1.0, 0.6 * photoGrime);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Whiteout-free UDN blend: each projection's tangent normal is bent
          // onto the world normal, then the three are weighted and taken back
          // to view space.
          vec3 n = normalize(vPhotoN);
          vec3 w = photoWeights();
          vec3 tx = texture2D(uPhotoNormal, photoUvX()).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(uPhotoNormal, photoUvY()).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(uPhotoNormal, photoUvZ()).xyz * 2.0 - 1.0;
          vec3 nx = vec3(tx.xy + n.zy, n.x).zyx;
          vec3 ny = vec3(ty.xy + n.xz, n.y).xzy;
          vec3 nz = vec3(tz.xy + n.xy, n.z).xyz;
          vec3 world = normalize(nx * w.x + ny * w.y + nz * w.z);
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(world, 0.0)).xyz), photoWall()));
        }`,
      );
  };
  material.customProgramCacheKey = () => `triplanar:${key}`;
}
