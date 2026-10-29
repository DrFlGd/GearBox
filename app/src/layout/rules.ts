// What the tester checks: which gears mesh or collide, which hardware a gear
// hits, how the train turns, and what to print.
import { gearAt, pitchR, socketPos, std, tipR, topLevel, type Gear, type Layout, type Pin } from "./model";
import { catalog, type Size } from "../parts";

export type GearRef = { pin: Pin; gear: Gear };
export type Pair = { a: GearRef; b: GearRef; kind: "mesh" | "collide" };
export type HardwareHit = { gear: GearRef; pin: Pin; what: "spacer" | "knob" };
export type Problem = { text: string; pin?: string; level?: number };

export type Analysis = {
  pairs: Pair[];
  hits: HardwareHit[];
  problems: Problem[];
  speed: Map<string, number>;       // key pin:level -> angular speed relative to the input (sign = direction)
  phase: Map<string, number>;       // key -> initial angle, radians, so meshing teeth interleave
  locked: boolean;
  reachable: Set<string>;
};

export const key = (pin: Pin | string, level: number) => `${typeof pin === "string" ? pin : pin.id}:${level}`;
const dist = (l: Layout, p: Pin, q: Pin) => { const a = socketPos(l, p.x, p.y), b = socketPos(l, q.x, q.y); return Math.hypot(a.x - b.x, a.y - b.y); };
const angle = (l: Layout, p: Pin, q: Pin) => { const a = socketPos(l, p.x, p.y), b = socketPos(l, q.x, q.y); return Math.atan2(b.y - a.y, b.x - a.x); };

export function analyze(l: Layout): Analysis {
  const s = std(l.size);
  const m = s.module;
  const pairs: Pair[] = [];
  const hits: HardwareHit[] = [];
  const problems: Problem[] = [];
  const gears: GearRef[] = l.pins.flatMap(pin => pin.gears.map(gear => ({ pin, gear })));

  // gear pairs on the same level
  for (let i = 0; i < gears.length; i++) for (let j = i + 1; j < gears.length; j++) {
    const a = gears[i], b = gears[j];
    if (a.pin === b.pin || a.gear.level !== b.gear.level) continue;
    const d = dist(l, a.pin, b.pin);
    const req = (m * (a.gear.teeth + b.gear.teeth)) / 2;
    if (Math.abs(d - req) < 0.05) pairs.push({ a, b, kind: "mesh" });
    else if (d < req + 2 * m) pairs.push({ a, b, kind: "collide" });
  }
  // gears against other pins' hardware at the same level
  for (const g of gears) for (const pin of l.pins) {
    if (pin === g.pin || gearAt(pin, g.gear.level)) continue;
    const top = topLevel(pin);
    const lv = g.gear.level;
    const hw: HardwareHit["what"] | null = lv <= top ? "spacer" : lv === top + 1 ? "knob" : null;
    if (!hw) continue;
    const r = hw === "spacer" ? s.spacer_od / 2 : s.knob_d / 2;
    if (dist(l, g.pin, pin) < tipR(l.size, g.gear.teeth) + r + 0.5) hits.push({ gear: g, pin, what: hw });
  }
  // stack rules
  for (const pin of l.pins) {
    const levels = pin.gears.map(g => g.level);
    if (new Set(levels).size !== levels.length) problems.push({ text: "two gears on one level", pin: pin.id });
    for (const g of pin.gears) {
      if (g.joined && !gearAt(pin, g.level - 1)) problems.push({ text: `level ${g.level} is joined to an empty level below`, pin: pin.id, level: g.level });
    }
    if (topLevel(pin) > 3) problems.push({ text: "a pin carries at most 3 levels", pin: pin.id });
  }
  for (const p of pairs) if (p.kind === "collide") problems.push({ text: `${p.a.gear.teeth}T and ${p.b.gear.teeth}T on level ${p.a.gear.level} collide`, pin: p.a.pin.id, level: p.a.gear.level });
  for (const h of hits) problems.push({ text: `${h.gear.gear.teeth}T on level ${h.gear.gear.level} hits a ${h.what} on another pin`, pin: h.gear.pin.id, level: h.gear.gear.level });

  // train solver: breadth first from the input over mesh and joined edges
  const speed = new Map<string, number>();
  const phase = new Map<string, number>();
  const reachable = new Set<string>();
  let locked = false;
  const adj = new Map<string, { to: GearRef; ratio: number; mesh?: { from: GearRef; dir: number } }[]>();
  const add = (from: GearRef, to: GearRef, ratio: number, dir?: number) => {
    const k = key(from.pin, from.gear.level);
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k)!.push({ to, ratio, mesh: dir === undefined ? undefined : { from, dir } });
  };
  for (const p of pairs) if (p.kind === "mesh") {
    add(p.a, p.b, -p.a.gear.teeth / p.b.gear.teeth, angle(l, p.a.pin, p.b.pin));
    add(p.b, p.a, -p.b.gear.teeth / p.a.gear.teeth, angle(l, p.b.pin, p.a.pin));
  }
  for (const pin of l.pins) for (const g of pin.gears) if (g.joined) {
    const below = gearAt(pin, g.level - 1);
    if (!below) continue;
    add({ pin, gear: below }, { pin, gear: g }, 1);
    add({ pin, gear: g }, { pin, gear: below }, 1);
  }
  const input = l.input && gears.find(g => g.pin.id === l.input!.pin && g.gear.level === l.input!.level);
  if (input) {
    const k0 = key(input.pin, input.gear.level);
    speed.set(k0, 1); phase.set(k0, 0); reachable.add(k0);
    const queue: GearRef[] = [input];
    while (queue.length) {
      const cur = queue.shift()!;
      const kc = key(cur.pin, cur.gear.level);
      for (const e of adj.get(kc) ?? []) {
        const kt = key(e.to.pin, e.to.gear.level);
        const w = speed.get(kc)! * e.ratio;
        if (speed.has(kt)) { if (Math.abs(speed.get(kt)! - w) > 1e-6) locked = true; continue; }
        speed.set(kt, w);
        reachable.add(kt);
        // tooth phase: a tooth of `cur` on the centre line faces a gap of `to`
        if (e.mesh) {
          const n1 = cur.gear.teeth, n2 = e.to.gear.teeth, a = e.mesh.dir;
          const pitch1 = (2 * Math.PI) / n1, pitch2 = (2 * Math.PI) / n2;
          const p1 = ((((phase.get(kc)! - a) / pitch1) % 1) + 1) % 1;
          phase.set(kt, a + Math.PI + (0.5 - p1) * pitch2);
        } else phase.set(kt, phase.get(kc)!);
        queue.push(e.to);
      }
    }
  }
  if (locked) problems.push({ text: "the train is locked: a loop disagrees with itself" });
  return { pairs, hits, problems, speed, phase, locked, reachable };
}

export type BomLine = { name: string; title: string; qty: number; params?: Record<string, string | number> };

/** What to print and buy for a layout. Printed parts carry catalog-style names and params for the kit zip. */
export function billOfMaterials(l: Layout): { printed: BomLine[]; hardware: BomLine[] } {
  const s = std(l.size);
  const printed = new Map<string, BomLine>();
  const hardware = new Map<string, BomLine>();
  const addP = (name: string, title: string, params: Record<string, string | number>, qty = 1) => {
    const e = printed.get(name); if (e) e.qty += qty; else printed.set(name, { name, title, qty, params });
  };
  const addH = (name: string, title: string, qty = 1) => { const e = hardware.get(name); if (e) e.qty += qty; else hardware.set(name, { name, title, qty }); };

  addP(`B${l.tile.nx}x${l.tile.ny}`, `Tile ${l.tile.nx}x${l.tile.ny}`, { part: "tile", tile_nx: l.tile.nx, tile_ny: l.tile.ny, flip: "true" }, l.tiles.cols * l.tiles.rows);
  for (const pin of l.pins) {
    if (!pin.gears.length) continue;
    const top = topLevel(pin);
    addP("K", "Bolt knob", { part: "knob" });
    addP("BS", "Base spacer", { part: "base_spacer" });
    addH(`bolt-${top}`, `${s.bolt} x ${s.bolt_lengths[String(top)] ?? "?"} mm hex bolt`);
    addH("nut", `${s.nut} nut`);
    const sorted = [...pin.gears].sort((a, b) => a.level - b.level);
    if (sorted[0].level > 1) addP(`S${s.level}`, `Spacer ${s.level} mm`, { part: "spacer", spacer_h: s.level }, sorted[0].level - 1); // empty levels under the first gear
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const above = sorted[i + 1];
      if (above?.joined && g.teeth > above.teeth && above.level === g.level + 1) {
        addP(`G${g.teeth}-${above.teeth}`, `Compound ${g.teeth}T over ${above.teeth}T`, { part: "compound", teeth: g.teeth, teeth_upper: above.teeth, face: "spokes" });
        addH("bearing", `${s.bearing} bearing`, 2);
        addP("S3", "Spacer 3 mm", { part: "spacer", spacer_h: 3 }); // between the compound's two bearings
        i++; // the upper gear is part of the compound
        if (sorted[i + 1]) spacersBetween(above.level, sorted[i + 1].level);
        continue;
      }
      addP(`G${g.teeth}`, `Gear ${g.teeth}T`, { part: "gear", teeth: g.teeth, face: g.teeth >= 40 ? "spokes" : "solid" });
      addH("bearing", `${s.bearing} bearing`);
      if (above) {
        if (above.joined) addP("CPL", "Coupler half", { part: "coupler" }, 2);
        spacersBetween(g.level, above.level);
      }
    }
    function spacersBetween(lo: number, hi: number) {
      for (let k = lo; k < hi; k++) {
        addP("S3", "Spacer 3 mm", { part: "spacer", spacer_h: 3 });
        if (k > lo) addP(`S${s.level}`, `Spacer ${s.level} mm`, { part: "spacer", spacer_h: s.level }); // an empty level in between
      }
    }
  }
  return { printed: [...printed.values()], hardware: [...hardware.values()] };
}

export const ratioText = (w: number) => {
  if (!w) return "not driven";
  const r = Math.abs(w);
  const dir = w > 0 ? "same way as the input" : "opposite to the input";
  return r >= 1 ? `${fmt(r)}× the input speed, ${dir}` : `1/${fmt(1 / r)} of the input speed, ${dir}`;
};
const fmt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(2));

export const sizeOf = (size: Size) => catalog.standards[size];
export { pitchR };
