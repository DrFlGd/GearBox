// Promise wrapper around the render worker. Renders run one at a time; a
// cancel terminates the worker and starts a fresh one.
import type { OutputFormat, RenderRequest, RenderResult, WorkerMessage } from "./protocol";

type Pending = { resolve: (r: RenderResult) => void; log: string[]; onLog?: (line: string) => void };

export class RenderClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readyResolve: (() => void) | null = null;
  ready: Promise<void>;
  onFatal: ((text: string) => void) | null = null;

  constructor() {
    this.ready = new Promise(r => (this.readyResolve = r));
    this.spawn();
  }

  private spawn() {
    this.worker = new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.type === "ready") { this.readyResolve?.(); return; }
      if (m.type === "fatal") { this.onFatal?.(m.text); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === "log") { p.log.push(m.text); p.onLog?.(m.text); return; }
      this.pending.delete(m.id);
      p.resolve({ ok: m.ok, bytes: m.bytes, seconds: m.seconds, messages: m.messages, log: p.log, cached: m.cached });
    };
    this.worker.onerror = e => this.onFatal?.(e.message || "Worker error");
  }

  render(defines: string[], format: OutputFormat = "stl", onLog?: (line: string) => void): Promise<RenderResult> {
    const id = this.nextId++;
    return new Promise(resolve => {
      this.pending.set(id, { resolve, log: [], onLog });
      const req: RenderRequest = { kind: "render", id, defines, format };
      this.worker!.postMessage(req);
    });
  }

  /** Abort every in-flight render and restart the engine. */
  cancel() {
    this.worker?.terminate();
    for (const p of this.pending.values()) p.resolve({ ok: false, bytes: null, seconds: 0, messages: ["Cancelled"], log: p.log });
    this.pending.clear();
    this.ready = new Promise(r => (this.readyResolve = r));
    this.spawn();
  }

  get busy() { return this.pending.size > 0; }
}
