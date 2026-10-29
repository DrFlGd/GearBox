import { useEffect, useRef, useState } from "react";

type Props = { lines: string[]; messages: string[] };

/** OpenSCAD console output, warnings first. Collapsed by default. */
export default function LogPanel({ lines, messages }: Props) {
  const [open, setOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end" }); }, [lines, open]);
  const warn = messages.filter(m => /WARNING|ERROR/.test(m));
  return (
    <div className={"log" + (open ? " open" : "")}>
      <button type="button" className="log-toggle" onClick={() => setOpen(o => !o)}>
        {open ? "▾" : "▸"} Console {warn.length ? <span className="badge warn">{warn.length}</span> : null} <span className="muted">{lines.length} lines</span>
      </button>
      {open && (
        <pre className="log-body">
          {lines.map((l, i) => <div key={i} className={/ERROR/.test(l) ? "err" : /WARNING/.test(l) ? "warn" : ""}>{l}</div>)}
          <div ref={end} />
        </pre>
      )}
    </div>
  );
}
