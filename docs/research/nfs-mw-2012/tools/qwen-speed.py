#!/usr/bin/env python3
"""Read the speedometer from 1 fps crops by tiling 24 of them into one
numbered image and asking Qwen for all 24 numbers. Tesseract cannot read the
game's italic segmented digits; a vision model can.
Usage: qwen-speed.py <crop dir> <out.tsv> [first last]"""
import sys, json, base64, pathlib, re, urllib.request
import cv2, numpy as np

N = 24
def tile(paths):
    cells = []
    for i, p in enumerate(paths):
        im = cv2.imread(str(p))
        lab = np.zeros((88, 56, 3), np.uint8)
        cv2.putText(lab, str(i + 1), (4, 55), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
        cells.append(np.hstack([lab, im]))
    while len(cells) % 4: cells.append(np.zeros_like(cells[0]))
    rows = [np.hstack(cells[i:i + 4]) for i in range(0, len(cells), 4)]
    return np.vstack(rows)

def ask(img):
    ok, buf = cv2.imencode('.png', img)
    url = 'data:image/png;base64,' + base64.b64encode(buf).decode()
    body = {"model": "qwen", "max_tokens": 300, "temperature": 0,
            "chat_template_kwargs": {"enable_thinking": False},
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": url}},
                {"type": "text", "text": "Each numbered cell (yellow number on the left) shows a car speedometer reading in km/h, in a segmented italic font. Read every cell. Answer one line per cell as 'cell: number'. If a cell has no speed reading (blank, menu, cutscene), answer 'cell: -'."}]}]}
    req = urllib.request.Request("http://localhost:8000/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["choices"][0]["message"]["content"]

def main():
    d, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    paths = sorted(d.glob('*.png'))
    if len(sys.argv) > 4: paths = paths[int(sys.argv[3]):int(sys.argv[4])]
    with out.open('a') as f:
        for i in range(0, len(paths), N):
            batch = paths[i:i + N]
            # Qwen answers 'cell: N' in order rather than numbering the lines
            vals = re.findall(r':\s*(\d+|-)', ask(tile(batch)))
            vals = vals if len(vals) == len(batch) else ['?'] * len(batch)
            for p, v in zip(batch, vals):
                f.write(f"{int(p.stem) - 1}\t{v}\n")
            f.flush()

if __name__ == '__main__':
    main()
