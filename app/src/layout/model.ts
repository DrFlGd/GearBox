// The layout tester's data model: a board of tiles, pins in sockets, gears
// stacked on pins by level. Everything is in socket units; the standard gives
// the millimetres.
import { catalog, type Size, type Standard } from "../parts";

export type Teeth = 20 | 30 | 40 | 50 | 60 | 70 | 80;
export const TEETH: Teeth[] = [20, 30, 40, 50, 60, 70, 80];
export const MAX_LEVEL = 3;

export type Gear = {
  level: number;      // 1..MAX_LEVEL
  teeth: Teeth;
  joined: boolean;    // turns with the gear one level below (coupler pair, or one compound part)
};

export type Pin = { id: string; x: number; y: number; gears: Gear[] };

export type Layout = {
  size: Size;
  tile: { nx: number; ny: number };  // sockets per tile
  tiles: { cols: number; rows: number }; // tiles across and down
  pins: Pin[];
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
export const pitchR = (size: Size, teeth: number) => (std(size).module * teeth) / 2;
export const tipR = (size: Size, teeth: number) => (std(size).module * (teeth + 2)) / 2;
/** Bottom z of a gear at a level: plate top + base spacer + (level-1) * level pitch. */
export const gearZ = (size: Size, level: number) => { const s = std(size); return s.tile_h + 2 + (level - 1) * s.level; };

export function emptyLayout(size: Size): Layout {
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 2, rows: 2 }, pins: [], input: null, rpm: 10 };
}

let counter = 1;
export const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The plan's gate: a 1:16 reduction on three pins, two 20:80 stages. */
export function exampleLayout(size: Size): Layout {
  const a: Pin = { id: "a", x: 1, y: 2, gears: [{ level: 1, teeth: 20, joined: false }] };
  const b: Pin = { id: "b", x: 6, y: 2, gears: [{ level: 1, teeth: 80, joined: false }, { level: 2, teeth: 20, joined: true }] };
  const c: Pin = { id: "c", x: 9, y: 6, gears: [{ level: 2, teeth: 80, joined: false }] };
  return { size, tile: { nx: 4, ny: 4 }, tiles: { cols: 3, rows: 2 }, pins: [a, b, c], input: { pin: "a", level: 1 }, rpm: 10 };
}
