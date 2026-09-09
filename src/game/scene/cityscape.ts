import * as THREE from 'three';
import {
  asphaltTexture,
  BLOCK_TILE,
  blockTexture,
  disposeSurfaces,
} from './surfaces';
import { Rooftops } from './roofs';
import { worldUvs } from './worlduv';
import type { City } from '../city/types';
import { groundAt } from '../city/terrain';
import {
  UNITS_PER_METRE,
  INTERSTATE_PILLAR_SPACING,
  ROADBLOCK_MIN_WIDTH,
  TERRAIN_RENDER_STEP,
} from '../constants';
import { BoxBuildings, type BuildingProvider } from './buildings';
import { StreetFurniture } from './furniture';
import { CityCollectibles } from './collectibles';
import { CityBreakables } from './breakables';

const PAVEMENT_HEIGHT = 0.18 * UNITS_PER_METRE;
/** How far the tarmac sits above the bare ground. Enough to win the depth
 * test at range, far below the pavement kerb. */
const ROAD_LIFT = 0.02 * UNITS_PER_METRE;
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
const WATER_LEVEL = 0.25 * UNITS_PER_METRE;
const WATER_STACK = 0.02 * UNITS_PER_METRE;
const BRIDGE_HEIGHT = 1.2 * UNITS_PER_METRE;
/** Just clear of the ground plane, so markings do not fight it for depth. */
const MARKING_LEVEL = 0.06 * UNITS_PER_METRE;
/** How far the open sea reaches past the map, so it always meets the horizon. */
const SEA_REACH = 40000 * UNITS_PER_METRE;
const DECK_THICKNESS = 1.1 * UNITS_PER_METRE;
const PILLAR_WIDTH = 2.2 * UNITS_PER_METRE;

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
export class Cityscape {
  readonly group = new THREE.Group();

  private readonly provider: BuildingProvider;
  private readonly rooftops: Rooftops;
  private readonly furniture: StreetFurniture;
  /** Billboards and speed cameras (#93). Public: the sim smashes them. */
  readonly collectibles: CityCollectibles;
  /** Gates and stacks (#57). Public for the same reason. */
  readonly breakables: CityBreakables;
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(city: City, provider: BuildingProvider = new BoxBuildings()) {
    this.provider = provider;

    this.group.add(this.sea(city));
    this.group.add(this.ground(city));
    this.group.add(this.carriageways(city));
    for (const mesh of this.water(city)) this.group.add(mesh);
    for (const slab of this.pavements(city)) this.group.add(slab);
    this.group.add(this.markings(city));
    const bridges = this.bridges(city);
    if (bridges) this.group.add(bridges);
    for (const mesh of this.viaduct(city)) this.group.add(mesh);
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
      -1.5 * UNITS_PER_METRE,
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
      position.setY(i, groundAt(city.terrain, x, z));
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
    this.owned.push(geometry, material);

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

  /** The bay and the river, as flat polygons sunk below the road surface. */
  private water(city: City): THREE.Mesh[] {
    const material = new THREE.MeshLambertMaterial({ color: '#1d4f63' });
    this.owned.push(material);

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

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = WATER_LEVEL + i * WATER_STACK;
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
   */
  private carriageways(city: City): THREE.InstancedMesh {
    const roads = city.roads.filter(
      (road) =>
        !road.bridge && road.class !== 'interstate' && road.class !== 'ramp',
    );

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2); // lie flat, facing up
    const material = new THREE.MeshLambertMaterial({
      color: '#4a5057',
      map: asphaltTexture(1, 1),
    });
    // One shared quad scaled per road, so a baked uv would size the aggregate
    // by how long each street happens to be. Computed from the instance scale
    // instead, the way every other instanced surface here does it.
    worldUvs(material, {
      faces: 'top',
      tile: { u: ROAD_TILE, v: ROAD_TILE },
      key: 'asphalt',
    });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, roads.length));
    mesh.name = 'carriageways';
    mesh.count = roads.length;
    mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const normal = new THREE.Vector3();

    roads.forEach((road, i) => {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      // **Pitched to the ground, not laid on a plane.** A carriageway is a quad
      // scaled to its road, and on a hillside a quad at one height is a shelf
      // with the hill going through it. Its basis is built from the road's own
      // direction *in three dimensions* - so the tarmac climbs with the road,
      // and two roads meeting on a slope meet along the same line.
      const ay = this.groundUnder(city, a.x, a.z);
      const by = this.groundUnder(city, b.x, b.z);
      forward.set(b.x - a.x, by - ay, b.z - a.z).normalize();
      right.crossVectors(up, forward).normalize();
      normal.crossVectors(forward, right).normalize();

      // Half a width past each end, so junctions are covered and the capsule
      // ends are approximated without drawing them.
      matrix.makeBasis(
        right.multiplyScalar(road.width),
        normal.multiplyScalar(1),
        forward.multiplyScalar(road.length + road.width),
      );
      matrix.setPosition(
        (a.x + b.x) / 2 + normal.x * ROAD_LIFT,
        (ay + by) / 2 + ROAD_LIFT,
        (a.z + b.z) / 2 + normal.z * ROAD_LIFT,
      );
      mesh.setMatrixAt(i, matrix);
    });
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
        (road) => !road.bridge && road.length > GAP * 3 && road.width >= ROADBLOCK_MIN_WIDTH,
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
        matrix.setPosition(x, this.groundUnder(city, x, z) + MARKING_LEVEL, z);
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
   */
  private bridges(city: City): THREE.InstancedMesh | null {
    const spans = city.roads.filter((road) => road.bridge);
    if (spans.length === 0) return null;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, -0.5, 0);
    const material = new THREE.MeshLambertMaterial({ color: '#54585e' });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, spans.length);
    mesh.name = 'bridges';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    spans.forEach((road, i) => {
      const a = city.nodes[road.a].pos;
      const b = city.nodes[road.b].pos;
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      matrix.makeScale(
        alongX ? road.length : road.width,
        BRIDGE_HEIGHT,
        alongX ? road.width : road.length,
      );
      matrix.setPosition((a.x + b.x) / 2, PAVEMENT_HEIGHT, (a.z + b.z) / 2);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * The interstate: its deck, and the pillars holding it up.
   *
   * Decks are sloped boxes rather than flat ones, because the deck really does
   * change height - on the ramps, and on the dive into the tunnel. A pillar
   * only goes under a stretch that is actually above the ground; the tunnel
   * section is below it and needs nothing holding it up.
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

    const pillarSpots: { x: number; z: number; height: number }[] = [];
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

      if (road.class !== 'interstate') return;
      const count = Math.max(1, Math.round(run / INTERSTATE_PILLAR_SPACING));
      for (let p = 0; p < count; p++) {
        const t = (p + 0.5) / count;
        const height = a.y + rise * t;
        if (height < DECK_THICKNESS * 2) continue; // in the tunnel, or on the deck
        pillarSpots.push({
          x: a.pos.x + (b.pos.x - a.pos.x) * t,
          z: a.pos.z + (b.pos.z - a.pos.z) * t,
          height,
        });
      }
    });
    deck.instanceMatrix.needsUpdate = true;

    const pillarGeometry = new THREE.BoxGeometry(1, 1, 1);
    pillarGeometry.translate(0, -0.5, 0); // hang down from the deck
    const pillarMaterial = new THREE.MeshLambertMaterial({ color: '#6d737a' });
    this.owned.push(pillarGeometry, pillarMaterial);

    const pillars = new THREE.InstancedMesh(
      pillarGeometry,
      pillarMaterial,
      Math.max(1, pillarSpots.length),
    );
    pillars.name = 'interstate-pillars';
    pillarSpots.forEach((spot, i) => {
      matrix.makeScale(PILLAR_WIDTH, spot.height, PILLAR_WIDTH);
      matrix.setPosition(spot.x, spot.height, spot.z);
      pillars.setMatrixAt(i, matrix);
    });
    pillars.count = pillarSpots.length;
    pillars.instanceMatrix.needsUpdate = true;

    return [deck, pillars];
  }

  dispose(): void {
    this.provider.dispose();
    this.rooftops.dispose();
    this.furniture.dispose();
    this.collectibles.dispose();
    this.breakables.dispose();
    for (const thing of this.owned) thing.dispose();
    disposeSurfaces();
    this.group.clear();
  }
}
