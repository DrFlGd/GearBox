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
const flipOption = (ready: string): ParamDef => ({ key: "flip", label: "Orientation", type: "select", options: [{ value: "true", label: ready }, { value: "false", label: "As used" }] });

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
    id: "crank", title: "Crank", group: "Add-ons",
    blurb: "Hub ring that pegs into any gear's top face under the knob, with a thick arm and a press-fit socket for a post at the throw. A long post and the handle make a hand crank; a short post and a link make a crank-rocker linkage. Prints upside down.",
    params: [
      { key: "throw", label: "Throw (mm)", type: "select", options: [20, 30, 40, 50, 60, 70, 80].map(v => ({ value: v, label: `${v} mm` })) },
      flipOption("Print-ready (pegs up)"),
    ],
    defaults: { throw: 40, flip: "true" },
    name: p => `CRANK${p.throw}`,
  },
  {
    id: "post", title: "Post", group: "Add-ons",
    blurb: "Presses into the crank's socket. 11 mm carries one bearing (a link), 28 mm carries the handle or a spacer and a link. The cap presses into the hole on top.",
    params: [{ key: "post_h", label: "Height (mm)", type: "number", min: 8, max: 40, step: 1 }],
    defaults: { post_h: 11 },
    name: p => (Number(p.post_h) === 11 ? "POST" : Number(p.post_h) === 28 ? "POSTH" : `POST${p.post_h}`),
  },
  { id: "joint", title: "Joint post", group: "Add-ons", blurb: "Flanged post that joins two links to each other away from any pin: a bearing in each link, a 3 mm spacer between, the cap on top.", params: [], defaults: {}, name: () => "JOINT" },
  { id: "handle", title: "Handle grip", group: "Add-ons", blurb: "Free-spinning grip that drops over the long post.", params: [], defaults: {}, name: () => "HANDLE" },
  { id: "cap", title: "Post cap", group: "Add-ons", blurb: "Slotted stem presses into the top of a post and keeps whatever rides on it in place.", params: [], defaults: {}, name: () => "CAP" },
  {
    id: "pointer", title: "Pointer", group: "Add-ons",
    blurb: "Hub ring that pegs into a gear's top face with a thin arm that runs under the dial knob and shows past its rim. Prints upside down.",
    params: [flipOption("Print-ready (pegs up)")], defaults: { flip: "true" }, name: () => "PTR",
  },
  {
    id: "dial_knob", title: "Dial knob", group: "Add-ons",
    blurb: "The bolt knob with a numbered disc under the grip: clock numbers and 60 ticks raised around its rim. It replaces the knob on a pin that carries a pointer.",
    params: [], defaults: {}, name: () => "DIALK",
  },
  {
    id: "pulley", title: "Pulley", group: "Add-ons",
    blurb: "Grooved wheel for a rubber band on the same hub as a gear (bearing seat, peg holes). Its size is a tooth-count equivalent, so a P40 driving a P20 is 2:1 like the gears. Any centre distance works; cross the band to reverse.",
    params: [{ key: "pulley_n", label: "Size", type: "select", options: toothOptions.map(o => ({ value: o.value, label: `${o.value} (${o.value} mm at M1 scale)` })) }],
    defaults: { pulley_n: 40 },
    name: p => `P${p.pulley_n}`,
  },
  {
    id: "link", title: "Link", group: "Add-ons",
    blurb: "Bar with bearing seats one grid step apart, one level thick. Pivots on a pin or a crank post; two links and a crank make a crank-rocker.",
    params: [{ key: "holes", label: "Holes", type: "number", min: 2, max: 6, step: 1 }],
    defaults: { holes: 3 },
    name: p => `L${p.holes}`,
  },
  {
    id: "ratchet", title: "Ratchet wheel", group: "Add-ons",
    blurb: "Twelve sawtooth teeth on the gear hub; joins to a gear with coupler halves. Turns clockwise past the pawl and locks the other way.",
    params: [], defaults: {}, name: () => "RATCHET",
  },
  {
    id: "pawl", title: "Pawl", group: "Add-ons",
    blurb: "Clamps on a pin two sockets from the ratchet (the knob boss and the spacer grip it). A printed leaf spring carries the tooth. Flip it for a ratchet that must lock clockwise.",
    params: [{ key: "flip_pawl", label: "Direction", type: "select", options: [{ value: "false", label: "Locks counter-clockwise" }, { value: "true", label: "Locks clockwise" }] }],
    defaults: { flip_pawl: "false" },
    name: p => (p.flip_pawl === "true" ? "PAWL-L" : "PAWL"),
  },
  {
    id: "motor_mount", title: "N20 motor mount", group: "Motor",
    blurb: "Bridge that bolts into the two sockets at (-1, 2) and (1, 2) from the motor socket and holds an N20 gearmotor upside down over it, shaft down into the pinion. Two knobs and two 1-level bolts hold it. Prints legs down.",
    params: [{ key: "level", label: "Pinion level", type: "select", options: [1, 2, 3].map(v => ({ value: v, label: `level ${v}` })) }],
    defaults: { level: 1 },
    name: p => (Number(p.level) === 1 ? "MOTOR" : `MOTOR${p.level}`),
  },
  { id: "pinion", title: "Motor pinion", group: "Motor", blurb: "20T gear with a D bore for the N20's 3 mm shaft instead of a bearing.", params: [], defaults: {}, name: () => "PINION" },
  {
    id: "rail", title: "Slider rail", group: "Mechanisms",
    blurb: "Dovetail rail that bolts into the sockets at both ends of the row beside it; carriages slide along it. Prints flat.",
    params: [{ key: "rail_n", label: "Sockets spanned", type: "number", min: 2, max: 8, step: 1 }],
    defaults: { rail_n: 4 },
    name: p => `RAIL${p.rail_n}`,
  },
  {
    id: "carriage", title: "Carriage", group: "Mechanisms",
    blurb: "Slides on the rail; a square pocket on top takes the scotch yoke's tower or the slider post. Prints upside down.",
    params: [flipOption("Print-ready (upside down)")], defaults: { flip: "true" }, name: () => "CARRIAGE",
  },
  {
    id: "rack", title: "Rack carriage", group: "Mechanisms",
    blurb: "Carriage with a toothed bar along one side; a gear on the level of the teeth drives it back and forth. The pitch line is one grid step from the rail, so a 20T sits two rows away and a 40T three. Prints upside down.",
    params: [
      { key: "rack_len", label: "Length (grid steps)", type: "number", min: 2, max: 4, step: 1 },
      { key: "level", label: "Teeth at level", type: "select", options: [1, 2].map(v => ({ value: v, label: `level ${v}` })) },
      flipOption("Print-ready (upside down)"),
    ],
    defaults: { rack_len: 2, level: 1, flip: "true" },
    name: p => `RACK${p.rack_len}${Number(p.level) > 1 ? `-L${p.level}` : ""}`,
  },
  {
    id: "yoke", title: "Scotch yoke", group: "Mechanisms",
    blurb: "Tower that plugs into the carriage and carries a slotted plate two levels above the crank's gear; the crank post's bearing rides in the slot and the carriage reciprocates with a pure sine motion. Prints upside down.",
    params: [
      { key: "level", label: "Crank gear on level", type: "select", options: [1, 2].map(v => ({ value: v, label: `level ${v}` })) },
      { key: "throw", label: "Crank throw (mm)", type: "select", options: [20, 30, 40].map(v => ({ value: v, label: `${v} mm` })) },
      { key: "reach", label: "Reach (grid steps)", type: "number", min: 2, max: 5, step: 1 },
      flipOption("Print-ready (upside down)"),
    ],
    defaults: { level: 1, throw: 20, reach: 3, flip: "true" },
    name: p => `YOKE${p.throw}R${p.reach}${Number(p.level) > 1 ? `-L${p.level}` : ""}`,
  },
  {
    id: "slider_post", title: "Slider post", group: "Mechanisms",
    blurb: "Column that plugs into the carriage with a post on top at the crank's link level; a link from the crank post makes a crank slider.",
    params: [{ key: "level", label: "Crank gear on level", type: "select", options: [1, 2].map(v => ({ value: v, label: `level ${v}` })) }],
    defaults: { level: 1 },
    name: p => `SLPOST${Number(p.level) > 1 ? `-L${p.level}` : ""}`,
  },
  {
    id: "cam", title: "Cam", group: "Mechanisms",
    blurb: "Disc cam on a bearing, one level thick, lifting the follower by half a grid step: an eccentric for a smooth sine, a heart for an even rise and fall, a snail for a slow rise and a drop.",
    params: [{ key: "cam", label: "Profile", type: "select", options: [{ value: "eccentric", label: "Eccentric" }, { value: "heart", label: "Heart" }, { value: "snail", label: "Snail" }] }],
    defaults: { cam: "eccentric" },
    name: p => `CAM-${String(p.cam).slice(0, 1).toUpperCase()}`,
  },
  { id: "follower", title: "Cam follower", group: "Mechanisms", blurb: "Arm on a pin two sockets from the cam with a round nose that rides the cam's edge and a tail for a rubber band to hold it down.", params: [], defaults: {}, name: () => "FOLLOWER" },
  {
    id: "geneva_driver", title: "Geneva driver", group: "Mechanisms",
    blurb: "A 40T gear with a drive post and a locking crescent one level up: it turns the wheel one slot per turn and locks it in between. Takes two bearings.",
    params: [{ key: "slots", label: "Wheel slots", type: "select", options: [6, 8].map(v => ({ value: v, label: `${v}` })) }],
    defaults: { slots: 6 },
    name: p => `GENEVA${p.slots}-D`,
  },
  {
    id: "geneva_wheel", title: "Geneva wheel", group: "Mechanisms",
    blurb: "Slotted wheel on a pin three sockets from its driver, one level above it. Dwells while the crescent holds it.",
    params: [{ key: "slots", label: "Slots", type: "select", options: [6, 8].map(v => ({ value: v, label: `${v}` })) }],
    defaults: { slots: 6 },
    name: p => `GENEVA${p.slots}`,
  },
  {
    id: "partial", title: "Partial gear", group: "Mechanisms",
    blurb: "Gear with teeth on only half or a quarter of its rim: whatever it meshes with turns in bursts and rests between them.",
    params: [
      { key: "teeth", label: "Teeth", type: "select", options: toothOptions },
      { key: "keep", label: "Toothed rim", type: "select", options: [{ value: "half", label: "Half" }, { value: "quarter", label: "Quarter" }] },
    ],
    defaults: { teeth: 40, keep: "half" },
    name: p => `G${p.teeth}${p.keep === "quarter" ? "Q" : "H"}`,
  },
  {
    id: "qr_lever", title: "Quick-return lever", group: "Mechanisms",
    blurb: "Slotted lever on a pin a few sockets from a crank; the crank post's bearing rides in the slot, so the lever swings slowly one way and quickly back. A post socket at the far end takes a link.",
    params: [
      { key: "d_steps", label: "Pivot distance (grid steps)", type: "number", min: 2, max: 4, step: 1 },
      { key: "throw", label: "Crank throw (mm)", type: "select", options: [20, 30, 40].map(v => ({ value: v, label: `${v} mm` })) },
    ],
    defaults: { d_steps: 3, throw: 20 },
    name: p => `QR${p.d_steps}-${p.throw}`,
  },
  { id: "escape_wheel", title: "Escape wheel", group: "Mechanisms", blurb: "15 tooth ratchet-shaped wheel for the anchor escapement; it steps one tooth per swing of the anchor.", params: [], defaults: {}, name: () => "ESCWHEEL" },
  {
    id: "anchor", title: "Anchor", group: "Mechanisms",
    blurb: "Recoil anchor on a pin two sockets from the escape wheel, with a balance bar that sets the beat. Clamps on the pin with its nut.",
    params: [{ key: "cw", label: "Wheel runs", type: "select", options: [{ value: "true", label: "clockwise (standard)" }, { value: "false", label: "counter-clockwise (mirrored)" }] }],
    defaults: { cw: "true" },
    name: p => (p.cw === "false" ? "ANCHOR-L" : "ANCHOR"),
  },
  {
    id: "spring_gear", title: "Spring gear", group: "Mechanisms",
    blurb: "Gear with a wall on its top face for the wind-up spring; the spring's outer hook catches a notch in the wall.",
    params: [{ key: "teeth", label: "Teeth", type: "select", options: toothOptions.filter(o => Number(o.value) >= 30) }],
    defaults: { teeth: 40 },
    name: p => `SG${p.teeth}`,
  },
  { id: "spring", title: "Wind-up spring", group: "Mechanisms", blurb: "Printed spiral spring (PETG works best): its boss grips the bearing's inner race on a pin held by its knob, the hook catches the spring gear's wall. Wind the knob, let the train run down.", params: [], defaults: {}, name: () => "SPRING" },
  { id: "winch", title: "Winch drum", group: "Mechanisms", blurb: "Two-level drum with a bottom flange on two bearings; a string winds on it. The top flange presses on.", params: [], defaults: {}, name: () => "WINCH" },
  { id: "winch_flange", title: "Winch flange", group: "Mechanisms", blurb: "Press-on top flange for the winch drum.", params: [], defaults: {}, name: () => "WFLANGE" },
  { id: "hook", title: "Hook", group: "Mechanisms", blurb: "Small hook for the end of the winch string.", params: [], defaults: {}, name: () => "HOOK" },
  {
    id: "coupon", title: "Fit test coupon", group: "Test",
    blurb: "One small print that checks every fit in the kit: bolt holes, nut pockets, a dovetail pair, the bearing seat and the coupler peg holes. Print this first and tune the profile.",
    params: [], defaults: {}, name: () => "COUPON",
  },
];

export const partKind = (id: string) => PART_KINDS.find(k => k.id === id);

export const SIZES = ["M2", "M1.5"] as const;
export type Size = (typeof SIZES)[number];
export type Standard = { title: string; module: number; grid: number; level: number; gear_thickness: number; bolt: string; bearing: string; nut: string; knob_d: number; dial_r: number; spacer_od: number; tile_h: number; plate_t: number; bolt_lengths: Record<string, number> };
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
