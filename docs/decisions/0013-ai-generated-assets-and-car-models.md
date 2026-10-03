# 13. AI-generated assets are allowed, and how the cars may be sourced

- Status: accepted
- Date: 2026-10-03
- Amends: [0012](0012-the-asset-pipeline.md) rule 1 (the AI clause only)
- From: the cars pass (#584), under #11; [design/03](../design/03_the_look.md)

## Context

ADR-0012 ruled out AI-generated textures, and `03_the_look.md` called them "the
grey area ... best ruled out". The reasoning was licensing, written when the
only assets in view were CC0 texture sets. The rule was never about quality or
authorship: every line of this repo, the generator, the sim and the procedural
cars, was written by an AI, so "no AI" never described how the project is made.

The cars (#584) are the first place it matters. Forty-four cars need models
that read as their stand-ins without copying them. Better procedural shapes
(#610-#614) go a long way, but the reference game's cars are hand-modelled,
with interiors, light units and brake assemblies that a lofted body does not
have. The owner is not a 3D artist, will not hire one, and wants nothing ruled
out ("D and E are on the table").

## Decision

1. **AI-generated assets are allowed**: meshes, textures, concept images. The
   test is the one CLAUDE.md already has, applied to what *ships*: nothing
   third-party is in the game or its data. For an AI-made asset that means:
   - **Original.** Prompts and reference images describe an original design.
     They never name a real car, make or model, and an output that reads as a
     specific real car is rejected or reworked. Concept images are never taken
     from the reference game or from a real car's photographs.
   - **Licence-clean.** The generating tool's licence (or the hosted service's
     terms) must permit shipping the output in a free, non-commercial game, and
     the licence text is checked before the first run, not after. Models with
     territorial or field-of-use limits are noted in the credits row.
   - **Credited.** One row per car (or per set) in a credits file, giving the
     tool and version, the licence, the prompt or the brief it came from, and
     what was done to the output. A model without a row does not merge.
2. **Everything else in 0012 stands**: CC0 is still the default for photo
   textures (ambientCG, Poly Haven) and for CC0 models (Kenney, Quaternius), the
   size budget applies, loading is lazy, and nothing third-party from the
   reference game ships, ever.
3. **Car sourcing: a pilot, then a choice.** The procedural lofted cars
   (`scene/carshape.ts`) stay as the shipped default and the fallback for any
   car that has no model. Two routes are piloted on one car and compared in the
   city, in motion, by the owner:
   - **D, authored bodies.** Hand-modelled in Blender. The owner is not an
     artist and will not hire one, so this is only open through scripts and
     parts of D (a loader, a part convention, scripted clean-up).
   - **E, AI-generated bodies.** A concept image set (side, three-quarter, rear)
     to a locally run image-to-3D model (TRELLIS or Hunyuan3D class, on the
     RTX 3090), then cleaned up by script in Blender.
4. **The pipeline is shared by both routes**:
   - glTF (`.glb`), loaded with three.js's own `GLTFLoader`: no new runtime
     dependency.
   - A part convention: the body is one mesh with its own paintable material and
     stays the first child (`CarPool` repaints `children[0]`); wheels, glass,
     lights and interior are separate nodes.
   - Clean-up is scripted and checked in: Blender 5.2 runs headless
     (`blender -b -P tools/...`). Generated output is never edited by hand in a
     way a script cannot repeat, so a car can be regenerated.
   - A budget of about 15-30k triangles for a hero car, less for traffic, and a
     share of the 10 MB asset cap from 0012 agreed before the second car.
   - Behind a `?look=` switch until the owner has seen it, like every look phase
     (#579).
5. **Motion comes first and is independent of sourcing**: body roll, dive and
   squat, wheels that spin and steer, brake and head light glow. View-side only;
   the sim and the citylap baselines are untouched. A new model is judged moving.

## Consequences

- ADR-0012 and `03_the_look.md` are amended to point here, and
  `materials/CREDITS.md` no longer says "nothing AI-generated". The CC0 rows
  there are unchanged.
- The pilot may fail: image-to-3D output often has fused wheels, wobbly
  symmetry and no separable parts, and scripts cannot fix every case. If it
  does, the procedural cars remain the answer and this ADR still stands for
  textures and props.
- Licence facts about specific tools are checked when the tool is chosen. In
  particular, one candidate's community licence is believed to exclude some
  territories; that is unverified until read.
- Whether AI output is copyrightable at all is unsettled in many places. The
  project is non-commercial, so the risk is accepted, and the credits row keeps
  the provenance on record.
