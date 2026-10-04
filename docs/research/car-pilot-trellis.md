# The car pilot: image-to-3D with TRELLIS.2 (#584, ADR-0013 route E)

Notes from setting up the pilot on 2026-10-03, so the next session starts at the
run, not at the licence reading. Status at the end of the day: **everything is
downloaded and written; the first run has not happened.**

## What the pilot is

One car, the **Kestrel** (`fastback`, the starter, the one the chase camera
shows all game), goes through a locally run image-to-3D model, the result is
cleaned up in Blender 5.2 by script, and the owner compares it with the
procedural car in motion. Procedural stays the shipped default and the fallback
(ADR-0013 rule 3). Route D (scripted Blender authoring) is the other half of the
pilot and is not started.

The input is a render of **our own** procedural Kestrel, never anything from
`reference/` and never a real car's photograph (ADR-0013 rule 1). The reference
frames are screenshots of the 2012 game's real cars; they are the wrong input on
licence grounds as well as technical ones (small car, motion blur, HUD).

## Licences, as read on 2026-10-03

Read from the pages, not from memory. Re-read before relying on them.

| Piece | Licence | Notes |
|---|---|---|
| TRELLIS.2 code and `microsoft/TRELLIS.2-4B` weights | MIT | Needs a 24 GB NVIDIA GPU (tested by the authors on A100/H100; the RTX 3090 is exactly 24 GB, so start at the 512 pipeline). |
| `facebook/dinov3-vitl16-pretrain-lvd1689m` | DINOv3 License (Meta), gated | Named by the weights repo's `pipeline.json` as `image_cond_model`; the README never mentions it. Worldwide, royalty-free, commercial use allowed, no size limits. Redistributing the model needs the licence text and "Built with DINOv3". Prohibited: military, weapons, ITAR, sanctions. Shipping generated meshes is not redistribution of the model, on a plain reading. Meta approves the gate by hand; the owner's request was granted the same day. |
| `briaai/RMBG-2.0` | gated, believed non-commercial, remote code | Named by `pipeline.json` as `rembg_model`. **Not downloaded, not licence-checked.** `tools/trellis/run.py` stubs it out. |

The credits row for any pilot output says: TRELLIS.2 (MIT), DINOv3 encoder
(DINOv3 License), input = our procedural Kestrel render, background cut-out by
our own flood fill. No row, no merge (ADR-0013).

## What is on the machine

Nothing here is in git except the three scripts below.

- `~/micromamba-bin/bin/micromamba` (2.9.0); env `trellis2` under
  `~/micromamba` (Python 3.10, torch 2.6.0+cu124).
- `~/src/TRELLIS.2` (cloned `--recursive`); extensions built in
  `~/src/extensions`.
- HF cache: `microsoft/TRELLIS.2-4B` (about 15 GB) and the DINOv3 repo
  (1.2 GB). `hf auth login` is done as the owner (an OAuth token that
  refreshes itself).
- System nvcc is 12.4, which is what TRELLIS wants. Blender 5.2.2 is installed
  via snap.

## The three scripts

- `tools/carview.mjs` - renders a procedural car, flat-lit on a plain
  background, from five angles. Header says how to call it. Our own model only.
- `tools/trellis/install.sh` - **the owner runs it by hand**: it builds CUDA
  code from several GitHub repos and Claude Code's auto-mode classifier refused
  to run it, so it was written for the owner to read and run. It follows
  TRELLIS's `setup.sh` without the `sudo apt` line and `pillow-simd`.
- `tools/trellis/run.py` - image to `.glb`. **Never run yet**, so expect a first
  error. It cuts the car out of the render itself (flood fill from the corners),
  saves `input_rgba.png` for a look, stubs the background remover, runs the 512
  pipeline, prints peak GPU memory and exports a 2048-texture `.glb` at a
  200k-triangle decimation target. Blender takes it down to the 15-30k budget.

## Gotchas found

- **The car group contains a blob-shadow plane** scaled about 2340 x 6792 units
  (name `contact`, the child at `z` about 2346). Any code that measures a car
  with `Box3.setFromObject` must remove it first, or the car comes out tiny and
  off-centre. `carview.mjs` drops any child with `scale.z > 1000`.
- The game's internal unit is large: a car is about 1160 units long, so a
  stand-alone scene must rescale it (`carview.mjs` brings it to 5 units).
- **`flash-attn` failed with `Errno 18: Invalid cross-device link`**: pip builds
  in `/tmp` and moves the prebuilt wheel into `~/.cache`, two filesystems here.
  `install.sh` sets `TMPDIR=$HOME/tmp`. It then finds a prebuilt wheel and does
  not compile.
- The slow builds are CuMesh, FlexGEMM and o-voxel (o-voxel pulls Eigen). Expect
  20 to 40 minutes in all.
- Do not `pgrep -f` or `pkill -f` for these processes; see the memory note on
  broad pkill.

## Next steps

1. Check the install log ended with `INSTALL-DONE` (`~/trellis-install.log`).
2. `node tools/carview.mjs fastback '#d8442f' ~/kestrel` for the five views
   (they exist in the previous session's scratchpad only).
3. Run `tools/trellis/run.py` on `front34.png` at `--type 512`; look at
   `input_rgba.png` first. If it fits and looks promising, try
   `--type 1024_cascade`.
4. Open the `.glb` in Blender: are the wheels separate or fused, is it
   symmetric, does it read as a real car (reject if so, ADR-0013)? Judge the
   output against `front34.png`, not from memory.
5. Script the clean-up (`blender -b -P tools/...`), load with `GLTFLoader`
   behind a `?look=` switch, write the credits row, and let the owner judge it
   in motion. If it fails, the procedural cars remain the answer.

## Results

Everything below was run on 2026-10-03 with `--type 512`, seed 42. Images and
.glb files are not committed; they are in `~/Pictures/crosstown-compare/`.

### Earlier attempts (owner's account, nothing kept)

TRELLIS was tried on the Kestrel before this pilot's scripts existed. Two
attempts, results "weren't any good", and the procedural design stayed. The
inputs, settings and outputs were not kept, which is why this section exists:
**write down every attempt, with input, settings and a picture.**

### Run 1: a concept image from the owner's work Copilot account

An experiment only. The image came from the owner's employer's Copilot Premium
account, so it, the .glb and every render of them stay out of the repo, the
credits and the game. Not an input for anything that ships.

- Needed one fix to run: transformers 5 moved the DINOv3 blocks from `.layer`
  to `.model.layer`; `run.py` now aliases it.
- The mesh reads as a modern coupe from every side, with believable proportions,
  five-spoke wheels and red calipers. Close up: lumpy body, glass is a dark
  painted blob, lamps and grille smeared, the rear is invented, wheels are fused
  into the arches (one mesh, so they cannot spin or steer), about 200k triangles
  against a 15-30k budget.
- At chase-camera distance the lumps vanish and it beats our procedural Kestrel
  by a wide margin. The fused wheels are the one hard blocker for the game.
- Cost of the wheels: split in Blender (hours, ragged cut, holes to fill), or
  delete them and place our own wheels at the hub positions (about an hour or
  two scripted, and reuses #617's spin and steer). Not doing either until a
  shippable input exists.

### Run 2: our own Kestrel render (`carview.mjs fastback`)

- TRELLIS reproduced the low-poly render faithfully and added nothing: same
  flat panels, same grey wheel discs, same dark glass. Peak GPU 2.8 GB.
- So the output is only as good as the input. An image-to-3D model does not
  improve a model that is already simple; it copies it, with softer edges.
  Side by side in the chase camera it is indistinguishable from the game's own
  Kestrel (`chase_compare_kestrel.png`).
- Conclusion: feeding it our renders is pointless. The gain in Run 1 came from
  the detailed photoreal input, which has to be generated by something else.

### Run 3: FLUX.1-schnell concept images, prompt 0 (rejected)

Local FLUX.1-schnell (Apache-2.0), `tools/trellis/flux_concept.py`, 2026-10-03,
4 steps, 1024x768, seeds 1-4, bf16 with sequential CPU offload (model offload
ran out of GPU memory: the transformer is 23 GB). Prompt 0 asked for "a sleek
original two-door sports coupe in glossy red" and named no real car. **It still
drew real ones**: seed 1 wears a Toyota badge, seeds 2 and 3 a Ford Mustang
pony, seed 4 a generic EV-coupe nose. All rejected: a mesh from them inherits
a real marque's face. Lesson: a no-name prompt is not enough, and every
generated image has to be looked at for badges before it goes anywhere.
Pictures: `~/Pictures/crosstown-compare/flux/contact.png`. Prompts, seeds and
date are in `flux/log.json`.

### Run 4: FLUX prompt 2 (unbranded) into TRELLIS

Prompt 2 asks for "an unbranded one-off concept sports coupe prototype ...
completely blank smooth grille and nose with no badge, no logo, no emblem, no
lettering". Seeds 1-6 (`flux/contact2.png`): no real marque recognisable, but
most still carry a tiny generic round hood emblem and a blank plate. Those are
invented marks, not a real one; TRELLIS at 512 smears them to nothing, and the
Blender clean-up can remove them. Three-quarter seeds 4 and 1 went through
TRELLIS (`--type 512`, seed 42, about 2 min each), rendered by
`tools/trellis/render_glb.py` (`trellis_flux_sheet.png`).

- Seed 4: orange, a heavy black roof blob, muddy rear. Rejected.
- **Seed 1: the pick.** Reads as a coupe from every side: tinted glass, a
  fastback roof, split rear lamps, five-spoke wheels, diffuser. Same faults as
  Run 1: wheels fused into the arches, one mesh with one material, 157k
  vertices, rear invented, lumpy close up.
- Chase-camera side-by-side with the in-game Kestrel:
  `chase_compare_flux_s1.png`. It beats the Kestrel clearly.

**Credits row, once this merges** (do not add until it does):
model FLUX.1-schnell (black-forest-labs, Apache-2.0); prompt 2 above, seed 1,
2026-10-03, 4 steps; then TRELLIS.2-4B (MIT) at `--type 512`, seed 42, input
`flux/p2_s1.png`; DINOv3 encoder under Meta's licence (check its terms cover
generated output before shipping); RMBG-2.0 is not used. Plus a Blender
clean-up.

### Costing the wheel fix

The glb is one mesh, one node, one material (157k vertices), so nothing in it
can spin or steer. #617's `poseWheels` wants four `THREE.Mesh` wheels with
a cylinder `tyreRadius`, in `carParts` order, the front pair at +z. Plan:

1. Script in Blender: find the four wheel clusters (low, outboard, round),
   fit a hub centre and tyre radius to each, delete those vertices and cap the
   arch with a dark inner-well disc. Roughly 2-3 hours for the script, plus a
   hand pass on the ragged edges per car.
2. Load the glb behind a `?look=` switch, drop in the game's own wheel meshes
   at the four hubs, scale to the fitted radius. About an hour, since the
   wheels, spin and steer already exist.
3. Decimate 157k vertices to the 15-30k budget and bake one texture: about an
   hour in Blender, plus checking the silhouette survives.

So one car is about half a day, nearly all of it step 1. Per car that is not
cheap, so it only makes sense for a hero car (the Kestrel). Risk: arch
openings left by deleted wheels look wrong if the fitted radius is off.

### Run 5: route D spike, the Kestrel authored in Blender by script

Owner chose this over the wheel fix (2026-10-03), without the FLUX reference.
`tools/cars/kestrel.py` (`blender -b -P tools/cars/kestrel.py -- OUT.glb PREVIEW_PREFIX`),
nothing generated, nothing third-party, so no credits row. About two hours,
three renders to get right.

- **How it is built:** a lofted shell (90 cross-sections of 22 points, curves
  through monotone cubics for the roofline, belt line and plan), shoulder and
  sill creases, subdivision level 2, wheel arches cut by exact boolean.
  Window faces are tagged on the lofted grid before smoothing, so their edges
  are straight and they lift off the shell as a separate `b_glass` mesh. Lamps,
  mirrors, grille and exhausts are placed by ray-casting onto the finished shell.
  Four wheels (tyre, five-spoke rim, disc, caliper) are separate nodes about
  their hubs, nose +z, front pair at +z, as `poseWheels` wants.
- **Size:** 37.6k triangles (the 15-30k budget wants a decimate or a lower
  subdivision level), 1.7 MB .glb, `public/models/kestrel.glb`.
- **Loader:** `scene/glbcar.ts`, behind `?look=models` (off by default; the
  default look is every *other* switch). Merges each wheel back into one mesh,
  keeps the paint primitive as `children[0]`, clones the paint material per car.
  Two bugs found by looking: the loader splits multi-material nodes into a mesh
  per material (so the wheels and the body's first child were wrong), and the
  paint material was shared, so parked cars of the same body repainted the
  player's car dark. Tests: 825 pass, typecheck clean.
- **Pictures** (`~/Pictures/crosstown-compare/blender/`): `v1`/`v2_sheet.png`
  (Blender), `game_procedural.png`, `game_v3.png`, and
  `compare_procedural_blender_trellis.png` (procedural | Blender | TRELLIS).
- **Verdict so far:** against the low-poly Kestrel it is a clear but modest step:
  rounder body, real glass, real wheels that spin and steer. Against the TRELLIS
  car it is plainer and softer: no shut lines, no lamp internals, no rim detail
  at this distance. It reads as a competent generic coupe, which is what a
  script and a day get. Not yet judged in motion by the owner.
- **Pass 2 (owner: wheels a huge improvement, the rest better but needs work):**
  dark valances and sills tagged on the lofted grid, fuller nose and tail,
  tail kick, a ridge under the shoulder, bigger lamps and grille, 27.4k
  triangles (in budget). The loader now gives the paint the procedural cars'
  lacquer and the same baked dirt shading, which removed the pink wash.
  Pictures: `blender/v3_sheet.png`, `v4_sheet.png`, `game_v4.png`.
- **Pass 3 (detail, owner chose (a) first):** shut lines for hood, doors and
  boot laid as thin ribbons ray-cast onto the shell (`seam()`); dark lamp
  bezels behind the lenses; a thin spoiler blade on the rear deck; twin-spoke
  rims with a centre cap and lug nuts; shoulder creases firmed (0.85/0.4);
  mirror housings dark. 29.3k triangles, 1.4 MB. Two lessons: **tagging faces
  for lines or bezels on the finished shell looks pixelated** (the faces are
  1 cm), so use ribbons and blobs; and **a raised tail lip written into the
  `BELT` curve folds the loft over itself**, which rendered fine in Blender but
  came out dark and blotchy in the game (inverted normals), so the lip is a
  separate part. `hit()` now flips the ray-cast normal to face the ray, since
  the shell's face normals can point inward. Mirrors were white balls in game
  (paint-named material got the vertex-colour treatment); they are trim now.
- **Open:** the shoulder is still soft at chase distance; nose and tail are
  still plain; headlight glow check at night; other bodies would need their
  own parameter sets (the script is one car, not yet a kit).

### Where that leaves the pilot

The only route that gave a better-looking car is a detailed concept image in
(Run 1). For shipping that needs a licence-clean source: local FLUX.1-schnell
(Apache-2.0, in the HF cache, not yet tried), with an original-design prompt
that names no real car, then TRELLIS, then the wheels, glass and triangle
count fixed in Blender, then a credits row. Untried: `1024_cascade`, other
seeds, and a multi-view input.
