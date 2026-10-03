/**
 * Procedural weathering for the photo surfaces (#581, `?look=materials`).
 *
 * A tiling photo repeats and is the same everywhere; weathering is what says a
 * wall has stood in a city. It is computed in the fragment shader from world
 * position alone, so it needs no texture, no UVs and nothing from the sim, and
 * a wall is as dirty at its base on every instance whatever the model.
 *
 * Two pieces, both chunks of GLSL spliced in by `triplanar` and `worldUvs`:
 *
 * - walls: grime that gathers where a wall meets the ground and thins out
 *   upwards, and rain streaks running down from above. Heights are measured
 *   from the instance's own origin (a set piece stands on y = 0 locally), so no
 *   ground lookup is needed.
 * - roads: wheel tracks. Traffic polishes two paths a car's track apart in each
 *   lane and drips oil down the lane's middle; both read as a slightly darker,
 *   smoother stripe on the carriageway.
 *
 * Distances are in metres in the GLSL (`uMetre` converts), so a number here
 * means what it says.
 */

/** Cheap hash value noise, 2D. Shared by both pieces. */
export const WEATHER_NOISE = /* glsl */ `
  float weatherHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float weatherNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(weatherHash(i), weatherHash(i + vec2(1.0, 0.0)), f.x),
      mix(weatherHash(i + vec2(0.0, 1.0)), weatherHash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }`;

/**
 * Wall dirt. `heightM` is metres above the wall's base, `along` the world
 * coordinate running along the wall in metres. Returns x = base grime,
 * y = streak, both 0..1.
 */
export const WALL_WEATHER = /* glsl */ `
  vec2 wallWeather(float heightM, float along) {
    // Splash and damp: thick to about a metre, ragged, gone by two and a half.
    float ragged = weatherNoise(vec2(along * 1.7, heightM * 0.9)) - 0.5;
    float grime = 1.0 - smoothstep(0.3, 3.2, heightM + ragged * 1.6);
    // Rain: long vertical runs, narrow across and stretched down the wall,
    // strongest under whatever the water ran off.
    float run = weatherNoise(vec2(along * 3.1, heightM * 0.12));
    float streak = smoothstep(0.62, 0.92, run) * (0.35 + 0.65 * weatherNoise(vec2(along * 0.4, 7.0)));
    return vec2(grime, streak);
  }`;

/**
 * Road wear. `acrossM` is metres from the carriageway's middle, `widthM` its
 * width, `at` the world position in metres (the noise is read there, not off
 * the piece, so it carries across the joins between a road's pieces). Returns x = darkening, y = polish.
 * Lanes are half the width each; a car's wheel paths sit 0.8 m either side of
 * its lane's centre, and the oil drip down the lane's middle.
 */
export const ROAD_WEATHER = /* glsl */ `
  vec2 roadWeather(float acrossM, float widthM, vec2 at) {
    float lane = widthM * 0.25;
    float fromLane = abs(abs(acrossM) - lane);
    float path = 1.0 - smoothstep(0.12, 0.5, abs(fromLane - 0.8));
    // Worn unevenly: traffic is not a ruler.
    float patchy = 0.55 + 0.45 * weatherNoise(at * 0.35);
    float oil = (1.0 - smoothstep(0.0, 0.3, fromLane)) * weatherNoise(at * 0.9);
    return vec2(path * patchy * 0.35 + oil * 0.3, path * patchy);
  }`;
