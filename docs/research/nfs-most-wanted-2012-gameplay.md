# Need for Speed: Most Wanted (2012): a gameplay review

A 47-minute recording of the game's opening hours, watched and measured. The
city this game is set in, Fairhaven, is the "reference city" ADR-0007 and
ADR-0008 were written against; this is the first time the game itself, rather
than a map or a wiki page, has been studied. CLAUDE.md's rule applies in both
directions: the influence is named openly here, and nothing from it goes into
what ships.

- **Source:** `reference/Need for Speed Most Wanted (2012) Gameplay (PC UHD) [4K60FPS].avi`
  (a published KVG playthrough, PC; 46:53; actually 1280x720 at 60 fps despite
  the title). Git-ignored: the footage is third-party and stays out of the repo,
  and so do frames from it.
- **Reviewed:** 2026-09-27.
- **Data:** [`nfs-mw-2012/data/timeline.tsv`](nfs-mw-2012/data/timeline.tsv),
  one row per second: speed, district, street, minimap state, vehicles visible.
- **How it was measured, and how to do it again:** [`nfs-mw-2012/tools/`](nfs-mw-2012/tools/README.md).

All times below are `mm:ss` into the video.

## The short version

1. **It is driven at 70-80% of top speed, downtown included.** Races average
   180-200 km/h on cars that top out around 260-270. Downtown is the second
   *fastest* district (mean 154 km/h, p90 244). Crosstown's expert averages
   22-48% of top speed on an empty road.
2. **Traffic is sparse.** In 60% of driving seconds there is no other vehicle
   on screen at all.
3. **Every pursuit was started by an event,** and they outlive the event. Three
   pursuits, about 28% of driving time, none begun in free roam in 47 minutes.
4. **The police are felt, not seen.** Chase cars are almost never on screen;
   the pressure arrives as roadblocks placed ahead (four in one race), dispatch
   radio and the HUD.
5. **Escape timing is Crosstown's, near enough.** 6-8 s out of sight to enter
   cooldown, 25-33 s of cooldown to escape; Crosstown's constants give 4 s and
   25-32 s.
6. **A respray changes the car's colour and dispatch says so** two seconds
   later. Crosstown's repair-ends-the-search (#95) has the same reasoning with
   none of the signalling.
7. **Dispatch announces escalation before it happens:** "SUV units requested",
   "roadblocks in place", then the roadblock.
8. **A wreck costs time, not the pursuit or the race.**

## How it was measured

| Track | Method | How far to trust it |
|---|---|---|
| What happens | Contact sheets with the time burned in: every 15 s for the whole video, every 1-3 s for each pursuit, the Most Wanted race, the shutdown and the circuit race | The primary source. Everything below about what happened was checked on frames |
| Speed | The speedometer read once a second (2,813 s) by a vision model (Qwen3.6-27B) from tiled crops, then despiked | High. It matches the game's own averages: Most Wanted race 195 by timer vs 196 traced, Keys to the City 207 vs 200, Fast Track 183 (results screen) vs 180 |
| Where | The minimap's district and street labels, OCR at 1 fps | High for districts; good for streets |
| Pursuit state | The minimap's colour at 1 fps | Cooldown reliable; "seen" under-counts in daylight, so pursuit windows below come from the frames |
| Traffic | A vehicle detector (YOLO) at 1 fps, player's car excluded | Rough: distant cars missed, parked cars counted |
| Radio | Speech-to-text after separating the voice from the music, plus OCR of the on-screen captions | Good for the three pursuits. The raw soundtrack was unusable |
| Index | A vision model's summary of each 30 s chunk | An index only. It invented police three times (09:00, 10:30, 44:00); all three were checked and false |

The tools README has the detail, including what did not work.

## The session

| Time | What |
|---|---|
| 00:00-02:10 | Intro. Logos, title, a red-tinted cinematic of a pursuit. Narration sets up the premise: ten drivers "rule these streets", beat them all to be number one; cars are found parked around the city ("jackspots") and taken by driving up to them |
| 02:10-03:15 | First drive, scripted to the first car along Connors Bridge Road: a wide four-lane road, a freeway, a tunnel. "TAP BRAKE TO DRIFT" tutorial |
| 03:15-03:45 | First jackspot, a car parked in a plaza downtown. "Every car you find has its own set of races", reached from the in-drive menu (EasyDrive) |
| 04:00-05:30 | First race, sprint "Keys to the City" (easy): 1st in 1:12.36. Unlocks two parts (off-road tyres, burn nitrous) |
| 05:45-07:00 | Tutorials: parts, the menu, Speed Points (SP) from "smashing billboards, blasting past speed cameras, destroying security gates or escaping the cops"; enough SP unlocks a Most Wanted race |
| 07:00-10:45 | Free roam and two more jackspots. Hughes Park, I-92, the first speed camera |
| 10:45-13:45 | Speed run "Fast Track": hold an average above 160 km/h through the checkpoints. Finished at 183 km/h |
| 14:00-16:45 | Parts screen (stat bars: acceleration, top speed, control, weight, off-road, toughness); a public car park; downtown; ONCOMING and NEAR MISS counters running |
| 16:45-20:20 | **Ambush "Bloody Nose"** (below) |
| 20:20-22:30 | Free roam on I-92, road works, a security gate smashed |
| 22:30-26:30 | **Most Wanted #10 race and the shutdown** (below) |
| 26:30-30:30 | Cooldown and escape; docks at Callahan Industrial; two more jackspots; a drive to Ripley's Point |
| 30:30-33:00 | **Circuit race "Off the Grid"**, with a respray mid-race (below) |
| 33:00-35:40 | **The circuit race's pursuit, continued in free roam** (below) |
| 35:40-46:53 | The quick menu (change car, jump to car, set destination); a workshop; a long free roam: McClane, downtown bridges, the Vincennes Road mountain pass, I-92 North, off at Junction 10 into Hughes Park; ends parked in the park's plaza |

2,221 s (37 min) of that is driving, identified by the minimap being on screen.

## Findings, with what they mean for Crosstown

### 1. The reference city is driven at 70-80% of top speed

| Situation | Mean km/h | Median | p90 |
|---|---|---|---|
| Sprint "Keys to the City" | 200 | 219 | 239 |
| Most Wanted race (8.9 km, four roadblocks, one crash) | 196 | 200 | 232 |
| Circuit "Off the Grid" | 184 | 192 | 209 |
| Pursuit (33:15-35:35) | 181 | 192 | 246 |
| Speed run "Fast Track" | 180 | 172 | 217 |
| Ambush | 137 | 140 | 184 |
| Free roam (36:30-44:00) | 121 | 130 | 187 |
| All driving | 128 | 136 | 204 |

Distribution over all driving: 0-50 km/h 13.7%, 50-100 19.1%, 100-150 27.6%,
150-200 27.5%, 200-250 11.4%, over 250 0.7%. The highest reliable reading is
about 270 km/h.

| District | Share of driving | Mean | Median | p90 |
|---|---|---|---|---|
| Interstate 92 | 23.6% | 141 | 147 | 198 |
| "Fairhaven" (outside a named district) | 21.7% | 149 | 149 | 214 |
| McClane | 18.4% | 104 | 92 | 216 |
| Callahan Industrial | 9.9% | 106 | 115 | 165 |
| Ripley's Point | 8.4% | 164 | 181 | 209 |
| Downtown | 8.0% | 154 | 179 | 244 |
| Hughes Park | 6.8% | 70 | 67 | 137 |
| The Beltway | 3.2% | 70 | 62 | 150 |

The interstate's mean is lower than downtown's only because its hours include
cruising and stopping for jackspots; in races and pursuits it runs at 200-260.
Downtown is fast because of what its streets are: four to six lanes, long
straights, few junctions that force a stop. Hughes Park, the slowest, is two
lanes each way with a double yellow line, cobbles and a stone arch, and even
there free roam runs at 120-178 km/h (09:00-09:30).

**Against Crosstown.** `docs/city-baseline.json` has the expert driver
averaging 0.22-0.48 of Crosstown's 320 km/h top speed on an empty road (70-155
km/h) and 0.24-0.35 in traffic. The reference game's races average about 0.75.
That is a factor of about two, and it is not a tuning target (different cars,
different camera, and a player who knows the roads), but it is the clearest
measurable difference in feel between the two games. It points at road and
route geometry more than at the car: sightlines and sweeping curves rather than
grid corners. It is worth holding onto while ADR-0009 rebuilds the map from the
routed roads outward, and "race average as a fraction of top speed" is a number
`npm run citylap` already produces.

### 2. Traffic is sparse

| District | Vehicles visible per frame | Frames with none |
|---|---|---|
| All driving | 0.60 | 60% |
| McClane | 0.86 | 52% |
| Callahan Industrial | 0.71 | 50% |
| Downtown | 0.69 | 54% |
| Interstate 92 | 0.62 | 58% |
| "Fairhaven" | 0.45 | 67% |
| The Beltway | 0.44 | 66% |
| Ripley's Point | 0.44 | 71% |
| Hughes Park | 0.26 | 78% |

Three or more vehicles are on screen in at most 10% of seconds (McClane) and
0-5% elsewhere. Traffic is an occasional obstacle and a score source (the
ONCOMING and NEAR MISS counters run almost constantly) rather than a density
that sets the pace.

**Against Crosstown.** CLAUDE.md records that Crosstown's traffic roughly
halves lap pace. Here it costs almost nothing. That is a design choice, not a
bug, but it is a big one, and it compounds finding 1.

### 3. Pursuits come from events, and outlive them

| Pursuit | Started by | Ran | Ended | Results card |
|---|---|---|---|---|
| 1 | The ambush event (starts already at heat 2) | 17:53-20:17 | Evaded, 1:52 after the event's own finish | 3,050 SP, 2:02.35, 1 cop disabled |
| 2 | The Most Wanted race ("CHASE INITIATED" 2 s in) | 23:02-27:05 | Evaded, through the rival shutdown and 80 s past it | 1,925 SP, 3:39, 1 cop disabled |
| 3 | The circuit race, mid-way | ~31:28-35:35 | Evaded 2.5 min after the race finished | 1,060 SP, 4:07.42, 1 cop disabled |

About 10.5 minutes, 28% of driving. **No pursuit began in free roam** in 47
minutes, despite a great deal of 150+ km/h driving past traffic. One unit was
disabled per pursuit.

**Against Crosstown.** #177 gave a pursuit a trigger: patrols witness you
speeding or ramming. The reference game barely uses that path in its opening
hours; its pursuits are content attached to events and carried out of them.
Both are defensible. The observation is that the reference game gets a lot of
pursuit without free-roam provocation, because every Most Wanted race and some
ordinary races bring one.

### 4. The police are felt, not seen

In all three pursuits, chase cars are almost never on screen. One cruiser at
the ambush's start, one met head-on in a tunnel, one far ahead at 34:31; the
rest of the time the chase is behind and out of sight, because at 200+ km/h it
cannot keep up. What reaches the player instead:

- **Roadblocks ahead.** Four in the Most Wanted race (23:38, 24:00, 24:20,
  25:06), roughly every 20-40 s, placed on the race route, often right at a
  checkpoint gate; each breach pays +250 SP. A fifth ended the rival's run
  (26:20).
- **Radio,** which names your car and warns of what is coming (finding 7).
- **The HUD** (finding 10).

**Against Crosstown.** `REP_ROADBLOCK = 250` already matches the +250.
Crosstown attempts a roadblock every `ROADBLOCK_INTERVAL = 13` s with at most
`ROADBLOCK_MAX = 2` out, against the 20-40 s between breaches seen here, and
places them ahead by `aheadOfThem` in seconds of travel, which is the same idea.
The difference is *where*: the reference game put them on the race route, at
checkpoints, where the player has to go.

### 5. Escape timing

| Transition | Seen | Crosstown |
|---|---|---|
| Out of sight to cooldown | 6-8 s (18:39 unseen, 18:47 cooldown); 6 s after taking out the only unit in sight (19:13 takedown, 19:19 cooldown) | `LOSE_CONTACT_TIME = 4` |
| Cooldown to escape | 33 s (19:19-19:52), 30 s (26:34-27:03), 26 s (35:10-35:35 after the last re-spot) | `SEARCH_TIME + SEARCH_TIME_PER_LEVEL x level`: 25 s at heat 2, 32 s at heat 3 |
| Seen during cooldown | Straight back into the pursuit | Same |
| Heat during cooldown | "HEAT LEVEL DECREASED" fires part-way through a cooldown | `CITY_HEAT_DECAY` |

Under the downtown freeway deck the state flipped between seen and cooldown
five times in 60 seconds (34:17, 34:29, 34:49, 35:03, 35:09): pillars and
traffic break and restore the line of sight constantly.

Crosstown's search window matches almost exactly. Crosstown loses contact
somewhat faster.

### 6. A respray changes the colour, and dispatch notices

During the circuit race the car passes a roadside workshop that sits on the
route. At 31:39 it is yellow; at 31:40 it is blue. At 31:42 dispatch:
*"Vehicle description update, vehicle is blue."* A lap later it goes from blue
to silver, and at 32:41: *"Vehicle details, it's a silver ..."*. (The car
looked green at 31:25; that was tunnel lighting.)

At 33:17, during the continued pursuit, the car drives through a different
workshop; the car-info panel appears and the pursuit continues, since it was
still being seen.

**Against Crosstown.** #95 already ends a search when the car is repaired,
reasoned as "a car that goes in beaten up and comes out straight is not the car
they are looking for". The reference game makes that reasoning visible (the
paint changes) and audible (dispatch updates the description). The radio line
is a cheap addition to `radio.ts`'s table; the paint is a renderer change.

### 7. Dispatch announces escalation before it happens

The ambush, in order:

| Time | Line | Then |
|---|---|---|
| 18:00 | "Suspect is driving a Maserati." | Names the player's actual car |
| 18:12 | "Dispatch, SUV units requested, we've got to get something that will stop this guy." | |
| 18:19 | "... units are en route but caught in traffic. We'll advise when I have an ETA." | |
| 18:23 | "All units, roadblocks in place. Advise when approaching, over." | 18:29: roadblock visible ahead on I-92 |
| 18:49 | "All units within the pursuit perimeter to begin street by street search. Report all sightings, over." | Cooldown |
| 19:22-19:34 | "... lost visual ... All units to commence a 3-by-3 search." "All units, hit the grid. Weave the area from last known, over." | |
| 19:54 | "All units in Code 3 pursuit, vehicle has not been located." ... "Return to duties until further notice." | Escape |

From the Most Wanted race: "Dispatch, they're racing. They have to be on a
route. Anyone got an idea where they're heading?"; "Dispatch, we need more
backup, we're going to lose these racers"; "We have established roadblock,
over"; "... roadblock breached"; "Dispatch, can we clear all non-critical
calls? We need these guys stopped"; "Watch for him breaking away"; "Dispatch,
we're going to need a perimeter to contain this"; "Oh, you're playing
stuntman"; "Dispatch, we're losing suspect, rerouting, over". From the circuit
race: "These guys are good." From the last pursuit: "I lost him, I lost him",
"Dispatch, I got him", "Be advised, duty sergeant recommending units go Code 2
[transcribed "CO2"] for search, over".

(Radio recovered by separating the voice from the music and transcribing it;
where a line was also captioned on screen, the caption's wording is used.)

**Against Crosstown.** `radio.ts` watches the pursuit rather than being told.
The pattern worth copying is ordering: the line that warns comes a few seconds
before the thing it warns about, so the radio is information and not just
colour. The racing-specific lines ("they have to be on a route") show dispatch
reasoning about what the player is doing, which is a register Crosstown's table
could have.

### 8. A wreck is not a bust

"CRASHED" in a race (25:08) and "TAKEN DOWN" in a pursuit (34:33) both play a
2-4 s crash camera and then put the car back on the road: at speed in the race,
from a standstill in the pursuit. The race clock keeps running, the pursuit
carries on, and neither was followed by a bust. This matches #95 ("damage never
ends the game") and #179's recovery in spirit.

### 9. Geography that escapes are made of

- **A railway line along I-92.** In the ambush the player sees a roadblock
  ahead, drops off the freeway onto the tracks (18:31, briefly down to walking
  pace) and follows them for the rest of the event: through a tunnel, over a
  bridge, past signal gantries. The escape happens on it.
- **A covered, double-decked freeway downtown** (I-92 South). Long, lit,
  pillared; line of sight breaks constantly (finding 5).
- **Tunnels everywhere:** at least five distinct ones in 47 minutes, including
  one under the city on Connors Bridge Road with two lanes each way.
- **Off-road shortcuts with jumps inside race routes:** the Most Wanted race
  crosses a quarry or construction field with a 105.7 m jump (25:20-25:40).
- **A mountain pass** (Vincennes Road): cliffs, retaining walls, driven at
  150-205 km/h.
- **Industrial districts** with refineries, cranes and pylons (Ripley's Point,
  Callahan Industrial); **docks** with container stacks.
- **An exit ramp** from I-92 at Junction 10 down to Reynolds Lane: about 14 s
  at 90-100 km/h from the freeway to the surface street, under gantry signs.

### 10. The HUD

- **The minimap is the pursuit readout.** The panel is tinted red while you
  are seen, and the ring around the player turns blue when you are out of
  sight. In cooldown the whole panel turns cyan. Red heat bars stand on its
  right edge and become a three-segment cooldown meter labelled COOLDOWN. The
  district name sits above the map, the street name below.
- **Centre banners for every state change:** LOSE THE COPS, ENTERED COOLDOWN,
  HEAT LEVEL DECREASED, PURSUIT EVADED, CHASE INITIATED +25, ROADBLOCK +250,
  TAKEDOWN +500, SLAM TAKEDOWN +275/+450, CRASHED, TAKEN DOWN, SHUTDOWN.
- **A pursuit results card** in the corner after an escape: SP, pursuit time,
  cops disabled.
- **Race HUD:** floating "CHECK" gates with split times; position, time and
  distance to go; a callout attached to the car itself ("POSITION", "YOUR
  TIME", "Your Average" in a speed run). A PURSUIT SP counter appears top
  centre when a pursuit joins a race.
- **Friend comparison** (the game's Speedwall) pops up on every speed camera,
  billboard and jackspot. Out of scope for Crosstown (the social layer is a
  non-goal), noted for completeness.

**Against Crosstown.** #181 made the map the place the game explains itself.
The reference game's three-state minimap is a readout you take in without
looking away from the road, which a map screen cannot be.

### 11. The ladder

The Most Wanted race is won (25:46), and the results say "TAKEDOWN MOST WANTED
RIVAL TO EARN HIS RIDE". A cutscene shows the damaged player car and the
rival's; then the rival is directly ahead on an open coastal road (Somerset
Road) with the race's pursuit still running. At 26:19 cruisers are across the
road ahead, at 26:20 ROADBLOCK +250, and at 26:21 SHUTDOWN: the rival is
wrecked, in part by the police. It took about 15 s. "Alfa Romeo 4C Concept NOW
AVAILABLE", "Welcome to the Most Wanted", "nine more Shutdowns left". The
player joins the list at #12 on SP.

**Against Crosstown.** The same two-fight structure as #66 (win the race, then
catch and wreck the runner), and the same unlock by currency rather than by
beating the rival below (#91). The one thing seen here that Crosstown does not
do is let the police help: the runner and the pursuit share the road, and a
roadblock wrecked the runner. Crosstown's runner (`cityclaim.ts`) knows nothing
about the police.

### 12. Scoring and other systems seen

- **Takedowns of other racers score** (SLAM TAKEDOWN +275 twice in the circuit
  race), not only takedowns of police.
- **Parts have their own challenges:** the car panel shows per-part progress
  such as "0 / 4,572 metres" and "15s / 300s". Parts are unlocked by finishing
  a car's races in the top two, and are trades (off-road tyres improve
  off-road; track tyres improve tarmac) - the same shape as #68.
- **Milestones** pop mid-drive: "Triggered your first Speed Camera", "Triggered
  25 Speed Cameras +2,500", "Porsche 911 Carrera S Driven".
- **Collectible counts:** 123 jackspots, 66 speed cameras, 135 security gates,
  156 billboards; 41 cars. Crosstown places 90 boards and cameras. Recorded as
  data, not as a target.
- **The day/night cycle and weather** change across the video (wet dusk,
  night, dry daylight), consistent with the game's own clock; not measured.

## Where the driving went

46 distinct streets in 37 minutes. By street label the interstate is about 28%
of all driving.

| Street | Seconds |
|---|---|
| I-92 East | 210 |
| Clark Street | 135 |
| I-92 North | 119 |
| Malone Street | 100 |
| Connors Bridge Road | 99 |
| Brody Street | 85 |
| I-92 South | 85 |
| Reese Drive | 82 |
| Beddoe Drive | 81 |
| Somerset Road | 73 |
| Block Road | 72 |
| Hutchinson Avenue | 69 |
| I-92 junctions | 65+ |
| Vincennes Road (the mountain pass) | 64 |
| Kruger Avenue | 60 |
| Bloomguard Street | 60 |

The full per-second list is in `data/timeline.tsv`.

## Detailed notes

### Ambush "Bloody Nose" (16:45-20:20)

- 16:45 "HOLD TO START EVENT" at a marker; a loading screen, then a cinematic.
- 17:45-17:51 a skippable cutscene: the parked player car, cruisers pulling in
  around it.
- 17:53 play starts with a cruiser alongside. LOSE THE COPS. 17:57 "Heat Level
  2 Reached +2,500": it starts at heat 2. TARGET TIME 2:30.00 top left, YOUR
  TIME top right and attached to the car, PURSUIT SP top centre.
- 17:59 a slam on a cruiser, sparks.
- 18:03-18:27 150-200 km/h on I-92 at night. No cop on screen. The ring around
  the player turns blue briefly at 18:13 and back to red.
- 18:29 a roadblock ahead (a row of blue lights across the carriageway). 18:31
  the player swerves right, off the freeway, onto the railway alongside,
  speed down to a crawl, then back up to 150.
- 18:39 blue ring. 18:47 ENTERED COOLDOWN; the minimap turns cyan and the heat
  bars become the cooldown meter. 18:53 HEAT LEVEL DECREASED.
- 19:05-19:11 the railway enters a tunnel and a cruiser comes the other way:
  seen again, red again.
- 19:13 SLAM TAKEDOWN +450, the cruiser wrecked head-on. 19:19 ENTERED
  COOLDOWN. 19:33 HEAT LEVEL DECREASED. The meter drains from 3 to 1.
- 19:52 event results: finished in 1:59.85 against a 2:30 target, top-three
  finish +12,000, two parts unlocked, "Most Wanted event is now available".
- 20:07-20:15 back in free roam, still in cooldown.
- 20:17 PURSUIT EVADED; 20:19 results: 3,050 SP, 2:02.35, 1 cop disabled.

### Most Wanted #10 race (22:30-25:50)

- 22:30 a card: "MOST WANTED 10 / Beat the Alfa Romeo 4C Concept". Loading tip:
  "Smash through gates to find hidden routes and locations".
- 23:00 a sprint of 8.9 km, the player 2nd. Tutorial caption: "Speeding, or
  hitting cops might win you Speed Points, but it also gets the cops'
  attention. Until you escape, they will try and bust you." 23:02 CHASE
  INITIATED +25.
- 23:04-23:30 from waste ground under a flyover onto downtown streets; 200-245
  km/h; slipstreaming; speed cameras.
- 23:32 takes 1st. 23:34 "We have established roadblock, over". 23:38 ROADBLOCK
  +250.
- 24:00 ROADBLOCK +250 downtown. 24:04-24:16 a long tunnel under the city.
  24:16 "Dispatch, roadblock established, over." 24:20 ROADBLOCK +250 at a
  checkpoint on Connors Bridge Road.
- 24:30-24:40 along the waterfront under a bridge deck; industrial buildings,
  cooling towers.
- 25:06 ROADBLOCK +250; 25:08 CRASHED, the car on its roof; 25:12 back on the
  road at speed.
- 25:20-25:40 off-road through a quarry or construction field, a 105.7 m jump,
  a billboard smashed.
- 25:46 FINISH 2:45.57; 25:48 results, "TAKEDOWN MOST WANTED RIVAL TO EARN HIS
  RIDE". The list shows the player at #12.

### Circuit race "Off the Grid" (30:30-33:00)

- 30:30-30:57 a flyover of the course: refinery pipes, cranes, pylons.
- Two laps of about a minute on two-lane industrial roads and dirt shoulders,
  160-215 km/h; from 6th on the grid to 1st by 31:45.
- SLAM TAKEDOWN +275 on rival racers at 31:06 and 31:33.
- The pursuit joins at about 31:24.
- The respray: 31:39 yellow, 31:40 blue, 31:42 the radio.
- 33:00 finished 1st in 2:01.73, "Most Wanted event is now available"; the
  list shows the player at #12 with 176,165 SP.

### The pursuit continued (33:00-35:40)

- 33:17-33:21 through a workshop.
- 33:25-33:55 I-92 through road works, then south into downtown at 200-260
  km/h. 34:05 milestone "Triggered 25 Speed Cameras +2,500".
- 34:00-35:30 the covered freeway: five seen/cooldown flips in a minute.
- 34:33 TAKEN DOWN at about 260 km/h (a pillar or traffic); 34:37 back on the
  road from a standstill, still pursued.
- 35:15 HEAT LEVEL DECREASED; 35:35 PURSUIT EVADED in daylight on I-92; 35:37
  results: 1,060 SP, 4:07.42, 1 cop disabled.

## What this does not tell us

- **One player, one playthrough.** A different player takes different routes,
  starts different events and provokes more. "No free-roam pursuit" is true of
  this recording, not of the game.
- **Car stats are unknown.** The cars' top speeds are inferred from the highest
  readings (about 270 km/h), not from data.
- **Distances in metres** exist only where the HUD shows them (race distance to
  go, a jump length). There is no ground-truth scale for roads; lane counts are
  read off frames.
- **The police AI's rules** (sight range, how roadblocks are placed) are
  inferred from what happened, not known.
- **Traffic counts** are rough (see the tools README).
