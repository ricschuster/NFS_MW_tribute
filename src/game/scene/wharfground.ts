import * as THREE from 'three';
import type { Vec2 } from '../city/types';

/**
 * Paved ground (#410): Sablet Wharf's yard is concrete, not grass.
 *
 * The same move as the quarry's ground (`quarryground.ts`): a patch on the
 * ground's own material rather than a second mesh, so the terrain, its
 * lighting and its shadows stay what they were and everything outside an
 * apron is exactly the colour it was. An apron is an outline and a margin
 * (`City.aprons`); the fragment asks how far it is from the outline - inside
 * is paved, and it fades to grass over the last stretch of the margin - and
 * lays a slab joint every `SLAB` metres, which is what makes a flat grey read
 * as a yard rather than as a colour.
 *
 * Chained onto whatever patch the material already has, because a material
 * compiles one `onBeforeCompile` and the quarry's is on the same ground.
 */
const SLAB = 8;
/** GLSL wants a fixed array size; an outline is resampled to this many points. */
const POINTS = 96;

export function wharfGround(material: THREE.Material, aprons: readonly { outline: Vec2[]; margin: number }[], unitsPerMetre: number): void {
  const apron = aprons[0];
  if (!apron || apron.outline.length < 3) return;
  const outline = resample(apron.outline, POINTS);
  const xs = outline.map((p) => p.x);
  const zs = outline.map((p) => p.z);
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.uApron = { value: outline.map((p) => new THREE.Vector2(p.x, p.z)) };
    shader.uniforms.uApronBox = {
      value: new THREE.Vector4(
        Math.min(...xs) - apron.margin,
        Math.min(...zs) - apron.margin,
        Math.max(...xs) + apron.margin,
        Math.max(...zs) + apron.margin,
      ),
    };
    shader.uniforms.uApronMargin = { value: apron.margin };
    shader.uniforms.uApronSlab = { value: SLAB * unitsPerMetre };

    if (!shader.vertexShader.includes('vApronWorld')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vApronWorld;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvApronWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        #define APRON_POINTS ${POINTS}
        uniform vec2 uApron[APRON_POINTS];
        uniform vec4 uApronBox;
        uniform float uApronMargin;
        uniform float uApronSlab;
        varying vec3 vApronWorld;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 p = vApronWorld.xz;
          if (p.x > uApronBox.x && p.y > uApronBox.y && p.x < uApronBox.z && p.y < uApronBox.w) {
            // Distance to the outline, and which side of it: even-odd crossings.
            float d = 1e20;
            bool inside = false;
            for (int i = 0; i < APRON_POINTS; i++) {
              vec2 a = uApron[i];
              vec2 b = uApron[(i + 1) % APRON_POINTS];
              vec2 ab = b - a;
              float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
              d = min(d, length(p - a - ab * t));
              if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            float paved = inside ? 1.0 : 1.0 - smoothstep(uApronMargin * 0.75, uApronMargin, d);
            if (paved > 0.0) {
              vec2 g = fract(p / uApronSlab);
              float joint = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
              vec2 cell = floor(p / uApronSlab);
              float tone = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
              vec3 concrete = vec3(0.60, 0.59, 0.56) * (0.93 + 0.07 * tone);
              concrete *= mix(0.78, 1.0, smoothstep(0.0, 0.025, joint));
              diffuseColor.rgb = mix(diffuseColor.rgb, concrete, paved);
            }
          }
        }`,
      );
  };
  // Two patches sharing a key would share a compiled program.
  material.customProgramCacheKey = () => `${key ? key() : ''}+wharfground`;
}

/** `count` points spaced evenly along a closed outline. */
function resample(outline: Vec2[], count: number): Vec2[] {
  const ring = [...outline, outline[0]];
  const lengths = [0];
  for (let i = 1; i < ring.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(ring[i].x - ring[i - 1].x, ring[i].z - ring[i - 1].z));
  }
  const total = lengths[lengths.length - 1];
  const out: Vec2[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / count;
    while (j < ring.length - 1 && lengths[j] < s) j++;
    const t = (s - lengths[j - 1]) / Math.max(lengths[j] - lengths[j - 1], 1e-9);
    out.push({ x: ring[j - 1].x + (ring[j].x - ring[j - 1].x) * t, z: ring[j - 1].z + (ring[j].z - ring[j - 1].z) * t });
  }
  return out;
}
