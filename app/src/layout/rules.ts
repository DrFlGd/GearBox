// What the tester checks: which items mesh, band together or collide, which
// hardware an item hits, how the train turns (including the stepped and gated
// motions of phase 4b), what the fixtures do, and what to print.
import {
  ARM_W, MAGF_N, followerTail, ringBolt, MAG_COUPLE_MIN, PLN, hasJaws, hasPins, hasScrews, magPoles, magnetSize, SHAFT_LEVEL, bearingOD, bracketDims, crankLinkLevel, escDims, extraLevels, followerA, gearAt, genevaDims, itemR, kindOf, levelsUsed, meshes, motorLegs,
  motorType, pinById, pitchR, planetaryDims, pointerReach, railDims, railFrame, slotW, yokeWall, socketPos, springMinTeeth, std, teethOf, tipR, topLevel,
  type Band, type Fixture, type Gear, type Joint, type Layout, type Pin,
} from "./model";
import { escapeAngle, gateE, genevaAngle, rangeOver, sliderX, yokeX } from "./motion";
import { catalog, type Size } from "../parts";

export type GearRef = { pin: Pin; gear: Gear };
export type Pair = { a: GearRef; b: GearRef; kind: "mesh" | "collide" | "band" | "cam" | "geneva" | "escapement" };
export type HardwareHit = { gear: GearRef; pin: Pin; what: "spacer" | "knob" | "mount" | "crank" | "pointer" | "lever" | "rail" | "carriage" };
export type Problem = { text: string; pin?: string; level?: number; fixture?: string };
/** A crank-rocker linkage the view animates: crank post on pin `crank`, rocker on pin `rocker`. */
export type Linkage = { crank: GearRef; rocker: GearRef; throw: number; coupler: number; rockerLen: number; ok: boolean };
/** What a fixture's carriage does: who drives it and how far it travels along the rail. */
export type FixtureInfo = {
  fixture: Fixture;
  drive?: GearRef;              // the crank's gear (yoke, slider), the pinion (rack) or the bevel gear (bracket)
  wormGear?: GearRef;           // bracket: the worm gear beside the bar
  side?: number;                // bracket: which side (+1 left, -1 right) the worm gear is on
  pinU?: number;                // the drive pin's position along the rail, mm
  range: [number, number];      // carriage centre travel along the rail, mm
  limit: [number, number];      // where the carriage may be
  ok: boolean;
};
export type Motion = (theta: number) => number;

export type Analysis = {
  pairs: Pair[];
  hits: HardwareHit[];
  problems: Problem[];
  speed: Map<string, number>;       // key pin:level -> mean angular speed relative to the input (sign = direction)
  phase: Map<string, number>;       // key -> initial angle, radians, so meshing teeth interleave
  motion: Map<string, Motion>;      // key -> angle for an input angle theta (stepped and gated motions included)
  smooth: Map<string, Motion>;      // escape wheel key -> its angle before stepping (what swings the anchor)
  locked: boolean;
  reachable: Set<string>;
  pawls: Map<string, number>;       // pawl key -> angle (radians) toward its ratchet
  linkages: Linkage[];
  partners: Map<string, GearRef>;   // follower -> its cam, anchor -> its escape wheel, lever -> its crank gear, Geneva wheel -> its driver
  fixtures: FixtureInfo[];
};

export const key = (pin: Pin | string, level: number) => `${typeof pin === "string" ? pin : pin.id}:${level}`;
const mm = (l: Layout, p: Pin) => socketPos(l, p.x, p.y);
const dist = (l: Layout, p: Pin, q: Pin) => { const a = mm(l, p), b = mm(l, q); return Math.hypot(a.x - b.x, a.y - b.y); };
const angle = (l: Layout, p: Pin, q: Pin) => { const a = mm(l, p), b = mm(l, q); return Math.atan2(b.y - a.y, b.x - a.x); };
/** Pins exactly `steps` sockets apart along a grid line. */
const straight = (p: Pin, q: Pin, steps: number) => (Math.abs(q.x - p.x) === steps && q.y === p.y) || (Math.abs(q.y - p.y) === steps && q.x === p.x);
export const label = (g: Gear) => {
  switch (kindOf(g)) {
    case "gear": return `${g.teeth}T`; case "pulley": return `P${g.teeth}`; case "ratchet": return "ratchet"; case "pawl": return "pawl"; case "rocker": return "rocker";
    case "cam": return `${g.cam ?? "eccentric"} cam`; case "follower": return "follower"; case "geneva": return "Geneva driver"; case "genevaWheel": return "Geneva wheel";
    case "partial": return `${g.teeth}T ${g.keep === 0.25 ? "quarter" : "half"} gear`; case "qrlever": return "quick-return lever"; case "escwheel": return "escape wheel";
    case "anchor": return "anchor"; case "winch": return "winch";
    case "carrier": return "planet carrier"; case "bevel": return `bevel gear on a ${g.teeth}T`; case "wormgear": return `${g.teeth}T worm gear`; case "flywheel": return "flywheel";
    case "maggear": return `${magPoles(g)}-magnet gear`;
  }
};

/** Footprint of a motor mount in mm, relative to the motor socket, turned by dir: leg circles,
 *  full-height blocks (convex polygons) and the radius of what sits over the pinion. */
export function motorFootprint(l: Layout, pin: Pin) {
  const s = std(l.size);
  const g = s.grid, m = s.module;
  const dir = pin.motor?.dir ?? 0;
  const type = motorType(pin);
  const rot = (x: number, y: number) => { for (let k = 0; k < dir; k++) [x, y] = [-y, x]; return { x, y }; };
  const legR = (Number(s.bolt.slice(1)) * 1.6 + 5) / 2 + 0.3;            // BOLT[1] + 5, roughly
  const legs = motorLegs(dir, type).map(([i, j]) => ({ x: i * g, y: j * g, r: legR }));
  if (type === "nema17") {
    // two arms from the legs to the 48 mm plate; the motor body sits on the plate
    const half = 24, aw = 6;
    const blocks = [-1, 1].map(sg => [[sg * (half - 1), -aw], [sg * 2 * g, -aw], [sg * 2 * g, aw], [sg * (half - 1), aw]].map(([x, y]) => rot(x, y)));
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, y]) => rot(x, y));
    return { legs, corners, blocks, cradleR: half * Math.SQRT2, type };
  }
  // block: x in [-w/2, w/2], y in [tipR(20)+1, 2g] before rotation; the cradle sits over the axis
  const w = 12 + 0.4 + 2 * 1.6;
  const corners = [[-w / 2, m * 11 + 1], [w / 2, m * 11 + 1], [w / 2, 2 * g], [-w / 2, 2 * g]].map(([x, y]) => rot(x, y));
  return { legs, corners, blocks: [corners], cradleR: w / 2 + 1, type };
}
/** Distance from a point to a convex polygon (0 inside). */
function polyDist(px: number, py: number, poly: { x: number; y: number }[]) {
  let inside = true, best = Infinity;
  const area = poly.reduce((acc, a, i) => { const b = poly[(i + 1) % poly.length]; return acc + a.x * b.y - b.x * a.y; }, 0);
  const sgn = area < 0 ? -1 : 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    if (sgn * (ex * (py - a.y) - ey * (px - a.x)) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(px - a.x - t * ex, py - a.y - t * ey));
  }
  return inside ? 0 : best;
}
/** Distance from a point to a segment. */
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const ex = bx - ax, ey = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(px - ax - t * ex, py - ay - t * ey);
};
/** Distance from a point (in a rail's local frame) to an axis-aligned rectangle. */
const rectDist = (u: number, v: number, u0: number, u1: number, v0: number, v1: number) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));

/** A box in the rail's frame, or (with `r`) a circle centred at (u0, v0). */
/** `drive`: the fixture's drive overlaps it by design (the pinion in the rack's teeth, the crank under the yoke's arm). */
export type FixtureBox = { u0: number; u1: number; v0: number; v1: number; lo: number; hi: number; what: "rail" | "carriage"; r?: number; drive?: boolean };
/** The boxes a fixture occupies in its own frame, with the levels they fill. Carriage boxes span the travel. */
export function fixtureBoxes(l: Layout, f: Fixture, info?: FixtureInfo): FixtureBox[] {
  const s = std(l.size), g = s.grid, r = railDims(l.size);
  const box = (u0: number, u1: number, v0: number, v1: number, lo: number, hi: number, what: FixtureBox["what"]): FixtureBox => ({ u0, u1, v0, v1, lo, hi, what });
  if (f.kind === "bracket") {
    const b = bracketDims(l.size), L = f.span * g;
    const out: FixtureBox[] = [box(-b.housingT / 2, L + b.housingT / 2, -b.housingW / 2, b.housingW / 2, 1, 1, "rail")];
    for (const u of [0, L]) out.push(box(u - b.housingT / 2, u + b.housingT / 2, -b.housingW / 2, b.housingW / 2, 1, 4, "rail"));
    const wr = b.wormD / 2 + s.module;
    if (info?.wormGear) out.push(box(L / 2 - b.wormL / 2, L / 2 + b.wormL / 2, -wr, wr, 2, 4, "carriage"));                      // the worm
    if (info?.drive) out.push(box(-b.bevelD + pitchR(l.size, b.bevelT) - 2, -b.housingT / 2, -tipR(l.size, b.bevelT), tipR(l.size, b.bevelT), 2, 4, "carriage")); // the shaft bevel
    return out;
  }
  const L = (f.n - 1) * g;
  const out: FixtureBox[] = [box(-r.w / 2, L + r.w / 2, -r.w / 2, r.w / 2, 1, 1, "rail")];
  for (const u of [0, L]) out.push({ ...box(u, u, g, g, 1, 2, "rail"), r: s.knob_d / 2 });  // tab knobs
  const c = f.carriage;
  if (!c) return out;
  const [lo, hi] = info?.range ?? [r.carL / 2, L - r.carL / 2];
  if (c.kind === "rack") {
    const half = (c.len * g) / 2;
    out.push(box(lo - half, hi + half, -r.w / 2, r.w / 2, 1, c.level, "carriage"));
    out.push({ ...box(lo - half, hi + half, -(g - 1.25 * s.module), -r.w / 2, c.level, c.level, "carriage"), drive: true });
  } else {
    out.push(box(lo - r.carL / 2, hi + r.carL / 2, -r.w / 2, r.w / 2, 1, 1, "carriage"));
    if (c.kind === "yoke") {
      const sw = slotW(l.size), wall = yokeWall(l.size), aw = sw + 2 * wall, sl = 2 * c.throw + sw + 1;
      out.push(box(lo - r.plugW / 2, hi + r.plugW / 2, -r.w / 2, r.w / 2, 2, c.level + 2, "carriage"));                      // tower
      out.push({ ...box(lo - r.plugW / 2, hi + c.reach * g - aw / 2, -r.w / 2, r.w / 2, c.level + 2, c.level + 2, "carriage"), drive: true });    // beam
      out.push({ ...box(lo + c.reach * g - aw / 2, hi + c.reach * g + aw / 2, -sl / 2 - wall, sl / 2 + wall, c.level + 2, c.level + 2, "carriage"), drive: true }); // slot plate
    } else out.push(box(lo - r.plugW / 2, hi + r.plugW / 2, -r.plugW / 2, r.plugW / 2, 2, c.level + 2, "carriage"));            // post
  }
  return out;
}

/** Two stacked items can join with jaws: jaws on the lower one's top face, pockets in the upper one's bottom. */
export const jawPair = (size: Size, below: Gear, above: Gear) => hasJaws(size, below, "top") && hasJaws(size, above, "bottom");

/** `joint`: how the kit export joins stacked items (jaws by default). */
export function analyze(l: Layout, joint: Joint = "jaws"): Analysis {
  const s = std(l.size);
  const m = s.module, g = s.grid;
  const pairs: Pair[] = [];
  const hits: HardwareHit[] = [];
  const problems: Problem[] = [];
  const pawls = new Map<string, number>();
  const linkages: Linkage[] = [];
  const partners = new Map<string, GearRef>();
  const gears: GearRef[] = l.pins.flatMap(pin => pin.gears.map(gear => ({ pin, gear })));
  const bands: Band[] = l.bands ?? [];
  const bandOf = (b: Band["a"]) => gears.find(x => x.pin.id === b.pin && x.gear.level === b.level);
  const k = (r: GearRef) => key(r.pin, r.gear.level);
  const find = (pred: (o: GearRef) => boolean) => gears.find(pred);

  // everything an item fills: its own level and any extra ones
  type Occ = { ref: GearRef; level: number; r: number; own: boolean; what: string };
  const occ: Occ[] = gears.flatMap(ref => [{ ref, level: ref.gear.level, r: itemR(l.size, ref.gear), own: true, what: label(ref.gear) },
    ...extraLevels(l.size, ref.gear).map(e => ({ ref, level: e.level, r: e.r, own: false, what: e.what }))]);
  const armKinds = new Set(["rocker", "qrlever", "follower", "anchor"]);
  const special = (a: GearRef, b: GearRef) => {
    const ka = kindOf(a.gear), kb = kindOf(b.gear);
    const has = (x: string, y: string) => (ka === x && kb === y) || (ka === y && kb === x);
    return has("pawl", "ratchet") || has("cam", "follower") || has("escwheel", "anchor") || armKinds.has(ka) || armKinds.has(kb);
  };
  const genevaPair = (a: Occ, b: Occ) => (kindOf(a.ref.gear) === "geneva" && !a.own && kindOf(b.ref.gear) === "genevaWheel") || (kindOf(b.ref.gear) === "geneva" && !b.own && kindOf(a.ref.gear) === "genevaWheel");
  // items on the same level: gears mesh or collide, anything else collides
  for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) {
    const a = occ[i], b = occ[j];
    if (a.ref.pin === b.ref.pin || a.level !== b.level) continue;
    const d = dist(l, a.ref.pin, b.ref.pin);
    if (a.own && b.own && meshes(a.ref.gear) && meshes(b.ref.gear)) {
      const req = (m * (teethOf(a.ref.gear) + teethOf(b.ref.gear))) / 2;
      if (Math.abs(d - req) < 0.05) pairs.push({ a: a.ref, b: b.ref, kind: "mesh" });
      else if (d < req + 2 * m) pairs.push({ a: a.ref, b: b.ref, kind: "collide" });
      continue;
    }
    if (a.own && b.own && kindOf(a.ref.gear) === "maggear" && kindOf(b.ref.gear) === "maggear") {
      // magnetic gears turn each other across a 1 mm air gap at the pitch distance of the spur gears they stand for
      const req = (m * (a.ref.gear.teeth + b.ref.gear.teeth)) / 2;
      if (Math.abs(d - req) < 0.05) pairs.push({ a: a.ref, b: b.ref, kind: "mesh" });
      else if (d < a.r + b.r + 0.5) pairs.push({ a: a.ref, b: b.ref, kind: "collide" });
      continue;
    }
    if (a.own && b.own && special(a.ref, b.ref)) continue;           // checked with their partner below
    if (genevaPair(a, b)) continue;                                    // the lock sits in the wheel's arcs by design
    if (d < a.r + b.r + 0.5) {
      if (a.own && b.own) pairs.push({ a: a.ref, b: b.ref, kind: "collide" });
      else problems.push({ text: `${a.own ? label(a.ref.gear) : "the " + a.what} and ${b.own ? label(b.ref.gear) : "the " + b.what} collide on level ${a.level}`, pin: a.ref.pin.id, level: a.ref.gear.level });
    }
  }
  // bands between pulleys
  for (const b of bands) {
    const a = bandOf(b.a), c = bandOf(b.b);
    if (!a || !c || kindOf(a.gear) !== "pulley" || kindOf(c.gear) !== "pulley") { problems.push({ text: "a band is missing a pulley" }); continue; }
    if (a.gear.level !== c.gear.level) problems.push({ text: "a band joins pulleys on different levels", pin: a.pin.id, level: a.gear.level });
    pairs.push({ a, b: c, kind: "band" });
  }
  // an arm (follower, anchor, lever) sweeping over its level: does a segment from the pivot touch other items?
  const sweepHits = (self: GearRef, except: GearRef | undefined, segs: [number, number, number, number][], extra: number, hit: (o: Occ) => void, level = self.gear.level) => {
    for (const o of occ) {
      if (o.level !== level || o.ref.pin === self.pin || (except && o.ref === except)) continue;
      const t = mm(l, o.ref.pin);
      if (segs.some(([ax, ay, bx, by]) => segDist(t.x, t.y, ax, ay, bx, by) < o.r + extra + 0.5)) hit(o);
    }
  };
  // pawls want a ratchet exactly two sockets away along a grid line
  for (const g0 of gears) if (kindOf(g0.gear) === "pawl") {
    const r = find(o => o.pin !== g0.pin && kindOf(o.gear) === "ratchet" && o.gear.level === g0.gear.level && straight(g0.pin, o.pin, 2));
    if (!r) problems.push({ text: "the pawl needs a ratchet two sockets away on its level, straight along the grid", pin: g0.pin.id, level: g0.gear.level });
    else pawls.set(k(g0), angle(l, g0.pin, r.pin));
  }
  // followers want a cam two sockets away on their level; the arm then stays clear of other items on that level
  for (const g0 of gears) if (kindOf(g0.gear) === "follower") {
    const c = find(o => o.pin !== g0.pin && kindOf(o.gear) === "cam" && o.gear.level === g0.gear.level && straight(g0.pin, o.pin, 2));
    if (!c) { problems.push({ text: "the follower needs a cam two sockets away on its level, straight along the grid", pin: g0.pin.id, level: g0.gear.level }); continue; }
    partners.set(k(g0), c); pairs.push({ a: c, b: g0, kind: "cam" });
    const p = mm(l, g0.pin), dir = angle(l, g0.pin, c.pin), A = followerA(l.size);
    const swing = [0, 0.25, 0.5, 0.75, 1.05], ft = followerTail(l.size);
    const seg = (r: number, th: number, back = 1) => [p.x, p.y, p.x + back * r * Math.cos(dir + th), p.y + back * r * Math.sin(dir + th)] as [number, number, number, number];
    const collide = (o: Occ) => pairs.push({ a: g0, b: o.ref, kind: "collide" });
    sweepHits(g0, c, swing.map(th => seg(A, th)), ARM_W(l.size) / 2, collide);
    // the tail with its output post and band lug, on the follower's level; the post's top reaches the next level
    sweepHits(g0, c, swing.map(th => seg(ft.post, th, -1)), ft.r, collide);
    const postEnd = (th: number) => { const [, , x, y] = seg(ft.post, th, -1); return [x, y, x, y] as [number, number, number, number]; };
    sweepHits(g0, c, swing.map(postEnd), ft.r, collide, g0.gear.level + 1);
  }
  // Geneva wheels want their driver three sockets away, one level down
  for (const g0 of gears) if (kindOf(g0.gear) === "genevaWheel") {
    const d = find(o => o.pin !== g0.pin && kindOf(o.gear) === "geneva" && o.gear.level === g0.gear.level - 1 && straight(g0.pin, o.pin, 3));
    if (!d) { problems.push({ text: "the Geneva wheel needs its driver three sockets away, straight along the grid, one level below it", pin: g0.pin.id, level: g0.gear.level }); continue; }
    if ((d.gear.slots ?? 6) !== (g0.gear.slots ?? 6)) problems.push({ text: "the Geneva wheel and its driver disagree on the slot count", pin: g0.pin.id, level: g0.gear.level });
    partners.set(k(g0), d); pairs.push({ a: d, b: g0, kind: "geneva" });
  }
  // anchors want an escape wheel two sockets away on their level; their bar points away from it
  for (const g0 of gears) if (kindOf(g0.gear) === "anchor") {
    const w = find(o => o.pin !== g0.pin && kindOf(o.gear) === "escwheel" && o.gear.level === g0.gear.level && straight(g0.pin, o.pin, 2));
    if (!w) { problems.push({ text: "the anchor needs an escape wheel two sockets away on its level, straight along the grid", pin: g0.pin.id, level: g0.gear.level }); continue; }
    partners.set(k(g0), w); pairs.push({ a: w, b: g0, kind: "escapement" });
    const p = mm(l, g0.pin), q = mm(l, w.pin), e = escDims(l.size), dir = angle(l, g0.pin, w.pin);
    const segs: [number, number, number, number][] = [[p.x, p.y, p.x - e.bar * Math.cos(dir), p.y - e.bar * Math.sin(dir)]];
    for (const sg of [1, -1]) segs.push([p.x, p.y, q.x + e.R * Math.cos(dir + Math.PI + sg * e.alpha), q.y + e.R * Math.sin(dir + Math.PI + sg * e.alpha)]);
    sweepHits(g0, w, segs, ARM_W(l.size) / 2, o => pairs.push({ a: g0, b: o.ref, kind: "collide" }));
  }
  // planet carriers want their 20T sun on the level above, free to turn, and two free sockets for the ring's legs
  const pd = planetaryDims(l.size);
  for (const g0 of gears) if (kindOf(g0.gear) === "carrier") {
    const sun = gearAt(g0.pin, g0.gear.level + 1);
    if (!sun || kindOf(sun) !== "gear" || sun.teeth !== PLN.sun || sun.joined) problems.push({ text: `the planet carrier needs a plain ${PLN.sun}T sun gear on level ${g0.gear.level + 1} of its pin, not joined to it`, pin: g0.pin.id, level: g0.gear.level });
    else partners.set(k(g0), { pin: g0.pin, gear: sun });
    if (g0.gear.level > 2) problems.push({ text: "the carrier must be on level 1 or 2 (the ring sits one level up, a gear on the sun one more)", pin: g0.pin.id, level: g0.gear.level });
    for (const sg of [-1, 1]) {
      const [lx, ly] = g0.gear.legs === "x" ? [sg * pd.legSteps, 0] : [0, sg * pd.legSteps];
      const hit = l.pins.find(q => q.x === g0.pin.x + lx && q.y === g0.pin.y + ly);
      if (hit) problems.push({ text: `a pin sits where the ring gear's leg bolts in, socket ${hit.x + 1}, ${hit.y + 1}`, pin: hit.id });
    }
  }
  for (const g0 of gears) if (kindOf(g0.gear) === "bevel" && g0.gear.level !== 1) problems.push({ text: "a bevel gear sits on level 1: it fills its pin up to the shaft", pin: g0.pin.id, level: g0.gear.level });
  for (const g0 of gears) if (kindOf(g0.gear) === "wormgear" && g0.gear.level !== SHAFT_LEVEL) problems.push({ text: `a worm gear sits on level ${SHAFT_LEVEL}, where the shaft runs`, pin: g0.pin.id, level: g0.gear.level });
  // quick-return levers: the crank's post rides in the slot two levels above the crank's gear
  const crankR = (gr: Gear) => (gr.throw ?? 2 * g) + ARM_W(l.size) / 2 + 1;
  for (const g0 of gears) if (kindOf(g0.gear) === "qrlever") {
    const cp = g0.gear.crank ? pinById(l, g0.gear.crank) : undefined;
    const c = cp?.gears.find(o => o.topper === "crank");
    if (!cp || !c) { problems.push({ text: "the quick-return lever's crank is gone", pin: g0.pin.id, level: g0.gear.level }); continue; }
    const D = dist(l, g0.pin, cp), t = c.throw ?? 2 * g;
    const steps = Math.round(D / g);
    if (!straight(g0.pin, cp, steps) || steps < 2 || steps > 4) problems.push({ text: "the lever's pivot must be 2, 3 or 4 sockets from the crank, straight along the grid", pin: g0.pin.id, level: g0.gear.level });
    if (D - t - slotW(l.size) / 2 - 1 < bearingOD(l.size) / 2 + 4) problems.push({ text: `a ${t} mm crank reaches the lever's pivot: more distance or less throw`, pin: g0.pin.id, level: g0.gear.level });
    if (g0.gear.level !== crankLinkLevel(c.level)) problems.push({ text: `the lever must be on level ${crankLinkLevel(c.level)}, two above its crank`, pin: g0.pin.id, level: g0.gear.level });
    partners.set(k(g0), { pin: cp, gear: c });
    // the bar sweeps +-asin(t/D) about the line to the crank
    const p = mm(l, g0.pin), dir = angle(l, g0.pin, cp), sw = Math.asin(Math.min(1, t / D));
    const len = D + t + slotW(l.size) / 2 + 4 + 3 * m + 8;
    const segs: [number, number, number, number][] = [];
    for (let i = -4; i <= 4; i++) { const a = dir + (sw * i) / 4; segs.push([p.x, p.y, p.x + len * Math.cos(a), p.y + len * Math.sin(a)]); }
    sweepHits(g0, { pin: cp, gear: c }, segs, slotW(l.size) / 2 + 4, o => { if (o.ref.pin !== cp) hits.push({ gear: o.ref, pin: g0.pin, what: "lever" }); });
  }
  // items against other pins' hardware at the same level
  for (const o of occ) for (const pin of l.pins) {
    if (pin === o.ref.pin) continue;
    const lv = o.level;
    const r = o.r;
    const d = dist(l, o.ref.pin, pin);
    const top = topLevel(pin);
    const topG = gearAt(pin, top);
    const topUsed = topG ? top + levelsUsed(l.size, topG) - 1 : top;   // the knob sits above the top item's extra levels
    if (!gearAt(pin, lv) && !pin.gears.some(x => extraLevels(l.size, x).some(e => e.level === lv))) {
      // a bolt with spacers, or the knob on top of the stack
      const hw: HardwareHit["what"] | null = pin.motor ? null : lv <= topUsed ? "spacer" : lv === topUsed + 1 ? "knob" : null;
      if (hw) {
        const hr = hw === "spacer" ? s.spacer_od / 2 : topG?.topper === "pointer" ? s.dial_r : s.knob_d / 2;
        if (d < r + hr + 0.5) hits.push({ gear: o.ref, pin, what: hw });
      }
    }
    // cranks sweep above their gear through the next three levels; pointers one level, out to the dial rim
    for (const x of pin.gears) {
      const isPartner = partners.get(k(o.ref))?.pin === pin || (kindOf(o.ref.gear) === "rocker" && o.ref.gear.rocker?.crank === pin.id);
      if (x.topper === "crank" && lv > x.level && lv <= x.level + 3 && d < r + crankR(x) + 0.5 && !isPartner) hits.push({ gear: o.ref, pin, what: "crank" });
      if (x.topper === "pointer" && lv === x.level + 1 && d < r + pointerReach(l.size) + 0.5) hits.push({ gear: o.ref, pin, what: "pointer" });
    }
    // a motor mount's legs, blocks and cradle
    if (pin.motor) {
      const motorLevel = pin.gears[0]?.level ?? 1;
      const fp = motorFootprint(l, pin);
      const oo = mm(l, pin), p = mm(l, o.ref.pin);
      const rel = { x: p.x - oo.x, y: p.y - oo.y };
      const legHit = lv <= motorLevel && fp.legs.some(leg => Math.hypot(rel.x - leg.x, rel.y - leg.y) < r + leg.r + 0.5);
      const blockHit = lv <= motorLevel && fp.blocks.some(b => polyDist(rel.x, rel.y, b) < r + 0.5);
      const cradleHit = lv > motorLevel && d < r + fp.cradleR + 0.5;
      if (legHit || blockHit || cradleHit) hits.push({ gear: o.ref, pin, what: "mount" });
    }
    // a planet carrier's ring gear legs, columns up to the ring
    for (const x of pin.gears) if (kindOf(x) === "carrier" && lv <= x.level + 1) {
      const oo = mm(l, pin), p = mm(l, o.ref.pin);
      for (const sg of [-1, 1]) {
        const [lx, ly] = x.legs === "x" ? [sg * pd.legSteps * g, 0] : [0, sg * pd.legSteps * g];
        if (Math.hypot(p.x - oo.x - lx, p.y - oo.y - ly) < r + pd.legR + 0.5) hits.push({ gear: o.ref, pin, what: "mount" });
      }
    }
  }
  // items the library does not make in M1
  if (l.size === "M1") {
    for (const g0 of gears) {
      const kd = kindOf(g0.gear);
      if (kd === "ratchet" || kd === "pawl" || kd === "escwheel" || kd === "anchor") problems.push({ text: `the ${label(g0.gear)} is not made in M1`, pin: g0.pin.id, level: g0.gear.level });
      if (kd === "maggear" && g0.gear.teeth < 40) problems.push({ text: "in M1 a magnetic gear needs 16 magnets or more", pin: g0.pin.id, level: g0.gear.level });
    }
    for (const pin of l.pins) if (pin.motor && motorType(pin) === "nema17") problems.push({ text: "the NEMA 17 mount is not made in M1", pin: pin.id });
  }
  // stack rules
  const noTopper = new Set(["pawl", "follower", "anchor", "qrlever", "rocker", "geneva", "winch", "carrier", "bevel"]);
  for (const pin of l.pins) {
    // (a carrier's extra level is the ring, which the sun shares by design)
    const levels = pin.gears.flatMap(x => [x.level, ...(kindOf(x) === "carrier" ? [] : extraLevels(l.size, x).map(e => e.level))]);
    if (new Set(levels).size !== levels.length) problems.push({ text: "two items on one level (a Geneva driver, a winch and a spring gear fill the level above them too)", pin: pin.id });
    const top = topLevel(pin);
    const topG = gearAt(pin, top);
    const used = topG ? top + levelsUsed(l.size, topG) - 1 : top;
    for (const x of pin.gears) {
      const kind = kindOf(x);
      const below = gearAt(pin, x.level - 1);
      if (x.joined && !below) problems.push({ text: `level ${x.level} is joined to an empty level below`, pin: pin.id, level: x.level });
      const compound = !!below && kindOf(below) === "gear" && kind === "gear" && !below.topper && below.teeth > x.teeth && x.coupling !== "magnetic";
      // with jaws, a pair too small for them falls back to dowel pins
      if (x.joined && below && x.coupling !== "magnetic" && !compound && !(joint === "jaws" && jawPair(l.size, below, x)) && (!hasPins(l.size, x) || !hasPins(l.size, below)))
        problems.push({ text: `a ${label(!hasPins(l.size, x) ? x : below)} in ${l.size} is too small for the ${joint === "jaws" ? "jaws or the " : ""}dowel pins: join it only as the small half of a compound gear`, pin: pin.id, level: x.level });
      if ((x.topper === "crank" || x.topper === "pointer") && !(joint === "jaws" && hasJaws(l.size, x, "top")) && !hasPins(l.size, x))
        problems.push({ text: `a ${label(x)} in ${l.size} is too small for the ${joint === "jaws" ? "jaws or the " : ""}dowel pins a ${x.topper} needs: use a bigger gear`, pin: pin.id, level: x.level });
      if (x.coupling === "magnetic" && below) {
        if (!x.joined) problems.push({ text: `level ${x.level} has a magnetic coupling but is not joined`, pin: pin.id, level: x.level });
        if (kindOf(x) !== "gear" || kindOf(below) !== "gear" || x.teeth < MAG_COUPLE_MIN || below.teeth < MAG_COUPLE_MIN || x.topper === "spring" || below.topper)
          problems.push({ text: `a magnetic face coupling joins two plain gears of ${MAG_COUPLE_MIN}T or more`, pin: pin.id, level: x.level });
        if (below.coupling === "magnetic") problems.push({ text: "a gear has magnets in one face only: two magnetic couplings in a row need a plain gear between them", pin: pin.id, level: x.level });
      }
      if (x.joined && below && extraLevels(l.size, below).length) problems.push({ text: `level ${x.level} cannot join a ${kindOf(below) === "carrier" ? "planet carrier" : "two-level part"} below it`, pin: pin.id, level: x.level });
      if (x.topper && x.level !== top) problems.push({ text: `the ${x.topper} must be on the top item of the pin`, pin: pin.id, level: x.level });
      if (x.topper && noTopper.has(kind)) problems.push({ text: `a ${label(x)} cannot carry a ${x.topper}`, pin: pin.id, level: x.level });
      if (x.topper === "crank" && crankLinkLevel(x.level) > 4) problems.push({ text: "a crank needs its gear on level 2 or lower", pin: pin.id, level: x.level });
      if (x.topper === "spring" && (kind !== "gear" || x.teeth < springMinTeeth(l.size))) problems.push({ text: `the spring needs a plain gear of ${springMinTeeth(l.size)}T or more`, pin: pin.id, level: x.level });
    }
    if (used > 4) problems.push({ text: "a pin carries at most 4 levels", pin: pin.id });
    if (pin.motor) {
      if (pin.gears.length !== 1 || pin.gears[0].teeth !== 20 || kindOf(pin.gears[0]) !== "gear") problems.push({ text: "a motor pin carries only its 20T pinion", pin: pin.id });
      for (const [i, j] of motorLegs(pin.motor.dir, motorType(pin))) {
        const hit = l.pins.find(q => q.x === pin.x + i && q.y === pin.y + j);
        if (hit) problems.push({ text: "a pin sits where the motor mount's leg bolts in", pin: hit.id });
      }
    }
  }
  // linkages: a rocker on a pin, driven by a crank on another pin through a coupler link
  for (const g0 of gears) if (kindOf(g0.gear) === "rocker") {
    const rk = g0.gear.rocker;
    const crankPin = rk && pinById(l, rk.crank);
    const crank = crankPin?.gears.find(o => o.topper === "crank");
    if (!rk || !crankPin || !crank) { problems.push({ text: "the rocker's crank is gone", pin: g0.pin.id, level: g0.gear.level }); continue; }
    const throwMm = crank.throw ?? 2 * g;
    const coupler = (rk.coupler - 1) * g, rockerLen = (rk.holes - 1) * g;
    const G = dist(l, crankPin, g0.pin);
    const ok = G + throwMm <= coupler + rockerLen - 0.01 && G - throwMm >= Math.abs(coupler - rockerLen) + 0.01;
    if (!ok) problems.push({ text: `the linkage binds: ${rk.coupler} hole coupler and ${rk.holes} hole rocker cannot follow a ${throwMm} mm crank ${G.toFixed(0)} mm away`, pin: g0.pin.id, level: g0.gear.level });
    if (g0.gear.level !== crankLinkLevel(crank.level)) problems.push({ text: `the rocker must be on level ${crankLinkLevel(crank.level)}, two above its crank`, pin: g0.pin.id, level: g0.gear.level });
    linkages.push({ crank: { pin: crankPin, gear: crank }, rocker: g0, throw: throwMm, coupler, rockerLen, ok });
  }

  // fixtures: rails with their carriages
  const fixtures: FixtureInfo[] = [];
  for (const f of l.fixtures ?? []) {
    const fr = railFrame(l, f);
    const rd = railDims(l.size);
    const info: FixtureInfo = { fixture: f, range: [rd.carL / 2, fr.len - rd.carL / 2], limit: [rd.carL / 2 - 4, fr.len - rd.carL / 2 + 4], ok: true };
    const bad = (text: string) => { problems.push({ text, fixture: f.id }); info.ok = false; };
    if (f.kind === "bracket") {
      const b = bracketDims(l.size);
      info.range = [0, 0]; info.limit = [0, 0];
      for (const pin of l.pins) {
        const p = fr.toLocal(mm(l, pin));
        if (Math.abs(p.v) < 1 && p.u > -1 && p.u < fr.len + 1) bad(`a pin sits under the shaft bracket at socket ${pin.x + 1}, ${pin.y + 1}`);
      }
      const bevel = gears.find(o => kindOf(o.gear) === "bevel" && Math.abs(fr.toLocal(mm(l, o.pin)).v) < 0.05 && Math.abs(fr.toLocal(mm(l, o.pin)).u + b.bevelD) < 0.05);
      const wg = gears.find(o => kindOf(o.gear) === "wormgear" && Math.abs(fr.toLocal(mm(l, o.pin)).u - fr.len / 2) < 0.05 && Math.abs(Math.abs(fr.toLocal(mm(l, o.pin)).v) - (g + pitchR(l.size, o.gear.teeth))) < 0.05);
      if (bevel) info.drive = bevel;
      if (wg) { info.wormGear = wg; info.side = fr.toLocal(mm(l, wg.pin)).v > 0 ? 1 : -1; }
      if (!bevel && !wg) bad("the shaft bracket has nothing on its shaft: a bevel gear two sockets before it on its row turns the shaft, a worm gear on level 4 beside the middle of the bar is turned by it");
      for (const box of fixtureBoxes(l, f, info)) for (const o of occ) {
        if (o.level < box.lo || o.level > box.hi) continue;
        if ((bevel && o.ref === bevel) || (wg && o.ref === wg)) continue;
        const p = fr.toLocal(mm(l, o.ref.pin));
        if (rectDist(p.u, p.v, box.u0, box.u1, box.v0, box.v1) < o.r + 0.5) { hits.push({ gear: o.ref, pin: o.ref.pin, what: box.what === "rail" ? "rail" : "carriage" }); break; }
      }
      fixtures.push(info);
      continue;
    }
    // pins under the rail or its tabs
    for (const pin of l.pins) {
      const p = fr.toLocal(mm(l, pin));
      if (Math.abs(p.v) < 1 && p.u > -1 && p.u < fr.len + 1) bad(`a pin sits under the rail at socket ${pin.x + 1}, ${pin.y + 1}`);
      if (Math.abs(p.v - g) < 1 && (Math.abs(p.u) < 1 || Math.abs(p.u - fr.len) < 1)) bad(`a pin sits where the rail's tab bolts in, socket ${pin.x + 1}, ${pin.y + 1}`);
    }
    const c = f.carriage;
    if (c?.kind === "rack") {
      const half = (c.len * g) / 2;
      info.limit = [half - 4, fr.len - half + 4];
      // the pinion: a gear on the rack's level with its pitch circle on the rack's pitch line (v = -g)
      const pinion = gears.find(o => kindOf(o.gear) === "gear" && o.gear.level === c.level && Math.abs(fr.toLocal(mm(l, o.pin)).v + g + pitchR(l.size, o.gear.teeth)) < 0.05);
      if (pinion) {
        const pu = fr.toLocal(mm(l, pinion.pin)).u;
        info.drive = pinion; info.pinU = pu;
        // the rack can move as long as the pinion stays on its teeth
        info.range = [Math.max(info.limit[0], pu - half + 4), Math.min(info.limit[1], pu + half - 4)];
        if (info.range[0] >= info.range[1]) { info.range = info.limit; bad("the pinion is off the rack's teeth: move it along the rail"); }
      } else { info.range = info.limit; bad(`no pinion drives the rack: put a gear on level ${c.level} two rows from the rail for a 20T, three for a 40T`); }
    } else if (c) {
      // the crank: a gear at the carriage's level with a crank, on the rail's row past its end
      const crank = gears.find(o => o.gear.topper === "crank" && o.gear.level === c.level && Math.abs(fr.toLocal(mm(l, o.pin)).v) < 0.05 && fr.toLocal(mm(l, o.pin)).u > fr.len);
      if (!crank) bad(`no crank drives the ${c.kind}: put a gear with a crank on level ${c.level} on the rail's row, past its end`);
      else {
        const pu = fr.toLocal(mm(l, crank.pin)).u;
        const t = crank.gear.throw ?? 2 * g;
        info.drive = crank; info.pinU = pu;
        if (c.kind === "yoke") {
          if (Math.abs(t - c.throw) > 0.01) bad(`the yoke is cut for a ${c.throw} mm crank, the crank throws ${t} mm`);
          info.range = rangeOver(phi => yokeX(pu, c.reach * g, t, phi));
        } else {
          const len = (c.link - 1) * g;
          if (len <= t + 2) bad(`a ${c.link} hole link is too short for a ${t} mm crank`);
          info.range = rangeOver(phi => sliderX(pu, t, len, phi));
        }
        if (info.range[0] < info.limit[0] - 0.01 || info.range[1] > info.limit[1] + 0.01) bad(`the ${c.kind} runs off the rail: it travels ${info.range[0].toFixed(0)} to ${info.range[1].toFixed(0)} mm from the rail's first socket, the rail allows ${info.limit[0].toFixed(0)} to ${info.limit[1].toFixed(0)}`);
        if (c.level + 2 > 4) bad(`the ${c.kind}'s arm would sit above level 4: the crank gear must be on level 2 or lower`);
      }
    }
    // items that run into the rail or the carriage
    for (const box of fixtureBoxes(l, f, info)) {
      for (const o of occ) {
        if (o.level < box.lo || o.level > box.hi) continue;
        if (info.drive && o.ref === info.drive && box.drive) continue;   // the drive meshes with the rack or sits under the arm by design
        const p = fr.toLocal(mm(l, o.ref.pin));
        const gap = box.r ? Math.hypot(p.u - box.u0, p.v - box.v0) - box.r : rectDist(p.u, p.v, box.u0, box.u1, box.v0, box.v1);
        if (gap < o.r + 0.5) { hits.push({ gear: o.ref, pin: o.ref.pin, what: box.what }); break; }
      }
      // a crank arm sweeps the level above its gear: a circle of the crank's reach
      for (const o of gears) {
        // (a carriage's top stands 1 mm into the gap above its top level, where the arm starts)
        const lv = o.gear.level;
        if (o.gear.topper !== "crank" || (box.drive && o === info.drive)) continue;
        if (!(box.lo <= lv + 1 && lv + 1 <= box.hi) && !(box.what === "carriage" && box.hi === lv)) continue;
        const p = fr.toLocal(mm(l, o.pin));
        const gap = box.r ? Math.hypot(p.u - box.u0, p.v - box.v0) - box.r : rectDist(p.u, p.v, box.u0, box.u1, box.v0, box.v1);
        if (gap < crankR(o.gear) + 0.5) bad(`the crank on the pin at socket ${o.pin.x + 1}, ${o.pin.y + 1} hits ${box.what === "rail" ? (box.r ? "a rail tab's knob" : "the rail") : "the carriage or its post"} as it turns`);
      }
      // knobs of other pins under the arm
      if (box.what === "carriage" && box.lo > 1) for (const pin of l.pins) {
        if (!pin.gears.length || info.drive?.pin === pin || pin.motor) continue;
        const topG = gearAt(pin, topLevel(pin))!;
        const knobLevel = topLevel(pin) + levelsUsed(l.size, topG);
        if (knobLevel < box.lo || knobLevel > box.hi) continue;
        const p = fr.toLocal(mm(l, pin));
        if (rectDist(p.u, p.v, box.u0, box.u1, box.v0, box.v1) < s.knob_d / 2 + 0.5) bad(`the carriage's arm hits the knob on the pin at socket ${pin.x + 1}, ${pin.y + 1}`);
      }
    }
    fixtures.push(info);
  }

  for (const p of pairs) if (p.kind === "collide") problems.push({ text: `${label(p.a.gear)} and ${label(p.b.gear)} on level ${p.a.gear.level} collide`, pin: p.a.pin.id, level: p.a.gear.level });
  const hitName: Record<HardwareHit["what"], string> = { spacer: "a spacer", knob: "a knob", mount: "a mount's leg or block", crank: "a crank", pointer: "a pointer", lever: "the quick-return lever", rail: "a rail or bracket", carriage: "a carriage or the shaft's gears" };
  for (const h of hits) problems.push({ text: `${label(h.gear.gear)} on level ${h.gear.gear.level} hits ${hitName[h.what]}${h.what === "rail" || h.what === "carriage" ? "" : " on another pin"}`, pin: h.gear.pin.id, level: h.gear.gear.level });

  // train solver: breadth first from the input over mesh, band, joined and Geneva edges.
  // Each edge carries the mean ratio; the motion map composes the real angle functions.
  const speed = new Map<string, number>();
  const phase = new Map<string, number>();
  const motion = new Map<string, Motion>();
  const reachable = new Set<string>();
  let locked = false;
  type Edge = { from: GearRef; to: GearRef; ratio: number; mesh?: { dir: number }; geneva?: { n: number; a: number; C: number; dir: number } };
  const adj = new Map<string, Edge[]>();
  const add = (e: Edge) => { const kk = k(e.from); if (!adj.has(kk)) adj.set(kk, []); adj.get(kk)!.push(e); };
  for (const p of pairs) {
    if (p.kind === "mesh") {
      const ta = teethOf(p.a.gear), tb = teethOf(p.b.gear);
      const gate = (from: GearRef) => (kindOf(from.gear) === "partial" ? (from.gear.keep ?? 0.5) : 1);
      add({ from: p.a, to: p.b, ratio: (-ta / tb) * gate(p.a), mesh: { dir: angle(l, p.a.pin, p.b.pin) } });
      add({ from: p.b, to: p.a, ratio: (-tb / ta) * gate(p.b), mesh: { dir: angle(l, p.b.pin, p.a.pin) } });
    } else if (p.kind === "band") {
      const band = bands.find(b => bandOf(b.a) === p.a && bandOf(b.b) === p.b);
      const sgn = band?.crossed ? -1 : 1;
      add({ from: p.a, to: p.b, ratio: (sgn * p.a.gear.teeth) / p.b.gear.teeth });
      add({ from: p.b, to: p.a, ratio: (sgn * p.b.gear.teeth) / p.a.gear.teeth });
    } else if (p.kind === "geneva") {
      const n = p.a.gear.slots ?? 6, gd = genevaDims(l.size, n);
      add({ from: p.a, to: p.b, ratio: -1 / n, geneva: { n, a: gd.a, C: gd.C, dir: angle(l, p.a.pin, p.b.pin) } });
    }
  }
  for (const pin of l.pins) for (const x of pin.gears) if (x.joined) {
    const below = gearAt(pin, x.level - 1);
    if (!below) continue;
    add({ from: { pin, gear: below }, to: { pin, gear: x }, ratio: 1 });
    add({ from: { pin, gear: x }, to: { pin, gear: below }, ratio: 1 });
  }
  // planetary: sun in, carrier out, same way, 1 : (1 + ring / sun); the ring is fixed
  for (const g0 of gears) if (kindOf(g0.gear) === "carrier") {
    const sun = partners.get(k(g0));
    if (!sun) continue;
    add({ from: sun, to: g0, ratio: pd.ratio });
    add({ from: g0, to: sun, ratio: 1 / pd.ratio });
  }
  // shaft brackets: the bevel gear turns the shaft 1:1, the worm turns its gear one tooth per turn
  for (const info of fixtures) if (info.fixture.kind === "bracket" && info.drive && info.wormGear) {
    add({ from: info.drive, to: info.wormGear, ratio: (info.side ?? 1) / info.wormGear.gear.teeth });   // a worm gear cannot drive its worm
  }
  const input = l.input && gears.find(x => x.pin.id === l.input!.pin && x.gear.level === l.input!.level);
  if (input) {
    const k0 = k(input);
    speed.set(k0, 1); phase.set(k0, 0); reachable.add(k0); motion.set(k0, th => th);
    const queue: GearRef[] = [input];
    while (queue.length) {
      const cur = queue.shift()!;
      const kc = k(cur);
      for (const e of adj.get(kc) ?? []) {
        const kt = k(e.to);
        const w = speed.get(kc)! * e.ratio;
        // a loop must agree with itself; a gated edge (from a partial gear) carries a mean ratio, so it cannot disagree
        if (speed.has(kt)) { if (kindOf(cur.gear) !== "partial" && kindOf(e.to.gear) !== "partial" && Math.abs(speed.get(kt)! - w) > 1e-6) locked = true; continue; }
        speed.set(kt, w);
        reachable.add(kt);
        const fromMotion = motion.get(kc)!, fromPhase = phase.get(kc)!;
        let toPhase = fromPhase;
        if (e.mesh) {
          // tooth phase: a tooth of `cur` on the centre line faces a gap of `to`
          const n1 = teethOf(cur.gear), n2 = teethOf(e.to.gear), a = e.mesh.dir;
          const pitch1 = (2 * Math.PI) / n1, pitch2 = (2 * Math.PI) / n2;
          const p1 = ((((fromPhase - a) / pitch1) % 1) + 1) % 1;
          toPhase = a + Math.PI + (0.5 - p1) * pitch2;
        }
        if (e.geneva) {
          // the wheel's slots point at the driver's post while it indexes; between indexes it dwells
          const gv = e.geneva;
          const R0 = gv.dir + Math.PI - (2 * Math.PI) / gv.n;   // slot 1 points at the driver when the post does
          toPhase = R0 + genevaAngle(fromPhase - gv.dir, gv.n, gv.a, gv.C);
          motion.set(kt, th => R0 + genevaAngle(fromMotion(th) - gv.dir, gv.n, gv.a, gv.C));
        } else if (e.mesh && kindOf(e.to.gear) === "partial" && kindOf(cur.gear) !== "partial") {
          // a partial gear turned by a full one follows it only while its toothed sector faces it, then stops for good
          const w = (e.to.gear.keep ?? 0.5) * Math.PI, back = e.mesh.dir + Math.PI, ratio = e.ratio;
          const c0 = Math.atan2(Math.sin(back - toPhase), Math.cos(back - toPhase));   // where the driver touches it, from its +x (the sector's middle)
          const free = (th: number) => toPhase + ratio * (fromMotion(th) - fromPhase);
          const sgn = Math.sign(ratio * (speed.get(kc) ?? 1));
          const lo = Math.abs(c0) > w ? toPhase : toPhase - (w - c0), hi = Math.abs(c0) > w ? toPhase : toPhase + (c0 + w);
          motion.set(kt, th => (sgn >= 0 ? Math.min(free(th), hi) : Math.max(free(th), lo)));
          problems.push({ text: "a partial gear is turned by a full gear here, so it stops once its bare side reaches it: let the partial gear do the driving", pin: e.to.pin.id, level: e.to.gear.level });
        } else if (e.mesh && kindOf(cur.gear) === "partial") {
          const keep = cur.gear.keep ?? 0.5, a = e.mesh.dir, ratio = -teethOf(cur.gear) / teethOf(e.to.gear);
          const base = gateE(fromPhase - a, keep);
          motion.set(kt, th => toPhase + ratio * (gateE(fromMotion(th) - a, keep) - base));
        } else {
          const ratio = e.ratio;
          motion.set(kt, th => toPhase + ratio * (fromMotion(th) - fromPhase));
        }
        phase.set(kt, toPhase);
        queue.push(e.to);
      }
    }
  }
  // escape wheels step half a tooth at a time (items joined to one share its pin, so they step too)
  const smooth = new Map<string, Motion>();
  for (const pin of l.pins) {
    const esc = pin.gears.find(x => kindOf(x) === "escwheel");
    if (!esc) continue;
    for (const x of pin.gears) {
      const kk = key(pin, x.level);
      const mo = motion.get(kk), ph = phase.get(kk);
      if (mo && ph !== undefined && x === esc) smooth.set(kk, mo);
      if (mo && ph !== undefined && (x === esc || x.joined || esc.joined)) motion.set(kk, th => ph + escapeAngle(mo(th) - ph, escDims(l.size).n));
    }
  }
  // a ratchet turning the wrong way against its pawl locks the train
  for (const g0 of gears) if (kindOf(g0.gear) === "pawl") {
    const kk = k(g0);
    if (!pawls.has(kk)) continue;
    const r = gears.find(o => kindOf(o.gear) === "ratchet" && o.gear.level === g0.gear.level && Math.abs(angle(l, g0.pin, o.pin) - pawls.get(kk)!) < 1e-6);
    const w = r && speed.get(k(r));
    // the ratchet runs clockwise (negative, seen from above) past a standard pawl
    if (w && ((w > 0 && !g0.gear.pawlCw) || (w < 0 && g0.gear.pawlCw))) problems.push({ text: "the ratchet turns into its pawl: flip the pawl or the drive", pin: r!.pin.id, level: r!.gear.level });
  }
  // an anchor is cut for one direction of its wheel
  for (const g0 of gears) if (kindOf(g0.gear) === "anchor") {
    const w = partners.get(k(g0));
    const sp = w && speed.get(k(w));
    if (sp && ((sp < 0) !== (g0.gear.anchorCw ?? true))) problems.push({ text: `the escape wheel runs ${sp < 0 ? "clockwise" : "counter-clockwise"}: use the ${sp < 0 ? "standard anchor" : "mirrored anchor (ANCHOR-L)"}`, pin: g0.pin.id, level: g0.gear.level });
  }
  // a snail cam has a step: turning counter-clockwise (seen from above) it drives the step into the nose and jams
  for (const g0 of gears) if (kindOf(g0.gear) === "follower") {
    const c = partners.get(k(g0));
    const sp = c && c.gear.cam === "snail" ? speed.get(k(c)) : undefined;
    if (sp && sp > 0) problems.push({ text: "the snail cam turns counter-clockwise, so its step runs into the follower's nose and jams: turn the drive the other way", pin: c!.pin.id, level: c!.gear.level });
  }
  if (locked) problems.push({ text: "the train is locked: a loop disagrees with itself" });
  return { pairs, hits, problems, speed, phase, motion, smooth, locked, reachable, pawls, linkages, partners, fixtures };
}

export type BomLine = { name: string; title: string; qty: number; params?: Record<string, string | number> };

/** What to print and buy for a layout. Printed parts carry catalog-style names and params for the kit zip.
 *  With jaws, each item's top face gets jaws only where something is joined onto it (or a crank or
 *  pointer keys onto it) and is flat otherwise, so a free item can sit right above it; a joined pair
 *  too small for the jaws gets dowel pin holes in both faces instead. */
export function billOfMaterials(l: Layout, joint: Joint = "jaws"): { printed: BomLine[]; hardware: BomLine[]; items: Map<string, Record<string, string | number>> } {
  const s = std(l.size);
  const printed = new Map<string, BomLine>();
  const hardware = new Map<string, BomLine>();
  // `items`: the printed part behind each thing on the board, for the 3D view: "tile", "knob:<pin>",
  // and key(pin, level) for each item. Set `tag` and the next printed part is recorded under it.
  const items = new Map<string, Record<string, string | number>>();
  let tag: string | null = null;
  const addP = (name: string, title: string, params: Record<string, string | number>, qty = 1) => {
    if (tag) { items.set(tag, params); tag = null; }
    const e = printed.get(name); if (e) e.qty += qty; else printed.set(name, { name, title, qty, params });
  };
  const addH = (name: string, title: string, qty = 1) => { const e = hardware.get(name); if (e) e.qty += qty; else hardware.set(name, { name, title, qty }); };
  const bolt = (levels: number, qty = 1) => addH(`bolt-${levels}`, `${s.bolt} x ${s.bolt_lengths[String(levels)] ?? "?"} mm hex bolt`, qty);
  const bearing = (qty = 1) => addH("bearing", `${s.bearing} bearing`, qty);
  const spacer = (h: number, qty = 1) => addP(`S${h}`, `Spacer ${h} mm`, { part: "spacer", spacer_h: h }, qty);
  const hw = s.hardware, mag = magnetSize(l.size), jaws = joint === "jaws";
  const dowel = (qty = 1) => addH("pin", `${hw.pin} steel dowel pin`, qty);
  const hubPins = () => addH("pin-hub", `${hw.pin_hub} steel dowel pin (hub ring)`, 3);
  const cap = (qty = 1) => { addP("CAP", "Post cap", { part: "cap" }, qty); dowel(qty); };   // each cap is keyed by a pin in its post
  const magnets = (qty: number) => addH("magnet", `${mag.d} x ${mag.h} mm neodymium disc magnet`, qty);
  const postBolt = (mm: number) => { addH(`bolt-post-${mm}`, `${s.bolt} x ${mm} mm hex bolt (crank post)`); addH("nut", `${s.nut} nut`); };
  const rockers = l.pins.flatMap(p => p.gears.filter(x => kindOf(x) === "rocker" && x.rocker));
  const linkageCranks = new Set(rockers.map(x => x.rocker!.crank));
  const leverCranks = new Set(l.pins.flatMap(p => p.gears.filter(x => kindOf(x) === "qrlever" && x.crank).map(x => x.crank!)));
  const fixtureCranks = new Map<string, "yoke" | "slider">();

  tag = "tile";
  addP(`B${l.tile.nx}x${l.tile.ny}`, `Tile ${l.tile.nx}x${l.tile.ny}`, { part: "tile", tile_nx: l.tile.nx, tile_ny: l.tile.ny, flip: "true" }, l.tiles.cols * l.tiles.rows);
  // fixtures first: they decide which cranks get a handle
  for (const f of l.fixtures ?? []) {
    if (f.kind === "bracket") {
      tag = `bracket:${f.id}`;
      addP("BRACKET", `Shaft bracket, housings ${f.span} sockets apart`, { part: "bracket", span: f.span });
      bolt(1, f.span - 1); addH("nut", `${s.nut} nut`, f.span - 1);
      addH(`shaft-bolt`, `${s.bolt} x ${hw.shaft_bolt} mm hex bolt as the shaft`); addH("nut", `${s.nut} nut`, 2); bearing(2);
      const fr = railFrame(l, f);
      const hasBevel = l.pins.some(p => p.gears.some(x => kindOf(x) === "bevel") && Math.abs(fr.toLocal(socketPos(l, p.x, p.y)).v) < 0.05 && fr.toLocal(socketPos(l, p.x, p.y)).u < 0);
      const hasWorm = l.pins.some(p => p.gears.some(x => kindOf(x) === "wormgear") && Math.abs(fr.toLocal(socketPos(l, p.x, p.y)).u - fr.len / 2) < 0.05);
      tag = `bevelshaft:${f.id}`;
      if (hasBevel) addP("BEVEL-S", "Bevel gear on the shaft", { part: "bevel_shaft" });
      tag = `worm:${f.id}`;
      if (hasWorm) addP("WORM", "Worm for the shaft bracket", { part: "worm", span: f.span });
      tag = null;
      continue;
    }
    tag = `rail:${f.id}`;
    addP(`RAIL${f.n}`, `Slider rail over ${f.n} sockets`, { part: "rail", rail_n: f.n });
    tag = `railknob:${f.id}`;
    addP("K", "Bolt knob", { part: "knob" }, 2); bolt(1, 2); addH("nut", `${s.nut} nut`, 2);
    const c = f.carriage;
    if (!c) continue;
    tag = `car:${f.id}`;
    if (c.kind === "rack") { addP(`RACK${c.len}${c.level > 1 ? `-L${c.level}` : ""}`, `Rack carriage, ${c.len} steps, teeth at level ${c.level}`, { part: "rack", rack_len: c.len, level: c.level, flip: "true" }); continue; }
    const fr = railFrame(l, f);
    const crank = l.pins.find(p => p.gears.some(x => x.topper === "crank" && x.level === c.level) && Math.abs(fr.toLocal(socketPos(l, p.x, p.y)).v) < 0.05 && fr.toLocal(socketPos(l, p.x, p.y)).u > fr.len);
    if (crank) fixtureCranks.set(crank.id, c.kind);
    tag = `car:${f.id}`;
    addP("CARRIAGE", "Carriage with a plug pocket", { part: "carriage", flip: "true" });
    tag = `top:${f.id}`;
    if (c.kind === "yoke") addP(`YOKE${c.throw}R${c.reach}${c.level > 1 ? `-L${c.level}` : ""}`, `Scotch yoke for a ${c.throw} mm crank on level ${c.level}, reach ${c.reach}`, { part: "yoke", level: c.level, throw: c.throw, reach: c.reach, flip: "true" });
    else { addP(`SLPOST${c.level > 1 ? `-L${c.level}` : ""}`, `Slider post for a crank on level ${c.level}`, { part: "slider_post", level: c.level }); tag = `link:${f.id}`; addP(`L${c.link}`, `Link, ${c.link} holes`, { part: "link", holes: c.link }); bearing(); cap(); }
  }
  for (const pin of l.pins) {
    if (!pin.gears.length) continue;
    const top = topLevel(pin);
    const topG = gearAt(pin, top)!;
    const used = top + levelsUsed(l.size, topG) - 1;
    if (pin.motor) {
      const lv = pin.gears[0].level;
      tag = `mount:${pin.id}`;
      if (motorType(pin) === "nema17") {
        tag = `mount:${pin.id}`;
        addP(lv === 1 ? "NEMA17" : `NEMA17-L${lv}`, `NEMA 17 motor mount, pinion at level ${lv}`, { part: "nema_mount", level: lv });
        tag = key(pin, lv);
        addP("PINION5", "Motor pinion 20T, 5 mm D bore", { part: "pinion", shaft: "nema17" });
        addH("nema17", "NEMA 17 stepper motor with a driver, 4 x M3 x 8 screws");
      } else {
        tag = `mount:${pin.id}`;
        addP(lv === 1 ? "MOTOR" : `MOTOR${lv}`, `N20 motor mount, pinion at level ${lv}`, { part: "motor_mount", level: lv });
        tag = key(pin, lv);
        addP("PINION", "Motor pinion 20T", { part: "pinion", shaft: "n20" });
        addH("n20", "N20 gearmotor, 100:1 to 300:1, with 2 x M1.6 screws");
      }
      tag = `mountknob:${pin.id}`;
      addP("K", "Bolt knob", { part: "knob" }, 2);
      bolt(lv, 2);
      addH("nut", `${s.nut} nut`, 2);
      continue;
    }
    const dialOnJaws = topG.topper === "pointer" && jaws && hasJaws(l.size, topG, "top");
    tag = `knob:${pin.id}`;
    if (topG.topper === "pointer") addP(dialOnJaws ? "DIALK" : jaws ? "DIALK-P" : "DIALK", "Dial knob", { part: "dial_knob", ...(jaws && !dialOnJaws ? { joint: "pins" } : {}) }); else addP("K", "Bolt knob", { part: "knob" });
    tag = null;
    addP("BS", "Base spacer", { part: "base_spacer" });
    if (dialOnJaws) { const lv = String(Math.min(4, used)); addH(`dial-bolt-${lv}`, `${s.bolt} x ${s.dial_bolt_lengths[lv] ?? "?"} mm hex bolt (under the dial knob)`); }
    else bolt(Math.min(4, used));
    addH("nut", `${s.nut} nut`);
    const sorted = [...pin.gears].sort((a, b) => a.level - b.level);
    if (sorted[0].level > 1) spacer(s.level, sorted[0].level - 1); // empty levels under the first item
    // The faces of an item with jaws: [joint_top, joint_bottom] params ("" for the default), a name
    // suffix and a title note. `upper` is the item whose top face counts (a compound's upper gear).
    const faces = (lower: Gear, upper: Gear) => {
      if (!jaws) return { params: {}, suffix: "", note: "" };
      const idx = sorted.indexOf(upper), above = sorted[idx + 1], below = sorted[sorted.indexOf(lower) - 1];
      // (a face too small for the jaws has pin holes anyway)
      let top = "", bottom = "";
      const topJaws = hasJaws(l.size, upper, "top");
      if (upper.topper === "crank" || upper.topper === "pointer") top = "";
      else if (above && above.joined && above.coupling !== "magnetic" && above.level === upper.level + 1) top = !jawPair(l.size, upper, above) && topJaws ? "pins" : "";
      else if (topJaws && !(above?.joined && above.coupling === "magnetic")) top = "flat";   // nothing keys onto it: keep the face flat for whatever sits above
      if (lower.joined && below && lower.coupling !== "magnetic" && !jawPair(l.size, below, lower) && hasJaws(l.size, lower, "bottom")) bottom = "pins";
      const params: Record<string, string> = {};
      if (top) params.joint_top = top;
      if (bottom) params.joint_bottom = bottom;
      const suffix = (top === "flat" ? "-FT" : top === "pins" ? "-PT" : "") + (bottom === "pins" ? "-PB" : "");
      const note = [top === "flat" ? "flat top" : top === "pins" ? "pin holes on top" : "", bottom === "pins" ? "pin holes underneath" : ""].filter(Boolean).join(", ");
      return { params, suffix, note: note ? `, ${note}` : "" };
    };
    for (let i = 0; i < sorted.length; i++) {
      const x = sorted[i];
      const above = sorted[i + 1];
      const kind = kindOf(x);
      if (kind === "gear" && !x.topper && above?.joined && above.coupling !== "magnetic" && kindOf(above) === "gear" && x.teeth > above.teeth && above.level === x.level + 1) {
        const f = faces(x, above);
        tag = key(pin, x.level);
        addP(`G${x.teeth}-${above.teeth}${f.suffix}`, `Compound ${x.teeth}T over ${above.teeth}T${f.note}`, { part: "compound", teeth: x.teeth, teeth_upper: above.teeth, face: "spokes", ...f.params });
        bearing(2);
        spacer(3); // between the compound's two bearings
        i++; // the upper gear is part of the compound
        topper(above);
        if (sorted[i + 1]) joinTo(above, sorted[i + 1]);
        continue;
      }
      const f = faces(x, x), sf = f.suffix, nt = f.note, fp = f.params;
      tag = key(pin, x.level);
      switch (kind) {
        case "gear":
          if (x.topper === "spring") addP(`SG${x.teeth}${sf}`, `Spring gear ${x.teeth}T${nt}`, { part: "spring_gear", teeth: x.teeth, ...fp });
          else if ((above?.joined && above.coupling === "magnetic") || (x.joined && x.coupling === "magnetic")) {
            const side = above?.joined && above.coupling === "magnetic" ? "top" : "bottom";
            addP(`G${x.teeth}-M${side === "top" ? "T" : "B"}${sf}`, `Gear ${x.teeth}T, magnet pockets in the ${side} face${nt}`, { part: "gear", teeth: x.teeth, magnets: side, ...fp });
            magnets(MAGF_N);
          } else addP(`G${x.teeth}${sf}`, `Gear ${x.teeth}T${nt}`, { part: "gear", teeth: x.teeth, face: x.teeth >= 40 ? "spokes" : "solid", ...fp });
          bearing(); break;
        case "partial": addP(`G${x.teeth}${x.keep === 0.25 ? "Q" : "H"}${sf}`, `Intermittent gear ${x.teeth}T, teeth on ${x.keep === 0.25 ? "a quarter" : "half"} the rim${nt}`, { part: "partial", teeth: x.teeth, keep: x.keep === 0.25 ? "quarter" : "half", ...fp }); bearing(); break;
        case "pulley": addP(`P${x.teeth}${sf}`, `Pulley ${x.teeth}${nt}`, { part: "pulley", pulley_n: x.teeth, ...fp }); bearing(); break;
        case "ratchet": addP(`RATCHET${sf}`, `Ratchet wheel${nt}`, { part: "ratchet", ...fp }); bearing(); break;
        case "pawl": addP(x.pawlCw ? "PAWL-L" : "PAWL", x.pawlCw ? "Pawl, locks clockwise" : "Pawl", { part: "pawl", flip_pawl: x.pawlCw ? "true" : "false" }); break;
        case "rocker": {
          const rk = x.rocker!;
          tag = `rockerlink:${key(pin, x.level)}`;
          addP(`L${rk.holes}`, `Link, ${rk.holes} holes`, { part: "link", holes: rk.holes }); bearing();
          tag = `couplerlink:${key(pin, x.level)}`;
          addP(`L${rk.coupler}`, `Link, ${rk.coupler} holes`, { part: "link", holes: rk.coupler }); bearing(2);
          tag = `joint:${key(pin, x.level)}`;
          addP("JOINT", "Joint post", { part: "joint" }); spacer(3); cap();
          break;
        }
        case "cam": { const c = x.cam ?? "eccentric"; addP(`CAM-${c[0].toUpperCase()}${sf}`, `${c[0].toUpperCase()}${c.slice(1)} cam${nt}`, { part: "cam", cam: c, ...fp }); bearing(); break; }
        case "follower": addP("FOLLOWER", "Cam follower arm", { part: "follower" }); bearing(); addH("band", "rubber band or O-ring, from the follower's tail to a pin two sockets back and one over"); addH("follower-post", `${s.bolt} x ${hw.follower_bolt} mm bolt, a nut and a bearing for the follower's output post (only with a link on it)`); break;
        case "geneva": addP(`GENEVA${x.slots ?? 6}-D${sf}`, `Geneva driver, ${x.slots ?? 6} slot, on a 40T gear${nt}`, { part: "geneva_driver", slots: x.slots ?? 6, ...fp }); bearing(2); spacer(3); break;
        case "genevaWheel": addP(`GENEVA${x.slots ?? 6}${sf}`, `Geneva wheel, ${x.slots ?? 6} slots${nt}`, { part: "geneva_wheel", slots: x.slots ?? 6, ...fp }); bearing(); break;
        case "qrlever": {
          const cp = x.crank ? pinById(l, x.crank) : undefined;
          const c = cp?.gears.find(o => o.topper === "crank");
          const d = cp ? Math.round(Math.hypot(cp.x - pin.x, cp.y - pin.y)) : 3, t = c?.throw ?? 2 * s.grid;
          addP(`QR${d}-${t}`, `Quick-return lever, pivot ${d} steps from a ${t} mm crank`, { part: "qr_lever", d_steps: d, throw: t }); bearing(); break;
        }
        case "escwheel": addP(`ESCWHEEL${sf}`, `Escape wheel, 15 teeth${nt}`, { part: "escape_wheel", ...fp }); bearing(); break;
        case "anchor": addP(x.anchorCw === false ? "ANCHOR-L" : "ANCHOR", `Anchor with balance bar, wheel runs ${x.anchorCw === false ? "counter-clockwise" : "clockwise"}`, { part: "anchor", cw: x.anchorCw === false ? "false" : "true" }); bearing(); addH("nut", `${s.nut} nut`); break;
        case "winch": addP(`WINCH${sf}`, `Winch drum, two levels${nt}`, { part: "winch", ...fp }); addP("WFLANGE", "Winch top flange", { part: "winch_flange" }); addP("HOOK", "String hook", { part: "hook" }); bearing(2); spacer(3); addH("string", "1 m of string"); break;
        case "carrier": {
          addP(`CARRIER${sf}`, `Planet carrier, 60T with four posts${nt}`, { part: "carrier", ...fp }); bearing();
          if (jaws) addP("G20-FT", "Gear 20T, flat top", { part: "gear", teeth: 20, face: "solid", joint_top: "flat" }, 2);   // two planets
          else addP("G20", "Gear 20T", { part: "gear", teeth: 20, face: "solid" }, 2);
          bearing(2); cap(2);
          tag = `ring:${key(pin, x.level)}`;
          addP(`RING-L${x.level + 1}`, `Planetary ring gear over level ${x.level + 1}`, { part: "ring", level: x.level + 1, flip: "true" });
          // the leg screws sink into the leg tops (no knobs), so a gear may pass over the ring
          addH(`ring-screw-${x.level + 1}`, `${s.bolt} x ${ringBolt(l.size, x.level + 1)} mm socket or button head screw (ring leg)`, 2); addH("nut", `${s.nut} nut`, 2);
          break;
        }
        case "bevel": addP(`${x.teeth === 40 ? "BEVEL40" : "BEVEL"}${sf}`, `Bevel gear on a ${x.teeth}T spur${nt}`, { part: "bevel", teeth: x.teeth, ...fp }); bearing(); break;
        case "wormgear": addP(`WG${x.teeth}${sf}`, `Worm gear ${x.teeth}T${nt}`, { part: "worm_gear", teeth: x.teeth, ...fp }); bearing(); break;
        case "flywheel": addP(`FLYWHEEL${sf}`, `Flywheel, eight nut pockets${nt}`, { part: "flywheel", ...fp }); bearing(); addH("nut", `${s.nut} nut`, 8); break;
        case "maggear": { const n = magPoles(x); addP(`MG${n}${sf}`, `Magnetic gear, ${n} magnets (like a ${x.teeth}T)${nt}`, { part: "mag_gear", poles: n, ...fp }); bearing(); magnets(n); break; }
      }
      tag = null;
      topper(x);
      if (above) joinTo(x, above);
    }
    // what goes between an item and the next one up its pin: spacers, and for a joined pair
    // nothing with jaws (or three dowel pins where they do not fit), three dowel pins with pins,
    // plus three screws, nuts and the joint ring with bolts when both have room; for a
    // magnetic coupling the barrier in place of the spacer
    function joinTo(x: Gear, above: Gear) {
      if (above.joined && above.coupling === "magnetic") { addP("MAGB", "Magnetic coupling barrier", { part: "barrier" }); return; }
      if (above.joined && !(jaws && jawPair(l.size, x, above))) {
        dowel(3);
        if (joint === "bolts" && hasScrews(l.size, x) && hasScrews(l.size, above)) {
          const m = hw.screw.split(" ")[0];
          addH("m3screw", `${hw.screw} socket head screw`, 3); addH("m3nut", `${m} nut`, 3);
          addP("JRING", "Joint ring for screwed gears", { part: "joint_ring" });
        }
      }
      spacersBetween(x.level + levelsUsed(l.size, x) - 1, above.level);
    }
    function topper(x: Gear) {
      // with jaws a crank or pointer keys onto the item's jaws; on an item too small for them it takes the pins
      const keyed = !jaws || hasJaws(l.size, x, "top"), p: Record<string, string> = keyed ? {} : { joint: "pins" }, ps = keyed ? "" : "-P";
      const tk = key(pin, x.level);
      tag = `pointer:${tk}`;
      if (x.topper === "pointer") { addP(`PTR${ps}`, `Pointer${keyed ? "" : ", pinned"}`, { part: "pointer", flip: "true", ...p }); if (!jaws || !keyed) hubPins(); }
      if (x.topper === "spring") addP("SPRING", "Spiral wind-up spring", { part: "spring" });
      if (x.topper === "crank") {
        const t = x.throw ?? 2 * s.grid;
        tag = `crank:${tk}`;
        addP(`CRANK${t}${ps}`, `Crank, ${t} mm throw${keyed ? "" : ", pinned"}`, { part: "crank", throw: t, flip: "true", ...p });
        if (!jaws || !keyed) hubPins();
        // the post is a kit bolt, head in the arm's pocket, with a nut on top of what rides it
        const fx = fixtureCranks.get(pin.id);
        if (linkageCranks.has(pin.id)) postBolt(hw.crank_bolt);                                // the link's bearing is counted with the rocker
        else if (leverCranks.has(pin.id) || fx) { postBolt(hw.crank_bolt); bearing(); }
        else { postBolt(hw.handle_bolt); tag = `sh:${tk}`; addP("SH", "Handle spacer", { part: "handle_spacer" }); tag = `handle:${tk}`; addP("HANDLE", "Handle grip", { part: "handle" }); }
      }
      tag = null;
    }
    function spacersBetween(lo: number, hi: number) {
      for (let kk = lo; kk < hi; kk++) {
        spacer(3);
        if (kk > lo) spacer(s.level); // an empty level in between
      }
    }
  }
  if (l.bands?.length) addH("band", "rubber band or O-ring", l.bands.length);
  return { printed: [...printed.values()], hardware: [...hardware.values()], items };
}

export const ratioText = (w: number) => {
  if (!w) return "not driven";
  const r = Math.abs(w);
  const dir = w > 0 ? "same way as the input" : "opposite to the input";
  return r >= 1 ? `${fmt(r)}× the input speed, ${dir}` : `1/${fmt(1 / r)} of the input speed, ${dir}`;
};
const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(2));

export const sizeOf = (size: Size) => catalog.standards[size];
export { pitchR, tipR };
