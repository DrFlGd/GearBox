#!/usr/bin/env node
// Render every part in catalog/parts.json for one or both standards and check
// its size against the catalog.
//   node tools/render-catalog.mjs [--out out] [--size M2|M1.5|all] [--profile PETG] [--joint jaws|pins|bolts] [--only G40,K] [--format stl|obj] [--jobs N]
// Output goes to <out>/<size>/<profile>/<name>.<format> (<profile>-<joint> for
// the pins and bolts joints). Parts render in parallel on --jobs worker threads
// (default: one per core).
// --write-expect updates the catalog's expected sizes from this run (jaws only:
// the catalog's sizes are the default joint's; other joints skip the size check).
// A part with a `sizes` list is only rendered in those sizes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { stlStats } from "./stl-stats.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const outDir = path.resolve(opt("--out", "out"));
const profile = opt("--profile", "PETG");
const sizeOpt = opt("--size", "all");
const only = opt("--only", "")?.split(",").filter(Boolean);
const format = opt("--format", "stl");
const joint = opt("--joint", "jaws");
const writeExpect = argv.includes("--write-expect");
const jobs = Math.max(1, Number(opt("--jobs", os.availableParallelism?.() ?? os.cpus().length)));

const catalogPath = path.join(repoRoot, "catalog", "parts.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const sizes = sizeOpt === "all" ? Object.keys(catalog.standards) : [sizeOpt];
const parts = catalog.parts.filter(p => !only.length || only.includes(p.name));
const queue = [];
for (const size of sizes) {
  for (const p of parts) {
    if (p.sizes && !p.sizes.includes(size)) continue;   // a part not made in this size
    const defines = [`size="${size}"`, `profile="${profile}"`, `joint="${joint}"`, ...Object.entries(p.params).map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)];
    queue.push({ id: queue.length, size, p, input: path.join(repoRoot, "scad", "gearbox.scad"), output: path.join(outDir, size, joint === "jaws" ? profile : `${profile}-${joint}`, `${p.name}.${format}`), defines });
  }
}

let failed = 0;
function report(job, r) {
  const { size, p, output } = job;
  let note = "";
  if (r.ok && format === "stl") {
    const s = stlStats(output);
    const size3 = s.size.map(x => Number(x.toFixed(2)));
    const expect = joint === "jaws" ? p.expect?.[size] : undefined;
    if (writeExpect && joint === "jaws") { p.expect = p.expect ?? {}; p.expect[size] = size3; }
    const sizeOk = !expect || expect.every((e, i) => Math.abs(size3[i] - e) <= 0.6);
    note = `size ${size3.map(x => x.toFixed(1)).join("x")} vol ${(s.volume / 1000).toFixed(1)}cm3 ${s.triangles}tris`;
    if (!sizeOk) { r.ok = false; note += `  EXPECTED ${expect.join("x")}`; }
  }
  const warn = r.messages.filter(m => /WARNING|ERROR/.test(m));
  if (!r.ok) failed++;
  console.log(`${r.ok ? "OK  " : "FAIL"} ${size.padEnd(4)} ${p.name.padEnd(8)} ${r.seconds.toFixed(1).padStart(5)}s  ${note}${warn.length ? "\n      " + warn.join("\n      ") : ""}`);
}

// Each worker takes the next part as soon as it finishes one.
const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, () => new Promise((resolve, reject) => {
  const w = new Worker(new URL("./render-worker.mjs", import.meta.url));
  const give = () => {
    if (next >= queue.length) { w.terminate().then(resolve); return; }
    const { id, input, output, defines } = queue[next++];
    w.postMessage({ id, input, output, defines });
  };
  w.on("message", r => { report(queue[r.id], r); give(); });
  w.on("error", reject);
  give();
})));
const total = queue.length;
if (writeExpect) fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2).replace(/\[\n\s+([\d.]+),\n\s+([\d.]+),\n\s+([\d.]+)\n\s+\]/g, "[$1, $2, $3]") + "\n");
console.log(`\n${total - failed}/${total} parts rendered to ${outDir} in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${Math.min(jobs, total)} threads`);
process.exit(failed ? 1 : 0);
