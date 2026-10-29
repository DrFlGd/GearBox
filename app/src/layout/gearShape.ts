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
