import { useState } from "react";
import { PROFILES, type Overrides, type Profile, type ToleranceRow } from "../parts";

type Props = { profile: Profile; overrides: Overrides; rows: ToleranceRow[]; onProfile: (p: Profile) => void; onOverrides: (o: Overrides) => void };

/** Print profile picker with an optional table of fit overrides (the same keys as scad/lib/tolerances.scad). */
export default function ProfilePanel({ profile, overrides, rows, onProfile, onOverrides }: Props) {
  const [open, setOpen] = useState(Object.keys(overrides).length > 0);
  const n = Object.keys(overrides).length;
  return (
    <div className="panel-section">
      <div className="segmented" role="radiogroup" aria-label="Print profile">
        {PROFILES.map(p => (
          <button key={p} type="button" role="radio" aria-checked={profile === p} className={profile === p ? "on" : ""} onClick={() => onProfile(p)}>{p}</button>
        ))}
      </div>
      <button type="button" className="link" onClick={() => setOpen(o => !o)}>
        {open ? "Hide" : "Tune"} fits{n ? ` (${n} changed)` : ""}
      </button>
      {open && (
        <div className="tol">
          <p className="muted">Blank uses the {profile} value. Print the fit test coupon, measure, and nudge these. Values are millimetres.</p>
          {rows.map(r => (
            <label key={r.key} className="tol-row" title={r.what}>
              <span className="tol-key">{r.key}</span>
              <input type="number" step="0.05" placeholder={r.values[profile].toFixed(2)} value={overrides[r.key] ?? ""}
                onChange={e => {
                  const next = { ...overrides };
                  if (e.target.value === "") delete next[r.key]; else next[r.key] = Number(e.target.value);
                  onOverrides(next);
                }} />
              <span className="tol-what">{r.what}</span>
            </label>
          ))}
          {n > 0 && <button type="button" className="link" onClick={() => onOverrides({})}>Reset all</button>}
        </div>
      )}
    </div>
  );
}
