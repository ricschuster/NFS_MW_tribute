# Project brief: NFS Most Wanted tribute

## The pitch

A browser arcade racer that captures the *feeling* of *Need for Speed: Most
Wanted* (2005) — raw speed, gritty dusk lighting, and (eventually) the thrill of
outrunning cops and climbing the Blacklist — without attempting a full 3D
open-world remake.

## Form

Pseudo-3D, OutRun-style road racer. The road is drawn as projected 2D segments
that scale with distance, giving depth without 3D models or a game engine. This
keeps the project buildable solo and deployable as static files.

## Why this form

A true 3D open-world MW is a multi-year team effort. The pseudo-3D racer is the
sweet spot: it delivers the core sensation (speed, traffic, a road rushing at
you) with a small, well-understood codebase, and it leaves clear room to layer
on the MW-specific fantasy (pursuits, Blacklist) increment by increment.

## What "done enough to be fun" looks like

Milestone targets, in order:

1. **Drive** (done) — an endless track with hills, curves, and a speed HUD.
2. **Dodge** — oncoming and parked traffic you can crash into.
3. **Run** — a cop that chases you; a heat meter; escape/bust states.
4. **Climb** — race events against Blacklist rivals with ranked progression.

## Aesthetic north star

Dusk/night palette, warm horizon glow, silver-and-blue hero car (a nod to the
BMW M3 GTR), red-and-white rumble strips. Gritty but readable at speed.

## Explicit non-goals

- Photoreal or true 3D rendering.
- Multiplayer or any backend.
- Shipping copyrighted EA assets. All art is drawn or original.

## Open questions

- Sprites (pixel art) vs. keep vector-drawn shapes? (Deferred; vector for now.)
- Fixed authored track vs. procedural/looping generation for race events?
- How to model "heat" — discrete levels like MW, or a continuous meter?
