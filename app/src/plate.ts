// Lay a kit's printed parts out for printing: every copy of every part, in its print
// orientation (as the catalog renders it), flat on z = 0 and spaced apart on one or
// more bed-sized plates. Exported as a 3MF with one object per part (one build item per
// copy, so a slicer sees separate objects) and as an STL of separate bodies.
import { zipSync, strToU8 } from "fflate";
import { defines, type Overrides, type Profile, type Size } from "./parts";
import { parseBinaryStl, type Mesh } from "./export/threemf";
import type { RenderResult } from "./engine/protocol";
import type { KitItem } from "./kitzip";

export type Placed = { name: string; part: number; x: number; y: number; z: number };
export type PrintPlate = { parts: { name: string; title: string; mesh: Mesh }[]; placed: Placed[]; plates: number; failed: string[] };

const GAP = 6;        // between parts, mm
const PLATE_GAP = 30; // between plates when one bed is not enough

/** Shelf packing: tallest footprints first, rows left to right, a new plate when a bed fills. */
export function layOut(sizes: { w: number; d: number }[], bed: number): { x: number; y: number; plate: number }[] {
  const order = sizes.map((s, i) => i).sort((a, b) => sizes[b].d - sizes[a].d || sizes[b].w - sizes[a].w);
  const out: { x: number; y: number; plate: number }[] = new Array(sizes.length);
  let plate = 0, x = 0, y = 0, row = 0;
  for (const i of order) {
    const { w, d } = sizes[i];
    if (x > 0 && x + w > bed) { x = 0; y += row + GAP; row = 0; }          // next row
    if (y > 0 && y + d > bed) { plate++; x = 0; y = 0; row = 0; }          // next plate
    out[i] = { x: plate * (bed + PLATE_GAP) + x, y, plate };
    x += w + GAP; row = Math.max(row, d);
  }
  return out;
}

export async function buildPrintPlate(opts: {
  items: KitItem[]; size: Size; profile: Profile; overrides: Overrides; bed?: number;
  render: (defs: string[]) => Promise<RenderResult>; onProgress?: (text: string) => void;
}): Promise<PrintPlate> {
  const bed = opts.bed ?? 220;
  const parts: PrintPlate["parts"] = [];
  const failed: string[] = [];
  for (let i = 0; i < opts.items.length; i++) {
    const it = opts.items[i];
    opts.onProgress?.(`${i + 1}/${opts.items.length} ${it.name}`);
    const { part, ...params } = it.params;
    const r = await opts.render(defines(String(part), params, opts.size, opts.profile, opts.overrides));
    if (r.ok && r.bytes) parts.push({ name: it.name, title: it.title, mesh: parseBinaryStl(r.bytes) }); else failed.push(it.name);
  }
  const copies: { part: number; name: string }[] = [];
  parts.forEach((p, pi) => { const qty = opts.items.find(it => it.name === p.name)?.qty ?? 1; for (let k = 0; k < qty; k++) copies.push({ part: pi, name: qty > 1 ? `${p.name} ${k + 1}` : p.name }); });
  const dims = copies.map(c => { const b = parts[c.part].mesh.bbox; return { w: b.max[0] - b.min[0], d: b.max[1] - b.min[1] }; });
  const spots = layOut(dims, bed);
  const placed = copies.map((c, i) => {
    const b = parts[c.part].mesh.bbox;
    return { name: c.name, part: c.part, x: spots[i].x - b.min[0], y: spots[i].y - b.min[1], z: -b.min[2] };
  });
  return { parts, placed, plates: spots.reduce((m, s) => Math.max(m, s.plate + 1), 0), failed };
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, ""));
const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** One object per part, one build item per copy, each moved to its spot. */
export function plateTo3mf(p: PrintPlate, title: string): Uint8Array {
  const s: string[] = [];
  s.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
  s.push(` <metadata name="Title">${esc(title)}</metadata>\n <metadata name="Application">GearBox part generator</metadata>\n <resources>\n`);
  p.parts.forEach((part, i) => {
    s.push(`  <object id="${i + 1}" name="${esc(part.name)}" type="model">\n   <mesh>\n    <vertices>\n`);
    const v = part.mesh.vertices;
    for (let k = 0; k < v.length; k += 3) s.push(`     <vertex x="${fmt(v[k])}" y="${fmt(v[k + 1])}" z="${fmt(v[k + 2])}"/>\n`);
    s.push("    </vertices>\n    <triangles>\n");
    const t = part.mesh.triangles;
    for (let k = 0; k < t.length; k += 3) s.push(`     <triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>\n`);
    s.push("    </triangles>\n   </mesh>\n  </object>\n");
  });
  s.push(" </resources>\n <build>\n");
  for (const c of p.placed) s.push(`  <item objectid="${c.part + 1}" transform="1 0 0 0 1 0 0 0 1 ${fmt(c.x)} ${fmt(c.y)} ${fmt(c.z)}"/>\n`);
  s.push(" </build>\n</model>\n");
  const types = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n';
  return zipSync({ "[Content_Types].xml": strToU8(types), "_rels/.rels": strToU8(rels), "3D/3dmodel.model": strToU8(s.join("")) }, { level: 6 });
}

/** Every copy as its own body in one binary STL (a slicer's "split to objects" separates them). */
export function plateToStl(p: PrintPlate): Uint8Array {
  const n = p.placed.reduce((m, c) => m + p.parts[c.part].mesh.triangles.length / 3, 0);
  const buf = new ArrayBuffer(84 + 50 * n), view = new DataView(buf);
  new Uint8Array(buf).set(strToU8("GearBox print layout".padEnd(80, " ")).subarray(0, 80));
  view.setUint32(80, n, true);
  let o = 84;
  for (const c of p.placed) {
    const { vertices: v, triangles: t } = p.parts[c.part].mesh;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, d = t[k + 2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[d] - v[a], wy = v[d + 1] - v[a + 1], wz = v[d + 2] - v[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true); o += 12;
      for (const q of [a, b, d]) { view.setFloat32(o, v[q] + c.x, true); view.setFloat32(o + 4, v[q + 1] + c.y, true); view.setFloat32(o + 8, v[q + 2] + c.z, true); o += 12; }
      view.setUint16(o, 0, true); o += 2;
    }
  }
  return new Uint8Array(buf);
}
