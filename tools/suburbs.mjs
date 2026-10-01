// The midtowns with houses on their streets (#477, #487): each one's place in
// the plan's list of midtowns, which has no names of its own there, and the
// files its props go through. One table for `housedraft`, `propexport` and
// `propsync`, so the next area is a row here rather than a branch in each.
export const SUBURBS = {
  midtown: {
    index: 2, name: 'Midtown north', issue: '#477',
    json: 'docs/midtown-props-edited.json', module: 'midtownprops', exportName: 'MIDTOWN_PROPS', prefix: 'midtown-',
    // The race whose line the editor draws over the area, if one runs through it.
    route: 'Marrow Field Run',
  },
  'midtown-south': {
    index: 1, name: 'Midtown south', issue: '#487',
    json: 'docs/midtown-south-props-edited.json', module: 'midtownsouthprops', exportName: 'MIDTOWN_SOUTH_PROPS', prefix: 'midtown-south-',
    route: 'Promenade Sprint',
  },
};

/** The suburb named by `--place`, or Midtown north when none is given. */
export function suburbFrom(argv) {
  const which = argv.includes('--place') ? argv[argv.indexOf('--place') + 1] : 'midtown';
  const suburb = SUBURBS[which];
  if (!suburb) throw new Error(`unknown suburb '${which}': ${Object.keys(SUBURBS).join(', ')}`);
  return { place: which, ...suburb };
}
