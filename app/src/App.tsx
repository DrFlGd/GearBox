import { useEffect, useRef, useState } from "react";
import { RenderClient } from "./engine/client";
import { JOINTS, JOINT_TITLES, PART_KINDS, PROFILES, SIZES, catalog, hasAssembly, partKind, type Joint, type Overrides, type Params, type Profile, type Size } from "./parts";
import KitsMode from "./kits/KitsMode";
import PartsMode from "./parts/PartsMode";
import LayoutMode from "./layout/LayoutMode";
import SettingsDrawer from "./components/SettingsDrawer";

const REPO = "https://github.com/DrFlGd/GearBox";
const LS_KEY = "gearbox.settings";

export type Mode = "kits" | "parts" | "layout";
export type Settings = { size: Size; profile: Profile; overrides: Overrides; joint: Joint; auto: boolean; console: boolean };
export type Selection = { kindId: string; params: Params };
export type KitView = "assembled" | "exploded" | "print";
/** A kit, how it is shown, and the one part shown alone (a catalog name) or null for the whole kit. */
export type KitSelection = { kit: string; view: KitView; show: string | null };
export type Engine = { status: "loading" | "ready" | "failed"; error: string };

const DEFAULT_KIT = "starter";
const hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ""));

function loadSettings(): Settings {
  const fallback: Settings = { size: "M2", profile: "PETG", overrides: {}, joint: "jaws", auto: true, console: false };
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    const hs = hashParams().get("size");
    return {
      size: SIZES.includes(hs as Size) ? (hs as Size) : SIZES.includes(s.size) ? s.size : fallback.size,
      profile: PROFILES.includes(s.profile) ? s.profile : fallback.profile,
      overrides: s.overrides ?? {}, joint: JOINTS.includes(s.joint) ? s.joint : fallback.joint, auto: s.auto ?? true, console: s.console ?? false,
    };
  } catch { return fallback; }
}

/** A part from the URL hash (#part=gear&teeth=40), so a part can be linked. */
function selectionFromHash(): Selection | null {
  const h = hashParams();
  const kind = partKind(h.get("part") ?? "");
  if (!kind || kind.id === "assembly") return null;
  const params: Params = { ...kind.defaults };
  for (const p of kind.params) {
    const v = h.get(p.key);
    if (v === null) continue;
    params[p.key] = p.type === "number" || typeof kind.defaults[p.key] === "number" ? Number(v) : v;
  }
  return { kindId: kind.id, params };
}

export const defaultView = (kit: string): KitView => (hasAssembly(kit) ? "assembled" : "print");

/** Where a link lands: a layout, a kit (also the old #part=assembly links), a part, or by default the starter kit. */
function initialRoute(): { mode: Mode; kit: KitSelection } {
  const h = hashParams();
  const kitFrom = (id: string | null): string => (id && catalog.kits[id] ? id : DEFAULT_KIT);
  if (h.get("part") === "assembly") {
    const kit = kitFrom(h.get("kit") ?? "joint");
    return { mode: "kits", kit: { kit, view: Number(h.get("explode")) ? "exploded" : defaultView(kit), show: null } };
  }
  const kit = kitFrom(h.get("kit"));
  const v = h.get("view") as KitView | null;
  const show = h.get("show");
  const kitSel: KitSelection = { kit, view: v && ["assembled", "exploded", "print"].includes(v) && (v === "print" || hasAssembly(kit)) ? v : defaultView(kit), show: show && catalog.kits[kit].parts.includes(show) ? show : null };
  const mode = h.get("mode");
  if (mode === "layout") return { mode: "layout", kit: kitSel };
  if (mode === "kits") return { mode: "kits", kit: kitSel };
  if (selectionFromHash()) return { mode: "parts", kit: kitSel };
  return { mode: "kits", kit: kitSel };
}

export default function App() {
  const client = useRef<RenderClient | null>(null);
  if (!client.current) client.current = new RenderClient();
  const [engine, setEngine] = useState<Engine>({ status: "loading", error: "" });
  const [route] = useState(initialRoute);
  const [mode, setMode] = useState<Mode>(route.mode);
  const [kitSel, setKitSel] = useState<KitSelection>(route.kit);
  const [partSel, setPartSel] = useState<Selection>(() => selectionFromHash() ?? { kindId: "gear", params: { ...PART_KINDS[0].defaults } });
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const c = client.current!;
    c.ready.then(() => setEngine(e => (e.status === "failed" ? e : { status: "ready", error: "" })));
    c.onFatal = text => setEngine({ status: "failed", error: text });
  }, []);
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSettingsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const openPart = (kindId: string, params: Params) => {
    const k = partKind(kindId);
    if (!k) return;
    setPartSel({ kindId, params: { ...k.defaults, ...params } });
    setMode("parts");
    setSettingsOpen(false);
  };
  const openKit = (kit: string) => {
    setKitSel({ kit, view: defaultView(kit), show: null });
    setMode("kits");
    setSettingsOpen(false);
  };
  const std = catalog.standards[settings.size];
  const tabs: [Mode, string][] = [["kits", "Kits"], ["parts", "Parts"], ["layout", "Layout"]];

  return (
    <div className="app">
      <header className="top">
        <h1><span className="logo" aria-hidden>⚙</span> GearBox</h1>
        <div className="segmented modes" role="tablist">
          {tabs.map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
        <div className="segmented sizes" role="radiogroup" aria-label="Size" title={std.title}>
          {SIZES.map(sz => (
            <button key={sz} type="button" role="radio" aria-checked={settings.size === sz} className={settings.size === sz ? "on" : ""}
              onClick={() => setSettings(s => ({ ...s, size: sz }))}>{sz} <span className="muted">{catalog.standards[sz].bolt} · {catalog.standards[sz].bearing.split(" ")[0]}</span></button>
          ))}
        </div>
        <nav>
          <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">Print guide</a>
          <button type="button" className={"settings-button" + (settingsOpen ? " on" : "")} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(o => !o)}>
            <span aria-hidden>⚙</span> Settings <span className="muted">· {settings.profile}{settings.joint === "jaws" ? "" : ` · ${JOINT_TITLES[settings.joint]}`}</span>
          </button>
        </nav>
      </header>

      {mode === "kits" && <KitsMode client={client.current} engine={engine} settings={settings} sel={kitSel} setSel={setKitSel} openPart={openPart} />}
      {mode === "parts" && <PartsMode client={client.current} engine={engine} settings={settings} sel={partSel} setSel={setPartSel} />}
      {mode === "layout" && (
        <LayoutMode size={settings.size} profile={settings.profile} overrides={settings.overrides} joint={settings.joint} engineReady={engine.status === "ready"}
          render={defs => client.current!.render(defs)} openPart={openPart} />
      )}

      {settingsOpen && (
        <SettingsDrawer settings={settings} setSettings={setSettings} close={() => setSettingsOpen(false)} openPart={openPart} openKit={openKit} repo={REPO} />
      )}
    </div>
  );
}
