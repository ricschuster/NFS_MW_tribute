#!/usr/bin/env python3
"""Count other vehicles visible in each 1 fps frame (YOLO, CPU). The player's
car is the big box low in the centre of a chase camera, so drop any box whose
centre is in the bottom-middle and wider than a fifth of the frame."""
import sys, pathlib
from ultralytics import YOLO
m = YOLO('yolo11s.pt')
frames = sorted(pathlib.Path(sys.argv[1]).glob('*.jpg'))
with open(sys.argv[2], 'w') as f:
    for i in range(0, len(frames), 32):
        for p, r in zip(frames[i:i+32], m.predict([str(x) for x in frames[i:i+32]], classes=[2, 5, 7], conf=0.35, device='cpu', verbose=False)):
            W, H = r.orig_shape[1], r.orig_shape[0]
            n = 0
            for x, y, w, h in r.boxes.xywh.tolist():
                player = abs(x - W / 2) < W * 0.15 and y > H * 0.55 and w > W * 0.2
                n += 0 if player else 1
            f.write(f"{int(p.stem) - 1}\t{n}\n")
