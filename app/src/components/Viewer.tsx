import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { creased, studio, type Studio } from "./look";

/** `hardware`: a second mesh drawn in steel grey (an assembly's bolts, bearings, pins and magnets).
 *  `beds`: outlines of print beds from the origin along +x (a print layout), in place of the board grid. */
type Props = { stl: Uint8Array | null; hardware?: Uint8Array | null; busy: boolean; grid: number; beds?: { size: number; gap: number; count: number } | null; label?: string };

/** three.js view of the current part: orbit, a 20 mm grid that matches the board, auto-fit on each new mesh. */
export default function Viewer({ stl, hardware = null, busy, grid, beds = null, label = "Rendering…" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const bedsNow = useRef(beds);
  bedsNow.current = beds;
  const state = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    mesh: THREE.Mesh | null; hw: THREE.Mesh | null; grid: THREE.GridHelper; beds: THREE.Group | null; fitted: boolean; look: Studio;
  } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(120, -140, 110);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    const look = studio(renderer, scene);
    const gridHelper = new THREE.GridHelper(400, 20, 0x5a6475, 0x323a47);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);
    scene.add(new THREE.AxesHelper(20));
    const s = { renderer, scene, camera, controls, mesh: null as THREE.Mesh | null, hw: null as THREE.Mesh | null, grid: gridHelper, beds: null as THREE.Group | null, fitted: false, look };
    state.current = s;

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      look.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      state.current = null;
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.scene.remove(s.grid);
    s.grid.dispose();
    const g = new THREE.GridHelper(grid * 20, 20, 0x5a6475, 0x323a47);
    g.rotation.x = Math.PI / 2;
    g.position.z = s.grid.position.z;
    g.visible = !s.beds;
    s.scene.add(g);
    s.grid = g;
  }, [grid]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.mesh) {
      s.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh = null;
    }
    if (!stl) return;
    const geometry = creased(new STLLoader().parse(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer));
    const material = new THREE.MeshStandardMaterial({ color: 0xe8b44c, metalness: 0, roughness: 0.48 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    s.scene.add(mesh);
    s.mesh = mesh;
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!.clone();
    // a print layout fits the whole of its beds, not just the parts on them
    const bd = bedsNow.current;
    if (bd) bb.union(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(bd.count * (bd.size + bd.gap) - bd.gap, bd.size, 0)));
    const size = new THREE.Vector3();
    bb.getSize(size);
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 20;
    // fit the wider of the two directions: a tall, narrow view (a phone) fits the width
    const dist = ((radius / Math.sin((s.camera.fov * Math.PI) / 360)) * 1.25) / Math.min(1, s.camera.aspect);
    const dir = s.fitted ? s.camera.position.clone().sub(s.controls.target).normalize() : new THREE.Vector3(0.6, -0.7, 0.55).normalize();
    s.controls.target.copy(center);
    s.camera.position.copy(center).add(dir.multiplyScalar(dist));
    s.camera.near = Math.max(0.1, dist / 100);
    s.camera.far = dist * 20;
    s.camera.updateProjectionMatrix();
    s.fitted = true;
    s.grid.position.z = Math.min(0, bb.min.z);
    s.look.fit(geometry.boundingBox!);
  }, [stl]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.beds) { s.scene.remove(s.beds); s.beds.children.forEach(c => (c as THREE.LineLoop).geometry.dispose()); s.beds = null; }
    s.grid.visible = !beds;
    if (!beds) return;
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0x5a6475 });
    for (let i = 0; i < beds.count; i++) {
      const x0 = i * (beds.size + beds.gap), n = beds.size;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x0 + n, 0, 0), new THREE.Vector3(x0 + n, n, 0), new THREE.Vector3(x0, n, 0)]);
      g.add(new THREE.LineLoop(geo, mat));
    }
    s.scene.add(g);
    s.beds = g;
  }, [beds?.size, beds?.gap, beds?.count]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.hw) { s.scene.remove(s.hw); s.hw.geometry.dispose(); s.hw = null; }
    if (!hardware || hardware.byteLength <= 84) return;
    const geometry = creased(new STLLoader().parse(hardware.buffer.slice(hardware.byteOffset, hardware.byteOffset + hardware.byteLength) as ArrayBuffer));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc4cad3, metalness: 0.55, roughness: 0.32 }));
    mesh.castShadow = mesh.receiveShadow = true;
    s.scene.add(mesh);
    s.hw = mesh;
  }, [hardware]);

  return (
    <div className={"viewer" + (busy ? " busy" : "")} ref={host}>
      {busy && <div className="viewer-overlay"><div className="spinner" /><span>{label}</span></div>}
    </div>
  );
}
