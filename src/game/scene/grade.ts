import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * The colour grade (#580, part of #11): behind the `grade` look switch.
 *
 * The reference frames are not saturated and not contrasty. Blacks sit lifted
 * and cool, highlights drift warm, colour is pulled toward grey, and the whole
 * frame has a faint vignette. Our flat Lambert boxes at full saturation are
 * the opposite, so this is the cheapest single change that moves a frame
 * toward the target.
 *
 * It runs in the renderer's effect chain, so its input is linear HDR and
 * *before* ACES: the contrast curve pivots on mid grey (0.18) and the lift
 * is small, because ACES will crush whatever it is handed. Tune by looking at
 * `npm run looksheet -- --look 'none;grade'`, not by the numbers.
 */
export const GRADE = {
  /** 1 is untouched, 0 is monochrome. */
  saturation: 0.84,
  /** Contrast about mid grey; above 1 is steeper. */
  contrast: 1.06,
  /** Added to the blacks, tinted cool. */
  lift: new THREE.Color(0.03, 0.036, 0.046),
  /** Multiplied into the lights: warm. Shadows get the inverse tint. */
  warmth: new THREE.Color(1.04, 1.0, 0.94),
  /** 0 is none; darkens the corners by about this much. */
  vignette: 0.1,
} as const;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: GRADE.saturation },
    contrast: { value: GRADE.contrast },
    lift: { value: GRADE.lift },
    warmth: { value: GRADE.warmth },
    vignette: { value: GRADE.vignette },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 lift;
    uniform vec3 warmth;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, saturation);
      // Contrast in log space about mid grey, so a bright sky is not blown
      // further and a dark wall is not crushed before the tone mapper.
      c = 0.18 * pow(max(c, vec3(1e-4)) / 0.18, vec3(contrast));
      // Split tone: the shadows lean to the lift's cool, the lights to warm.
      float lit = smoothstep(0.0, 0.5, luma);
      c *= mix(vec3(2.0) - warmth, warmth, lit);
      c += lift * (1.0 - lit);
      float edge = length(vUv - 0.5) * 1.4142;
      c *= 1.0 - vignette * edge * edge;
      gl_FragColor = vec4(c, src.a);
    }`,
};

export function makeGradePass(): ShaderPass {
  return new ShaderPass(GradeShader);
}
