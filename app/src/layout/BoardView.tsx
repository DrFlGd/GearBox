import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { studio, type Studio } from "../components/look";
import type { RealParts } from "./realParts";
import { camGeometry, escapeWheelGeometry, gearGeometry, genevaWheelGeometry, pulleyGeometry, ratchetGeometry } from "./gearShape";
import {
  ARM_W, NEMA, PLN, bearingOD, boardH, boardW, bracketDims, camR, crankLinkLevel, escDims, flyR, followerA, followerTail, gearAt, gearZ, genevaDims, itemR, kindOf, levelsUsed, lvlZ, motorType, noseR,
  boltD, magnetSize, pitchR, sz, planetaryDims, pointerReach, postD, railDims, railFrame, slotW, socketPos, springWallR, std, tipR, topLevel, winchR, type Layout,
} from "./model";
import { anchorAngle, followerAngle, sliderX, yokeX } from "./motion";
import { key, motorFootprint, type Analysis, type Linkage, type Motion } from "./rules";

export type Pick = { kind: "socket"; i: number; j: number } | { kind: "gear"; pin: string; level: number } | { kind: "fixture"; id: string } | null;

type Props = {
  layout: Layout; analysis: Analysis; selected: { pin?: string; i: number; j: number } | null; selectedFixture?: string | null;
  playing: boolean; onPick: (p: Pick) => void; onHover: (p: Pick) => void;
  /** The printed part behind each thing on the board (from the bill of materials) and where to load it. */
  real?: { items: Map<string, Record<string, string | number>>; parts: RealParts } | null;
};

/** Items drawn with their real printed part once it has loaded (the rest keep their stand-in for now). */
const REAL_ITEMS = new Set(["gear", "compound", "pulley", "flywheel", "spring_gear", "partial", "ratchet", "pawl", "cam", "follower", "geneva_driver", "geneva_wheel",
  "escape_wheel", "anchor", "qr_lever", "winch", "carrier", "bevel", "worm_gear", "mag_gear", "pinion"]);
/** Draws nothing but can still be picked: the upper gear of a compound, which the compound's own mesh shows. */
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
/** The anchor is modelled with its wheel at -y; the view's frame has the wheel at +x. */
const turned = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
const quarterTurn = (g: THREE.BufferGeometry) => { let t = turned.get(g); if (!t) { t = g.clone().rotateZ(Math.PI / 2); turned.set(g, t); } return t; };

const COLORS = { driven: 0xe8b44c, idle: 0x7a8296, collide: 0xff6b62, input: 0x7ee787, board: 0x2b3240, boardTop: 0x343c4c, socket: 0x171a21, socketHover: 0xe8b44c, bolt: 0xb8bec9, knob: 0xd9dde5, select: 0x58a6ff, addon: 0xc9a2ff, band: 0x3c3c3c, motor: 0x4a5568, rail: 0x5c6b8a, carriage: 0x8fa3c7, north: 0xd9534f, south: 0x4f7fd9 };

type LinkAnim = {
  l: Linkage; crankMesh: THREE.Mesh; coupler: THREE.Mesh; rocker: THREE.Mesh; rockerPos: THREE.Vector3; crankPos: THREE.Vector3; z: number; barH: number; barW: number;
  /** the real links (first hole at their pivot, pointing along +x) and the joint post, once loaded */
  real?: { rocker: THREE.Mesh; coupler: THREE.Mesh; joint: THREE.Mesh; zRocker: number; zCoupler: number; zJoint: number };
};
/** What the frame loop needs for a picked item: its own motion, or a fixed angle. */
type ItemData = { pin: string; level: number; motion?: Motion; fixed: number };

const cyl = (r: number, h: number, seg = 40) => new THREE.CylinderGeometry(r, r, h, Math.max(seg, 32)).rotateX(Math.PI / 2);
const cylUp = (r: number, h: number, seg = 40) => cyl(r, h, seg).translate(0, 0, h / 2);

/** The virtual board: tiles, sockets, bolts, gears, add-ons and fixtures; click to pick, animated when playing. */
export default function BoardView({ layout, analysis, selected, selectedFixture, playing, onPick, onHover, real = null }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    group: THREE.Group; gears: THREE.Object3D[]; fixtures: THREE.Object3D[]; sockets: THREE.InstancedMesh | null; socketIndex: { i: number; j: number }[];
    links: LinkAnim[]; anims: ((theta: number) => void)[]; theta: number; last: number; playing: boolean; rpm: number; hoverIdx: number; fittedFor: string; look: Studio; gen: number;
    /** > 0: the input rocks back and forth this far (radians) instead of turning, so a rack stays on its pinion */
    rock: number;
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
    const look = studio(renderer, scene);
    const group = new THREE.Group(); scene.add(group);
    const s = { renderer, scene, camera, controls, group, gears: [] as THREE.Object3D[], fixtures: [] as THREE.Object3D[], sockets: null as THREE.InstancedMesh | null, socketIndex: [] as { i: number; j: number }[], links: [] as LinkAnim[], anims: [] as ((theta: number) => void)[], theta: 0, last: performance.now(), playing: false, rpm: 10, hoverIdx: -1, fittedFor: "", look, gen: 0, rock: 0 };
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
      const hitsF = ray.intersectObjects(s.fixtures, true);
      if (hitsF.length) {
        let o: THREE.Object3D | null = hitsF[0].object;
        while (o && !(o.userData as { fixture?: string }).fixture) o = o.parent;
        if (o) return { kind: "fixture", id: (o.userData as { fixture: string }).fixture } as Pick;
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
      // with a rack on the board the input swings: full speed through the middle, easing to a stop at each end
      const th = s.rock > 0 ? s.rock * Math.sin(s.theta / s.rock) : s.theta;
      for (const g of s.gears) { const u = g.userData as ItemData; g.rotation.z = u.motion ? u.motion(th) : u.fixed; }
      for (const a of s.anims) a(th);
      for (const la of s.links) poseLinkage(la);
      controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); look.dispose(); renderer.dispose();
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
    const size = layout.size;
    const d = std(size);
    s.group.clear(); s.gears = []; s.fixtures = []; s.sockets = null; s.socketIndex = []; s.hoverIdx = -1; s.links = []; s.anims = []; s.rock = 0;
    const W = boardW(layout), H = boardH(layout), g = d.grid, T = d.gear_thickness;
    const tileBoxes: { box: THREE.Mesh; x: number; y: number }[] = [];
    const standKids = new Map<string, THREE.Object3D[]>();
    const knobs: { pin: string; knob: THREE.Mesh; x: number; y: number; z: number; dial?: THREE.Mesh }[] = [];
    // toppers riding a gear: the stand-in pieces the real crank or pointer replaces
    const toppers: { k: string; mesh: THREE.Mesh; kind: "crank" | "pointer"; hide: THREE.Object3D[]; grip?: THREE.Mesh; t: number }[] = [];
    // motor mounts, fixtures and planetary rings: the stand-in pieces each real part replaces
    const mounts: { pin: string; hide: THREE.Object3D[]; x: number; y: number; dir: number; H: number; legs: { x: number; y: number }[] }[] = [];
    const fixtureSwaps: { tag: string; hide: THREE.Object3D[]; add: (g: THREE.BufferGeometry) => void }[] = [];
    const ringSwaps: { k: string; hide: THREE.Object3D[]; x: number; y: number; turn: number }[] = [];
    // tiles
    const tileMat = new THREE.MeshStandardMaterial({ color: COLORS.board, roughness: 0.9 });
    const topMat = new THREE.MeshStandardMaterial({ color: COLORS.boardTop, roughness: 0.9 });
    for (let c = 0; c < layout.tiles.cols; c++) for (let r = 0; r < layout.tiles.rows; r++) {
      const tw = layout.tile.nx * g, th = layout.tile.ny * g;
      const box = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.6, th - 0.6, d.tile_h), [tileMat, tileMat, tileMat, tileMat, topMat, tileMat]);
      box.position.set(c * tw + tw / 2, r * th + th / 2, d.tile_h / 2);
      s.group.add(box);
      tileBoxes.push({ box, x: c * tw, y: r * th });
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
    const bearingOd = bearingOD(size), boreR = bearingOd / 2;
    const boss = d.level - (Number(d.bearing.split("x")[2]) || 7);   // a knob's boss: it presses the top of a leg or post
    const boltMat = new THREE.MeshStandardMaterial({ color: COLORS.bolt, metalness: 0.6, roughness: 0.35 });
    const northMat = new THREE.MeshStandardMaterial({ color: COLORS.north, roughness: 0.5 });
    const southMat = new THREE.MeshStandardMaterial({ color: COLORS.south, roughness: 0.5 });
    const knobMat = new THREE.MeshStandardMaterial({ color: COLORS.knob, roughness: 0.6 });
    const addonMat = new THREE.MeshStandardMaterial({ color: COLORS.addon, roughness: 0.6 });
    const motorMat = new THREE.MeshStandardMaterial({ color: COLORS.motor, roughness: 0.7 });
    const inputKey = layout.input ? key(layout.input.pin, layout.input.level) : "";
    const collide = new Set<string>();
    for (const p of analysis.pairs) if (p.kind === "collide") { collide.add(key(p.a.pin, p.a.gear.level)); collide.add(key(p.b.pin, p.b.gear.level)); }
    for (const h of analysis.hits) collide.add(key(h.gear.pin, h.gear.gear.level));
    for (const pr of analysis.problems) if (pr.pin && pr.level) collide.add(key(pr.pin, pr.level));
    const badFixtures = new Set(analysis.problems.filter(p => p.fixture).map(p => p.fixture!));
    const meshes = new Map<string, THREE.Mesh>();
    const armW = ARM_W(size);
    const drivesSomething = (pinId: string, gearLevel: number) =>
      analysis.linkages.some(la => la.crank.pin.id === pinId && la.crank.gear.level === gearLevel) ||
      [...analysis.partners.values()].some(p => p.pin.id === pinId && p.gear.level === gearLevel) ||
      analysis.fixtures.some(f => f.drive?.pin.id === pinId && f.drive.gear.level === gearLevel && f.fixture.kind === "rail" && f.fixture.carriage?.kind !== "rack");
    const planetsOf = new Map<string, THREE.Mesh[]>();
    for (const pin of layout.pins) {
      const pos = socketPos(layout, pin.x, pin.y);
      const top = topLevel(pin);
      const topG = top > 0 ? gearAt(pin, top) : undefined;
      const hasGears = top > 0;
      const used = topG ? top + levelsUsed(size, topG) - 1 : top;
      const topZ = hasGears ? gearZ(size, used) + T + 3 : d.tile_h + 3;
      if (pin.motor && motorType(pin) === "nema17") {
        // the NEMA 17 mount: two legs, two arms, the plate and the motor on it
        const lv = pin.gears[0]?.level ?? 1;
        const fp = motorFootprint(layout, pin);
        const Hm = gearZ(size, lv) + T + 1.5 + 4 - d.tile_h;
        const hide: THREE.Object3D[] = [];
        for (const leg of fp.legs) {
          const legM = new THREE.Mesh(cyl(leg.r, Hm, 20), motorMat);
          legM.position.set(pos.x + leg.x, pos.y + leg.y, d.tile_h + Hm / 2); s.group.add(legM); hide.push(legM);
        }
        for (const blk of fp.blocks) {
          const shape = new THREE.Shape(blk.map(c => new THREE.Vector2(c.x, c.y)));
          const arm = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Hm, bevelEnabled: false }), motorMat);
          arm.position.set(pos.x, pos.y, d.tile_h); s.group.add(arm); hide.push(arm);
        }
        const plate = new THREE.Mesh(new THREE.BoxGeometry(NEMA.plate, NEMA.plate, 4), motorMat);
        plate.position.set(pos.x, pos.y, d.tile_h + Hm - 2); plate.rotation.z = (pin.motor.dir * Math.PI) / 2; s.group.add(plate); hide.push(plate);
        mounts.push({ pin: pin.id, hide, x: pos.x, y: pos.y, dir: pin.motor.dir, H: Hm, legs: fp.legs });
        const body = new THREE.Mesh(new THREE.BoxGeometry(NEMA.w, NEMA.w, 40), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.5, roughness: 0.5 }));
        body.position.set(pos.x, pos.y, d.tile_h + Hm + 20); body.rotation.z = (pin.motor.dir * Math.PI) / 2; s.group.add(body);
      } else if (pin.motor) {
        // the mount: legs, block, cradle and the motor body
        const lv = pin.gears[0]?.level ?? 1;
        const fp = motorFootprint(layout, pin);
        const Hm = gearZ(size, lv) + T + 1.5 + 2.5 - d.tile_h;
        const hide: THREE.Object3D[] = [];
        for (const leg of fp.legs) {
          const legM = new THREE.Mesh(cyl(leg.r, Hm, 20), motorMat);
          legM.position.set(pos.x + leg.x, pos.y + leg.y, d.tile_h + Hm / 2); s.group.add(legM); hide.push(legM);
        }
        const shape = new THREE.Shape(fp.corners.map(c => new THREE.Vector2(c.x, c.y)));
        const block = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: Hm, bevelEnabled: false }), motorMat);
        block.position.set(pos.x, pos.y, d.tile_h); s.group.add(block); hide.push(block);
        const dir = pin.motor.dir;
        const mid = fp.corners.reduce((a, c) => ({ x: a.x + c.x / 4, y: a.y + c.y / 4 }), { x: 0, y: 0 });
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(fp.cradleR * 2 - 2, Math.hypot(mid.x, mid.y), 2.5), motorMat);
        tongue.position.set(pos.x + mid.x / 2, pos.y + mid.y / 2, d.tile_h + Hm - 1.25); tongue.rotation.z = (dir * Math.PI) / 2; s.group.add(tongue); hide.push(tongue);
        mounts.push({ pin: pin.id, hide, x: pos.x, y: pos.y, dir, H: Hm, legs: fp.legs });
        const body = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 24), new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.4, roughness: 0.4 }));
        body.position.set(pos.x, pos.y, d.tile_h + Hm + 12); body.rotation.z = (dir * Math.PI) / 2; s.group.add(body);
      } else {
        const bolt = new THREE.Mesh(cyl(boltR, topZ - d.tile_h + 2, 16), boltMat);
        bolt.position.set(pos.x, pos.y, (topZ + d.tile_h) / 2 + 1);
        s.group.add(bolt);
        const knobH = 8;
        const knob = new THREE.Mesh(cyl(d.knob_d / 2, knobH), knobMat);
        knob.position.set(pos.x, pos.y, topZ + knobH / 2);
        s.group.add(knob);
        // the real knob sits on the top bearing, as in the kit assemblies
        if (hasGears) knobs.push({ pin: pin.id, knob, x: pos.x, y: pos.y, z: d.tile_h + lvlZ(size, used) + T - 1 });
        if (topG?.topper === "pointer") {
          const disc = new THREE.Mesh(cyl(d.dial_r, 2.5, 48), knobMat);
          disc.position.set(pos.x, pos.y, topZ + 1.25); s.group.add(disc);
          knobs[knobs.length - 1].dial = disc;
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
        const plain = kind === "gear" || kind === "pulley" || kind === "ratchet" || kind === "partial" || kind === "geneva" || kind === "genevaWheel" || kind === "cam" || kind === "escwheel" || kind === "winch" || kind === "carrier" || kind === "bevel" || kind === "wormgear" || kind === "flywheel" || kind === "maggear";
        const color = collide.has(k) ? COLORS.collide : k === inputKey ? COLORS.input : speed ? COLORS.driven : plain ? COLORS.idle : COLORS.addon;
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const z = gearZ(size, gear.level);
        let mesh: THREE.Mesh;
        const hub = (r: number) => new THREE.Mesh(cylUp(r, T), mat);
        const bar = (x0: number, y0: number, x1: number, y1: number, w: number, zc: number, h = T) => {
          const b = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), w, h), mat);
          b.position.set((x0 + x1) / 2, (y0 + y1) / 2, zc); b.rotation.z = Math.atan2(y1 - y0, x1 - x0); return b;
        };
        if (kind === "gear") {
          mesh = new THREE.Mesh(gearGeometry(gear.teeth, d.module, T, boreR), mat);
          // a magnetic face coupling: dots for the magnets in the joined faces, and the barrier between
          const above = pin.gears.find(o => o.level === gear.level + 1);
          const magTop = above?.joined && above.coupling === "magnetic", magBot = gear.joined && gear.coupling === "magnetic";
          if (magTop || magBot) {
            const mr = 11 * d.module, md = magnetSize(size).d;
            for (let i = 0; i < 6; i++) {
              const dot = new THREE.Mesh(cylUp(md / 2, 0.6, 16), i % 2 ? southMat : northMat);
              dot.position.set(mr * Math.cos((i * Math.PI) / 3), mr * Math.sin((i * Math.PI) / 3), magTop ? T : -0.6); mesh.add(dot);
            }
          }
          if (magTop) {
            const br = new THREE.Mesh(cyl(11 * d.module + magnetSize(size).d / 2 + 4, 0.8, 48), new THREE.MeshStandardMaterial({ color: COLORS.rail, transparent: true, opacity: 0.55 }));
            br.position.set(pos.x, pos.y, z + T + (d.level - T) / 2); s.group.add(br);
          }
        } else if (kind === "maggear") {
          // a disc with its magnets standing in the rim, poles alternating
          const r = itemR(size, gear), n = Math.round(gear.teeth / 2.5);
          const disc = new THREE.Shape(); disc.absarc(0, 0, r, 0, 2 * Math.PI, false);
          const bore = new THREE.Path(); bore.absarc(0, 0, boreR, 0, 2 * Math.PI, true); disc.holes.push(bore);
          mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(disc, { depth: T, bevelEnabled: false, curveSegments: 48 }), mat);
          const md = magnetSize(size).d, mh = magnetSize(size).h;
          for (let i = 0; i < n; i++) {
            const a = ((i + 0.5) * 2 * Math.PI) / n;
            const pole = new THREE.Mesh(new THREE.BoxGeometry(mh, md, 0.8), i % 2 ? southMat : northMat);
            pole.position.set((r - 1 - mh / 2) * Math.cos(a), (r - 1 - mh / 2) * Math.sin(a), T + 0.2); pole.rotation.z = a; mesh.add(pole);
          }
        }
        else if (kind === "partial") mesh = new THREE.Mesh(gearGeometry(gear.teeth, d.module, T, boreR, gear.keep ?? 0.5), mat);
        else if (kind === "pulley") mesh = new THREE.Mesh(pulleyGeometry(itemR(size, gear), T, boreR), mat);
        else if (kind === "ratchet") mesh = new THREE.Mesh(ratchetGeometry(d.grid - 2.5, 1.6 * d.module, T, boreR), mat);
        else if (kind === "cam") { const ck = gear.cam ?? "eccentric"; mesh = new THREE.Mesh(camGeometry(ck, a => camR(size, ck, a), T, boreR), mat); }
        else if (kind === "escwheel") { const e = escDims(size); mesh = new THREE.Mesh(escapeWheelGeometry(e.R, e.depth, T, boreR), mat); }
        else if (kind === "genevaWheel") { const gd = genevaDims(size, gear.slots ?? 6); mesh = new THREE.Mesh(genevaWheelGeometry(gear.slots ?? 6, gd.C, gd.rim, gd.lock, gd.slotW, gd.rIn, T, boreR), mat); }
        else if (kind === "geneva") {
          // a 40T gear with the locking crescent and the drive post one level up
          const gd = genevaDims(size, gear.slots ?? 6);
          mesh = new THREE.Mesh(gearGeometry(40, d.module, T, boreR), mat);
          const rn = gd.b + 0.6, lock = gd.lock, C = gd.C;
          const phi0 = Math.acos(Math.max(-1, Math.min(1, (lock * lock + C * C - rn * rn) / (2 * lock * C))));
          const shape = new THREE.Shape();
          shape.absarc(0, 0, lock, phi0, 2 * Math.PI - phi0, false);
          const e = Math.atan2(lock * Math.sin(phi0), lock * Math.cos(phi0) - C);
          shape.absarc(C, 0, rn, -e, e, true);
          shape.closePath();
          const hole = new THREE.Path(); hole.absarc(0, 0, boreR, 0, 2 * Math.PI, true); shape.holes.push(hole);
          const crescent = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 24 }), mat);
          crescent.position.z = d.level; mesh.add(crescent);
          const post = new THREE.Mesh(cylUp(postD(size) / 2, d.level + T + 1, 16), boltMat);
          post.position.set(gd.a, 0, T); mesh.add(post);
        } else if (kind === "carrier") {
          // the 60T carrier with four posts and two planets; the ring and its legs stand still
          const pd = planetaryDims(size);
          mesh = new THREE.Mesh(gearGeometry(PLN.carrier, d.module, T, boreR), mat);
          const planets: THREE.Mesh[] = [];
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            const post = new THREE.Mesh(cylUp(postD(size) / 2, 3 + T, 16), boltMat); post.position.set(pd.R * Math.cos(a), pd.R * Math.sin(a), T); mesh.add(post);
            if (i % 2 === 0) { const pl = new THREE.Mesh(gearGeometry(PLN.planet, d.module, T, boreR), mat); pl.position.set(pd.R * Math.cos(a), pd.R * Math.sin(a), d.level); mesh.add(pl); planets.push(pl); }
          }
          planetsOf.set(k, planets);
          const ringShape = new THREE.Shape(); ringShape.absarc(0, 0, pd.ringOR, 0, 2 * Math.PI, false);
          const rh = new THREE.Path(); rh.absarc(0, 0, pd.ringIR, 0, 2 * Math.PI, true); ringShape.holes.push(rh);
          const ring = new THREE.Mesh(new THREE.ExtrudeGeometry(ringShape, { depth: T, bevelEnabled: false, curveSegments: 48 }), addonMat);
          ring.position.set(pos.x, pos.y, z + d.level); s.group.add(ring);
          // (the legs' socket head screws sit sunk in the leg tops: nothing stands over the ring)
          const rs = { k, hide: [ring] as THREE.Object3D[], x: pos.x, y: pos.y, turn: gear.legs === "x" ? Math.PI / 2 : 0 };
          ringSwaps.push(rs);
          for (const sg of [-1, 1]) {
            const [lx, ly] = gear.legs === "x" ? [sg * pd.legSteps * g, 0] : [0, sg * pd.legSteps * g];
            const legH = z + d.level + T - d.tile_h;
            const leg = new THREE.Mesh(cyl(pd.legR, legH, 20), addonMat); leg.position.set(pos.x + lx, pos.y + ly, d.tile_h + legH / 2); s.group.add(leg); rs.hide.push(leg);
            const armLen = pd.legSteps * g - pd.ringOR + 3;
            const arm = new THREE.Mesh(new THREE.BoxGeometry(gear.legs === "x" ? armLen : pd.legR * 2, gear.legs === "x" ? pd.legR * 2 : armLen, T), addonMat);
            arm.position.set(pos.x + (gear.legs === "x" ? sg * (pd.ringOR - 3 + armLen / 2) : 0), pos.y + (gear.legs === "x" ? 0 : sg * (pd.ringOR - 3 + armLen / 2)), z + d.level + T / 2); s.group.add(arm); rs.hide.push(arm);
          }
        } else if (kind === "bevel") {
          const b = bracketDims(size), pr = pitchR(size, b.bevelT), m = d.module;
          mesh = new THREE.Mesh(gearGeometry(gear.teeth, d.module, T, boreR), mat);
          const hubM = new THREE.Mesh(cylUp(boreR + 3, b.bevelHub - T), mat); hubM.position.z = T; mesh.add(hubM);
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(pr - 3.5 * m, pr + 1.5 * m, 3.8 * m, 20).rotateX(Math.PI / 2).translate(0, 0, 1.9 * m), mat);
          cone.position.z = b.bevelHub - 1.5 * m; mesh.add(cone);
        } else if (kind === "wormgear") {
          mesh = new THREE.Mesh(gearGeometry(gear.teeth, d.module, T, boreR), mat);
        } else if (kind === "flywheel") {
          mesh = new THREE.Mesh(cylUp(flyR(size), T, 48), mat);
          const rp = flyR(size) - 3 - (boltD(size) * 1.6 + 0.3) / Math.cos(Math.PI / 6) / 2;
          for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; const nut = new THREE.Mesh(cylUp(boltD(size) * 0.8, T / 2, 6), boltMat); nut.position.set(rp * Math.cos(a), rp * Math.sin(a), T / 2 + 0.1); mesh.add(nut); }
        } else if (kind === "winch") {
          const rc = boreR + 2.5, rf = winchR(size);
          mesh = new THREE.Mesh(cylUp(rf, 2, 32), mat);
          const core = new THREE.Mesh(cylUp(rc, 2 * d.level - 4, 24), mat); core.position.z = 2; mesh.add(core);
          const flange = new THREE.Mesh(cylUp(rf, 2, 32), mat); flange.position.z = 2 * d.level - 2; mesh.add(flange);
        } else if (kind === "follower") {
          mesh = hub(itemR(size, gear));
          const A = followerA(size);
          mesh.add(bar(0, 0, A, 0, armW / 2, T / 2));
          const ft = followerTail(size);
          mesh.add(bar(0, 0, -ft.post, 0, armW / 2, T / 2));
          const nose = new THREE.Mesh(cylUp(noseR(size), T), mat); nose.position.set(A, 0, 0); mesh.add(nose);
          // the output post a level tall, and the band lug beside it
          const post = new THREE.Mesh(cylUp(ft.r, d.level), mat); post.position.set(-ft.post, 0, 0); mesh.add(post);
          mesh.add(bar(-ft.post, 0, ft.band[0], ft.band[1], 6, T / 2));
        } else if (kind === "anchor") {
          mesh = hub(itemR(size, gear));
          const e = escDims(size);
          mesh.add(bar(0, 0, -e.bar, 0, armW / 2, T / 2));
          for (const sg of [1, -1]) {
            const px = e.C - e.R * Math.cos(e.alpha), py = sg * e.R * Math.sin(e.alpha);
            mesh.add(bar(0, 0, px, py, armW / 2, T / 2));
            const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.5 * d.module, 1.5 * d.module, T), mat);
            pallet.position.set(px, py, T / 2); pallet.rotation.z = Math.atan2(py, px); mesh.add(pallet);
          }
        } else if (kind === "qrlever") {
          mesh = hub(itemR(size, gear));
          const partner = analysis.partners.get(k);
          const t = partner?.gear.throw ?? 2 * g;
          const D = partner ? Math.hypot(partner.pin.x - pin.x, partner.pin.y - pin.y) * g : 3 * g;
          const sw = slotW(size), w = sw + 8;
          const r1 = Math.max(boreR + 4, D - t - sw / 2 - 1), r2 = D + t + sw / 2 + 1, rs = r2 + 4 + 3 * d.module;
          mesh.add(bar(0, 0, r1, 0, w, T / 2));
          for (const sg of [1, -1]) mesh.add(bar(r1, sg * (sw / 2 + 2), r2, sg * (sw / 2 + 2), 4, T / 2));
          mesh.add(bar(r2, 0, rs + w / 2, 0, w, T / 2));
          const boss = new THREE.Mesh(cylUp((w - 2) / 2, T + 4), mat); boss.position.set(rs, 0, 0); mesh.add(boss);
        } else if (kind === "pawl") {
          mesh = hub(4.5 * d.module);
          const a = analysis.pawls.get(k) ?? 0;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.4 * d.grid, 0.6 * d.module, T), mat);
          leaf.position.set(0.8 * d.grid * Math.cos(a + 0.35), 0.8 * d.grid * Math.sin(a + 0.35), T / 2); leaf.rotation.z = a + 0.9;
          mesh.add(leaf);
        } else {
          // rocker: the bar is drawn by the linkage; a hub here so it can be picked
          mesh = hub(itemR(size, gear));
        }
        mesh.position.set(pos.x, pos.y, z);
        standKids.set(k, [...mesh.children]);   // the stand-in's own pieces, not the toppers added below
        const posed = kind === "rocker" || kind === "pawl" || kind === "follower" || kind === "anchor" || kind === "qrlever";
        const data: ItemData = { pin: pin.id, level: gear.level, motion: posed ? undefined : analysis.motion.get(k), fixed: posed ? 0 : analysis.phase.get(k) ?? 0 };
        mesh.userData = data;
        // toppers turn with their gear
        if (gear.topper === "crank") {
          const t = gear.throw ?? 2 * d.grid;
          const ring = new THREE.Mesh(cyl(16 * d.module / 2, 2), addonMat);
          ring.position.z = T + 1; mesh.add(ring);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(t - d.knob_d / 2, armW, d.level + 2), addonMat);
          arm.position.set((t + d.knob_d / 2) / 2, 0, T + (d.level + 2) / 2); mesh.add(arm);
          const post = new THREE.Mesh(cyl(boltR, 28, 16), boltMat);
          post.position.set(t, 0, T + d.level + 2 + 14); mesh.add(post);
          if (drivesSomething(pin.id, gear.level)) {
            const brg = new THREE.Mesh(cyl(boreR, Number(d.bearing.split("x")[2]) || 7, 24), boltMat);
            brg.position.set(t, 0, 2 * d.level + T / 2); mesh.add(brg);
            toppers.push({ k, mesh, kind: "crank", hide: [ring, arm], t });
          } else {
            const grip = new THREE.Mesh(cyl(boltR + 3, 26, 20), addonMat);
            grip.position.set(t, 0, T + d.level + 2 + 14); mesh.add(grip);
            toppers.push({ k, mesh, kind: "crank", hide: [ring, arm], grip, t });
          }
        }
        if (gear.topper === "pointer") {
          const reach = pointerReach(size);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(reach - 6, 3 * d.module, 2), addonMat);
          arm.position.set((reach + 6) / 2, 0, T + 1); mesh.add(arm);
          toppers.push({ k, mesh, kind: "pointer", hide: [arm], t: 0 });
        }
        if (gear.topper === "spring") {
          // the wall on the gear and the spiral inside it
          const rw = springWallR(size), h = d.level - 2.5;
          const wall = new THREE.Shape(); wall.absarc(0, 0, rw, 0, 2 * Math.PI, false);
          const wh = new THREE.Path(); wh.absarc(0, 0, rw - 2, 0, 2 * Math.PI, true); wall.holes.push(wh);
          const wallM = new THREE.Mesh(new THREE.ExtrudeGeometry(wall, { depth: h + 2.5, bevelEnabled: false, curveSegments: 32 }), mat);
          wallM.position.z = T; mesh.add(wallM);
          const rIn = sz(size, 8, 6.5, 5), pitch = sz(size, 3.2, 2.5, 2), band = sz(size, 1.2, 1, 0.8), turns = 4.5;
          const sp = new THREE.Shape();
          const N = 180;
          for (let i = 0; i <= N; i++) { const a = (i / N) * turns * 2 * Math.PI, r = rIn + (pitch * a) / (2 * Math.PI) + band / 2; const p = [r * Math.cos(a), r * Math.sin(a)]; if (i === 0) sp.moveTo(p[0], p[1]); else sp.lineTo(p[0], p[1]); }
          for (let i = N; i >= 0; i--) { const a = (i / N) * turns * 2 * Math.PI, r = rIn + (pitch * a) / (2 * Math.PI) - band / 2; sp.lineTo(r * Math.cos(a), r * Math.sin(a)); }
          sp.closePath();
          const spiral = new THREE.Mesh(new THREE.ExtrudeGeometry(sp, { depth: h, bevelEnabled: false }), addonMat);
          spiral.position.z = T + 2; mesh.add(spiral);
          const bossM = new THREE.Mesh(cylUp(rIn, h + 2.5), addonMat); bossM.position.z = T; mesh.add(bossM);
        }
        s.group.add(mesh); s.gears.push(mesh); meshes.set(k, mesh);
      }
    }
    // partner-driven poses: a follower rides its cam, an anchor rocks with its wheel, a lever follows its crank post
    for (const pin of layout.pins) for (const gear of pin.gears) {
      const k = key(pin, gear.level);
      const kind = kindOf(gear);
      const mesh = meshes.get(k), partner = analysis.partners.get(k);
      if (!mesh || !partner) continue;
      const pm = meshes.get(key(partner.pin, partner.gear.level));
      if (!pm) continue;
      const dir = Math.atan2(partner.pin.y - pin.y, partner.pin.x - pin.x);
      if (kind === "follower") {
        const D = Math.hypot(partner.pin.x - pin.x, partner.pin.y - pin.y) * g, A = followerA(size), rn = noseR(size), ck = partner.gear.cam ?? "eccentric";
        s.anims.push(() => { mesh.rotation.z = dir + followerAngle(size, ck, pm.rotation.z - dir - Math.PI, D, A, rn); });
      } else if (kind === "anchor") {
        const ph = analysis.phase.get(key(partner.pin, partner.gear.level)) ?? 0;
        // the anchor swings with the wheel's smooth drive, one swing per tooth, at an end each time the wheel steps
        const sm = analysis.smooth.get(key(partner.pin, partner.gear.level));
        if (sm) s.anims.push(th => { mesh.rotation.z = dir + anchorAngle(sm(th) - ph, escDims(size).n, (5 * Math.PI) / 180); });
      } else if (kind === "carrier") {
        const planets = planetsOf.get(k) ?? [], ratio = PLN.sun / PLN.planet;
        s.anims.push(() => { const rel = -(pm.rotation.z - mesh.rotation.z) * ratio; planets.forEach((pl, i) => { pl.rotation.z = rel + (i * Math.PI) / PLN.planet; }); });
      } else if (kind === "qrlever") {
        const t = partner.gear.throw ?? 2 * g;
        const pp = socketPos(layout, partner.pin.x, partner.pin.y), p0 = socketPos(layout, pin.x, pin.y);
        s.anims.push(() => { const th = pm.rotation.z; mesh.rotation.z = Math.atan2(pp.y + t * Math.sin(th) - p0.y, pp.x + t * Math.cos(th) - p0.x); });
      }
    }
    // bands: the two straight runs between a pair of pulleys
    const bandMat = new THREE.MeshStandardMaterial({ color: COLORS.band, roughness: 0.9 });
    for (const p of analysis.pairs) if (p.kind === "band") {
      const a = socketPos(layout, p.a.pin.x, p.a.pin.y), b = socketPos(layout, p.b.pin.x, p.b.pin.y);
      const ra = itemR(size, p.a.gear) - 1, rb = itemR(size, p.b.gear) - 1;
      const crossed = layout.bands?.some(bd => ((bd.a.pin === p.a.pin.id && bd.b.pin === p.b.pin.id) || (bd.a.pin === p.b.pin.id && bd.b.pin === p.a.pin.id)) && bd.crossed) ?? false;
      const z = gearZ(size, p.a.gear.level) + T / 2;
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
      const barH = T;
      const barW = bearingOd + 6;
      const z = gearZ(size, crankLinkLevel(la.crank.gear.level));
      const mkBar = (len: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(len + barW, barW, barH), addonMat); s.group.add(b); return b; };
      const coupler = mkBar(la.coupler), rocker = mkBar(la.rockerLen);
      const rp = socketPos(layout, la.rocker.pin.x, la.rocker.pin.y), cp = socketPos(layout, la.crank.pin.x, la.crank.pin.y);
      const anim: LinkAnim = { l: la, crankMesh, coupler, rocker, rockerPos: new THREE.Vector3(rp.x, rp.y, z), crankPos: new THREE.Vector3(cp.x, cp.y, z), z, barH, barW };
      poseLinkage(anim); s.links.push(anim);
    }
    // fixtures: rails with their carriages, in the rail's own frame
    for (const info of analysis.fixtures) {
      const f = info.fixture;
      if (f.kind === "bracket") {
        const fr = railFrame(layout, f), b = bracketDims(size), L = fr.len, m = d.module;
        const bad = badFixtures.has(f.id);
        const railMat = new THREE.MeshStandardMaterial({ color: bad ? COLORS.collide : COLORS.rail, roughness: 0.7 });
        const grp = new THREE.Group(); grp.position.set(fr.o.x, fr.o.y, d.tile_h); grp.rotation.z = fr.angle; grp.userData = { fixture: f.id };
        const bar = new THREE.Mesh(new THREE.BoxGeometry(L + b.housingT, b.housingW, b.barT), railMat); bar.position.set(L / 2, 0, b.barT / 2); grp.add(bar);
        const bracketHide: THREE.Object3D[] = [bar];
        fixtureSwaps.push({ tag: `bracket:${f.id}`, hide: bracketHide, add: g2 => addReal(g2, railMat, 0, 0, 0, grp) });
        for (const u of [0, L]) {
          const h = new THREE.Mesh(new THREE.BoxGeometry(b.housingT, b.housingW, b.shaftH), railMat); h.position.set(u, 0, b.shaftH / 2); grp.add(h);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(b.housingW / 2, b.housingW / 2, b.housingT, 24).rotateZ(Math.PI / 2), railMat); cap.position.set(u, 0, b.shaftH); grp.add(cap);
          bracketHide.push(h, cap);
          const brg = new THREE.Mesh(new THREE.CylinderGeometry(boreR, boreR, b.housingT + 0.4, 24).rotateZ(Math.PI / 2), boltMat); brg.position.set(u, 0, b.shaftH); grp.add(brg);
        }
        for (let k2 = 1; k2 < f.span; k2++) { const head = new THREE.Mesh(cylUp(boltD(size) * 0.8, 1, 6), boltMat); head.position.set(k2 * g, 0, b.barT - 1); grp.add(head); }
        // what turns with the shaft
        const shaft = new THREE.Group(); shaft.position.set(0, 0, b.shaftH); grp.add(shaft);
        const pr = pitchR(size, b.bevelT);
        const u0 = info.drive ? -b.bevelD + pr - 3.8 * m : -b.housingT / 2 - 2;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(boltR, boltR, L + b.housingT + 4 - u0, 16).rotateZ(Math.PI / 2), boltMat); rod.position.x = (u0 + L + b.housingT + 4) / 2; shaft.add(rod);
        if (info.drive) {
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(pr + 1.5 * m, pr - 3.5 * m, 3.8 * m, 20).rotateZ(-Math.PI / 2), addonMat); cone.position.x = -b.bevelD + pr - 1.9 * m; shaft.add(cone);
          const hubL = b.bevelD - pr - b.housingT / 2 - 0.5;
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(boreR + 2.5, boreR + 2.5, hubL, 20).rotateZ(Math.PI / 2), addonMat); hub.position.x = -b.bevelD + pr + hubL / 2; shaft.add(hub);
          // the real bevel is modelled with its axis up and its teeth at the bottom
          fixtureSwaps.push({ tag: `bevelshaft:${f.id}`, hide: [cone, hub], add: g2 => addReal(g2, addonMat, -b.bevelD + pr, 0, 0, shaft, 0, -Math.PI / 2) });
          const bm = meshes.get(key(info.drive.pin, info.drive.gear.level));
          if (bm) s.anims.push(() => { shaft.rotation.x = bm.rotation.z; });
        }
        if (info.wormGear) {
          const core = new THREE.Mesh(new THREE.CylinderGeometry(b.wormD / 2 - 2.25 * m, b.wormD / 2 - 2.25 * m, b.wormL, 24).rotateZ(Math.PI / 2), addonMat); core.position.x = L / 2; shaft.add(core);
          const hubW = new THREE.Mesh(new THREE.CylinderGeometry(boreR + 2.5, boreR + 2.5, L - b.housingT - 1, 20).rotateZ(Math.PI / 2), addonMat); hubW.position.x = L / 2; shaft.add(hubW);
          const pitch = Math.PI * m, turns = b.wormL / pitch, rr = b.wormD / 2 - 1.1 * m;
          class Helix extends THREE.Curve<THREE.Vector3> { constructor() { super(); } getPoint(t: number) { const a = t * turns * 2 * Math.PI; return new THREE.Vector3(L / 2 - b.wormL / 2 + t * b.wormL, rr * Math.cos(a), rr * Math.sin(a)); } }
          const thread = new THREE.Mesh(new THREE.TubeGeometry(new Helix(), Math.round(turns * 24), 1.1 * m, 8, false), addonMat); shaft.add(thread);
          fixtureSwaps.push({ tag: `worm:${f.id}`, hide: [core, hubW, thread], add: g2 => addReal(g2, addonMat, b.housingT / 2 + 0.5, 0, 0, shaft, 0, Math.PI / 2) });
        }
        if (selectedFixture === f.id) {
          const w = b.housingW;
          const outline = new THREE.Shape(); outline.moveTo(-w / 2 - 3, -w / 2 - 3); outline.lineTo(L + w / 2 + 3, -w / 2 - 3); outline.lineTo(L + w / 2 + 3, w / 2 + 3); outline.lineTo(-w / 2 - 3, w / 2 + 3); outline.closePath();
          const inner = new THREE.Path(); inner.moveTo(-w / 2 - 1, -w / 2 - 1); inner.lineTo(L + w / 2 + 1, -w / 2 - 1); inner.lineTo(L + w / 2 + 1, w / 2 + 1); inner.lineTo(-w / 2 - 1, w / 2 + 1); inner.closePath();
          outline.holes.push(inner);
          const sel = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.3, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: COLORS.select })); sel.position.z = 0.1; grp.add(sel);
        }
        s.group.add(grp); s.fixtures.push(grp);
        continue;
      }
      const fr = railFrame(layout, f), rd = railDims(size);
      const railMat = new THREE.MeshStandardMaterial({ color: badFixtures.has(f.id) ? COLORS.collide : COLORS.rail, roughness: 0.7 });
      const carMat = new THREE.MeshStandardMaterial({ color: badFixtures.has(f.id) ? COLORS.collide : COLORS.carriage, roughness: 0.6 });
      const grp = new THREE.Group();
      grp.position.set(fr.o.x, fr.o.y, d.tile_h); grp.rotation.z = fr.angle;
      grp.userData = { fixture: f.id };
      const L = fr.len;
      const base = new THREE.Mesh(new THREE.BoxGeometry(L + rd.w, rd.w, rd.t), railMat); base.position.set(L / 2, 0, rd.t / 2); grp.add(base);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(L + rd.w - 2, 3 * d.module + 2, rd.ridge), railMat); ridge.position.set(L / 2, 0, rd.t + rd.ridge / 2); grp.add(ridge);
      const railHide: THREE.Object3D[] = [base, ridge], knobHide: THREE.Object3D[] = [];
      for (const u of [0, L]) {
        const tab = new THREE.Mesh(new THREE.BoxGeometry(rd.tabR * 2, g, rd.t), railMat); tab.position.set(u, g / 2, rd.t / 2); grp.add(tab);
        const tabEnd = new THREE.Mesh(cyl(rd.tabR, rd.t, 24), railMat); tabEnd.position.set(u, g, rd.t / 2); grp.add(tabEnd);
        const bolt = new THREE.Mesh(cyl(boltR, rd.t + 10, 16), boltMat); bolt.position.set(u, g, rd.t + 4); grp.add(bolt);
        const knob = new THREE.Mesh(cyl(d.knob_d / 2, 8), knobMat); knob.position.set(u, g, rd.t + 4); grp.add(knob);
        railHide.push(tab, tabEnd); knobHide.push(knob);
      }
      fixtureSwaps.push({ tag: `rail:${f.id}`, hide: railHide, add: g2 => addReal(g2, railMat, 0, 0, 0, grp) });
      // the tab knobs press the rail's top, as on a mount's leg
      fixtureSwaps.push({ tag: `railknob:${f.id}`, hide: knobHide, add: g2 => { for (const u of [0, L]) addReal(g2, knobMat, u, g, rd.t - boss, grp); } });
      if (selectedFixture === f.id) {
        const outline = new THREE.Shape(); outline.moveTo(-rd.w / 2 - 3, -rd.w / 2 - 3); outline.lineTo(L + rd.w / 2 + 3, -rd.w / 2 - 3); outline.lineTo(L + rd.w / 2 + 3, rd.w / 2 + 3); outline.lineTo(-rd.w / 2 - 3, rd.w / 2 + 3); outline.closePath();
        const inner = new THREE.Path(); inner.moveTo(-rd.w / 2 - 1, -rd.w / 2 - 1); inner.lineTo(L + rd.w / 2 + 1, -rd.w / 2 - 1); inner.lineTo(L + rd.w / 2 + 1, rd.w / 2 + 1); inner.lineTo(-rd.w / 2 - 1, rd.w / 2 + 1); inner.closePath();
        outline.holes.push(inner);
        const sel = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.3, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: COLORS.select }));
        sel.position.z = 0.1; grp.add(sel);
      }
      const c = f.carriage;
      if (c) {
        const car = new THREE.Group(); grp.add(car);
        const mid = (info.range[0] + info.range[1]) / 2;
        car.position.x = mid;
        if (c.kind === "rack") {
          const len = c.len * g, zt = lvlZ(size, c.level);
          const body = new THREE.Mesh(new THREE.BoxGeometry(len, rd.w, zt + T - rd.top), carMat); body.position.set(0, 0, (zt + T + rd.top) / 2); car.add(body);
          const root = g - 1.25 * d.module;
          const block = new THREE.Mesh(new THREE.BoxGeometry(len, root - rd.w / 2, T), carMat); block.position.set(0, -(root + rd.w / 2) / 2, zt + T / 2); car.add(block);
          const pitch = Math.PI * d.module;
          for (let u = -len / 2 + pitch / 2; u < len / 2; u += pitch) {
            const tooth = new THREE.Mesh(new THREE.BoxGeometry(pitch / 2, 2.25 * d.module, T), carMat); tooth.position.set(u, -(root + 2.25 * d.module / 2 - 0.1), zt + T / 2); car.add(tooth);
          }
          fixtureSwaps.push({ tag: `car:${f.id}`, hide: [...car.children], add: g2 => addReal(g2, carMat, 0, 0, 0, car) });
          const pinion = info.drive ? meshes.get(key(info.drive.pin, info.drive.gear.level)) : undefined;
          if (pinion && info.drive) {
            const rp = pitchR(size, info.drive.gear.teeth), ph = analysis.phase.get(key(info.drive.pin, info.drive.gear.level)) ?? 0, [lo, hi] = info.range;
            // swing the input just short of the rack's ends (the pinion turns `rate` times the input)
            const mo = analysis.motion.get(key(info.drive.pin, info.drive.gear.level)), rate = mo ? Math.abs(mo(1) - mo(0)) : 0;
            if (rate > 1e-6) { const amp = (0.92 * (hi - lo)) / 2 / (rp * rate); s.rock = s.rock > 0 ? Math.min(s.rock, amp) : amp; }
            s.anims.push(() => { car.position.x = Math.min(hi, Math.max(lo, mid - rp * (pinion.rotation.z - ph))); });
          }
        } else {
          const baseM = new THREE.Mesh(new THREE.BoxGeometry(rd.carL, rd.w, rd.baseTop - rd.top), carMat); baseM.position.set(0, 0, (rd.baseTop + rd.top) / 2); car.add(baseM);
          fixtureSwaps.push({ tag: `car:${f.id}`, hide: [baseM], add: g2 => addReal(g2, carMat, 0, 0, 0, car) });
          const zArm = lvlZ(size, c.level + 2);
          const tower = new THREE.Mesh(new THREE.BoxGeometry(rd.plugW, rd.plugW, zArm - rd.baseTop), carMat); tower.position.set(0, 0, (zArm + rd.baseTop) / 2); car.add(tower);
          const crank = info.drive ? meshes.get(key(info.drive.pin, info.drive.gear.level)) : undefined;
          const t = info.drive?.gear.throw ?? 2 * g;
          const pu = info.pinU ?? L + 2 * g;
          if (c.kind === "yoke") {
            const reach = c.reach * g, sw = slotW(size), aw = sw + 8, sl = 2 * c.throw + sw + 1;
            const beam = new THREE.Mesh(new THREE.BoxGeometry(reach, rd.plugW, T), carMat); beam.position.set(reach / 2, 0, zArm + T / 2); car.add(beam);
            for (const sg of [1, -1]) {
              const side = new THREE.Mesh(new THREE.BoxGeometry(4, sl + 8, T), carMat); side.position.set(reach + sg * (aw / 2 - 2), 0, zArm + T / 2); car.add(side);
              const end = new THREE.Mesh(new THREE.BoxGeometry(aw, 4, T), carMat); end.position.set(reach, sg * (sl / 2 + 2), zArm + T / 2); car.add(end);
            }
            fixtureSwaps.push({ tag: `top:${f.id}`, hide: car.children.filter(o => o !== baseM), add: g2 => addReal(g2, carMat, 0, 0, 0, car) });
            if (crank) s.anims.push(() => { car.position.x = yokeX(pu, reach, t, crank.rotation.z - fr.angle); });
          } else {
            const len = (c.link - 1) * g;
            const post = new THREE.Mesh(cyl(postD(size) / 2, d.level + 4, 16), boltMat); post.position.set(0, 0, zArm + d.level / 2); car.add(post);
            const link = new THREE.Mesh(new THREE.BoxGeometry(len + bearingOd + 6, bearingOd + 6, T), addonMat); link.position.set(len / 2, 0, zArm + T / 2); grp.add(link);
            // the real link has its first hole on the crank's post and points at the carriage
            const realLink = new THREE.Group(); grp.add(realLink);
            fixtureSwaps.push({ tag: `top:${f.id}`, hide: [tower, post], add: g2 => addReal(g2, carMat, 0, 0, 0, car) });
            fixtureSwaps.push({ tag: `link:${f.id}`, hide: [link], add: g2 => addReal(g2, addonMat, 0, 0, 0, realLink) });
            const pose = (phi: number) => {
              const x = sliderX(pu, t, len, phi);
              car.position.x = x;
              const px = pu + t * Math.cos(phi), py = t * Math.sin(phi);
              link.position.set((x + px) / 2, py / 2, zArm + T / 2); link.rotation.z = Math.atan2(py, px - x);
              realLink.position.set(px, py, zArm - 1); realLink.rotation.z = Math.atan2(-py, x - px);
            };
            pose(0);
            if (crank) s.anims.push(() => pose(crank.rotation.z - fr.angle));
          }
        }
      }
      s.group.add(grp); s.fixtures.push(grp);
    }
    // selected empty socket
    if (selected && !selected.pin) {
      const p = socketPos(layout, selected.i, selected.j);
      const ring = new THREE.Mesh(new THREE.RingGeometry(boltR + 1, boltR + 3, 32), new THREE.MeshBasicMaterial({ color: COLORS.select, side: THREE.DoubleSide }));
      ring.position.set(p.x, p.y, d.tile_h + 0.1); s.group.add(ring);
    }
    // camera fit when the board size changes
    const fitKey = `${size}:${W}x${H}`;
    if (s.fittedFor !== fitKey) {
      s.fittedFor = fitKey;
      const cx = (W * g) / 2, cy = (H * g) / 2;
      const radius = Math.hypot(cx, cy);
      const dist = (radius / Math.sin((s.camera.fov * Math.PI) / 360)) * 1.15;
      s.controls.target.set(cx, cy, 10);
      s.camera.position.set(cx, cy - dist * 0.55, dist * 0.85);
      s.camera.near = Math.max(0.1, dist / 100); s.camera.far = dist * 20; s.camera.updateProjectionMatrix();
    }
    // the real printed parts: swap each stand-in for its OpenSCAD part as soon as that has loaded
    const gen = ++s.gen;
    type P = Record<string, string | number>;
    const swapAll = (list: P[], fn: (gs: THREE.BufferGeometry[]) => void) => {
      if (!real) return;
      const now = list.map(p => real.parts.ready(p));
      if (now.every(Boolean)) { fn(now as THREE.BufferGeometry[]); return; }
      void Promise.all(list.map(p => real.parts.load(p))).then(gs => { if (gs.every(Boolean) && st.current === s && s.gen === gen) fn(gs as THREE.BufferGeometry[]); });
    };
    const swap = (params: P | undefined, fn: (g: THREE.BufferGeometry) => void) => { if (params) swapAll([params], ([g]) => fn(g)); };
    function addReal(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = s!.group, rotZ = 0, rotY = 0) {
      const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.rotation.set(0, rotY, rotZ, "ZYX");
      mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
      return mesh;
    }
    if (real) {
      swap(real.items.get("tile"), g => { for (const t of tileBoxes) { t.box.visible = false; addReal(g, topMat, t.x, t.y, 0); } });
      for (const kn of knobs) {
        const p = real.items.get(`knob:${kn.pin}`);
        if (p?.part === "knob" || p?.part === "dial_knob") swap(p, g => { kn.knob.visible = false; if (kn.dial) kn.dial.visible = false; addReal(g, knobMat, kn.x, kn.y, kn.z); });
      }
      // a crank or pointer sits on its gear's top face (z = T in the real gear's frame) and turns with it
      for (const tp of toppers) {
        const p = real.items.get(`${tp.kind}:${tp.k}`);
        if (!p) continue;
        swap(p, g => { tp.hide.forEach(o => (o.visible = false)); addReal(g, addonMat, 0, 0, T, tp.mesh); });
        const hp = real.items.get(`handle:${tp.k}`), sp = real.items.get(`sh:${tp.k}`);
        if (tp.grip && hp && sp) swapAll([p, sp, hp], ([c, spacerG, h]) => {
          // the handle spacer and grip ride the crank's bolt post, from the arm's top
          const zt = T + c.boundingBox!.max.z;
          tp.grip!.visible = false;
          addReal(spacerG, addonMat, tp.t, 0, zt, tp.mesh); addReal(h, addonMat, tp.t, 0, zt + 0.5, tp.mesh);
        });
      }
      for (const pin of layout.pins) for (const gear of pin.gears) {
        const p = real.items.get(key(pin, gear.level)), mesh = meshes.get(key(pin, gear.level));
        if (!p || !mesh || !REAL_ITEMS.has(String(p.part))) continue;
        // the stand-in stands 1 mm higher than the real part, whose bottom face is 1 mm over its bearing's
        const z0 = mesh.position.z;
        const keep = new Set<THREE.Object3D>(planetsOf.get(key(pin, gear.level)) ?? []);   // the planets are parts of their own
        swap(p, g => {
          if (p.part === "pinion") {
            mesh.geometry = g;   // the pinion sits on the motor shaft at its level, not 1 mm over a bearing
          } else if (p.part === "pawl") {
            // the pawl is modelled with its ratchet at +x and stands on its bearing, not 1 mm over it
            mesh.geometry = g; (mesh.userData as ItemData).fixed = analysis.pawls.get(key(pin, gear.level)) ?? 0;
          } else { mesh.geometry = p.part === "anchor" ? quarterTurn(g) : g; mesh.position.z = z0 - 1; }
          for (const o of standKids.get(key(pin, gear.level)) ?? []) if (!keep.has(o)) o.visible = false;
          const up = p.part === "compound" ? meshes.get(key(pin, gear.level + 1)) : undefined;
          if (up) up.material = HIDDEN;
        });
      }
      // motor mounts stand on the board, turned to the motor's side, with a knob on each leg
      for (const mt of mounts) {
        const mp = real.items.get(`mount:${mt.pin}`), kp = real.items.get(`mountknob:${mt.pin}`);
        if (mp && kp) swapAll([mp, kp], ([mg, kg]) => {
          mt.hide.forEach(o => (o.visible = false));
          addReal(mg, motorMat, mt.x, mt.y, d.tile_h, s.group, (mt.dir * Math.PI) / 2);
          for (const leg of mt.legs) addReal(kg, knobMat, mt.x + leg.x, mt.y + leg.y, d.tile_h + mt.H - boss);
        });
      }
      for (const fs of fixtureSwaps) swap(real.items.get(fs.tag), g2 => { fs.hide.forEach(o => (o.visible = false)); fs.add(g2); });
      for (const rs of ringSwaps) {
        const rp = real.items.get(`ring:${rs.k}`);
        swap(rp, rg => { rs.hide.forEach(o => (o.visible = false)); addReal(rg, addonMat, rs.x, rs.y, d.tile_h, s.group, rs.turn); });
      }
      // four-bar links: each link's first hole on its pivot, the joint post where they meet
      for (const la of s.links) {
        const rk = key(la.l.rocker.pin, la.l.rocker.gear.level);
        const rp = real.items.get(`rockerlink:${rk}`), cp = real.items.get(`couplerlink:${rk}`), jp = real.items.get(`joint:${rk}`);
        if (!rp || !cp || !jp) continue;
        swapAll([rp, cp, jp], ([rg, cg, jg]) => {
          la.rocker.visible = la.coupler.visible = false;
          const cl = crankLinkLevel(la.l.crank.gear.level);
          la.real = {
            rocker: addReal(rg, addonMat, 0, 0, 0), coupler: addReal(cg, addonMat, 0, 0, 0), joint: addReal(jg, addonMat, 0, 0, 0),
            zRocker: d.tile_h + lvlZ(size, la.l.rocker.gear.level) - 1, zCoupler: d.tile_h + lvlZ(size, cl) - 1, zJoint: d.tile_h + lvlZ(size, cl) - 2.5,
          };
          poseLinkage(la);
        });
      }
    }
    // shadows: solid parts cast and catch them; flat markers (sockets, selection rings, outlines) stay out
    s.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.some(x => (x as THREE.MeshBasicMaterial).isMeshBasicMaterial)) return;
      m.castShadow = m.receiveShadow = true;
    });
    s.look.fit(new THREE.Box3().setFromObject(s.group));
  }, [layout, analysis, selected, selectedFixture, real]);

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
  const r = a.real;
  if (r) {
    r.rocker.position.set(bx, by, r.zRocker); r.rocker.rotation.z = Math.atan2(jy - by, jx - bx);
    r.coupler.position.set(px, py, r.zCoupler); r.coupler.rotation.z = Math.atan2(jy - py, jx - px);
    r.joint.position.set(jx, jy, r.zJoint);
  }
}
