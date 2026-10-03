import * as THREE from 'three';
import { UNITS_PER_METRE as M } from '../constants';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Screen-space ambient occlusion (#580, part of #11): behind the `ao` switch.
 *
 * The reference's creases read dark where a wall meets the road, under a
 * bridge, along a kerb. Flat Lambert boxes lit by one sun have no such
 * contact shading, so this darkens the ambient part of the frame where the
 * depth buffer says a surface is boxed in.
 *
 * It sits *first* in the effect chain, so it works on linear HDR before the
 * bloom and the grade, and reads the scene's own depth texture (the output
 * target's `depthTexture`), which costs nothing extra to render. The depth
 * buffer is logarithmic (`cityview.ts`), so view distance is decoded with the
 * inverse of three's `gl_FragDepth` write rather than the usual projection.
 *
 * Cost control: the occlusion is solved at half resolution (one pass of
 * `AO.taps` samples), then the composite upsamples it with a depth-aware
 * blur. `npm run looktime -- --look 'none;ao'` is the check.
 */
export const AO = {
  /** Metres: how far from a point an occluder still counts. */
  radius: 3.5,
  /** 0 is none; 1 is the raw occlusion. Kept low: a crease, not a smudge. */
  strength: 1.0,
  /** Samples per pixel, rotated per pixel by interleaved gradient noise. */
  taps: 10,
  /** Metres of depth below which a sample is on the same surface. */
  bias: 0.06,
} as const;

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

// View-space distance from the log depth three writes:
//   depth = log2(w + 1) * Fcoef * 0.5 with Fcoef = 2 / log2(far + 1).
const DECODE = `
  uniform float logFar;
  float viewDist(float d) { return exp2(d * logFar) - 1.0; }`;

const SOLVE = {
  uniforms: {
    tDepth: { value: null as THREE.Texture | null },
    logFar: { value: 1 },
    tanHalf: { value: new THREE.Vector2(1, 1) },
    step: { value: new THREE.Vector2(1, 1) },
    radius: { value: AO.radius * M },
    taps: { value: AO.taps },
    bias: { value: AO.bias * M },
  },
  vertexShader: VERT,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDepth;
    uniform vec2 tanHalf;
    uniform vec2 step;
    uniform float radius;
    uniform float bias;
    uniform int taps;
    varying vec2 vUv;
    ${DECODE}
    vec3 viewPos(vec2 uv) {
      float w = viewDist(texture2D(tDepth, uv).x);
      return vec3((uv * 2.0 - 1.0) * tanHalf * w, -w);
    }
    void main() {
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 >= 0.9999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = viewPos(vUv);
      // Normal from the neighbours, taking the side nearer in depth on each
      // axis so a silhouette edge does not tilt it.
      vec3 pr = viewPos(vUv + vec2(step.x, 0.0)), pl = viewPos(vUv - vec2(step.x, 0.0));
      vec3 pu = viewPos(vUv + vec2(0.0, step.y)), pd = viewPos(vUv - vec2(0.0, step.y));
      vec3 dx = abs(pr.z - p.z) < abs(pl.z - p.z) ? pr - p : p - pl;
      vec3 dy = abs(pu.z - p.z) < abs(pd.z - p.z) ? pu - p : p - pd;
      vec3 n = normalize(cross(dx, dy));
      if (dot(n, p) > 0.0) n = -n;
      float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float spin = noise * 6.2831853;
      // Screen radius of the world radius at this distance.
      float rs = radius / max(-p.z, 0.1) / tanHalf.y * 0.5;
      float occ = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= taps) break;
        float t = (float(i) + 0.5) / float(taps);
        float a = spin + float(i) * 2.399963;
        vec2 off = vec2(cos(a), sin(a)) * sqrt(t) * rs;
        off.x *= tanHalf.y / tanHalf.x;
        vec2 uv = vUv + off;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
        vec3 s = viewPos(uv) - p;
        float len = length(s);
        float above = dot(s, n) - bias * max(1.0, -p.z * 0.0002);
        // Occluders count inside the radius and fade out past it, so a far
        // wall seen over a near kerb does not darken the kerb.
        float range = 1.0 - smoothstep(radius * 0.5, radius * 2.0, len);
        occ += max(above, 0.0) / (len + 0.01) * range;
      }
      float ao = 1.0 - occ / float(taps) * 5.0;
      gl_FragColor = vec4(clamp(ao, 0.0, 1.0));
    }`,
};

const COMPOSITE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tAo: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    logFar: { value: 1 },
    texel: { value: new THREE.Vector2(1, 1) },
    strength: { value: AO.strength },
  },
  vertexShader: VERT,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tAo;
    uniform sampler2D tDepth;
    uniform vec2 texel;
    uniform float strength;
    varying vec2 vUv;
    ${DECODE}
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      float w0 = viewDist(texture2D(tDepth, vUv).x);
      // Depth-aware 4x4 blur over the half-res AO: removes the per-pixel
      // noise, and a neighbour on another surface does not leak across.
      float sum = 0.0, wsum = 0.0;
      for (int y = -1; y <= 2; y++) {
        for (int x = -1; x <= 2; x++) {
          vec2 uv = vUv + (vec2(float(x), float(y)) - 0.5) * texel;
          float wd = viewDist(texture2D(tDepth, uv).x);
          float k = exp(-abs(wd - w0) / max(20.0, w0 * 0.02));
          sum += texture2D(tAo, uv).x * k;
          wsum += k;
        }
      }
      float ao = wsum > 0.0 ? sum / wsum : 1.0;
      gl_FragColor = vec4(src.rgb * mix(1.0, ao, strength), src.a);
    }`,
};

export class AoPass extends Pass {
  private readonly half: THREE.WebGLRenderTarget;
  private readonly solve = new THREE.ShaderMaterial(SOLVE);
  private readonly composite = new THREE.ShaderMaterial(COMPOSITE);
  private readonly quad = new FullScreenQuad();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    super();
    this.half = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    // Nearest, so the depth-aware blur chooses its own weights.
    this.half.texture.minFilter = THREE.NearestFilter;
    this.half.texture.magFilter = THREE.NearestFilter;
  }

  override setSize(width: number, height: number): void {
    this.half.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const depth = readBuffer.depthTexture;
    if (!depth) return;
    const cam = this.camera;
    const logFar = Math.log2(cam.far + 1);
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);

    const s = this.solve.uniforms;
    s.tDepth!.value = depth;
    s.logFar!.value = logFar;
    (s.tanHalf!.value as THREE.Vector2).set(tanY * cam.aspect, tanY);
    (s.step!.value as THREE.Vector2).set(1 / this.half.width, 1 / this.half.height);
    this.quad.material = this.solve;
    renderer.setRenderTarget(this.half);
    this.quad.render(renderer);

    const c = this.composite.uniforms;
    c.tDiffuse!.value = readBuffer.texture;
    c.tAo!.value = this.half.texture;
    c.tDepth!.value = depth;
    c.logFar!.value = logFar;
    (c.texel!.value as THREE.Vector2).set(1 / this.half.width, 1 / this.half.height);
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.half.dispose();
    this.solve.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
