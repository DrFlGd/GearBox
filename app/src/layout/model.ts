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
  | "cam" | "follower" | "geneva" | "genevaWheel" | "partial" | "qrlever" | "escwheel" | "anchor" | "winch";
export type Topper = "crank" | "pointer" | "spring";
export type CamKind = "eccentric" | "heart" | "snail";
export type Gear = {
  level: number;      // 1..MAX_LEVEL
  teeth: Teeth;
  joined: boolean;    // turns with the item one level below (coupler pair, or one compound part)
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
};

export type Pin = {
  id: string; x: number; y: number; gears: Gear[];
  /** An N20 motor on this socket instead of a bolt: its 20T pinion is gears[0]; legs
   *  sit at (-1, 2) and (1, 2) grid steps, turned by `dir` quarter turns. */
  motor?: { dir: 0 | 1 | 2 | 3 };
};

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
export type Fixture = { id: string; kind: "rail"; x: number; y: number; dir: 0 | 1 | 2 | 3; n: number; carriage: Carriage | null };

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
export const meshes = (g: Gear) => { const k = kindOf(g); return k === "gear" || k === "partial" || k === "geneva"; };
export const teethOf = (g: Gear) => (kindOf(g) === "geneva" ? 40 : g.teeth);

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
export const postD = (size: Size) => boltD(size) - 0.1;
export function genevaDims(size: Size, n: number) {
  const C = 3 * std(size).grid;
  const a = C * Math.sin(Math.PI / n), b = C * Math.cos(Math.PI / n);
  return { C, a, b, lock: a - postD(size) / 2 - 3.5, slotW: postD(size) + 0.6, rIn: C - a - postD(size) / 2 - 1.2 };
}
export function escDims(size: Size) {
  const C = 2 * std(size).grid, alpha = (54 * Math.PI) / 180;
  const R = C * Math.cos(alpha);
  return { C, R, alpha, n: 15, depth: 0.22 * R, bar: 2.5 * std(size).grid };
}
export const slotW = (size: Size) => bearingOD(size) + 0.5;
export const springWallR = (size: Size) => { const s = std(size); const small = size === "M1.5"; return (small ? 6.5 : 8) + 4.5 * (small ? 2.5 : 3.2) + 2.5 + 2 + (s.module === 2 ? 0 : 0); };
export const springMinTeeth = (size: Size) => (size === "M1.5" ? 40 : 30);
export const winchR = (size: Size) => std(size).grid + 2;
export function railDims(size: Size) {
  const s = std(size); const small = size === "M1.5";
  const w = s.grid - 4, t = small ? 2.5 : 3, ridge = small ? 2 : 2.5;
  return { w, t, ridge, tabR: (boltD(size) * 1.6 + 5) / 2 + 0.3, carL: 2 * s.grid, baseTop: 2 + s.level - 2, plugW: w - 4, top: t + ridge };
}
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
    case "genevaWheel": return genevaDims(size, g.slots ?? 6).b;
    case "qrlever": return slotW(size) / 2 + 4;            // the hub; the bar sweeps
    case "escwheel": return escDims(size).R;
    case "anchor": return bearingOD(size) / 2 + 3;         // the hub; pallets and bar are checked separately
    case "winch": return winchR(size);
  }
}
/** Levels an item fills besides its own, with the radius it fills them at. */
export function extraLevels(size: Size, g: Gear): { level: number; r: number; what: string }[] {
  const k = kindOf(g);
  if (k === "geneva") return [{ level: g.level + 1, r: genevaDims(size, g.slots ?? 6).a + postD(size) / 2, what: "Geneva lock" }];
  if (k === "winch") return [{ level: g.level + 1, r: winchR(size), what: "winch" }];
  if (g.topper === "spring") return [{ level: g.level + 1, r: springWallR(size), what: "spring wall" }];
  return [];
}
/** How many levels of bolt an item needs above its own level's top (two-level parts, the spring). */
export const levelsUsed = (size: Size, g: Gear) => 1 + extraLevels(size, g).length;
/** Bottom z of an item at a level: plate top + base spacer + (level-1) * level pitch. */
export const gearZ = (size: Size, level: number) => { const s = std(size); return s.tile_h + 2 + (level - 1) * s.level; };
/** The crank post base sits two levels above its gear; the handle and a linkage ride on it. */
export const crankLinkLevel = (level: number) => level + 2;
/** Where the motor mount's legs are, in socket offsets, for a direction. */
export function motorLegs(dir: number): [number, number][] {
  const rot = ([x, y]: [number, number]): [number, number] => { for (let k = 0; k < dir; k++) [x, y] = [-y, x]; return [x, y]; };
  return [rot([-1, 2]), rot([1, 2])];
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
  return { o, angle: (f.dir * Math.PI) / 2, len: (f.n - 1) * std(l.size).grid, toWorld, toLocal };
}

export function emptyLayout(size: Size): Layout {
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 2, rows: 2 }, pins: [], bands: [], fixtures: [], input: null, rpm: 10 };
}

let counter = 1;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The plan's gate: a 1:16 reduction on three pins, two 20:80 stages. */
export function exampleLayout(size: Size): Layout {
  const a: Pin = { id: "a", x: 1, y: 2, gears: [{ level: 1, teeth: 20, joined: false, topper: "crank", throw: 60 }] };
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
 *  Geneva drive, an escape wheel with its anchor, a rack and, through a half gear that
 *  drives in bursts, a cam with its follower. */
export function mechanismsLayout(size: Size): Layout {
  const big = size === "M2";
  const cx = big ? 7 : 9;   // the crank gear: two sockets past the yoke's rail
  const pins: Pin[] = [
    { id: "c", x: cx, y: 3, gears: [{ level: 2, teeth: 20, joined: false, topper: "crank", throw: 20 }] },
    { id: "t", x: cx, y: 6, gears: [{ level: 1, teeth: 40, joined: false }, { level: 2, teeth: 40, joined: true }] },
    { id: "gd", x: cx + 4, y: 6, gears: [{ level: 1, teeth: 40, joined: false, kind: "geneva", slots: 6 }] },
    { id: "gw", x: cx + 4, y: 9, gears: [{ level: 2, teeth: 20, joined: false, kind: "genevaWheel", slots: 6 }] },
    { id: "cg", x: cx + 4, y: 3, gears: [{ level: 1, teeth: 20, joined: false }] },
    { id: "e", x: cx + 7, y: 6, gears: [{ level: 1, teeth: 20, joined: false }, { level: 2, teeth: 20, joined: true, kind: "escwheel" }] },
    { id: "an", x: cx + 7, y: 4, gears: [{ level: 2, teeth: 20, joined: false, kind: "anchor", anchorCw: true }] },
    { id: "h", x: cx, y: 10, gears: [{ level: 1, teeth: 40, joined: false, kind: "partial", keep: 0.5 }] },
    { id: "hd", x: cx - 3, y: 10, gears: [{ level: 1, teeth: 20, joined: false }, { level: 2, teeth: 20, joined: true, kind: "cam", cam: "heart" }] },
    { id: "fo", x: cx - 5, y: 10, gears: [{ level: 2, teeth: 20, joined: false, kind: "follower" }] },
  ];
  const fixtures: Fixture[] = [
    { id: "rail", kind: "rail", x: 1, y: 3, dir: 0, n: big ? 5 : 7, carriage: { kind: "yoke", level: 2, throw: 20, reach: big ? 4 : 5 } },
    { id: "rail2", kind: "rail", x: cx + 6, y: 1, dir: 2, n: 4, carriage: { kind: "rack", len: 2, level: 1 } },
  ];
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 5, rows: 3 }, pins, bands: [], fixtures, input: { pin: "c", level: 2 }, rpm: 10 };
}
