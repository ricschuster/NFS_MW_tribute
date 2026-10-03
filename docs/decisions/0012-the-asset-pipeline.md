# 12. The asset pipeline: CC0 photo textures, small and cached

- Status: accepted
- Date: 2026-10-03
- From: [design/03](../design/03_the_look.md), "Before the first asset"; #581

## Context

Everything shipped so far is generated: textures are drawn on a canvas at
start-up and `dist/assets` is about 0.8 MB. The look plan (#11) wants
photo-sourced surfaces - asphalt, concrete, corrugated metal, brick - with
normal and roughness maps, which is the first time the repo holds binary art.
Four things have to be settled before the first file goes in: where it may come
from, what format and size it ships at, how it loads, and how it is credited.

## Decision

1. **Source: CC0 only.** ambientCG and Poly Haven for textures; Kenney and
   Quaternius for models when #584 gets there. AI-generated textures are ruled
   out, as are any with a licence that needs attribution to ship. Nothing
   third-party from the reference game, ever (CLAUDE.md).
2. **Credits from the first file.** `src/game/scene/materials/CREDITS.md` has
   one row per set: source page, licence, where it is used, and what was done
   to it. A set without a row does not merge.
3. **Format: JPEG, bundled by Vite.** Colour, normal (OpenGL convention, which
   is what three.js reads) and roughness as separate JPEGs, imported with
   `?url` so the build hashes them and the generated service worker precaches
   them with everything else (#98). KTX2 would cut GPU memory and decode time,
   but it needs a transcoder and an encoder in the toolchain; revisit when the
   set count makes GPU memory the problem, not before.
4. **Size budget: 4 MB of material files in total, 1K at most per map.** The
   roughness map is halved to 512 px since it carries little detail. One set is
   about 570 KB. The budget is checked by looking at `dist/assets`, and a set
   that would break it replaces one rather than adding to it.
5. **Loading: three.js's own `TextureLoader`, lazily.** A set is only
   requested when the surface that uses it is built, so a page with the look
   switched off never asks (the service worker still caches the files, so the
   download is paid once and offline play works). No new runtime dependency.
6. **Mapping: world units.** Sets tile through `worldUvs`, which now hands the
   same coordinate to the normal and roughness maps, so a tile is the same
   size on every instance.
7. **Level of detail: none yet.** Mipmaps and anisotropy do the work at a
   distance. Revisit with the building kit (#583).
8. **Behind `?look=materials` until the owner has seen it**, as every look
   phase has been (#579).

## Consequences

- The repo gains binaries, so each set is small and each is listed. Re-encoding
  a set is a one-line Python job recorded in its credits row, not a tool.
- Weathering stays procedural and in the shader, by world position, so a seed
  that generates a larger city gets more of it for no extra download.
- The sim, `city/` and the citylap baselines are untouched: this is `scene/`.
