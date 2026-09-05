/**
 * The number the HUD shows at top speed.
 *
 * Its own module because two HUDs now need it - the Canvas game's and the
 * city's - and the alternative is one importing the other's presentation code,
 * or the constant quietly drifting apart in two places.
 */
export const DISPLAY_MAX_KMH = 320;
