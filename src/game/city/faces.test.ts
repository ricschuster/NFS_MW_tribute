import { describe, expect, it } from 'vitest';
import { facesOf, faceCentre, inFace, subdivide, type Face } from './faces';
import { UNITS_PER_METRE } from '../constants';
import type { City, CityNode, CityRoad, Vec2 } from './types';

/**
 * Everything here is in **world units**, because `FACE_MIN_AREA` is: a square a
 * thousand units on a side is seven metres across and gets thrown out as the
 * sliver between two roads that nearly touch, which is what it is.
 */
const M = UNITS_PER_METRE;

/**
 * A graph built by hand, because the interesting cases here are shapes rather
 * than cities: a square, a square with a dead end in it, two squares sharing an
 * edge. Generating a city to test a planar walk would be testing the city.
 */
function graphOf(points: Vec2[], edges: [number, number][]): City {
  const nodes: CityNode[] = points.map((pos, id) => ({
    id,
    pos,
    y: 0,
    level: 'surface',
    roads: [],
  }));
  const roads: CityRoad[] = edges.map(([a, b], id) => ({
    id,
    a,
    b,
    class: 'street',
    district: 'midtown',
    width: 10,
    length: Math.hypot(points[b].x - points[a].x, points[b].z - points[a].z),
    speed: 10,
    lanes: 2,
    bridge: false,
  }));
  for (const road of roads) {
    nodes[road.a].roads.push(road.id);
    nodes[road.b].roads.push(road.id);
  }
  return { nodes, roads } as unknown as City;
}

const at = (x: number, z: number): Vec2 => ({ x: x * M, z: z * M });
/** 800 m a side: a city quarter rather than a block. */
const square = [at(0, 0), at(800, 0), at(800, 800), at(0, 800)];
const sqm = (metres: number) => metres * M * M * metres;

describe('the faces of a road network', () => {
  it('finds the one piece of ground a ring of roads encloses', () => {
    const city = graphOf(square, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
    const faces = facesOf(city);
    // One face, not two: the walk finds the inside and the outside, and the
    // outside is wound the other way and dropped.
    expect(faces).toHaveLength(1);
    expect(faces[0].area / (M * M)).toBeCloseTo(800 * 800, -2);
    expect(faces[0].poly).toHaveLength(4);
  });

  it('finds both when a road splits the ring in two', () => {
    const city = graphOf([...square, at(0, 400), at(800, 400)], [
      [0, 4],
      [4, 3],
      [1, 5],
      [5, 2],
      [2, 3],
      [0, 1],
      [4, 5],
    ]);
    const faces = facesOf(city);
    expect(faces).toHaveLength(2);
    for (const face of faces) expect(face.area / (M * M)).toBeCloseTo(800 * 400, -2);
  });

  it('does not count a cul-de-sac as a block', () => {
    // A dead end is walked down and back, so both its half-edges are in the
    // same face. That is correct - a cul-de-sac encloses nothing - and it means
    // a face can touch itself, which is the case that breaks a naive walk.
    const city = graphOf([...square, at(400, 400)], [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 4],
    ]);
    const faces = facesOf(city);
    expect(faces).toHaveLength(1);
    // The spur is walked out and back, so it is in the ring - and adds no area.
    expect(faces[0].area / (M * M)).toBeCloseTo(800 * 800, -2);
  });

  it('ignores the interstate, which is not on this plane', () => {
    // Two roads at one map position and different heights are two places (#85).
    // Treating them as crossing lines would invent a block from the gap.
    const city = graphOf(square, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
    city.nodes[2].level = 'elevated';
    expect(facesOf(city)).toHaveLength(0);
  });
});

describe('cutting a face into blocks', () => {
  const rng = { range: () => 0 };
  const face: Face = { poly: square, area: sqm(800), nodes: [] };

  it('leaves a small face alone', () => {
    const out = subdivide(face, sqm(1200), rng);
    expect(out.blocks).toHaveLength(1);
    expect(out.streets).toHaveLength(0);
  });

  it('keeps splitting until the pieces are block-sized, and every split is a street', () => {
    const out = subdivide(face, sqm(200), rng);
    expect(out.blocks.length).toBeGreaterThanOrEqual(8);
    // One street per cut, and a cut is what makes two pieces out of one.
    expect(out.streets).toHaveLength(out.blocks.length - 1);
    for (const block of out.blocks) {
      let area = 0;
      for (let i = 0, j = block.length - 1; i < block.length; j = i++) {
        area += (block[j].x - block[i].x) * (block[j].z + block[i].z);
      }
      expect(Math.abs(area / 2)).toBeLessThanOrEqual(sqm(200) * 1.001);
    }
  });

  it('loses no ground: the blocks are the face', () => {
    const out = subdivide(face, sqm(150), rng);
    const total = out.blocks.reduce((sum, block) => {
      let area = 0;
      for (let i = 0, j = block.length - 1; i < block.length; j = i++) {
        area += (block[j].x - block[i].x) * (block[j].z + block[i].z);
      }
      return sum + Math.abs(area / 2);
    }, 0);
    expect(total / (M * M)).toBeCloseTo(face.area / (M * M), -3);
  });

  it('cuts a long face across its length, not along it', () => {
    // The whole reason this reads as grown: the split is chosen by the shape of
    // the ground being split. A long thin quarter gets a street down its
    // length, so the *cut* runs across the short way.
    const long: Face = {
      poly: [at(0, 0), at(3200, 0), at(3200, 400), at(0, 400)],
      area: sqm(0) + 3200 * M * 400 * M,
      nodes: [],
    };
    const out = subdivide(long, 1600 * M * 400 * M, rng);
    const [a, b] = out.streets[0];
    expect(Math.abs(b.z - a.z)).toBeGreaterThan(Math.abs(b.x - a.x));
  });
});

describe('points and faces', () => {
  const face: Face = { poly: square, area: sqm(800), nodes: [] };

  it('puts the middle in the middle', () => {
    const centre = faceCentre(face);
    expect(centre.x / M).toBeCloseTo(400, 0);
    expect(centre.z / M).toBeCloseTo(400, 0);
  });

  it('knows what is inside it', () => {
    expect(inFace(face, at(400, 400))).toBe(true);
    expect(inFace(face, at(1200, 400))).toBe(false);
  });
});
