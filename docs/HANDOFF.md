# Session handoff

Snapshot of the project so a fresh session (or a new contributor) can pick up
cleanly.

- **Repo:** github.com/ricschuster/NFS_MW_tribute · branch `main`
- **▶ Play (live):** https://ricschuster.github.io/NFS_MW_tribute/
- **Status:** feature-complete, polished, deployed, and tested.

## What it is

A pseudo-3D, OutRun-style arcade racer — a fan tribute to *Need for Speed: Most
Wanted* (2005). TypeScript + HTML5 Canvas + Vite, no engine, no backend; builds
to static files.

## What works (the whole loop)

Drive the open road → dodge traffic → outrun or get **busted** by escalating
cops → **nitro** past them → climb the 15-rival **Blacklist** (ranked races,
saved to localStorage).

- Driving: accel/brake/**reverse**, off-road slowdown, drift, low-speed steering
- Nitrous (SHIFT): boost + meter, exhaust flames, speed lines
- Traffic + collisions (crash = shake + flash + speed loss)
- Police pursuit: heat meter, more/faster cops with heat, **BUSTED** / **ESCAPED**
- Cops render in a **rear-view mirror** (they trail you), not faked ahead
- Blacklist: 15 rivals, 3-2-1 sprint races vs. rival AI, rank progression saved
- Game states: **title / pause (P) / restart (R)**
- Synthesized audio: engine (pitches with speed), siren, title pad, **mute (M)**
- **Touch controls** for mobile
- Roadside scenery (trees, billboards, lamps) + a **city skyline** backdrop
- Respects `prefers-reduced-motion`

Controls: WASD/arrows drive · SHIFT nitro · ENTER race/confirm · P pause · M mute.

## Architecture (read `CLAUDE.md` before touching game code)

Simulation is split from rendering (ADR-0003):

- **`src/game/world.ts`** — headless sim: all state + pure `step(dt, input)`, no
  DOM. Put new *behaviour* here so playtests can cover it.
- **`src/game/game.ts`** — presentation only: canvas, input, loop, all drawing,
  and the title/pause state machine.
- Others: `road`, `traffic`, `police` (heat/bust/escape), `blacklist`,
  `progress` (localStorage), `audio`, `touch`, `render`, `math`, `constants`
  (tune feel here first).

## How to work on it

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # 50 unit tests + playtests (World driven by scripted input)
npm run playtest   # just the playtests
npm run build      # typecheck + static build
npm run shot       # headless screenshots of the canvas -> screenshots/*.png
```

- **Playtests** (`world.playtest.test.ts`) drive a `World` with scripted inputs
  and assert outcomes; they gate CI. Add one for new gameplay.
- **Visual checks:** `npm run shot` (needs `npx playwright install chromium`
  once) drives the game in headless Chromium and screenshots the canvas at the
  title/drive/pursuit/countdown/race states so rendering can be eyeballed. This
  session used it to catch and fix real render bugs (PR #37).

## Repo mechanics (already set up)

- **Flow:** branch → PR → `gh pr merge --auto --squash`. Auto-merge and
  branch auto-delete are on.
- **Gate:** `main` is protected; the `build` check (typecheck + test + build)
  must pass before merge. Force-push/reset denied.
- **Deploy:** `.github/workflows/deploy.yml` publishes to GitHub Pages on every
  push to `main`.
- After a merge, poll `gh pr view <n> --json mergedAt` until non-null *before*
  `git pull` — auto-merge lags CI by a few seconds.

## Open issues / next steps

Only two remain, both needing human judgement:

- **#14 Tune driving feel** — subjective; best done by playing the live build and
  adjusting `constants.ts` (cop aggression, race length, nitro duration,
  steering). Playtests lock the invariants; feel is yours to call.
- **#11 Replace vector art with pixel sprites** — a large aesthetic pivot. The
  current clean vector look plus roadside scenery/skyline reads well, so this is
  an intentional direction decision, not a gap. The screenshot tool makes it
  iterable if you want it.

## Notes / caveats

- Rendering a rear pursuer in a forward camera is inherently an abstraction; the
  rear-view mirror (#25) is the honest take. Bust/escape are distance-based.
- `Game` (screens, audio, touch, mirror, scenery) is presentation-only and
  verified via screenshots, not playtests — an accepted limitation (ADR-0003).
