# 2. Pseudo-3D projected-segment rendering

- Status: superseded by [0004](0004-webgl-free-roam-city.md)
- Date: 2026-09-04

## Context

We want the sensation of driving a *Need for Speed: Most Wanted* car — speed, a
road rushing toward the horizon, hills and curves — as a solo-buildable browser
project. The realistic options were:

1. A true 3D engine (Three.js / WebGL) with real geometry and a camera.
2. A pseudo-3D, OutRun-style renderer that projects 2D road segments.
3. A top-down 2D racer.

A true 3D open world is out of scope for a solo tribute (asset pipeline, physics,
tooling). Top-down 2D loses the signature "road rushing at you" feeling.

## Decision

Use a **pseudo-3D projected-segment renderer**, following the well-established
technique from Jake Gordon's "How to build a racing game" series:

- The track is a fixed list of `Segment`s, each a slice of road between two
  z-planes, authored once from straights/curves/hills (`road.ts`).
- Each frame we project every visible segment from world space to screen space;
  a segment's on-screen scale is `cameraDepth / camera.z`, so distant segments
  shrink. Drawing back-to-front with a running `maxy` gives hill occlusion.
- The camera is fixed at the bottom of the screen; the world scrolls past it.
- Curves are faked by accumulating a horizontal offset across drawn segments,
  not by rotating a camera.

Stack: TypeScript + HTML5 Canvas 2D + Vite. No game engine, no runtime deps.

## Consequences

- Small, dependency-light codebase that builds to static files and deploys
  anywhere (e.g. GitHub Pages).
- Cheap to render — plain Canvas 2D fills, no WebGL.
- Everything is faked in 2D: there is no real 3D space. Features like traffic,
  cops, and sprites must be projected using the same per-segment scale trick
  rather than placed in a 3D scene.
- Physics runs on a fixed timestep, and `maxSpeed` is capped so the car cannot
  cross more than one segment per step (keeps future per-segment logic sound).
