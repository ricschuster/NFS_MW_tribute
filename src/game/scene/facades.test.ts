import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { facadeUvs } from './facades';

/** The uniforms `facadeUvs` ends up asking `worldUvs` for, for one kind. */
function tileOf(kind: 'tower' | 'block' | 'shed') {
  const material = new THREE.MeshLambertMaterial();
  facadeUvs(material, kind);
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return { u: shader.uniforms.uTileU.value, v: shader.uniforms.uTileV.value, shader };
}

describe('a building facade', () => {
  it('is textured on its walls, not its roof', () => {
    // A wall's coordinates smeared over a roof is a window grid stretched
    // across it, which is what the `walls` mode exists to prevent.
    expect(tileOf('tower').shader.vertexShader).toContain('worldPos.y');
  });

  it('sizes the tile in world units', () => {
    const tower = tileOf('tower');
    expect(tower.u).toBeGreaterThan(0);
    expect(tower.v).toBeGreaterThan(0);
  });

  it('does not give a warehouse a tower s floor height', () => {
    // Which is what put twelve rows of windows up an eight-metre shed.
    expect(tileOf('shed').v).toBeGreaterThan(tileOf('tower').v);
  });
});
