import * as THREE from 'three';
import colorUrl from './materials/asphalt031/color.jpg?url';
import normalUrl from './materials/asphalt031/normal.jpg?url';
import roughnessUrl from './materials/asphalt031/roughness.jpg?url';

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

export function disposeMaterialSets(): void {
  if (!asphalt) return;
  asphalt.map.dispose();
  asphalt.normalMap.dispose();
  asphalt.roughnessMap.dispose();
  asphalt = null;
}
