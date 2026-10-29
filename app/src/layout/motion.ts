// Kinematics of the phase 4b mechanisms, shared by the rules (ranges, checks) and the
// view (poses per frame). Angles in radians; the input turns by `theta`.
import { camR, type CamKind } from "./model";
import type { Size } from "../parts";

const TAU = 2 * Math.PI;
export const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** A partial gear with teeth on `keep` of its rim drives only while that sector faces
 *  the driven gear. `u` is the driver's angle measured from the direction to the driven
 *  gear; E(u) is how far the driven side has been turned (in driver radians). */
export function gateE(u: number, keep: number): number {
  const w = keep * Math.PI;
  const turns = Math.floor((u + Math.PI) / TAU);
  const r = u - turns * TAU;                      // in [-pi, pi)
  return turns * 2 * w + Math.min(Math.max(r + w, 0), 2 * w);
}

/** Geneva wheel angle for a driver angle `psi` measured from the line toward the wheel
 *  (0 = post pointing at the wheel). Indexes 1/n of a turn while |psi| < pi/2 - pi/n,
 *  opposite to the driver, and dwells otherwise. */
export function genevaAngle(psi: number, n: number, a: number, C: number): number {
  const half = Math.PI / 2 - Math.PI / n;
  const turns = Math.floor((psi + Math.PI) / TAU);
  const r = psi - turns * TAU;
  const step = TAU / n;
  let inner: number;
  if (r < -half) inner = -step / 2;
  else if (r > half) inner = step / 2;
  else inner = Math.atan2(a * Math.sin(r), C - a * Math.cos(r));   // the slot points at the post
  return -(turns * step + inner);
}

/** Follower angle (about its pivot, from the direction toward the cam) such that the
 *  nose just touches the cam. D: pivot to cam axis, A: pivot to nose centre, rn: nose
 *  radius, camAngle: the cam's rotation. The nose sits on the +side (counter-clockwise). */
export function followerAngle(size: Size, kind: CamKind, camAngle: number, D: number, A: number, rn: number): number {
  // f(th) = |nose - cam| - (r(contact angle) + rn); the nose is pushed out as the cam lifts
  const gap = (th: number) => {
    const nx = D - A * Math.cos(th), ny = -A * Math.sin(th);   // cam axis at the origin, pivot at (D, 0), nose swings up (+y)
    const dist = Math.hypot(nx, ny);
    const phi = Math.atan2(ny, nx) - camAngle;
    return dist - (camR(size, kind, phi) + rn);
  };
  // the follower rests at the largest angle where the nose is clear: bisect on gap = 0
  let lo = 0.05, hi = Math.PI / 2;
  if (gap(lo) > 0) return lo;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (gap(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

/** Escape wheel: steps half a tooth at a time, twice per anchor swing. */
export function escapeAngle(angle: number, n: number): number {
  const half = Math.PI / n;
  return Math.floor(angle / half + 0.5) * half;
}
/** Anchor swing, +-amp, one full swing per tooth of the wheel. */
export const anchorAngle = (wheelAngle: number, n: number, amp: number) => amp * Math.sin(wheelAngle * n);

/** Scotch yoke: carriage centre along the rail for the crank post at (xp + t cos phi, t sin phi) and a slot `reach` ahead. */
export const yokeX = (xp: number, reach: number, t: number, phi: number) => xp - reach + t * Math.cos(phi);
/** Crank slider: carriage post at (x, 0) joined by a link of length l to the crank post. */
export const sliderX = (xp: number, t: number, l: number, phi: number) => xp + t * Math.cos(phi) - Math.sqrt(Math.max(0, l * l - (t * Math.sin(phi)) ** 2));

/** Min and max of f over a full turn. */
export function rangeOver(f: (phi: number) => number, steps = 72): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < steps; i++) { const v = f((i / steps) * TAU); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return [lo, hi];
}
