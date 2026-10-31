import { useEffect, useMemo, useState } from "react";
import type { RenderClient } from "../engine/client";
import { defaultView, type Engine, type KitSelection, type KitView, type Settings } from "../App";
import {
  ASSEMBLY_KITS, KIT_GROUPS, LEGACY_GROUP, LEGACY_KITS, catalog, catalogPart, defines, hasAssembly, kitGroup, kitHardware, kitInSize, kitParts,
  type Params,
} from "../parts";
import { parseBinaryStl } from "../export/threemf";
import { download } from "../download";
import type { KitItem } from "../kitzip";
import { BED, PLATE_GAP, buildPrintPlate, plateKey, plateSummary, plateToStl, recallPlate, rememberPlate } from "../plate";
import { useRender } from "../useRender";
import Viewer from "../components/Viewer";
import LogPanel from "../components/LogPanel";
import StatusLine from "../components/StatusLine";
import PartDownloads from "../components/PartDownloads";
import KitDownloads from "../components/KitDownloads";

type Props = {
  client: RenderClient; engine: Engine; settings: Settings; sel: KitSelection; setSel: (s: KitSelection) => void;
  openPart: (kindId: string, params: Params) => void;
};

const VIEWS: [KitView, string][] = [["assembled", "Assembled"], ["exploded", "Exploded"], ["print", "Print layout"]];
const kitLabel = (id: string) => ASSEMBLY_KITS.find(([k]) => k === id)?.[1] ?? catalog.kits[id]?.title ?? id;

/** Everything about one kit on one screen: the kit list, its views, its parts and hardware, its downloads. */
export default function KitsMode({ client, engine, settings, sel, setSel, openPart }: Props) {
  const { size, profile, overrides, joint } = settings;
  const { state: render, setState, run, begin, cancel, liveLines } = useRender(client);
  const kitId = catalog.kits[sel.kit] ? sel.kit : "starter";
  const kit = catalog.kits[kitId];
  const inSize = kitInSize(kitId, size);
  const asm = hasAssembly(kitId);
  const view: KitView = sel.view === "print" || asm ? sel.view : "print";
  const names = kitParts(kit, joint);
  const items: KitItem[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    return [...counts.entries()].flatMap(([name, qty]) => { const p = catalogPart(name); return p ? [{ name, title: p.title, qty, params: p.params }] : []; });
  }, [names]);
  const std = catalog.standards[size];
  const hardware = [...kitHardware(kit, joint), `bolt lengths: ${Object.entries(std.bolt_lengths).map(([l, mm]) => `${l} level${l === "1" ? "" : "s"} ${mm} mm`).join(", ")}`];
  const shown = sel.show && names.includes(sel.show) ? catalogPart(sel.show) ?? null : null;
  const jointSuffix = joint === "jaws" ? "" : `-${joint}`;

  useEffect(() => {
    const h = new URLSearchParams();
    h.set("mode", "kits"); h.set("size", size); h.set("kit", kitId);
    if (view !== defaultView(kitId)) h.set("view", view);
    if (shown) h.set("show", shown.name);
    history.replaceState(null, "", "#" + h.toString());
  }, [kitId, view, shown, size]);

  const [dlBusy, setDlBusy] = useState(false);
  const [plates, setPlates] = useState(1);
  const viewKey = JSON.stringify([kitId, view, shown?.name, size, profile, overrides, joint]);
  useEffect(() => {
    if (engine.status !== "ready" || dlBusy || !inSize) return;
    if (shown) {
      const { part, ...params } = shown.params;
      void run({ name: shown.name, defs: defines(String(part), params, size, profile, overrides, joint) });
    } else if (view === "print") {
      const key = plateKey(items, size, profile, overrides, joint);
      const hit = recallPlate(key);
      if (hit) {
        begin(kit.title);
        setPlates(hit.plates);
        setState({ status: "done", name: kit.title, stl: plateToStl(hit), hw: null, seconds: 0, messages: [], log: [], cached: true, note: plateSummary(hit) });
        return;
      }
      const current = begin(kit.title, "Rendering the parts…");
      setState(r => ({ ...r, stl: null, hw: null }));
      void buildPrintPlate({
        items, size, profile, overrides, joint, render: d => client.render(d),
        onProgress: t => { if (current()) setState(r => ({ ...r, note: `Rendering ${t}` })); },
        onPartial: p => { if (current()) { setPlates(p.plates); setState(r => ({ ...r, stl: plateToStl(p) })); } },
      }).then(p => {
        if (!p || !current()) return;
        rememberPlate(key, p);
        setPlates(p.plates);
        setState({ status: p.parts.length ? "done" : "error", name: kit.title, stl: p.parts.length ? plateToStl(p) : null, hw: null, seconds: 0, messages: [], log: [], note: plateSummary(p) });
      });
    } else {
      void run({ name: `ASM-${kitId}${view === "exploded" ? "-x" : ""}`, defs: defines("assembly", { kit: kitId, explode: view === "exploded" ? 1 : 0 }, size, profile, overrides, joint), assembly: true });
    }
    // viewKey stands for everything the view depends on
  }, [viewKey, engine.status, dlBusy, inSize]);

  const mesh = useMemo(() => (render.stl ? parseBinaryStl(render.stl) : null), [render.stl]);
  const busy = render.status === "rendering";
  const showingPlate = view === "print" && !shown;

  const pickKit = (id: string) => setSel({ kit: id, view: hasAssembly(id) ? (view === "print" && !asm ? "assembled" : view) : "print", show: null });
  const [open, setOpen] = useState<Set<string>>(() => new Set(["Basics", kitGroup(kitId)]));
  useEffect(() => { const g = kitGroup(kitId); setOpen(o => (o.has(g) ? o : new Set([...o, g]))); }, [kitId]);
  const groups: [string, string[]][] = kitGroup(kitId) === LEGACY_GROUP ? [...KIT_GROUPS, [LEGACY_GROUP, LEGACY_KITS]] : KIT_GROUPS;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Kits</h2>
        {groups.map(([g, ids]) => {
          const isOpen = open.has(g);
          return (
            <div key={g} className="group">
              <button type="button" className="group-head" aria-expanded={isOpen} onClick={() => setOpen(o => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; })}>
                <span>{isOpen ? "▾" : "▸"} {g}</span><span className="muted small">{ids.length}</span>
              </button>
              {isOpen && ids.map(id => {
                const off = !kitInSize(id, size);
                return (
                  <button key={id} type="button" className={"item kit-item" + (id === kitId ? " on" : "")} disabled={off || dlBusy} title={off ? `not made in ${size}` : undefined} onClick={() => pickKit(id)}>
                    <span>{kitLabel(id)}</span><span className="count">{kitParts(catalog.kits[id], joint).length}</span>
                  </button>
                );
              })}
              {isOpen && g === LEGACY_GROUP && <p className="muted small">Opened from Settings.</p>}
            </div>
          );
        })}
        <p className="muted small">The number is the parts to print. Board tiles come with the starter kit.</p>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <div className="segmented views" role="tablist" aria-label="View">
            {VIEWS.map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={!shown && view === v} className={!shown && view === v ? "on" : ""} disabled={(v !== "print" && !asm) || dlBusy}
                title={v !== "print" && !asm ? "this kit has no assembled view" : undefined} onClick={() => setSel({ kit: kitId, view: v, show: null })}>{label}</button>
            ))}
          </div>
          {busy && <button type="button" onClick={cancel}>Cancel</button>}
          <StatusLine engine={engine} render={render} lines={liveLines.length} mesh={mesh}
            idle={inSize ? "Pick a kit." : <span className="err">The {kitLabel(kitId).toLowerCase()} kit is not made in {size}: some of its parts do not fit the {std.grid} mm grid.</span>} />
          {shown && <PartDownloads stl={render.stl} mesh={mesh} name={render.name} fileBase={`${shown.name}-${size}-${profile}${jointSuffix}`} busy={busy} />}
        </div>
        {shown && (
          <div className="crumb">
            <button type="button" className="link" onClick={() => setSel({ kit: kitId, view, show: null })}>← {kit.title}</button>
            <span><code>{shown.name}</code> {shown.title}, shown alone</span>
            <button type="button" className="link" onClick={() => { const { part, ...params } = shown.params; openPart(String(part), params); }}>Edit in Parts</button>
          </div>
        )}
        <Viewer stl={inSize ? render.stl : null} hardware={!shown && view !== "print" ? render.hw : null} busy={busy} grid={std.grid}
          beds={showingPlate ? { size: BED, gap: PLATE_GAP, count: plates } : null} label={render.note ?? "Rendering…"} />
        {settings.console && <LogPanel lines={busy ? liveLines : render.log} messages={render.messages} />}
      </main>

      <aside className="panel">
        <div className="panel-title"><h2 className="title">{kit.title}</h2></div>
        <p className="muted small">{names.length} part{names.length === 1 ? "" : "s"} to print · {std.title}</p>
        <h3>Print</h3>
        <ul className="kit-parts">
          {items.map(it => (
            <li key={it.name}>
              <button type="button" className={"kit-part" + (shown?.name === it.name ? " on" : "")} onClick={() => setSel({ kit: kitId, view, show: shown?.name === it.name ? null : it.name })}>
                <b>{it.qty}×</b> <code>{it.name}</code> <span className="muted">{it.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">Click a part to see it alone.</p>
        <h3>Buy</h3>
        <ul className="hardware">{hardware.map((h, i) => <li key={i}>{h}</li>)}</ul>
        <h3>Download the kit</h3>
        <KitDownloads title={kit.title} id={kitId} items={items} hardware={hardware} size={size} profile={profile} overrides={overrides} joint={joint}
          render={d => client.render(d)} disabled={engine.status !== "ready" || !inSize} onBusy={b => { setDlBusy(b); if (b) cancel(); }}>
          {asm && (
            <button type="button" disabled={!render.stl || busy || view === "print" || !!shown} title="The assembly as shown in the view, for looking at, not for printing"
              onClick={() => download(render.stl!, `gearbox-${kitId}-${view}-${size}-${profile}${jointSuffix}.stl`, "model/stl")}>{view === "exploded" ? "Exploded" : "Assembled"} view STL</button>
          )}
        </KitDownloads>
      </aside>
    </div>
  );
}
