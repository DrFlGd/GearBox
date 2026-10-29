import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { gearGeometry, pulleyGeometry, ratchetGeometry } from "./gearShape";
import { ARM_W, boardH, boardW, crankLinkLevel, gearZ, itemR, kindOf, pointerReach, socketPos, std, topLevel, type Layout } from "./model";
import { key, motorFootprint, type Analysis, type Linkage } from "./rules";

export type Pick = { kind: "socket"; i: number; j: number } | { kind: "gear"; pin: string; level: number } | null;

type Props = {
  layout: Layout; analysis: Analysis; selected: { pin?: string; i: number; j: number } | null;
  playing: boolean; onPick: (p: Pick) => void; onHover: (p: Pick) => void;
};

const COLORS = { driven: 0xe8b44c, idle: 0x7a8296, collide: 0xff6b62, input: 0x7ee787, board: 0x2b3240, boardTop: 0x343c4c, socket: 0x171a21, socketHover: 0xe8b44c, bolt: 0xb8bec9, knob: 0xd9dde5, select: 0x58a6ff, addon: 0xc9a2ff, band: 0x3c3c3c, motor: 0x4a5568 };

type LinkAnim = { l: Linkage; crankMesh: THREE.Mesh; coupler: THREE.Mesh; rocker: THREE.Mesh; rockerPos: THREE.Vector3; crankPos: THREE.Vector3; z: number; barH: number; barW: number };

/** The virtual board: tiles, sockets, bolts, gears and add-ons; click to pick, animated when playing. */
export default function BoardView({ layout, analysis, selected, playing, onPick, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    group: THREE.Group; gears: THREE.Mesh[]; sockets: THREE.InstancedMesh | null; socketIndex: { i: number; j: number }[];
    links: LinkAnim[]; theta: number; last: number; playing: boolean; rpm: number; hoverIdx: number; fittedFor: string;
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
    const s = { renderer, scene, camera, controls, group, gears: [] as THREE.Mesh[], sockets: null as THREE.InstancedMesh | null, socketIndex: [] as { i: number; j: number }[], links: [] as LinkAnim[], theta: 0, last: performance.now(), playing: false, rpm: 10, hoverIdx: -1, fittedFor: "" };
    st.current = s;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pickAt = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hitsG = ray.intersectObjects(s.gears, true);
      if (hitsG.length) {
        let o: THREE.Object3D | null = hitsG[0].object;
        while (o && !(o.userData as { pin?: string }).pin) o = o.parent;
        if (o) { const u = o.userData as { pin: string; level: number }; return { kind: "gear", pin: u.pin, level: u.level } as Pick; }
      }
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
      for (const la of s.links) poseLinkage(la);
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
    s.group.clear(); s.gears = []; s.sockets = null; s.socketIndex = []; s.hoverIdx = -1; s.links = [];
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
    // pins and items
    const boltR = Number(d.bolt.slice(1)) / 2;
    const bearingOd = Number(d.bearing.split("x")[1]);
    const boltMat = new THREE.MeshStandardMaterial({ color: COLORS.bolt, metalness: 0.6, roughness: 0.35 });
    const knobMat = new THREE.MeshStandardMaterial({ color: COLORS.knob, roughness: 0.6 });
    const addonMat = new THREE.MeshStandardMaterial({ color: COLORS.addon, roughness: 0.6 });
    const motorMat = new THREE.MeshStandardMaterial({ color: COLORS.motor, roughness: 0.7 });
    const inputKey = layout.input ? key(layout.input.pin, layout.input.level) : "";
    const collide = new Set<string>();
    for (const p of analysis.pairs) if (p.kind === "collide") { collide.add(key(p.a.pin, p.a.gear.level)); collide.add(key(p.b.pin, p.b.gear.level)); }
    for (const h of analysis.hits) collide.add(key(h.gear.pin, h.gear.gear.level));
    for (const pr of analysis.problems) if (pr.pin && pr.level) collide.add(key(pr.pin, pr.level));
    const meshes = new Map<string, THREE.Mesh>();
    const armW = ARM_W(layout.size);
    for (const pin of layout.pins) {
      const pos = socketPos(layout, pin.x, pin.y);
      const top = topLevel(pin);
      const hasGears = top > 0;
      const topZ = hasGears ? gearZ(layout.size, top) + d.gear_thickness + 3 : d.tile_h + 3;
      if (pin.motor) {
        // the mount: legs, block, cradle and the motor body
        const lv = pin.gears[0]?.level ?? 1;
        const fp = motorFootprint(layout, pin);
        const Hm = gearZ(layout.size, lv) + d.gear_thickness + 1.5 + 2.5 - d.tile_h;
        for (const leg of fp.legs) {
          const legM = new THREE.Mesh(new THREE.CylinderGeometry(leg.r, leg.r, Hm, 20), motorMat);
          legM.rotation.x = Math.PI / 2; legM.position.set(pos.x + leg.x, pos.y + leg.y, d.tile_h + Hm / 2); s.group.add(legM);
        }
        const shape = new THREE.Shape(fp.corners.map(c => new THREE.Vector2(c.x, c.y)));
        const block = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Hm, bevelEnabled: false }), motorMat);
        block.position.set(pos.x, pos.y, d.tile_h); s.group.add(block);
        const dir = pin.motor.dir;
        const mid = fp.corners.reduce((a, c) => ({ x: a.x + c.x / 4, y: a.y + c.y / 4 }), { x: 0, y: 0 });
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(fp.cradleR * 2 - 2, Math.hypot(mid.x, mid.y), 2.5), motorMat);
        tongue.position.set(pos.x + mid.x / 2, pos.y + mid.y / 2, d.tile_h + Hm - 1.25); tongue.rotation.z = (dir * Math.PI) / 2; s.group.add(tongue);
        const body = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 24), new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.4, roughness: 0.4 }));
        body.position.set(pos.x, pos.y, d.tile_h + Hm + 12); body.rotation.z = (dir * Math.PI) / 2; s.group.add(body);
      } else {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(boltR, boltR, topZ - d.tile_h + 2, 16), boltMat);
        bolt.rotation.x = Math.PI / 2; bolt.position.set(pos.x, pos.y, (topZ + d.tile_h) / 2 + 1);
        s.group.add(bolt);
        const topG = hasGears ? pin.gears.find(x => x.level === top) : undefined;
        const knobH = 8;
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(d.knob_d / 2, d.knob_d / 2, knobH, 24), knobMat);
        knob.rotation.x = Math.PI / 2; knob.position.set(pos.x, pos.y, topZ + knobH / 2);
        s.group.add(knob);
        if (topG?.topper === "pointer") {
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(d.dial_r, d.dial_r, 2.5, 48), knobMat);
          disc.rotation.x = Math.PI / 2; disc.position.set(pos.x, pos.y, topZ + 1.25); s.group.add(disc);
        }
      }
      if (selected?.pin === pin.id) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(d.knob_d / 2 + 1, d.knob_d / 2 + 3, 32), new THREE.MeshBasicMaterial({ color: COLORS.select, side: THREE.DoubleSide }));
        ring.position.set(pos.x, pos.y, d.tile_h + 0.1); s.group.add(ring);
      }
      for (const gear of pin.gears) {
        const k = key(pin, gear.level);
        const speed = analysis.speed.get(k) ?? 0;
        const kind = kindOf(gear);
        const color = collide.has(k) ? COLORS.collide : k === inputKey ? COLORS.input : speed ? COLORS.driven : kind === "gear" || kind === "pulley" || kind === "ratchet" ? COLORS.idle : COLORS.addon;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true });
        const z = gearZ(layout.size, gear.level);
        let mesh: THREE.Mesh;
        if (kind === "gear") mesh = new THREE.Mesh(gearGeometry(gear.teeth, d.module, d.gear_thickness, bearingOd / 2), mat);
        else if (kind === "pulley") mesh = new THREE.Mesh(pulleyGeometry(itemR(layout.size, gear), d.gear_thickness, bearingOd / 2), mat);
        else if (kind === "ratchet") mesh = new THREE.Mesh(ratchetGeometry(d.grid - 2.5, 1.6 * d.module, d.gear_thickness, bearingOd / 2), mat);
        else if (kind === "pawl") {
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(4.5 * d.module, 4.5 * d.module, d.gear_thickness, 20).rotateX(Math.PI / 2).translate(0, 0, d.gear_thickness / 2), mat);
          const a = analysis.pawls.get(k) ?? 0;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.4 * d.grid, 0.6 * d.module, d.gear_thickness), mat);
          leaf.position.set(0.8 * d.grid * Math.cos(a + 0.35), 0.8 * d.grid * Math.sin(a + 0.35), d.gear_thickness / 2); leaf.rotation.z = a + 0.9;
          mesh.add(leaf);
        } else {
          // rocker: the bar is drawn by the linkage; a hub here so it can be picked
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(itemR(layout.size, gear), itemR(layout.size, gear), d.gear_thickness, 24).rotateX(Math.PI / 2).translate(0, 0, d.gear_thickness / 2), mat);
        }
        mesh.position.set(pos.x, pos.y, z);
        mesh.userData = { pin: pin.id, level: gear.level, speed: kind === "rocker" || kind === "pawl" ? 0 : speed, phase: kind === "rocker" || kind === "pawl" ? 0 : analysis.phase.get(k) ?? 0 };
        // toppers turn with their gear
        if (gear.topper === "crank") {
          const t = gear.throw ?? 2 * d.grid;
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(16 * d.module / 2, 16 * d.module / 2, 2, 24).rotateX(Math.PI / 2), addonMat);
          hub.position.z = d.gear_thickness + 1; mesh.add(hub);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(t - d.knob_d / 2, armW, d.level + 2), addonMat);
          arm.position.set((t + d.knob_d / 2) / 2, 0, d.gear_thickness + (d.level + 2) / 2); mesh.add(arm);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(boltR, boltR, 28, 16).rotateX(Math.PI / 2), boltMat);
          post.position.set(t, 0, d.gear_thickness + d.level + 2 + 14); mesh.add(post);
          if (!analysis.linkages.some(la => la.crank.pin === pin && la.crank.gear === gear)) {
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(boltR + 3, boltR + 3, 26, 20).rotateX(Math.PI / 2), addonMat);
            grip.position.set(t, 0, d.gear_thickness + d.level + 2 + 14); mesh.add(grip);
          }
        }
        if (gear.topper === "pointer") {
          const reach = pointerReach(layout.size);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(reach - 6, 3 * d.module, 2), addonMat);
          arm.position.set((reach + 6) / 2, 0, d.gear_thickness + 1); mesh.add(arm);
        }
        s.group.add(mesh); s.gears.push(mesh); meshes.set(k, mesh);
      }
    }
    // bands: the two straight runs between a pair of pulleys
    const bandMat = new THREE.MeshStandardMaterial({ color: COLORS.band, roughness: 0.9 });
    for (const p of analysis.pairs) if (p.kind === "band") {
      const a = socketPos(layout, p.a.pin.x, p.a.pin.y), b = socketPos(layout, p.b.pin.x, p.b.pin.y);
      const ra = itemR(layout.size, p.a.gear) - 1, rb = itemR(layout.size, p.b.gear) - 1;
      const crossed = layout.bands?.some(bd => ((bd.a.pin === p.a.pin.id && bd.b.pin === p.b.pin.id) || (bd.a.pin === p.b.pin.id && bd.b.pin === p.a.pin.id)) && bd.crossed) ?? false;
      const z = gearZ(layout.size, p.a.gear.level) + d.gear_thickness / 2;
      const D = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const rb2 = crossed ? -rb : rb;
      const alpha = Math.acos(Math.max(-1, Math.min(1, (ra - rb2) / D)));
      for (const sgn of [1, -1]) {
        const ta = ang + sgn * alpha, tb = ang + sgn * alpha;
        const pa = { x: a.x + ra * Math.cos(ta), y: a.y + ra * Math.sin(ta) };
        const pb = { x: b.x + rb2 * Math.cos(tb), y: b.y + rb2 * Math.sin(tb) };
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 3), bandMat);
        seg.position.set((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, z); seg.rotation.z = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        s.group.add(seg);
      }
    }
    // linkages: coupler and rocker bars, posed every frame
    for (const la of analysis.linkages) {
      const crankMesh = meshes.get(key(la.crank.pin, la.crank.gear.level));
      if (!crankMesh) continue;
      const barH = d.gear_thickness;
      const barW = bearingOd + 6;
      const z = gearZ(layout.size, crankLinkLevel(la.crank.gear.level));
      const mkBar = (len: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(len + barW, barW, barH), addonMat); s.group.add(b); return b; };
      const coupler = mkBar(la.coupler), rocker = mkBar(la.rockerLen);
      const rp = socketPos(layout, la.rocker.pin.x, la.rocker.pin.y), cp = socketPos(layout, la.crank.pin.x, la.crank.pin.y);
      const anim: LinkAnim = { l: la, crankMesh, coupler, rocker, rockerPos: new THREE.Vector3(rp.x, rp.y, z), crankPos: new THREE.Vector3(cp.x, cp.y, z), z, barH, barW };
      poseLinkage(anim); s.links.push(anim);
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

/** Place a crank-rocker's two bars for the crank's current angle: the joint is where the
 *  coupler circle (about the crank post) meets the rocker circle (about the rocker pin). */
function poseLinkage(a: LinkAnim) {
  const th = a.crankMesh.rotation.z;
  const px = a.crankPos.x + a.l.throw * Math.cos(th), py = a.crankPos.y + a.l.throw * Math.sin(th);
  const bx = a.rockerPos.x, by = a.rockerPos.y;
  const D = Math.hypot(bx - px, by - py);
  const r1 = a.l.coupler, r2 = a.l.rockerLen;
  // circle intersection, clamped so a binding linkage still draws something
  const x = Math.max(-r1, Math.min(r1, (r1 * r1 - r2 * r2 + D * D) / (2 * D)));
  const h = Math.sqrt(Math.max(0, r1 * r1 - x * x));
  const ux = (bx - px) / D, uy = (by - py) / D;
  const jx = px + x * ux - h * uy, jy = py + x * uy + h * ux;
  const place = (bar: THREE.Mesh, x0: number, y0: number, x1: number, y1: number, z: number) => {
    bar.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); bar.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    const len = Math.hypot(x1 - x0, y1 - y0); bar.scale.x = (len + a.barW) / (bar.geometry as THREE.BoxGeometry).parameters.width;
  };
  place(a.rocker, bx, by, jx, jy, a.z + a.barH / 2);
  place(a.coupler, px, py, jx, jy, a.z + a.barH / 2 + a.barH + 2);
}
