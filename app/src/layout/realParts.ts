// The real printed parts for the Layout view: each distinct part is rendered by
// OpenSCAD once (through the app's render worker, so it lands in the same
// browser cache as the Kits view and the downloads) and kept here as display
// geometry. The view draws its quick stand-in until the real part is ready.
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { RenderResult } from "../engine/protocol";
import { creased } from "../components/look";

export type RealParts = {
  /** The geometry if it is already loaded, so a rebuilt scene shows it at once. */
  ready: (params: Record<string, string | number>) => THREE.BufferGeometry | undefined;
  /** Load (render or read from the cache) the part; null when it fails. */
  load: (params: Record<string, string | number>) => Promise<THREE.BufferGeometry | null>;
};

const loaded = new Map<string, THREE.BufferGeometry>();
const loading = new Map<string, Promise<THREE.BufferGeometry | null>>();

/** `defs` turns a part's params into OpenSCAD defines (size, profile, fits and joint included). */
export function realParts(defs: (params: Record<string, string | number>) => string[], render: (defs: string[]) => Promise<RenderResult>): RealParts {
  const keyOf = (params: Record<string, string | number>) => defs(display(params)).join("\n");
  return {
    ready: params => loaded.get(keyOf(params)),
    load: params => {
      const k = keyOf(params);
      const hit = loaded.get(k);
      if (hit) return Promise.resolve(hit);
      let p = loading.get(k);
      if (!p) {
        p = render(defs(display(params))).then(r => {
          loading.delete(k);
          if (!r.ok || !r.bytes) return null;   // a cancelled or failed render is tried again on the next rebuild
          const g = creased(new STLLoader().parse(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer));
          g.computeBoundingBox();
          loaded.set(k, g);
          return g;
        }, () => { loading.delete(k); return null; });
        loading.set(k, p);
      }
      return p;
    },
  };
}

/** Parts as they sit on the board: never flipped for printing. */
function display(params: Record<string, string | number>) {
  if (!("flip" in params)) return params;
  const { flip: _flip, ...rest } = params;
  return rest;
}
