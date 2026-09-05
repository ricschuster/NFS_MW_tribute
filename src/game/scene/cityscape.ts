import * as THREE from 'three';
import type { City } from '../city/types';
import { UNITS_PER_METRE, INTERSTATE_PILLAR_SPACING } from '../constants';
import { BoxBuildings, type BuildingProvider } from './buildings';
import { StreetFurniture } from './furniture';

const PAVEMENT_HEIGHT = 0.18 * UNITS_PER_METRE;
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
  private readonly furniture: StreetFurniture;
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(city: City, provider: BuildingProvider = new BoxBuildings()) {
    this.provider = provider;

    this.group.add(this.sea(city));
    this.group.add(this.ground(city));
    for (const mesh of this.water(city)) this.group.add(mesh);
    this.group.add(this.pavements(city));
    this.group.add(this.markings(city));
    const bridges = this.bridges(city);
    if (bridges) this.group.add(bridges);
    for (const mesh of this.viaduct(city)) this.group.add(mesh);
    for (const mesh of provider.build(city.buildings)) this.group.add(mesh);

    this.furniture = new StreetFurniture(city.furniture);
    for (const mesh of this.furniture.meshes) this.group.add(mesh);
  }

  /**
   * Open sea, out past the horizon in every direction. The city sits on it as
   * an island, so the edge of the map is a coastline rather than the edge of a
   * sheet of asphalt hanging in the sky.
   */
  private sea(city: City): THREE.Mesh {
    const width = city.bounds.maxX - city.bounds.minX;
    const depth = city.bounds.maxZ - city.bounds.minZ;
    const geometry = new THREE.PlaneGeometry(width + SEA_REACH, depth + SEA_REACH);
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
   * Asphalt over the land, and the road network is what shows through. It stops
   * at the city bounds: past that is sea, which is what stops the map ending in
   * a grey apron of nothing.
   */
  private ground(city: City): THREE.Mesh {
    const width = city.bounds.maxX - city.bounds.minX;
    const depth = city.bounds.maxZ - city.bounds.minZ;
    const geometry = new THREE.PlaneGeometry(width, depth);
    const material = new THREE.MeshLambertMaterial({ color: '#4a5057' });
    this.owned.push(geometry, material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      (city.bounds.minX + city.bounds.maxX) / 2,
      0,
      (city.bounds.minZ + city.bounds.maxZ) / 2,
    );
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
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
      const shape = new THREE.Shape(body.outline.map((p) => new THREE.Vector2(p.x, -p.z)));
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      this.owned.push(geometry);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = WATER_LEVEL + i * WATER_STACK;
      mesh.name = `water:${body.kind}`;
      return mesh;
    });
  }

  /** One instanced slab per block: the kerb the buildings stand on. */
  private pavements(city: City): THREE.InstancedMesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, -0.5, 0); // hang below y=0, so the top is the pavement
    const material = new THREE.MeshLambertMaterial({ color: '#6a6f76' });
    this.owned.push(geometry, material);

    const mesh = new THREE.InstancedMesh(geometry, material, city.blocks.length);
    mesh.name = 'pavements';
    mesh.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    city.blocks.forEach((block, i) => {
      const b = block.bounds;
      matrix.makeScale(b.maxX - b.minX, PAVEMENT_HEIGHT, b.maxZ - b.minZ);
      matrix.setPosition((b.minX + b.maxX) / 2, PAVEMENT_HEIGHT, (b.minZ + b.maxZ) / 2);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Centre-line dashes down every road.
   *
   * These are not decoration. Because the road surface is the ground plane,
   * asphalt is what you see wherever there is no block - including the open
   * ground the generator leaves along the riverbanks, which without markings
   * reads exactly like a road. The dashes are what say which asphalt is a road.
   */
  private markings(city: City): THREE.InstancedMesh {
    const DASH = 3.2 * UNITS_PER_METRE;
    const GAP = 9 * UNITS_PER_METRE;

    const runs = city.roads
      .filter((road) => !road.bridge && road.length > GAP * 3)
      .map((road) => {
        const a = city.nodes[road.a].pos;
        const b = city.nodes[road.b].pos;
        // Stop short of the junctions at each end, where markings do not run.
        const inset = Math.min(road.width, road.length * 0.2);
        return { a, b, road, from: inset, to: road.length - inset };
      });

    const total = runs.reduce((sum, r) => sum + Math.floor((r.to - r.from) / (DASH + GAP)), 0);
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

    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, total));
    mesh.name = 'markings';

    const matrix = new THREE.Matrix4();
    let i = 0;
    for (const run of runs) {
      const alongX = Math.abs(run.b.x - run.a.x) > Math.abs(run.b.z - run.a.z);
      const count = Math.floor((run.to - run.from) / (DASH + GAP));
      for (let d = 0; d < count; d++) {
        const at = run.from + d * (DASH + GAP);
        matrix.makeScale(alongX ? DASH : 0.4 * UNITS_PER_METRE, 1, alongX ? 0.4 * UNITS_PER_METRE : DASH);
        matrix.setPosition(
          alongX ? run.a.x + at : run.a.x,
          MARKING_LEVEL,
          alongX ? run.a.z : run.a.z + at,
        );
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
    const decks = city.roads.filter((r) => r.class === 'interstate' || r.class === 'ramp');
    if (decks.length === 0) return [];

    const deckGeometry = new THREE.BoxGeometry(1, 1, 1);
    const deckMaterial = new THREE.MeshLambertMaterial({ color: '#5a6068' });
    this.owned.push(deckGeometry, deckMaterial);

    const deck = new THREE.InstancedMesh(deckGeometry, deckMaterial, decks.length);
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
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -slope));

      scale.set(road.width, DECK_THICKNESS, Math.hypot(run, rise));
      position.set((a.pos.x + b.pos.x) / 2, (a.y + b.y) / 2, (a.pos.z + b.pos.z) / 2);
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

    const pillars = new THREE.InstancedMesh(pillarGeometry, pillarMaterial, Math.max(1, pillarSpots.length));
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
    this.furniture.dispose();
    for (const thing of this.owned) thing.dispose();
    this.group.clear();
  }
}
