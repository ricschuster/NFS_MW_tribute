import * as THREE from 'three';
import type { Apron, Vec2 } from '../city/types';

/**
 * Paved ground (#410, #454, #460): Sablet Wharf's yard is concrete, Kestrel
 * Head's castle courtyards are cobbled, and Highmoor's car park is gravel, not grass.
 *
 * The same move as the quarry's ground (`quarryground.ts`): a patch on the
 * ground's own material rather than a second mesh, so the terrain, its
 * lighting and its shadows stay what they were and everything outside an
 * apron is exactly the colour it was. An apron is an outline and a margin
 * (`City.aprons`); the fragment asks how far it is from each outline - inside
 * is paved, and it fades to grass over the last stretch of the margin - and
 * lays the joints of its look: a concrete slab every `SLAB` metres, or setts
 * a little under a metre, which is what makes a flat colour read as a yard.
 *
 * Chained onto whatever patch the material already has, because a material
 * compiles one `onBeforeCompile` and the quarry's is on the same ground.
 */
const SLAB = 8;
const SETT = 0.9;
/** Gravel has no joints: a grain this size, speckled light and dark, as a car park at the foot of Highmoor (#460) is. */
const GRIT = 0.35;
/** GLSL wants fixed array sizes: this many aprons, each resampled to this many points. */
const APRONS = 6;
const POINTS = 96;

export function wharfGround(material: THREE.Material, aprons: readonly Apron[], unitsPerMetre: number): void {
  const used = aprons.filter((apron) => apron.outline.length >= 3).slice(0, APRONS);
  if (used.length === 0) return;
  const points: THREE.Vector2[] = [];
  const boxes: THREE.Vector4[] = [];
  const params: THREE.Vector4[] = [];
  for (let i = 0; i < APRONS; i++) {
    const apron = used[i];
    const outline = apron ? resample(apron.outline, POINTS) : [];
    for (let k = 0; k < POINTS; k++) points.push(new THREE.Vector2(outline[k]?.x ?? 0, outline[k]?.z ?? 0));
    if (!apron) {
      // An empty box nothing is ever inside.
      boxes.push(new THREE.Vector4(1, 1, -1, -1));
      params.push(new THREE.Vector4(0, 1, 0, 0));
      continue;
    }
    const xs = outline.map((p) => p.x);
    const zs = outline.map((p) => p.z);
    boxes.push(
      new THREE.Vector4(
        Math.min(...xs) - apron.margin,
        Math.min(...zs) - apron.margin,
        Math.max(...xs) + apron.margin,
        Math.max(...zs) + apron.margin,
      ),
    );
    // x: margin, y: joint spacing, z: the look (0 concrete, 1 cobbles, 2 gravel).
    const cobbles = apron.look === 'cobbles';
    const look = cobbles ? 1 : apron.look === 'gravel' ? 2 : 0;
    params.push(new THREE.Vector4(apron.margin, (cobbles ? SETT : apron.look === 'gravel' ? GRIT : SLAB) * unitsPerMetre, look, 0));
  }
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.uApron = { value: points };
    shader.uniforms.uApronBox = { value: boxes };
    shader.uniforms.uApronParams = { value: params };

    if (!shader.vertexShader.includes('vApronWorld')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vApronWorld;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvApronWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        #define APRONS ${APRONS}
        #define APRON_POINTS ${POINTS}
        uniform vec2 uApron[APRONS * APRON_POINTS];
        uniform vec4 uApronBox[APRONS];
        uniform vec4 uApronParams[APRONS];
        varying vec3 vApronWorld;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 p = vApronWorld.xz;
          for (int k = 0; k < APRONS; k++) {
            vec4 box = uApronBox[k];
            if (p.x < box.x || p.y < box.y || p.x > box.z || p.y > box.w) continue;
            vec4 params = uApronParams[k];
            // Distance to the outline, and which side of it: even-odd crossings.
            float d = 1e20;
            bool inside = false;
            for (int i = 0; i < APRON_POINTS; i++) {
              vec2 a = uApron[k * APRON_POINTS + i];
              vec2 b = uApron[k * APRON_POINTS + (i + 1) % APRON_POINTS];
              vec2 ab = b - a;
              float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
              d = min(d, length(p - a - ab * t));
              if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            float paved = inside ? 1.0 : 1.0 - smoothstep(params.x * 0.75, params.x, d);
            if (paved <= 0.0) continue;
            if (params.z > 1.5) {
              // Gravel: no joints, a speckle of light and dark stones.
              vec2 grain = floor(p / params.y);
              float n = fract(sin(dot(grain, vec2(12.9898, 78.233))) * 43758.5453);
              vec3 gravel = vec3(0.36, 0.33, 0.28) * (0.75 + 0.35 * n);
              diffuseColor.rgb = mix(diffuseColor.rgb, gravel, paved);
              continue;
            }
            bool setts = params.z > 0.5;
            // Setts are laid in courses, each one offset by half a stone.
            vec2 q = p / params.y;
            if (setts) q.x += 0.5 * floor(q.y);
            vec2 g = fract(q);
            float joint = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
            float tone = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453);
            vec3 paving = setts
              ? vec3(0.40, 0.37, 0.32) * (0.82 + 0.26 * tone)
              : vec3(0.60, 0.59, 0.56) * (0.93 + 0.07 * tone);
            paving *= mix(setts ? 0.62 : 0.78, 1.0, smoothstep(0.0, setts ? 0.09 : 0.025, joint));
            diffuseColor.rgb = mix(diffuseColor.rgb, paving, paved);
          }
        }`,
      );
  };
  // Two patches sharing a key would share a compiled program.
  material.customProgramCacheKey = () => `${key ? key() : ''}+wharfground${used.length}`;
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
