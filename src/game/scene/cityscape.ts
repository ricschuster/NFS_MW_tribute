import * as THREE from 'three';
import {
  asphaltTexture,
  dirtTexture,
  gravelTexture,
  BLOCK_TILE,
  blockTexture,
  disposeSurfaces,
} from './surfaces';
import { Rooftops } from './roofs';
import { worldUvs } from './worlduv';
import { railTrack } from './railtrack';
import { quarryGround } from './quarryground';
import { wharfGround } from './wharfground';
import { PLAN_PLACES } from '../city/plan';
import type { City, CityRoad, RoadSurface } from '../city/types';
import { groundAt } from '../city/terrain';
import {
  UNITS_PER_METRE,
  SEA_SHEET,
  PLACE_BLEND,
  QUARRY_BENCH,
  PILLAR_WIDTH,
  ROADBLOCK_MIN_WIDTH,
  TERRAIN_RENDER_STEP,
} from '../constants';
import { BoxBuildings, type BuildingProvider } from './buildings';
import { StreetFurniture } from './furniture';
import { CityCollectibles } from './collectibles';
import { CityBreakables } from './breakables';
import { CitySetPieces } from './setpieces';
import { CityJumps } from './jumps';
import { drivesFor } from './drives';
import { tunnelMeshes } from './tunnels';

const PAVEMENT_HEIGHT = 0.18 * UNITS_PER_METRE;
/** How far the tarmac sits above the bare ground. Enough to win the depth
 * test at range, far below the pavement kerb. */
const ROAD_LIFT = 0.02 * UNITS_PER_METRE;
/** How far under the water the drawn ground is allowed to go. */
const SHORE_FLOOR = -1.8 * UNITS_PER_METRE;
/** The most a road is drawn above the ground it is driven on (`roadBed`). */
const ROAD_BED_RAISE = 0.3 * UNITS_PER_METRE;
/**
 * How far a block's kerb reaches below its own top.
 *
 * It used to be exactly the pavement height, which was enough while the ground
 * was a plane at zero. On a slope the ground under one corner of a block is
 * metres below the middle, and a slab that stops at its own thickness leaves a
 * gap you can see the sky through. Deep enough to bury the worst corner of a
 * block on the steepest ground a block is allowed on.
 */
const BLOCK_FOOTING = 14 * UNITS_PER_METRE;
/** Metres of aggregate per texture tile. */
const ROAD_TILE = 6 * UNITS_PER_METRE;
/**
 * Water sits a little *above* the ground rather than below it, which is
 * backwards and deliberate. The road surface is the ground plane (see below),
 * so water under it is water you cannot see. A quarter of a metre is not
 * perceptible from a car and reads as water from the air; real banks arrive
 * with terrain in #85. The two bodies are a hair apart so the estuary, where
 * the river outline overlaps the bay, does not z-fight with itself.
 */
const WATER_LEVEL = -0.75 * UNITS_PER_METRE;
const WATER_STACK = 0.02 * UNITS_PER_METRE;
const BRIDGE_HEIGHT = 1.2 * UNITS_PER_METRE;
/** Just clear of the ground plane, so markings do not fight it for depth. */
const MARKING_LEVEL = 0.06 * UNITS_PER_METRE;
/** How far the open sea reaches past the map, so it always meets the horizon. */
const SEA_REACH = 40000 * UNITS_PER_METRE;
const DECK_THICKNESS = 1.1 * UNITS_PER_METRE;

/**
 * Turn a generated city into something to look at (#84).
 *
 * The road surface is not drawn. It does not need to be: the ground plane is
 * asphalt, and every block is a raised pavement slab standing on it, so the
 * gaps between the slabs are the carriageways - which is exactly what the
 * generator computed them to be. That avoids the one thing this would
 * otherwise fight, which is thousands of coplanar road quads z-fighting each
 * other at every junction.
 *
 * Everything here is geometry. What is *where* comes from the city, and no
 * decision about the city is made in this file.
 */
/** A stretch of a road's tarmac: its two ends on the centre line, and how far the right edge rises over the left. */
interface RoadPiece {
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  rise: number;
}

export class Cityscape {
  readonly group = new THREE.Group();

  private readonly provider: BuildingProvider;
  private readonly rooftops: Rooftops;
  private readonly furniture: StreetFurniture;
  /** Billboards and speed cameras (#93). Public: the sim smashes them. */
  readonly collectibles: CityCollectibles;
  /** Gates and stacks (#57). Public for the same reason. */
  readonly breakables: CityBreakables;
  readonly setPieces: CitySetPieces;
  readonly jumps: CityJumps;
  private readonly owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  /** Each road's tarmac pieces, built once (`piecesOf`). */
  private readonly pieces = new Map<CityRoad, RoadPiece[]>();

  constructor(city: City, provider: BuildingProvider = new BoxBuildings()) {
    this.provider = provider;

    this.group.add(this.sea(city));
    this.group.add(this.ground(city));
    for (const mesh of drivesFor(city)) {
      this.owned.push(mesh.geometry, mesh.material as THREE.Material);
      this.group.add(mesh);
    }
    for (const mesh of this.carriageways(city)) this.group.add(mesh);
    for (const mesh of this.railways(city)) this.group.add(mesh);
    for (const mesh of this.water(city)) this.group.add(mesh);
    for (const slab of this.pavements(city)) this.group.add(slab);
    this.group.add(this.markings(city));
    const bridges = this.bridges(city);
    if (bridges) this.group.add(bridges);
    for (const mesh of this.viaduct(city)) this.group.add(mesh);
    const tunnels = tunnelMeshes(city);
    this.owned.push(...tunnels.owned);
    for (const mesh of tunnels.meshes) this.group.add(mesh);
    for (const mesh of provider.build(city.buildings, (x, z) => this.groundUnder(city, x, z))) {
      this.group.add(mesh);
    }
    this.rooftops = new Rooftops(city.buildings);
    for (const mesh of this.rooftops.meshes) this.group.add(mesh);

    this.furniture = new StreetFurniture(city.furniture);
    for (const mesh of this.furniture.meshes) this.group.add(mesh);

    this.collectibles = new CityCollectibles(city.collectibles);
    for (const mesh of this.collectibles.meshes) this.group.add(mesh);

    this.breakables = new CityBreakables(city.breakables);
    for (const mesh of this.breakables.meshes) this.group.add(mesh);
    this.setPieces = new CitySetPieces(city.setPieces);
    for (const mesh of this.setPieces.meshes) this.group.add(mesh);
    this.jumps = new CityJumps(city.jumps);
    for (const mesh of this.jumps.meshes) this.group.add(mesh);
  }

  /**
   * Open sea, out past the horizon in every direction. The city sits on it as
   * an island, so the edge of the map is a coastline rather than the edge of a
   * sheet of asphalt hanging in the sky.
   */
  private sea(city: City): THREE.Mesh {
    const width = city.bounds.maxX - city.bounds.minX;
    const depth = city.bounds.maxZ - city.bounds.minZ;
    const geometry = new THREE.PlaneGeometry(
      width + SEA_REACH,
      depth + SEA_REACH,
    );
    const material = new THREE.MeshLambertMaterial({ color: '#1a4557' });
    this.owned.push(geometry, material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      (city.bounds.minX + city.bounds.maxX) / 2,
      SEA_SHEET,
      (city.bounds.minZ + city.bounds.maxZ) / 2,
    );
    mesh.name = 'sea';
    return mesh;
  }

  /**
   * The land the city stands on, and deliberately **not** asphalt (#176).
   *
   * It used to be: one asphalt plane, with the road network showing through
   * the gaps between the raised block slabs. That is a tempting trick and it
   * is wrong, because the gaps are not the roads. Blocks are rectangles on a
   * grid and roads are segments that bend, get clipped against water and stop
   * at the map edge, so every place the two disagree came out as tarmac the
   * sim does not consider road. Driving onto it caps the car at a quarter of
   * its top speed (`CityWorld.offRoadLimit`), so the player was slowed by
   * something indistinguishable from the road they were on. Lane markings were
   * the previous answer to this and they cannot carry it: junctions have no
   * markings either.
   *
   * So the ground is paved-but-not-road now and `carriageways` below paints the
   * roads, at exactly the width `onRoad` tests. That makes one rule carry the
   * whole thing: **dark tarmac is drivable, everything lighter is not.** The
   * pavement slabs are the same family a shade up, and the only green is a
   * block the generator actually left open.
   *
   * It also stopped hiding something. Blocks are rectangles and roads bend, so
   * there is more land belonging to neither than anyone thought - it used to
   * read as tarmac, and now it reads as what it is. That is a generator
   * question rather than a renderer one.
   *
   * It stops at the city bounds: past that is sea, which is what stops the map
   * ending in a grey apron of nothing.
   */
  private ground(city: City): THREE.Mesh {
    const width = city.bounds.maxX - city.bounds.minX;
    const depth = city.bounds.maxZ - city.bounds.minZ;
    // Coarser than the height field, which is 10 m and would be eight hundred
    // thousand vertices for one mesh. A landscape seen from a car or from the
    // air is read at hundreds of metres, and the roads carry their own geometry
    // at their own resolution, so what this has to get right is the *shape* of
    // the ground rather than every shelf cut into it.
    const cols = Math.max(2, Math.round(width / TERRAIN_RENDER_STEP));
    const rows = Math.max(2, Math.round(depth / TERRAIN_RENDER_STEP));
    const geometry = new THREE.PlaneGeometry(width, depth, cols, rows);
    geometry.rotateX(-Math.PI / 2);

    // Displace each vertex to the ground under it. `PlaneGeometry` rotated flat
    // has its vertices in world x and z already, so this only has to write y -
    // and then recompute the normals, without which the whole landscape is lit
    // as though it were still a plane and the hills are invisible.
    const position = geometry.attributes.position;
    const midX = (city.bounds.minX + city.bounds.maxX) / 2;
    const midZ = (city.bounds.minZ + city.bounds.maxZ) / 2;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + midX;
      const z = position.getZ(i) + midZ;
      // Clamped at the waterline rather than following the bed down. The
      // height field puts the seabed `TERRAIN_SEABED` under the water, which is
      // right for the data and wrong to draw: at a 40 m mesh the shore fell off
      // the six metres in one step and the whole coast came out as stairs.
      // Nothing can see the bed - the water is drawn over it - so the mesh stops
      // just under the surface and the land meets the water where it should.
      position.setY(i, Math.max(groundAt(city.terrain, x, z), SHORE_FLOOR));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    // **Land, not paving.** This was grey `#61656b` with a paving texture, and
    // that was right when the whole map was city: #176's rule is that dark
    // tarmac is drivable and anything lighter is not, and inside a city the
    // lighter thing is a forecourt. On a map that is mostly country the same
    // material makes the countryside a car park - ten kilometres of grey with
    // green patches lying on it.
    //
    // The rule survives intact and reads better: the land is green, the roads
    // are dark tarmac, and paving is what a *block* is made of. Grey now means
    // somebody built there.
    const material = new THREE.MeshLambertMaterial({
      color: '#54703f',
      map: blockTexture('grass'),
    });
    // The pit is rock and dust rather than green (#328), and only the pit.
    const pit = PLAN_PLACES.find((p) => p.kind === 'quarry');
    if (pit) {
      quarryGround(material, {
        at: pit.at,
        radius: pit.radius,
        fade: PLACE_BLEND,
        bench: QUARRY_BENCH,
        floor: groundAt(city.terrain, pit.at.x, pit.at.z),
      });
    }
    // And the wharf's yard is concrete (#410).
    const aprons = wharfGround(material, city.aprons, UNITS_PER_METRE);
    this.owned.push(geometry, material, ...(aprons ? [aprons] : []));

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(midX, 0, midZ);
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
  }

  /**
   * How high the ground is under a point, for everything that has to sit on it.
   *
   * The height field is city *data* (ADR-0007) and this is the renderer reading
   * it, which until now nothing outside the generator did: the terrain has been
   * generated, measured, cut and filled for a whole session while every picture
   * of it was of a flat plane.
   */
  private groundUnder(city: City, x: number, z: number): number {
    return groundAt(city.terrain, x, z);
  }

  /**
   * How high the ground is *drawn* under a point: the mesh `ground` builds, a
   * `TERRAIN_RENDER_STEP` grid of the height field cut into triangles the way
   * `PlaneGeometry` cuts them, which is not the height field itself. Between
   * its vertices the drawn ground is a flat triangle, and wherever the real
   * ground dips under that triangle a road laid on the real ground is under
   * the grass - the jagged green wedges along the hairpins of the Kestrel
   * Climb and the island's tracks. The roads ride whichever is higher.
   */
  /**
   * Where a road's tarmac is drawn: on the ground, raised to the ground as
   * drawn where that is higher, but never by more than `ROAD_BED_RAISE`.
   * Measured over every road, the raise is nothing for 85% of the network and
   * under 9 cm for 99% of it; the 24 places it would be more are boulevards at
   * the shore, where a 2 m raise floats the road over the car driving it, and
   * there a road under a corner of grass is the lesser fault.
   */
  private roadBed(city: City, x: number, z: number): number {
    const ground = this.groundUnder(city, x, z);
    return Math.max(ground, Math.min(this.drawnGroundUnder(city, x, z), ground + ROAD_BED_RAISE));
  }

  /**
   * The pieces a road's tarmac is drawn in (`carriagewaysFor`), each end's
   * height and how far the far edge rises over the near one, kept so the
   * centre line (`markings`) is painted on the tarmac as drawn rather than on
   * the ground under it, which a raised piece would bury it in.
   *
   * **Tilted across to the ground at its edges.** Laid level across, a piece
   * on a hillside, or under a drawn triangle that reaches up from the bank,
   * had one edge under the grass: measured at the edges of every road, 7.4%
   * of them, boulevards worst, as a saw-tooth of green down one side. The
   * tilt is the mean of the two ends' rise from one edge to the other, and
   * whatever is still under the grass after it lifts the piece, by no more
   * than `ROAD_BED_RAISE` - which leaves 0.1% of edges under it, and the car
   * under the tarmac by less than 19 cm on 99% of pieces.
   */
  private piecesOf(city: City, road: CityRoad): RoadPiece[] {
    const known = this.pieces.get(road);
    if (known) return known;
    const a = city.nodes[road.a].pos;
    const b = city.nodes[road.b].pos;
    const steps = Math.max(1, Math.ceil(road.length / (TERRAIN_RENDER_STEP / 2)));
    // Across the road, level: the horizontal right of its direction.
    const rx = (b.z - a.z) / Math.max(1, road.length);
    const rz = -(b.x - a.x) / Math.max(1, road.length);
    const half = road.width / 2;
    const out: RoadPiece[] = [];
    for (let s = 0; s < steps; s++) {
      const ax = a.x + ((b.x - a.x) * s) / steps;
      const az = a.z + ((b.z - a.z) * s) / steps;
      const bx = a.x + ((b.x - a.x) * (s + 1)) / steps;
      const bz = a.z + ((b.z - a.z) * (s + 1)) / steps;
      const edge = (x: number, z: number, side: number) => this.roadBed(city, x + rx * half * side, z + rz * half * side);
      const rise = (edge(ax, az, 1) - edge(ax, az, -1) + edge(bx, bz, 1) - edge(bx, bz, -1)) / 2;
      let ay = this.roadBed(city, ax, az);
      let by = this.roadBed(city, bx, bz);
      let need = 0;
      for (const t of [0, 0.5, 1]) {
        for (const side of [-1, 0, 1]) {
          const x = ax + (bx - ax) * t + rx * half * side;
          const z = az + (bz - az) * t + rz * half * side;
          need = Math.max(need, this.roadBed(city, x, z) - (ay + (by - ay) * t + (rise / 2) * side));
        }
      }
      need = Math.min(need, ROAD_BED_RAISE);
      ay += need;
      by += need;
      out.push({ ax, az, ay, bx, bz, by, rise });
    }
    this.pieces.set(road, out);
    return out;
  }

  /** How high a road's tarmac is drawn on its centre line, `along` from its first end. */
  private tarmacAt(city: City, road: CityRoad, along: number): number {
    const pieces = this.piecesOf(city, road);
    const f = Math.max(0, Math.min(pieces.length - 1e-9, (along / Math.max(1, road.length)) * pieces.length));
    const piece = pieces[Math.floor(f)];
    return piece.ay + (piece.by - piece.ay) * (f - Math.floor(f));
  }

  private drawnGroundUnder(city: City, x: number, z: number): number {
    const width = city.bounds.maxX - city.bounds.minX;
    const depth = city.bounds.maxZ - city.bounds.minZ;
    const cols = Math.max(2, Math.round(width / TERRAIN_RENDER_STEP));
    const rows = Math.max(2, Math.round(depth / TERRAIN_RENDER_STEP));
    const cw = width / cols;
    const ch = depth / rows;
    const fx = Math.max(0, Math.min(cols - 1e-9, (x - city.bounds.minX) / cw));
    const fz = Math.max(0, Math.min(rows - 1e-9, (z - city.bounds.minZ) / ch));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h = (ci: number, cj: number) =>
      Math.max(groundAt(city.terrain, city.bounds.minX + ci * cw, city.bounds.minZ + cj * ch), SHORE_FLOOR);
    // `PlaneGeometry`'s two triangles per square, (a, b, d) and (b, c, d),
    // split along the diagonal from (i, j + 1) to (i + 1, j).
    const a = h(i, j);
    const b = h(i, j + 1);
    const c = h(i + 1, j + 1);
    const d = h(i + 1, j);
    if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
    return c + (b - c) * (1 - u) + (d - c) * (1 - v);
  }

  /** The bay and the river, as flat polygons sunk below the road surface. */
  private water(city: City): THREE.Mesh[] {
    const material = new THREE.MeshLambertMaterial({ color: '#1d4f63' });
    // A settling pond is a greyer, greener water than the bay (#329).
    const pond = new THREE.MeshLambertMaterial({ color: '#3f6f78' });
    this.owned.push(material, pond);

    return city.water.map((body, i) => {
      // A Shape is built in XY facing +Z. Laying it flat the obvious way turns
      // that normal to face *down*, which leaves the water either culled or lit
      // as if the sky were under it - the same trap that made the road
      // invisible in #81. Negating z in the shape and rotating the other way
      // lands the geometry in the same place with the normal pointing up, which
      // is a real fix rather than DoubleSide papering over a wrong normal.
      const shape = new THREE.Shape(
        body.outline.map((p) => new THREE.Vector2(p.x, -p.z)),
      );
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      this.owned.push(geometry);

      const mesh = new THREE.Mesh(geometry, body.kind === 'pond' ? pond : material);
      mesh.position.y = body.level ?? WATER_LEVEL + i * WATER_STACK;
      mesh.name = `water:${body.kind}`;
      return mesh;
    });
  }

  /**
   * Bring the city's own lights up after dark (#180).
   *
   * `amount` is 0 in daylight and 1 at night. Two things answer to it: the
   * buildings' emissive channel, which carries a map of just the windows, and
   * the lamp heads, which stop being pale boxes on poles. Both *add* rather
   * than replace, so at zero this is exactly the daytime scene that #75 tuned.
   *
   * Found by name rather than by holding a reference to every material: the
   * buildings are built by a provider that could be swapped for a modelled one
   * (#84), and a name is the one thing a provider already has to set.
   */
  setNight(amount: number): void {
    const lit = Math.max(0, Math.min(1, amount));
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const material = mesh.material as THREE.MeshLambertMaterial | undefined;
      if (!material) return;
      // The lamp pools are a decal and have no emissive: they fade in.
      if (mesh.name === 'lamp-glow') {
        // Half strength at full night. At one the pools read as white blobs on
        // the pavement rather than as a lit road, which is the same mistake
        // the windows made.
        material.opacity = lit * 0.5;
        mesh.visible = lit > 0.02;
        return;
      }
      if (!(material as { emissive?: unknown }).emissive) return;
      // Well under 1: emissive is added *after* the lighting and before the
      // tone map, so a window at full strength clips to a white rectangle and
      // a tower becomes a slab. What has to read is that the window is lit,
      // not how bright the room is.
      if (mesh.name.startsWith('buildings:')) material.emissiveIntensity = lit * 0.42;
      else if (mesh.name === 'lamp-heads') material.emissive.setRGB(lit, lit * 0.9, lit * 0.68);
    });
  }

  /**
   * The block slabs: the kerb the buildings stand on, and the open ground.
   *
   * Two instanced meshes rather than one, which is the change that lets these
   * be textured at all. They used to be one mesh coloured per instance, and a
   * single material cannot have paving slabs on some instances and grass on
   * others. One extra draw call buys a pavement that reads as a pavement and
   * a park that reads as a park.
   */
  private pavements(city: City): THREE.InstancedMesh[] {
    const matrix = new THREE.Matrix4();
    const slab = (
      blocks: City['blocks'],
      name: string,
      kind: 'paving' | 'grass',
      tint: string,
    ): THREE.InstancedMesh => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.translate(0, -0.5, 0); // hang below y=0, so the top is the pavement
      // Textured on the top face only, in world units: a slab is scaled to
      // its own block, so a baked uv would make every block's paving a
      // different size. The kerb faces keep the flat colour, which is what a
      // kerb looks like anyway.
      const material = new THREE.MeshLambertMaterial({
        color: tint,
        map: blockTexture(kind),
      });
      worldUvs(material, {
        faces: 'top',
        tile: { u: BLOCK_TILE, v: BLOCK_TILE },
        key: kind,
      });
      this.owned.push(geometry, material);

      // An InstancedMesh cannot be built with a count of zero, and a seed
      // that leaves no open blocks is not impossible.
      const mesh = new THREE.InstancedMesh(
        geometry,
        material,
        Math.max(1, blocks.length),
      );
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.count = blocks.length;

      blocks.forEach((block, i) => {
        const bounds = block.bounds;
        const x = (bounds.minX + bounds.maxX) / 2;
        const z = (bounds.minZ + bounds.maxZ) / 2;
        // A slab stays a box - a block is flat ground by definition, which is
        // what #253 is about - but it stands on the height under its middle
        // rather than at zero. It hangs below its own top, so the kerb face
        // grows into whatever the hillside does at its edges instead of
        // floating clear of it.
        matrix.makeScale(
          bounds.maxX - bounds.minX,
          PAVEMENT_HEIGHT + BLOCK_FOOTING,
          bounds.maxZ - bounds.minZ,
        );
        matrix.setPosition(x, this.groundUnder(city, x, z) + PAVEMENT_HEIGHT, z);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      return mesh;
    };

    // Only the built blocks. **Open ground is not drawn at all now**: it is the
    // land, and the land is already there. It used to be a slab, which was a
    // table standing on a hill once the ground had relief; draping it was
    // better and still wrong, because a second surface a few centimetres over
    // the first is two surfaces fighting for the same pixels - visible as
    // triangles cutting through the ground from any distance.
    //
    // What made it drawable at all was the ground being *paving*. Now that the
    // ground is land, parkland and unclaimed ground are the same thing and the
    // honest way to draw the same thing twice is once.
    return [slab(city.blocks.filter((block) => !block.open), 'pavements', 'paving', '#6a6f76')];
  }

  /**
   * One `InstancedMesh` per road surface (#294), the same way `scene/buildings.ts`
   * is one per building kind: a shared quad and a shared material can only
   * ever carry one texture, so two surfaces are two meshes, not one mesh with
   * a texture that changes per instance.
   */
  private carriageways(city: City): THREE.InstancedMesh[] {
    const drivable = city.roads.filter(
      (road) =>
        !road.bridge && road.class !== 'interstate' && road.class !== 'ramp',
    );
    const meshes: THREE.InstancedMesh[] = [];
    // A railway's ballast is drawn with its track (`railways`), because where
    // the line crosses a street the bed has to stop at the kerbs (#514).
    for (const surface of ['asphalt', 'dirt', 'gravel'] as const) {
      const roads = drivable.filter((road) => (road.surface ?? 'asphalt') === surface);
      if (roads.length === 0) continue;
      meshes.push(this.carriagewaysFor(city, roads, surface));
    }
    return meshes;
  }

  /** A railway (#489): its ballast bed and its track, and its level crossings (#514). */
  private railways(city: City): THREE.Object3D[] {
    const roads = city.roads.filter((road) => road.surface === 'rail' && !road.bridge);
    const { meshes, owned } = railTrack(city, roads, (x, z) => this.groundUnder(city, x, z), {
      tile: ROAD_TILE,
      roadLift: ROAD_LIFT,
    });
    this.owned.push(...owned);
    return meshes;
  }

  /**
   * The tarmac, painted exactly where the sim says road is (#176).
   *
   * `onRoad` is `distanceToRoad(...) <= road.width / 2`, which is a capsule:
   * a rectangle with a half-disc on each end. This draws the rectangle and
   * extends it by half a width at both ends instead of drawing the caps, which
   * costs one quad per road rather than three and has the useful side effect of
   * filling the junctions - two crossing roads each reach half a width past
   * their shared node, so the intersection is covered from both directions.
   *
   * Rotated to the segment rather than snapped to an axis. The grid is
   * generated axis-aligned but boulevards bend (#115), and a quad that assumed
   * otherwise would leave a bent road painted as a staircase.
   *
   * Bridges, the interstate and its ramps are not here: they carry their own
   * geometry at their own height, and painting them twice would z-fight.
   *
   * A long road is more than one quad. One flat quad per road, pitched between
   * its two endpoint heights, was fine while every road was a street a block
   * or two long; the routed boulevards this branch draws can run hundreds of
   * metres between junctions (#274), and a straight line between just the two
   * ends cuts through whatever the terrain does in between - the ground mesh
   * disagrees with the flat quad and shows through as grass in the middle of
   * the road. Chopped at half `TERRAIN_RENDER_STEP`, the grid the ground is
   * drawn at, and each end set on whichever is higher, the ground or the
   * ground as drawn (`drawnGroundUnder`): the drawn ground is flat triangles
   * between its grid points, and a piece laid on the real ground under one of
   * them was under the grass. Each piece pads its own two ends by
   * half a width exactly as the whole road used to, so pieces of the same road
   * overlap slightly at their joins rather than leave a seam - harmless, since
   * it is the same tarmac on both sides.
   */
  private carriagewaysFor(city: City, roads: CityRoad[], surface: RoadSurface): THREE.InstancedMesh {
    const total = roads.reduce((sum, road) => sum + this.piecesOf(city, road).length, 0);

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2); // lie flat, facing up
    const material = new THREE.MeshLambertMaterial({
      color: surface === 'dirt' ? '#7a6a52' : surface === 'gravel' ? '#958f84' : '#4a5057',
      map: surface === 'dirt' ? dirtTexture(1, 1) : surface === 'gravel' ? gravelTexture(1, 1) : asphaltTexture(1, 1),
    });
    // One shared quad scaled per piece, so a baked uv would size the aggregate
    // by how long each piece happens to be. Computed from the instance scale
    // instead, the way every other instanced surface here does it.
    worldUvs(material, {
      faces: 'top',
      tile: { u: ROAD_TILE, v: ROAD_TILE },
      key: surface,
    });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, total));
    mesh.name = `carriageways-${surface}`;
    mesh.count = total;
    mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const normal = new THREE.Vector3();

    const lift = ROAD_LIFT;
    let i = 0;
    for (const road of roads) {
      const pieceLength = road.length / this.piecesOf(city, road).length;
      for (const { ax, az, ay, bx, bz, by, rise } of this.piecesOf(city, road)) {
        // **Pitched to the ground, not laid on a plane.** A piece is a quad
        // scaled to its own short stretch, and on a hillside a quad at one
        // height is a shelf with the hill going through it. Its basis is built
        // from the piece's own direction *in three dimensions* - so the tarmac
        // climbs with the road, and two pieces meeting on a slope meet along
        // the same line - and tilted across by `rise` (`piecesOf`).
        forward.set(bx - ax, 0, bz - az).normalize();
        right.crossVectors(up, forward).normalize();
        forward.set(bx - ax, by - ay, bz - az).normalize();
        right.y = rise / road.width;
        normal.crossVectors(forward, right).normalize();

        // Half a width past each end, so junctions - and the next piece along
        // the same road - are covered, and the capsule ends are approximated
        // without drawing them. `right` is not unit length once it is tilted:
        // its horizontal part is, and that is what spans the road's width.
        matrix.makeBasis(
          right.multiplyScalar(road.width),
          normal.multiplyScalar(1),
          forward.multiplyScalar(pieceLength + road.width),
        );
        matrix.setPosition(
          (ax + bx) / 2 + normal.x * lift,
          (ay + by) / 2 + lift,
          (az + bz) / 2 + normal.z * lift,
        );
        mesh.setMatrixAt(i, matrix);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * A centre line down the roads that have two sides to keep apart.
   *
   * The comment here used to say the dashes were what told asphalt from road,
   * and that stopped being true at #176 - which says so itself: "lane markings
   * were the previous answer to this and they cannot carry it: junctions have
   * no markings either". `carriageways` paints the roads now and the rule is
   * that dark tarmac is drivable. So the markings were left saying nothing, on
   * every road from a 10 m street to the 30 m interstate, identically.
   *
   * A playtest called them "often confusing", and that is what carrying no
   * information looks like from the driver's seat: a centre line on a street
   * you take the middle of anyway, on a road narrow enough that two cars
   * cannot pass without one of them crossing it.
   *
   * So a centre line means what a centre line means: this road has a side for
   * each direction. `ROADBLOCK_MIN_WIDTH` is the threshold because it is
   * already the game's definition of a road wide enough to have two halves -
   * it is what decides where a roadblock can stand, for the same reason.
   */
  private markings(city: City): THREE.InstancedMesh {
    const DASH = 3.2 * UNITS_PER_METRE;
    const GAP = 9 * UNITS_PER_METRE;

    const runs = city.roads
      .filter(
        // A dirt or gravel road carries no paint (#295): Marrow Field's runway and
        // taxiway are the only ones today, and a crisp centre line down a
        // strip nobody has resurfaced in years says the opposite of "disused".
        (road) =>
          !road.bridge &&
          road.length > GAP * 3 &&
          road.width >= ROADBLOCK_MIN_WIDTH &&
          road.surface === 'asphalt',
      )
      .map((road) => {
        const a = city.nodes[road.a].pos;
        const b = city.nodes[road.b].pos;
        // Stop short of the junctions at each end, where markings do not run.
        const inset = Math.min(road.width, road.length * 0.2);
        return { a, b, road, from: inset, to: road.length - inset };
      });

    const total = runs.reduce(
      (sum, r) => sum + Math.floor((r.to - r.from) / (DASH + GAP)),
      0,
    );
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2); // lie flat, facing up
    // Markings share a plane with the asphalt, so they need a depth offset as
    // well as a height one; the height alone is below the noise floor at range.
    const material = new THREE.MeshBasicMaterial({
      color: '#c9c3ac',
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      Math.max(1, total),
    );
    mesh.name = 'markings';

    const matrix = new THREE.Matrix4();
    const size = new THREE.Vector3(0.4 * UNITS_PER_METRE, 1, DASH);
    let i = 0;
    for (const run of runs) {
      // Along the road, whichever way the road actually goes.
      //
      // This used to pick the dominant axis and then step purely along x or
      // purely along z from one end - which is `CityRoad.axis` in all but name,
      // and #115 deleted that precisely because it is a lie: boulevards bend,
      // and anything not square to the grid gets dashes that march off in a
      // straight line while the road curves away underneath them. On a
      // boulevard they walked clean across the carriageway and out the far
      // side, which is what "markings on the road are off" looked like from the
      // driver's seat.
      //
      // The street grid is still generated axis-aligned - that is what keeps
      // blocks rectangular - but nothing may assume it, and this did.
      const dx = run.b.x - run.a.x;
      const dz = run.b.z - run.a.z;
      const length = Math.max(1, Math.hypot(dx, dz));
      const ux = dx / length;
      const uz = dz / length;
      const count = Math.floor((run.to - run.from) / (DASH + GAP));
      for (let d = 0; d < count; d++) {
        const at = run.from + d * (DASH + GAP);
        // Turned to face down the road, then stretched along its own length:
        // the dash is `DASH` long on its local z, which the rotation puts along
        // the carriageway.
        matrix.makeRotationY(Math.atan2(dx, dz));
        matrix.scale(size);
        const x = run.a.x + ux * at;
        const z = run.a.z + uz * at;
        // On the road rather than at a fixed height. A dash is small enough
        // that it can stay flat and still sit on the carriageway - the pitch
        // that matters over a 3 m mark is none - but it has to be at the height
        // of the road it is painted on, or a hill leaves the centre line
        // running through the tarmac and out the other side.
        matrix.setPosition(x, this.tarmacAt(city, run.road, at) + ROAD_LIFT + MARKING_LEVEL, z);
        mesh.setMatrixAt(i++, matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Bridge decks. These are the one piece of road that has to be drawn: there
   * is no ground under them to show through, and they are the chokepoints the
   * city is designed around, so they should read as structures.
   *
   * On the road's own line and at its own height, turned and pitched the way
   * the interstate's decks are. They used to be drawn flat at street level and
   * only ever square to the map, from before the ground had height: a diagonal
   * bridge came out as a box skewed off its road, at a height no car drove at.
   */
  private bridges(city: City): THREE.InstancedMesh | null {
    const spans = city.roads.filter((road) => road.bridge);
    if (spans.length === 0) return null;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, -0.5, 0); // the top face is the road
    const material = new THREE.MeshLambertMaterial({ color: '#54585e' });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, spans.length);
    mesh.name = 'bridges';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const pitch = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const across = new THREE.Vector3(1, 0, 0);
    spans.forEach((road, i) => {
      const a = city.nodes[road.a];
      const b = city.nodes[road.b];
      const rise = b.y - a.y;
      euler.set(0, Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z), 0, 'YXZ');
      quaternion.setFromEuler(euler).multiply(pitch.setFromAxisAngle(across, -Math.atan2(rise, road.length)));
      scale.set(road.width, BRIDGE_HEIGHT, Math.hypot(road.length, rise));
      position.set((a.pos.x + b.pos.x) / 2, (a.y + b.y) / 2 + ROAD_LIFT, (a.pos.z + b.pos.z) / 2);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * The interstate: its deck, and the pillars holding it up.
   *
   * Decks are sloped boxes rather than flat ones, because the deck really does
   * change height - on the ramps, and on the dive into the tunnel. The
   * pillars are the city's (`city/pillars.ts`), since the car hits them.
   */
  private viaduct(city: City): THREE.InstancedMesh[] {
    const decks = city.roads.filter(
      (r) => r.class === 'interstate' || r.class === 'ramp',
    );
    if (decks.length === 0) return [];

    const deckGeometry = new THREE.BoxGeometry(1, 1, 1);
    const deckMaterial = new THREE.MeshLambertMaterial({ color: '#5a6068' });
    this.owned.push(deckGeometry, deckMaterial);

    const deck = new THREE.InstancedMesh(
      deckGeometry,
      deckMaterial,
      decks.length,
    );
    deck.name = 'interstate';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();

    decks.forEach((road, i) => {
      const a = city.nodes[road.a];
      const b = city.nodes[road.b];
      const rise = b.y - a.y;
      const run = road.length;
      const slope = Math.atan2(rise, run);
      const yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);

      // Yaw the deck onto the road, then pitch it along the slope. Length is
      // the real one along the surface, not the map distance.
      euler.set(0, yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          -slope,
        ),
      );

      scale.set(road.width, DECK_THICKNESS, Math.hypot(run, rise));
      position.set(
        (a.pos.x + b.pos.x) / 2,
        (a.y + b.y) / 2,
        (a.pos.z + b.pos.z) / 2,
      );
      matrix.compose(position, quaternion, scale);
      deck.setMatrixAt(i, matrix);

    });
    deck.instanceMatrix.needsUpdate = true;

    const pillarGeometry = new THREE.BoxGeometry(1, 1, 1);
    pillarGeometry.translate(0, -0.5, 0); // hang down from the deck
    const pillarMaterial = new THREE.MeshLambertMaterial({ color: '#6d737a' });
    this.owned.push(pillarGeometry, pillarMaterial);

    const pillars = new THREE.InstancedMesh(
      pillarGeometry,
      pillarMaterial,
      Math.max(1, city.pillars.length),
    );
    pillars.name = 'interstate-pillars';
    // City data, because the sim hits them too (#487): drawn where they are.
    city.pillars.forEach((pillar, i) => {
      matrix.makeScale(PILLAR_WIDTH, pillar.height, PILLAR_WIDTH);
      matrix.setPosition(pillar.at.x, pillar.height, pillar.at.z);
      pillars.setMatrixAt(i, matrix);
    });
    pillars.count = city.pillars.length;
    pillars.instanceMatrix.needsUpdate = true;

    return [deck, pillars];
  }

  dispose(): void {
    this.provider.dispose();
    this.rooftops.dispose();
    this.furniture.dispose();
    this.collectibles.dispose();
    this.breakables.dispose();
    this.setPieces.dispose();
    this.jumps.dispose();
    for (const thing of this.owned) thing.dispose();
    disposeSurfaces();
    this.group.clear();
  }
}
