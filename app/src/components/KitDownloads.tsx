import { useState, type ReactNode } from "react";
import { JOINT_TITLES, type Joint, type Overrides, type Profile, type Size } from "../parts";
import type { RenderResult } from "../engine/protocol";
import { download } from "../download";
import { buildKitZip, type KitItem } from "../kitzip";
import { buildPrintPlate, plateKey, plateSummary, plateTo3mf, plateToStl, recallPlate, rememberPlate } from "../plate";

type Props = {
  /** Title in the 3MF and the zip's README; `id` names the files (gearbox-<id>-...). */
  title: string; id: string; items: KitItem[]; hardware: string[];
  size: Size; profile: Profile; overrides: Overrides; joint: Joint;
  render: (defs: string[]) => Promise<RenderResult>; disabled: boolean; onBusy?: (busy: boolean) => void; children?: ReactNode;
};

/** Every download of a whole kit (or a layout's parts) in one box: the print layout as 3MF or STL, or a zip of STLs. */
export default function KitDownloads({ title, id, items, hardware, size, profile, overrides, joint, render, disabled, onBusy, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const suffix = `${size}-${profile}${joint === "jaws" ? "" : `-${joint}`}`;
  const key = plateKey(items, size, profile, overrides, joint);

  const work = async (f: () => Promise<void>) => {
    setBusy(true); setNote(null); onBusy?.(true);
    try { await f(); } finally { setBusy(false); setProgress(null); onBusy?.(false); }
  };
  const plate = async () => {
    const hit = recallPlate(key);
    if (hit) return hit;
    const p = await buildPrintPlate({ items, size, profile, overrides, joint, render, onProgress: t => setProgress(`Rendering ${t}`) });
    if (p) rememberPlate(key, p);
    return p;
  };
  const off = disabled || busy || !items.length;

  return (
    <div className="download-box">
      <button type="button" className="primary" disabled={off} onClick={() => work(async () => {
        const p = await plate();
        if (!p) return;
        download(plateTo3mf(p, title), `gearbox-${id}-print-${suffix}.3mf`, "model/3mf");
        setNote(plateSummary(p));
      })}>{busy && progress ? progress : "Download print layout (3MF)"}</button>
      <span className="row">
        <button type="button" disabled={off} onClick={() => work(async () => {
          const r = await buildKitZip({ title, items, hardware, size, profile, overrides, joint, render, onProgress: t => setProgress(`Rendering ${t}`) });
          if (!r) return;
          download(r.zip, `gearbox-${id}-${suffix}.zip`, "application/zip");
          if (r.failed.length) setNote(`Failed to render: ${r.failed.join(", ")}`);
        })}>STL zip</button>
        <button type="button" disabled={off} onClick={() => work(async () => {
          const p = await plate();
          if (!p) return;
          download(plateToStl(p), `gearbox-${id}-print-${suffix}.stl`, "model/stl");
          setNote(plateSummary(p));
        })}>Print layout STL</button>
        {children}
      </span>
      <span className="muted small">
        {note ? `${note}. ` : ""}Every printed part flat in its print orientation, {profile}, {JOINT_TITLES[joint].toLowerCase()} joints: one object per part in the 3MF; in the STL use your slicer's split to objects. The zip has one STL per part and a README with the hardware.
      </span>
    </div>
  );
}
