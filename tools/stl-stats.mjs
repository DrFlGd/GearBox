#!/usr/bin/env node
// Bounding box, volume and triangle count of a binary STL.
//   node tools/stl-stats.mjs out/G40.stl
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function stlStats(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let vol = 0;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const v = [];
    for (let k = 0; k < 3; k++) {
      const x = buf.readFloatLE(o + k * 12), y = buf.readFloatLE(o + k * 12 + 4), z = buf.readFloatLE(o + k * 12 + 8);
      v.push([x, y, z]);
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
    }
    const [a, b, c] = v;
    // signed volume of the tetrahedron (origin, a, b, c)
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  const size = max.map((m, i) => m - min[i]);
  return { triangles: n, min, max, size, volume: vol };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const f of process.argv.slice(2)) {
    const s = stlStats(f);
    const r = v => v.map(x => x.toFixed(2)).join(" x ");
    console.log(`${path.basename(f)}: ${s.triangles} tris, size ${r(s.size)} mm, volume ${(s.volume / 1000).toFixed(2)} cm3, z ${s.min[2].toFixed(2)}..${s.max[2].toFixed(2)}`);
  }
}
