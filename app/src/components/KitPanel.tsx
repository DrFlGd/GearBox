import { useState } from "react";
import { catalog, catalogPart, type Overrides, type Profile, type Size } from "../parts";
import type { RenderResult } from "../engine/protocol";
import { download } from "../download";
import { buildKitZip, type KitItem } from "../kitzip";

type Props = { size: Size; profile: Profile; overrides: Overrides; render: (defs: string[]) => Promise<RenderResult>; disabled: boolean; onBusy: (b: boolean) => void };

/** Renders every distinct part of a catalog kit in turn and downloads one zip of STLs. */
export default function KitPanel({ size, profile, overrides, render, disabled, onBusy }: Props) {
  const [progress, setProgress] = useState<string | null>(null);
  const [kit, setKit] = useState(Object.keys(catalog.kits)[0]);
  const def = catalog.kits[kit];
  const names = def?.parts ?? [];
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const items: KitItem[] = [...counts.entries()].flatMap(([name, qty]) => {
    const p = catalogPart(name);
    return p ? [{ name, title: p.title, qty, params: p.params }] : [];
  });
  const std = catalog.standards[size];
  const hardware = [...(def?.hardware ?? []), `bolt lengths: ${Object.entries(std.bolt_lengths).map(([l, mm]) => `${l} level${l === "1" ? "" : "s"} ${mm} mm`).join(", ")}`];

  const run = async () => {
    onBusy(true);
    try {
      const { zip, failed } = await buildKitZip({ title: def?.title ?? kit, items, hardware, size, profile, overrides, render, onProgress: setProgress });
      download(zip, `gearbox-${kit}-${size}-${profile}.zip`, "application/zip");
      setProgress(failed.length ? `Done, ${failed.length} failed: ${failed.join(", ")}` : null);
    } finally { onBusy(false); }
  };

  return (
    <div className="panel-section">
      <select value={kit} onChange={e => setKit(e.target.value)} disabled={disabled}>
        {Object.entries(catalog.kits).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
      </select>
      <ul className="kit-list">
        {items.map(it => <li key={it.name}><b>{it.qty}×</b> {it.name} <span className="muted">{it.title}</span></li>)}
      </ul>
      {def?.hardware && <p className="muted small">Plus {def.hardware.join(", ")}.</p>}
      <button type="button" className="primary" onClick={run} disabled={disabled}>
        {progress && disabled ? `Rendering ${progress}` : `Download kit zip (${size}, ${profile})`}
      </button>
      {progress && !disabled && <p className="muted">{progress}</p>}
    </div>
  );
}
