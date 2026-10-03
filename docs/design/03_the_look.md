# The look: what it would take, and why not an engine

A discussion note from 2026-10-01, written down so it survives a change of
session. **Nothing here is decided or started.** The owner asked for
discussion only; the work behind it is #11, whose 2026-09-30 comment is the
earlier half of the same conversation.

## The goal

The owner's goal is **the look**, not an installed app. The target is the
reference game itself: *Need for Speed: Most Wanted* (2012), a realistic
daytime look. The frame it was judged against is from Callahan Industrial: a
yellow sports car on worn asphalt between grain silos and a concrete works,
conifers on the right, a hazy skyline behind. The frame is not in the repo; the
reference footage lives in `reference/`, which is git-ignored.

## What is in that frame

Roughly in order of how much of the impression each carries:

- **The grade.** Bleached, slightly cool: a cyan sky, lifted shadows, low
  saturation everywhere but the car. It holds the whole picture together, and
  it is one post-processing pass.
- **Haze.** The skyline fades to a pale blue-grey within a few hundred metres.
  Fog with the right colour and falloff.
- **Lighting.** One soft sun with a strong sky fill and fairly short, soft
  shadows. No bounce lighting, no ray tracing; the ambient is most likely
  precomputed.
- **Weathered materials.** The real difference. Asphalt with patches, cracks
  and dark tyre wear; stained, streaked concrete; corrugated, rusting silos;
  grime where walls meet the ground. Nothing is clean.
- **The car.** Glossy paint reflecting the sky, a dark contact shadow under it,
  and a properly modelled body: spoiler, exhausts, a number plate.
- **Trees.** Conifers built from cut-out leaf cards, and a broadleaf in autumn
  colour. No cones.
- **Street clutter.** Lamps, traffic lights, signs, red-and-white kerbs,
  railings. (The first draft also listed "a fence along the whole wall";
  nobody could say which wall it meant, so it was dropped, 2026-10-03.)
- **Particles.** Snow or dust in the air.
- **The HUD.** Angled panels, a cyan glow, a clean typeface. Ours has had no
  pass at all.

## Why an engine is not the answer

Moving out of the browser came up in two senses, and they are different things.

**Wrapping the web build as an installed app** (Electron or Tauri) is #99,
closed and deferred, with the comparison written up there; it leans Electron
because it ships the Chromium the game is tested in. It changes nothing about
how the game looks.

**Porting to an engine** (Unreal, Unity, Godot) would change the renderer, and
is a rewrite: about 38,000 lines of TypeScript (the sim, the generator, police,
traffic, events, saves), about 13,000 lines of tests, and every headless
`npm run` tool, all of which run the sim in Node with no screen. Two things
soften it - the city is data, so the generator and the authored map could stay
in TypeScript and export JSON to an engine, and the tests are a behavioural
spec to port against - but it is still months, and the map stops while it
happens.

The deciding point: **the target is 2012 console tech.** It ran on 512 MB of
memory and a 2005-era GPU, and WebGL2 on any recent machine is well past that.
Everything in the frame is available in three.js today: a LUT grade, fog,
cascaded shadows, ambient occlusion and bloom (all in three's examples, so no
new dependency), clearcoat paint with an environment map, leaf-card trees and
particles. The gap is **assets and materials, not rendering**, and an engine
makes no weathered walls and no car models.

If a port ever does happen, **Godot over Unreal**:

| | Unreal 5 | Godot 4 | Unity |
|---|---|---|---|
| Visual ceiling | Highest | Good, below Unreal | High |
| Language | C++ / Blueprints | GDScript or C# | C# |
| Files in git | Mostly binary; hard to read, diff or edit by an agent | Text (`.tscn`, `.gd`) | YAML scenes, noisy |
| Headless tests | Possible, heavy | Built in (`--headless`) | Possible |
| Licence | Free unless commercial | MIT | Proprietary |
| "Original or CC0" | Its look leans on Megascans/Fab, not CC0 | Neutral | Neutral |

Unreal is the worst fit for how this project is built: most of the code is
written by an agent, and most of an Unreal project lives in an editor and in
binary files. Its biggest visual advantage, scanned photoreal assets, also
collides with the shipping rule.

And the order: the port, if any, waits until the map is finished (downtown,
#268, is last), and only after the browser has been shown to fall short.

## Where the work is, cheapest first

1. **Grade, haze, cascaded shadows, ambient occlusion, car reflections.** Code
   only. Perhaps a third of the way to the frame on its own, and quick.
2. **Materials.** CC0 photo-sourced textures (asphalt, concrete, corrugated
   metal, brick) with normal and roughness maps, plus *procedural* weathering:
   dirt at wall bases, streaks, wear in the wheel tracks. Weathering by rule
   suits a city built from a seed. `scene/worlduv.ts` already solves the hard
   part of texturing instanced meshes.
3. **Trees and clutter.** Card trees, generated or CC0; barriers, kerbs,
   fences, signage. Many small instanced models.
4. **Buildings with geometry.** A kit of modules - shopfronts, loading bays,
   silos, cornices - so the boxes become buildings. Large, but procedural code,
   which is how the project already works.
5. **Car models, the hardest.** Forty-four cars, each needing an original model
   that reads as its stand-in without copying it. Real modelling work by any
   route (a person, CC0 bases, or long iteration); bodies can be shared. Nothing
   else on the list needs an artist as much.

Lighting and materials (1-2) are perhaps 60-70% of the impression and well
within reach; cars and building detail (4-5) are the long haul in any engine.

**The constraint that does bind is download size.** The reference streamed
gigabytes of texture from disc; a web game wants tens of megabytes, all cached
offline by the service worker (`dist/assets` is about 0.8 MB today). Tiling
textures, a few shared detail atlases and procedural weathering are how to fit,
and the same constraint would push the same way in an engine.

## Before the first asset

- **Sourcing rule.** CC0 libraries (Poly Haven, ambientCG for textures;
  Kenney, Quaternius for models) are clean. AI-generated assets were once ruled out;
  [ADR-0013](decisions/0013-ai-generated-assets-and-car-models.md) allows them,
  original and licence-clean, with a credits row each. Keep a credits list per
  file from the first asset.
- **An ADR for the asset pipeline** once real files are loaded: glTF, KTX2 for
  compressed textures, a size budget, level of detail at distance. The loaders
  ship inside three.js, so no new dependency.
- **The provider seam holds.** `city/` describes and `scene/` draws, so none of
  this touches the sim, the map or the baselines, and it can run alongside the
  map work.

## The suggested first step

A look-development comparison, offered on 2026-09-30 and not yet taken up: one
downtown street and one stretch of Highmoor woods rendered four ways (today,
lighting only, lighting plus CC0 materials, a graded version), set beside the
reference frame. A `cityshot` variant with a few renderer switches; no art
committed. It puts a picture behind every decision above.
