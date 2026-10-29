// The layout tester's data model: a board of tiles, pins in sockets, items
// stacked on pins by level (gears and, since phase 4a, pulleys, ratchets, pawls
// and rockers), things that ride on a gear's top face (a crank or a pointer),
// motors, and the bands between pulleys. Everything is in socket units; the
// standard gives the millimetres.
import { catalog, type Size, type Standard } from "../parts";

export type Teeth = 20 | 30 | 40 | 50 | 60 | 70 | 80;
export const TEETH: Teeth[] = [20, 30, 40, 50, 60, 70, 80];
export const MAX_LEVEL = 4;

/** What sits on one level of a pin. `teeth` is the size for every kind: a pulley's
 *  size number, a link's holes, and 12 for a ratchet. */
export type ItemKind = "gear" | "pulley" | "ratchet" | "pawl" | "rocker";
export type Topper = "crank" | "pointer";
export type Gear = {
  level: number;      // 1..MAX_LEVEL
  teeth: Teeth;
  joined: boolean;    // turns with the item one level below (coupler pair, or one compound part)
  kind?: ItemKind;    // default gear
  topper?: Topper;    // on a gear's top face: a crank (handle or linkage) or a pointer with its dial
  throw?: number;     // crank: post distance from the axis, mm
  pawlCw?: boolean;   // pawl: locks clockwise (default locks counter-clockwise)
  // rocker: a link pivoting on this pin, driven through a coupler link by the crank on another pin
  rocker?: { crank: string; coupler: number; holes: number };
};

export type Pin = {
  id: string; x: number; y: number; gears: Gear[];
  /** An N20 motor on this socket instead of a bolt: its 20T pinion is gears[0]; legs
   *  sit at (-1, 2) and (1, 2) grid steps, turned by `dir` quarter turns. */
  motor?: { dir: 0 | 1 | 2 | 3 };
};

export type Band = { a: { pin: string; level: number }; b: { pin: string; level: number }; crossed: boolean };

export type Layout = {
  size: Size;
  tile: { nx: number; ny: number };  // sockets per tile
  tiles: { cols: number; rows: number }; // tiles across and down
  pins: Pin[];
  bands?: Band[];
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
/** Outer radius of whatever an item is, for collisions and drawing. */
export function itemR(size: Size, g: Gear): number {
  const s = std(size);
  switch (kindOf(g)) {
    case "gear": return tipR(size, g.teeth);
    case "pulley": return pitchR(size, g.teeth) + 1;
    case "ratchet": return s.grid - 2.5;
    case "pawl": return 4.5 * s.module;                    // its hub; the leaf reaches the ratchet
    case "rocker": return Number(s.bearing.split("x")[1]) / 2 + 3;   // the bar end: bearing OD / 2 + 3
  }
}
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

export function emptyLayout(size: Size): Layout {
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 2, rows: 2 }, pins: [], bands: [], input: null, rpm: 10 };
}

let counter = 1;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The plan's gate: a 1:16 reduction on three pins, two 20:80 stages. */
export function exampleLayout(size: Size): Layout {
  const a: Pin = { id: "a", x: 1, y: 2, gears: [{ level: 1, teeth: 20, joined: false, topper: "crank", throw: 60 }] };
  const b: Pin = { id: "b", x: 6, y: 2, gears: [{ level: 1, teeth: 80, joined: false }, { level: 2, teeth: 20, joined: true }] };
  const c: Pin = { id: "c", x: 9, y: 6, gears: [{ level: 2, teeth: 80, joined: false, topper: "pointer" }] };
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 2 }, pins: [a, b, c], bands: [], input: { pin: "a", level: 1 }, rpm: 10 };
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
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 2 }, pins: [m, g, r, pw, p1, p2, k, d], bands: [{ a: { pin: "p1", level: 2 }, b: { pin: "p2", level: 2 }, crossed: false }], input: { pin: "m", level: 1 }, rpm: 10 };
}
