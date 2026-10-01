// The areas edited as districts of the plan rather than places: the midtowns
// with houses on their streets (#477, #487, #488) and Industrial (#489). Each
// one's place in the plan's list of its kind of district (`district`,
// midtown unless it says), which has no names of its own there, and the files
// its props go through. One table for `housedraft`, `propexport` and
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
  'midtown-sw': {
    index: 0, name: 'Midtown south-west', issue: '#488',
    json: 'docs/midtown-sw-props-edited.json', module: 'midtownswprops', exportName: 'MIDTOWN_SW_PROPS', prefix: 'midtown-sw-',
  },
  // The affluent enclave (#293): estates off winding lanes, the waterfront
  // district's only area. Its streets used to be grown by the game
  // (`localStreetsFor`), which left houses with no road near them.
  ashford: {
    district: 'waterfront', index: 0, name: 'Ashford Point', issue: '#293',
    json: 'docs/ashford-props-edited.json', module: 'ashfordprops', exportName: 'ASHFORD_PROPS', prefix: 'ashford-',
  },
  // Not a suburb: its works are placed by hand in the area editor, and
  // `housedraft` refuses it.
  industrial: {
    district: 'industrial', index: 0, name: 'Industrial', issue: '#489',
    // Its open yards (#489) are drawn in the editor and paved by the game
    // (`INDUSTRIAL_YARDS`, `city/yards.ts`); an area takes yards only once
    // the generator reads its module's yards.
    yards: true,
    json: 'docs/industrial-props-edited.json', module: 'industrialprops', exportName: 'INDUSTRIAL_PROPS', prefix: 'industrial-',
    route: 'Works Circuit',
  },
};

/** The suburb named by `--place`, or Midtown north when none is given. */
export function suburbFrom(argv) {
  const which = argv.includes('--place') ? argv[argv.indexOf('--place') + 1] : 'midtown';
  const suburb = SUBURBS[which];
  if (!suburb) throw new Error(`unknown suburb '${which}': ${Object.keys(SUBURBS).join(', ')}`);
  return { place: which, district: 'midtown', ...suburb };
}
