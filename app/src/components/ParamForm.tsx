import type { ParamDef, Params, ParamValue } from "../parts";

type Props = { params: ParamDef[]; values: Params; onChange: (key: string, value: ParamValue) => void };

export default function ParamForm({ params, values, onChange }: Props) {
  if (!params.length) return <p className="muted">This part has no options.</p>;
  return (
    <div className="form">
      {params.map(p => (
        <label key={p.key} className="field">
          <span className="field-label">{p.label}</span>
          {p.type === "select" ? (
            <select value={String(values[p.key])} onChange={e => {
              const raw = e.target.value;
              const opt = p.options.find(o => String(o.value) === raw);
              onChange(p.key, opt ? opt.value : raw);
            }}>
              {p.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
            </select>
          ) : (
            <input type="number" min={p.min} max={p.max} step={p.step} value={values[p.key] as number}
              onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(p.key, Math.min(p.max, Math.max(p.min, v))); }} />
          )}
          {p.help && <span className="field-help">{p.help}</span>}
        </label>
      ))}
    </div>
  );
}
