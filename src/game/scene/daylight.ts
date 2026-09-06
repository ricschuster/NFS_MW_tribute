/**
 * What the sky is doing at this hour (#180, #11).
 *
 * A pure function of the clock and nothing else, so it can be tested without a
 * renderer and so the values can be read at a glance rather than reverse
 * engineered from three lights. `cityview` applies it; this decides it.
 *
 * The palette is keyed at the hours that matter and interpolated between them:
 * deep night, first light, sunrise, full day, the long golden afternoon,
 * sunset, dusk, night again. Everything about the look of a time of day is in
 * this table, which makes it content rather than code - the same argument
 * `rep.ts`'s award table and `radio.ts`'s lines make.
 *
 * The daylight row is exactly what #75 tuned by hand and shipped, so midday
 * looks like the game has always looked and every screenshot in the repo still
 * matches: this adds the other twenty hours rather than changing the one that
 * was already right.
 *
 * Night is *moonlit*, not dark, and the first version of it was not: the
 * screenshot was a black rectangle with two tail lights in it. A city you
 * cannot see is not a time of day, it is a fault. The fill carries almost all
 * of it - a hard moon would throw the same hard shadows as the sun and read as
 * a badly lit afternoon.
 */
export interface Daylight {
  /** Directional sun: colour, strength, and where it is in the sky. */
  sun: string;
  sunStrength: number;
  /** 0 at the horizon, 1 straight overhead. */
  sunHeight: number;
  /** Which way round the compass it is, in radians. */
  sunBearing: number;
  /** Hemisphere fill: the sky half, the bounce off the ground, and how much. */
  fill: string;
  bounce: string;
  fillStrength: number;
  /** The dome overhead and the band at the horizon, which is also the fog. */
  skyTop: string;
  haze: string;
  /** How lit the street lamps and the windows are, 0 by day and 1 at night. */
  lamps: number;
}

interface Key extends Daylight {
  hour: number;
}

const KEYS: Key[] = [
  {
    hour: 0,
    sun: '#6d80b4',
    sunStrength: 0.85,
    sunHeight: 0.5,
    sunBearing: 2.6,
    fill: '#4d5f8a',
    bounce: '#2b303c',
    fillStrength: 1.5,
    skyTop: '#080f22',
    haze: '#16203a',
    lamps: 1,
  },
  {
    hour: 5,
    sun: '#8189b0',
    sunStrength: 0.95,
    sunHeight: 0.08,
    sunBearing: 1.9,
    fill: '#5a6486',
    bounce: '#33343c',
    fillStrength: 1.5,
    skyTop: '#132244',
    haze: '#33344a',
    lamps: 1,
  },
  {
    // Sunrise: a low hard orange sun and long shadows, which is the one hour
    // a city of boxes looks like something other than a city of boxes.
    hour: 7,
    sun: '#ffb072',
    sunStrength: 2.2,
    sunHeight: 0.12,
    sunBearing: 1.6,
    fill: '#cfd8ee',
    bounce: '#7d6a55',
    fillStrength: 1.1,
    skyTop: '#5b83c0',
    haze: '#e8b48c',
    lamps: 0.35,
  },
  {
    hour: 10,
    sun: '#fff0cf',
    sunStrength: 3.1,
    sunHeight: 0.6,
    sunBearing: 0.9,
    fill: '#dcefff',
    bounce: '#a2937c',
    fillStrength: 1.35,
    skyTop: '#3f7fd0',
    haze: '#cfe0ee',
    lamps: 0,
  },
  {
    // Noon, and these are #75's shipped numbers to the letter.
    hour: 13,
    sun: '#fff0cf',
    sunStrength: 3.3,
    sunHeight: 0.78,
    sunBearing: 0.6,
    fill: '#dcefff',
    bounce: '#a2937c',
    fillStrength: 1.4,
    skyTop: '#3f7fd0',
    haze: '#cfe0ee',
    lamps: 0,
  },
  {
    hour: 17,
    sun: '#ffe0ad',
    sunStrength: 2.9,
    sunHeight: 0.35,
    sunBearing: -0.4,
    fill: '#d6e6ff',
    bounce: '#a8907c',
    fillStrength: 1.2,
    skyTop: '#4a83c8',
    haze: '#dcd2c0',
    lamps: 0,
  },
  {
    // Sunset. The haze goes warm before the sky does, which is why a city at
    // this hour reads orange at the horizon and still blue overhead.
    hour: 19,
    sun: '#ff9455',
    sunStrength: 2,
    sunHeight: 0.1,
    sunBearing: -1.2,
    fill: '#b9c8e8',
    bounce: '#8a6a4e',
    fillStrength: 1,
    skyTop: '#2f5aa0',
    haze: '#e0895a',
    lamps: 0.45,
  },
  {
    hour: 21,
    sun: '#7182b2',
    sunStrength: 0.95,
    sunHeight: 0.3,
    sunBearing: -2,
    fill: '#526488',
    bounce: '#2d323e',
    fillStrength: 1.5,
    skyTop: '#0b1a34',
    haze: '#2a3048',
    lamps: 1,
  },
  {
    hour: 24,
    sun: '#6d80b4',
    sunStrength: 0.85,
    sunHeight: 0.5,
    sunBearing: 2.6,
    fill: '#4d5f8a',
    bounce: '#2b303c',
    fillStrength: 1.5,
    skyTop: '#080f22',
    haze: '#16203a',
    lamps: 1,
  },
];

/** Mix two `#rrggbb` strings. */
function mix(a: string, b: string, t: number): string {
  const parse = (c: string) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${to(ar + (br - ar) * t)}${to(ag + (bg - ag) * t)}${to(ab + (bb - ab) * t)}`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The light at this hour, interpolated between the keys either side of it. */
export function daylightAt(hour: number): Daylight {
  const at = ((hour % 24) + 24) % 24;
  let lo = KEYS[0];
  let hi = KEYS[KEYS.length - 1];
  for (let i = 1; i < KEYS.length; i++) {
    if (at > KEYS[i].hour) continue;
    lo = KEYS[i - 1];
    hi = KEYS[i];
    break;
  }
  const t = (at - lo.hour) / Math.max(1e-6, hi.hour - lo.hour);
  return {
    sun: mix(lo.sun, hi.sun, t),
    sunStrength: lerp(lo.sunStrength, hi.sunStrength, t),
    sunHeight: lerp(lo.sunHeight, hi.sunHeight, t),
    sunBearing: lerp(lo.sunBearing, hi.sunBearing, t),
    fill: mix(lo.fill, hi.fill, t),
    bounce: mix(lo.bounce, hi.bounce, t),
    fillStrength: lerp(lo.fillStrength, hi.fillStrength, t),
    skyTop: mix(lo.skyTop, hi.skyTop, t),
    haze: mix(lo.haze, hi.haze, t),
    lamps: lerp(lo.lamps, hi.lamps, t),
  };
}

/** `14.5` as `14:30`, for anything that shows the player the time. */
export function clockFace(hour: number): string {
  const at = ((hour % 24) + 24) % 24;
  const h = Math.floor(at);
  const m = Math.floor((at - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
