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

const toothOptions = [20, 30, 40, 50, 60, 70, 80].map(t => ({ value: t, label: `${t} teeth` }));
const faceOptions = ["solid", "spokes", "cross", "holes", "spiral"].map(v => ({ value: v, label: v }));
const tileCount = (key: string, label: string): ParamDef => ({ key, label, type: "number", min: 2, max: 8, step: 1, help: "bolt sockets along this edge, one grid step each" });
const faceSuffix = (p: Params) => (p.face && p.face !== "solid" ? `-${p.face}` : "");

export const PART_KINDS: PartKind[] = [
  {
    id: "gear", title: "Gear", group: "Gears",
    blurb: "Spur gear with a bearing seat in the hub and six peg holes on each face for couplers, cranks and pointers. Two gears mesh when their tooth counts add up to a multiple of 20.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions, help: "patterns only appear when the rim is wide enough (40 teeth and up)" },
    ],
    defaults: { teeth: 40, face: "spokes" },
    name: p => `G${p.teeth}${faceSuffix(p)}`,
  },
  {
    id: "compound", title: "Compound gear", group: "Gears",
    blurb: "Two gears in one part: a large gear below and a small one on top, one bearing in each. Stack it on a pin for a reduction without a coupler.",
    params: [
      { key: "teeth", label: "Lower teeth", type: "select", options: toothOptions },
      { key: "teeth_upper", label: "Upper teeth", type: "select", options: toothOptions, help: "must be smaller than the lower gear" },
      { key: "face", label: "Face pattern", type: "select", options: faceOptions },
    ],
    defaults: { teeth: 60, teeth_upper: 20, face: "spokes" },
    name: p => `G${p.teeth}-${p.teeth_upper}${faceSuffix(p)}`,
  },
  {
    id: "tile", title: "Board tile", group: "Board",
    blurb: "Interlocking pegboard tile: a flat top with a plain bolt hole at every grid point, a captive nut pocket under each hole, and dovetail keys on every edge. Prints top face down with no supports.",
    params: [
      tileCount("tile_nx", "Sockets across"),
      tileCount("tile_ny", "Sockets down"),
      { key: "flip", label: "Orientation", type: "select", options: [{ value: "true", label: "Print-ready (top face down)" }, { value: "false", label: "As used (top face up)" }] },
    ],
    defaults: { tile_nx: 4, tile_ny: 4, flip: "true" },
    name: p => `B${p.tile_nx}x${p.tile_ny}`,
  },
  {
    id: "knob", title: "Bolt knob", group: "Pins",
    blurb: "Printed knob that grips the hex head of the bolt so pins are tightened by hand. Its boss is the last spacer and presses only the bearing inner race.",
    params: [], defaults: {}, name: () => "K",
  },
  {
    id: "spacer", title: "Spacer", group: "Pins",
    blurb: "Sits between bearing inner races so stacked gears turn freely. 3 mm fills the gap between levels; 10 mm skips a level.",
    params: [{ key: "spacer_h", label: "Height (mm)", type: "number", min: 1, max: 10, step: 0.5 }],
    defaults: { spacer_h: 3 },
    name: p => `S${String(p.spacer_h).replace(".", "_")}`,
  },
  {
    id: "base_spacer", title: "Base spacer", group: "Pins",
    blurb: "2 mm ring on the plate under the first bearing, so the bottom gear clears the tile.",
    params: [], defaults: {}, name: () => "BS",
  },
  {
    id: "coupler", title: "Coupler half", group: "Pins",
    blurb: "Flat ring with three pegs. Print two: one goes on the lower gear pegs down, the other on top flipped and turned 60 degrees, and the two gears turn as one.",
    params: [], defaults: {}, name: () => "CPL",
  },
  {
    id: "bushing", title: "Bushing", group: "Pins",
    blurb: "Plain printed ring in place of a bearing, for a gear that only turns now and then.",
    params: [], defaults: {}, name: () => "BSH",
  },
  {
    id: "coupon", title: "Fit test coupon", group: "Test",
    blurb: "One small print that checks every fit in the kit: bolt holes, nut pockets, a dovetail pair, the bearing seat and the coupler peg holes. Print this first and tune the profile.",
    params: [], defaults: {}, name: () => "COUPON",
  },
];

export const partKind = (id: string) => PART_KINDS.find(k => k.id === id);

export const SIZES = ["M2", "M1.5"] as const;
export type Size = (typeof SIZES)[number];
export type Standard = { title: string; module: number; grid: number; level: number; gear_thickness: number; bolt: string; bearing: string; nut: string; knob_d: number; spacer_od: number; tile_h: number; plate_t: number; bolt_lengths: Record<string, number> };
export type CatalogPart = { name: string; title: string; group: string; params: Params; expect?: Partial<Record<Size, number[]>> };
export type Kit = { title: string; parts: string[]; hardware: string[] };
export type Catalog = { standards: Record<Size, Standard>; mesh_rule: string; profiles: string[]; parts: CatalogPart[]; kits: Record<string, Kit> };
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
export function defines(kindId: string, params: Params, size: Size, profile: Profile, overrides: Overrides): string[] {
  const out = [`part="${kindId}"`, `size="${size}"`, `profile="${profile}"`];
  for (const [k, v] of Object.entries(params)) out.push(`${k}=${v === "true" || v === "false" || typeof v !== "string" ? v : JSON.stringify(v)}`);
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
