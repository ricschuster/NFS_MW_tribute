#!/bin/bash
# Start Qwen3.6-27B (4-bit) on vLLM, detached. The PID goes to vllm.pid so
# nothing has to find the server by name: `pgrep -f "vllm serve"` matches the
# shell that runs it, which hung two waits and killed one cleanup.
# Media files must live under $D/work (vLLM only reads local files there).
D=${QWEN_VIDEO_DIR:-$HOME/.local/share/qwen-video}
export PATH=$HOME/.venvs/vllm/bin:$PATH   # vLLM's JIT needs the venv's ninja
export VLLM_USE_FLASHINFER_SAMPLER=0      # FlashInfer JIT needs nvcc >= 12.8; system has 12.4
nohup vllm serve Lorbus/Qwen3.6-27B-int4-AutoRound --served-model-name qwen --port 8000 \
  --max-model-len 24576 --gpu-memory-utilization 0.94 --max-num-seqs 2 \
  --limit-mm-per-prompt '{"video":1,"image":4}' --allowed-local-media-path $D/work \
  > $D/vllm.log 2>&1 &
echo $! > $D/vllm.pid
