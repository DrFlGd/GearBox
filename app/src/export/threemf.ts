// Build a 3MF file (zip of XML) from a binary STL. The engine's 3MF exporter
// is not compiled into the WASM build, and slicers prefer 3MF: it carries
// units, it is smaller, and vertices are shared instead of repeated.
import { zipSync, strToU8 } from "fflate";

export type Mesh = { vertices: Float32Array; triangles: Uint32Array; bbox: { min: number[]; max: number[] } };

/** Parse a binary STL into shared vertices + triangle indices. */
export function parseBinaryStl(bytes: Uint8Array): Mesh {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(80, true);
  const index = new Map<string, number>();
  const verts: number[] = [];
  const tris = new Uint32Array(n * 3);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12; // normal
    for (let k = 0; k < 3; k++) {
      const x = view.getFloat32(o, true), y = view.getFloat32(o + 4, true), z = view.getFloat32(o + 8, true);
      o += 12;
      const key = `${x},${y},${z}`;
      let id = index.get(key);
      if (id === undefined) {
        id = verts.length / 3;
        index.set(key, id);
        verts.push(x, y, z);
        if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
      }
      tris[i * 3 + k] = id;
    }
    o += 2; // attribute byte count
  }
  return { vertices: Float32Array.from(verts), triangles: tris, bbox: { min, max } };
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, ""));

export function meshTo3mf(mesh: Mesh, name: string): Uint8Array {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  parts.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
  parts.push(` <metadata name="Title">${escapeXml(name)}</metadata>\n <metadata name="Application">GearBox part generator</metadata>\n`);
  parts.push(` <resources>\n  <object id="1" name="${escapeXml(name)}" type="model">\n   <mesh>\n    <vertices>\n`);
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += 3) parts.push(`     <vertex x="${fmt(v[i])}" y="${fmt(v[i + 1])}" z="${fmt(v[i + 2])}"/>\n`);
  parts.push("    </vertices>\n    <triangles>\n");
  const t = mesh.triangles;
  for (let i = 0; i < t.length; i += 3) parts.push(`     <triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>\n`);
  parts.push("    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build>\n  <item objectid=\"1\"/>\n </build>\n</model>\n");

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n';

  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rels),
      "3D/3dmodel.model": strToU8(parts.join("")),
    },
    { level: 6 },
  );
}

export const stlTo3mf = (stl: Uint8Array, name: string) => meshTo3mf(parseBinaryStl(stl), name);

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
