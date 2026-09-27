#!/usr/bin/env python3
"""OCR the minimap's district (above) and street (below) labels, one per second."""
import sys, pathlib, re
from multiprocessing import Pool
import cv2, pytesseract

def read(p):
    g = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
    g = cv2.resize(g, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    _, b = cv2.threshold(g, 170, 255, cv2.THRESH_BINARY_INV)
    t = pytesseract.image_to_string(b, config='--psm 7')
    t = re.sub(r"[^A-Z0-9' ]", '', t.upper())
    t = ' '.join(t.split())
    return int(p.stem) - 1, t if re.search(r'[A-Z]{4}', t) else ''

if __name__ == '__main__':
    d = pathlib.Path(sys.argv[1])
    with Pool(40) as pool:
        for s, t in sorted(pool.map(read, sorted(d.glob('*.png')))):
            print(f"{s}\t{t}")
