# Map areas: what is done, and in what order

The rebuild of Kestrel Bay (ADR-0007 to ADR-0009) is finished one area at a
time, and this file is the list. Update it in the same PR as the work that
moves an area on, the way `docs/HANDOFF.md` is kept.

## Resumed 2026-09-27: the frame fits, and the freeway comes first

Area work was paused for #363, which found that the map's frame (land,
districts, main roads, the freeway sketch) carries everything the gameplay
review and ADR-0011 asked for; what is short is the fill
(`docs/research/map-fit-363.md`). Area work resumes, with two changes decided
by the owner the same day:

- **The freeway comes first.** Fast cars only matter once the freeway is
  built, not drawn (the audit's question 2), so #261 and #301 go ahead of the
  next area. **Built 2026-09-28 (#371):** `CITY_FREEWAY` is on, with seven
  authored ramps, each joined to the drawn roads by a boulevard.
- **The pace check has a tool.** `npm run mapfit` measures a route; an area's
  event route should reach about 60% of top speed on its careful line.

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
- The freeway (#261, #301) no longer waits for surface junctions: its ramps
  are authored markers with a boulevard from each foot to the nearest drawn
  road (#371). More ramps are more markers in the freeway editor.

## Races wait for the map

Decided 2026-09-30, by the owner: **races are not tuned while the areas are
being built.** Every area adds roads, buildings and breakables, and each of
those moves the races - Midtown north's streets alone shifted Halloway Rim
and Sablet Quay, kilometres away, through where the breakables landed (#469)
- so a race tuned now is a race retuned after every area that follows.

- Each area gets **its own event as it is built**, laid to be drivable and
  checked for that only (checklist step 6).
- **No race tuning** in the meantime: not lap times, rival pace, the ladder's
  gaps, `SPEEDRUN_TARGET`, or an area's pace (step 7).
- When **`citylap` moves** because of area work, re-record
  `docs/city-baseline.json` and say in the PR what moved, rather than
  chasing it. Its guards still hold: every route finishes, and none comes
  back faster in traffic than empty (#210).
- Once the areas are built, **a proper exploration of the races**: route
  quality, pace against ADR-0011, the ladder and the rival pace fractions,
  and the baselines, all at once against the finished map.

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
   `placedRoutes`). The event has to be drivable - `citylap`'s driver finishes
   it, and it has no hairpin the map did not mean - and nothing more: it is
   not tuned yet (see "Races wait for the map" below).
7. **Paced** (ADR-0011): the area's event route, driven by a person in the
   starter car, averages about 0.6 of top speed, and any fast road it has is
   one where a faster car is measurably quicker. Measured, not judged, with
   the review's tools (`docs/research/nfs-mw-2012/tools/`). Added
   2026-09-27, after Marrow Field was signed off. **Deferred** to the race
   exploration since 2026-09-30: an area is done without it.
8. **Played:** driven in the game and signed off by the person the map is for.

## The checklist

Measured on `CITY_SEED` on 2026-09-18 (Halloway Quarry, 2026-09-19). Areas are the districts and places in
`city/plan.ts`; directions are as the game's own map shows them (+z up).
✓ done, ◐ partly done, ✗ not started, n/a does not apply.

| Area | Kind | Roads audited | Streets and lots | Buildings | Character | Props | Content and event | Played | Status |
|---|---|---|---|---|---|---|---|---|---|
| Marrow Field | airfield | ✓ | n/a | ✓ hangar | ✓ dirt, decay | ✓ 108 placed | ✓ Marrow Field Run, jumps, gates, billboards | ✓ | **Done** |
| Ashford Point | waterfront | ✓ 5.9 km of boulevard; the generated driveways (#268) left 8 houses up to 400 m from a road and 52 dead ends; audited and answered (#293) | ✓ 9 estate lanes drafted by `suburbdraft --district waterfront`, the owner's coast road and ridge road, one lane removed (#293) | ✓ 86 villas, 40 houses and 9 manors, the ridge kept for manors, every house on a lane (#293) | ✓ affluent estates: drives to every villa and manor, garden trees, copses on the open ground, three ponds (#293) | ✓ street trees at two in five and lamps set back from the lanes, no hedges, reviewed by the owner in the Ashford Point Props editor (#293) | ✓ collectibles; the Ashford Coast Sprint, 4.9 km round the coast road (73% of top on `citylap`), and the Estates Circuit, 2.8 km (47%) (#293) | ✓ approved by the owner 2026-10-01 | **Done** |
| Halloway Quarry | quarry | ✓ connected, no orphans (#323) | n/a | ✓ plant and shed on the floor, yard on the rim | ✓ gravel roads, no lamps or public traffic (#327), rock and dust (#328), ponds (#329), haul trucks (#330) | ✓ 90 placed in the editor | ✓ the Halloway Rim circuit and its Crest Kicker jump, the Halloway Drop sprint down the haul road (#397, 67% of top on `citylap`); collectibles, breakables and a gate | ✓ driven and signed off 2026-09-30 | Done |
| Sablet Wharf | docks | ✓ a 3.3 km quay loop round the waterline, cross streets drawn round the port layout, and three ways in: the south bridge and two bridges off the north tip (#410) | n/a | ✓ three warehouses, offices, a gatehouse (#410) | ✓ paved yard that drives at nine tenths of road pace (#410) | ✓ a container port placed in the editor: 563 container blocks, five ship-to-shore cranes, straddle carriers, gates (#410) | ◐ the Pier Jump off a jetty across the east channel and the crane-line kicker (#410); collectibles and breakables; the Sablet Quay circuit, two laps of the quay loop (#451) | ✓ driven and signed off 2026-09-30 | Done |
| Kestrel Head | lookout | ✓ one tarmac road up, on to the fort's gate, and a gravel track down the far side to the south (#454) | n/a | ✓ a castle on the ridge after a real ruin (`docs/research/kestrel-head-castle.md`): a walled bailey along the road, an inner castle round the summit with a keep, hall and chapel, three gates (#454) | ✓ the bailey, inner castle and south ward cobbled, their outlines found from the walls; the inner castle and the ward stand on a raised platform (#454) | ◐ a first cut placed in the editor, filling the ridge: bailey, inner castle and south ward, 69 wall sections, 16 towers, two keeps, 11 outbuildings (#454) | ◐ the Kestrel Climb, an uphill sprint to the fort gate (#454) | ✓ driven and signed off 2026-09-30 | Done |
| Highmoor Park | park | ✓ the Climb, the gravel track, and dirt paths through the woods to the meadow, a viewpoint spur and the car park; the northern slopes reached (#460) | ✓ a gravel car park at the foot (#460) | n/a (the castle is Kestrel Head's) | ✓ woods on the lower slopes, open meadow near the top, generated (#460) | ◐ a picnic area, a viewpoint and a jump, drafted in the Highmoor Park Props editor (#460) | ✓ the Highmoor Descent down the gravel track and the west slope path, over the jump; the Kestrel Climb runs through it | ✓ driven and signed off 2026-09-30 | Done |
| Tidewater Park | park | ✓ 2 km of boulevard and 1.2 km of freeway (in its tunnel) through it, no dead ends; three paved park drives, 1.8 km (#461) | n/a | ✓ a bandstand, a café and a toilet block (#461) | ✓ two ponds in dug hollows, about 270 trees on the lawns in clumps and alone (#461) | ✓ benches round both ponds, placed in the Tidewater Park Props editor (#461) | ✓ collectibles; the Tidewater Drive speed run, 2.2 km round the drives (#461) | ✓ driven and signed off 2026-09-30 | Done |
| Midtown, north (1.5 km NW of Marrow Field) | midtown | ✓ 6.6 km of boulevard reaching 99% of it within 250 m; 14 residential streets, 4.2 km, drafted by `npm run suburbdraft` and kept by the owner (#477) | ✓ through streets, cul-de-sacs and crescents off the boulevards (#477) | ✓ about 190 houses facing the side streets and 100 low apartment blocks on the boulevards, drafted by `npm run housedraft` and edited in the area editor (#477) | ✓ a front hedge to every house and about 430 street trees in the verges (#477) | ✓ the owner's edits in the Midtown north Props area editor: roads, an apartment block, hedges and street trees (#477) | ✓ collectibles; the Marrow Field Run passes through; two circuits, the Midtown Crescents on its streets (1.6 km) and the Northshore Loop round its shore (3.3 km), both the owner's pick (#477) | ✓ driven and signed off 2026-10-01 | Done |
| Midtown, south (2.6 km S of Marrow Field) | midtown | ✓ 5.4 km of boulevard, 97% of it within 250 m, the elevated freeway down its middle; audited and answered (#487) | ✓ 17 streets (4.65 km) drafted and kept by the owner, 9 of them crossing under the deck; the bank boulevard is the promenade (#487) | ✓ 177 houses and 51 low apartment blocks, land side only, drafted and edited by the owner (#487) | ✓ a waterfront strip: the bank side of the promenade left open, houses behind it; streets under the freeway deck, between pairs of solid pillars, and a gravel track down the middle of the deck (#487) | ✓ hedges and 314 street trees, edited by the owner, none on the promenade (#487) | ✓ collectibles; the Promenade Sprint, 1.9 km north to south on the promenade (57% of top on `citylap`); a repair shop on the inland boulevard (#487) | ✓ | **Done** |
| Midtown, south-west (4.5 km SW of Marrow Field) | midtown | ✓ 2.7 km of boulevard, 92% within 250 m, between downtown, Industrial and Tidewater Park; audited and answered (#488) | ✓ 7 streets drafted by `suburbdraft` and kept by the owner; n99 joined end to end with r57 by the owner (#488) | ✓ 26 shops with flats over them and 11 blocks of flats on the high street, 81 houses and 23 low apartment blocks behind (#488, #502) | ✓ a high street of shops and flats on n100 from downtown's edge towards Tidewater Park, its pavement paved (#488) | ✓ hedges and 123 street trees, reviewed by the owner in the Midtown south-west Props editor (#488) | ✓ collectibles; the Main Street Sprint, 2.1 km from downtown's edge down the high street into Tidewater Park (42% of top on `citylap`) (#488) | ✓ approved by the owner 2026-10-01 | **Done** |
| Industrial | industrial | ✓ 4.2 km of boulevard and 1.8 km of freeway; 12 works roads drafted by `suburbdraft --district industrial`, 82% of the land within 150 m of a road (#489) | ✓ the works roads, and yards drawn in the editor, paved and closed to traffic (#489, #509) | ✓ about a hundred works drafted by `npm run worksdraft` round the owner's works on the crest and kept by the owner: tank farms, sheds on footings (#516), chimneys, rail yards with sidings, gantries and wagons (#489) | ✓ heavy industry, and the first stretch of the railway: a 1.8 km double-track main line beside the freeway, driven like gravel, no traffic (#514, #515, #517) | ✓ drafted, reviewed by the owner in the Industrial Props editor (#489) | ✓ collectibles; the Works Circuit, two laps round the works and through the crest yard (54% of top on `citylap`) (#489) | ✓ approved by the owner 2026-10-01 | **Done** |
| Downtown | downtown | ✓ 4.7 km of boulevard and 1.7 km of freeway, 84% of the land within 150 m of a road; audited and answered, and the plan trimmed to the shore and off Sablet Wharf (#268) | ✓ 114 streets, 17.5 km, grown by `suburbdraft --district downtown`: tight and crooked by the water, straighter inland; junctions of three, four and five arms; kept by the owner (#268) | ✓ 451 buildings and 11 landmarks drafted by `housedraft --place downtown` and edited by the owner: terraced townhouses, shops and flats, quay lofts, mid-rises and 80 towers stepping up to the lookout tower; a stadium by the freeway and a cruise terminal on the bay (#268) | ✓ an old core by the water and towers inland, drawn from Vancouver's downtown: lookout, twisting tower, château hotel, library, gallery, cathedral, city hall, flatiron, geodesic dome (#268) | ✗ | ◐ collectibles only | ✗ | **In progress** |

What the table does not show: the three midtown districts have no names in
`plan.ts` yet, and naming them is part of taking each one on. The collectibles
and breakables counted as "partly" are the generator's, placed along whatever
roads exist today, not chosen for the area.

## What the rebuild should include

Decided 2026-09-27 from the gameplay review
(`docs/research/nfs-most-wanted-2012-gameplay.md`), as things the map as a whole
has to end up with. Each lands in whichever area it belongs to:

- **A railway corridor alongside the freeway**, drivable, as an escape route
  and a shortcut. In the recording it was the whole of one escape: off the
  freeway past a roadblock, then along the tracks, through a tunnel and over a
  bridge.
- **A covered stretch of freeway downtown**, under a deck or through the city,
  where the pursuit's line of sight keeps breaking (five breaks in a minute in
  the recording). Downtown is last, so this is recorded for then.
- **Off-road shortcuts with jumps**, one or more per area, that race routes use
  (jumps exist since #307).
- **Security gates that guard shortcuts**, so smashing one opens a way through
  (an alley, a yard, an off-road link) rather than standing along a road.
- **More collectibles**, toward the reference's scale (123 cars to find, 66
  speed cameras, 135 gates, 156 billboards), placed by the density of each area
  (#266) rather than spread evenly along roads.
- **Event routes laid for pace** (ADR-0011), and shared between cars' events
  (`docs/design/02_events_per_car.md`).

## Order

The places came first, then the parks and Midtown north, all done by
2026-10-01. What is left, in the order agreed with the owner on 2026-10-01,
each audited with the owner's answers on its issue:

1. **Midtown south** (#487): a waterfront strip, streets under the freeway
   deck, a sprint along the bank, a repair shop. Done, signed off by the
   owner on 2026-10-01.
2. **Midtown south-west** (#488): a main street from downtown's edge to
   Tidewater Park, and a sprint down it. Done, approved by the owner on 2026-10-01.
3. **Industrial** (#489): heavy industry with open yards, and a circuit; the
   first stretch of the railway beside the freeway (#514). Done, approved
   by the owner on 2026-10-01.

4. **Ashford Point** (#293), unparked by the owner: affluent estates off
   winding lanes, a coast sprint and a circuit. Done, approved by the owner
   on 2026-10-01.

Downtown is last.
