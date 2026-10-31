// Web Worker that runs OpenSCAD (WASM, Manifold backend) on the embedded kit.
// One fresh engine instance per render: the emscripten main() cannot be called
// twice on the same instance. A request rendered before comes from the browser
// cache (cache.ts) without starting the engine.
import { files, WORK_DIR } from "./files";
import { getCached, putCached, renderKey } from "./cache";
import type { RenderRequest, WorkerMessage } from "./protocol";

type Engine = {
  createOpenSCAD(opts: Record<string, unknown>): Promise<{
    getInstance(): { FS: FileSystem; callMain(args: string[]): number };
  }>;
};
type FileSystem = {
  mkdir(p: string): void;
  writeFile(p: string, d: string | Uint8Array): void;
  readFile(p: string, o: { encoding: "binary" }): Uint8Array;
  unlink(p: string): void;
};

const ctx = self as unknown as { postMessage(m: WorkerMessage, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<RenderRequest>) => void) | null };
const send = (m: WorkerMessage, transfer?: Transferable[]) => ctx.postMessage(m, transfer);

let enginePromise: Promise<Engine> | null = null;
function loadEngine(): Promise<Engine> {
  if (!enginePromise) {
    const url = new URL(import.meta.env.BASE_URL + "engine/openscad.js", self.location.origin).href;
    enginePromise = import(/* @vite-ignore */ url) as Promise<Engine>;
    enginePromise.then(() => send({ type: "ready" }), e => send({ type: "fatal", text: "Could not load the OpenSCAD engine: " + String(e) }));
  }
  return enginePromise;
}

function mount(FS: FileSystem) {
  const made = new Set<string>();
  const mkdirp = (dir: string) => {
    let cur = "";
    for (const s of dir.split("/").filter(Boolean)) {
      cur += "/" + s;
      if (made.has(cur)) continue;
      made.add(cur);
      try { FS.mkdir(cur); } catch { /* exists */ }
    }
  };
  for (const [p, content] of Object.entries(files)) {
    mkdirp(p.slice(0, p.lastIndexOf("/")));
    FS.writeFile(p, content);
  }
}

async function render(req: Extract<RenderRequest, { kind: "render" }>) {
  const key = await renderKey(req.defines, req.format).catch(() => null);
  const hit = key ? await getCached(key) : null;
  if (hit) {
    send({ type: "log", id: req.id, text: `Loaded from the browser cache (first rendered in ${hit.seconds.toFixed(1)} s).` });
    send({ type: "done", id: req.id, ok: true, bytes: hit.bytes, seconds: hit.seconds, messages: hit.messages, exitCode: 0, cached: true }, [hit.bytes.buffer as ArrayBuffer]);
    return;
  }
  const engine = await loadEngine();
  const log: string[] = [];
  const onLine = (text: string) => {
    log.push(text);
    send({ type: "log", id: req.id, text });
  };
  const t0 = performance.now();
  const api = await engine.createOpenSCAD({ noInitialRun: true, print: onLine, printErr: onLine });
  const inst = api.getInstance();
  mount(inst.FS);
  const out = "/out." + req.format;
  const args = [WORK_DIR + "/gearbox.scad", "--backend=manifold", "-o", out];
  if (req.format === "stl") args.push("--export-format=binstl");
  for (const d of req.defines) args.push("-D", d);
  let exitCode: number | null = null;
  try {
    exitCode = inst.callMain(args);
  } catch (e) {
    // emscripten throws its exit status when main() returns non-zero
    exitCode = typeof e === "number" ? e : -1;
    if (typeof e !== "number") log.push(String(e));
  }
  let bytes: Uint8Array | null = null;
  try { bytes = inst.FS.readFile(out, { encoding: "binary" }); } catch { /* no output */ }
  const seconds = (performance.now() - t0) / 1000;
  const messages = log.filter(l => /WARNING|ERROR|ECHO|DEPRECATED|TRACE/.test(l));
  const ok = !!bytes && bytes.length > 0 && !messages.some(l => /ERROR/.test(l));
  if (ok && bytes) {
    const copy = new Uint8Array(bytes); // detach from the wasm heap before transferring
    if (key) await putCached(key, { bytes: copy, seconds, messages });
    send({ type: "done", id: req.id, ok: true, bytes: copy, seconds, messages, exitCode }, [copy.buffer]);
  } else {
    send({ type: "done", id: req.id, ok: false, bytes: null, seconds, messages, exitCode });
  }
}

ctx.onmessage = (e: MessageEvent<RenderRequest>) => {
  const req = e.data;
  if (req.kind === "warmup") { void loadEngine(); return; }
  render(req).catch(err => send({ type: "done", id: req.id, ok: false, bytes: null, seconds: 0, messages: [String(err)], exitCode: -1 }));
};

void loadEngine();
