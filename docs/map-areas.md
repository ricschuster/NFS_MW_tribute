# Map areas: what is done, and in what order

The rebuild of Kestrel Bay (ADR-0007 to ADR-0009) is finished one area at a
time, and this file is the list. Update it in the same PR as the work that
moves an area on, the way `docs/HANDOFF.md` is kept.

## Downtown goes last

Decided 2026-09-18: **every other area of the map is finished before
downtown (#268).** Downtown is the hardest case the rebuild has - a street
network that reads as grown rather than planned, over blocks that are
currently rectangles in sixteen modules (#268 has the detail) - and the rest
of the map can be brought up to the same standard first, one area at a time,
the way Marrow Field was.

This is a change of order, made knowingly. ADR-0010 sequences work by what it
invalidates backward, and by that rule downtown came first: `docs/HANDOFF.md`
used to call #268 the gate, and several issues (#253, #256, #260, #265,
#266) were written as "not startable before #268". Doing downtown last means:

- Those issues are done **per area** where they apply - blocks as pads on a
  hillside, tunnels and cuttings, content density - instead of waiting for
  downtown to go first. #268's grown-streets question is still the one that
  decides downtown itself.
- Whatever needs a city full of routes waits longest. Re-deriving
  `docs/city-baseline.json` and the rival pace fractions (owed since #255)
  still needs the generator's circuits, and those need streets across the map.
  Hand-laid routes like the Marrow Field Run (`placedRoutes`, #311) are how an
  area gets its event in the meantime.
- The freeway (#261, #301) still needs surface junctions to land its ramps
  on. Areas finished before downtown are where those junctions will come from
  first.

## What "done" means for an area

What Marrow Field went through, from a road audit to an event, written down
so the next area has the same checklist:

1. **Roads audited.** Every building reaches a road, measured rather than
   judged from a picture (house-to-nearest-road distance against the
   generator's own reach), and the area is connected to the rest of the city.
2. **Streets and lots,** where the area is meant to have them: local streets
   off its own major roads (`localstreets.ts`, `CITY_LOCAL_STREETS_KINDS`) for
   a district; a place may have none.
3. **Buildings** of the kind the area is, standing on the ground (#253).
4. **Surface and character:** whatever makes it read as itself - dirt and
   decay at the airfield, and so on.
5. **Set dressing:** props placed in the prop editor (`npm run propexport`,
   which today crops to Marrow Field and would be pointed at the next area).
6. **Content:** collectibles, breakables and repair shops where it has them,
   and an event through it (generated, or laid by hand with
   `placedRoutes`).
7. **Played:** driven in the game and signed off by the person the map is for.

## The checklist

Measured on `CITY_SEED` on 2026-09-18 (Halloway Quarry, 2026-09-19). Areas are the districts and places in
`city/plan.ts`; directions are as the game's own map shows them (+z up).
✓ done, ◐ partly done, ✗ not started, n/a does not apply.

| Area | Kind | Roads audited | Streets and lots | Buildings | Character | Props | Content and event | Played | Status |
|---|---|---|---|---|---|---|---|---|---|
| Marrow Field | airfield | ✓ | n/a | ✓ hangar | ✓ dirt, decay | ✓ 108 placed | ✓ Marrow Field Run, jumps, gates, billboards | ✓ | **Done** |
| Ashford Point | waterfront | ◐ 7 of 40 houses have no road (#293, parked) | ✓ driveways (#268 pilot) | ✓ 40 houses | ✗ | ✗ | ◐ collectibles and breakables, no event | ✗ | In progress |
| Halloway Quarry | quarry | ✓ connected, no orphans (#323) | n/a | ✓ plant and shed on the floor, yard on the rim | ✓ gravel roads, no lamps or public traffic (#327), rock and dust (#328), ponds (#329) | ◐ 89 placed, in the editor | ◐ collectibles, breakables and a gate, no event | ✗ | In progress |
| Sablet Wharf | docks | ✗ | n/a | ✗ | ✗ | ✗ | ◐ collectibles and breakables, no event | ✗ | Not started |
| Kestrel Head | lookout | ✗ | n/a | ✗ | ✗ | ✗ | ✗ (0.2 km of road) | ✗ | Not started |
| Highmoor Park | park | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Not started |
| Tidewater Park | park | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ collectibles only | ✗ | Not started |
| Midtown, north (1.5 km NW of Marrow Field) | midtown | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ collectibles; the Marrow Field Run passes through | ✗ | Not started |
| Midtown, south (2.6 km S of Marrow Field) | midtown | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ collectibles only | ✗ | Not started |
| Midtown, south-west (4.5 km SW of Marrow Field) | midtown | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ collectibles only | ✗ | Not started |
| Industrial | industrial | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ collectibles only | ✗ | Not started |
| Downtown | downtown | ✗ | ✗ (#268) | ✗ | ✗ | ✗ | ◐ collectibles only | ✗ | **Last** |

What the table does not show: the three midtown districts have no names in
`plan.ts` yet, and naming them is part of taking each one on. The collectibles
and breakables counted as "partly" are the generator's, placed along whatever
roads exist today, not chosen for the area.

## Suggested order

Not decided; a starting point. The places first - Halloway Quarry, Sablet
Wharf, Kestrel Head - because they follow the pattern Marrow Field proved
(road audit, character, props, an event) and need no local streets. Then
Ashford Point, which is closest to done, once #293 is taken off the shelf.
Then the parks, midtown and industrial, each with its own local streets as
Ashford Point had. Downtown last.
