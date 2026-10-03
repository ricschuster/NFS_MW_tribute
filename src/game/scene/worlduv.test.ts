import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { worldUvs, type WorldUvFaces } from './worlduv';

/**
 * The world-unit uv is applied by patching three.js's own shader with string
 * replacements, which is the standard way to do it and also the standard way
 * to have it stop working without telling anyone: if a chunk is renamed in a
 * three.js upgrade, `String.replace` finds nothing, changes nothing, throws
 * nothing, and the city renders as untextured boxes again with every other
 * test still green.
 *
 * These run the patch against the real Lambert source and assert the
 * replacements landed. They are cheap, and they are the only warning anyone
 * would get.
 */
function patch(faces: WorldUvFaces, key = 'test', tile = { u: 100, v: 200 }) {
  const material = new THREE.MeshLambertMaterial();
  worldUvs(material, { faces, tile, key });
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return { shader, material };
}

describe('the world-unit uv patch', () => {
  it('finds the chunks it means to replace', () => {
    expect(THREE.ShaderLib.lambert.vertexShader).toContain('#include <begin_vertex>');
    expect(THREE.ShaderLib.lambert.fragmentShader).toContain('#include <map_fragment>');
  });

  it('takes the tile size off the instance, not the geometry', () => {
    const { shader } = patch('walls');
    expect(shader.vertexShader).toContain('instanceMatrix[0]');
    expect(shader.uniforms.uTileU.value).toBe(100);
    expect(shader.uniforms.uTileV.value).toBe(200);
  });

  it('samples the map at the patched coordinate in both stages', () => {
    const { shader } = patch('top');
    expect(shader.vertexShader).toContain('varying vec2 vWorldUv;');
    expect(shader.fragmentShader).toContain('varying vec2 vWorldUv;');
    expect(shader.fragmentShader).toContain('texture2D(map, vWorldUv)');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
  });

  // A photo set (#581) has a normal and a roughness map that must tile with the
  // colour. The patch assigns three.js's own varyings, so they have to exist.
  it('hands the world uv to the normal and roughness maps', () => {
    expect(THREE.ShaderChunk.uv_pars_vertex).toContain('varying vec2 vNormalMapUv;');
    expect(THREE.ShaderChunk.uv_pars_vertex).toContain('varying vec2 vRoughnessMapUv;');
    const { shader } = patch('top');
    expect(shader.vertexShader).toContain('vNormalMapUv = vWorldUv;');
    expect(shader.vertexShader).toContain('vRoughnessMapUv = vWorldUv;');
  });

  // The two modes are opposites, and getting them the wrong way round is a
  // window grid stretched over a roof or a pavement textured only on its kerb.
  it('textures walls and tops from different axes', () => {
    expect(patch('walls').shader.vertexShader).toContain('worldPos.y');
    const top = patch('top').shader.vertexShader;
    expect(top).toContain('vec2(worldPos.x, worldPos.z)');
    expect(top).not.toContain('worldPos.y');
  });

  // Three.js caches compiled programs. Two patches sharing a key share a
  // program, and whichever compiled first would texture the other.
  it('keys the program cache on the mode and the caller', () => {
    const keys = [
      patch('walls', 'tower').material.customProgramCacheKey(),
      patch('walls', 'shed').material.customProgramCacheKey(),
      patch('top', 'tower').material.customProgramCacheKey(),
    ];
    expect(new Set(keys).size).toBe(3);
  });

  // Wheel-track wear (weathering.ts) is a carriageway's own option: the
  // across-the-road coordinate comes off the instance, the noise off the world.
  it('adds wheel-track wear only when asked', () => {
    const plain = patch('top');
    expect(plain.shader.fragmentShader).not.toContain('roadWeather(');
    const material = new THREE.MeshStandardMaterial();
    worldUvs(material, { faces: 'top', tile: { u: 1, v: 1 }, key: 'worn', wear: true });
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    (material.onBeforeCompile as (s: typeof shader) => void)(shader);
    expect(shader.vertexShader).toContain('vWearAt =');
    expect(shader.fragmentShader).toContain('roadWeather(vWearAt.x');
    expect(shader.fragmentShader).toContain('roughnessFactor * 0.6');
    expect(material.customProgramCacheKey!()).toContain('wear');
  });
});
