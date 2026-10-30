import { useEffect, useMemo, useRef, useState } from "react";
import BoardView, { type Pick } from "./BoardView";
import {
  MAX_LEVEL, TEETH, addonsLayout, boardH, boardW, crankLinkLevel, drivesLayout, emptyLayout, hasScrews, MAG_COUPLE_MIN, MAG_TEETH, magnetsLayout, exampleLayout, gearAt, kindOf, mechanismsLayout, motorType, newId, pinById, springMinTeeth, std, topLevel,
  type CamKind, type Carriage, type Fixture, type Gear, type ItemKind, type Layout, type MotorType, type Pin, type Teeth,
} from "./model";
import { analyze, billOfMaterials, key, label, ratioText } from "./rules";
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
const KINDS: { id: ItemKind; label: string; needsCrank?: boolean }[] = [
  { id: "gear", label: "Gear" }, { id: "partial", label: "Partial gear" }, { id: "pulley", label: "Pulley" }, { id: "ratchet", label: "Ratchet wheel" }, { id: "pawl", label: "Pawl" },
  { id: "rocker", label: "Rocker (linkage)", needsCrank: true }, { id: "qrlever", label: "Quick-return lever", needsCrank: true },
  { id: "cam", label: "Cam" }, { id: "follower", label: "Cam follower" }, { id: "geneva", label: "Geneva driver" }, { id: "genevaWheel", label: "Geneva wheel" },
  { id: "escwheel", label: "Escape wheel" }, { id: "anchor", label: "Anchor" }, { id: "winch", label: "Winch drum" },
  { id: "carrier", label: "Planet carrier (planetary set)" }, { id: "bevel", label: "Bevel gear (to a shaft bracket)" }, { id: "wormgear", label: "Worm gear (on a shaft bracket)" }, { id: "flywheel", label: "Flywheel" },
  { id: "maggear", label: "Magnetic gear (meshes without touching)" },
];
const THROWS = [20, 30, 40, 50, 60, 70, 80];
/** Items too big for M1's 10 mm grid (the library refuses to make them in M1). */
const NOT_IN_M1 = new Set<ItemKind>(["ratchet", "pawl", "escwheel", "anchor"]);
/** Kinds that turn on their bearing (they can be the input and carry a topper). */
const TURNING = new Set<ItemKind>(["gear", "pulley", "ratchet", "partial", "geneva", "genevaWheel", "cam", "escwheel", "winch", "carrier", "bevel", "wormgear", "flywheel", "maggear"]);
/** Kinds posed by a partner rather than by the train. */
const POSED: Partial<Record<ItemKind, string>> = { rocker: "oscillates with its crank", pawl: "fixed to the board", follower: "rides its cam", anchor: "rocks with its escape wheel", qrlever: "swings with its crank post" };
const TOPPER_OK = new Set<ItemKind>(["gear", "pulley", "ratchet", "partial", "cam", "escwheel", "genevaWheel", "flywheel", "wormgear", "maggear"]);
const DIRS = ["+x (right)", "+y (up the board)", "−x (left)", "−y (down)"];

/** Phase 3 + 4: build a train on a virtual board, check it, animate it, print it. */
export default function LayoutMode({ size, profile, overrides, render, engineReady }: Props) {
  const [layout, setLayoutRaw] = useState<Layout>(() => initialLayout(size));
  const [selected, setSelected] = useState<{ i: number; j: number } | null>(null);
  const [selectedFixture, setSelectedFixture] = useState<string | null>(null);
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
  const selFix = selectedFixture ? (layout.fixtures ?? []).find(f => f.id === selectedFixture) : undefined;
  const load = (l: Layout) => { setLayoutRaw(l); setSelected(null); setSelectedFixture(null); };

  const onPick = (p: Pick) => {
    setSelectedFixture(null);
    if (!p) { setSelected(null); return; }
    if (p.kind === "socket") setSelected({ i: p.i, j: p.j });
    else if (p.kind === "fixture") { setSelected(null); setSelectedFixture(p.id); }
    else { const pin = pinById(layout, p.pin); if (pin) setSelected({ i: pin.x, j: pin.y }); }
  };

  /** Drop bands, rockers, levers and fixtures that point at things that no longer exist. */
  const tidy = (l: Layout): Layout => {
    const has = (pid: string, level: number) => { const p = pinById(l, pid); return !!p && !!gearAt(p, level); };
    const hasCrank = (pid: string) => !!pinById(l, pid)?.gears.some(o => o.topper === "crank");
    const bands = (l.bands ?? []).filter(b => has(b.a.pin, b.a.level) && has(b.b.pin, b.b.level));
    const pins = l.pins.map(p => ({ ...p, gears: p.gears.map(g => {
      if (g.rocker && !hasCrank(g.rocker.crank)) return { ...g, rocker: undefined, kind: "gear" as ItemKind };
      if (kindOf(g) === "qrlever" && (!g.crank || !hasCrank(g.crank))) return { ...g, crank: undefined, kind: "gear" as ItemKind };
      return g;
    }) }));
    const W = l.tile.nx * l.tiles.cols, H = l.tile.ny * l.tiles.rows;
    const fixtures = (l.fixtures ?? []).filter(f => f.x >= 0 && f.y >= 0 && f.x < W && f.y < H);
    const input = l.input && !has(l.input.pin, l.input.level) ? null : l.input;
    return { ...l, bands, pins, fixtures, input };
  };
  const updatePin = (id: string, f: (p: Pin) => Pin | null) => setLayout(l => tidy({ ...l, pins: l.pins.flatMap(p => (p.id === id ? (f(p) ? [f(p)!] : []) : [p])) }));
  const updateGear = (pinId: string, level: number, f: (g: Gear) => Gear) => updatePin(pinId, p => ({ ...p, gears: p.gears.map(x => (x.level === level ? f(x) : x)) }));
  const crankPins = layout.pins.filter(p => p.gears.some(g => g.topper === "crank"));
  const addItem = (level: number) => {
    if (!selected) return;
    const item: Gear = { level, teeth: newTeeth, joined: false, kind: newKind === "gear" ? undefined : newKind };
    if (newKind === "rocker" || newKind === "qrlever") {
      const crankPin = crankPins[0];
      if (!crankPin) return;
      if (newKind === "rocker") item.rocker = { crank: crankPin.id, coupler: 4, holes: 3 }; else item.crank = crankPin.id;
    }
    if (newKind === "cam") item.cam = "eccentric";
    if (newKind === "geneva" || newKind === "genevaWheel") item.slots = 6;
    if (newKind === "partial") item.keep = 0.5;
    if (newKind === "anchor") item.anchorCw = true;
    if (newKind === "ratchet" || newKind === "pawl" || newKind === "follower" || newKind === "escwheel" || newKind === "winch" || newKind === "cam" || newKind === "anchor" || newKind === "rocker" || newKind === "qrlever" || newKind === "genevaWheel") item.teeth = 20;
    if (newKind === "geneva") item.teeth = 40;
    if (newKind === "carrier") { item.teeth = 60; item.legs = "y"; }
    if (newKind === "flywheel") item.teeth = 20;
    if (newKind === "maggear") item.teeth = MAG_TEETH.includes(newTeeth) ? newTeeth : 40;
    if (newKind === "wormgear" || newKind === "bevel") item.teeth = newTeeth === 20 ? 20 : 40;
    if (selPin) updatePin(selPin.id, p => ({ ...p, gears: [...p.gears, item] }));
    else setLayout(l => ({ ...l, pins: [...l.pins, { id: newId(), x: selected.i, y: selected.j, gears: [item] }] }));
  };
  const addMotor = (type: MotorType) => {
    if (!selected || selPin) return;
    const id = newId();
    setLayout(l => ({ ...l, pins: [...l.pins, { id, x: selected.i, y: selected.j, gears: [{ level: 1, teeth: 20, joined: false }], motor: { dir: 0, type } }], input: l.input ?? { pin: id, level: 1 } }));
  };
  const addFixture = (kind: "rail" | "bracket") => {
    if (!selected || selPin) return;
    const id = newId();
    const f: Fixture = kind === "rail" ? { id, kind: "rail", x: selected.i, y: selected.j, dir: 0, n: 4, carriage: null } : { id, kind: "bracket", x: selected.i, y: selected.j, dir: 0, span: 4 };
    setLayout(l => ({ ...l, fixtures: [...(l.fixtures ?? []), f] }));
    setSelected(null); setSelectedFixture(id);
  };
  const updateFixture = (id: string, f: (x: Fixture) => Fixture | null) => setLayout(l => tidy({ ...l, fixtures: (l.fixtures ?? []).flatMap(x => (x.id === id ? (f(x) ? [f(x)!] : []) : [x])) }));
  type RailFixture = Extract<Fixture, { kind: "rail" }>;
  const updateRail = (id: string, f: (x: RailFixture) => RailFixture) => updateFixture(id, x => (x.kind === "rail" ? f(x) : x));
  const setCarriage = (id: string, kind: string) => updateFixture(id, x => {
    if (x.kind !== "rail") return x;
    const level = x.carriage && "level" in x.carriage ? x.carriage.level : 1;
    const c: Carriage | null = kind === "rack" ? { kind: "rack", len: 2, level } : kind === "yoke" ? { kind: "yoke", level, throw: 20, reach: 3 } : kind === "slider" ? { kind: "slider", level, link: 4 } : null;
    return { ...x, carriage: c };
  });
  const setInput = (pin: string, level: number) => setLayout(l => ({ ...l, input: { pin, level } }));
  const setBand = (pinId: string, level: number, to: string | null, crossed = false) => setLayout(l => {
    const bands = (l.bands ?? []).filter(b => !(b.a.pin === pinId && b.a.level === level) && !(b.b.pin === pinId && b.b.level === level));
    if (to) bands.push({ a: { pin: pinId, level }, b: { pin: to, level }, crossed });
    return { ...l, bands };
  });

  const hoverKey = hover?.kind === "gear" ? key(hover.pin, hover.level) : null;
  const hoverGear = hover?.kind === "gear" ? gearAt(pinById(layout, hover.pin)!, hover.level) : null;
  const hoverFixture = hover?.kind === "fixture" ? analysis.fixtures.find(f => f.fixture.id === hover.id) : null;

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
  const pulleysAt = (level: number, except: string) => layout.pins.filter(p => p.id !== except && p.gears.some(g => g.level === level && kindOf(g) === "pulley"));
  const bandOf = (pinId: string, level: number) => (layout.bands ?? []).find(b => (b.a.pin === pinId && b.a.level === level) || (b.b.pin === pinId && b.b.level === level));
  const carriageText = (f: typeof analysis.fixtures[number]) => {
    if (f.fixture.kind === "bracket") return `shaft bracket, ${f.drive ? "turned by a bevel gear" : "no bevel gear"}${f.wormGear ? `, worm turns a ${f.wormGear.gear.teeth}T worm gear` : ""}`;
    const c = f.fixture.carriage;
    if (!c) return "empty rail";
    const travel = `${(f.range[1] - f.range[0]).toFixed(0)} mm travel`;
    return c.kind === "rack" ? `rack, ${travel}` : c.kind === "yoke" ? `scotch yoke, ${travel}` : `crank slider, ${travel}`;
  };

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
            <button type="button" onClick={() => load(exampleLayout(size))}>1:16 example</button>
            <button type="button" onClick={() => load(addonsLayout(size))} disabled={size === "M1"} title={size === "M1" ? "laid out for M2 and M1.5" : undefined}>Add-ons sampler</button>
            <button type="button" onClick={() => load(mechanismsLayout(size))} disabled={size === "M1"} title={size === "M1" ? "laid out for M2 and M1.5" : undefined}>Mechanisms sampler</button>
            <button type="button" onClick={() => load(drivesLayout(size))} disabled={size === "M1"} title={size === "M1" ? "laid out for M2 and M1.5" : undefined}>Drives sampler</button>
            <button type="button" onClick={() => load(magnetsLayout(size))}>Magnets sampler</button>
            <button type="button" onClick={() => load(emptyLayout(size))}>Clear</button>
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
              <><b>{label(hoverGear)}</b> level {hoverGear.level}: {POSED[kindOf(hoverGear)] ?? ratioText(analysis.speed.get(hoverKey) ?? 0)}</>
            ) : hoverFixture ? (
              hoverFixture.fixture.kind === "rail" ? <><b>Slider rail</b> over {hoverFixture.fixture.n} sockets: {carriageText(hoverFixture)}</> : <><b>Shaft bracket</b>: {carriageText(hoverFixture)}</>
            ) : analysis.problems.length ? (
              <span className="err">{analysis.problems.length} problem{analysis.problems.length > 1 ? "s" : ""}: {analysis.problems[0].text}</span>
            ) : !layout.input ? (
              "Pick a gear and mark it as the input to see the train turn."
            ) : (
              <>{analysis.pairs.filter(p => p.kind === "mesh").length} meshes, {analysis.reachable.size} of {gearCount} items driven{inputGear ? ` from the ${label(inputGear)}` : ""}. Click a socket to add a pin, click an item to edit it.</>
            )}
          </span>
          <span className="legend"><i style={{ background: "#7ee787" }} /> input <i style={{ background: "#e8b44c" }} /> driven <i style={{ background: "#7a8296" }} /> free <i style={{ background: "#c9a2ff" }} /> add-on <i style={{ background: "#ff6b62" }} /> collides</span>
        </div>
        <BoardView layout={layout} analysis={analysis} selected={selected ? { ...selected, pin: selPin?.id } : null} selectedFixture={selectedFixture} playing={playing} onPick={onPick} onHover={setHover} />
      </main>

      <aside className="panel">
        {selFix?.kind === "bracket" ? (
          <>
            <h2>Shaft bracket at socket {selFix.x + 1}, {selFix.y + 1}</h2>
            <div className="form">
              <div className="row">
                <label className="field"><span className="field-label">Runs toward</span>
                  <select value={selFix.dir} onChange={e => updateFixture(selFix.id, x => ({ ...x, dir: Number(e.target.value) as Fixture["dir"] }))}>{DIRS.map((t, i) => <option key={i} value={i}>{t}</option>)}</select>
                </label>
                <label className="field"><span className="field-label">Housings apart</span>
                  <select value={selFix.span} onChange={e => updateFixture(selFix.id, x => ({ ...x, span: Number(e.target.value) }))}>{[2, 3, 4].map(n => <option key={n} value={n}>{n} sockets</option>)}</select>
                </label>
              </div>
              <p className="hint">The bracket's bar bolts into the sockets between its two housings; a bolt through the housings' bearings is the shaft, at the middle of level 4. A bevel gear on a pin two sockets before the first housing, on the bracket's row, turns the shaft through its mate. A worm gear on level 4 beside the middle of the bar (20T two rows out, 40T three) is turned by the worm on the shaft.</p>
              <button type="button" className="link" onClick={() => { updateFixture(selFix.id, () => null); setSelectedFixture(null); }}>Remove bracket</button>
              {analysis.problems.filter(p => p.fixture === selFix.id).map((p, i) => <p key={i} className="err">{p.text}</p>)}
            </div>
          </>
        ) : selFix ? (
          <>
            <h2>Slider rail at socket {selFix.x + 1}, {selFix.y + 1}</h2>
            <div className="form">
              <div className="row">
                <label className="field"><span className="field-label">Runs toward</span>
                  <select value={selFix.dir} onChange={e => updateFixture(selFix.id, x => ({ ...x, dir: Number(e.target.value) as Fixture["dir"] }))}>{DIRS.map((t, i) => <option key={i} value={i}>{t}</option>)}</select>
                </label>
                <label className="field"><span className="field-label">Sockets</span>
                  <select value={selFix.n} onChange={e => updateFixture(selFix.id, x => ({ ...x, n: Number(e.target.value) }))}>{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}</select>
                </label>
              </div>
              <label className="field"><span className="field-label">Carriage</span>
                <select value={selFix.carriage?.kind ?? ""} onChange={e => setCarriage(selFix.id, e.target.value)}>
                  <option value="">none</option><option value="rack">rack, driven by a gear</option><option value="yoke">scotch yoke, driven by a crank</option><option value="slider">crank slider, driven by a crank through a link</option>
                </select>
              </label>
              {selFix.carriage && (
                <div className="row">
                  <label className="field"><span className="field-label">{selFix.carriage.kind === "rack" ? "Teeth at level" : "Crank gear on level"}</span>
                    <select value={selFix.carriage.level} onChange={e => updateRail(selFix.id, x => ({ ...x, carriage: { ...x.carriage!, level: Number(e.target.value) } }))}>{[1, 2].map(n => <option key={n} value={n}>level {n}</option>)}</select>
                  </label>
                  {selFix.carriage.kind === "rack" && (
                    <label className="field"><span className="field-label">Length</span>
                      <select value={selFix.carriage.len} onChange={e => updateRail(selFix.id, x => ({ ...x, carriage: { ...(x.carriage as Carriage & { kind: "rack" }), len: Number(e.target.value) } }))}>{[2, 3, 4].map(n => <option key={n} value={n}>{n} steps · {n * d.grid} mm</option>)}</select>
                    </label>
                  )}
                  {selFix.carriage.kind === "yoke" && (
                    <>
                      <label className="field"><span className="field-label">Crank throw</span>
                        <select value={selFix.carriage.throw} onChange={e => updateRail(selFix.id, x => ({ ...x, carriage: { ...(x.carriage as Carriage & { kind: "yoke" }), throw: Number(e.target.value) } }))}>{[20, 30, 40].map(n => <option key={n} value={n}>{n} mm</option>)}</select>
                      </label>
                      <label className="field"><span className="field-label">Reach</span>
                        <select value={selFix.carriage.reach} onChange={e => updateRail(selFix.id, x => ({ ...x, carriage: { ...(x.carriage as Carriage & { kind: "yoke" }), reach: Number(e.target.value) } }))}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} steps</option>)}</select>
                      </label>
                    </>
                  )}
                  {selFix.carriage.kind === "slider" && (
                    <label className="field"><span className="field-label">Link holes</span>
                      <select value={selFix.carriage.link} onChange={e => updateRail(selFix.id, x => ({ ...x, carriage: { ...(x.carriage as Carriage & { kind: "slider" }), link: Number(e.target.value) } }))}>{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
                    </label>
                  )}
                </div>
              )}
              <p className="hint">The rail bolts into the sockets at both ends of the row beside it (its left, looking along it). A rack's pinion sits on the far side, two rows away for a 20T and three for a 40T, on the rack's level. A yoke or slider takes a crank on the rail's own row past its end, on a gear at the carriage's level; the arm then rides two levels above that gear.</p>
              <button type="button" className="link" onClick={() => { updateFixture(selFix.id, () => null); setSelectedFixture(null); }}>Remove rail</button>
              {analysis.problems.filter(p => p.fixture === selFix.id).map((p, i) => <p key={i} className="err">{p.text}</p>)}
            </div>
          </>
        ) : !selected ? (
          <>
            <h2>Layout</h2>
            <p className="blurb">Click a socket on the board to add a pin and an item. Click an item to change it, stack another level on it, or make it the input.</p>
            <p className="hint">Two gears on the same level mesh when their tooth counts add up to a multiple of 20 and their pins are that many twentieths apart: 20T+20T two sockets apart, 20T+40T three, 40T+40T four, 20T+80T five (straight, or on a 3-4-5 diagonal).</p>
            <p className="hint">Join a stacked item to the one below it to carry motion to another level: a bigger gear below a smaller one becomes one compound part, any other pair is held by three steel dowel pins, plus three M3 screws through a joint ring when both are big enough (30T and up). Two plain 40T or bigger gears can be joined by magnets instead, through a fixed barrier.</p>
            <p className="hint">Add-ons: a pulley takes a band to any other pulley on its level (cross it to reverse). A ratchet wants its pawl two sockets away along the grid. A crank on a gear's top face turns a handle, or drives a rocker on another pin two levels up through a coupler link. A pointer reads the dial knob on its own pin. A motor sits on a socket with its mount's legs at (−1, 2) and (1, 2).</p>
            <p className="hint">Drives: a planet carrier (a 60T gear with four posts) takes a plain 20T sun on the level above it, inside a ring gear whose legs bolt in four sockets away on either side; sun in, carrier out, 4:1. A bevel gear on level 1 turns a shaft bracket's shaft; the worm on the shaft turns a worm gear on level 4. A NEMA 17 sits on a socket with its mount's legs at (−2, 0) and (2, 0). A flywheel is a heavy disc on any pin.</p>
            <p className="hint">Magnets: a magnetic gear has its magnets standing in the rim, poles alternating, and turns another magnetic gear across a 1 mm gap like a spur gear 2.5 times its magnet count (16 magnets = 40T), so the same spacing rule applies. It slips instead of stalling. It collides with toothed gears.</p>
            <p className="hint">Mechanisms: a cam wants its follower two sockets away on its level. A Geneva driver (a 40T with a post and a locking crescent one level up) indexes a Geneva wheel three sockets away, one level above it. An escape wheel wants its anchor two sockets away. A quick-return lever on a crank's row, two levels above its gear, swings with the crank post. A partial gear drives in bursts. A wind-up spring sits on a plain gear of {springMinTeeth(layout.size)}T or more. A slider rail bolts to the board and carries a rack, a scotch yoke or a crank slider.</p>
            {analysis.problems.length > 0 && <ul className="problems">{analysis.problems.map((p, i) => <li key={i} className="err">{p.text}</li>)}</ul>}
          </>
        ) : (
          <>
            <h2>Socket {selected.i + 1}, {selected.j + 1} {selPin && <span className="muted">{selPin.motor ? (motorType(selPin) === "nema17" ? "NEMA 17 motor" : "N20 motor") : `pin, ${d.bolt} × ${d.bolt_lengths[String(Math.max(1, topLevel(selPin)))]} mm`}</span>}</h2>
            {selPin?.motor && (
              <div className="form">
                <label className="field"><span className="field-label">Motor</span>
                  <select value={motorType(selPin)} onChange={e => updatePin(selPin.id, p => ({ ...p, motor: { ...p.motor!, type: e.target.value as MotorType } }))}>
                    <option value="n20">N20 gearmotor, legs at (−1, 2) and (1, 2)</option><option value="nema17">NEMA 17 stepper, legs at (−2, 0) and (2, 0)</option>
                  </select>
                </label>
                <label className="field"><span className="field-label">Pinion level</span>
                  <select value={selPin.gears[0]?.level ?? 1} onChange={e => updatePin(selPin.id, p => ({ ...p, gears: [{ ...p.gears[0], level: Number(e.target.value) }] }))}>{[1, 2, 3].map(n => <option key={n} value={n}>level {n}</option>)}</select>
                </label>
                <label className="field"><span className="field-label">Legs toward</span>
                  <select value={selPin.motor.dir} onChange={e => updatePin(selPin.id, p => ({ ...p, motor: { ...p.motor!, dir: Number(e.target.value) as 0 | 1 | 2 | 3 } }))}>
                    {(motorType(selPin) === "nema17" ? ["±x (left and right)", "±y (up and down)", "±x (left and right)", "±y (up and down)"] : ["+y (up the board)", "−x (left)", "−y (down)", "+x (right)"]).map((t, i) => <option key={i} value={i}>{t}</option>)}
                  </select>
                </label>
                <label className="check"><input type="radio" name="input" checked={layout.input?.pin === selPin.id} onChange={() => setInput(selPin.id, selPin.gears[0].level)} /> input</label>
                <p className="hint">The 20T pinion meshes like any gear; nothing can sit under the mount's legs and arms.</p>
              </div>
            )}
            {!selPin?.motor && [1, 2, 3, 4].slice(0, MAX_LEVEL).map(level => {
              const g = selPin && gearAt(selPin, level);
              const k = selPin ? key(selPin, level) : "";
              const isInput = layout.input?.pin === selPin?.id && layout.input?.level === level;
              const isTop = !!selPin && topLevel(selPin) === level;
              const band = selPin ? bandOf(selPin.id, level) : undefined;
              const kind = g ? kindOf(g) : "gear";
              return (
                <div key={level} className="level">
                  <div className="level-head"><b>Level {level}</b>{g && <span className="muted">{isInput ? " input" : TURNING.has(kind) ? ` ${ratioText(analysis.speed.get(k) ?? 0)}` : ""}</span>}</div>
                  {g ? (
                    <div className="form">
                      <div className="row">
                        {(kind === "gear" || kind === "partial") && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            {TEETH.map(t => <option key={t} value={t}>{t} teeth · {d.module * t} mm</option>)}
                          </select>
                        )}
                        {kind === "partial" && (
                          <select value={g.keep ?? 0.5} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, keep: Number(e.target.value) as 0.5 | 0.25 }))}>
                            <option value={0.5}>half toothed</option><option value={0.25}>quarter toothed</option>
                          </select>
                        )}
                        {kind === "pulley" && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            {TEETH.map(t => <option key={t} value={t}>P{t} pulley · {d.module * t} mm</option>)}
                          </select>
                        )}
                        {kind === "ratchet" && <span className="muted">Ratchet wheel, 12 teeth</span>}
                        {kind === "pawl" && (
                          <select value={g.pawlCw ? "cw" : "ccw"} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, pawlCw: e.target.value === "cw" }))}>
                            <option value="ccw">Pawl: locks counter-clockwise</option><option value="cw">Pawl: locks clockwise</option>
                          </select>
                        )}
                        {kind === "rocker" && <span className="muted">Rocker on this pin</span>}
                        {kind === "cam" && (
                          <select value={g.cam ?? "eccentric"} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, cam: e.target.value as CamKind }))}>
                            <option value="eccentric">Eccentric cam (sine lift)</option><option value="heart">Heart cam (even rise and fall)</option><option value="snail">Snail cam (slow rise, drop)</option>
                          </select>
                        )}
                        {kind === "follower" && <span className="muted">Follower arm, nose on the cam</span>}
                        {(kind === "geneva" || kind === "genevaWheel") && (
                          <select value={g.slots ?? 6} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, slots: Number(e.target.value) as 6 | 8 }))}>
                            <option value={6}>{kind === "geneva" ? "Geneva driver" : "Geneva wheel"}, 6 slots</option><option value={8}>{kind === "geneva" ? "Geneva driver" : "Geneva wheel"}, 8 slots</option>
                          </select>
                        )}
                        {kind === "escwheel" && <span className="muted">Escape wheel, 15 teeth</span>}
                        {kind === "anchor" && (
                          <select value={g.anchorCw === false ? "ccw" : "cw"} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, anchorCw: e.target.value === "cw" }))}>
                            <option value="cw">Anchor for a clockwise wheel</option><option value="ccw">Anchor for a counter-clockwise wheel (ANCHOR-L)</option>
                          </select>
                        )}
                        {kind === "winch" && <span className="muted">Winch drum, two levels</span>}
                        {kind === "carrier" && (
                          <select value={g.legs ?? "y"} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, legs: e.target.value as "x" | "y" }))}>
                            <option value="y">Planet carrier, ring legs up and down</option><option value="x">Planet carrier, ring legs left and right</option>
                          </select>
                        )}
                        {kind === "bevel" && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            <option value={20}>Bevel gear on a 20T spur</option><option value={40}>Bevel gear on a 40T spur</option>
                          </select>
                        )}
                        {kind === "wormgear" && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            <option value={20}>Worm gear 20T, two rows from the shaft</option><option value={40}>Worm gear 40T, three rows from the shaft</option>
                          </select>
                        )}
                        {kind === "flywheel" && <span className="muted">Flywheel, {2 * d.grid - 2.5} mm radius</span>}
                        {kind === "maggear" && (
                          <select value={g.teeth} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, teeth: Number(e.target.value) as Teeth }))}>
                            {MAG_TEETH.filter(t => layout.size !== "M1" || t >= 40).map(t => <option key={t} value={t}>{t / 2.5} magnets · turns like a {t}T</option>)}
                          </select>
                        )}
                        {kind === "qrlever" && <span className="muted">Quick-return lever</span>}
                        <button type="button" onClick={() => updatePin(selPin!.id, p => { const gears = p.gears.filter(x => x.level !== level); return gears.length ? { ...p, gears } : null; })}>Remove</button>
                      </div>
                      {kind === "rocker" && g.rocker && (
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
                      {kind === "qrlever" && (
                        <label className="field"><span className="field-label">Crank on pin</span>
                          <select value={g.crank ?? ""} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, crank: e.target.value }))}>
                            {crankPins.map(p => <option key={p.id} value={p.id}>socket {p.x + 1}, {p.y + 1}</option>)}
                          </select>
                        </label>
                      )}
                      {kind === "pulley" && (
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
                        {level > 1 && gearAt(selPin!, level - 1) && !POSED[kind] && (
                          <label className="check"><input type="checkbox" checked={g.joined} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, joined: e.target.checked, coupling: e.target.checked ? x.coupling : undefined }))} /> joined to level {level - 1}</label>
                        )}
                        {g.joined && (g.coupling === "magnetic" || (kind === "gear" && kindOf(gearAt(selPin!, level - 1)!) === "gear" && g.teeth >= MAG_COUPLE_MIN && gearAt(selPin!, level - 1)!.teeth >= MAG_COUPLE_MIN)) && (
                          <label className="check"><input type="checkbox" checked={g.coupling === "magnetic"} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, coupling: e.target.checked ? "magnetic" : undefined }))} /> by magnets</label>
                        )}
                        {TURNING.has(kind) && <label className="check"><input type="radio" name="input" checked={isInput} onChange={() => setInput(selPin!.id, level)} /> input</label>}
                      </div>
                      {isTop && TOPPER_OK.has(kind) && (
                        <div className="row">
                          <label className="field"><span className="field-label">On its top face</span>
                            <select value={g.topper ?? ""} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, topper: (e.target.value || undefined) as Gear["topper"], throw: e.target.value === "crank" ? x.throw ?? 2 * d.grid : x.throw }))}>
                              <option value="">nothing</option><option value="crank">crank</option><option value="pointer">pointer and dial knob</option>
                              {kind === "gear" && g.teeth >= springMinTeeth(layout.size) && <option value="spring">wind-up spring</option>}
                            </select>
                          </label>
                          {g.topper === "crank" && (
                            <label className="field"><span className="field-label">Throw</span>
                              <select value={g.throw ?? 2 * d.grid} onChange={e => updateGear(selPin!.id, level, x => ({ ...x, throw: Number(e.target.value) }))}>{THROWS.map(t => <option key={t} value={t}>{t} mm</option>)}</select>
                            </label>
                          )}
                        </div>
                      )}
                      {g.joined && gearAt(selPin!, level - 1) && <p className="hint">{g.coupling === "magnetic"
                        ? "Six magnets in each face, a fixed barrier between them: drive one gear and the other follows, slipping instead of stalling."
                        : hasScrews(layout.size, g) && hasScrews(layout.size, gearAt(selPin!, level - 1)!) ? "Joined with three dowel pins and three M3 screws through a joint ring." : "Joined with three dowel pins (too small for the M3 screws)."}</p>}
                      {g.topper === "crank" && <p className="hint">A handle rides the post, or a rocker, a quick-return lever or a rail carriage at level {crankLinkLevel(level)} follows it.</p>}
                      {g.topper === "spring" && <p className="hint">The gear gets a wall for the spiral spring; the spring's boss grips the bearing's inner race, so the pin must not turn: wind it with the knob and let the train run down.</p>}
                    </div>
                  ) : (
                    <div className="row">
                      <select value={newKind} onChange={e => setNewKind(e.target.value as ItemKind)}>{KINDS.map(kd => <option key={kd.id} value={kd.id} disabled={(kd.needsCrank && !crankPins.length) || (layout.size === "M1" && NOT_IN_M1.has(kd.id))}>{kd.label}{layout.size === "M1" && NOT_IN_M1.has(kd.id) ? " (not in M1)" : ""}</option>)}</select>
                      {(newKind === "gear" || newKind === "pulley" || newKind === "partial" || newKind === "wormgear" || newKind === "bevel") && <select value={newTeeth} onChange={e => setNewTeeth(Number(e.target.value) as Teeth)}>{(newKind === "wormgear" || newKind === "bevel" ? [20, 40] as Teeth[] : TEETH).map(t => <option key={t} value={t}>{newKind === "pulley" ? `P${t}` : `${t} teeth`}</option>)}</select>}
                      <button type="button" onClick={() => addItem(level)}>Add</button>
                    </div>
                  )}
                </div>
              );
            })}
            {!selPin && <div className="form"><div className="row"><button type="button" onClick={() => addMotor("n20")}>Put an N20 motor here</button><button type="button" onClick={() => addMotor("nema17")} disabled={layout.size === "M1"} title={layout.size === "M1" ? "not made in M1" : undefined}>Put a NEMA 17 here</button></div><div className="row"><button type="button" onClick={() => addFixture("rail")}>Start a slider rail here</button><button type="button" onClick={() => addFixture("bracket")}>Start a shaft bracket here</button></div></div>}
            {selPin && <button type="button" className="link" onClick={() => { updatePin(selPin.id, () => null); setSelected(null); }}>Remove pin</button>}
            {analysis.problems.filter(p => p.pin === selPin?.id).map((p, i) => <p key={i} className="err">{p.text}</p>)}
          </>
        )}
      </aside>
    </div>
  );
}
