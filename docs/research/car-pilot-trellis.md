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
