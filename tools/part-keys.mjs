#!/usr/bin/env node
// A key per catalog part that changes only when something the part is built
// from changes, so CI and releases re-render just those parts.
//
//   node tools/part-keys.mjs [--ref <git-ref>] [--profile PETG]   prints { "M2/G40": "<sha256>", ... }
//   node tools/part-keys.mjs --since <git-ref>                    prints each changed size/name
//
// The key hashes the part's -D defines plus the source of every module,
// function and top-level variable the part reaches from its line in
// gearbox.scad, followed transitively through the library (comments and
// whitespace ignored). Anything that can touch every part goes in whole: the
// BOSL2 commit, the engine version, the render tool and top-level special
// variables ($fn) or bare statements. It over-approximates (a parameter that
// shares a name with a library constant pulls that constant in), which only
// costs an extra render, never a stale part.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const git = (...args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });

/** The sources a part is made from, from the working tree or from a git ref. */
function sources(ref) {
  if (!ref) {
    const scad = {};
    const walk = dir => {
      for (const e of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
        const rel = dir + "/" + e.name;
        if (e.isDirectory()) walk(rel); else if (e.name.endsWith(".scad")) scad[rel] = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      }
    };
    walk("scad");
    // the checked-out submodule commit, else the one HEAD records (submodule not checked out)
    const bosl2 = fs.existsSync(path.join(repoRoot, "lib/BOSL2/.git")) ? git("-C", "lib/BOSL2", "rev-parse", "HEAD").trim() : git("rev-parse", "HEAD:lib/BOSL2").trim();
    return {
      scad, bosl2,
      lock: fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"),
      renderTool: fs.readFileSync(path.join(repoRoot, "tools/render.mjs"), "utf8"),
      catalog: JSON.parse(fs.readFileSync(path.join(repoRoot, "catalog/parts.json"), "utf8")),
    };
  }
  const show = p => { try { return git("show", `${ref}:${p}`); } catch { return ""; } };
  const scad = {};
  for (const p of git("ls-tree", "-r", "--name-only", ref, "--", "scad").split("\n").filter(p => p.endsWith(".scad"))) scad[p] = show(p);
  const bosl2 = git("ls-tree", ref, "lib/BOSL2").split(/\s+/)[2] ?? "";
  return { scad, bosl2, lock: show("package-lock.json"), renderTool: show("tools/render.mjs"), catalog: JSON.parse(show("catalog/parts.json") || '{"standards":{},"parts":[]}') };
}

/** Comments out, strings kept, whitespace collapsed. */
function clean(src) {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1); i = j;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2); if (i < 0) break; i++;
      out += " ";
    } else out += c;
  }
  return out;
}

/** Split a file into top-level statements: ends at `;` or at the `}` that closes a block, at depth 0. */
function statements(src) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "}") { depth--; if (depth === 0) { out.push(src.slice(start, i + 1)); start = i + 1; } }
    else if (c === ";" && depth === 0) { out.push(src.slice(start, i + 1)); start = i + 1; }
  }
  if (src.slice(start).trim()) out.push(src.slice(start));
  return out.map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const IDENT = /\$?[A-Za-z_][A-Za-z0-9_]*/g;

export function partKeys({ ref, profile = "PETG" } = {}) {
  const src = sources(ref);
  const defs = new Map();      // name -> [statement text]
  const always = [];           // statements every part depends on
  let dispatch = "";
  const add = (name, text) => { if (!defs.has(name)) defs.set(name, []); defs.get(name).push(text); };
  for (const [file, text] of Object.entries(src.scad).sort()) {
    // include/use lines end without a `;`: drop them before splitting
    for (const s of statements(clean(text).replace(/^\s*(include|use)\s*<[^>]*>/gm, ""))) {
      let m;
      if ((m = /^(module|function)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(s))) add(m[2], s);
      else if ((m = /^(\$?[A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(s))) { if (m[1].startsWith("$")) always.push(s); else add(m[1], s); }
      else if (file.endsWith("gearbox.scad") && /\bpart\s*==/.test(s)) dispatch += " " + s;   // the if/else chain, one statement per branch
      else always.push(s);
    }
  }
  // gearbox.scad's if/else chain: one branch per part
  const branches = new Map();
  for (const m of dispatch.matchAll(/part\s*==\s*"(\w+)"\s*\)\s*(.*?)(?=\s*else\b|$)/g)) branches.set(m[1], m[2]);
  const shared = sha([src.bosl2, /"node_modules\/openscad-wasm-prebuilt"[^}]*"version":\s*"([^"]+)"/.exec(src.lock)?.[1] ?? src.lock, clean(src.renderTool), ...always].join("\n"));

  const closure = root => {
    const seen = new Set(), todo = [...root.matchAll(IDENT)].map(m => m[0]);
    while (todo.length) {
      const id = todo.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const d of defs.get(id) ?? []) for (const m of d.matchAll(IDENT)) if (!seen.has(m[0])) todo.push(m[0]);
    }
    return [...seen].filter(id => defs.has(id)).sort().map(id => defs.get(id).join("\n")).join("\n");
  };

  const keys = {};
  for (const size of Object.keys(src.catalog.standards)) {
    for (const p of src.catalog.parts) {
      if (p.sizes && !p.sizes.includes(size)) continue;
      const defines = [`size="${size}"`, `profile="${profile}"`, ...Object.entries(p.params).map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : v}`)];
      const branch = branches.get(String(p.params.part)) ?? dispatch;   // unknown part: the whole chain
      keys[`${size}/${p.name}`] = sha([shared, ...defines, branch, closure(branch + " " + Object.keys(p.params).join(" ") + " size profile")].join("\n"));
    }
  }
  return keys;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const profile = opt("--profile", "PETG");
  const keys = partKeys({ ref: opt("--ref"), profile });
  if (argv.includes("--since")) {
    // one `size/name` per line for each part that changed since that ref
    const old = partKeys({ ref: opt("--since"), profile });
    for (const k of Object.keys(keys)) if (old[k] !== keys[k]) console.log(k);
  } else console.log(JSON.stringify(keys, null, 2));
}
