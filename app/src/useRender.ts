// One render at a time for a view: a part, a kit assembly (printed parts plus the
// steel-grey hardware), or anything else that ends in an STL. A newer job cancels the
// one in flight, and a stale result never overwrites a newer one.
import { useCallback, useRef, useState } from "react";
import type { RenderClient } from "./engine/client";
import type { RenderResult } from "./engine/protocol";

export type RenderState = {
  status: "idle" | "rendering" | "done" | "error";
  name: string; stl: Uint8Array | null; hw?: Uint8Array | null;
  seconds: number; messages: string[]; log: string[]; cached?: boolean;
  /** Progress or summary text for jobs made of several renders (a print layout). */
  note?: string;
};

export type Job = { name: string; defs: string[]; assembly?: boolean };

const IDLE: RenderState = { status: "idle", name: "", stl: null, seconds: 0, messages: [], log: [] };

export function useRender(client: RenderClient) {
  const [state, setState] = useState<RenderState>(IDLE);
  const live = useRef<string[]>([]);
  const [, bump] = useState(0);
  const token = useRef(0);

  /** Start a new job; returns a check that is false once a newer job has started. */
  const begin = useCallback((name: string, note?: string) => {
    if (client.busy) client.cancel();
    const t = ++token.current;
    live.current = [];
    setState(r => ({ ...r, status: "rendering", name, log: [], note }));
    return () => token.current === t;
  }, [client]);

  const onLine = useCallback((line: string) => { live.current.push(line); if (live.current.length % 20 === 0) bump(n => n + 1); }, []);

  const run = useCallback(async (job: Job) => {
    const current = begin(job.name);
    // an assembly renders twice: the printed parts, then the hardware for the steel-grey mesh
    const result: RenderResult = await client.render(job.assembly ? [...job.defs, `layer="printed"`] : job.defs, "stl", onLine);
    if (!current() || result.messages[0] === "Cancelled") return;
    let hw: Uint8Array | null = null, seconds = result.seconds, cached = result.cached;
    if (job.assembly && result.ok) {
      const h = await client.render([...job.defs, `layer="hardware"`], "stl", onLine);
      if (!current() || h.messages[0] === "Cancelled") return;
      if (h.ok) hw = h.bytes;
      seconds += h.seconds; cached = cached && h.cached;
    }
    setState({ status: result.ok ? "done" : "error", name: job.name, stl: result.ok ? result.bytes : null, hw, seconds, messages: result.messages, log: result.log, cached });
  }, [client, begin, onLine]);

  const cancel = useCallback(() => {
    token.current++;
    if (client.busy) client.cancel();
    setState(r => ({ ...r, status: r.stl ? "done" : "idle", note: undefined }));
  }, [client]);

  return { state, setState, run, begin, cancel, liveLines: live.current };
}
