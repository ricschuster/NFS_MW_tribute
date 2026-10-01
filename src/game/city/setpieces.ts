import { UNITS_PER_METRE } from '../constants';
import { MARROW_PROPS } from './marrowprops';
import { groundAt } from './terrain';
import type { Terrain } from './terrain';
import type { AuthoredProp, Breakable, Jump, JumpKind, SetPiece, SetPieceKind, Vec2 } from './types';

const M = UNITS_PER_METRE;

/**
 * What a set piece is solid as, in metres in its own frame: `u` across,
 * `v` along its heading, and `y0`..`y1` from the ground it stands on. A box
 * `w` by `l`, or a post of radius `r`.
 *
 * Deliberately less than what is drawn, and never more. A cargo plane is its
 * fuselage and, four and a half metres up, its wing: high enough to drive
 * under, low enough to catch a jump that came up short (#307). A hanging
 * fuselage is its posts and, overhead, its hull; a tree is its trunk and the
 * middle of its crown. What a car can hit should be what it looks like it
 * would hit.
 */
type Solid = { u: number; v: number; y0: number; y1: number } & ({ w: number; l: number } | { r: number });

const post = (u: number, v: number, r: number, y1: number): Solid => ({ u, v, r, y0: 0, y1 });

/**
 * A solid made `k` times bigger. The working quarry's plant is drawn at a
 * multiple of its real size (#323): a car in this game is 4.8 m across, so a
 * haul truck at 6.5 m is barely a bigger thing than the car is, and the
 * machinery has to read as machinery.
 */
const grown = (solids: Solid[], k: number): Solid[] =>
  solids.map((s) =>
    'r' in s
      ? { u: s.u * k, v: s.v * k, r: s.r * k, y0: s.y0 * k, y1: s.y1 * k }
      : { u: s.u * k, v: s.v * k, w: s.w * k, l: s.l * k, y0: s.y0 * k, y1: s.y1 * k },
  );

/** How much bigger than life Kestrel Head's buildings are drawn (#454). */
export const PALAS_GROWN = 1.6;
export const CHAPEL_GROWN = 2;
export const HOUSE_GROWN = 1.6;
/**
 * Downtown's office tower (#268), in game metres: one footprint, and a height
 * for each look, so a skyline steps down from the 180 m lookout tower
 * through these (the owner's skyline, 55-130 m).
 */
export const TOWER = { w: 30, l: 30 };
export const TOWER_HEIGHTS: Record<string, number> = {
  'glass-low': 58,
  glass: 88,
  'glass-tall': 126,
  stone: 70,
  'stone-tall': 104,
  deco: 118,
};
/**
 * How far a warehouse's walls run below the ground at its middle (#489). A
 * set piece stands at the height under its centre, and a 130 m shed across a
 * rise of a few metres has its downhill end in the air; Industrial's ground
 * rolls, and holding every shed to dead-flat ground left the works one shed.
 * Below the ground the walls are simply buried, so a fall of up to twice this
 * across a shed is hidden.
 */
export const WAREHOUSE_FOOTING = 3;
/**
 * An estate house's plinth (#293), in model metres before `HOUSE_GROWN`:
 * Ashford Point is hillier than the midtowns and a villa or a manor is wider
 * than a house, so they stand on a footing the way the sheds do (#516)
 * rather than being left off every slope a suburb house would be.
 */
export const ESTATE_FOOTING = 2;

export const SET_PIECE_SOLIDS: Record<SetPieceKind, Solid[]> = {
  'plane-belly': [
    { u: 0, v: 0, w: 4.4, l: 30, y0: 0, y1: 4.4 },
    { u: 0, v: 2, w: 32, l: 4, y0: 4.45, y1: 4.95 },
    { u: 0, v: -15.5, w: 0.4, l: 3.6, y0: 3.5, y1: 9 },
  ],
  'plane-nose': [{ u: 0, v: 3, w: 4, l: 10, y0: 0, y1: 7 }],
  fuselage: [{ u: 0, v: 0, w: 4, l: 18, y0: 0, y1: 3.8 }],
  'fuselage-hung': [
    post(-3.5, -7.3, 0.4, 8.5),
    post(3.5, -7.3, 0.4, 8.5),
    post(-3.5, 7.3, 0.4, 8.5),
    post(3.5, 7.3, 0.4, 8.5),
    { u: 0, v: 0, w: 4, l: 22, y0: 3.8, y1: 7.8 },
  ],
  helicopter: [{ u: 0, v: 1.5, w: 2.6, l: 6, y0: 0, y1: 3 }],
  silo: [post(0, 0, 4, 18.6)],
  'water-tower': [
    post(-3.5, -3.5, 0.4, 14.5),
    post(3.5, -3.5, 0.4, 14.5),
    post(-3.5, 3.5, 0.4, 14.5),
    post(3.5, 3.5, 0.4, 14.5),
    { u: 0, v: 0, r: 4.3, y0: 14.45, y1: 22 },
  ],
  crane: [
    { u: 0, v: 0, w: 6, l: 6, y0: 0, y1: 1 },
    { u: 0, v: 0, w: 1.6, l: 1.6, y0: 0, y1: 25.6 },
    { u: 0, v: 12, w: 1.2, l: 30, y0: 24.4, y1: 25.6 },
  ],
  mast: [
    { u: 0, v: 0, w: 4, l: 4, y0: 0, y1: 1 },
    { u: 0, v: 0, w: 1.6, l: 1.6, y0: 0, y1: 31 },
  ],
  bunker: [{ u: 0, v: 0, w: 12, l: 8, y0: 0, y1: 3.6 }],
  'blast-wall': [{ u: 0, v: 0, w: 6, l: 2.4, y0: 0, y1: 3.9 }],
  shed: [{ u: 0, v: 0, w: 9, l: 14, y0: 0, y1: 7.4 }],
  cone: [],
  tree: [post(0, 0, 0.6, 3), { u: 0, v: 0, r: 2, y0: 3, y1: 11.6 }],
  // A heap is a cone and a solid is not, so this is the part of it a car can
  // not drive up: the steep core, narrower than the skirt that is drawn.
  stockpile: grown([post(0, 0, 6, 7)], 2),
  // Legs only. The belt is eight metres up at its low end, which is over a car.
  conveyor: grown([post(0, -20, 0.6, 4), post(0, -7, 0.6, 8.5), post(0, 6, 0.6, 13), post(0, 19, 0.6, 17.5)], 2),
  'haul-truck': grown([{ u: 0, v: 0, w: 6.4, l: 10, y0: 0, y1: 4.9 }], 2.5),
  excavator: grown([{ u: 0, v: 0.5, w: 3.8, l: 8, y0: 0, y1: 4.2 }], 2.5),
  cabin: grown([{ u: 0, v: 0, w: 3.2, l: 8.4, y0: 0, y1: 2.9 }], 1.8),
  crusher: grown([{ u: 0, v: 0, w: 8, l: 8, y0: 0, y1: 9 }], 2),
  rubble: grown([post(0, 0, 2, 1.5)], 3),
  // Sablet Wharf's container port (#410), at real size. A block is a row of
  // forty-foot containers stacked two to four high (`VARIANT_SOLIDS`); a
  // ship-to-shore crane is solid at its legs, which stand either side of the
  // quay road so the road runs under it, and at its portal overhead.
  'container-block': [{ u: 0, v: 0, w: 30, l: 12.5, y0: 0, y1: 5.2 }],
  'sts-crane': [
    post(-14, -12, 0.8, 38),
    post(14, -12, 0.8, 38),
    post(-14, 12, 0.8, 38),
    post(14, 12, 0.8, 38),
    { u: 0, v: 0, w: 30, l: 26, y0: 36, y1: 40 },
  ],
  // From its footing (`WAREHOUSE_FOOTING`, below), so the downhill end of a
  // shed on a slope is wall to a car and not a gap under it.
  warehouse: [{ u: 0, v: 0, w: 50, l: 130, y0: -WAREHOUSE_FOOTING, y1: 14 }],
  // Legs a car cannot fit between, and the frame fifteen metres up.
  'straddle-carrier': [post(-2.2, -4.2, 0.4, 15), post(2.2, -4.2, 0.4, 15), post(-2.2, 4.2, 0.4, 15), post(2.2, 4.2, 0.4, 15)],
  'reach-stacker': [{ u: 0, v: 0, w: 4.5, l: 11, y0: 0, y1: 3.6 }],
  // Kestrel Head's old fort (#454). A wall is solid to its height, whole or
  // broken down (`VARIANT_SOLIDS`); a gate is its two towers and the arch over
  // the road, high enough to drive under; a bastion is the angled platform at
  // a corner.
  rampart: [{ u: 0, v: 0, w: 3, l: 20, y0: 0, y1: 6 }],
  bastion: [post(0, 0, 9, 7)],
  'fort-gate': [
    { u: -13, v: 0, w: 5, l: 8, y0: 0, y1: 11 },
    { u: 13, v: 0, w: 5, l: 8, y0: 0, y1: 11 },
    { u: 0, v: 0, w: 31, l: 8, y0: 8, y1: 11 },
  ],
  'signal-tower': [post(0, 0, 4.6, 20)],
  cannon: [{ u: 0, v: 0, w: 2, l: 4, y0: 0, y1: 1.4 }],
  // The castle it became (#454): a keep, the hall and the chapel of the inner
  // castle, towers on the curtain wall, and the outbuildings of the bailey. A
  // roofless building is solid at its walls, not across its floor, but there
  // is no way in, so it is solid as a box. The buildings are grown like the
  // quarry's plant, and by the same amounts as their models: at real size a
  // chapel was hardly taller than the wall round it.
  keep: [post(0, 0, 7.4, 30)],
  palas: grown([{ u: 0, v: 0, w: 16, l: 34, y0: 0, y1: 12 }], PALAS_GROWN),
  chapel: grown([{ u: 0, v: 0, w: 10, l: 18, y0: 0, y1: 9 }, post(0, 9, 5, 7)], CHAPEL_GROWN),
  'wall-tower': [post(0, 0, 5, 14)],
  'ruin-house': grown([{ u: 0, v: 0, w: 12, l: 24, y0: 0, y1: 4.5 }], HOUSE_GROWN),
  // Ruin clutter (#454): a fallen stretch of dressed stone, and a well.
  masonry: grown([{ u: 0, v: 0, w: 4, l: 7, y0: 0, y1: 1.4 }], 2),
  well: [post(0, 0, 2.4, 3.4)],
  // Highmoor Park's furniture (#460), grown like the quarry's plant so a
  // table reads as one beside a car 4.8 m across.
  'picnic-table': grown([{ u: 0, v: 0, w: 1.8, l: 2.2, y0: 0, y1: 0.8 }], 2),
  bench: grown([{ u: 0, v: 0, w: 0.6, l: 1.8, y0: 0, y1: 0.9 }], 2),
  telescope: [post(0, 0, 0.5, 2.6)],
  // Tidewater Park's buildings (#461), grown by the same amount as the castle's
  // houses. A bandstand is solid at its platform, which is too high to drive
  // onto, and at its roof, which is over a car; between them it is open.
  bandstand: grown([post(0, 0, 4.4, 1.1), { u: 0, v: 0, r: 4.8, y0: 3.8, y1: 5.6 }], HOUSE_GROWN),
  'toilet-block': grown([{ u: 0, v: 0, w: 5, l: 8, y0: 0, y1: 3.2 }], HOUSE_GROWN),
  cafe: grown([{ u: 0, v: 0, w: 7, l: 12, y0: 0, y1: 3.8 }], HOUSE_GROWN),
  // Midtown north's suburb (#477): a house and a low apartment block, solid
  // as boxes to their eaves, at the sizes in `suburb.ts`.
  house: grown([{ u: 0, v: 0, w: 10, l: 12, y0: 0, y1: 5.5 }], HOUSE_GROWN),
  apartment: grown([{ u: 0, v: 0, w: 24, l: 12, y0: 0, y1: 9.6 }], HOUSE_GROWN),
  // Midtown south-west's high street (#488): a shop with two floors of flats
  // over it, and a four-storey block of flats, solid to their parapets.
  shop: grown([{ u: 0, v: 0, w: 8, l: 12, y0: 0, y1: 10.4 }], HOUSE_GROWN),
  flat: grown([{ u: 0, v: 0, w: 16, l: 12, y0: 0, y1: 13 }], HOUSE_GROWN),
  // Ashford Point's estates (#293), a size and two sizes up from a house: a
  // villa and its garage, and a manor's main block with two wings forward
  // round a forecourt, each from its footing.
  villa: grown(
    [
      { u: -3, v: 0, w: 15, l: 12, y0: -ESTATE_FOOTING, y1: 7 },
      { u: 7.5, v: 2.5, w: 6, l: 7, y0: -ESTATE_FOOTING, y1: 3.6 },
    ],
    HOUSE_GROWN,
  ),
  manor: grown(
    [
      { u: 0, v: -4, w: 30, l: 14, y0: -ESTATE_FOOTING, y1: 10 },
      { u: -11, v: 5, w: 8, l: 12, y0: -ESTATE_FOOTING, y1: 8 },
      { u: 11, v: 5, w: 8, l: 12, y0: -ESTATE_FOOTING, y1: 8 },
    ],
    HOUSE_GROWN,
  ),
  // The works (#489), at real size. A chimney is its plinth and its stack; a
  // tank its drum; a gantry crane its four legs and the beam fourteen metres
  // up, so a car drives under it between the legs; rail track is ground, flat
  // and drivable; a wagon a box on the rails.
  chimney: [{ u: 0, v: 0, w: 7, l: 7, y0: 0, y1: 3 }, post(0, 0, 2, 45)],
  tank: [{ u: 0, v: 0, r: 14, y0: 0, y1: 14 }],
  gantry: [
    post(-16, -2.5, 0.8, 16),
    post(-16, 2.5, 0.8, 16),
    post(16, -2.5, 0.8, 16),
    post(16, 2.5, 0.8, 16),
    { u: 0, v: 0, w: 34, l: 3, y0: 14, y1: 17 },
  ],
  rails: [],
  wagon: [{ u: 0, v: 0, w: 3, l: 14, y0: 0, y1: 4.2 }],
  // Its front gardens and streets (#477): a hedge either side of the path to
  // the door, and a broadleaf street tree, solid only at its trunk.
  hedge: [{ u: -5, v: 0, w: 6, l: 1.2, y0: 0, y1: 1.3 }, { u: 5, v: 0, w: 6, l: 1.2, y0: 0, y1: 1.3 }],
  'street-tree': [post(0, 0, 0.5, 3), { u: 0, v: 0, r: 2.8, y0: 3.4, y1: 10 }],
  // Downtown (#268). Its old core is drawn at the high street's scale - a
  // townhouse, a warehouse loft and a mid-rise, real sizes grown by
  // `HOUSE_GROWN` - and its towers and landmarks in game metres, sized
  // against each other and against the 4.8 m car. Solid as the boxes and
  // circles that cover them; a car never reaches the parts above a roofline.
  townhouse: grown([{ u: 0, v: 0, w: 7, l: 12, y0: 0, y1: 15 }], HOUSE_GROWN),
  loft: grown([{ u: 0, v: 0, w: 22, l: 16, y0: 0, y1: 19 }], HOUSE_GROWN),
  midrise: grown([{ u: 0, v: 0, w: 20, l: 15, y0: 0, y1: 26 }], HOUSE_GROWN),
  tower: [{ u: 0, v: 0, w: TOWER.w, l: TOWER.l, y0: 0, y1: TOWER_HEIGHTS.glass }],
  'lookout-tower': [{ u: 0, v: 0, w: 32, l: 32, y0: 0, y1: 118 }, post(0, 0, 5.5, 166)],
  'twist-tower': [{ u: 0, v: 0, r: 18, y0: 0, y1: 150 }],
  'chateau-hotel': [{ u: 0, v: 0, w: 44, l: 32, y0: 0, y1: 42 }],
  stadium: [-20, 0, 20].map((u) => ({ u, v: 0, r: 95, y0: 0, y1: 38 })),
  library: [{ u: 0, v: 0, w: 80, l: 60, y0: 0, y1: 30 }],
  gallery: [{ u: 0, v: -3, w: 72, l: 42, y0: 0, y1: 22 }, { u: 0, v: 21, w: 36, l: 8, y0: 0, y1: 2 }],
  cathedral: [{ u: 0, v: -6, w: 26, l: 52, y0: 0, y1: 24 }, { u: 0, v: 26, w: 12, l: 12, y0: 0, y1: 40 }],
  'city-hall': [{ u: 0, v: 0, w: 76, l: 34, y0: 0, y1: 22 }],
  'cruise-terminal': [{ u: 0, v: 0, w: 56, l: 200, y0: 0, y1: 14 }],
  'geodesic-dome': [{ u: 0, v: 0, r: 24, y0: 0, y1: 46 }],
  flatiron: [{ u: 0, v: -11, w: 26, l: 22, y0: 0, y1: 34 }, { u: 0, v: 11, w: 14, l: 22, y0: 0, y1: 34 }],
};

/**
 * Where a kind's look changes its size, the solids for that look: a container
 * block four high is twice the height of one two high, and a small warehouse
 * is not a large one.
 */
const VARIANT_SOLIDS: Record<string, Solid[]> = {
  'container-block:three high': [{ u: 0, v: 0, w: 30, l: 12.5, y0: 0, y1: 7.8 }],
  'container-block:four high': [{ u: 0, v: 0, w: 30, l: 12.5, y0: 0, y1: 10.4 }],
  'warehouse:small': [{ u: 0, v: 0, w: 30, l: 60, y0: -WAREHOUSE_FOOTING, y1: 10 }],
  'rampart:broken': [{ u: 0, v: 0, w: 3, l: 20, y0: 0, y1: 3.2 }],
  'ruin-house:small': grown([{ u: 0, v: 0, w: 8, l: 12, y0: 0, y1: 4.5 }], HOUSE_GROWN),
  'tank:small': [{ u: 0, v: 0, r: 7, y0: 0, y1: 10 }],
  ...Object.fromEntries(Object.entries(TOWER_HEIGHTS).map(([v, h]) => [`tower:${v}`, [{ u: 0, v: 0, w: TOWER.w, l: TOWER.l, y0: 0, y1: h }]])),
};

/** What this piece is solid as. */
export const solidsOf = (piece: Pick<SetPiece, 'kind' | 'variant'>): Solid[] =>
  (piece.variant && VARIANT_SOLIDS[`${piece.kind}:${piece.variant}`]) || SET_PIECE_SOLIDS[piece.kind];

/** Where a hand-placed thing stands, before it is given an id. */
export interface Placed {
  at: Vec2;
  y: number;
  angle: number;
}

/** The editor's names for the kinds of jump. */
const JUMP_VARIANTS: Record<string, JumpKind> = {
  'built ramp': 'ramp',
  'grass mound': 'mound',
  'lifted slab': 'slab',
};

/**
 * How far a set piece's solid parts can reach from its centre, in metres. A
 * large warehouse, 50 m by 130 m, reaches 70 m to a corner.
 */
const SOLID_REACH = 70;

/**
 * Marrow Field's hand-placed props (#295), as city data.
 *
 * Gates and stacks join the breakables that already exist, numbered on from
 * `firstId` so a smashed one is remembered by the same id the sim uses for
 * every other. Jumps become `Jump`s (#307), their kind read off the variant
 * the editor saved; billboards are handed back as positions, for `generate.ts`
 * to number after the generated ones. The rest are set pieces, sat on the ground where they
 * were placed.
 */
export function airfieldProps(
  terrain: Terrain,
  firstId: number,
  props: readonly AuthoredProp[] = MARROW_PROPS,
): { pieces: SetPiece[]; breakables: Breakable[]; jumps: Jump[]; billboards: Placed[] } {
  const pieces: SetPiece[] = [];
  const jumps: Jump[] = [];
  const billboards: Placed[] = [];
  const breakables: Breakable[] = [];
  let id = firstId;
  for (const prop of props) {
    const at = { x: prop.x * M, z: prop.z * M };
    const y = groundAt(terrain, at.x, at.z);
    if (prop.kind === 'billboard') {
      billboards.push({ at, y, angle: prop.angle });
      continue;
    }
    if (prop.kind === 'jump') {
      jumps.push({ kind: JUMP_VARIANTS[prop.variant ?? ''] ?? 'ramp', at, y, angle: prop.angle });
      continue;
    }
    if (prop.kind === 'gate' || prop.kind === 'stack') {
      // The same half-widths `breakablesFor` gives its own, except that a gate
      // placed in the editor was sized to the road it was snapped across.
      const half = prop.kind === 'gate' ? ((prop.w ?? 12) / 2) * M : 2.2 * M;
      breakables.push({ id: id++, kind: prop.kind, at, y, angle: prop.angle, half, placed: true });
      continue;
    }
    pieces.push({ kind: prop.kind, at, y, angle: prop.angle, ...(prop.variant ? { variant: prop.variant } : {}) });
  }
  return { pieces, breakables, jumps, billboards };
}

/**
 * Does a car of `radius` and `height`, standing at (`x`, `z`) with its wheels
 * at `y`, touch a set piece's solid parts? Only where the two overlap in
 * height as well as on the map, so a car can pass under a wing on the ground
 * and over a fuselage in the air.
 */
export function hitsSetPiece(
  pieces: readonly SetPiece[],
  x: number,
  z: number,
  y: number,
  radius: number,
  height: number,
): boolean {
  const reach = SOLID_REACH * M + radius;
  for (const piece of pieces) {
    const dx = x - piece.at.x;
    const dz = z - piece.at.z;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const s = Math.sin(piece.angle);
    const c = Math.cos(piece.angle);
    // Into the piece's own frame: `v` along its heading, `u` across it, in
    // metres - the same frame the editor draws and `SET_PIECE_SOLIDS` uses.
    const v = (dx * s + dz * c) / M;
    const u = (dx * c - dz * s) / M;
    const r = radius / M;
    const bottom = (y - piece.y) / M;
    const top = bottom + height / M;
    for (const solid of solidsOf(piece)) {
      if (top < solid.y0 || bottom > solid.y1) continue;
      if ('r' in solid) {
        if (Math.hypot(u - solid.u, v - solid.v) < solid.r + r) return true;
        continue;
      }
      const nu = Math.max(solid.u - solid.w / 2, Math.min(u, solid.u + solid.w / 2));
      const nv = Math.max(solid.v - solid.l / 2, Math.min(v, solid.v + solid.l / 2));
      if (Math.hypot(u - nu, v - nv) < r) return true;
    }
  }
  return false;
}
