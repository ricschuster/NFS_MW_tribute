# CROSSTOWN

**Crosstown** is an open-world arcade street racer set in Kestrel Bay: a
free-roam city, a ladder of ten rivals, Rep earned from everything you do, cars
found parked around the city, and police pursuits that escalate through six
heat levels. Built with TypeScript + Vite, deploys anywhere as static files.

Original work. It takes its cues from the open-world street-racing genre, but
the city, the cars, the rivals and every asset in it are its own.

**[▶ Play it](https://ricschuster.github.io/NFS_MW_tribute/)**

## Driving

WASD or arrows to drive, **shift** for nitrous, **Enter** to start an event you
are parked on, **B** to glance behind, **Tab** to hold the collection map open,
**Q** to hold the Quick Wheel open (**E** switches branch, **1**-**9** picks),
**M** to mute. On a phone, on-screen controls appear as soon as you touch the
screen: steering, throttle, brake, nitrous, enter, the map, the Quick Wheel and
a glance behind.

Speed, nitrous, heat, Rep, takedowns and a heading-up minimap are drawn over
the world, and the police radio calls a roadblock before you can see it and air
support before you can hear it, as subtitles down the left. It is a tell, not
decoration.

Rep is earned from everything - takedowns, roadblocks gone through, cars
threaded at speed, and every second you stay at large - and everything is worth
more while they are chasing you. Ninety billboards are scattered across the
city to smash and twenty-five speed cameras to be clocked by, and seven more
cars are parked around it: drive into one and it is yours, no menu and no
money. Six events run through the city, unlocked by Rep - three laps of real
streets against a field of six, or a single lap scored on the average speed you
held over it. Five ambushes drop you stationary and already surrounded, with
one job.

The car takes damage and loses speed and grip with it; six drive-through
workshops put it right without stopping, and doing that while the police are
searching for you ends the search. The gates and pallet stacks around the city
come down on whoever is on your bumper. Each of the ten ladder rivals is two
fights: beat them in the race, then run them down and wreck the car to take it.
Finishing first or second in a car earns it a part - engine, tyres, gearing,
aero, each one a trade - and the Quick Wheel changes car, fits parts and sets a
destination without ever stopping the world.

The camera opens on a pass around the car, chases it with a field of view that
widens with speed, and cuts away when you hit something. Ram a cop hard enough
and squarely enough and you wreck it: time slows and the camera swings round
the wreck. From heat two the police start parking cruisers across the road in
front of you, sometimes with a gap and, the hotter it gets, more often without.
From heat three they also send Enforcers: heavy units that come at you head on
and steer for the lane you are in rather than the one beside it. From heat four
they lay spike strips across most of the road, and running over one takes your
top speed and most of your steering for a few seconds. From five a helicopter
joins in: it never touches you, it keeps you *seen*, so the search never starts
while it is up there and the way out is cover rather than speed. All of that is
off under `prefers-reduced-motion`, which leaves a plain camera behind the car.

## Looking at the map

[`?renderer=city`](https://ricschuster.github.io/NFS_MW_tribute/?renderer=city&view=aerial)
flies a free camera over Kestrel Bay with no car in it, for judging the
generated city rather than driving it. WASD or arrows to move, **Q**/**E** down
and up, **drag** the mouse to look, **hold ctrl** for four times the speed.
Speed scales with altitude, so climb to cross the map quickly.

Add `&view=` to start at a fixed viewpoint. They exist so screenshots are
comparable between runs, and they are the quickest tour of the city:

| `&view=` | What it shows |
| --- | --- |
| `overpass` | The interstate crossing over a street on its pillars. This is the thing the old renderer could not draw at all, and the reason for the rebuild. |
| `aerial` | The whole 5 x 4 km island: districts, the river, the bay, the freeway loop. |
| `downtown` | The towers, with the water behind them. |
| `street` | Street level, looking down a downtown block to the bay. |
| `bridge` | One of the three river crossings. |

## Install it

The build is a progressive web app: open it, install it from the browser's menu
and it runs in its own window, offline, with no address bar. Everything it
needs is precached on first load - the whole game is static files, and the city
is generated from a seed rather than downloaded.

Saves go through a small storage adapter: the browser's own storage here, a
file in the user's app data directory once there is a desktop shell to put one
behind it. Clearing site data still clears progress in a browser, which is what
browser storage is.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

## Scripts

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                     |
| `npm run typecheck` | `tsc --noEmit`; run before considering a change done |
| `npm run test`      | Unit tests and playtests                            |
| `npm run playtest`  | Just the playtests: drive the sim, assert outcomes  |
| `npm run city`      | Draw the generated city from above; `-- --seed N` for another |
| `npm run cityshot`  | Screenshot the 3D city and the driving views        |
| `npm run citylap`   | Drive a reference driver round every route, empty and in traffic, against `docs/city-baseline.json` |
| `npm run pace`      | Can the police be outrun? Your top speed against theirs, at every heat level |
| `npm run patrol`    | Twenty minutes in the city with the police live, and what came of it |
| `npm run build`     | Typecheck, then build a static bundle to `dist/`    |
| `npm run preview`   | Serve the production build locally                  |
| `npm run pwa`       | Serve `dist/`, cut the network, check it still plays |
| `npm run icons`     | Redraw the app icons                                |

## How it works

Kestrel Bay is a real 3D scene in three.js, and it is **generated from a seed**
rather than authored or imported: a street network, water cut through it,
extruded building blocks per district, an elevated interstate loop with ramps
and a tunnel, and everything scattered along the result. There is no asset
pipeline and nothing licensed. See
[ADR-0004](docs/decisions/0004-webgl-free-roam-city.md) for why the renderer is
what it is, and
[ADR-0005](docs/decisions/0005-the-shape-of-kestrel-bay.md) for what the city
is shaped like.

Two seams carry most of the weight.

**The simulation is split from rendering** (ADR-0003). `cityworld.ts` holds all
game state as a pure `step(dt, input)` with no canvas and no DOM; `scene/`
draws it. That is what lets the playtests drive the real game with scripted
input and assert on outcomes, and it is the only reason rebuilding the renderer
was survivable.

**The city is data.** `city/` turns a seed into junctions, roads, blocks,
districts, water, buildings and street furniture as plain descriptions - it
never constructs geometry and never imports three.js. `scene/` turns those
descriptions into instanced meshes. That is what lets the sim collide with a
building without a renderer in the room, and what lets boxes become models
later by swapping a provider.

### Source layout

```
src/
  main.ts            entry point: boots the city, or the free camera
  style.css          page chrome around the canvas
  game/
    cityworld.ts     the sim: position, heading, height, collision, step(dt, input)
    citypolice.ts    the pursuit: six heat levels, cooldown, search, roadblocks,
                     spike strips, a helicopter, and Enforcers
    citytraffic.ts   ambient traffic, kept around the player
    graphcar.ts      what it is to be a car on the street graph
    impact.ts        what it takes to wreck a car: closing speed, angle, a wall
    cityrace.ts      circuits against a field, speed runs against a number
    cityambush.ts    the trap: surrounded, stopped, and a clock
    cityclaim.ts     run a beaten rival down and take the car
    rep.ts           the award table: what everything you do is worth
    rivals.ts        the ladder of ten, as a price rather than a queue
    cars.ts          the roster, as handling profiles against a reference car
    garage.ts        what the player owns: cars, parts earned, parts fitted
    mods.ts          the parts catalogue, as trades rather than upgrades
    collectibles.ts  what has been found: smashed billboards, clocked cameras
    quickwheel.ts    the menu that never pauses
    radio.ts         what the police say about you, and when
    audio.ts         synthesized engine / siren / squelch (WebAudio)
    touch.ts         on-screen controls for mobile
    progress.ts      the save format, versioned and validated field by field
    storage.ts       where a save lives: a seam a desktop shell fills in
    constants.ts     tunable world / camera / physics constants
    city/            the generator: a seed in, a city out. No three.js.
    scene/           the renderer: cityscape assembles it, cameras and hud
                     drive it, buildings and furniture instance it
tools/               citylap + citydriver, citymap, cityshot, pwacheck, icons
```

## Docs

- [Project brief](docs/design/00_project_brief.md) — what this is and why
- [Architecture decisions](docs/decisions/) — ADRs for the choices that stick
- [Session handoff](docs/HANDOFF.md) — where the project stands right now

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).

A non-commercial original work. It is not affiliated with, endorsed by or
derived from any commercial racing game, and contains no third-party names,
places, cars or assets.
