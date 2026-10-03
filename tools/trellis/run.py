"""Image -> .glb with TRELLIS.2 for the #584 car pilot (ADR-0013, route E).

usage (from anywhere):
  ~/micromamba-bin/bin/micromamba run -n trellis2 python run-trellis.py IMAGE OUTDIR [--type 512|1024_cascade] [--seed N]

Needs: the install finished, and access to facebook/dinov3-vitl16-pretrain-lvd1689m.

Deviations from TRELLIS's example.py, on purpose:
- The pipeline's config names briaai/RMBG-2.0 as its background remover (gated,
  non-commercial licence, remote code). Our renders are flat grey, so we cut the
  car out ourselves (flood fill from the border) and stub the remover; the
  pipeline only calls it for images with no alpha.
- No HDRI render (example.py uses an HDRI from the repo's assets we have not
  vetted); we export the .glb and look at it in Blender instead.
"""
import argparse
import os
import sys

os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
sys.path.insert(0, os.path.expanduser('~/src/TRELLIS.2'))

import cv2
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('out')
ap.add_argument('--type', default='512', choices=['512', '1024', '1024_cascade'])
ap.add_argument('--seed', type=int, default=42)
ap.add_argument('--tol', type=int, default=12, help='background colour tolerance for the cut-out')
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)


def cut_out(path: str, tol: int) -> Image.Image:
    """RGBA from a flat-background render: flood fill the background from every corner."""
    rgb = np.array(Image.open(path).convert('RGB'))
    h, w = rgb.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        cv2.floodFill(bgr, mask, seed, (0, 0, 0), (tol,) * 3, (tol,) * 3, cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    background = mask[1:-1, 1:-1] > 0
    alpha = np.where(background, 0, 255).astype(np.uint8)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')


image = cut_out(args.image, args.tol)
image.save(os.path.join(args.out, 'input_rgba.png'))
print('cut-out saved; check input_rgba.png before trusting the result')

# Stub the gated background remover before the pipeline builds it.
import trellis2.pipelines.rembg as rembg  # noqa: E402


class _NoRembg:
    def __init__(self, *a, **k):
        pass

    def to(self, *a, **k):
        return self

    def cpu(self):
        return self

    def __call__(self, image):
        raise RuntimeError('background removal is stubbed: pass an RGBA image')


rembg.BiRefNet = _NoRembg

import torch  # noqa: E402
from trellis2.pipelines import Trellis2ImageTo3DPipeline  # noqa: E402
import o_voxel  # noqa: E402

pipeline = Trellis2ImageTo3DPipeline.from_pretrained('microsoft/TRELLIS.2-4B')
# transformers 5 moved the DINOv3 blocks from .layer to .model.layer; TRELLIS.2
# still reads .layer. Alias it without registering the blocks twice.
_dino = pipeline.image_cond_model.model
if not hasattr(_dino, 'layer'):
    object.__setattr__(_dino, 'layer', _dino.model.layer)
pipeline.cuda()

mesh = pipeline.run(image, seed=args.seed, pipeline_type=args.type)[0]
mesh.simplify(16777216)  # nvdiffrast limit, as in example.py
print('peak GPU memory GB:', torch.cuda.max_memory_allocated() / 1e9)

glb = o_voxel.postprocess.to_glb(
    vertices=mesh.vertices,
    faces=mesh.faces,
    attr_volume=mesh.attrs,
    coords=mesh.coords,
    attr_layout=mesh.layout,
    voxel_size=mesh.voxel_size,
    aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
    decimation_target=200000,  # clean-up in Blender takes it to the 15-30k budget
    texture_size=2048,
    remesh=True,
    remesh_band=1,
    remesh_project=0,
    verbose=True,
)
dest = os.path.join(args.out, f'car_{args.type}_s{args.seed}.glb')
glb.export(dest, extension_webp=True)
print('wrote', dest)
