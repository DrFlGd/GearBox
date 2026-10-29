// Render every distinct part of a kit once and zip the STLs with a README.
import { zipSync } from "fflate";
import { catalog, defines, type Overrides, type Params, type Profile, type Size } from "./parts";
import type { RenderResult } from "./engine/protocol";

export type KitItem = { name: string; title: string; qty: number; params: Params };

export async function buildKitZip(opts: {
  title: string; items: KitItem[]; hardware: string[]; size: Size; profile: Profile; overrides: Overrides;
  render: (defs: string[]) => Promise<RenderResult>; onProgress?: (text: string) => void;
}): Promise<{ zip: Uint8Array; failed: string[] }> {
  const { items, size, profile } = opts;
  const zip: Record<string, Uint8Array> = {};
  const failed: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    opts.onProgress?.(`${i + 1}/${items.length} ${it.name}`);
    const { part, ...params } = it.params;
    const r = await opts.render(defines(String(part), params, size, profile, opts.overrides));
    if (r.ok && r.bytes) zip[`${it.name}.stl`] = r.bytes; else failed.push(it.name);
  }
  const std = catalog.standards[size];
  zip["README.txt"] = new TextEncoder().encode(
    `GearBox ${opts.title}, size ${size} (${std.title}), ${profile} profile\n\nPrint:\n` +
    items.map(it => `  ${it.qty} x ${it.name} (${it.title})`).join("\n") +
    `\n\nHardware (${std.bolt} bolts, ${std.nut} nuts, ${std.bearing} bearings):\n` +
    opts.hardware.map(h => "  " + h).join("\n") +
    (failed.length ? `\n\nFailed to render: ${failed.join(", ")}` : "") + "\n",
  );
  return { zip: zipSync(zip, { level: 6 }), failed };
}
