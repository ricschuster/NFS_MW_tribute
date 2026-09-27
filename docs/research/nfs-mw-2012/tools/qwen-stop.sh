#!/bin/bash
# Stop the server by its recorded PID (never by name).
D=${QWEN_VIDEO_DIR:-$HOME/.local/share/qwen-video}
pid=$(cat $D/vllm.pid 2>/dev/null) || exit 0
kill $pid 2>/dev/null
for i in $(seq 1 30); do kill -0 $pid 2>/dev/null || { echo stopped; exit 0; }; sleep 1; done
echo "still running: $pid"; exit 1
