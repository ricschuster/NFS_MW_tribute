import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { quarryGround } from './quarryground';

/**
 * The quarry's ground is a patch on three.js's own shader, so the same
 * warning applies as for `worldUvs`: if a chunk is renamed in an upgrade the
 * replacement finds nothing, throws nothing, and the pit is green again with
 * every other test passing. These run the patch on the real Lambert source.
 */
function patch() {
  const material = new THREE.MeshLambertMaterial();
  quarryGround(material, { at: { x: 100, z: 200 }, radius: 600, fade: 160, bench: 11, floor: 8 });
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return { shader, material };
}

describe('the quarry ground patch', () => {
  it('finds the chunks it means to replace', () => {
    expect(THREE.ShaderLib.lambert.vertexShader).toContain('#include <begin_vertex>');
    expect(THREE.ShaderLib.lambert.fragmentShader).toContain('#include <map_fragment>');
  });

  it('passes the pit, the fade, the bench and the floor to the shader', () => {
    const { shader } = patch();
    expect((shader.uniforms.uPit.value as THREE.Vector3).toArray()).toEqual([100, 200, 600]);
    expect(shader.uniforms.uPitFade.value).toBe(160);
    expect(shader.uniforms.uBench.value).toBe(11);
    expect(shader.uniforms.uFloor.value).toBe(8);
  });

  it('carries the world position and slope from the vertex stage and colours after the map', () => {
    const { shader } = patch();
    expect(shader.vertexShader).toContain('vPitWorld = ');
    expect(shader.fragmentShader).toContain('varying vec3 vPitWorld;');
    // After the map, not instead of it: outside the pit's weight the grass
    // texture must come through untouched.
    expect(shader.fragmentShader).toContain('#include <map_fragment>');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix(diffuseColor.rgb, pit, inside)');
  });

  it('has a program key of its own, so it cannot texture some other material', () => {
    const { material } = patch();
    expect(material.customProgramCacheKey?.()).toBe('quarryground');
  });
});
