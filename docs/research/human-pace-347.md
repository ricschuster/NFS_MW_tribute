# A human's pace, and Crosstown's on-screen traffic (#347)

Measured 2026-09-28 from the owner driving the game, to set beside what the
[reference game review](nfs-most-wanted-2012-gameplay.md) measured of the
reference game. Two numbers were asked for: how fast a person races, as a
fraction of top speed, and how much traffic is on screen.

## Method

The reference game could only be measured from its video. Crosstown can be
asked directly: the telemetry recorder (#400, F9 in dev or with `?debug`)
samples the sim once a second - speed, event, pursuit, road, damage, and every
vehicle in view with how big it is on screen. `npm run telemetry` reports it.
The drive was also recorded on video, as a cross-check.

**Speed** from the recorder agrees with the speedometer in the video to within
2 km/h (293 vs 294, 88 vs 86, read off frames at the same moment).

**Traffic could not be measured from the video.** The detector that counted
the reference's traffic (YOLO, COCO classes) does not recognise a low-poly car.
Scored against the recorder on the first recording, second by second:

| Detector | Cars found | False detections |
|---|---|---|
| YOLO as used on the reference | 5% | 8 |
| YOLO, any class, confidence 0.10 | 38% | 467 |
| YOLO-World, "car / toy car / low-poly car", 0.05 | 44% | 196 |

So the recorder is the instrument, and it has to count what the detector would
have counted. The detector, rerun over the reference's 2,813 frames (0.57
vehicles a frame, reproducing the published 0.60), found nothing under 1.5% of
the frame's height and 95% of what it counted was at least 2.5%. The recorder
counts a vehicle once its drawn box is 2.5% of screen height (#401): for a car,
about 115 m away. Nothing tests occlusion.

## The drive

14.7 minutes (`crosstown-telemetry-2026-09-28T22-16-32-435Z.json` and the
matching video, both kept outside the repo): two Marrow Field Runs, one
Halloway Rim, two claim chases and 5.7 minutes of free roam, a third of it in a
pursuit.

Two things make it a lower bound on the owner's pace rather than a measure of it:

- **The car was the Ridgeback**, whose top speed is 1.11 of the reference car's.
- **It was wrecked.** Half damage 17 s in, before the first race, and 100% from
  2.5 minutes on, so every race was at full damage: top speed down 28% and grip
  down 32% (`DAMAGE_SPEED_LOSS`, `DAMAGE_GRIP_LOSS`). A wrecked Ridgeback tops
  out at 0.80 of the reference car.

It was also driven on the build before #402, with the bridges under the water.

## 1. Pace

As a fraction of the reference car's top speed (320 km/h), which is how
`citylap` reports its driver:

| Race | Owner | `citylap`, perfect driver, undamaged reference car, in traffic |
|---|---|---|
| Marrow Field Run | 0.50 | 0.41 |
| Marrow Field Run | 0.44 | 0.41 |
| Halloway Rim | 0.66 | 0.67 |

The first recording (5.5 min, also the Ridgeback, also damaged) had the Marrow
Field Run at 0.57 and 0.47.

**A person is faster than `citylap`'s perfect driver,** in a car that could
only reach 0.80 of top speed. On the Halloway Rim the owner held 0.66 of the
reference car's top in a car whose own top was 0.80: 83% of what the car had.
ADR-0011 wants about 0.6 in a race; the reference game's races averaged about
0.75. The owner is at or near the first even wrecked, and the Marrow Field Run
is the slower route (18% of its race seconds were off the road, against 7% on
the rim).

What that means for the game:

- **The event targets are far too easy.** The speed-run target is
  `SPEEDRUN_TARGET` (0.20) plus 0.08 a difficulty step: the owner was shown a
  target of 68 km/h and averaged 192. It was set when traffic held the driver
  to a quarter of top speed on the old map.
- **The rivals are too slow.** They run at 0.27-0.34 of top. On the Halloway
  Rim an expert driver already beats every one of them by over 3 km (#398); a
  person beats them further.
- **`citylap` is a floor, not a stand-in.** Its perfect driver is slower than a
  person, mostly for having no recovery from a wide line (#210). It is still
  the right regression guard; it is the wrong number to balance a race against.

## 2. On-screen traffic

| | Vehicles in view per second | Seconds with none | Mean when any | 3 or more |
|---|---|---|---|---|
| **Crosstown, all** | **1.29** | **56%** | **2.9** | **22%** |
| Crosstown, free roam | 1.61 | 42% | 2.8 | 25% |
| Crosstown, free roam, no pursuit | 1.86 | 34% | 2.8 | - |
| Crosstown, races | 0.73 | 72% | 2.6 | 13% |
| Reference game, all driving | 0.60 | 60% | 1.5 | 0-10% |

**The difference is density, not frequency.** Seconds with nothing on screen
are about as common as in the reference (56% against 60%). When there is
traffic there is about twice as much of it: 2.9 vehicles at once against 1.5,
and three or more in 22% of seconds against at most 10%. Traffic in Crosstown
comes in bunches.

Races are lighter because the routes run through Marrow Field and the quarry,
where civilians are kept off the dirt and gravel (#377, #327).

The threshold moves the mean more than the empty share, which is why the
comparison is made on the empty share and the bunching as well as the mean:

| Counted from | Mean | Seconds with none |
|---|---|---|
| 2.0% of screen height | 1.63 | 52% |
| **2.5% (used)** | **1.29** | **56%** |
| 3.0% | 1.08 | 59% |
| 4.0% | 0.80 | 64% |

**For #348** the target is fewer cars at a time, not fewer moments with cars:
about 1.5 vehicles when any are in view, three or more in under a tenth of
seconds, with the empty share left about where it is.

## What the video added

The numbers are the recorder's; the video is for what they cannot show, and
it was looked at one frame in five seconds. **It froze at 8:05**: every frame
after that is identical, including the recording badge's own timer, while the
recorder has the car racing the Halloway Rim. Window capture under Wayland
stopped receiving frames. Capture the monitor, not the window, next time.

In the first eight minutes:

- **Traffic drives into a stopped car.** At the start (0:00-0:10) a queue of
  civilians stacked on the road ahead runs into the waiting car, which is the
  half damage before the first race. The same at 3:20: the countdown runs with
  civilian cars crowding the grid.
- **A race starts during a dunk.** 0:15-0:20: the countdown runs over IN THE
  DRINK.
- **STUCK** at 5:05 against the barriers at the water's edge and at 6:00 after
  a crash; the reset was offered both times, as designed.
- Three dunks, the sunken bridges (fixed in #402), two claim chases lost
  (THEY GOT AWAY), a milestone (SPLITTER UNLOCKED), and dusk.

## Found on the way

- **Every bridge was under the water** (#402, fixed): the jam the owner drove
  into on the first recording was on a sunken deck.
- **Traffic drives into a stopped car** at the start (#399) and on the grid;
  the video above.
- **A race can be started while the car is under the water.** The car went in
  beside the main gate bridge at 14 s, the race started at 17, and it sat on
  the grid 2 m under with no road until the countdown ended.
- **Dry ground below sea level** is drawn under the water and drivable (#403).
