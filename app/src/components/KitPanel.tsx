import { useState } from "react";
import { zipSync } from "fflate";
import { catalog, catalogPart, defines, type Overrides, type Profile, type Size } from "../parts";
import type { RenderResult } from "../engine/protocol";
import { download } from "../download";

type Props = { size: Size; profile: Profile; overrides: Overrides; render: (defs: string[]) => Promise<RenderResult>; disabled: boolean; onBusy: (b: boolean) => void };

/** Renders every distinct part of a kit in turn and downloads one zip of STLs. */
export default function KitPanel({ size, profile, overrides, render, disabled, onBusy }: Props) {
  const [progress, setProgress] = useState<string | null>(null);
  const [kit, setKit] = useState(Object.keys(catalog.kits)[0]);
  const def = catalog.kits[kit];
  const names = def?.parts ?? [];
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);

  const run = async () => {
    onBusy(true);
    const zip: Record<string, Uint8Array> = {};
    const failed: string[] = [];
    const distinct = [...counts.keys()];
    try {
      for (let i = 0; i < distinct.length; i++) {
        const name = distinct[i];
        const part = catalogPart(name);
        if (!part) { failed.push(name); continue; }
        setProgress(`${i + 1}/${distinct.length} ${name}`);
        const { part: kind, ...params } = part.params;
        const r = await render(defines(String(kind), params, size, profile, overrides));
        if (r.ok && r.bytes) zip[`${name}.stl`] = r.bytes; else failed.push(name);
      }
      const list = names.map(n => `${counts.get(n)} x ${n} (${catalogPart(n)?.title ?? ""})`);
      const seen = new Set<string>();
      const std = catalog.standards[size];
      zip["README.txt"] = new TextEncoder().encode(
        `GearBox ${def?.title ?? kit}, size ${size} (${std.title}), ${profile} profile\n\nPrint:\n` + list.filter(l => !seen.has(l) && seen.add(l)).map(l => "  " + l).join("\n") +
        `\n\nHardware (${std.bolt} bolts, ${std.nut} nuts, ${std.bearing} bearings; bolt lengths ${Object.entries(std.bolt_lengths).map(([l, mm]) => `${l} level${l === "1" ? "" : "s"}: ${mm} mm`).join(", ")}):\n` +
        (def?.hardware ?? []).map(h => "  " + h).join("\n") +
        (failed.length ? `\n\nFailed to render: ${failed.join(", ")}` : "") + "\n",
      );
      download(zipSync(zip, { level: 6 }), `gearbox-${kit}-${size}-${profile}.zip`, "application/zip");
      setProgress(failed.length ? `Done, ${failed.length} failed: ${failed.join(", ")}` : null);
    } finally {
      onBusy(false);
      if (!failed.length) setProgress(null);
    }
  };

  return (
    <div className="panel-section">
      <select value={kit} onChange={e => setKit(e.target.value)} disabled={disabled}>
        {Object.entries(catalog.kits).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
      </select>
      <ul className="kit-list">
        {[...counts.entries()].map(([n, c]) => <li key={n}><b>{c}×</b> {n} <span className="muted">{catalogPart(n)?.title}</span></li>)}
      </ul>
      {def?.hardware && <p className="muted small">Plus {def.hardware.join(", ")}.</p>}
      <button type="button" className="primary" onClick={run} disabled={disabled}>
        {progress && disabled ? `Rendering ${progress}` : `Download kit zip (${size}, ${profile})`}
      </button>
      {progress && !disabled && <p className="muted">{progress}</p>}
    </div>
  );
}
