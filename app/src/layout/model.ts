// The layout tester's data model: a board of tiles, pins in sockets, items
// stacked on pins by level (gears and, since phase 4, pulleys, ratchets, pawls,
// rockers, cams, Geneva parts, levers, escapements, winches), things that ride on
// a gear's top face (a crank, a pointer, a spring), motors, bands between pulleys
// and fixtures bolted to the board (slider rails with their carriages).
// Everything is in socket units; the standard gives the millimetres.
import { catalog, type Size, type Standard } from "../parts";

export type Teeth = 20 | 30 | 40 | 50 | 60 | 70 | 80;
export const TEETH: Teeth[] = [20, 30, 40, 50, 60, 70, 80];
export const MAX_LEVEL = 4;

/** What sits on one level of a pin. `teeth` is the size for every kind: a pulley's
 *  size number, a link's holes, 12 for a ratchet, 40 for a Geneva driver, 15 for an escape wheel. */
export type ItemKind =
  | "gear" | "pulley" | "ratchet" | "pawl" | "rocker"
  | "cam" | "follower" | "geneva" | "genevaWheel" | "partial" | "qrlever" | "escwheel" | "anchor" | "winch"
  | "carrier" | "bevel" | "wormgear" | "flywheel" | "maggear";
export type Topper = "crank" | "pointer" | "spring";
export type CamKind = "eccentric" | "heart" | "snail";
export type Gear = {
  level: number;      // 1..MAX_LEVEL
  teeth: Teeth;
  joined: boolean;    // turns with the item one level below (jaws, dowel pins or screws, or one compound part)
  /** joined by magnets through a barrier instead of pins: the item below has magnets in its top face, this one in its bottom */
  coupling?: "magnetic";
  kind?: ItemKind;    // default gear
  topper?: Topper;    // on a gear's top face: a crank (handle or linkage), a pointer with its dial, or the wind-up spring
  throw?: number;     // crank: post distance from the axis, mm
  pawlCw?: boolean;   // pawl: locks clockwise (default locks counter-clockwise)
  // rocker: a link pivoting on this pin, driven through a coupler link by the crank on another pin
  rocker?: { crank: string; coupler: number; holes: number };
  cam?: CamKind;      // cam disc profile
  slots?: 6 | 8;      // Geneva driver and wheel
  keep?: 0.5 | 0.25;  // partial gear: how much of the rim has teeth
  crank?: string;     // quick-return lever: the pin whose crank post rides in its slot
  anchorCw?: boolean; // anchor for an escape wheel that runs clockwise (default) or not
  legs?: "x" | "y";   // carrier: which axis the ring gear's legs lie along (default y)
};

export type Pin = {
  id: string; x: number; y: number; gears: Gear[];
  /** A motor on this socket instead of a bolt: its 20T pinion is gears[0]. An N20's legs
   *  sit at (-1, 2) and (1, 2) grid steps, a NEMA 17's at (-2, 0) and (2, 0), turned by `dir` quarter turns. */
  motor?: { dir: 0 | 1 | 2 | 3; type?: MotorType };
};

export type MotorType = "n20" | "nema17";
export type Band = { a: { pin: string; level: number }; b: { pin: string; level: number }; crossed: boolean };

/** What rides on a rail: a rack (teeth at `level`, driven by a gear on the rows below the
 *  rail), a scotch yoke or a slider post (both driven by the crank of a gear at `level`
 *  on a pin on the rail's own row, past its end). */
export type Carriage =
  | { kind: "rack"; len: number; level: number }
  | { kind: "yoke"; level: number; throw: number; reach: number }
  | { kind: "slider"; level: number; link: number };
/** A slider rail bolted along `n` sockets from (x, y) in direction `dir` (quarter turns
 *  from +x). Its bolt tabs are on the row to its left (+v), the rack's teeth face right (-v). */
export type Fixture =
  | { id: string; kind: "rail"; x: number; y: number; dir: 0 | 1 | 2 | 3; n: number; carriage: Carriage | null }
  /** A shaft bracket: housings on the sockets at u = 0 and u = span, bolts between them, the
   *  shaft at the middle of level 4. A bevel gear on the row two sockets before it turns the
   *  shaft; a worm gear on level 4 beside the middle of the bar is turned by the worm. */
  | { id: string; kind: "bracket"; x: number; y: number; dir: 0 | 1 | 2 | 3; span: number };

export type Layout = {
  size: Size;
  tile: { nx: number; ny: number };  // sockets per tile
  tiles: { cols: number; rows: number }; // tiles across and down
  pins: Pin[];
  bands?: Band[];
  fixtures?: Fixture[];
  input: { pin: string; level: number } | null;
  rpm: number;
};

export const std = (size: Size): Standard => catalog.standards[size];
/** The M2, M1.5 or M1 value of a size-specific constant (sz() in standard.scad). */
export const sz = <T,>(size: Size, m2: T, m15: T, m1: T): T => (size === "M1" ? m1 : size === "M1.5" ? m15 : m2);
export const boardW = (l: Layout) => l.tile.nx * l.tiles.cols;
export const boardH = (l: Layout) => l.tile.ny * l.tiles.rows;
/** Socket centre in mm. */
export const socketPos = (l: Layout, i: number, j: number) => { const g = std(l.size).grid; return { x: g * (i + 0.5), y: g * (j + 0.5) }; };
export const pinById = (l: Layout, id: string) => l.pins.find(p => p.id === id);
export const gearAt = (p: Pin, level: number) => p.gears.find(g => g.level === level);
export const topLevel = (p: Pin) => p.gears.reduce((m, g) => Math.max(m, g.level), 0);
export const kindOf = (g: Gear): ItemKind => g.kind ?? "gear";
export const pitchR = (size: Size, teeth: number) => (std(size).module * teeth) / 2;
export const tipR = (size: Size, teeth: number) => (std(size).module * (teeth + 2)) / 2;
export const bearingOD = (size: Size) => Number(std(size).bearing.split("x")[1]);
export const boltD = (size: Size) => Number(std(size).bolt.slice(1));
/** Kinds that mesh like a gear (tooth count rule). */
export const meshes = (g: Gear) => { const k = kindOf(g); return k === "gear" || k === "partial" || k === "geneva" || k === "carrier" || k === "bevel" || k === "wormgear"; };
export const teethOf = (g: Gear) => (kindOf(g) === "geneva" ? 40 : kindOf(g) === "carrier" ? 60 : g.teeth);

// Phase 4b dimensions, in step with scad/lib/mechanisms.scad -------------------------
export const camDims = (size: Size) => { const s = std(size); return { r0: bearingOD(size) / 2 + 4, lift: s.grid / 2 }; };
/** Cam radius at angle a (radians) in the cam's own frame. */
export function camR(size: Size, kind: CamKind, a: number): number {
  const { r0, lift } = camDims(size);
  const t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (kind === "eccentric") { const e = lift / 2, R = r0 + e; return e * Math.cos(t) + Math.sqrt(R * R - e * e * Math.sin(t) ** 2); }
  if (kind === "heart") return r0 + lift * (1 - Math.abs(t - Math.PI) / Math.PI);
  return r0 + (lift * t) / (2 * Math.PI);
}
export const followerA = (size: Size) => 1.2 * std(size).grid;
export const noseR = (size: Size) => 1.5 * std(size).module;
/** The follower's tail (mirrors mechanisms.scad): the output post at `post` behind the
 *  pivot (its end radius `r`; its bearing one level up), the band hole at `band`
 *  (x back along the tail, y toward the nose's side). */
export const followerTail = (size: Size) => sz(size,
  { post: 20.5, r: 9.65, band: [-20.5, 11.65] as const },
  { post: 17, r: 7.92, band: [-17, 9.92] as const },
  { post: 14, r: 6.76, band: [-14, 8.76] as const });
export const postD = (size: Size) => boltD(size) - 0.1;
export function genevaDims(size: Size, n: number) {
  const C = 3 * std(size).grid;
  const a = C * Math.sin(Math.PI / n), b = C * Math.cos(Math.PI / n);
  // rim: the wheel stops short of b so its slot mouths pass the driver's top bearing (gen_rim in mechanisms.scad)
  const rim = Math.min(b, C - bearingOD(size) / 2 - 1.2);
  return { C, a, b, rim, lock: a - postD(size) / 2 - 3.5, slotW: postD(size) + 0.6, rIn: C - a - postD(size) / 2 - 1.2 };
}
export function escDims(size: Size) {
  const C = 2 * std(size).grid, alpha = (54 * Math.PI) / 180;
  const R = C * Math.cos(alpha);
  return { C, R, alpha, n: 15, depth: 0.22 * R, bar: 2.5 * std(size).grid };
}
export const slotW = (size: Size) => bearingOD(size) + 0.5;
/** Frame wall around the scotch yoke slot (sides and ends), as YOKE_WALL in mechanisms.scad. */
export const yokeWall = (size: Size) => sz(size, 5, 4.5, 4);
export const springWallR = (size: Size) => sz(size, 8, 6.5, 5) + 4.5 * sz(size, 3.2, 2.5, 2) + 2.5 + 2;
export const springMinTeeth = (size: Size) => sz(size, 30, 40, 50);
export const winchR = (size: Size) => std(size).grid + 2;
export function railDims(size: Size) {
  const s = std(size);
  const w = s.grid - 4, t = sz(size, 3, 2.5, 2), ridge = sz(size, 2.5, 2, 1.6);
  return { w, t, ridge, tabR: (boltD(size) * 1.6 + 5) / 2 + 0.3, carL: 2 * s.grid, baseTop: 2 + s.level - 2, plugW: w - 4, top: t + ridge };
}
// Phase 4c dimensions, in step with scad/lib/drives.scad ---------------------------------
export const PLN = { sun: 20, planet: 20, ring: 60, carrier: 60 };
/** The ring leg's socket head screw (drives.scad ring_bolt): sunk below the leg top, through the plate into the captive nut. */
export function ringBolt(size: Size, ringLevel: number) {
  const s = std(size), head = sz(size, 8, 6, 5), nutH = sz(size, 6.5, 5, 4);
  const cbZ = 2 + (ringLevel - 1) * s.level + s.gear_thickness - head - 0.5;
  return Math.ceil((cbZ + s.plate_t + nutH) / 5) * 5;
}
export function planetaryDims(size: Size) {
  const s = std(size), m = s.module;
  return { R: 2 * s.grid, ringOR: (m * PLN.ring) / 2 + 1.25 * m + 4, ringIR: (m * PLN.ring) / 2 - m, legSteps: 4,
    // drives.scad RING_LEG_D: the leg grows to keep a 2.5 mm wall round its screw head's recess
    legR: Math.max((boltD(size) * 1.6 + 5) / 2, (sz(size, 14, 10.5, 10) + 0.6 + 5) / 2), ratio: 1 / (1 + PLN.ring / PLN.sun) };
}
export const SHAFT_LEVEL = 4;
export function bracketDims(size: Size) {
  const s = std(size), bw = Number(s.bearing.split("x")[2]) || 7;
  return { shaftH: lvlZ(size, SHAFT_LEVEL) + s.gear_thickness / 2, housingT: bw + 1, housingW: bearingOD(size) + 8, barT: sz(size, 6, 4.7, 4.2), bevelD: 2 * s.grid, bevelHub: lvlZ(size, SHAFT_LEVEL) + s.gear_thickness / 2 - 10 * s.module - 2, wormD: 2 * s.grid, wormL: 2 * s.grid, bevelT: 20 };
}
export const flyR = (size: Size) => 2 * std(size).grid - 2.5;
export const NEMA = { w: 42.3, plate: 48, legSteps: 2 };
export const motorType = (p: Pin): MotorType => p.motor?.type ?? "n20";
// Phase 5a: magnets, in step with scad/lib/magnets.scad and gear.scad ----------------------
/** A magnetic gear's `teeth` is the spur gear it behaves like: 2.5 x its pole count. */
export const MAG_TEETH: Teeth[] = [30, 40, 50, 60];
export const magPoles = (g: Gear) => Math.round(g.teeth / 2.5);
export const magnetSize = (size: Size) => sz(size, { d: 6, h: 3 }, { d: 4, h: 2 }, { d: 3, h: 2 });
export const MAGF_N = 6;                 // magnets in each face of a magnetic coupling
export const MAG_COUPLE_MIN = 40;        // both gears of a face coupling: 40T or more
/** Radius out to which an item's faces are free for the joint holes (0: pins only, no screws). */
export function jointR(size: Size, g: Gear): number {
  const s = std(size), m = s.module, rr = (t: number) => pitchR(size, t) - 1.25 * m;
  const nutAF = sz(size, 13.3, 10.3, 8.3);
  switch (kindOf(g)) {
    case "gear": case "partial": return rr(g.teeth);
    case "pulley": return (m * g.teeth + 2) / 2 - 3.2 - 1;
    case "carrier": return rr(PLN.carrier);
    case "wormgear": return rr(g.teeth) - 1;
    case "flywheel": return flyR(size) - 3 - nutAF / Math.cos(Math.PI / 6);
    case "maggear": return pitchR(size, g.teeth) - 2.5 - (magnetSize(size).h + 0.2);
    default: return 0;
  }
}
/** Two items joined with pins also get three M3 screws when both have room for them. */
export const hasScrews = (size: Size, g: Gear) => jointR(size, g) >= std(size).hardware.screw_min_r;
/** Room for the dowel pin holes (has_pins in standard.scad). Only M1's 20T gears and P20 pulleys lack it;
 *  kinds without a joint radius here are assumed to have it. */
export const hasPins = (size: Size, g: Gear) => { const r = jointR(size, g); return r === 0 || r >= std(size).hardware.pin_r + 1.15 + 0.8; };

/** How stacked items join (scad/lib/jaws.scad): tapered jaws on each top face and pockets
 *  underneath, the legacy dowel pins, or dowel pins plus a screw clamp. */
export type Joint = "jaws" | "pins" | "bolts";
export const JOINTS: Joint[] = ["jaws", "pins", "bolts"];
/** Radius out to which an item's body reaches at the jaw band, on its top or bottom face
 *  (0: that face never has jaws or pockets). In step with the has_jaws calls in the library. */
export function jawR(size: Size, g: Gear, face: "top" | "bottom"): number {
  const s = std(size), m = s.module, rr = (t: number) => pitchR(size, t) - 1.25 * m;
  const nutAF = sz(size, 13.3, 10.3, 8.3);
  const top = face === "top";
  switch (kindOf(g)) {
    case "gear": return top && g.topper === "spring" ? 0 : rr(g.teeth);   // the spring winds on the spring gear's top face
    case "partial": return rr(g.teeth);
    case "pulley": return (m * g.teeth + 2) / 2 - 1.6 - 0.3;
    case "ratchet": return s.grid - 2.5 - 1.6 * m;
    case "cam": return camDims(size).r0;
    case "geneva": return top ? 0 : rr(40);
    case "genevaWheel": return genevaDims(size, g.slots ?? 6).rIn;
    case "escwheel": { const e = escDims(size); return e.R - e.depth; }
    case "winch": {
      if (top) return 0;
      const r = bearingOD(size) / 2 + 2.5, rj = s.hardware.jaw_min_r - 0.8 + 1.2;
      return rj <= winchR(size) - 3 ? Math.max(r, rj) : r;
    }
    case "carrier": return top ? 0 : rr(PLN.carrier);
    case "bevel": return top ? 0 : rr(g.teeth);
    case "wormgear": return rr(g.teeth) - 1;
    case "flywheel": return flyR(size) - 2 - nutAF / Math.cos(Math.PI / 6);
    case "maggear": return pitchR(size, g.teeth) - 2.5 - (magnetSize(size).h + 0.2);
    default: return 0;
  }
}
/** Room for the tapered jaws (on top) or their pockets (underneath). */
export const hasJaws = (size: Size, g: Gear, face: "top" | "bottom") => jawR(size, g, face) >= std(size).hardware.jaw_min_r;

/** Local z of the bottom of level k above the plate top (same as lvl_z in OpenSCAD). */
export const lvlZ = (size: Size, k: number) => 2 + (k - 1) * std(size).level;

/** Outer radius of whatever an item is, for collisions and drawing. */
export function itemR(size: Size, g: Gear): number {
  const s = std(size);
  switch (kindOf(g)) {
    case "gear": case "partial": return tipR(size, g.teeth);
    case "geneva": return tipR(size, 40);
    case "pulley": return pitchR(size, g.teeth) + 1;
    case "ratchet": return s.grid - 2.5;
    case "pawl": return 4.5 * s.module;                    // its hub; the leaf reaches the ratchet
    case "rocker": return bearingOD(size) / 2 + 3;         // the bar end: bearing OD / 2 + 3
    case "cam": { const { r0, lift } = camDims(size); return r0 + lift; }
    case "follower": return bearingOD(size) / 2 + 3;       // the hub; the arm is checked with its cam
    case "genevaWheel": return genevaDims(size, g.slots ?? 6).rim;
    case "qrlever": return slotW(size) / 2 + 4;            // the hub; the bar sweeps
    case "escwheel": return escDims(size).R;
    case "anchor": return bearingOD(size) / 2 + 3;         // the hub; pallets and bar are checked separately
    case "winch": return winchR(size);
    case "carrier": return tipR(size, PLN.carrier);
    case "bevel": return tipR(size, g.teeth) + 0.5;
    case "wormgear": return tipR(size, g.teeth) + 0.5;
    case "flywheel": return flyR(size);
    case "maggear": return pitchR(size, g.teeth) - 0.5;
  }
}
/** Levels an item fills besides its own, with the radius it fills them at. */
export function extraLevels(size: Size, g: Gear): { level: number; r: number; what: string }[] {
  const k = kindOf(g);
  if (k === "geneva") return [{ level: g.level + 1, r: genevaDims(size, g.slots ?? 6).a + postD(size) / 2, what: "Geneva lock" }];
  if (k === "winch") return [{ level: g.level + 1, r: winchR(size), what: "winch" }];
  if (g.topper === "spring") return [{ level: g.level + 1, r: springWallR(size), what: "spring wall" }];
  if (k === "carrier") return [{ level: g.level + 1, r: planetaryDims(size).ringOR, what: "planetary ring" }];
  if (k === "bevel") {
    // the cone's base sits in level 2, its small end in level 3, the knob above it in level 4
    const s = std(size), bt = bracketDims(size).bevelT;
    return [{ level: 2, r: tipR(size, bt) + 0.5, what: "bevel gear" }, { level: 3, r: pitchR(size, bt) - 3 * s.module, what: "bevel gear" }, { level: 4, r: s.knob_d / 2, what: "bevel gear's knob" }];
  }
  return [];
}
/** How many levels of bolt an item needs above its own level's top (two-level parts, the spring). */
export const levelsUsed = (size: Size, g: Gear) => 1 + extraLevels(size, g).length;
/** Bottom z of an item at a level: plate top + base spacer + (level-1) * level pitch. */
export const gearZ = (size: Size, level: number) => { const s = std(size); return s.tile_h + 2 + (level - 1) * s.level; };
/** The crank post base sits two levels above its gear; the handle and a linkage ride on it. */
export const crankLinkLevel = (level: number) => level + 2;
/** Where the motor mount's legs are, in socket offsets, for a direction. */
export function motorLegs(dir: number, type: MotorType = "n20"): [number, number][] {
  const rot = ([x, y]: [number, number]): [number, number] => { for (let k = 0; k < dir; k++) [x, y] = [-y, x]; return [x, y]; };
  return type === "nema17" ? [rot([-2, 0]), rot([2, 0])] : [rot([-1, 2]), rot([1, 2])];
}
/** The pointer's reach past the dial knob's rim, in mm. */
export const pointerReach = (size: Size) => std(size).dial_r + 4;
export const ARM_W = (size: Size) => 7 * std(size).module;

/** A rail's frame: origin at its first socket, u along the rail, v to its left (the tab side). */
export function railFrame(l: Layout, f: Fixture) {
  const o = socketPos(l, f.x, f.y);
  const c = Math.cos((f.dir * Math.PI) / 2), s = Math.sin((f.dir * Math.PI) / 2);
  const toWorld = (u: number, v: number) => ({ x: o.x + u * c - v * s, y: o.y + u * s + v * c });
  const toLocal = (p: { x: number; y: number }) => ({ u: (p.x - o.x) * c + (p.y - o.y) * s, v: -(p.x - o.x) * s + (p.y - o.y) * c });
  const len = f.kind === "rail" ? (f.n - 1) * std(l.size).grid : f.span * std(l.size).grid;
  return { o, angle: (f.dir * Math.PI) / 2, len, toWorld, toLocal };
}

export function emptyLayout(size: Size): Layout {
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 2, rows: 2 }, pins: [], bands: [], fixtures: [], input: null, rpm: 10 };
}

let counter = 1;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The plan's gate: a 1:16 reduction on three pins, two 20:80 stages. */
export function exampleLayout(size: Size): Layout {
  // (an M1 20T is too small for the crank's pins, so in M1 the input has no crank; in M1.5 a
  // 60 mm throw would sweep into the 20T on the next pin)
  const a: Pin = { id: "a", x: 1, y: 2, gears: [{ level: 1, teeth: 20, joined: false, ...(size === "M1" ? {} : { topper: "crank" as const, throw: size === "M2" ? 60 : 40 }) }] };
  const b: Pin = { id: "b", x: 6, y: 2, gears: [{ level: 1, teeth: 80, joined: false }, { level: 2, teeth: 20, joined: true }] };
  const c: Pin = { id: "c", x: 9, y: 6, gears: [{ level: 2, teeth: 80, joined: false, topper: "pointer" }] };
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 2 }, pins: [a, b, c], bands: [], fixtures: [], input: { pin: "a", level: 1 }, rpm: 10 };
}

/** Phase 4a sampler: a motor drives a train with a ratchet and pawl, a pulley band,
 *  a pointer with its dial knob and a crank-rocker linkage. */
export function addonsLayout(size: Size): Layout {
  const m: Pin = { id: "m", x: 2, y: 1, gears: [{ level: 1, teeth: 20, joined: false }], motor: { dir: 0 } };
  const g: Pin = { id: "g", x: 5, y: 1, gears: [{ level: 1, teeth: 40, joined: false }, { level: 2, teeth: 40, joined: true }] };
  const r: Pin = { id: "r", x: 5, y: 4, gears: [{ level: 1, teeth: 20, joined: false, kind: "ratchet" }, { level: 2, teeth: 20, joined: true }] };
  const pw: Pin = { id: "pw", x: 7, y: 4, gears: [{ level: 1, teeth: 20, joined: false, kind: "pawl", pawlCw: true }] };
  const p1: Pin = { id: "p1", x: 10, y: 1, gears: [{ level: 1, teeth: 60, joined: false }, { level: 2, teeth: 40, joined: true, kind: "pulley", topper: "crank", throw: 30 }] };
  const p2: Pin = { id: "p2", x: 10, y: 5, gears: [{ level: 2, teeth: 20, joined: false, kind: "pulley" }] };
  const k: Pin = { id: "k", x: 8, y: 4, gears: [{ level: 4, teeth: 20, joined: false, kind: "rocker", rocker: { crank: "p1", coupler: 4, holes: 4 } }] };
  const d: Pin = { id: "d", x: 5, y: 7, gears: [{ level: 2, teeth: 40, joined: false, topper: "pointer" }] };
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 2 }, pins: [m, g, r, pw, p1, p2, k, d], bands: [{ a: { pin: "p1", level: 2 }, b: { pin: "p2", level: 2 }, crossed: false }], fixtures: [], input: { pin: "m", level: 1 }, rpm: 10 };
}

/** Phase 4b sampler: a crank on a 20T drives a scotch yoke on a rail and a train with a
 *  Geneva drive, an escape wheel with its anchor and, through a half gear that drives in
 *  bursts, a cam with its follower. The rack has a board of its own (rackLayout). */
export function mechanismsLayout(size: Size): Layout {
  const big = size === "M2";
  const cx = big ? 7 : 9;   // the crank gear: two sockets past the yoke's rail
  const pins: Pin[] = [
    { id: "c", x: cx, y: 3, gears: [{ level: 2, teeth: 20, joined: false, topper: "crank", throw: 20 }] },
    // the partial gear drives (a driven one would stall once its bare side came round): half its rim turns the 40T above it in bursts
    { id: "t", x: cx, y: 6, gears: [{ level: 1, teeth: 40, joined: false, kind: "partial", keep: 0.5 }, { level: 2, teeth: 40, joined: true }] },
    { id: "gd", x: cx + 4, y: 6, gears: [{ level: 2, teeth: 40, joined: false, kind: "geneva", slots: 6 }] },
    { id: "gw", x: cx + 4, y: 9, gears: [{ level: 3, teeth: 20, joined: false, kind: "genevaWheel", slots: 6 }] },
    { id: "e", x: cx + 7, y: 6, gears: [{ level: 2, teeth: 20, joined: false }, { level: 3, teeth: 20, joined: true, kind: "escwheel" }] },
    { id: "an", x: cx + 7, y: 4, gears: [{ level: 3, teeth: 20, joined: false, kind: "anchor", anchorCw: true }] },
    { id: "h", x: cx, y: 10, gears: [{ level: 1, teeth: 40, joined: false }] },
    { id: "hd", x: cx - 3, y: 10, gears: [{ level: 1, teeth: 20, joined: false }, { level: 2, teeth: 20, joined: true, kind: "cam", cam: "heart" }] },
    { id: "fo", x: cx - 5, y: 10, gears: [{ level: 2, teeth: 20, joined: false, kind: "follower" }] },
  ];
  const fixtures: Fixture[] = [
    { id: "rail", kind: "rail", x: 1, y: 3, dir: 0, n: big ? 5 : 7, carriage: { kind: "yoke", level: 2, throw: 20, reach: big ? 4 : 5 } },
  ];
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 5, rows: 3 }, pins, bands: [], fixtures, input: { pin: "c", level: 2 }, rpm: 10 };
}

/** A rack and pinion: a crank on a 40T turns a 20T pinion under a 3-step rack. A rack only
 *  travels so far, so the view rocks the crank back and forth on a board with a rack. */
export function rackLayout(size: Size): Layout {
  const pins: Pin[] = [
    { id: "c", x: 4, y: 3, gears: [{ level: 1, teeth: 40, joined: false, topper: "crank", throw: 20 }] },
    { id: "p", x: 4, y: 6, gears: [{ level: 1, teeth: 20, joined: false }] },
  ];
  const fixtures: Fixture[] = [{ id: "rail", kind: "rail", x: 1, y: 8, dir: 0, n: 7, carriage: { kind: "rack", len: 3, level: 1 } }];
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 3 }, pins, bands: [], fixtures, input: { pin: "c", level: 1 }, rpm: 10 };
}

/** Phase 5a sampler: a crank turns a 16-magnet gear, which turns another four sockets
 *  away without touching; that one is pinned and screwed to a 40T, which drives a 20T and,
 *  through a magnetic face coupling, a 40T with a pointer on the level above. */
export function magnetsLayout(size: Size): Layout {
  const pins: Pin[] = [
    { id: "a", x: 2, y: 3, gears: [{ level: 1, teeth: 40, joined: false, kind: "maggear", ...(size === "M1" ? { topper: "pointer" as const } : { topper: "crank" as const, throw: 20 }) }] },
    { id: "b", x: 6, y: 3, gears: [{ level: 1, teeth: 40, joined: false, kind: "maggear" }, { level: 2, teeth: 40, joined: true }, { level: 3, teeth: 40, joined: true, coupling: "magnetic", topper: "pointer" }] },
    { id: "c", x: 9, y: 3, gears: [{ level: 2, teeth: 20, joined: false }] },
  ];
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 2 }, pins, bands: [], fixtures: [], input: { pin: "a", level: 1 }, rpm: 10 };
}

/** Phase 4c sampler: a NEMA 17 drives a planetary set (sun in, carrier out, 4:1); the
 *  carrier turns a bevel gear, which turns a shaft bracket's worm; the worm gear drives
 *  a flywheel through a 20T. */
export function drivesLayout(size: Size): Layout {
  const pins: Pin[] = [
    { id: "m", x: 2, y: 4, gears: [{ level: 3, teeth: 20, joined: false }], motor: { dir: 1, type: "nema17" } },
    { id: "s", x: 6, y: 4, gears: [{ level: 1, teeth: 60, joined: false, kind: "carrier", legs: "y" }, { level: 2, teeth: 20, joined: false }, { level: 3, teeth: 60, joined: true }] },
    { id: "b", x: 10, y: 1, gears: [{ level: 1, teeth: 40, joined: false, kind: "bevel" }] },
    { id: "w", x: 14, y: 4, gears: [{ level: 4, teeth: 40, joined: false, kind: "wormgear" }] },
    { id: "f", x: 14, y: 7, gears: [{ level: 3, teeth: 20, joined: false, kind: "flywheel" }, { level: 4, teeth: 20, joined: true }] },
  ];
  const fixtures: Fixture[] = [{ id: "br", kind: "bracket", x: 12, y: 1, dir: 0, span: 4 }];
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 5, rows: 3 }, pins, bands: [], fixtures, input: { pin: "m", level: 3 }, rpm: 10 };
}
