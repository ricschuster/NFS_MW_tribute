import * as THREE from 'three';

/**
 * Leaf-card trees (#582, `?look=trees`).
 *
 * The flat-colour trees are cones and icosahedra: a silhouette with no edge.
 * A card tree is the same trunk with its foliage rebuilt from cut-out quads -
 * a handful of crossed or splayed cards, each carrying an alpha-tested
 * texture of needles or leaves - so the outline breaks up into sprigs and the
 * sun comes through the gaps, which is most of what makes a 2012 tree a tree.
 *
 * Everything here is generated: the texture is drawn on a canvas from a seeded
 * generator and the cards are placed by the same, so a tree is the same tree on
 * every run and nothing third-party is involved. Geometry is in metres, like
 * the rest of `setpieces.ts`, and the caller scales it.
 */
export type LeafKind = 'conifer' | 'broadleaf';

/** Which set pieces this replaces the foliage of, and with what. */
export const LEAF_KIND_BY_PIECE: Record<string, LeafKind> = {
  tree: 'conifer',
  'tree:broadleaf': 'broadleaf',
  'street-tree': 'broadleaf',
};

/** Trunk colours in `setpieces.ts`; any other part of these models is foliage. */
const TRUNK = new Set(['#4a3526', '#5a4230', '#5a4632']);
export const isTrunk = (colour: string): boolean => TRUNK.has(colour);

/** A small deterministic generator (mulberry32), so a tree never changes. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One card: a quad `width` across and `height` up, standing at `origin`, turned
 * to `yaw` and leaned `pitch` (positive tips the top outwards), with UVs 0..1.
 * Double sided in the material, so one quad does for both faces.
 */
function card(
  width: number,
  height: number,
  origin: THREE.Vector3,
  yaw: number,
  pitch: number,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  g.translate(0, height / 2, 0); // hinge at the bottom edge
  g.rotateX(pitch);
  g.rotateY(yaw);
  g.translate(origin.x, origin.y, origin.z);
  return g;
}

/**
 * The foliage cards for a kind: a conifer is tiers of cards splayed down and
 * out like branches; a broadleaf is a crown of cards at every angle, denser at
 * the outside, where leaves are.
 */
export function leafGeometries(kind: LeafKind): THREE.BufferGeometry[] {
  const r = rng(kind === 'conifer' ? 11 : 29);
  const cards: THREE.BufferGeometry[] = [];
  if (kind === 'conifer') {
    // Same envelope as the cones it replaces: 3 m radius at the bottom tier,
    // the tip near 12 m.
    const tiers = [
      { y: 2.4, reach: 3.1, count: 9 },
      { y: 4.8, reach: 2.5, count: 8 },
      { y: 7.0, reach: 1.9, count: 7 },
      { y: 9.0, reach: 1.2, count: 6 },
    ];
    for (const { y, reach, count } of tiers) {
      for (let i = 0; i < count; i++) {
        const yaw = ((i + r() * 0.6) / count) * Math.PI * 2;
        // Standing along the radius, leaning outwards and down.
        cards.push(card(reach * 1.5, reach * 1.35, new THREE.Vector3(0, y + r() * 0.5, 0), yaw, 1.05 + r() * 0.25));
      }
    }
    cards.push(card(1.6, 3.2, new THREE.Vector3(0, 9.6, 0), 0, 0.05), card(1.6, 3.2, new THREE.Vector3(0, 9.6, 0), Math.PI / 2, 0.05));
  } else {
    // A crown about 3.3 m in radius, centred 7 m up.
    const cx = 0;
    const cy = 6.8;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const e = (r() - 0.35) * Math.PI * 0.8;
      const d = 1.2 + r() * 1.7;
      const o = new THREE.Vector3(cx + Math.cos(a) * Math.cos(e) * d, cy + Math.sin(e) * d * 0.85, Math.sin(a) * Math.cos(e) * d);
      cards.push(card(4.4, 3.8, o.sub(new THREE.Vector3(0, 1.5, 0)), r() * Math.PI * 2, (r() - 0.5) * 1.4));
    }
  }
  return cards;
}

const textures = new Map<string, THREE.Texture>();

/**
 * The cut-out texture. Needles are short dark-to-light strokes along a spray;
 * leaves are small pointed ovals. Colour is baked here, so `autumn` can be a
 * different palette on the same geometry. Null without a DOM (the tests).
 */
export function leafTexture(kind: LeafKind, autumn = false): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const key = `${kind}:${autumn}`;
  const hit = textures.get(key);
  if (hit) return hit;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = rng(kind === 'conifer' ? 3 : 5);
  ctx.clearRect(0, 0, size, size);

  if (kind === 'conifer') {
    const greens = ['#1f3d2a', '#2a4c33', '#35603e', '#456f47'];
    // A central spine with needles raking off it, longest at the base.
    ctx.lineCap = 'round';
    for (let i = 0; i < 1800; i++) {
      const t = r();
      const y = size - t * size * 0.96 - 4;
      const spread = (1 - t * 0.7) * size * 0.5;
      const x = size / 2 + (r() * 2 - 1) * spread;
      const len = 16 + r() * 22;
      const dir = (x < size / 2 ? -1 : 1) * (0.3 + r() * 0.7);
      ctx.strokeStyle = greens[Math.floor(r() * greens.length)];
      ctx.lineWidth = 3 + r() * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * len, y - len * 0.7);
      ctx.stroke();
    }
  } else {
    const palette = autumn
      ? ['#a8481f', '#c4742a', '#d9a03a', '#8a3a1a', '#b98a2e']
      : ['#355f2a', '#46773a', '#58893f', '#2d5226', '#6a9645'];
    for (let i = 0; i < 520; i++) {
      const x = r() * size;
      const y = r() * size;
      const a = r() * Math.PI;
      const rl = 11 + r() * 10;
      ctx.fillStyle = palette[Math.floor(r() * palette.length)];
      ctx.beginPath();
      ctx.ellipse(x, y, rl, rl * 0.5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.set(key, texture);
  return texture;
}

/**
 * The material for foliage cards. `alphaTest` and not blending: sorted
 * transparency across thousands of instanced cards is a flicker, a cutout is
 * not, and three's shadow pass honours `alphaTest` so a card casts a sprig's
 * shadow rather than a rectangle's.
 */
export function leafMaterial(kind: LeafKind, autumn = false): THREE.MeshLambertMaterial {
  const map = leafTexture(kind, autumn);
  return new THREE.MeshLambertMaterial({
    map: map ?? undefined,
    color: map ? '#ffffff' : kind === 'conifer' ? '#2e5234' : '#4f7d3a',
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
}

export function disposeLeafTextures(): void {
  for (const t of textures.values()) t.dispose();
  textures.clear();
}
