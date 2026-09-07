/**
 * What everything on the maps means (#181, #215).
 *
 * Here rather than inside `hud.ts` for one reason: #181 set a rule - **no two
 * things share a colour *and* a shape** - and a rule nothing checks is a rule
 * that quietly stops being true. It did: cyan came to mean a parked car, a race
 * route, an event start and the place you said you were going, and a playtester
 * read the first cyan row, concluded cyan meant parked cars, and could not find
 * the events. `legend.test.ts` asserts the rule against this table.
 *
 * Reading the palette as families rather than as fifteen colours:
 *
 * - **white** is you, and what the police have put in the road.
 * - **blue** is a police car; **red** is one that comes at you head on, and
 *   the ambushes that are the same fight on purpose.
 * - **green** is help - the workshops.
 * - **cyan** is navigation: where the events are and where you said you were
 *   going. Orange stands in for cyan on a route that is a sprint.
 * - **amber** is worth points - billboards and speed cameras.
 * - **violet** is the interstate and the ramps that are the only way onto it.
 * - **pink** is a car waiting to be taken.
 *
 * White carries three: you, what the police laid in the road, and the cars you
 * are racing. That is the cap, and it is only tolerable because the last of
 * them exists for the two minutes an event lasts and the first is a ring rather
 * than a dot.
 */
export type LegendShape = 'dot' | 'line' | 'cross' | 'ring' | 'target';

/** Anything the police have laid across the road. */
export const HAZARD = '#ffffff';

/** A car still parked out there, on both maps. */
export const FIND_COLOUR = '#ff6ec7';

export const MAP_LEGEND: [string, string, LegendShape][] = [
  ['you', '#ffffff', 'ring'],
  ['police', '#4d8bff', 'dot'],
  ['Enforcer - comes head on', '#ff5a45', 'dot'],
  ['roadblock or spikes', HAZARD, 'line'],
  ['they are searching here', 'rgba(255, 210, 90, 0.85)', 'ring'],
  ['repair shop - drive through', '#5adc82', 'cross'],
  ['car parked - go and take it', FIND_COLOUR, 'dot'],
  ['billboard', '#ff9f45', 'dot'],
  ['speed camera', '#ffd166', 'dot'],
  ['ambush - number is the heat', '#ff5a45', 'ring'],
  ['race route; orange = sprint', '#7fe3ff', 'line'],
  ['event start - press ENTER', '#7fe3ff', 'target'],
  ['a rival, during a race', '#ffffff', 'dot'],
  ['interstate', 'rgba(200, 135, 214, 0.75)', 'line'],
  ['ramp - the only way up', '#e6b3ff', 'line'],
  ['where you said to go', '#7fe3ff', 'ring'],
];
