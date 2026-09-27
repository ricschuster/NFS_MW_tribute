#!/usr/bin/env python3
"""Join the per-second tracks into one timeline and print the summary tables.

Inputs (all produced by the other tools in this folder, one row per second of
video, second 0 = the first frame):
  speed.tsv       second, km/h or '-'/'?'   (qwen-speed.py)
  dist.tsv        second, district label    (ocr-labels.py on the district crop)
  street.tsv      second, street label      (ocr-labels.py on the street crop)
  traffic.tsv     second, vehicles visible  (traffic-count.py)
  frames1/        one 960x540 jpg per second, for the minimap colour

Usage: analyse.py <work dir> <out timeline.tsv>

The pursuit state from the minimap colour is only half-reliable: cyan
(cooldown) is unmistakable, but the red "seen" tint washes out in daylight and
under-counts, so the pursuit windows in the review come from reading the
footage, and this column is the supporting evidence rather than the source.
"""
import collections, difflib, pathlib, re, statistics as st, sys
import cv2

DISTRICTS = ['INTERSTATE 92', 'MCCLANE', 'FAIRHAVEN', 'CALLAHAN INDUSTRIAL', 'DOWNTOWN',
             'HUGHES PARK', 'THE BELTWAY', "RIPLEY'S POINT"]


def district(t):
    # Tesseract adds a stray letter or two after the label; match on the rest.
    t = re.sub(r"[^A-Z0-9' ]", '', t).strip()
    m = difflib.get_close_matches(t, DISTRICTS, 1, 0.75) or \
        difflib.get_close_matches(t[:-2].strip(), DISTRICTS, 1, 0.75)
    return m[0] if m else ''


def street(t):
    t = re.sub(r"\s+[A-Z0-9]?$", '', t.strip())
    t = re.sub(r'^192\b', 'I92', t)  # the I in I92 reads as a 1
    return t if len(t) >= 5 else ''


def minimap_state(path):
    im = cv2.imread(str(path))
    roi = im[395:515, 4:190].astype(int)  # minimap panel plus heat bars
    b, g, r = roi[..., 0], roi[..., 1], roi[..., 2]
    red = ((r > 110) & (r > 1.8 * g) & (r > 1.5 * b)).mean()
    cyan = ((b > 110) & (g > 90) & (r < 0.6 * g)).mean()
    return 'cooldown' if cyan > 0.05 else 'seen' if red > 0.005 else 'free'


def tsv(p):
    return {int(a): b for a, _, b in (l.rstrip('\n').partition('\t') for l in open(p))}


def q(v, p):
    return sorted(v)[int(p * (len(v) - 1))]


def main():
    w, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    dist = {s: district(t) for s, t in tsv(w / 'ocr/dist.tsv').items()}
    strt = {s: street(t) for s, t in tsv(w / 'ocr/street.tsv').items()}
    traf = {s: int(v) for s, v in tsv(w / 'traffic.tsv').items()}
    raw = {s: int(v) for s, v in tsv(w / 'ocr/speed.tsv').items() if v.isdigit() and int(v) <= 400}
    # A reading that jumps more than 60 km/h from both neighbours is a misread.
    spd = {s: v for s, v in raw.items()
           if not (n := [raw[x] for x in (s - 1, s + 1) if x in raw]) or not all(abs(v - x) > 60 for x in n)}
    frames = sorted((w / 'frames1').glob('*.jpg'))
    state = {int(p.stem) - 1: minimap_state(p) for p in frames}
    # One-second flickers between two equal neighbours are noise.
    state = {s: state[s - 1] if s - 1 in state and s + 1 in state and state[s - 1] == state[s + 1] != v else v
             for s, v in state.items()}

    n = len(frames)
    with out.open('w') as f:
        f.write('second\tkmh\tdistrict\tstreet\tminimap\tvehicles\n')
        for s in range(n):
            play = bool(dist.get(s))
            f.write(f"{s}\t{spd.get(s, '')}\t{dist.get(s, '')}\t{strt.get(s, '')}\t"
                    f"{state[s] if play else ''}\t{traf.get(s, '')}\n")

    play = [s for s in range(n) if dist.get(s)]
    g = [spd[s] for s in play if s in spd]
    print(f'driving seconds {len(play)}; with a speed reading {len(g)}')
    print(f'speed mean {st.mean(g):.0f} median {q(g, .5)} p90 {q(g, .9)} max {max(g)}')
    for lo, hi in ((0, 50), (50, 100), (100, 150), (150, 200), (200, 250), (250, 400)):
        print(f'  {lo:3d}-{hi:3d} km/h {100 * sum(lo <= v < hi for v in g) / len(g):5.1f}%')
    print('\ndistrict            share  mean  median  p90  vehicles/frame  empty-frame%')
    by = collections.defaultdict(list)
    for s in play:
        by[dist[s]].append(s)
    for d, ss in sorted(by.items(), key=lambda kv: -len(kv[1])):
        v = [spd[s] for s in ss if s in spd]
        t = [traf.get(s, 0) for s in ss]
        print(f'{d:20s}{100 * len(ss) / len(play):5.1f}% {st.mean(v):5.0f} {q(v, .5):6d} {q(v, .9):5d}'
              f' {st.mean(t):10.2f} {100 * sum(x == 0 for x in t) / len(t):10.0f}%')


if __name__ == '__main__':
    main()
