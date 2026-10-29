#!/usr/bin/env node
// Render every part in catalog/parts.json and check its size and volume.
//   node tools/render-catalog.mjs [--out out] [--profile PETG] [--only G40,P1] [--format stl|3mf]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./render.mjs";
import { stlStats } from "./stl-stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const outDir = path.resolve(opt("--out", "out"));
const profile = opt("--profile", "PETG");
const only = opt("--only", "")?.split(",").filter(Boolean);
const format = opt("--format", "stl");

const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, "catalog", "parts.json"), "utf8"));
const parts = catalog.parts.filter(p => !only.length || only.includes(p.name));
let failed = 0;
const rows = [];
for (const p of parts) {
  const defines = [`profile="${profile}"`, ...Object.entries(p.params).map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)];
  const output = path.join(outDir, profile, `${p.name}.${format}`);
  const r = await render({ input: path.join(repoRoot, "scad", "gearbox.scad"), output, defines, quiet: true });
  let note = "";
  if (r.ok && format === "stl") {
    const s = stlStats(output);
    const tol = 0.6;
    const sizeOk = !p.expect?.size || p.expect.size.every((e, i) => Math.abs(s.size[i] - e) <= tol);
    const volOk = !p.expect?.volume || (s.volume / 1000 >= p.expect.volume[0] && s.volume / 1000 <= p.expect.volume[1]);
    note = `size ${s.size.map(x => x.toFixed(1)).join("x")} vol ${(s.volume / 1000).toFixed(1)}cm3 ${s.triangles}tris`;
    if (!sizeOk || !volOk) { r.ok = false; note += `  EXPECTED size ${p.expect.size?.join("x") ?? "-"} vol ${p.expect.volume?.join("..") ?? "-"}`; }
  }
  const warn = r.messages.filter(m => /WARNING|ERROR/.test(m));
  if (!r.ok) failed++;
  rows.push(`${r.ok ? "OK  " : "FAIL"} ${p.name.padEnd(10)} ${r.seconds.toFixed(1).padStart(5)}s  ${note}${warn.length ? "\n      " + warn.join("\n      ") : ""}`);
  console.log(rows.at(-1));
}
console.log(`\n${parts.length - failed}/${parts.length} parts rendered to ${outDir}/${profile}`);
process.exit(failed ? 1 : 0);
