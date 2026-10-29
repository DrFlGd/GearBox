// What the tester checks: which items mesh, band together or collide, which
// hardware an item hits, how the train turns, and what to print.
import {
  ARM_W, crankLinkLevel, gearAt, itemR, kindOf, motorLegs, pinById, pitchR, pointerReach, socketPos, std, tipR, topLevel,
  type Band, type Gear, type Layout, type Pin,
} from "./model";
import { catalog, type Size } from "../parts";

export type GearRef = { pin: Pin; gear: Gear };
export type Pair = { a: GearRef; b: GearRef; kind: "mesh" | "collide" | "band" };
export type HardwareHit = { gear: GearRef; pin: Pin; what: "spacer" | "knob" | "mount" | "crank" | "pointer" };
export type Problem = { text: string; pin?: string; level?: number };
/** A crank-rocker linkage the view animates: crank post on pin `crank`, rocker on pin `rocker`. */
export type Linkage = { crank: GearRef; rocker: GearRef; throw: number; coupler: number; rockerLen: number; ok: boolean };

export type Analysis = {
  pairs: Pair[];
  hits: HardwareHit[];
  problems: Problem[];
  speed: Map<string, number>;       // key pin:level -> angular speed relative to the input (sign = direction)
  phase: Map<string, number>;       // key -> initial angle, radians, so meshing teeth interleave
  locked: boolean;
  reachable: Set<string>;
  pawls: Map<string, number>;       // pawl key -> angle (radians) toward its ratchet
  linkages: Linkage[];
};

export const key = (pin: Pin | string, level: number) => `${typeof pin === "string" ? pin : pin.id}:${level}`;
const mm = (l: Layout, p: Pin) => socketPos(l, p.x, p.y);
const dist = (l: Layout, p: Pin, q: Pin) => { const a = mm(l, p), b = mm(l, q); return Math.hypot(a.x - b.x, a.y - b.y); };
const angle = (l: Layout, p: Pin, q: Pin) => { const a = mm(l, p), b = mm(l, q); return Math.atan2(b.y - a.y, b.x - a.x); };
const label = (g: Gear) => { switch (kindOf(g)) { case "gear": return `${g.teeth}T`; case "pulley": return `P${g.teeth}`; case "ratchet": return "ratchet"; case "pawl": return "pawl"; case "rocker": return "rocker"; } };

/** Footprint of a motor mount in mm, relative to the motor socket, turned by dir: leg circles and the block. */
export function motorFootprint(l: Layout, pin: Pin) {
  const s = std(l.size);
  const g = s.grid, m = s.module;
  const dir = pin.motor?.dir ?? 0;
  const rot = (x: number, y: number) => { for (let k = 0; k < dir; k++) [x, y] = [-y, x]; return { x, y }; };
  const legR = (Number(s.bolt.slice(1)) * 1.6 + 5) / 2 + 0.3;            // BOLT[1] + 5, roughly
  const legs = motorLegs(dir).map(([i, j]) => ({ x: i * g, y: j * g, r: legR }));
  // block: x in [-w/2, w/2], y in [tipR(20)+1, 2g] before rotation; the cradle sits over the axis
  const w = 12 + 0.4 + 2 * 1.6;
  const corners = [[-w / 2, m * 11 + 1], [w / 2, m * 11 + 1], [w / 2, 2 * g], [-w / 2, 2 * g]].map(([x, y]) => rot(x, y));
  return { legs, corners, cradleR: w / 2 + 1 };
}
/** Distance from a point to a convex polygon (0 inside). */
function polyDist(px: number, py: number, poly: { x: number; y: number }[]) {
  let inside = true, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    if (ex * (py - a.y) - ey * (px - a.x) < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(px - a.x - t * ex, py - a.y - t * ey));
  }
  return inside ? 0 : best;
}

export function analyze(l: Layout): Analysis {
  const s = std(l.size);
  const m = s.module;
  const pairs: Pair[] = [];
  const hits: HardwareHit[] = [];
  const problems: Problem[] = [];
  const pawls = new Map<string, number>();
  const linkages: Linkage[] = [];
  const gears: GearRef[] = l.pins.flatMap(pin => pin.gears.map(gear => ({ pin, gear })));
  const bands: Band[] = l.bands ?? [];
  const bandOf = (b: Band["a"]) => gears.find(g => g.pin.id === b.pin && g.gear.level === b.level);

  // items on the same level: gears mesh or collide, anything else collides
  for (let i = 0; i < gears.length; i++) for (let j = i + 1; j < gears.length; j++) {
    const a = gears[i], b = gears[j];
    if (a.pin === b.pin || a.gear.level !== b.gear.level) continue;
    const d = dist(l, a.pin, b.pin);
    const ka = kindOf(a.gear), kb = kindOf(b.gear);
    if (ka === "gear" && kb === "gear") {
      const req = (m * (a.gear.teeth + b.gear.teeth)) / 2;
      if (Math.abs(d - req) < 0.05) pairs.push({ a, b, kind: "mesh" });
      else if (d < req + 2 * m) pairs.push({ a, b, kind: "collide" });
      continue;
    }
    if ((ka === "pawl" && kb === "ratchet") || (ka === "ratchet" && kb === "pawl")) continue; // checked below
    if (ka === "rocker" || kb === "rocker") continue;                                          // checked with its linkage
    if (d < itemR(l.size, a.gear) + itemR(l.size, b.gear) + 0.5) pairs.push({ a, b, kind: "collide" });
  }
  // bands between pulleys
  for (const b of bands) {
    const a = bandOf(b.a), c = bandOf(b.b);
    if (!a || !c || kindOf(a.gear) !== "pulley" || kindOf(c.gear) !== "pulley") { problems.push({ text: "a band is missing a pulley" }); continue; }
    if (a.gear.level !== c.gear.level) problems.push({ text: "a band joins pulleys on different levels", pin: a.pin.id, level: a.gear.level });
    pairs.push({ a, b: c, kind: "band" });
  }
  // pawls want a ratchet exactly two sockets away along a grid line
  for (const g of gears) if (kindOf(g.gear) === "pawl") {
    const r = gears.find(o => o.pin !== g.pin && kindOf(o.gear) === "ratchet" && o.gear.level === g.gear.level
      && ((Math.abs(o.pin.x - g.pin.x) === 2 && o.pin.y === g.pin.y) || (Math.abs(o.pin.y - g.pin.y) === 2 && o.pin.x === g.pin.x)));
    if (!r) problems.push({ text: "the pawl needs a ratchet two sockets away on its level, straight along the grid", pin: g.pin.id, level: g.gear.level });
    else pawls.set(key(g.pin, g.gear.level), angle(l, g.pin, r.pin));
  }
  // items against other pins' hardware at the same level
  const crankR = (g: Gear) => (g.throw ?? 2 * s.grid) + ARM_W(l.size) / 2 + 1;
  for (const g of gears) for (const pin of l.pins) {
    if (pin === g.pin) continue;
    const lv = g.gear.level;
    const r = itemR(l.size, g.gear);
    const d = dist(l, g.pin, pin);
    const top = topLevel(pin);
    if (!gearAt(pin, lv)) {
      // a bolt with spacers, or the knob on top of the stack
      const hw: HardwareHit["what"] | null = pin.motor ? null : lv <= top ? "spacer" : lv === top + 1 ? "knob" : null;
      if (hw) {
        const topG = gearAt(pin, top);
        const hr = hw === "spacer" ? s.spacer_od / 2 : topG?.topper === "pointer" ? s.dial_r : s.knob_d / 2;
        if (d < r + hr + 0.5) hits.push({ gear: g, pin, what: hw });
      }
    }
    // cranks sweep above their gear through the next three levels; pointers one level, out to the dial rim
    for (const o of pin.gears) {
      if (o.topper === "crank" && lv > o.level && lv <= o.level + 3 && d < r + crankR(o) + 0.5) hits.push({ gear: g, pin, what: "crank" });
      if (o.topper === "pointer" && lv === o.level + 1 && d < r + pointerReach(l.size) + 0.5) hits.push({ gear: g, pin, what: "pointer" });
    }
    // a motor mount's legs, block and cradle
    if (pin.motor) {
      const motorLevel = pin.gears[0]?.level ?? 1;
      const fp = motorFootprint(l, pin);
      const o = mm(l, pin), p = mm(l, g.pin);
      const rel = { x: p.x - o.x, y: p.y - o.y };
      const legHit = lv <= motorLevel && fp.legs.some(leg => Math.hypot(rel.x - leg.x, rel.y - leg.y) < r + leg.r + 0.5);
      const blockHit = lv <= motorLevel && polyDist(rel.x, rel.y, fp.corners) < r + 0.5;
      const cradleHit = lv > motorLevel && d < r + fp.cradleR + 0.5;
      if (legHit || blockHit || cradleHit) hits.push({ gear: g, pin, what: "mount" });
    }
  }
  // stack rules
  for (const pin of l.pins) {
    const levels = pin.gears.map(g => g.level);
    if (new Set(levels).size !== levels.length) problems.push({ text: "two items on one level", pin: pin.id });
    const top = topLevel(pin);
    for (const g of pin.gears) {
      if (g.joined && !gearAt(pin, g.level - 1)) problems.push({ text: `level ${g.level} is joined to an empty level below`, pin: pin.id, level: g.level });
      if (g.topper && g.level !== top) problems.push({ text: `the ${g.topper} must be on the top item of the pin`, pin: pin.id, level: g.level });
      if (g.topper && kindOf(g) === "pawl") problems.push({ text: `a pawl cannot carry a ${g.topper}`, pin: pin.id, level: g.level });
      if (g.topper === "crank" && crankLinkLevel(g.level) > 4) problems.push({ text: "a crank needs its gear on level 2 or lower", pin: pin.id, level: g.level });
    }
    if (top > 4) problems.push({ text: "a pin carries at most 4 levels", pin: pin.id });
    if (pin.motor) {
      if (pin.gears.length !== 1 || pin.gears[0].teeth !== 20 || kindOf(pin.gears[0]) !== "gear") problems.push({ text: "a motor pin carries only its 20T pinion", pin: pin.id });
      for (const [i, j] of motorLegs(pin.motor.dir)) {
        const hit = l.pins.find(q => q.x === pin.x + i && q.y === pin.y + j);
        if (hit) problems.push({ text: "a pin sits where the motor mount's leg bolts in", pin: hit.id });
      }
    }
  }
  // linkages: a rocker on a pin, driven by a crank on another pin through a coupler link
  for (const g of gears) if (kindOf(g.gear) === "rocker") {
    const rk = g.gear.rocker;
    const crankPin = rk && pinById(l, rk.crank);
    const crank = crankPin?.gears.find(o => o.topper === "crank");
    if (!rk || !crankPin || !crank) { problems.push({ text: "the rocker's crank is gone", pin: g.pin.id, level: g.gear.level }); continue; }
    const throwMm = crank.throw ?? 2 * s.grid;
    const coupler = (rk.coupler - 1) * s.grid, rockerLen = (rk.holes - 1) * s.grid;
    const G = dist(l, crankPin, g.pin);
    const ok = G + throwMm <= coupler + rockerLen - 0.01 && G - throwMm >= Math.abs(coupler - rockerLen) + 0.01;
    if (!ok) problems.push({ text: `the linkage binds: ${rk.coupler} hole coupler and ${rk.holes} hole rocker cannot follow a ${throwMm} mm crank ${G.toFixed(0)} mm away`, pin: g.pin.id, level: g.gear.level });
    if (g.gear.level !== crankLinkLevel(crank.level)) problems.push({ text: `the rocker must be on level ${crankLinkLevel(crank.level)}, two above its crank`, pin: g.pin.id, level: g.gear.level });
    linkages.push({ crank: { pin: crankPin, gear: crank }, rocker: g, throw: throwMm, coupler, rockerLen, ok });
  }
  for (const p of pairs) if (p.kind === "collide") problems.push({ text: `${label(p.a.gear)} and ${label(p.b.gear)} on level ${p.a.gear.level} collide`, pin: p.a.pin.id, level: p.a.gear.level });
  for (const h of hits) problems.push({ text: `${label(h.gear.gear)} on level ${h.gear.gear.level} hits a ${h.what === "mount" ? "motor mount" : h.what} on another pin`, pin: h.gear.pin.id, level: h.gear.gear.level });

  // train solver: breadth first from the input over mesh, band and joined edges
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
  for (const p of pairs) {
    if (p.kind === "mesh") {
      add(p.a, p.b, -p.a.gear.teeth / p.b.gear.teeth, angle(l, p.a.pin, p.b.pin));
      add(p.b, p.a, -p.b.gear.teeth / p.a.gear.teeth, angle(l, p.b.pin, p.a.pin));
    } else if (p.kind === "band") {
      const band = bands.find(b => bandOf(b.a) === p.a && bandOf(b.b) === p.b);
      const sgn = band?.crossed ? -1 : 1;
      add(p.a, p.b, (sgn * p.a.gear.teeth) / p.b.gear.teeth);
      add(p.b, p.a, (sgn * p.b.gear.teeth) / p.a.gear.teeth);
    }
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
  // a ratchet turning the wrong way against its pawl locks the train
  for (const g of gears) if (kindOf(g.gear) === "pawl") {
    const k = key(g.pin, g.gear.level);
    if (!pawls.has(k)) continue;
    const r = gears.find(o => kindOf(o.gear) === "ratchet" && o.gear.level === g.gear.level && Math.abs(angle(l, g.pin, o.pin) - pawls.get(k)!) < 1e-6);
    const w = r && speed.get(key(r.pin, r.gear.level));
    // the ratchet runs clockwise (negative, seen from above) past a standard pawl
    if (w && ((w > 0 && !g.gear.pawlCw) || (w < 0 && g.gear.pawlCw))) problems.push({ text: "the ratchet turns into its pawl: flip the pawl or the drive", pin: r!.pin.id, level: r!.gear.level });
  }
  if (locked) problems.push({ text: "the train is locked: a loop disagrees with itself" });
  return { pairs, hits, problems, speed, phase, locked, reachable, pawls, linkages };
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
  const spacer = (h: number, qty = 1) => addP(`S${h}`, `Spacer ${h} mm`, { part: "spacer", spacer_h: h }, qty);
  const rockers = l.pins.flatMap(p => p.gears.filter(g => kindOf(g) === "rocker" && g.rocker));
  const linkageCranks = new Set(rockers.map(g => g.rocker!.crank));

  addP(`B${l.tile.nx}x${l.tile.ny}`, `Tile ${l.tile.nx}x${l.tile.ny}`, { part: "tile", tile_nx: l.tile.nx, tile_ny: l.tile.ny, flip: "true" }, l.tiles.cols * l.tiles.rows);
  for (const pin of l.pins) {
    if (!pin.gears.length) continue;
    const top = topLevel(pin);
    const topG = gearAt(pin, top)!;
    if (pin.motor) {
      const lv = pin.gears[0].level;
      addP(lv === 1 ? "MOTOR" : `MOTOR${lv}`, `N20 motor mount, pinion at level ${lv}`, { part: "motor_mount", level: lv });
      addP("PINION", "Motor pinion 20T", { part: "pinion" });
      addP("K", "Bolt knob", { part: "knob" }, 2);
      addH(`bolt-${lv}`, `${s.bolt} x ${s.bolt_lengths[String(lv)] ?? "?"} mm hex bolt`, 2);
      addH("nut", `${s.nut} nut`, 2);
      addH("n20", "N20 gearmotor, 100:1 to 300:1, with 2 x M1.6 screws");
      continue;
    }
    if (topG.topper === "pointer") addP("DIALK", "Dial knob", { part: "dial_knob" }); else addP("K", "Bolt knob", { part: "knob" });
    addP("BS", "Base spacer", { part: "base_spacer" });
    addH(`bolt-${top}`, `${s.bolt} x ${s.bolt_lengths[String(top)] ?? "?"} mm hex bolt`);
    addH("nut", `${s.nut} nut`);
    const sorted = [...pin.gears].sort((a, b) => a.level - b.level);
    if (sorted[0].level > 1) spacer(s.level, sorted[0].level - 1); // empty levels under the first item
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const above = sorted[i + 1];
      const kind = kindOf(g);
      if (kind === "gear" && above?.joined && kindOf(above) === "gear" && g.teeth > above.teeth && above.level === g.level + 1) {
        addP(`G${g.teeth}-${above.teeth}`, `Compound ${g.teeth}T over ${above.teeth}T`, { part: "compound", teeth: g.teeth, teeth_upper: above.teeth, face: "spokes" });
        addH("bearing", `${s.bearing} bearing`, 2);
        spacer(3); // between the compound's two bearings
        i++; // the upper gear is part of the compound
        topper(above);
        if (sorted[i + 1]) spacersBetween(above.level, sorted[i + 1].level);
        continue;
      }
      switch (kind) {
        case "gear": addP(`G${g.teeth}`, `Gear ${g.teeth}T`, { part: "gear", teeth: g.teeth, face: g.teeth >= 40 ? "spokes" : "solid" }); addH("bearing", `${s.bearing} bearing`); break;
        case "pulley": addP(`P${g.teeth}`, `Pulley ${g.teeth}`, { part: "pulley", pulley_n: g.teeth }); addH("bearing", `${s.bearing} bearing`); break;
        case "ratchet": addP("RATCHET", "Ratchet wheel", { part: "ratchet" }); addH("bearing", `${s.bearing} bearing`); break;
        case "pawl": addP(g.pawlCw ? "PAWL-L" : "PAWL", g.pawlCw ? "Pawl, locks clockwise" : "Pawl", { part: "pawl", flip_pawl: g.pawlCw ? "true" : "false" }); break;
        case "rocker": {
          const rk = g.rocker!;
          addP(`L${rk.holes}`, `Link, ${rk.holes} holes`, { part: "link", holes: rk.holes }); addH("bearing", `${s.bearing} bearing`);
          addP(`L${rk.coupler}`, `Link, ${rk.coupler} holes`, { part: "link", holes: rk.coupler }); addH("bearing", `${s.bearing} bearing`, 2);
          addP("JOINT", "Joint post", { part: "joint" }); spacer(3); addP("CAP", "Post cap", { part: "cap" });
          break;
        }
      }
      topper(g);
      if (above) {
        if (above.joined) addP("CPL", "Coupler half", { part: "coupler" }, 2);
        spacersBetween(g.level, above.level);
      }
    }
    function topper(g: Gear) {
      if (g.topper === "pointer") addP("PTR", "Pointer", { part: "pointer", flip: "true" });
      if (g.topper === "crank") {
        const t = g.throw ?? 2 * s.grid;
        addP(`CRANK${t}`, `Crank, ${t} mm throw`, { part: "crank", throw: t, flip: "true" });
        addP("POSTH", "Post, 28 mm", { part: "post", post_h: 28 });
        addP("CAP", "Post cap", { part: "cap" });
        if (linkageCranks.has(pin.id)) spacer(s.level); else addP("HANDLE", "Handle grip", { part: "handle" });
      }
    }
    function spacersBetween(lo: number, hi: number) {
      for (let k = lo; k < hi; k++) {
        spacer(3);
        if (k > lo) spacer(s.level); // an empty level in between
      }
    }
  }
  if (l.bands?.length) addH("band", "rubber band or O-ring", l.bands.length);
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
export { pitchR, tipR };
