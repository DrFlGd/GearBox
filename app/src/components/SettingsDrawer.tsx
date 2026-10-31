import { useEffect, useMemo, useState } from "react";
import type { Settings } from "../App";
import { LEGACY_GROUP, LEGACY_KITS, PART_KINDS, PROFILES, catalog, kitInSize, parseTolerances, type Params } from "../parts";
import { cacheStats, clearCache } from "../engine/cacheAdmin";
import JointPicker from "./JointPicker";

type Props = {
  settings: Settings; setSettings: (f: (s: Settings) => Settings) => void; close: () => void;
  openPart: (kindId: string, params: Params) => void; openKit: (kit: string) => void; repo: string;
};

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

/** What you set once: print profile, joints, fits, rendering; and the legacy and test parts, kept out of the main lists. */
export default function SettingsDrawer({ settings, setSettings, close, openPart, openKit, repo }: Props) {
  const rows = useMemo(() => parseTolerances(), []);
  const [fitsOpen, setFitsOpen] = useState(Object.keys(settings.overrides).length > 0);
  const [stats, setStats] = useState<{ entries: number; bytes: number | null } | null>(null);
  useEffect(() => { void cacheStats().then(setStats); }, []);
  const { profile, overrides, size } = settings;
  const changed = Object.keys(overrides).length;
  const setOverrides = (o: typeof overrides) => setSettings(s => ({ ...s, overrides: o }));
  const legacyParts = PART_KINDS.filter(k => k.group === LEGACY_GROUP);

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-label="Settings">
        <div className="drawer-head">
          <h2>Settings</h2>
          <button type="button" className="link" onClick={close} aria-label="Close settings">Close ✕</button>
        </div>

        <section>
          <h3>Print profile</h3>
          <div className="segmented" role="radiogroup" aria-label="Print profile">
            {PROFILES.map(p => (
              <button key={p} type="button" role="radio" aria-checked={profile === p} className={profile === p ? "on" : ""} onClick={() => setSettings(s => ({ ...s, profile: p }))}>{p}</button>
            ))}
          </div>
          <p className="muted small">Sets the clearances of every fit for that filament. Downloads are named with it.</p>
        </section>

        <section>
          <h3>Gear joints</h3>
          <JointPicker joint={settings.joint} size={size} onJoint={j => setSettings(s => ({ ...s, joint: j }))} />
        </section>

        <section>
          <h3>Fits</h3>
          <p className="muted small">Print the fit test kit first, measure, then nudge the fits that are tight or loose. Values are millimetres; blank uses the {profile} value.</p>
          <span className="row">
            <button type="button" onClick={() => openKit("coupon")}>Open the fit test kit</button>
            <button type="button" className="link" onClick={() => setFitsOpen(o => !o)}>{fitsOpen ? "Hide" : "Tune"} fits{changed ? ` (${changed} changed)` : ""}</button>
          </span>
          {fitsOpen && (
            <div className="tol">
              {rows.map(r => (
                <label key={r.key} className="tol-row" title={r.what}>
                  <span className="tol-key">{r.key}</span>
                  <input type="number" step="0.05" placeholder={r.values[profile].toFixed(2)} value={overrides[r.key] ?? ""}
                    onChange={e => {
                      const next = { ...overrides };
                      if (e.target.value === "") delete next[r.key]; else next[r.key] = Number(e.target.value);
                      setOverrides(next);
                    }} />
                  <span className="tol-what">{r.what}</span>
                </label>
              ))}
              {changed > 0 && <button type="button" className="link" onClick={() => setOverrides({})}>Reset all</button>}
            </div>
          )}
        </section>

        <section>
          <h3>Legacy and test parts</h3>
          <p className="muted small">Kept for parts printed with older versions and for experiments. Each opens in the Parts or Kits tab.</p>
          <ul className="legacy-list">
            {legacyParts.map(k => {
              const off = !!k.sizes && !k.sizes.includes(size);
              return <li key={k.id}><button type="button" className="link" disabled={off} title={off ? `not made in ${size}` : undefined} onClick={() => openPart(k.id, {})}>{k.title}</button></li>;
            })}
          </ul>
          <ul className="legacy-list">
            {LEGACY_KITS.map(id => {
              const off = !kitInSize(id, size);
              return <li key={id}><button type="button" className="link" disabled={off} title={off ? `not made in ${size}` : undefined} onClick={() => openKit(id)}>{catalog.kits[id].title}</button> <span className="muted small">kit</span></li>;
            })}
          </ul>
        </section>

        <section>
          <h3>Rendering</h3>
          <label className="check"><input type="checkbox" checked={settings.auto} onChange={e => setSettings(s => ({ ...s, auto: e.target.checked }))} /> Re-render a part as its settings change</label>
          <label className="check"><input type="checkbox" checked={settings.console} onChange={e => setSettings(s => ({ ...s, console: e.target.checked }))} /> Show the OpenSCAD console under the view</label>
          <span className="row">
            <span className="muted small">{stats ? `${stats.entries} saved render${stats.entries === 1 ? "" : "s"}${stats.bytes != null ? `, ${mb(stats.bytes)} in this browser` : ""}.` : "Counting saved renders…"}</span>
            <button type="button" className="link" disabled={!stats?.entries} onClick={async () => { await clearCache(); setStats(await cacheStats()); }}>Clear saved renders</button>
          </span>
        </section>

        <section>
          <h3>About</h3>
          <p className="muted small">Renders run in your browser with OpenSCAD compiled to WebAssembly; nothing is uploaded. Rendered models are saved in this browser, so a part or kit you have seen opens at once.</p>
          <p className="small">
            <a href={`${repo}#readme`} target="_blank" rel="noreferrer">Print guide</a> · <a href={`${repo}/releases/latest`} target="_blank" rel="noreferrer">Every part as release zips</a> · <a href={repo} target="_blank" rel="noreferrer">GitHub</a>
          </p>
        </section>
      </aside>
    </>
  );
}
