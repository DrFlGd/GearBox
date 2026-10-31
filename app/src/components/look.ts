// Shared "studio" look for the three.js views: soft room reflections, tone mapping,
// one shadow-casting key light with a contact shadow on the ground, and smooth
// shading on curved surfaces that keeps hard edges crisp. Display only: nothing
// here touches the OpenSCAD geometry or the render cache.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Faces meeting at more than this angle keep a hard edge; flatter ones (a cylinder's facets, an involute flank) shade smooth. */
const CREASE = (35 * Math.PI) / 180;

/** Smooth normals across shallow angles, hard edges elsewhere. Works on STL (unindexed) and three's own geometry.
 *  Like three's toCreasedNormals, but area weighted (OpenSCAD meshes are full of slivers) and fast on big print layouts. */
export function creased(geo: THREE.BufferGeometry, angle = CREASE): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const p = g.attributes.position.array as ArrayLike<number>;
  const nv = p.length / 3, nf = nv / 3, cos = Math.cos(angle);
  // face normals: raw (length = twice the area) and unit
  const fa = new Float32Array(nf * 3), fu = new Float32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const o = f * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
    fa[f * 3] = x; fa[f * 3 + 1] = y; fa[f * 3 + 2] = z;
    fu[f * 3] = x / l; fu[f * 3 + 1] = y / l; fu[f * 3 + 2] = z / l;
  }
  // corners that share a position (to 1 µm)
  const id = new Int32Array(nv), seen = new Map<string, number>();
  for (let v = 0; v < nv; v++) {
    const k = `${Math.round(p[v * 3] * 1e3)},${Math.round(p[v * 3 + 1] * 1e3)},${Math.round(p[v * 3 + 2] * 1e3)}`;
    let i = seen.get(k);
    if (i === undefined) { i = seen.size; seen.set(k, i); }
    id[v] = i;
  }
  // faces around each shared position, as one flat list
  const start = new Int32Array(seen.size + 1);
  for (let v = 0; v < nv; v++) start[id[v] + 1]++;
  for (let i = 0; i < seen.size; i++) start[i + 1] += start[i];
  const fill = start.slice(0, seen.size), faces = new Int32Array(nv);
  for (let v = 0; v < nv; v++) faces[fill[id[v]]++] = (v / 3) | 0;
  // each corner: the area-weighted sum of its neighbours that lie within the crease angle of its own face
  const n = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const f0 = ((v / 3) | 0) * 3, ax = fu[f0], ay = fu[f0 + 1], az = fu[f0 + 2];
    let x = 0, y = 0, z = 0;
    for (let j = start[id[v]], e = start[id[v] + 1]; j < e; j++) {
      const f = faces[j] * 3;
      if (ax * fu[f] + ay * fu[f + 1] + az * fu[f + 2] < cos) continue;
      x += fa[f]; y += fa[f + 1]; z += fa[f + 2];
    }
    const l = Math.hypot(x, y, z);
    if (l > 0) { n[v * 3] = x / l; n[v * 3 + 1] = y / l; n[v * 3 + 2] = z / l; }
    else { n[v * 3] = ax; n[v * 3 + 1] = ay; n[v * 3 + 2] = az; }
  }
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  return g;
}

export type Studio = { key: THREE.DirectionalLight; ground: THREE.Mesh; fit: (box: THREE.Box3) => void; dispose: () => void };

/** Lights, environment and contact shadow for a z-up scene. Call `fit` with the scene's bounding box when it changes. */
export function studio(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Studio {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.35;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3240, 0.45));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45);
  fill.position.set(-120, 60, 40);
  scene.add(fill);

  // a transparent ground that only shows the shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35, transparent: true, depthWrite: false }));
  ground.receiveShadow = true;
  ground.renderOrder = -1;
  scene.add(ground);

  const fit = (box: THREE.Box3) => {
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z, 20) * 0.5;
    key.target.position.copy(c);
    key.position.copy(c).add(new THREE.Vector3(0.55, -0.75, 0.8).normalize().multiplyScalar(r * 3));
    const cam = key.shadow.camera;
    cam.left = cam.bottom = -r * 1.3; cam.right = cam.top = r * 1.3;
    cam.near = r * 0.5; cam.far = r * 6;
    cam.updateProjectionMatrix();
    // bias in scene units: about one shadow texel
    key.shadow.normalBias = (r * 2.6) / 2048;
    key.shadow.bias = -0.0004;
    ground.scale.set(r * 6, r * 6, 1);
    ground.position.set(c.x, c.y, box.min.z - 0.02);
  };

  return {
    key, ground, fit,
    dispose: () => { env.dispose(); ground.geometry.dispose(); (ground.material as THREE.Material).dispose(); },
  };
}
