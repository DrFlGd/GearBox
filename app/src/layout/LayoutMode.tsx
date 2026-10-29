import { useEffect, useMemo, useRef, useState } from "react";
import BoardView, { type Pick } from "./BoardView";
import { MAX_LEVEL, TEETH, boardH, boardW, emptyLayout, exampleLayout, gearAt, newId, pinById, std, type Layout, type Pin, type Teeth } from "./model";
import { analyze, billOfMaterials, key, ratioText } from "./rules";
import { decodeLayout, encodeLayout } from "./share";
import { buildKitZip } from "../kitzip";
import { download } from "../download";
import type { Overrides, Profile, Size } from "../parts";
import type { RenderResult } from "../engine/protocol";

const LS = "gearbox.layout";

type Props = { size: Size; profile: Profile; overrides: Overrides; render: (defs: string[]) => Promise<RenderResult>; engineReady: boolean };

function initialLayout(size: Size): Layout {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromHash = h.get("l") && decodeLayout(h.get("l")!);
  if (fromHash) return { ...fromHash, size };
  try { const s = localStorage.getItem(LS); if (s) return { ...(JSON.parse(s) as Layout), size }; } catch { /* ignore */ }
  return exampleLayout(size);
}

/** Phase 3: build a train on a virtual board, check it, animate it, print it. */
export default function LayoutMode({ size, profile, overrides, render, engineReady }: Props) {
  const [layout, setLayoutRaw] = useState<Layout>(() => initialLayout(size));
  const [selected, setSelected] = useState<{ i: number; j: number } | null>(null);
  const [hover, setHover] = useState<Pick>(null);
  const [playing, setPlaying] = useState(true);
  const [zipState, setZipState] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newTeeth, setNewTeeth] = useState<Teeth>(40);
  const busy = useRef(false);

  useEffect(() => { if (layout.size !== size) setLayoutRaw(l => ({ ...l, size })); }, [size, layout.size]);
  const setLayout = (f: (l: Layout) => Layout) => setLayoutRaw(l => f(l));
  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify(layout)); } catch { /* ignore */ }
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    h.set("mode", "layout"); h.set("size", layout.size); h.set("l", encodeLayout(layout));
    history.replaceState(null, "", "#" + h.toString());
  }, [layout]);

  const analysis = useMemo(() => analyze(layout), [layout]);
  const bom = useMemo(() => billOfMaterials(layout), [layout]);
  const d = std(layout.size);
  const selPin = selected ? layout.pins.find(p => p.x === selected.i && p.y === selected.j) : undefined;

  const onPick = (p: Pick) => {
    if (!p) { setSelected(null); return; }
    if (p.kind === "socket") setSelected({ i: p.i, j: p.j });
    else { const pin = pinById(layout, p.pin); if (pin) setSelected({ i: pin.x, j: pin.y }); }
  };

  const updatePin = (id: string, f: (p: Pin) => Pin | null) => setLayout(l => {
    const pins = l.pins.flatMap(p => (p.id === id ? (f(p) ? [f(p)!] : []) : [p]));
    const input = l.input && !pins.some(p => p.id === l.input!.pin && gearAt(p, l.input!.level)) ? null : l.input;
    return { ...l, pins, input };
  });
  const addGear = (level: number) => {
    if (!selected) return;
    if (selPin) updatePin(selPin.id, p => ({ ...p, gears: [...p.gears, { level, teeth: newTeeth, joined: false }] }));
    else setLayout(l => ({ ...l, pins: [...l.pins, { id: newId(), x: selected.i, y: selected.j, gears: [{ level, teeth: newTeeth, joined: false }] }] }));
  };
  const setInput = (pin: string, level: number) => setLayout(l => ({ ...l, input: { pin, level } }));

  const hoverKey = hover?.kind === "gear" ? key(hover.pin, hover.level) : null;
  const hoverGear = hover?.kind === "gear" ? gearAt(pinById(layout, hover.pin)!, hover.level) : null;

  const resize = (patch: Partial<Layout["tile"]> & Partial<Layout["tiles"]>) => setLayout(l => {
    const tile = { nx: patch.nx ?? l.tile.nx, ny: patch.ny ?? l.tile.ny };
    const tiles = { cols: patch.cols ?? l.tiles.cols, rows: patch.rows ?? l.tiles.rows };
    const W = tile.nx * tiles.cols, H = tile.ny * tiles.rows;
    return { ...l, tile, tiles, pins: l.pins.filter(p => p.x < W && p.y < H) };
  });

  const downloadKit = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { zip, failed } = await buildKitZip({
        title: "layout", items: bom.printed.map(b => ({ name: b.name, title: b.title, qty: b.qty, params: b.params! })),
        hardware: bom.hardware.map(h => `${h.qty} x ${h.title}`), size, profile, overrides, render, onProgress: setZipState,
      });
      download(zip, `gearbox-layout-${size}-${profile}.zip`, "application/zip");
      setZipState(failed.length ? `${failed.length} failed: ${failed.join(", ")}` : null);
    } finally { busy.current = false; }
  };
  const share = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const gearCount = layout.pins.reduce((n, p) => n + p.gears.length, 0);
  const inputGear = layout.input ? gearAt(pinById(layout, layout.input.pin)!, layout.input.level) : null;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Board</h2>
        <div className="form">
          <label className="field"><span className="field-label">Tile</span>
            <div className="row">
              <select value={layout.tile.nx} onChange={e => resize({ nx: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}</select>
              <span>×</span>
              <select value={layout.tile.ny} onChange={e => resize({ ny: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}</select>
            </div>
          </label>
          <label className="field"><span className="field-label">Tiles across × down</span>
            <div className="row">
              <select value={layout.tiles.cols} onChange={e => resize({ cols: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
              <span>×</span>
              <select value={layout.tiles.rows} onChange={e => resize({ rows: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
            </div>
            <span className="field-help">{boardW(layout)} × {boardH(layout)} sockets, {boardW(layout) * d.grid} × {boardH(layout) * d.grid} mm</span>
          </label>
          <div className="row">
            <button type="button" onClick={() => { setLayoutRaw(exampleLayout(size)); setSelected(null); }}>Load 1:16 example</button>
            <button type="button" onClick={() => { setLayoutRaw(emptyLayout(size)); setSelected(null); }}>Clear</button>
          </div>
        </div>

        <h2>Bill of materials</h2>
        <ul className="kit-list">
          {bom.printed.map(b => <li key={b.name}><b>{b.qty}×</b> {b.name} <span className="muted">{b.title}</span></li>)}
          {bom.hardware.map(h => <li key={h.name}><b>{h.qty}×</b> <span className="muted">{h.title}</span></li>)}
        </ul>
        <div className="form">
          <button type="button" className="primary" onClick={downloadKit} disabled={!engineReady || busy.current || !gearCount}>
            {zipState && busy.current ? `Rendering ${zipState}` : `Download kit zip (${size}, ${profile})`}
          </button>
          {zipState && !busy.current && <p className="muted small">{zipState}</p>}
          <button type="button" onClick={share}>{copied ? "Link copied" : "Copy share link"}</button>
        </div>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <button type="button" className="primary" onClick={() => setPlaying(p => !p)}>{playing ? "Pause" : "Play"}</button>
          <label className="check">{layout.rpm} rpm <input type="range" min={1} max={60} value={layout.rpm} onChange={e => setLayout(l => ({ ...l, rpm: Number(e.target.value) }))} /></label>
          <span className="status">
            {hoverGear && hoverKey ? (
              <><b>{hoverGear.teeth}T</b> level {hoverGear.level}: {ratioText(analysis.speed.get(hoverKey) ?? 0)}</>
            ) : analysis.problems.length ? (
              <span className="err">{analysis.problems.length} problem{analysis.problems.length > 1 ? "s" : ""}: {analysis.problems[0].text}</span>
            ) : !layout.input ? (
              "Pick a gear and mark it as the input to see the train turn."
            ) : (
              <>{analysis.pairs.filter(p => p.kind === "mesh").length} meshes, {analysis.reachable.size} of {gearCount} gears driven{inputGear ? ` from the ${inputGear.teeth}T` : ""}. Click a socket to add a pin, click a gear to edit it.</>
            )}
          </span>
          <span className="legend"><i style={{ background: "#7ee787" }} /> input <i style={{ background: "#e8b44c" }} /> driven <i style={{ background: "#7a8296" }} /> free <i style={{ background: "#ff6b62" }} /> collides</span>
        </div>
        <BoardView layout={layout} analysis={analysis} selected={selected ? { ...selected, pin: selPin?.id } : null} playing={playing} onPick={onPick} onHover={setHover} />
      </main>

      <aside className="panel">
        {!selected ? (
          <>
            <h2>Layout</h2>
            <p className="blurb">Click a socket on the board to add a pin and a gear. Click a gear to change it, stack another level on it, or make it the input.</p>
            <p className="hint">Two gears on the same level mesh when their tooth counts add up to a multiple of 20 and their pins are that many twentieths apart: 20T+20T two sockets apart, 20T+40T three, 40T+40T four, 20T+80T five (straight, or on a 3-4-5 diagonal).</p>
            <p className="hint">Join a stacked gear to the one below it to carry motion to another level: a bigger gear below a smaller one becomes one compound part, any other pair gets two coupler halves.</p>
            {analysis.problems.length > 0 && <ul className="problems">{analysis.problems.map((p, i) => <li key={i} className="err">{p.text}</li>)}</ul>}
          </>
        ) : (
          <>
            <h2>Socket {selected.i + 1}, {selected.j + 1} {selPin && <span className="muted">pin, {d.bolt} × {d.bolt_lengths[String(Math.max(1, ...selPin.gears.map(g => g.level)))]} mm</span>}</h2>
            {[1, 2, 3].slice(0, MAX_LEVEL).map(level => {
              const g = selPin && gearAt(selPin, level);
              const k = selPin ? key(selPin, level) : "";
              const isInput = layout.input?.pin === selPin?.id && layout.input?.level === level;
              return (
                <div key={level} className="level">
                  <div className="level-head"><b>Level {level}</b>{g && <span className="muted">{isInput ? " input" : ` ${ratioText(analysis.speed.get(k) ?? 0)}`}</span>}</div>
                  {g ? (
                    <div className="form">
                      <div className="row">
                        <select value={g.teeth} onChange={e => updatePin(selPin!.id, p => ({ ...p, gears: p.gears.map(x => (x.level === level ? { ...x, teeth: Number(e.target.value) as Teeth } : x)) }))}>
                          {TEETH.map(t => <option key={t} value={t}>{t} teeth · {d.module * t} mm</option>)}
                        </select>
                        <button type="button" onClick={() => updatePin(selPin!.id, p => { const gears = p.gears.filter(x => x.level !== level); return gears.length ? { ...p, gears } : null; })}>Remove</button>
                      </div>
                      <div className="row">
                        {level > 1 && gearAt(selPin!, level - 1) && (
                          <label className="check"><input type="checkbox" checked={g.joined} onChange={e => updatePin(selPin!.id, p => ({ ...p, gears: p.gears.map(x => (x.level === level ? { ...x, joined: e.target.checked } : x)) }))} /> joined to level {level - 1}</label>
                        )}
                        <label className="check"><input type="radio" name="input" checked={isInput} onChange={() => setInput(selPin!.id, level)} /> input</label>
                      </div>
                    </div>
                  ) : (
                    <div className="row">
                      <select value={newTeeth} onChange={e => setNewTeeth(Number(e.target.value) as Teeth)}>{TEETH.map(t => <option key={t} value={t}>{t} teeth</option>)}</select>
                      <button type="button" onClick={() => addGear(level)}>Add gear</button>
                    </div>
                  )}
                </div>
              );
            })}
            {selPin && <button type="button" className="link" onClick={() => { updatePin(selPin.id, () => null); setSelected(null); }}>Remove pin</button>}
            {analysis.problems.filter(p => p.pin === selPin?.id).map((p, i) => <p key={i} className="err">{p.text}</p>)}
          </>
        )}
      </aside>
    </div>
  );
}
