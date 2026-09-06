import * as THREE from "three";

/**
 * The shape of a car (#11).
 *
 * Until now a car was two boxes with no wheels, which is what a car looks like
 * to someone who has been told about cars. The chase camera sits behind this
 * object for the entire game, so it is the single most-looked-at thing in
 * Kestrel Bay and the cheapest place to spend geometry.
 *
 * Still generated, still low-poly, still no imported asset: the bodies are box
 * geometries with their vertices moved. A box is eight corners, and moving
 * them is enough to get a tapered flank, a raked screen and a nose that drops.
 * That is a lot of silhouette for no extra triangles, and it keeps every car
 * one small mesh rather than a model to load.
 *
 * Nothing here knows about the sim. Sizes come in as one width and the rest is
 * proportion, so a lorry is this function with a bigger number.
 */

/**
 * Move a box's corners by a rule, in the box's own local space.
 *
 * Boxes come out of three.js with their faces subdivided into one quad each,
 * so every vertex is a corner and there is nothing in between to distort.
 */
function shape(
  geometry: THREE.BoxGeometry,
  move: (
    v: THREE.Vector3,
    at: { top: boolean; front: boolean; side: number },
  ) => void,
): THREE.BoxGeometry {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    move(v, { top: v.y > 0, front: v.z > 0, side: Math.sign(v.x) });
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export interface CarParts {
  body: THREE.Mesh;
  glass: THREE.Mesh;
  wheels: THREE.Mesh[];
  /** Where a lightbar or a spoiler would sit, in local units. */
  roof: number;
  width: number;
  length: number;
}

/**
 * Build one car's meshes, sized off `width`, sitting on y = 0.
 *
 * Returned as parts rather than a group so the caller decides what goes in and
 * in what order - the pool leans on the body being a car's first child, and a
 * cop needs to slip a door band in between.
 */
export function carParts(width: number, aspect: number): CarParts {
  const w = width;
  const length = w * 1.9;
  const height = w * aspect * 0.62;
  // A road car's wheel is about a third of its width across. A quarter, which
  // is what this had first, is a wheel taller than the body it is under.
  const tyre = w * 0.175;
  // The body's underside sits below the axle line, which is what stops a car
  // reading as a box balanced on four wheels.
  const floor = tyre * 0.66;

  const bodyGeometry = shape(
    new THREE.BoxGeometry(w, height, length),
    (v, at) => {
      // Tumblehome: the flanks lean in towards the waistline, so the widest part
      // of the car is at the bottom of the doors rather than at the roof.
      if (at.top) v.x *= 0.9;
      // The nose drops and the tail lifts. A wedge is the whole reason a car
      // photographs as fast, and it costs nothing here.
      if (at.front) v.y -= height * (at.top ? 0.22 : 0.06);
      else v.y += height * (at.top ? 0.04 : 0.0);
      // Both ends pull in towards the centreline, so the plan view is not a
      // rectangle - most visible at the corners of the tail from behind.
      v.x *= 0.94;
    },
  );
  const body = new THREE.Mesh(bodyGeometry, new THREE.MeshLambertMaterial());
  body.position.y = floor + height / 2;

  // The greenhouse: narrower than the body, set back, and raked at both ends.
  const glassH = height * 0.72;
  const glassGeometry = shape(
    new THREE.BoxGeometry(w * 0.82, glassH, length * 0.5),
    (v, at) => {
      if (at.top) {
        // The roof is shorter than the glass line at both ends, which is what
        // makes a windscreen and a rear screen rather than a box with windows.
        v.z *= at.front ? 0.34 : 0.66;
        v.x *= 0.86;
      }
    },
  );
  const glass = new THREE.Mesh(
    glassGeometry,
    // Dark and slightly shiny. Phong rather than Lambert for one small mesh:
    // glass with no specular is a black hole where a windscreen should be.
    new THREE.MeshPhongMaterial({
      color: "#141a26",
      shininess: 70,
      specular: "#8fa8c8",
    }),
  );
  glass.position.set(0, floor + height * 0.92, -length * 0.04);

  // One geometry and one material shared by all four wheels: they are
  // identical, and four of anything is worth not allocating four times.
  const wheelGeometry = new THREE.CylinderGeometry(tyre, tyre, w * 0.17, 10);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: "#15161a" });
  const wheels: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      // Just inside the flank, so the car sits on its wheels rather than
      // beside them, and set in from the ends: overhang is what makes a car
      // look like a van.
      wheel.position.set(side * w * 0.4, tyre, end * length * 0.32);
      wheels.push(wheel);
    }
  }

  return {
    body,
    glass,
    wheels,
    roof: floor + height * 0.92 + glassH / 2,
    width: w,
    length,
  };
}
