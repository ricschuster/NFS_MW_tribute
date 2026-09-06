import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { facadeUvs } from './facades';

/**
 * The window grid is applied by patching three.js's own shader with string
 * replacements, which is the standard way to do it and also the standard way
 * to have it silently stop working: if a chunk is renamed in a three.js
 * upgrade, `String.replace` finds nothing, changes nothing, throws nothing,
 * and the city renders as untextured boxes again with every test still green.
 *
 * These run the patch against the real Lambert shader source and assert the
 * replacements landed. They are cheap, and they are the only warning anyone
 * would get.
 */
function patched(kind: 'tower' | 'block' | 'shed') {
  const material = new THREE.MeshLambertMaterial();
  facadeUvs(material, kind);
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  // The signature three.js calls this with; the renderer is not needed.
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return shader;
}

describe('the facade shader patch', () => {
  it('finds the chunks it means to replace', () => {
    const before = THREE.ShaderLib.lambert;
    expect(before.vertexShader).toContain('#include <begin_vertex>');
    expect(before.fragmentShader).toContain('#include <map_fragment>');
  });

  it('adds the world-unit uv to both stages', () => {
    const shader = patched('tower');
    expect(shader.vertexShader).toContain('varying vec2 vFacadeUv;');
    expect(shader.vertexShader).toContain('instanceMatrix[0]');
    expect(shader.fragmentShader).toContain('varying vec2 vFacadeUv;');
    // The map is sampled at the patched coordinate, not the geometry's own.
    expect(shader.fragmentShader).toContain('texture2D(map, vFacadeUv)');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
  });

  it('sizes the tile in world units, from the kind', () => {
    const tower = patched('tower');
    const shed = patched('shed');
    expect(tower.uniforms.uStorey.value).toBeGreaterThan(0);
    // A warehouse does not have a tower's floor height, and giving it one is
    // what put twelve rows of windows up an eight-metre shed.
    expect(shed.uniforms.uStorey.value).toBeGreaterThan(
      tower.uniforms.uStorey.value as number,
    );
  });

  // Three.js caches compiled programs, and two kinds that share a key would
  // share a program: whichever compiled first would texture the other.
  it('gives each kind its own program cache key', () => {
    const keys = (['tower', 'block', 'shed'] as const).map((kind) => {
      const material = new THREE.MeshLambertMaterial();
      facadeUvs(material, kind);
      return material.customProgramCacheKey();
    });
    expect(new Set(keys).size).toBe(3);
  });
});
