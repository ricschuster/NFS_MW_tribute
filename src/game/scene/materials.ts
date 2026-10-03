import * as THREE from 'three';
import colorUrl from './materials/asphalt031/color.jpg?url';
import normalUrl from './materials/asphalt031/normal.jpg?url';
import roughnessUrl from './materials/asphalt031/roughness.jpg?url';
import concreteColour from './materials/concrete034/color.jpg?url';
import concreteNormal from './materials/concrete034/normal.jpg?url';
import concreteRough from './materials/concrete034/roughness.jpg?url';
import brickColour from './materials/bricks101/color.jpg?url';
import brickNormal from './materials/bricks101/normal.jpg?url';
import brickRough from './materials/bricks101/roughness.jpg?url';
import steelColour from './materials/corrugatedsteel005/color.jpg?url';
import steelNormal from './materials/corrugatedsteel005/normal.jpg?url';
import steelRough from './materials/corrugatedsteel005/roughness.jpg?url';

/**
 * Photo-sourced CC0 surfaces (#581, ADR-0012).
 *
 * A set is three tiling images - colour, normal (OpenGL convention, which is
 * what three.js reads) and roughness - sampled in world units through
 * `worldUvs`, so a tile is the same size on every road however the instance is
 * scaled. Credits for each set are in `materials/CREDITS.md`.
 *
 * Loaded lazily and only when `?look=materials` is on, so a plain build never
 * asks for them. The loader is three.js's own; there is no dependency here.
 */
export interface MaterialSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

let asphalt: MaterialSet | null = null;

function load(url: string, colour: boolean): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // The tarmac is seen at grazing angles; see `roadTexture`.
  texture.anisotropy = 8;
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Ambient CG's Asphalt 031, shared by every carriageway that uses it. */
export function asphaltSet(): MaterialSet {
  asphalt ??= {
    map: load(colorUrl, true),
    normalMap: load(normalUrl, false),
    roughnessMap: load(roughnessUrl, false),
  };
  return asphalt;
}

/**
 * A wall finish: a photo set laid *over* the window grid of `facades.ts`.
 *
 * The grid stays the building's own map (it is what says where the windows
 * are and what lights at night); the photo adds grain, relief and roughness
 * at its own scale. The colour is applied as a modulation about the set's mean
 * brightness, so the instance's own colour still decides what shade the
 * building is, and `hue` says how much of the photo's own colour comes through:
 * none for concrete and steel, which take the building's tint, some for brick,
 * which is red whatever the building was told.
 */
export interface WallFinish extends MaterialSet {
  /** Metres of wall one tile covers, across and up. */
  tile: { u: number; v: number };
  /** The set's average brightness, so the modulation is centred on 1. */
  mean: number;
  /** 0 takes only the photo's brightness, 1 all of its colour. */
  hue: number;
}

export type WallKind = 'concrete' | 'brick' | 'steel';

const finishes = new Map<WallKind, WallFinish>();

const FINISH: Record<WallKind, { urls: [string, string, string]; tile: { u: number; v: number }; mean: number; hue: number }> = {
  // 1024 x 512, so twice as wide as it is tall.
  concrete: { urls: [concreteColour, concreteNormal, concreteRough], tile: { u: 4, v: 2 }, mean: 0.723, hue: 0 },
  brick: { urls: [brickColour, brickNormal, brickRough], tile: { u: 1.8, v: 1.8 }, mean: 0.486, hue: 0.65 },
  steel: { urls: [steelColour, steelNormal, steelRough], tile: { u: 2, v: 2 }, mean: 0.607, hue: 0 },
};

/** Concrete 034, Bricks 101 and Corrugated Steel 005, built once and shared. */
export function wallFinish(kind: WallKind): WallFinish {
  let hit = finishes.get(kind);
  if (!hit) {
    const { urls, ...rest } = FINISH[kind];
    hit = {
      map: load(urls[0], true),
      normalMap: load(urls[1], false),
      roughnessMap: load(urls[2], false),
      ...rest,
    };
    finishes.set(kind, hit);
  }
  return hit;
}

export function disposeMaterialSets(): void {
  for (const set of [asphalt, ...finishes.values()]) {
    if (!set) continue;
    set.map.dispose();
    set.normalMap.dispose();
    set.roughnessMap.dispose();
  }
  asphalt = null;
  finishes.clear();
}
