#!/bin/bash
# Run by hand (not by Claude Code: it builds CUDA code from GitHub), from anywhere:
#   bash tools/trellis/install.sh 2>&1 | tee ~/trellis-install.log
# Needs micromamba at ~/micromamba-bin/bin and TRELLIS.2 cloned (with --recursive) at ~/src/TRELLIS.2.
# Installs TRELLIS.2 into a micromamba env named trellis2, following
# ~/src/TRELLIS.2/setup.sh step for step, except: no `sudo apt install`,
# no pillow-simd (speed-up only), and extensions build in ~/src/extensions
# instead of /tmp. Everything lands under $HOME; nothing in the repo.
set -ex
export MAMBA_ROOT_PREFIX=$HOME/micromamba
MM=$HOME/micromamba-bin/bin/micromamba
export CUDA_HOME=$(dirname "$(dirname "$(readlink -f "$(which nvcc)")")")
export TORCH_CUDA_ARCH_LIST=8.6   # RTX 3090
export MAX_JOBS=4
run() { $MM run -n trellis2 "$@"; }
# /tmp is a different filesystem from ~/.cache, and pip moves the flash-attn
# wheel between them (Errno 18), so build under $HOME instead.
export TMPDIR=$HOME/tmp; mkdir -p "$TMPDIR"

[ -d "$MAMBA_ROOT_PREFIX/envs/trellis2" ] || $MM create -y -n trellis2 -c conda-forge python=3.10 pip
run pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
run pip install imageio imageio-ffmpeg tqdm easydict opencv-python-headless ninja trimesh transformers gradio==6.0.1 tensorboard pandas lpips zstandard
run pip install git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8
run pip install kornia timm

E=$HOME/src/extensions; mkdir -p "$E"
run pip install flash-attn==2.7.3 --no-build-isolation
[ -d "$E/nvdiffrast" ] || git clone -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git "$E/nvdiffrast"
run pip install "$E/nvdiffrast" --no-build-isolation
[ -d "$E/nvdiffrec" ] || git clone -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git "$E/nvdiffrec"
run pip install "$E/nvdiffrec" --no-build-isolation
[ -d "$E/CuMesh" ] || git clone https://github.com/JeffreyXiang/CuMesh.git "$E/CuMesh" --recursive
run pip install "$E/CuMesh" --no-build-isolation
[ -d "$E/FlexGEMM" ] || git clone https://github.com/JeffreyXiang/FlexGEMM.git "$E/FlexGEMM" --recursive
run pip install "$E/FlexGEMM" --no-build-isolation
run pip install "$HOME/src/TRELLIS.2/o-voxel" --no-build-isolation
echo INSTALL-DONE
