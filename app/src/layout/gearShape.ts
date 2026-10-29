// Fast procedural gear geometry for the layout view (the real involute comes
// from OpenSCAD at download time). Teeth are trapezoids on the pitch circle.
import * as THREE from "three";

const cache = new Map<string, THREE.BufferGeometry>();

export function gearGeometry(teeth: number, module: number, thickness: number, boreR: number): THREE.BufferGeometry {
  const k = `${teeth}:${module}:${thickness}:${boreR}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const rp = (module * teeth) / 2, ra = rp + module, rr = rp - 1.25 * module;
  const shape = new THREE.Shape();
  const n = teeth, step = (2 * Math.PI) / n;
  // half tooth thickness at pitch = quarter step; narrower at the tip, wider at the root
  const tipHalf = step * 0.18, pitchHalf = step * 0.25, rootHalf = step * 0.34;
  for (let i = 0; i < n; i++) {
    const c = i * step;
    const pts: [number, number][] = [
      [rr, c - rootHalf], [rp, c - pitchHalf], [ra, c - tipHalf], [ra, c + tipHalf], [rp, c + pitchHalf], [rr, c + rootHalf],
    ];
    for (const [r, a] of pts) {
      const x = r * Math.cos(a), y = r * Math.sin(a);
      if (i === 0 && r === rr && a === c - rootHalf) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    // root arc to the next tooth
    const a0 = c + rootHalf, a1 = c + step - rootHalf;
    shape.absarc(0, 0, rr, a0, a1, false);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, boreR, 0, 2 * Math.PI, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  geo.computeVertexNormals();
  cache.set(k, geo);
  return geo;
}

/** A pulley: a disc with a shallow groove suggested by a slightly smaller middle band. */
export function pulleyGeometry(r: number, thickness: number, boreR: number): THREE.BufferGeometry {
  const k = `P:${r}:${thickness}:${boreR}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const pts: THREE.Vector2[] = [];
  const g = 1.6;
  for (const [rr, z] of [[boreR, 0], [r, 0], [r, thickness / 2 - g], [r - g, thickness / 2 - g / 2], [r - g, thickness / 2 + g / 2], [r, thickness / 2 + g], [r, thickness], [boreR, thickness]]) pts.push(new THREE.Vector2(rr, z));
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.computeVertexNormals();
  cache.set(k, geo);
  return geo;
}

/** A 12 tooth sawtooth ratchet wheel. */
export function ratchetGeometry(r: number, depth: number, thickness: number, boreR: number): THREE.BufferGeometry {
  const k = `R:${r}:${depth}:${thickness}:${boreR}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const shape = new THREE.Shape();
  const n = 12, r0 = r - depth;
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n, b = a + (2 * Math.PI) / 180;
    if (i === 0) shape.moveTo(r * Math.cos(a), r * Math.sin(a)); else shape.lineTo(r * Math.cos(a), r * Math.sin(a));
    shape.lineTo(r0 * Math.cos(b), r0 * Math.sin(b));
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, boreR, 0, 2 * Math.PI, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  geo.computeVertexNormals();
  cache.set(k, geo);
  return geo;
}
