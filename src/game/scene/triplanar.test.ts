import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { triplanar } from './triplanar';
import type { WallFinish } from './materials';

/**
 * The patch is string replacement against three.js's own chunks, so a rename in
 * an upgrade would silently turn the photo off. The same guard `worlduv.test.ts`
 * gives `worldUvs`.
 */
const tex = new THREE.Texture();
const finish: WallFinish = { map: tex, normalMap: tex, roughnessMap: tex, tile: { u: 2, v: 2 }, mean: 0.5, hue: 0 };

function patch() {
  const material = new THREE.MeshStandardMaterial();
  triplanar(material, finish, 'test');
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return shader;
}

describe('the triplanar photo patch', () => {
  it('finds every chunk it replaces', () => {
    const { vertexShader: v, fragmentShader: f } = THREE.ShaderLib.standard;
    expect(v).toContain('#include <begin_vertex>');
    expect(f).toContain('#include <map_fragment>');
    expect(f).toContain('#include <roughnessmap_fragment>');
    expect(f).toContain('#include <normal_fragment_maps>');
  });

  it('lands in both stages', () => {
    const shader = patch();
    expect(shader.vertexShader).toContain('vPhotoPos =');
    expect(shader.fragmentShader).toContain('photoSample(uPhotoColour)');
    expect(shader.fragmentShader).toContain('photoSample(uPhotoRough)');
    expect(shader.fragmentShader).toContain('uPhotoNormal');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>\n        #include');
  });

  it('hands the textures to the shader', () => {
    const shader = patch();
    expect(shader.uniforms.uPhotoColour.value).toBe(tex);
    expect(shader.uniforms.uPhotoNormal.value).toBe(tex);
  });
});
