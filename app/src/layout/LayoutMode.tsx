import { useEffect, useMemo, useRef, useState } from "react";
import BoardView, { type Pick } from "./BoardView";
import {
  MAX_LEVEL, TEETH, addonsLayout, boardH, boardW, crankLinkLevel, emptyLayout, exampleLayout, gearAt, kindOf, newId, pinById, std, topLevel,
  type Gear, type ItemKind, type Layout, type Pin, type Teeth,
} from "./model";
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

// tiles across/down: 1..MAX_TILES (a 16x16 board of 8x8 tiles is 128x128 sockets, still fine to draw)
const MAX_TILES = 16;
const clampTiles = (v: string) => Math.min(MAX_TILES, Math.max(1, Math.round(Number(v) || 1)));
const KINDS: { id: ItemKind; label: string }[] = [
  { id: "gear", label: "Gear" }, { id: "pulley", label: "Pulley" }, { id: "ratchet", label: "Ratchet wheel" }, { id: "pawl", label: "Pawl" }, { id: "rocker", label: "Rocker (linkage)" },
];
const THROWS = [20, 30, 40, 50, 60, 70, 80];
const itemLabel = (g: Gear) => { switch (kindOf(g)) { case "gear": return `${g.teeth}T gear`; case "pulley": return `P${g.teeth} pulley`; case "ratchet": return "ratchet"; case "pawl": return "pawl"; case "rocker": return "rocker"; } };

/** Phase 3 + 4a: build a train on a virtual board, check it, animate it, print it. */
export default function LayoutMode({ size, profile, overrides, render, engineReady }: Props) {
  const [layout, setLayoutRaw] = useState<Layout>(() => initialLayout(size));
  const [selected, setSelected] = useState<{ i: number; j: number } | null>(null);
  const [hover, setHover] = useState<Pick>(null);
  const [playing, setPlaying] = useState(true);
  const [zipState, setZipState] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newKind, setNewKind] = useState<ItemKind>("gear");
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

  /** Drop bands and rockers that point at items that no longer exist. */
  const tidy = (l: Layout): Layout => {
    const has = (pid: string, level: number) => { const p = pinById(l, pid); return !!p && !!gearAt(p, level); };
    const bands = (l.bands ?? []).filter(b => has(b.a.pin, b.a.level) && has(b.b.pin, b.b.level));
    const pins = l.pins.map(p => ({ ...p, gears: p.gears.map(g => (g.rocker && !pinById(l, g.rocker.crank)?.gears.some(o => o.topper === "crank") ? { ...g, rocker: undefined, kind: "gear" as ItemKind } : g)) }));
    const input = l.input && !has(l.input.pin, l.input.level) ? null : l.input;
    return { ...l, bands, pins, input };
  };
  const updatePin = (id: string, f: (p: Pin) => Pin | null) => setLayout(l => tidy({ ...l, pins: l.pins.flatMap(p => (p.id === id ? (f(p) ? [f(p)!] : []) : [p])) }));
  const updateGear = (pinId: string, level: number, f: (g: Gear) => Gear) => updatePin(pinId, p => ({ ...p, gears: p.gears.map(x => (x.level === level ? f(x) : x)) }));
  const addItem = (level: number) => {
    if (!selected) return;
    const item: Gear = { level, teeth: newTeeth, joined: false, kind: newKind === "gear" ? undefined : newKind };
    if (newKind === "rocker") {
      const crankPin = layout.pins.find(p => p.gears.some(g => g.topper === "crank"));
      if (!crankPin) return;
      item.rocker = { crank: crankPin.id, coupler: 4, holes: 3 };
    }
    if (selPin) updatePin(selPin.id, p => ({ ...p, gears: [...p.gears, item] }));
    else setLayout(l => ({ ...l, pins: [...l.pins, { id: newId(), x: selected.i, y: selected.j, gears: [item] }] }));
  };
  const addMotor = () => {
    if (!selected || selPin) return;
    const id = newId();
    setLayout(l => ({ ...l, pins: [...l.pins, { id, x: selected.i, y: selected.j, gears: [{ level: 1, teeth: 20, joined: false }], motor: { dir: 0 } }], input: l.input ?? { pin: id, level: 1 } }));
  };
  const setInput = (pin: string, level: number) => setLayout(l => ({ ...l, input: { pin, level } }));
  const setBand = (pinId: string, level: number, to: string | null, crossed = false) => setLayout(l => {
    const bands = (l.bands ?? []).filter(b => !(b.a.pin === pinId && b.a.level === level) && !(b.b.pin === pinId && b.b.level === level));
    if (to) bands.push({ a: { pin: pinId, level }, b: { pin: to, level }, crossed });
    return { ...l, bands };
  });

  const hoverKey = hover?.kind === "gear" ? key(hover.pin, hover.level) : null;
  const hoverGear = hover?.kind === "gear" ? gearAt(pinById(layout, hover.pin)!, hover.level) : null;

  const resize = (patch: Partial<Layout["tile"]> & Partial<Layout["tiles"]>) => setLayout(l => {
    const tile = { nx: patch.nx ?? l.tile.nx, ny: patch.ny ?? l.tile.ny };
    const tiles = { cols: patch.cols ?? l.tiles.cols, rows: patch.rows ?? l.tiles.rows };
    const W = tile.nx * tiles.cols, H = tile.ny * tiles.rows;
    return tidy({ ...l, tile, tiles, pins: l.pins.filter(p => p.x < W && p.y < H) });
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
  const crankPins = layout.pins.filter(p => p.gears.some(g => g.topper === "crank"));
  const pulleysAt = (level: number, except: string) => layout.pins.filter(p => p.id !== except && p.gears.some(g => g.level === level && kindOf(g) === "pulley"));
  const bandOf = (pinId: string, level: number) => (layout.bands ?? []).find(b => (b.a.pin === pinId && b.a.level === level) || (b.b.pin === pinId && b.b.level === level));

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
              <input type="number" min={1} max={MAX_TILES} value={layout.tiles.cols} onChange={e => resize({ cols: clampTiles(e.target.value) })} />
              <span>×</span>
              <input type="number" min={1} max={MAX_TILES} value={layout.tiles.rows} onChange={e => resize({ rows: clampTiles(e.target.value) })} />
            </div>
            <span className="field-help">{boardW(layout)} × {boardH(layout)} sockets, {boardW(layout) * d.grid} × {boardH(layout) * d.grid} mm</span>
          </label>
          <div className="row">
            <button type="button" onClick={() => { setLayoutRaw(exampleLayout(size)); setSelected(null); }}>1:16 example</button>
            <button type="button" onClick={() => { setLayoutRaw(addonsLayout(size)); setSelected(null); }}>Add-ons sampler</button>
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
              <><b>{itemLabel(hoverGear)}</b> level {hoverGear.level}: {kindOf(hoverGear) === "rocker" ? "oscillates with its crank" : kindOf(hoverGear) === "pawl" ? "fixed to the board" : ratioText(analysis.speed.get(hoverKey) ?? 0)}</>
            ) : analysis.problems.length ? (
              <span className="err">{analysis.problems.length} problem{analysis.problems.length > 1 ? "s" : ""}: {analysis.problems[0].text}</span>
            ) : !layout.input ? (
              "Pick a gear and mark it as the input to see the train turn."
            ) : (
              <>{analysis.pairs.filter(p => p.kind === "mesh").length} meshes, {analysis.reachable.size} of {gearCount} items driven{inputGear ? ` from the ${itemLabel(inputGear)}` : ""}. Click a socket to add a pin, click an item to edit it.</>
            )}
          </span>
          <span className="legend"><i style={{ background: "#7ee787" }} /> input <i style={{ background: "#e8b44c" }} /> driven <i style={{ background: "#7a8296" }} /> free <i style={{ background: "#c9a2ff" }} /> add-on <i style={{ background: "#ff6b62" }} /> collides</span>
        </div>
        <BoardView layout={layout} analysis={analysis} selected={selected ? { ...selected, pin: selPin?.id } : null} playing={playing} onPick={onPick} onHover={setHover} />
      </main>

      <aside className="panel">
        {!selected ? (
          <>
            <h2>Layout</h2>
            <p className="blurb">Click a socket on the board to add a pin and an item. Click an item to change it, stack another level on it, or make it the input.</p>
            <p className="hint">Two gears on the same level mesh when their tooth counts add up to a multiple of 20 and their pins are that many twentieths apart: 20T+20T two sockets apart, 20T+40T three, 40T+40T four, 20T+80T five (straight, or on a 3-4-5 diagonal).</p>
            <p className="hint">Join a stacked item to the one below it to carry motion to another level: a bigger gear below a smaller one becomes one compound part, any other pair gets two coupler halves.</p>
            <p className="hint">Add-ons: a pulley takes a band to any other pulley on its level (cross it to reverse). A ratchet wants its pawl two sockets away along the grid. A crank on a gear's top face turns a handle, or drives a rocker on another pin two levels up through a coupler link. A pointer reads the dial knob on its own pin. A motor sits on a socket with its mount's legs at (−1, 2) and (1, 2).</p>
            {analysis.problems.length > 0 && <ul className="problems">{analysis.problems.map((p, i) => <li key={i} className="err">{p.text}</li>)}</ul>}
          </>
        ) : (
          <>
            <h2>Socket {selected.i + 1}, {selected.j + 1} {selPin && <span className="muted">{selPin.motor ? "N20 motor" : `pin, ${d.bolt} × ${d.bolt_lengths[String(Math.max(1, topLevel(selPin)))]} mm`}</span>}</h2>
            {selPin?.motor && (
              <div className="form">
                <label className="field"><span className="field-label">Pinion level</span>
                  <select value={selPin.gears[0]?.level ?? 1} onChange={e => updatePin(selPin.id, p => ({ ...p, gears: [{ ...p.gears[0], level: Number(e.target.value) }] }))}>{[1, 2, 3].map(n => <option key={n} value={n}>level {n}</option>)}</select>
                </label>
                <label className="field"><span className="field-label">Legs toward</span>
                  <select value={selPin.motor.dir} onChange={e => updatePin(selPin.id, p => ({ ...p, motor: { dir: Number(e.target.value) as 0 | 1 | 2 | 3 } }))}>
                    {["+y (up the board)", "−x (left)", "−y (down)", "+x (right)"].map((t, i) => <option key={i} value={i}>{t}</option>)}
                  </select>
                </label>
                <label className="check"><input type="radio" name="input" checked={layout.input?.pin === selPin.id} onChange={() => setInput(selPin.id, selPin.gears[0].level)} /> input</label>
                <p className="hint">The 20T pinion meshes like any gear; nothing can sit between the mount's legs.</p>
              </div>
            )}
            {!selPin?.motor && [1, 2, 3, 4].slice(0, MAX_LEVEL).map(level => {
              const g = selPin && gearAt(selPin, level);
              const k = selPin ? key(selPin, level) : "";
              const isInput = layout.input?.pin === selPin?.id && layout.input?.level === level;
              const isTop = !!selPin && topLevel(selPin) === level;
              const band = selPin ? bandOf(selPin.id, level) : undefined;
              return (
                <div key={level} className="level">
                  <div className="level-head"><b>Level {level}</b>{g && <span className="muted">{isInput ? " input" : kindOf(g) === "gear" || kindOf(g) === "pulley" || kindOf(g) === "ratchet" ? ` ${ratioText(analysis.speed.get(k) ?? 0)}` : ""}</span>}</div>
                  {g ? (
                    <div className="form">
                      <div className="row">
                        {kindOf(g) === "gear" && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            {TEETH.map(t => <option key={t} value={t}>{t} teeth · {d.module * t} mm</option>)}
                          </select>
                        )}
                        {kindOf(g) === "pulley" && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            {TEETH.map(t => <option key={t} value={t}>P{t} pulley · {d.module * t} mm</option>)}
                          </select>
                        )}
                        {kindOf(g) === "ratchet" && <span className="muted">Ratchet wheel, 12 teeth</span>}
                        {kindOf(g) === "pawl" && (
                          <select value={g.pawlCw ? "cw" : "ccw"} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, pawlCw: e.target.value === "cw" }))}>
                            <option value="ccw">Pawl: locks counter-clockwise</option><option value="cw">Pawl: locks clockwise</option>
                          </select>
                        )}
                        {kindOf(g) === "rocker" && <span className="muted">Rocker on this pin</span>}
                        <button type="button" onClick={() => updatePin(selPin!.id, p => { const gears = p.gears.filter(x => x.level !== level); return gears.length ? { ...p, gears } : null; })}>Remove</button>
                      </div>
                      {kindOf(g) === "rocker" && g.rocker && (
                        <div className="row">
                          <label className="field"><span className="field-label">Crank on pin</span>
                            <select value={g.rocker.crank} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, rocker: { ...x.rocker!, crank: e.target.value } }))}>
                              {crankPins.map(p => <option key={p.id} value={p.id}>socket {p.x + 1}, {p.y + 1}</option>)}
                            </select>
                          </label>
                          <label className="field"><span className="field-label">Coupler holes</span>
                            <select value={g.rocker.coupler} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, rocker: { ...x.rocker!, coupler: Number(e.target.value) } }))}>{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
                          </label>
                          <label className="field"><span className="field-label">Rocker holes</span>
                            <select value={g.rocker.holes} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, rocker: { ...x.rocker!, holes: Number(e.target.value) } }))}>{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
                          </label>
                        </div>
                      )}
                      {kindOf(g) === "pulley" && (
                        <div className="row">
                          <label className="field"><span className="field-label">Band to</span>
                            <select value={band ? (band.a.pin === selPin!.id ? band.b.pin : band.a.pin) : ""} onChange={e => setBand(selPin!.id, level, e.target.value || null, band?.crossed)}>
                              <option value="">no band</option>
                              {pulleysAt(level, selPin!.id).map(p => <option key={p.id} value={p.id}>pulley at {p.x + 1}, {p.y + 1}</option>)}
                            </select>
                          </label>
                          {band && <label className="check"><input type="checkbox" checked={band.crossed} onChange={e => setBand(selPin!.id, level, band.a.pin === selPin!.id ? band.b.pin : band.a.pin, e.target.checked)} /> crossed</label>}
                        </div>
                      )}
                      <div className="row">
                        {level > 1 && gearAt(selPin!, level - 1) && kindOf(g) !== "pawl" && kindOf(g) !== "rocker" && (
                          <label className="check"><input type="checkbox" checked={g.joined} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, joined: e.target.checked }))} /> joined to level {level - 1}</label>
                        )}
                        {(kindOf(g) === "gear" || kindOf(g) === "pulley" || kindOf(g) === "ratchet") && <label className="check"><input type="radio" name="input" checked={isInput} onChange={() => setInput(selPin!.id, level)} /> input</label>}
                      </div>
                      {isTop && (kindOf(g) === "gear" || kindOf(g) === "pulley" || kindOf(g) === "ratchet") && (
                        <div className="row">
                          <label className="field"><span className="field-label">On its top face</span>
                            <select value={g.topper ?? ""} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, topper: (e.target.value || undefined) as Gear["topper"], throw: e.target.value === "crank" ? x.throw ?? 2 * d.grid : x.throw }))}>
                              <option value="">nothing</option><option value="crank">crank</option><option value="pointer">pointer and dial knob</option>
                            </select>
                          </label>
                          {g.topper === "crank" && (
                            <label className="field"><span className="field-label">Throw</span>
                              <select value={g.throw ?? 2 * d.grid} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, throw: Number(e.target.value) }))}>{THROWS.map(t => <option key={t} value={t}>{t} mm</option>)}</select>
                            </label>
                          )}
                        </div>
                      )}
                      {g.topper === "crank" && <p className="hint">A handle rides the post, or a rocker on another pin at level {crankLinkLevel(level)} follows it through a coupler link.</p>}
                    </div>
                  ) : (
                    <div className="row">
                      <select value={newKind} onChange={e => setNewKind(e.target.value as ItemKind)}>{KINDS.map(kd => <option key={kd.id} value={kd.id} disabled={kd.id === "rocker" && !crankPins.length}>{kd.label}</option>)}</select>
                      {(newKind === "gear" || newKind === "pulley") && <select value={newTeeth} onChange={e => setNewTeeth(Number(e.target.value) as Teeth)}>{TEETH.map(t => <option key={t} value={t}>{newKind === "gear" ? `${t} teeth` : `P${t}`}</option>)}</select>}
                      <button type="button" onClick={() => addItem(level)}>Add</button>
                    </div>
                  )}
                </div>
              );
            })}
            {!selPin && <div className="form"><button type="button" onClick={addMotor}>Put an N20 motor here</button></div>}
            {selPin && <button type="button" className="link" onClick={() => { updatePin(selPin.id, () => null); setSelected(null); }}>Remove pin</button>}
            {analysis.problems.filter(p => p.pin === selPin?.id).map((p, i) => <p key={i} className="err">{p.text}</p>)}
          </>
        )}
      </aside>
    </div>
  );
}
