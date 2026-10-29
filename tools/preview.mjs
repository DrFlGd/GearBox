#!/usr/bin/env node
// Screenshot STL files with three.js in headless Chromium (Playwright).
//   node tools/preview.mjs out/G40.stl out/P1.stl --out out/previews
//   node tools/preview.mjs out/crank-printed.stl+out/crank-hardware.stl   (second file in steel grey)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

const argv = process.argv.slice(2);
const oi = argv.indexOf("--out");
const outDir = oi >= 0 ? argv[oi + 1] : "out/previews";
const files = argv.filter((a, i) => a !== "--out" && i !== oi + 1);
fs.mkdirSync(outDir, { recursive: true });
const threeDir = path.resolve("node_modules/three");
const three = fs.readFileSync(path.join(threeDir, "build/three.module.js"), "utf8");
const stlLoader = fs.readFileSync(path.join(threeDir, "examples/jsm/loaders/STLLoader.js"), "utf8").replace(/from 'three'/g, "from './three.js'");

const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4"><canvas id="c" width="900" height="700"></canvas>

<script type="module">
import * as THREE from './three.js';
import { STLLoader } from './stlloader.js';
window.renderStl = (list, angle) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f4f4);
  const bb = new THREE.Box3(); const meshes = [];
  list.forEach((b64, i) => {
    if (!b64) return;
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const geo = new STLLoader().parse(buf); geo.computeVertexNormals(); geo.computeBoundingBox();
    bb.union(geo.boundingBox);
    const mat = new THREE.MeshStandardMaterial(i === 0 ? { color: 0xd9452b, metalness: 0.05, roughness: 0.6 } : { color: 0x9aa3ad, metalness: 0.6, roughness: 0.35 });
    meshes.push(new THREE.Mesh(geo, mat));
  });
  const size = new THREE.Vector3(); bb.getSize(size); const center = new THREE.Vector3(); bb.getCenter(center);
  for (const m of meshes) { m.position.sub(center); scene.add(m); }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2));
  const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(1, -1.5, 2); scene.add(dl);
  const r = size.length() / 2;
  const cam = new THREE.PerspectiveCamera(35, 900 / 700, 0.1, 10000);
  const a = angle ?? 0.9; cam.position.set(Math.cos(a) * r * 2.6, Math.sin(a) * r * 2.6, r * 1.9); cam.up.set(0, 0, 1); cam.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true }); renderer.render(scene, cam);
  return [size.x, size.y, size.z];
};
window.ready = true;
</script></body></html>`;
const htmlPath = path.join(outDir, "_viewer.html");
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(outDir, "three.js"), three);
fs.writeFileSync(path.join(outDir, "stlloader.js"), stlLoader);
// ES modules do not load over file://, so serve the folder on a local port.
const mime = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const f = path.join(outDir, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": mime[path.extname(f)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on("pageerror", e => console.error("page error:", e.message));
await page.goto(`http://127.0.0.1:${port}/_viewer.html`);
await page.waitForFunction(() => window.ready);
for (const f of files) {
  const list = f.split("+").map(x => (fs.existsSync(x) && fs.statSync(x).size > 84 ? fs.readFileSync(x).toString("base64") : ""));
  const size = await page.evaluate(([b, a]) => window.renderStl(b, a), [list, 0.9]);
  const png = path.join(outDir, path.basename(f.split("+")[0], ".stl") + ".png");
  await page.screenshot({ path: png });
  console.log(`${png}  ${size.map(v => v.toFixed(1)).join(" x ")}`);
}
await browser.close();
server.close();
