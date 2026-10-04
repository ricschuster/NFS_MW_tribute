/**
 * Look-development switches (#579, part of #11).
 *
 * Each phase of the look (lighting, materials, trees, the building kit) lands
 * behind one of these, off until signed off, so `cityshot` and `looktime` can render
 * the city with and without it and a before/after is one flag away. A switch
 * that has not been built yet is accepted and does nothing: the vocabulary is
 * fixed up front so a contact sheet recorded today still means the same thing
 * when the feature arrives.
 *
 * Once a feature is signed off it stops being a switch and becomes the look;
 * delete its name here in the same change.
 *
 * Read by the renderer only. Nothing in the sim or `city/` may look at this.
 */
export const LOOK_SWITCHES = ['env', 'pbr', 'materials', 'trees', 'particles', 'clutter', 'buildings', 'models'] as const;

export type LookSwitch = (typeof LOOK_SWITCHES)[number];

/** The set of switches that are on. */
export type Look = ReadonlySet<LookSwitch>;

export const NO_LOOK: Look = new Set();

/**
 * What a player gets with no query string: every switch the owner has signed off.
 * `models` (authored car bodies, #584) has not been.
 */
export const DEFAULT_LOOK: Look = new Set(LOOK_SWITCHES.filter((name) => name !== 'models'));

/**
 * No `?look` is the default look (all of it, signed off 2026-10-03);
 * `?look=none` is the plain city, for a before/after. `?look=env,pbr` picks
 * switches by name. An unknown name is ignored rather than
 * thrown on: this is a developer's query string, and a typo should give the
 * plain city, not a blank page.
 */
export function parseLook(value: string | null): Look {
  if (!value) return DEFAULT_LOOK;
  if (value === 'none') return NO_LOOK;
  if (value === 'all') return new Set(LOOK_SWITCHES);
  const on = new Set<LookSwitch>();
  for (const name of value.split(',')) {
    const found = LOOK_SWITCHES.find((s) => s === name.trim());
    if (found) on.add(found);
  }
  return on;
}
