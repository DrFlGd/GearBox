#!/usr/bin/env node
// Render one .scad file with the OpenSCAD WASM build (Manifold backend).
// The same engine the web app uses, so what renders here renders there.
//
//   node tools/render.mjs scad/gearbox.scad -o out/G40.stl -D 'part="gear"' -D teeth=40
//
// Options: -o <file.stl|file.3mf|file.off>   -D var=value (repeatable)
//          --lib <dir> (repeatable, default lib/*)   --quiet
import { createOpenSCAD } from "openscad-wasm-prebuilt";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

export async function render({ input, output, defines = [], libs, quiet = false }) {
  const log = [];
  const o = await createOpenSCAD({ noInitialRun: true, print: s => log.push(s), printErr: s => log.push(s) });
  const inst = o.getInstance();
  const FS = inst.FS;
  const mkdirp = p => { const parts = p.split("/").filter(Boolean); let cur = ""; for (const s of parts) { cur += "/" + s; try { FS.mkdir(cur); } catch {} } };
  const copyDir = (src, dst) => {
    mkdirp(dst);
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const s = path.join(src, e.name), d = dst + "/" + e.name;
      if (e.isDirectory()) copyDir(s, d);
      else if (/\.(scad|json|ttf|otf|txt)$/i.test(e.name)) FS.writeFile(d, fs.readFileSync(s));
    }
  };
  // The input's parent directory tree goes to /work so relative includes resolve.
  const inAbs = path.resolve(input);
  const projectDir = path.dirname(inAbs);
  copyDir(projectDir, "/work");
  // Libraries go where this build looks for user libraries.
  const libDir = "/home/web_user/.local/share/OpenSCAD/libraries";
  const libDirs = libs ?? (fs.existsSync(path.join(repoRoot, "lib"))
    ? fs.readdirSync(path.join(repoRoot, "lib"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(repoRoot, "lib", e.name))
    : []);
  for (const l of libDirs) copyDir(path.resolve(l), libDir + "/" + path.basename(l));

  const vin = "/work/" + path.basename(inAbs);
  const ext = path.extname(output).slice(1) || "stl";
  const vout = "/out." + ext;
  const args = [vin, "--backend=manifold", "-o", vout];
  if (ext === "stl") args.push("--export-format=binstl");
  for (const d of defines) args.push("-D", d);
  const t0 = Date.now();
  try { inst.callMain(args); } catch (e) { log.push(String(e)); }
  const seconds = (Date.now() - t0) / 1000;
  let bytes = null;
  try { bytes = FS.readFile(vout, { encoding: "binary" }); } catch {}
  const messages = log.filter(l => /WARNING|ERROR|ECHO|DEPRECATED/.test(l));
  const ok = !!bytes && !messages.some(l => /ERROR/.test(l));
  if (bytes) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, bytes);
  }
  if (!quiet) {
    for (const m of messages) console.log("  " + m);
    console.log(`${ok ? "OK " : "FAIL"} ${output} ${bytes ? bytes.length + " bytes" : "no output"} in ${seconds.toFixed(1)}s`);
  }
  return { ok, seconds, bytes: bytes?.length ?? 0, messages };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const input = argv[0];
  let output = "out.stl"; const defines = []; const libs = []; let quiet = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "-o") output = argv[++i];
    else if (argv[i] === "-D") defines.push(argv[++i]);
    else if (argv[i] === "--lib") libs.push(argv[++i]);
    else if (argv[i] === "--quiet") quiet = true;
  }
  if (!input) { console.error("usage: render.mjs <file.scad> -o <out.stl> [-D var=value ...]"); process.exit(2); }
  const r = await render({ input, output, defines, libs: libs.length ? libs : undefined, quiet });
  process.exit(r.ok ? 0 : 1);
}
