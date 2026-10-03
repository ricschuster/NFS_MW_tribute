import * as THREE from 'three';
import type { Apron, Vec2 } from '../city/types';

/**
 * Paved ground (#410, #454, #460): Sablet Wharf's yard is concrete, Kestrel
 * Head's castle courtyards are cobbled, Highmoor's car park is gravel, and
 * downtown is paved from edge to edge but for its lawns, not grass.
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
 *
 * The outlines are a float texture, one row an apron, not uniform arrays
 * (#489). Arrays held six outlines of ninety-six points, near six hundred
 * uniform vectors in one fragment shader, and WebGL 2 promises only 224: on a
 * phone that reports the minimum, the ground's shader would not compile at
 * all. A texture costs one sampler however many aprons there are, so an area
 * that needs yards - Industrial's, after a high street took the sixth slot -
 * no longer has to wait for one.
 */
const SLAB = 8;
const SETT = 0.9;
/** Downtown's paving (2026-10-02): the same concrete as the wharf's, in pavement-sized slabs. */
const FLAG = 2.4;
/** Gravel has no joints: a grain this size, speckled light and dark, as a car park at the foot of Highmoor (#460) is. */
const GRIT = 0.35;
/** Each apron's outline is resampled to this many points. */
const POINTS = 96;
/** A row of the texture: the apron's box, its parameters, then its outline. */
const COLUMNS = POINTS + 2;

/** Patch the ground's material; returns the texture holding the outlines, for its owner to dispose of. */
export function wharfGround(material: THREE.Material, aprons: readonly Apron[], unitsPerMetre: number): THREE.DataTexture | null {
  const used = aprons.filter((apron) => apron.outline.length >= 3);
  if (used.length === 0) return null;
  const data = new Float32Array(COLUMNS * used.length * 4);
  used.forEach((apron, k) => {
    const row = k * COLUMNS * 4;
    const outline = resample(apron.outline, POINTS);
    const xs = outline.map((p) => p.x);
    const zs = outline.map((p) => p.z);
    data.set([Math.min(...xs) - apron.margin, Math.min(...zs) - apron.margin, Math.max(...xs) + apron.margin, Math.max(...zs) + apron.margin], row);
    // x: margin, y: joint spacing, z: the look (0 concrete, 1 cobbles, 2 gravel,
    // 3 grass). Flags are concrete in smaller slabs.
    const look = { concrete: 0, flags: 0, cobbles: 1, gravel: 2, grass: 3 }[apron.look];
    const spacing = { concrete: SLAB, flags: FLAG, cobbles: SETT, gravel: GRIT, grass: SLAB }[apron.look];
    data.set([apron.margin, spacing * unitsPerMetre, look, 0], row + 4);
    outline.forEach((p, i) => data.set([p.x, p.z], row + (2 + i) * 4));
  });
  const texture = new THREE.DataTexture(data, COLUMNS, used.length, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey?.bind(material);

  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.uAprons = { value: texture };
    shader.uniforms.uApronCount = { value: used.length };

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
        uniform highp sampler2D uAprons;
        uniform int uApronCount;
        varying vec3 vApronWorld;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 p = vApronWorld.xz;
          // What the ground was before any apron, for a lawn to put back.
          vec3 unpaved = diffuseColor.rgb;
          for (int k = 0; k < uApronCount; k++) {
            vec4 box = texelFetch(uAprons, ivec2(0, k), 0);
            if (p.x < box.x || p.y < box.y || p.x > box.z || p.y > box.w) continue;
            vec4 params = texelFetch(uAprons, ivec2(1, k), 0);
            // Distance to the outline, and which side of it: even-odd crossings.
            float d = 1e20;
            bool inside = false;
            for (int i = 0; i < APRON_POINTS; i++) {
              vec2 a = texelFetch(uAprons, ivec2(2 + i, k), 0).xy;
              vec2 b = texelFetch(uAprons, ivec2(2 + (i + 1) % APRON_POINTS, k), 0).xy;
              vec2 ab = b - a;
              float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
              d = min(d, length(p - a - ab * t));
              if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            float paved = inside ? 1.0 : 1.0 - smoothstep(params.x * 0.75, params.x, d);
            if (paved <= 0.0) continue;
            if (params.z > 2.5) {
              // Grass: a lawn left in paving, painted after it, takes it back off.
              diffuseColor.rgb = mix(diffuseColor.rgb, unpaved, paved);
              continue;
            }
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
  material.customProgramCacheKey = () => `${key ? key() : ''}+wharfground`;
  return texture;
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
