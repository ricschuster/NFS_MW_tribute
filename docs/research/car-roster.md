# The roster: forty-four cars, and the real ones they stand for (#434)

Decided with the owner on 2026-09-29: about forty cars, as the reference game
has, and **one original stand-in per car in the reference roster** - the same
class and similar numbers, under our own name and body. This is the research
behind that: the reference game's roster, each real car's published figures,
and the one rule that turns those figures into a `CarProfile`.

Names of real cars appear here because this is documentation. Nothing in
`cars.ts` names the car it stands in for, and nothing third-party ships
(CLAUDE.md).

## The reference roster

*Need for Speed: Most Wanted* (2012) has 44 cars in the base game, by the
class it files them under: 6 Everyday, 9 Exotic, 4 Grand Tourer, 7 Muscle,
3 Race, 11 Sports and 4 SUV. Thirty-three are parked around its city (its
"jack spots"), one more is an extra, and ten are the Most Wanted list, won by
beating and then wrecking the rival driving each:

| Rank | Car |
|---|---|
| 10 | Alfa Romeo 4C Concept |
| 9 | Shelby Cobra 427 |
| 8 | Mercedes-Benz SL 65 AMG Black Series |
| 7 | Lexus LFA |
| 6 | McLaren MP4-12C |
| 5 | Porsche 918 Spyder Concept |
| 4 | Lamborghini Aventador LP 700-4 |
| 3 | Bugatti Veyron 16.4 Super Sport |
| 2 | Pagani Huayra |
| 1 | Koenigsegg Agera R |

The five Ultimate Speed Pack cars (DLC) are left out. The reference's starter
is the Porsche 911 Carrera S, which is what our Kestrel stands for, and so the
reference every multiplier is written against.

## From figures to a profile

Every figure in `cars.ts` is a multiplier on the reference car (#67), which
keeps the police, the speedometer and the feel work honest across a change of
car. The rule, against the 911 Carrera S (304 km/h, 4.5 s, 400 PS, 1,395 kg):

- **topSpeed** = 1 + 0.5 x (top speed / 304 - 1), held to 0.82-1.24. Halved,
  because the real spread (164 to 439 km/h) would put a Veyron at 1.4 and a
  Hummer at 0.5; halved it lands where the game was already tuned (0.92-1.22
  before this). The police run at fractions of your top speed, so a slow car
  meets slow police, and `npm run pace` holds for every car.
- **accel** = (4.5 / 0-100 time)^0.5, held to 0.72-1.4.
- **grip** by class - Race 1.30, Exotic 1.15, Sports 1.06, Everyday 1.02,
  Grand Tourer 0.98, Muscle 0.94, SUV 0.84 - plus 0.04 for all- or four-wheel
  drive, plus 0.05 under 1,100 kg, less 0.04 over 2,200 kg.
- **nitro** = 1 + 0.35 x (power-to-weight / the 911's - 1), held to 0.88-1.25.
- **scale** (drawing only) by class, and 1.22 for the full-size pickup.

A published figure is what the maker or a period test gave; where a car is
electronically limited that is the figure used, which is why a few everyday
cars sit at 250 km/h. Where a source gave only 0-60 mph the 0-100 km/h time is
that plus a little and is noted.

## The cars

Parked cars are listed in the order `cars.ts` places them, roughly worst to
best; the ladder is in rank order, 10 to 1. Existing ids were kept, so a save
still means the car it meant: each existing car took the stand-in its
description already fitted (the Kite, "barely there... untouchable in the
corners", is the featherweight; the Ridgeback, "all engine", the muscle car).

| Ours | How you get it | Class | Stands in for | Top km/h | 0-100 s | PS | kg | Drive | top | accel | grip | nitro | scale | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Kestrel (`kestrel`) | start | Sports | Porsche 911 Carrera S (991, 2012) | 304 | 4.5 | 400 | 1395 | RWD | 1 | 1 | 1 | 1 | 1 |  |
| Kite (`kite`) | parked | Race | Caterham Superlight R500 (2008) | 241 | 2.9 | 263 | 506 | RWD | 0.9 | 1.25 | 1.35 | 1.25 | 0.88 | 0-60 2.88 s |
| Verso (`verso`) | parked | Muscle | BMW M3 Coupe (E92, 2008) | 250 | 4.6 | 420 | 1580 | RWD | 0.91 | 0.99 | 0.94 | 0.97 | 1.05 | limited |
| Ridgeback (`ridgeback`) | parked | Muscle | Dodge Challenger SRT8 392 (2011) | 290 | 4.7 | 477 | 1887 | RWD | 0.98 | 0.98 | 0.94 | 0.96 | 1.05 | maker's "more than 180 mph"; 0-60 4.5 s (Edmunds) |
| Sable (`sable`) | parked | Grand Tourer | Bentley Continental Supersports Convertible ISR (2011) | 325 | 4.0 | 640 | 2395 | AWD | 1.03 | 1.06 | 0.98 | 0.98 | 1.06 |  |
| Ardent (`ardent`) | parked | Sports | Aston Martin V12 Vantage (2009) | 305 | 4.2 | 517 | 1680 | RWD | 1.0 | 1.04 | 1.06 | 1.03 | 1.0 |  |
| Halcyon (`halcyon`) | parked | Sports | Lamborghini Countach 5000 QV (1985) | 298 | 5.0 | 455 | 1490 | RWD | 0.99 | 0.95 | 1.06 | 1.02 | 1.0 |  |
| Nightjar (`nightjar`) | parked | Sports | Marussia B2 (2010) | 310 | 3.8 | 420 | 1100 | RWD | 1.01 | 1.09 | 1.06 | 1.12 | 1.0 |  |
| Wisp (`wisp`) | parked | Race | Ariel Atom 500 V8 (2011) | 273 | 2.3 | 507 | 550 | RWD | 0.95 | 1.4 | 1.35 | 1.25 | 0.88 | 0-60 about 2.3 s |
| Pipit (`pipit`) | parked | Everyday | Audi A1 Clubsport quattro concept (2011) | 250 | 3.7 | 503 | 1390 | AWD | 0.91 | 1.1 | 1.06 | 1.09 | 0.95 | limited |
| Solstice (`solstice`) | parked | Sports | Audi R8 GT Spyder (2011) | 317 | 3.8 | 560 | 1640 | AWD | 1.02 | 1.09 | 1.1 | 1.07 | 1.0 |  |
| Singleton (`singleton`) | parked | Race | BAC Mono (2011) | 274 | 2.9 | 284 | 540 | RWD | 0.95 | 1.25 | 1.35 | 1.25 | 0.88 |  |
| Brawler (`brawler`) | parked | Muscle | Chevrolet Camaro ZL1 (2012) | 296 | 4.1 | 588 | 1869 | RWD | 0.99 | 1.05 | 0.94 | 1.03 | 1.05 | 0-60 3.9 s |
| Harrier (`harrier`) | parked | Exotic | Chevrolet Corvette ZR1 (C6, 2009) | 330 | 3.6 | 647 | 1520 | RWD | 1.04 | 1.12 | 1.15 | 1.17 | 1.02 | 0-60 3.4 s |
| Bighorn (`bighorn`) | parked | SUV | Ford F-150 SVT Raptor (2012) | 204 | 6.6 | 417 | 2730 | 4WD | 0.84 | 0.83 | 0.84 | 0.88 | 1.22 | 0-60 6.3 s |
| Shade (`shade`) | parked | Everyday | Ford Focus RS500 (2010) | 265 | 5.6 | 350 | 1468 | FWD | 0.94 | 0.9 | 1.02 | 0.94 | 0.95 |  |
| Sparrow (`sparrow`) | parked | Everyday | Ford Focus ST (2012) | 248 | 6.1 | 256 | 1362 | FWD | 0.91 | 0.86 | 1.02 | 0.88 | 0.95 |  |
| Enduro (`enduro`) | parked | Exotic | Ford GT (2005) | 330 | 3.5 | 558 | 1520 | RWD | 1.04 | 1.13 | 1.15 | 1.1 | 1.02 | 0-60 3.3 s |
| Outrider (`outrider`) | parked | Muscle | Ford Mustang Boss 302 (2012) | 250 | 4.5 | 450 | 1663 | RWD | 0.91 | 1.0 | 0.94 | 0.98 | 1.05 | 0-60 4.3 s |
| Bulwark (`bulwark`) | parked | SUV | Hummer H1 Alpha (2006) | 164 | 14.0 | 305 | 3680 | 4WD | 0.82 | 0.72 | 0.84 | 0.88 | 1.14 | 0-60 13.5 s; 8,113 lb |
| Velvet (`velvet`) | parked | Sports | Jaguar XKR (2010) | 250 | 4.8 | 510 | 1595 | RWD | 0.91 | 0.97 | 1.06 | 1.04 | 1.0 | limited; 0-60 4.6 s |
| Tempest (`tempest`) | parked | Sports | Lamborghini Gallardo LP570-4 Spyder Performante (2011) | 324 | 3.9 | 570 | 1485 | AWD | 1.03 | 1.07 | 1.1 | 1.12 | 1.0 | dry weight |
| Sideways (`sideways`) | parked | Everyday | Lancia Delta HF Integrale Evoluzione II (1993) | 220 | 5.7 | 215 | 1357 | AWD | 0.86 | 0.89 | 1.06 | 0.88 | 0.95 | |
| Aria (`aria`) | parked | Grand Tourer | Maserati GranTurismo MC Stradale (2011) | 297 | 4.6 | 450 | 1670 | RWD | 0.99 | 0.99 | 0.98 | 0.98 | 1.06 | 0-100 approximate |
| Upswing (`upswing`) | parked | Grand Tourer | Mercedes-Benz SLS AMG (2010) | 317 | 3.8 | 571 | 1620 | RWD | 1.02 | 1.09 | 0.98 | 1.08 | 1.06 |  |
| Switchback (`switchback`) | parked | Everyday | Mitsubishi Lancer Evolution X (2008) | 242 | 5.0 | 295 | 1545 | AWD | 0.9 | 0.95 | 1.06 | 0.88 | 0.95 | 0-100 approximate |
| Monolith (`monolith`) | parked | Sports | Nissan GT-R Egoist (2011) | 315 | 3.0 | 530 | 1730 | AWD | 1.02 | 1.22 | 1.1 | 1.02 | 1.0 |  |
| Backfire (`backfire`) | parked | Sports | Porsche 911 Turbo 3.0 (930, 1975) | 250 | 5.5 | 260 | 1195 | RWD | 0.91 | 0.9 | 1.06 | 0.92 | 1.0 |  |
| Longhaul (`longhaul`) | parked | Grand Tourer | Porsche Panamera Turbo S (2011) | 306 | 3.8 | 550 | 1995 | AWD | 1.0 | 1.09 | 1.02 | 0.99 | 1.06 |  |
| Crossing (`crossing`) | parked | SUV | Range Rover Evoque Si4 coupe (2012) | 217 | 7.6 | 240 | 1715 | AWD | 0.86 | 0.77 | 0.88 | 0.88 | 1.14 |  |
| Fang (`fang`) | parked | Muscle | SRT Viper GTS (2013) | 331 | 3.6 | 649 | 1556 | RWD | 1.04 | 1.12 | 0.94 | 1.16 | 1.05 | 0-60 3.5 s |
| Blue Hour (`bluehour`) | parked | Everyday | Subaru Cosworth Impreza STI CS400 (2010) | 250 | 3.9 | 400 | 1505 | AWD | 0.91 | 1.07 | 1.06 | 0.97 | 0.95 | 0-60 3.7 s; weight approximate |
| Current (`current`) | parked | Sports | Tesla Roadster Sport 2.5 (2011) | 201 | 3.9 | 303 | 1235 | RWD | 0.83 | 1.07 | 1.06 | 0.95 | 1.0 | 0-60 3.7 s |
| Trailbreaker (`trailbreaker`) | parked | SUV | Jeep Grand Cherokee SRT8 (2012) | 257 | 5.0 | 470 | 2336 | AWD | 0.92 | 0.95 | 0.84 | 0.9 | 1.14 |  |
| Hatchling (`hatchling`) | rival #10 | Sports | Alfa Romeo 4C (2013) | 258 | 4.5 | 240 | 940 | RWD | 0.92 | 1.0 | 1.11 | 0.96 | 1.0 |  |
| Emberline (`emberline`) | rival #9 | Muscle | Shelby Cobra 427 (1965) | 298 | 4.3 | 485 | 1068 | RWD | 0.99 | 1.02 | 0.99 | 1.2 | 1.05 | 0-100 approximate |
| Corona (`corona`) | rival #8 | Muscle | Mercedes-Benz SL 65 AMG Black Series (2008) | 320 | 3.8 | 670 | 1870 | RWD | 1.03 | 1.09 | 0.94 | 1.09 | 1.05 | limited |
| Wideboy (`wideboy`) | rival #7 | Exotic | Lexus LFA (2010) | 326 | 3.7 | 560 | 1580 | RWD | 1.04 | 1.1 | 1.15 | 1.08 | 1.02 |  |
| Castling (`castling`) | rival #6 | Exotic | McLaren MP4-12C (2011) | 333 | 3.1 | 600 | 1434 | RWD | 1.05 | 1.2 | 1.15 | 1.16 | 1.02 |  |
| Surge (`surge`) | rival #5 | Exotic | Porsche 918 Spyder (2013) | 345 | 2.6 | 887 | 1674 | AWD | 1.07 | 1.32 | 1.19 | 1.25 | 1.02 |  |
| Arcline (`arcline`) | rival #4 | Exotic | Lamborghini Aventador LP 700-4 (2011) | 350 | 2.9 | 700 | 1575 | AWD | 1.08 | 1.25 | 1.19 | 1.19 | 1.02 | dry weight |
| Obsidian (`obsidian`) | rival #3 | Exotic | Bugatti Veyron 16.4 Super Sport (2010) | 431 | 2.5 | 1200 | 1990 | AWD | 1.21 | 1.34 | 1.19 | 1.25 | 1.02 |  |
| Apparition (`apparition`) | rival #2 | Exotic | Pagani Huayra (2012) | 383 | 2.8 | 730 | 1350 | RWD | 1.13 | 1.27 | 1.15 | 1.25 | 1.02 |  |
| Nightfall (`nightfall`) | rival #1 | Exotic | Koenigsegg Agera R (2011) | 439 | 2.8 | 960 | 1330 | RWD | 1.22 | 1.27 | 1.15 | 1.25 | 1.02 | claimed |

**Verified 2026-09-29:** the four figures first marked "to verify" - the
XKR's, the Challenger's top speed and 0-100, and the H1's and the Integrale's
weights - were checked against sources and corrected (XKR 1,595 kg, not 1,753;
Challenger 0-100 about 4.7 s; H1 3,680 kg; Integrale 1,357 kg). Through the
rule that moved the Velvet's nitro to 1.04 and the Ridgeback's acceleration to
0.98; the H1 and the Integrale were already at the nitro floor.

## What changed for the ladder

The reference's list is not strictly faster at every rung: its #10 is a light
sports car slower than plenty that are parked, and its #3 out-runs its #2 flat
out. So the ladder's tests (#66) now hold what the reference holds - the #1 car
is the fastest in the game, the top half of the ladder is faster than the
bottom half, and the ladder as a whole is faster than the street - rather than
"every rung beats the last". The rivals' race pace is set by their difficulty,
not their car (#71), so none of this moves a race.

## Sources

- The roster by class: [Video Games Blogger, NFS Most Wanted 2012 car list](https://www.videogamesblogger.com/2012/11/02/need-for-speed-most-wanted-2012-car-list.htm);
  the parked cars: [gamepressure, Jack Spot cars](https://www.gamepressure.com/needforspeedmostwanted2012/jack-spot-cars/z44475);
  the list's order from search results citing the [Need for Speed Wiki](https://nfs.fandom.com/wiki/Most_Wanted_List).
- Figures: Wikipedia's pages for the 911 (991), Alfa Romeo 4C, AC Cobra, SL (R230), LFA, MP4-12C, 918 Spyder, Aventador, Veyron, Huayra, Agera, Focus (third generation), Delta Integrale, Lancer Evolution, M3 (E92);
  and, through search, [automobile-catalog](https://www.automobile-catalog.com), [FastestLaps](https://fastestlaps.com), [ultimatespecs](https://www.ultimatespecs.com), [carfolio](https://www.carfolio.com), [autosnout](https://www.autosnout.com), [evo](https://www.evo.co.uk), [Motor Authority](https://www.motorauthority.com), Edmunds and makers' press releases.

Generated from the figures above by a throwaway script; the numbers in
`cars.ts` are its output, and a change to the rule is a change to all of them.
