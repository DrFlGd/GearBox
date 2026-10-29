import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { gearGeometry } from "./gearShape";
import { boardH, boardW, gearZ, socketPos, std, topLevel, type Layout } from "./model";
import { key, type Analysis } from "./rules";

export type Pick = { kind: "socket"; i: number; j: number } | { kind: "gear"; pin: string; level: number } | null;

type Props = {
  layout: Layout; analysis: Analysis; selected: { pin?: string; i: number; j: number } | null;
  playing: boolean; onPick: (p: Pick) => void; onHover: (p: Pick) => void;
};

const COLORS = { driven: 0xe8b44c, idle: 0x7a8296, collide: 0xff6b62, input: 0x7ee787, board: 0x2b3240, boardTop: 0x343c4c, socket: 0x171a21, socketHover: 0xe8b44c, bolt: 0xb8bec9, knob: 0xd9dde5, select: 0x58a6ff };

/** The virtual board: tiles, sockets, bolts, gears; click to pick, animated when playing. */
export default function BoardView({ layout, analysis, selected, playing, onPick, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    group: THREE.Group; gears: THREE.Mesh[]; sockets: THREE.InstancedMesh | null; socketIndex: { i: number; j: number }[];
    theta: number; last: number; playing: boolean; rpm: number; hoverIdx: number; fittedFor: string;
  } | null>(null);
  const cb = useRef({ onPick, onHover });
  cb.current = { onPick, onHover };

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5); keyLight.position.set(80, -120, 200); scene.add(keyLight);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.5); fill.position.set(-120, 60, 60); scene.add(fill);
    const group = new THREE.Group(); scene.add(group);
    const s = { renderer, scene, camera, controls, group, gears: [] as THREE.Mesh[], sockets: null as THREE.InstancedMesh | null, socketIndex: [] as { i: number; j: number }[], theta: 0, last: performance.now(), playing: false, rpm: 10, hoverIdx: -1, fittedFor: "" };
    st.current = s;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pickAt = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hitsG = ray.intersectObjects(s.gears, false);
      if (hitsG.length) { const u = hitsG[0].object.userData as { pin: string; level: number }; return { kind: "gear", pin: u.pin, level: u.level } as Pick; }
      if (s.sockets) {
        const hs = ray.intersectObject(s.sockets, false);
        if (hs.length && hs[0].instanceId !== undefined) { const ij = s.socketIndex[hs[0].instanceId]; return { kind: "socket", i: ij.i, j: ij.j } as Pick; }
      }
      return null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY }; };
    const onUp = (ev: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (moved < 4) cb.current.onPick(pickAt(ev));
    };
    let hoverPick: string = "";
    const onMove = (ev: PointerEvent) => {
      const p = pickAt(ev);
      const k = JSON.stringify(p);
      if (k === hoverPick) return;
      hoverPick = k;
      cb.current.onHover(p);
      const idx = p?.kind === "socket" ? s.socketIndex.findIndex(ij => ij.i === p.i && ij.j === p.j) : -1;
      if (s.sockets && idx !== s.hoverIdx) {
        if (s.hoverIdx >= 0) s.sockets.setColorAt(s.hoverIdx, new THREE.Color(COLORS.socket));
        if (idx >= 0) s.sockets.setColorAt(idx, new THREE.Color(COLORS.socketHover));
        s.sockets.instanceColor!.needsUpdate = true;
        s.hoverIdx = idx;
      }
      renderer.domElement.style.cursor = p ? "pointer" : "";
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);

    let raf = 0;
    const loop = (now: number) => {
      const dt = (now - s.last) / 1000; s.last = now;
      if (s.playing) s.theta += (s.rpm * 2 * Math.PI / 60) * dt;
      for (const g of s.gears) { const u = g.userData as { speed: number; phase: number }; g.rotation.z = u.phase + u.speed * s.theta; }
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      el.removeChild(renderer.domElement); st.current = null;
    };
  }, []);

  useEffect(() => { const s = st.current; if (s) { s.playing = playing; s.rpm = layout.rpm; } }, [playing, layout.rpm]);

  // rebuild the scene objects when the layout or its analysis changes
  useEffect(() => {
    const s = st.current; if (!s) return;
    const d = std(layout.size);
    s.group.clear(); s.gears = []; s.sockets = null; s.socketIndex = []; s.hoverIdx = -1;
    const W = boardW(layout), H = boardH(layout), g = d.grid;
    // tiles
    const tileMat = new THREE.MeshStandardMaterial({ color: COLORS.board, roughness: 0.9 });
    const topMat = new THREE.MeshStandardMaterial({ color: COLORS.boardTop, roughness: 0.9 });
    for (let c = 0; c < layout.tiles.cols; c++) for (let r = 0; r < layout.tiles.rows; r++) {
      const tw = layout.tile.nx * g, th = layout.tile.ny * g;
      const box = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.6, th - 0.6, d.tile_h), [tileMat, tileMat, tileMat, tileMat, topMat, tileMat]);
      box.position.set(c * tw + tw / 2, r * th + th / 2, d.tile_h / 2);
      s.group.add(box);
    }
    // sockets
    const n = W * H;
    const sockGeo = new THREE.CircleGeometry(Number(d.bolt.slice(1)) / 2 + 0.3, 20);
    const sockets = new THREE.InstancedMesh(sockGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const m4 = new THREE.Matrix4();
    let idx = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const p = socketPos(layout, i, j);
      m4.makeTranslation(p.x, p.y, d.tile_h + 0.05);
      sockets.setMatrixAt(idx, m4);
      sockets.setColorAt(idx, new THREE.Color(COLORS.socket));
      s.socketIndex.push({ i, j });
      idx++;
    }
    sockets.instanceMatrix.needsUpdate = true;
    if (sockets.instanceColor) sockets.instanceColor.needsUpdate = true;
    s.group.add(sockets); s.sockets = sockets;
    // pins and gears
    const boltR = Number(d.bolt.slice(1)) / 2;
    const boltMat = new THREE.MeshStandardMaterial({ color: COLORS.bolt, metalness: 0.6, roughness: 0.35 });
    const knobMat = new THREE.MeshStandardMaterial({ color: COLORS.knob, roughness: 0.6 });
    const inputKey = layout.input ? key(layout.input.pin, layout.input.level) : "";
    const collide = new Set<string>();
    for (const p of analysis.pairs) if (p.kind === "collide") { collide.add(key(p.a.pin, p.a.gear.level)); collide.add(key(p.b.pin, p.b.gear.level)); }
    for (const h of analysis.hits) collide.add(key(h.gear.pin, h.gear.gear.level));
    for (const pin of layout.pins) {
      const pos = socketPos(layout, pin.x, pin.y);
      const top = topLevel(pin);
      const hasGears = top > 0;
      const topZ = hasGears ? gearZ(layout.size, top) + d.gear_thickness + 3 : d.tile_h + 3;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(boltR, boltR, topZ - d.tile_h + 2, 16), boltMat);
      bolt.rotation.x = Math.PI / 2; bolt.position.set(pos.x, pos.y, (topZ + d.tile_h) / 2 + 1);
      s.group.add(bolt);
      const knobH = 8;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(d.knob_d / 2, d.knob_d / 2, knobH, 24), knobMat);
      knob.rotation.x = Math.PI / 2; knob.position.set(pos.x, pos.y, topZ + knobH / 2);
      s.group.add(knob);
      if (selected?.pin === pin.id) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(d.knob_d / 2 + 1, d.knob_d / 2 + 3, 32), new THREE.MeshBasicMaterial({ color: COLORS.select, side: THREE.DoubleSide }));
        ring.position.set(pos.x, pos.y, d.tile_h + 0.1); s.group.add(ring);
      }
      for (const gear of pin.gears) {
        const k = key(pin, gear.level);
        const speed = analysis.speed.get(k) ?? 0;
        const color = collide.has(k) ? COLORS.collide : k === inputKey ? COLORS.input : speed ? COLORS.driven : COLORS.idle;
        const mesh = new THREE.Mesh(gearGeometry(gear.teeth, d.module, d.gear_thickness, Number(d.bearing.split(" ")[0]) === 608 ? 11 : 8.5), new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true }));
        mesh.position.set(pos.x, pos.y, gearZ(layout.size, gear.level));
        mesh.userData = { pin: pin.id, level: gear.level, speed, phase: analysis.phase.get(k) ?? 0 };
        s.group.add(mesh); s.gears.push(mesh);
      }
    }
    // selected empty socket
    if (selected && !selected.pin) {
      const p = socketPos(layout, selected.i, selected.j);
      const ring = new THREE.Mesh(new THREE.RingGeometry(boltR + 1, boltR + 3, 32), new THREE.MeshBasicMaterial({ color: COLORS.select, side: THREE.DoubleSide }));
      ring.position.set(p.x, p.y, d.tile_h + 0.1); s.group.add(ring);
    }
    // camera fit when the board size changes
    const fitKey = `${layout.size}:${W}x${H}`;
    if (s.fittedFor !== fitKey) {
      s.fittedFor = fitKey;
      const cx = (W * g) / 2, cy = (H * g) / 2;
      const radius = Math.hypot(cx, cy);
      const dist = (radius / Math.sin((s.camera.fov * Math.PI) / 360)) * 1.15;
      s.controls.target.set(cx, cy, 10);
      s.camera.position.set(cx, cy - dist * 0.55, dist * 0.85);
      s.camera.near = Math.max(0.1, dist / 100); s.camera.far = dist * 20; s.camera.updateProjectionMatrix();
    }
  }, [layout, analysis, selected]);

  return <div className="viewer board" ref={host} />;
}
