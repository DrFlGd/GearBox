import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderClient } from "../engine/client";
import type { Engine, Selection, Settings } from "../App";
import {
  LEGACY_GROUP, PART_GROUPS, PART_KINDS, catalog, defines, isLegacyKind, meshesWith, partInSize, partKind, validate,
  type CatalogPart, type PartKind, type ParamValue,
} from "../parts";
import { parseBinaryStl } from "../export/threemf";
import { useRender } from "../useRender";
import Viewer from "../components/Viewer";
import ParamForm from "../components/ParamForm";
import LogPanel from "../components/LogPanel";
import StatusLine from "../components/StatusLine";
import PartDownloads from "../components/PartDownloads";

type Props = { client: RenderClient; engine: Engine; settings: Settings; sel: Selection; setSel: (f: (s: Selection) => Selection) => void };

const presetsOf = (kindId: string) => catalog.parts.filter(p => p.params.part === kindId);
const listed = (k: PartKind) => k.id !== "assembly";

/** One part at a time: pick it, set its options, see it, download it. */
export default function PartsMode({ client, engine, settings, sel, setSel }: Props) {
  const { state: render, run, cancel, liveLines } = useRender(client);
  const { size, profile, overrides, joint } = settings;
  const kind = partKind(sel.kindId) ?? PART_KINDS[0];
  const matchingPreset = catalog.parts.find(p => p.params.part === kind.id && Object.entries(sel.params).every(([k, v]) => (p.params[k] ?? kind.defaults[k]) === v));
  const name = matchingPreset?.name ?? kind.name(sel.params);
  const problem = validate(kind.id, sel.params, size);
  const defs = useMemo(() => defines(kind.id, sel.params, size, profile, overrides, joint), [kind.id, sel.params, size, profile, overrides, joint]);
  const defsKey = defs.join("\n");
  const std = catalog.standards[size];

  useEffect(() => {
    const h = new URLSearchParams();
    h.set("size", size);
    h.set("part", kind.id);
    for (const [k, v] of Object.entries(sel.params)) if (v !== kind.defaults[k]) h.set(k, String(v));
    history.replaceState(null, "", "#" + h.toString());
  }, [sel, kind, size]);

  // Auto-render: the first time the engine is ready, and after each change (debounced).
  const lastRendered = useRef("");
  useEffect(() => {
    if (engine.status !== "ready" || problem) return;
    if (!settings.auto && lastRendered.current !== "") return;
    if (lastRendered.current === defsKey) return;
    const t = setTimeout(() => { lastRendered.current = defsKey; void run({ name, defs }); }, lastRendered.current ? 500 : 0);
    return () => clearTimeout(t);
  }, [engine.status, defsKey, settings.auto, problem, run, name, defs]);

  const mesh = useMemo(() => (render.stl ? parseBinaryStl(render.stl) : null), [render.stl]);
  const busy = render.status === "rendering";
  const fileBase = `${render.name}-${size}-${profile}${joint === "jaws" ? "" : `-${joint}`}`;
  const setParam = (key: string, value: ParamValue) => setSel(s => ({ ...s, params: { ...s.params, [key]: value } }));
  const pickKind = (id: string) => { const k = partKind(id)!; setSel(() => ({ kindId: id, params: { ...k.defaults } })); };
  const pickPreset = (p: CatalogPart) => {
    const { part, ...params } = p.params;
    const k = partKind(String(part));
    if (k) setSel(() => ({ kindId: k.id, params: { ...k.defaults, ...params } }));
  };

  // the list: a search over titles and catalog names, or folding groups with the current part's group open
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set([kind.group]));
  useEffect(() => { setOpen(o => (o.has(kind.group) ? o : new Set([...o, kind.group]))); }, [kind.group]);
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const kinds = PART_KINDS.filter(k => listed(k) && (k.title.toLowerCase().includes(q) || k.id.replace(/_/g, " ").includes(q)));
    const presets = catalog.parts.filter(p => partInSize(p, size) && partKind(String(p.params.part)) && listed(partKind(String(p.params.part))!) && (p.name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)));
    return { kinds, presets: presets.slice(0, 24) };
  }, [q, size]);
  const groups = isLegacyKind(kind.id) ? [...PART_GROUPS, LEGACY_GROUP] : PART_GROUPS;
  const unavailable = (k: PartKind) => !!k.sizes && !k.sizes.includes(size);
  const item = (k: PartKind) => (
    <button key={k.id} type="button" className={"item" + (k.id === kind.id ? " on" : "")} onClick={() => pickKind(k.id)} disabled={unavailable(k)} title={unavailable(k) ? `not made in ${size}` : undefined}>
      {k.title}{isLegacyKind(k.id) && results ? <span className="tag">legacy and test</span> : null}
    </button>
  );

  const presets = presetsOf(kind.id).filter(p => partInSize(p, size));
  const teeth = Number(sel.params.teeth);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [kind.id]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <input type="search" className="search" placeholder="Find a part: G40, crank, rail…" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a part" />
        {results ? (
          <div className="group">
            {!results.kinds.length && !results.presets.length && <p className="muted small">Nothing matches “{query}”.</p>}
            {results.kinds.map(item)}
            {results.presets.length > 0 && <h3>Catalog parts</h3>}
            {results.presets.map(p => (
              <button key={p.name} type="button" className={"item" + (matchingPreset?.name === p.name ? " on" : "")} onClick={() => pickPreset(p)}>
                <code>{p.name}</code> <span className="muted">{p.title}</span>{isLegacyKind(String(p.params.part)) ? <span className="tag">legacy and test</span> : null}
              </button>
            ))}
          </div>
        ) : groups.map(g => {
          const kinds = PART_KINDS.filter(k => k.group === g && listed(k));
          const isOpen = open.has(g);
          return (
            <div key={g} className="group">
              <button type="button" className="group-head" aria-expanded={isOpen} onClick={() => setOpen(o => { const n = new Set(o); if (n.has(g)) n.delete(g); else n.add(g); return n; })}>
                <span>{isOpen ? "▾" : "▸"} {g}</span><span className="muted small">{kinds.length}</span>
              </button>
              {isOpen && kinds.map(item)}
              {isOpen && g === LEGACY_GROUP && <p className="muted small">Opened from Settings; pick a current part and this group hides again.</p>}
            </div>
          );
        })}
      </aside>

      <main className="stage">
        <div className="toolbar">
          {!settings.auto && <button type="button" className="primary" onClick={() => { lastRendered.current = defsKey; void run({ name, defs }); }} disabled={engine.status !== "ready" || !!problem}>Render</button>}
          {busy && <button type="button" onClick={cancel}>Cancel</button>}
          <StatusLine engine={engine} render={render} lines={liveLines.length} mesh={mesh} idle={settings.auto ? "Pick a part." : "Pick a part and press Render."} />
          <PartDownloads stl={render.stl} mesh={mesh} name={render.name} fileBase={fileBase} busy={busy} />
        </div>
        <Viewer stl={render.stl} busy={busy} grid={std.grid} />
        {settings.console && <LogPanel lines={busy ? liveLines : render.log} messages={render.messages} />}
      </main>

      <aside className="panel">
        <div className="panel-title">
          <h2 className="title">{kind.title}</h2>
          <code>{name}</code> <span className="muted">{size}</span>
        </div>
        {presets.length > 1 && (
          <div className="chips" role="group" aria-label="Catalog presets">
            {presets.map(p => (
              <button key={p.name} type="button" className={"chip" + (matchingPreset?.name === p.name ? " on" : "")} title={p.title} onClick={() => pickPreset(p)}>{p.name}</button>
            ))}
          </div>
        )}
        <ParamForm params={kind.params} values={sel.params} onChange={setParam} />
        {problem && <p className="err">{problem}</p>}
        <div className="facts">
          {(kind.id === "gear" || kind.id === "compound") && Number.isFinite(teeth) && <p>Meshes with {meshesWith(teeth).map(t => `${t}T`).join(", ")}. Pitch diameter {std.module * teeth} mm on the {std.grid} mm grid.</p>}
          {matchingPreset?.expect?.[size] && <p>Catalog size {matchingPreset.expect[size]!.map(v => v.toFixed(1)).join(" × ")} mm.</p>}
          <p>{std.title}. Bolt lengths: {Object.entries(std.bolt_lengths).map(([l, mm]) => `${l} level${l === "1" ? "" : "s"} ${mm} mm`).join(", ")}.</p>
        </div>
        <h3>About this part</h3>
        <p className={"blurb" + (more ? "" : " clamp")}>{kind.blurb}</p>
        <button type="button" className="link" onClick={() => setMore(m => !m)}>{more ? "Less" : "More"}</button>
      </aside>
    </div>
  );
}

