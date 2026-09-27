#!/bin/bash
# Wait for the server: exit 0 ready, 1 died or logged an error, 2 timeout.
# Argument: number of 5-second polls (default 60 = 5 minutes).
D=${QWEN_VIDEO_DIR:-$HOME/.local/share/qwen-video}
pid=$(cat $D/vllm.pid)
for i in $(seq 1 ${1:-60}); do
  curl -sf localhost:8000/v1/models >/dev/null && { echo READY; exit 0; }
  kill -0 $pid 2>/dev/null || { echo DIED; grep -E "Error" $D/vllm.log | tail -3; exit 1; }
  grep -qE "RuntimeError|ValueError|FileNotFoundError|CUDA out of memory" $D/vllm.log && { echo ERROR; grep -E "Error" $D/vllm.log | tail -3; kill $pid; exit 1; }
  sleep 5
done
echo TIMEOUT; tail -3 $D/vllm.log; exit 2
