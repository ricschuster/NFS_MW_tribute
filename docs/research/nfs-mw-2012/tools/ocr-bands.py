#!/usr/bin/env python3
"""OCR the caption and banner crops (one per second) and collapse repeats.
Captions and banners are white text over a moving scene, so keep only bright
pixels before OCR; tesseract reads the dark-background version far better."""
import sys, pathlib, re
from multiprocessing import Pool
import cv2, pytesseract

def read(p):
    g = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
    g = cv2.resize(g, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    _, b = cv2.threshold(g, 200, 255, cv2.THRESH_BINARY_INV)
    t = pytesseract.image_to_string(b, config='--psm 6')
    t = ' '.join(t.split())
    # keep lines that look like words, not texture noise
    words = re.findall(r'[A-Za-z]{3,}', t)
    return int(p.stem), t if len(words) >= 3 else ''

def main():
    d = pathlib.Path(sys.argv[1])
    with Pool(40) as pool:
        rows = sorted(pool.map(read, sorted(d.glob('*.png'))))
    last = ''
    for n, t in rows:
        s = n - 1
        key = re.sub(r'[^a-z]', '', t.lower())[:40]
        if t and key != last:
            print(f"{s//60:02d}:{s%60:02d} {t}")
        last = key if t else ''

if __name__ == "__main__":
    main()
