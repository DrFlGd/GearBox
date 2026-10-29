import { useState } from "react";
import { zipSync } from "fflate";
import { catalog, catalogPart, defines, type Overrides, type Profile } from "../parts";
import type { RenderResult } from "../engine/protocol";
import { download } from "../download";

type Props = { profile: Profile; overrides: Overrides; render: (defs: string[]) => Promise<RenderResult>; disabled: boolean; onBusy: (b: boolean) => void };

const KIT_TITLES: Record<string, string> = {
  coupon: "Fit test kit",
  "starter-bayonet": "Starter kit, bayonet pins",
  "starter-m8": "Starter kit, M8 bolts",
};

/** Renders every distinct part of a kit in turn and downloads one zip of STLs. */
export default function KitPanel({ profile, overrides, render, disabled, onBusy }: Props) {
  const [progress, setProgress] = useState<string | null>(null);
  const [kit, setKit] = useState(Object.keys(catalog.kits)[0]);
  const names = catalog.kits[kit] ?? [];
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
        const r = await render(defines(String(kind), params, profile, overrides));
        if (r.ok && r.bytes) zip[`${name}.stl`] = r.bytes; else failed.push(name);
      }
      const list = names.map(n => `${counts.get(n)} x ${n} (${catalogPart(n)?.title ?? ""})`);
      const seen = new Set<string>();
      zip["README.txt"] = new TextEncoder().encode(
        `GearBox ${KIT_TITLES[kit] ?? kit}, ${profile} profile\n\nPrint:\n` + list.filter(l => !seen.has(l) && seen.add(l)).map(l => "  " + l).join("\n") +
        (failed.length ? `\n\nFailed to render: ${failed.join(", ")}` : "") + "\n",
      );
      download(zipSync(zip, { level: 6 }), `gearbox-${kit}-${profile}.zip`, "application/zip");
      setProgress(failed.length ? `Done, ${failed.length} failed: ${failed.join(", ")}` : null);
    } finally {
      onBusy(false);
      if (!failed.length) setProgress(null);
    }
  };

  return (
    <div className="panel-section">
      <select value={kit} onChange={e => setKit(e.target.value)} disabled={disabled}>
        {Object.keys(catalog.kits).map(k => <option key={k} value={k}>{KIT_TITLES[k] ?? k}</option>)}
      </select>
      <ul className="kit-list">
        {[...counts.entries()].map(([n, c]) => <li key={n}><b>{c}×</b> {n} <span className="muted">{catalogPart(n)?.title}</span></li>)}
      </ul>
      <button type="button" className="primary" onClick={run} disabled={disabled}>
        {progress && disabled ? `Rendering ${progress}` : `Download kit zip (${profile})`}
      </button>
      {progress && !disabled && <p className="muted">{progress}</p>}
    </div>
  );
}
