import * as THREE from 'three';

/**
 * The ground of a working quarry (#328): pale dust on the flat, stratified
 * limestone on the walls.
 *
 * The map's ground is one green material, which is right for a country of
 * hills and wrong for a pit: the benches are in the height field, but nothing
 * said they were rock, and a 52 m hole read as a hillside with a road up it.
 * This patches the ground's own material rather than adding a second mesh, so
 * the terrain, its lighting and its shadows are all still what they were, and
 * everything outside the pit's weight is *exactly* the colour it was.
 *
 * Three things are read off the fragment: how far it is from the pit (a
 * smooth weight, so the dust does not end in a line), how steep it is (the
 * walls are rock, the shelves and the floor are dust), and how high it is (a
 * stratum line at every bench height, so a wall reads as a flight of ledges).
 * `onBeforeCompile` rather than a `ShaderMaterial`, for the reason `worldUvs`
 * gives: lighting, fog and shadows should keep happening.
 *
 * The fragile part is the same one, string replacement against three.js's own
 * chunks; `quarryground.test.ts` is what notices when an upgrade renames one.
 */
export interface QuarryGroundOptions {
  /** Centre of the pit, in world units. */
  at: { x: number; z: number };
  /** Where the dust is full strength to, and how far past that it fades to grass. */
  radius: number;
  fade: number;
  /** Height of one bench, and of the pit floor, in world units. */
  bench: number;
  floor: number;
}

export function quarryGround(material: THREE.Material, options: QuarryGroundOptions): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPit = { value: new THREE.Vector3(options.at.x, options.at.z, options.radius) };
    shader.uniforms.uPitFade = { value: options.fade };
    shader.uniforms.uBench = { value: options.bench };
    shader.uniforms.uFloor = { value: options.floor };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPitWorld;
        varying float vPitUp;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPitWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vPitUp = normalize(mat3(modelMatrix) * normal).y;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uPit;
        uniform float uPitFade;
        uniform float uBench;
        uniform float uFloor;
        varying vec3 vPitWorld;
        varying float vPitUp;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float pitD = length(vPitWorld.xz - uPit.xy);
          float inside = 1.0 - smoothstep(uPit.z * 0.9, uPit.z + uPitFade, pitD);
          // Rock where it is steep, dust where it is not. The walls of a 52 m
          // pit are gentle to a normal (measured, they run 15 to 25 degrees
          // once the mesh has smoothed them), so the slope test starts well
          // short of vertical; and everything above the floor inside the pit
          // is wall, whatever a single vertex's normal says.
          float slope = 1.0 - smoothstep(0.88, 0.985, vPitUp);
          float above = smoothstep(uFloor + uBench * 0.3, uFloor + uBench * 1.3, vPitWorld.y);
          float steep = max(slope, above * 0.85);
          // A stratum every bench: pale and dark limestone, with a hard line
          // where one bench stops and the next starts.
          float band = fract((vPitWorld.y - uFloor) / uBench);
          float face = smoothstep(0.0, 0.07, band) * (1.0 - smoothstep(0.93, 1.0, band));
          vec3 pale = vec3(0.74, 0.62, 0.42);
          vec3 dark = vec3(0.40, 0.32, 0.22);
          vec3 rock = mix(dark, pale, smoothstep(0.1, 0.7, band)) * (0.5 + 0.5 * face);
          vec3 dust = vec3(0.72, 0.68, 0.60);
          // Flat ground above the floor is a ledge, and a ledge keeps a little grass.
          float ledge = (1.0 - slope) * above;
          dust = mix(dust, vec3(0.42, 0.50, 0.28), ledge * 0.4);
          vec3 pit = mix(dust, rock, steep);
          diffuseColor.rgb = mix(diffuseColor.rgb, pit, inside);
        }`,
      );
  };
  // Two patches sharing a key would share a compiled program.
  material.customProgramCacheKey = () => 'quarryground';
}
