import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RenderClient } from "./engine/client";
import type { RenderResult } from "./engine/protocol";
import {
  PART_KINDS, PROFILES, SIZES, catalog, catalogPart, partInSize, defines, meshesWith, parseTolerances, partKind, validate,
  type Overrides, type Params, type ParamValue, type Profile, type Size,
} from "./parts";
import { parseBinaryStl, meshTo3mf } from "./export/threemf";
import { meshToObj } from "./export/obj";
import { download } from "./download";
import { buildPrintPlate, plateTo3mf, plateToStl, type PrintPlate } from "./plate";
import Viewer from "./components/Viewer";
import ParamForm from "./components/ParamForm";
import ProfilePanel from "./components/ProfilePanel";
import LogPanel from "./components/LogPanel";
import KitPanel from "./components/KitPanel";
import LayoutMode from "./layout/LayoutMode";

const REPO = "https://github.com/DrFlGd/GearBox";
const LS_KEY = "gearbox.settings";

type Selection = { kindId: string; params: Params };
type Settings = { size: Size; profile: Profile; overrides: Overrides; auto: boolean };
type RenderState = { status: "idle" | "rendering" | "done" | "error"; name: string; stl: Uint8Array | null; hw?: Uint8Array | null; seconds: number; messages: string[]; log: string[] };

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    const hs = h.get("size");
    return { size: SIZES.includes(hs as Size) ? (hs as Size) : SIZES.includes(s.size) ? s.size : "M2", profile: PROFILES.includes(s.profile) ? s.profile : "PETG", overrides: s.overrides ?? {}, auto: s.auto ?? true };
  } catch { return { size: "M2", profile: "PETG", overrides: {}, auto: true }; }
}

/** Selection from the URL hash (#part=gear&teeth=40), so a part can be linked. */
function selectionFromHash(): Selection | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const kind = partKind(h.get("part") ?? "");
  if (!kind) return null;
  const params: Params = { ...kind.defaults };
  for (const p of kind.params) {
    const v = h.get(p.key);
    if (v === null) continue;
    params[p.key] = p.type === "number" || typeof kind.defaults[p.key] === "number" ? Number(v) : v;
  }
  return { kindId: kind.id, params };
}

const DEFAULT_SELECTION: Selection = { kindId: "gear", params: { ...PART_KINDS[0].defaults } };

export default function App() {
  const client = useRef<RenderClient | null>(null);
  if (!client.current) client.current = new RenderClient();
  const [engine, setEngine] = useState<"loading" | "ready" | "failed">("loading");
  const [engineError, setEngineError] = useState("");
  const [sel, setSel] = useState<Selection>(() => selectionFromHash() ?? DEFAULT_SELECTION);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [render, setRender] = useState<RenderState>({ status: "idle", name: "", stl: null, seconds: 0, messages: [], log: [] });
  const [kitBusy, setKitBusy] = useState(false);
  const [plateProgress, setPlateProgress] = useState<string | null>(null);
  const plateCache = useRef<{ key: string; plate: PrintPlate } | null>(null);
  const [mode, setMode] = useState<"parts" | "layout">(() => (new URLSearchParams(location.hash.replace(/^#/, "")).get("mode") === "layout" ? "layout" : "parts"));
  const liveLog = useRef<string[]>([]);
  const [, bump] = useState(0);
  const tolRows = useMemo(() => parseTolerances(), []);

  const kind = partKind(sel.kindId) ?? PART_KINDS[0];
  const matchingPreset = catalog.parts.find(p => p.params.part === kind.id && Object.entries(sel.params).every(([k, v]) => (p.params[k] ?? kind.defaults[k]) === v));
  const name = matchingPreset?.name ?? kind.name(sel.params);
  const problem = validate(kind.id, sel.params, settings.size);
  const defs = useMemo(() => defines(kind.id, sel.params, settings.size, settings.profile, settings.overrides), [kind.id, sel.params, settings.size, settings.profile, settings.overrides]);
  const std = catalog.standards[settings.size];
  const defsKey = defs.join("\n");

  useEffect(() => {
    const c = client.current!;
    c.ready.then(() => setEngine("ready"));
    c.onFatal = text => { setEngine("failed"); setEngineError(text); };
  }, []);

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(settings)); }, [settings]);

  useEffect(() => {
    if (mode !== "parts") return;
    const h = new URLSearchParams();
    h.set("size", settings.size);
    h.set("part", kind.id);
    for (const [k, v] of Object.entries(sel.params)) if (v !== kind.defaults[k]) h.set(k, String(v));
    history.replaceState(null, "", "#" + h.toString());
  }, [sel, kind, settings.size, mode]);

  const doRender = useCallback(async () => {
    const c = client.current!;
    if (c.busy) c.cancel();
    liveLog.current = [];
    setRender(r => ({ ...r, status: "rendering", name, log: [] }));
    const onLine = (line: string) => { liveLog.current.push(line); if (liveLog.current.length % 20 === 0) bump(n => n + 1); };
    // an assembly renders twice: the printed parts, then the hardware for the steel-grey mesh
    const asm = kind.id === "assembly";
    const result: RenderResult = await c.render(asm ? [...defs, `layer="printed"`] : defs, "stl", onLine);
    if (result.messages[0] === "Cancelled") return;
    let hw: Uint8Array | null = null, seconds = result.seconds;
    if (asm && result.ok) {
      const h = await c.render([...defs, `layer="hardware"`], "stl", onLine);
      if (h.messages[0] === "Cancelled") return;
      if (h.ok) hw = h.bytes; seconds += h.seconds;
    }
    setRender({ status: result.ok ? "done" : "error", name, stl: result.ok ? result.bytes : null, hw, seconds, messages: result.messages, log: result.log });
  }, [defs, name, kind.id]);

  // Auto-render: the first time the engine is ready, and after each change (debounced).
  const lastRendered = useRef("");
  useEffect(() => {
    if (engine !== "ready" || kitBusy || problem || mode !== "parts") return;
    if (!settings.auto && lastRendered.current !== "") return;
    if (lastRendered.current === defsKey) return;
    const t = setTimeout(() => { lastRendered.current = defsKey; void doRender(); }, lastRendered.current ? 500 : 0);
    return () => clearTimeout(t);
  }, [engine, defsKey, settings.auto, kitBusy, problem, doRender, mode]);

  const mesh = useMemo(() => (render.stl ? parseBinaryStl(render.stl) : null), [render.stl]);
  const size = mesh ? mesh.bbox.max.map((m, i) => m - mesh.bbox.min[i]) : null;
  const fileBase = `${render.name}-${settings.size}-${settings.profile}`;

  const setParam = (key: string, value: ParamValue) => setSel(s => ({ ...s, params: { ...s.params, [key]: value } }));
  const pickKind = (id: string) => { const k = partKind(id)!; setSel({ kindId: id, params: { ...k.defaults } }); };
  const pickPreset = (presetName: string) => {
    const p = catalogPart(presetName);
    if (!p) return;
    const { part, ...params } = p.params;
    const k = partKind(String(part));
    if (!k) return;
    setSel({ kindId: k.id, params: { ...k.defaults, ...params } });
  };
  const groups = [...new Set(PART_KINDS.map(k => k.group))];
  const busy = render.status === "rendering";
  const teeth = Number(sel.params.teeth);

  return (
    <div className="app">
      <header className="top">
        <h1><span className="logo" aria-hidden>⚙</span> GearBox</h1>
        <div className="segmented modes" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "parts"} className={mode === "parts" ? "on" : ""} onClick={() => setMode("parts")}>Parts</button>
          <button type="button" role="tab" aria-selected={mode === "layout"} className={mode === "layout" ? "on" : ""} onClick={() => setMode("layout")}>Layout</button>
        </div>
        <div className="segmented sizes" role="radiogroup" aria-label="Size" title={std.title}>
          {SIZES.map(sz => (
            <button key={sz} type="button" role="radio" aria-checked={settings.size === sz} className={settings.size === sz ? "on" : ""} disabled={kitBusy}
              onClick={() => setSettings(s => ({ ...s, size: sz }))}>{sz} <span className="muted">{catalog.standards[sz].bolt} · {catalog.standards[sz].bearing.split(" ")[0]}</span></button>
          ))}
        </div>
        <nav>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${REPO}/releases/latest`} target="_blank" rel="noreferrer">Download all parts</a>
          <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">Print guide</a>
        </nav>
      </header>

      {mode === "layout" ? (
        <LayoutMode size={settings.size} profile={settings.profile} overrides={settings.overrides} engineReady={engine === "ready"}
          render={defs => client.current!.render(defs)} />
      ) : (
      <div className="layout">
        <aside className="sidebar">
          <h2>Parts</h2>
          {groups.map(g => (
            <div key={g} className="group">
              <h3>{g}</h3>
              {PART_KINDS.filter(k => k.group === g).map(k => (
                <button key={k.id} type="button" className={"item" + (k.id === kind.id ? " on" : "")} onClick={() => pickKind(k.id)} disabled={kitBusy || (!!k.sizes && !k.sizes.includes(settings.size))} title={k.sizes && !k.sizes.includes(settings.size) ? `not made in ${settings.size}` : undefined}>{k.title}</button>
              ))}
            </div>
          ))}
          <h2>Catalog presets</h2>
          <select className="preset" value={matchingPreset?.name ?? ""} onChange={e => pickPreset(e.target.value)} disabled={kitBusy}>
            <option value="">Custom…</option>
            {catalog.parts.filter(p => partInSize(p, settings.size)).map(p => <option key={p.name} value={p.name}>{p.name} · {p.title}</option>)}
          </select>
          <h2>Kits</h2>
          <KitPanel size={settings.size} profile={settings.profile} overrides={settings.overrides} disabled={kitBusy || engine !== "ready"} onBusy={b => { setKitBusy(b); if (b && client.current!.busy) client.current!.cancel(); }}
            render={defs => client.current!.render(defs)} />
        </aside>

        <main className="stage">
          <div className="toolbar">
            <button type="button" className="primary" onClick={doRender} disabled={engine !== "ready" || kitBusy || !!problem}>
              {busy ? "Re-render" : "Render"}
            </button>
            {busy && <button type="button" onClick={() => { client.current!.cancel(); setRender(r => ({ ...r, status: r.stl ? "done" : "idle" })); }}>Cancel</button>}
            <label className="check"><input type="checkbox" checked={settings.auto} onChange={e => setSettings(s => ({ ...s, auto: e.target.checked }))} /> Auto</label>
            <span className="status">
              {engine === "loading" && "Loading the OpenSCAD engine (11 MB, once)…"}
              {engine === "failed" && <span className="err">Engine failed to load. {engineError}</span>}
              {engine === "ready" && render.status === "rendering" && `Rendering ${render.name}… ${liveLog.current.length ? `(${liveLog.current.length} lines)` : ""}`}
              {engine === "ready" && render.status === "done" && size && (
                <>
                  <b>{render.name}</b> · {size.map(v => v.toFixed(1)).join(" × ")} mm · {(mesh!.triangles.length / 3).toLocaleString()} triangles · {render.seconds.toFixed(1)} s
                  {render.messages.some(m => /WARNING/.test(m)) && <span className="badge warn" title={render.messages.join("\n")}>warnings</span>}
                </>
              )}
              {engine === "ready" && render.status === "error" && <span className="err">Render failed. See the console below.</span>}
              {engine === "ready" && render.status === "idle" && "Pick a part and press Render."}
            </span>
            <span className="downloads">
              <button type="button" disabled={!render.stl || busy} onClick={() => download(render.stl!, `${fileBase}.stl`, "model/stl")}>STL</button>
              <button type="button" disabled={!mesh || busy} onClick={() => download(meshTo3mf(mesh!, render.name), `${fileBase}.3mf`, "model/3mf")}>3MF</button>
              <button type="button" disabled={!mesh || busy} onClick={() => download(meshToObj(mesh!, render.name), `${fileBase}.obj`, "model/obj")}>OBJ</button>
            </span>
          </div>
          <Viewer stl={render.stl} hardware={kind.id === "assembly" ? render.hw : null} busy={busy} grid={std.grid} />
          <LogPanel lines={render.status === "rendering" ? liveLog.current : render.log} messages={render.messages} />
        </main>

        <aside className="panel">
          <h2>{kind.title} <code>{name}</code> <span className="muted">{settings.size}</span></h2>
          <p className="blurb">{kind.blurb}</p>
          <ParamForm params={kind.params} values={sel.params} onChange={setParam} />
          {problem && <p className="err">{problem}</p>}
          {kind.id === "assembly" && (() => {
            const kitId = String(sel.params.kit), kit = catalog.kits[kitId];
            if (!kit) return null;
            const key = [kitId, settings.size, settings.profile, JSON.stringify(settings.overrides)].join("|");
            const base = `gearbox-${kitId}-print-${settings.size}-${settings.profile}`;
            const getPlate = async () => {
              if (plateCache.current?.key === key) return plateCache.current.plate;
              const counts = kit.parts.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});
              const items = Object.entries(counts).flatMap(([n, qty]) => { const cp = catalogPart(n); return cp ? [{ name: n, title: cp.title, qty, params: cp.params }] : []; });
              setKitBusy(true);
              try {
                const plate = await buildPrintPlate({ items, size: settings.size, profile: settings.profile, overrides: settings.overrides, render: d => client.current!.render(d), onProgress: t => setPlateProgress(`Rendering ${t}`) });
                plateCache.current = { key, plate };
                setPlateProgress(plate.failed.length ? `Failed to render: ${plate.failed.join(", ")}` : `${plate.placed.length} parts on ${plate.plates} plate${plate.plates > 1 ? "s" : ""} (220 mm bed)`);
                return plate;
              } finally { setKitBusy(false); }
            };
            return (
              <div className="download-box">
                <button type="button" className="primary" disabled={kitBusy || engine !== "ready"} onClick={async () => { const p = await getPlate(); download(plateTo3mf(p, kit.title), `${base}.3mf`, "model/3mf"); }}>
                  {kitBusy && plateProgress ? plateProgress : "Download parts laid out for printing (3MF)"}
                </button>
                <span className="row">
                  <button type="button" disabled={kitBusy || engine !== "ready"} onClick={async () => { const p = await getPlate(); download(plateToStl(p), `${base}.stl`, "model/stl"); }}>Print layout STL</button>
                  <span className="muted small">{!kitBusy && plateProgress ? plateProgress + ". " : ""}Every printed part of the kit, flat in its print orientation and spaced apart: one object per part in the 3MF; in the STL use your slicer's split to objects. Board tiles are left out; print them from the Board group.</span>
                </span>
                <span className="row">
                  <button type="button" disabled={!render.stl || busy} onClick={() => download(render.stl!, `${fileBase}.stl`, "model/stl")}>Assembled view STL</button>
                  <span className="muted small">the assembly as shown, for looking at, not for printing</span>
                </span>
              </div>
            );
          })()}
          {kind.id !== "assembly" && <div className="download-box">
            <button type="button" className="primary" disabled={!render.stl || busy} onClick={() => download(render.stl!, `${fileBase}.stl`, "model/stl")}>
              {render.stl && !busy ? `Download ${fileBase}.stl` : busy ? "Rendering…" : "Render first, then download"}
            </button>
            <span className="row">
              <button type="button" disabled={!mesh || busy} onClick={() => download(meshTo3mf(mesh!, render.name), `${fileBase}.3mf`, "model/3mf")}>3MF</button>
              <button type="button" disabled={!mesh || busy} onClick={() => download(meshToObj(mesh!, render.name), `${fileBase}.obj`, "model/obj")}>OBJ</button>
              <span className="muted small">this one part, as rendered above; kits and the whole catalog are in the left column</span>
            </span>
          </div>}
          {kind.id === "assembly" && catalog.kits[String(sel.params.kit)] && (() => {
            const kit = catalog.kits[String(sel.params.kit)];
            const counts = kit.parts.reduce<Record<string, number>>((m, n) => ({ ...m, [n]: (m[n] ?? 0) + 1 }), {});
            return (
              <div className="kit-contents">
                <h3>In this kit</h3>
                <ul>
                  {Object.entries(counts).map(([n, c]) => <li key={n}>{c > 1 ? `${c} × ` : ""}<code>{n}</code> {catalogPart(n)?.title ?? ""}</li>)}
                </ul>
                <h3>Hardware <span className="muted small">(steel grey in the view)</span></h3>
                <ul>{kit.hardware.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            );
          })()}
          {(kind.id === "gear" || kind.id === "compound") && Number.isFinite(teeth) && (
            <p className="hint">Meshes with: {meshesWith(teeth).map(t => `${t}T`).join(", ")}. Pitch diameter {std.module * teeth} mm, {std.grid} mm grid.</p>
          )}
          {matchingPreset?.expect?.[settings.size] && <p className="hint">Catalog size: {matchingPreset.expect[settings.size]!.map(v => v.toFixed(1)).join(" × ")} mm</p>}
          <p className="hint">{std.title}. Bolt lengths: {Object.entries(std.bolt_lengths).map(([l, mm]) => `${l} level${l === "1" ? "" : "s"} ${mm} mm`).join(", ")}.</p>
          <h2>Print profile</h2>
          <ProfilePanel profile={settings.profile} overrides={settings.overrides} rows={tolRows}
            onProfile={p => setSettings(s => ({ ...s, profile: p }))} onOverrides={o => setSettings(s => ({ ...s, overrides: o }))} />
          <p className="hint">Renders run in your browser with OpenSCAD compiled to WebAssembly. Nothing is uploaded.</p>
        </aside>
      </div>
      )}
    </div>
  );
}
