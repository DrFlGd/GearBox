// Procedural gear geometry for the layout view, built in the browser so it stays
// instant: true involute flanks (20 degree pressure angle) on the same pitch,
// tip and root circles as the printed gears from OpenSCAD.
import * as THREE from "three";
import { creased } from "../components/look";

const cache = new Map<string, THREE.BufferGeometry>();

const PA = (20 * Math.PI) / 180;
const inv = (a: number) => Math.tan(a) - a;

export function gearGeometry(teeth: number, module: number, thickness: number, boreR: number, keep = 1): THREE.BufferGeometry {
  const k = `${teeth}:${module}:${thickness}:${boreR}:${keep}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const rp = (module * teeth) / 2, ra = rp + module, rr = rp - 1.25 * module, rb = rp * Math.cos(PA);
  const n = teeth, step = (2 * Math.PI) / n;
  // half the tooth's angular width at radius r (no backlash: tooth = gap at the pitch circle)
  const half = (r: number) => step / 4 + inv(PA) - inv(Math.acos(Math.min(1, rb / Math.max(r, rb))));
  // one flank from the root circle up to the tip: radial below the base circle, involute above it
  const FLANK = 8;
  const r0 = Math.max(rr, rb);
  const flank: [number, number][] = [];
  if (rr < rb) flank.push([rr, half(rb)]);
  for (let i = 0; i <= FLANK; i++) { const r = r0 + ((ra - r0) * i) / FLANK; flank.push([r, half(r)]); }
  const tipHalf = Math.max(half(ra), 0.02 * step);
  const rootHalf = Math.min(flank[0][1], step / 2 - 1e-4);
  const shape = new THREE.Shape();
  const at = (r: number, a: number, first: boolean) => { const x = r * Math.cos(a), y = r * Math.sin(a); if (first) shape.moveTo(x, y); else shape.lineTo(x, y); };
  for (let i = 0; i < n; i++) {
    const c = i * step;
    // a partial gear keeps the teeth within +-keep*pi of +x and has a bare root circle elsewhere
    const bare = keep < 1 && Math.abs(((c + Math.PI) % (2 * Math.PI)) - Math.PI) > keep * Math.PI;
    if (bare) { at(rr - 0.3, c - rootHalf, i === 0); at(rr - 0.3, c + rootHalf, false); }
    else {
      flank.forEach(([r, h], j) => at(r, c - h, i === 0 && j === 0));                       // leading flank, root to tip
      for (let t = 1; t < 4; t++) at(ra, c - tipHalf + (2 * tipHalf * t) / 4, false);         // tip land
      for (let j = flank.length - 1; j >= 0; j--) at(flank[j][0], c + flank[j][1], false);    // trailing flank, tip to root
    }
    // root arc to the next tooth
    shape.absarc(0, 0, bare ? rr - 0.3 : rr, c + rootHalf, c + step - rootHalf, false);
  }
  shape.closePath();
  // the bore as explicit points: curveSegments stays low for the many short root arcs
  const hole = new THREE.Path();
  for (let i = 0; i < 48; i++) { const a = (-i * 2 * Math.PI) / 48; if (i) hole.lineTo(boreR * Math.cos(a), boreR * Math.sin(a)); else hole.moveTo(boreR, 0); }
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 4 });
  const out = creased(geo);
  cache.set(k, out);
  return out;
}

/** A pulley: a disc with a shallow groove suggested by a slightly smaller middle band. */
export function pulleyGeometry(r: number, thickness: number, boreR: number): THREE.BufferGeometry {
  const k = `P:${r}:${thickness}:${boreR}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const pts: THREE.Vector2[] = [];
  const g = 1.6;
  for (const [rr, z] of [[boreR, 0], [r, 0], [r, thickness / 2 - g], [r - g, thickness / 2 - g / 2], [r - g, thickness / 2 + g / 2], [r, thickness / 2 + g], [r, thickness], [boreR, thickness]]) pts.push(new THREE.Vector2(rr, z));
  const geo = new THREE.LatheGeometry(pts, 72);
  const out = creased(geo);
  cache.set(k, out);
  return out;
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
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
  const out = creased(geo);
  cache.set(k, out);
  return out;
}

function extrudePolygon(k: string, pts: [number, number][], thickness: number, boreR: number): THREE.BufferGeometry {
  const hit = cache.get(k);
  if (hit) return hit;
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  if (boreR > 0) { const hole = new THREE.Path(); hole.absarc(0, 0, boreR, 0, 2 * Math.PI, true); shape.holes.push(hole); }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
  const out = creased(geo);
  cache.set(k, out);
  return out;
}

/** A cam disc from its polar profile. */
export function camGeometry(kind: string, r: (a: number) => number, thickness: number, boreR: number): THREE.BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i < 180; i++) { const a = (i * Math.PI) / 90; pts.push([r(a) * Math.cos(a), r(a) * Math.sin(a)]); }
  return extrudePolygon(`cam:${kind}:${r(0)}:${r(Math.PI)}:${thickness}:${boreR}`, pts, thickness, boreR);
}

/** The 15 tooth escape wheel: steep face leading clockwise. */
export function escapeWheelGeometry(R: number, depth: number, thickness: number, boreR: number): THREE.BufferGeometry {
  const n = 15, beta = (2 * Math.PI) / n;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = i * beta;
    pts.push([R * Math.cos(p), R * Math.sin(p)], [(R - depth) * Math.cos(p + 0.8 * beta), (R - depth) * Math.sin(p + 0.8 * beta)], [(R - depth) * Math.cos(p + 0.96 * beta), (R - depth) * Math.sin(p + 0.96 * beta)]);
  }
  return extrudePolygon(`esc:${R}:${thickness}:${boreR}`, pts, thickness, boreR);
}

/** A Geneva wheel: n slots at k*2pi/n, concave locking arcs between them. */
export function genevaWheelGeometry(n: number, C: number, b: number, lock: number, slotW: number, rIn: number, thickness: number, boreR: number): THREE.BufferGeometry {
  const k = `gen:${n}:${C}:${b}:${lock}:${thickness}:${boreR}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const shape = new THREE.Shape();
  const step = (2 * Math.PI) / n, rho = lock + 0.4, hw = slotW / 2;
  const rimA = Math.asin(hw / b);                                   // half angle of a slot mouth at the rim
  const delta = Math.acos((b * b + C * C - rho * rho) / (2 * b * C)); // half angle of the arc's cut at the rim
  for (let i = 0; i < n; i++) {
    const a0 = i * step;
    // slot i: from the bottom semicircle up the +wall to the rim
    const bx = rIn + hw, inner = Math.sqrt(b * b - hw * hw);
    const rot = (x: number, y: number): [number, number] => [x * Math.cos(a0) - y * Math.sin(a0), x * Math.sin(a0) + y * Math.cos(a0)];
    const pA = rot(inner, -hw), pB = rot(bx, -hw), pC = rot(bx, hw), pD = rot(inner, hw);
    if (i === 0) shape.moveTo(pA[0], pA[1]); else shape.lineTo(pA[0], pA[1]);
    shape.lineTo(pB[0], pB[1]);
    shape.absarc(bx * Math.cos(a0), bx * Math.sin(a0), hw, a0 - Math.PI / 2, a0 + Math.PI / 2, true);
    shape.lineTo(pD[0], pD[1]);
    // rim to the arc, the arc (concave, centred C away at a0 + step/2), rim to the next slot
    const am = a0 + step / 2;
    shape.absarc(0, 0, b, a0 + rimA, am - delta, false);
    const cx = C * Math.cos(am), cy = C * Math.sin(am);
    const e0 = Math.atan2(b * Math.sin(am - delta) - cy, b * Math.cos(am - delta) - cx), e1 = Math.atan2(b * Math.sin(am + delta) - cy, b * Math.cos(am + delta) - cx);
    shape.absarc(cx, cy, rho, e0, e1, true);
    shape.absarc(0, 0, b, am + delta, a0 + step - rimA, false);
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, boreR, 0, 2 * Math.PI, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
  const out = creased(geo);
  cache.set(k, out);
  return out;
}
