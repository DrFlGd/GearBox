// What the UI knows about each part kind: the parameters gearbox.scad accepts,
// their ranges, and how to name the output file. The catalog (catalog/parts.json)
// supplies the ready-made presets and kits.
import catalogJson from "../../catalog/parts.json";
import { tolerancesSource } from "./engine/tolerances";

export type ParamValue = string | number;
export type Params = Record<string, ParamValue>;

export type ParamDef = {
  key: string;
  label: string;
  help?: string;
} & ({ type: "select"; options: { value: ParamValue; label: string }[] } | { type: "number"; min: number; max: number; step: number });

export type PartKind = {
  id: string;
  title: string;
  group: string;
  blurb: string;
  params: ParamDef[];
  defaults: Params;
  /** Catalog-style short name for a set of params, e.g. G40, B4x4-M8. */
  name(p: Params): string;
};

const toothOptions = [20, 30, 40, 50, 60, 70, 80].map(t => ({ value: t, label: `${t} teeth · ${t * 2} mm pitch diameter` }));
const faceOptions = ["solid", "spokes", "cross", "holes", "spiral"].map(v => ({ value: v, label: v }));
const bearingOptions = [
  { value: "608", label: "608 (8 x 22 x 7)" },
  { value: "626", label: "626 (6 x 19 x 6) for M6 bolts" },
];
const boltOptions = [
  { value: "M8", label: "M8" },
  { value: "M6", label: "M6" },
];
const socketOptions = [
  { value: "bayonet", label: "Printed bayonet pin" },
  { value: "M8", label: "M8 captive nut" },
  { value: "M6", label: "M6 captive nut" },
];
const tileCount = (key: string, label: string): ParamDef => ({ key, label, type: "number", min: 2, max: 8, step: 1, help: "pin sockets along this edge (20 mm each)" });

const bearingSuffix = (p: Params) => (p.bearing === "626" ? "-626" : "");
const faceSuffix = (p: Params) => (p.face && p.face !== "solid" ? `-${p.face}` : "");

export const PART_KINDS: PartKind[] = [
  {
    id: "gear", title: "Gear", group: "Gears",
    blurb: "Module 2 spur gear, 8 mm face, with a 608 bearing seat and the 12-pocket spline on both faces. Two gears mesh when their tooth counts add up to a multiple of 20.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions, help: "patterns only appear when the rim is wide enough (40 teeth and up)" },
      { key: "bearing", label: "Bearing", type: "select", options: bearingOptions },
    ],
    defaults: { teeth: 40, face: "spokes", bearing: "608" },
    name: p => `G${p.teeth}${faceSuffix(p)}${bearingSuffix(p)}`,
  },
  {
    id: "compound", title: "Compound gear", group: "Gears",
    blurb: "Two gears in one part: a large gear below and a small one on top, 17 mm tall, one bearing in each. Stack it on a pin for a reduction without a coupler.",
    params: [
      { key: "teeth", label: "Lower teeth", type: "select", options: toothOptions },
      { key: "teeth_upper", label: "Upper teeth", type: "select", options: toothOptions, help: "must be smaller than the lower gear" },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions },
      { key: "bearing", label: "Bearing", type: "select", options: bearingOptions },
    ],
    defaults: { teeth: 60, teeth_upper: 20, face: "spokes", bearing: "608" },
    name: p => `G${p.teeth}-${p.teeth_upper}${faceSuffix(p)}${bearingSuffix(p)}`,
  },
  {
    id: "tile", title: "Board tile", group: "Board",
    blurb: "Interlocking pegboard tile on a 20 mm grid, 12 mm tall, with dovetail keys on every edge so any edge mates with any other.",
    params: [
      tileCount("tile_nx", "Sockets across"),
      tileCount("tile_ny", "Sockets down"),
      { key: "socket", label: "Pin sockets", type: "select", options: socketOptions },
    ],
    defaults: { tile_nx: 4, tile_ny: 4, socket: "bayonet" },
    name: p => `B${p.tile_nx}x${p.tile_ny}${p.socket === "bayonet" ? "" : `-${p.socket}`}`,
  },
  {
    id: "pin", title: "Bayonet pin", group: "Pins and caps",
    blurb: "Printed quarter-turn pin: lugs lock under the tile, the 8 mm axle carries one 608 bearing per level, and the double-D head takes the quarter-turn cap.",
    params: [{ key: "levels", label: "Gear levels", type: "select", options: [1, 2, 3].map(v => ({ value: v, label: `${v} level${v > 1 ? "s" : ""} (${10 * v} mm of stack)` })) }],
    defaults: { levels: 1 },
    name: p => `P${p.levels}`,
  },
  {
    id: "cap", title: "Pin cap", group: "Pins and caps",
    blurb: "Quarter-turn captive cap for the bayonet pin, with a detent so it stays put and comes off by hand.",
    params: [], defaults: {}, name: () => "C",
  },
  {
    id: "knob", title: "Bolt knob", group: "Pins and caps",
    blurb: "Printed knob that presses onto the head of an M8 or M6 hex bolt so bolt pins are tightened by hand.",
    params: [{ key: "bolt", label: "Bolt", type: "select", options: boltOptions }],
    defaults: { bolt: "M8" },
    name: p => `K${p.bolt === "M6" ? 6 : 8}`,
  },
  {
    id: "spacer", title: "Spacer", group: "Spacers and adapters",
    blurb: "Sits between bearing inner races so stacked gears turn freely. 11 mm outside diameter clears the 608ZZ shields.",
    params: [
      { key: "spacer_h", label: "Height (mm)", type: "number", min: 1, max: 10, step: 0.5, help: "3 mm fills the gap between levels; 1, 2 and 10 are also in the catalog" },
      { key: "bolt", label: "Bore for", type: "select", options: [{ value: "M8", label: "8 mm axle or M8 bolt" }, { value: "M6", label: "M6 bolt (626 bearing)" }] },
    ],
    defaults: { spacer_h: 3, bolt: "M8" },
    name: p => `S${String(p.spacer_h).replace(".", "_")}${p.bolt === "M6" ? "-M6" : ""}`,
  },
  {
    id: "base_spacer", title: "Base spacer", group: "Spacers and adapters",
    blurb: "Lifts the first bearing off the tile on a bolt pin so the gear clears the plate.",
    params: [{ key: "bolt", label: "Bolt", type: "select", options: boltOptions }],
    defaults: { bolt: "M8" },
    name: p => `BS${p.bolt === "M6" ? 6 : 8}`,
  },
  {
    id: "coupler", title: "Coupler", group: "Spacers and adapters",
    blurb: "Double-sided spline coupler that locks two stacked gears together so they turn as one.",
    params: [], defaults: {}, name: () => "CPL",
  },
  {
    id: "sleeve_m6", title: "M6 sleeve", group: "Spacers and adapters",
    blurb: "Bushing that lets a 608 bearing (8 mm bore) ride on an M6 bolt.",
    params: [], defaults: {}, name: () => "SLV6",
  },
  {
    id: "bushing", title: "Bushing", group: "Spacers and adapters",
    blurb: "Plain printed bushing in place of a bearing, for a gear that only needs to turn now and then.",
    params: [{ key: "bolt", label: "Bolt", type: "select", options: boltOptions }],
    defaults: { bolt: "M8" },
    name: p => `BSH${p.bolt === "M6" ? 6 : 8}`,
  },
  {
    id: "coupon", title: "Fit test coupon", group: "Test",
    blurb: "One small print that checks every fit in the kit: all three socket styles, a 608 and a 626 seat, and the spline pockets. Print this first and tune the profile.",
    params: [], defaults: {}, name: () => "COUPON",
  },
];

export const partKind = (id: string) => PART_KINDS.find(k => k.id === id);

export type CatalogPart = { name: string; title: string; group: string; params: Params; expect?: { size?: number[] } };
export type Catalog = { standard: Record<string, unknown>; parts: CatalogPart[]; kits: Record<string, string[]> };
export const catalog = catalogJson as unknown as Catalog;
export const catalogPart = (name: string) => catalog.parts.find(p => p.name === name);

export const PROFILES = ["PLA", "PETG", "ABS"] as const;
export type Profile = (typeof PROFILES)[number];

export type ToleranceRow = { key: string; values: Record<Profile, number>; what: string };

/** Parse the `_tol` table out of scad/lib/tolerances.scad so the app and the library never disagree. */
export function parseTolerances(src = tolerancesSource): ToleranceRow[] {
  const rows: ToleranceRow[] = [];
  const re = /\[\s*"(\w+)"\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*,?\s*(?:\/\/\s*(.*))?/g;
  for (const m of src.matchAll(re)) {
    rows.push({ key: m[1], values: { PLA: Number(m[2]), PETG: Number(m[3]), ABS: Number(m[4]) }, what: (m[5] ?? "").trim() });
  }
  return rows;
}

export type Overrides = Record<string, number>;

/** The -D defines for one render. */
export function defines(kindId: string, params: Params, profile: Profile, overrides: Overrides): string[] {
  const out = [`part="${kindId}"`, `profile="${profile}"`];
  for (const [k, v] of Object.entries(params)) out.push(`${k}=${typeof v === "string" ? JSON.stringify(v) : v}`);
  const ov = Object.entries(overrides).filter(([, v]) => Number.isFinite(v));
  if (ov.length) out.push(`overrides=[${ov.map(([k, v]) => `["${k}",${v}]`).join(",")}]`);
  return out;
}

/** A human-readable problem with the parameters, or null. */
export function validate(kindId: string, p: Params): string | null {
  if (kindId === "compound" && Number(p.teeth_upper) >= Number(p.teeth)) return "The upper gear must have fewer teeth than the lower gear.";
  return null;
}

/** Which catalog tooth counts mesh with this one (sum is a multiple of 20). */
export const meshesWith = (teeth: number) => toothOptions.map(o => Number(o.value)).filter(t => (t + teeth) % 20 === 0);
