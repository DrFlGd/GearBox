// Layouts travel in the URL hash as deflated, base64url JSON.
import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import type { Layout } from "./model";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

export const encodeLayout = (l: Layout) => b64(deflateSync(strToU8(JSON.stringify(l)), { level: 9 }));
export function decodeLayout(s: string): Layout | null {
  try {
    const l = JSON.parse(strFromU8(inflateSync(unb64(s)))) as Layout;
    if (!l || !Array.isArray(l.pins) || !l.tile || !l.tiles) return null;
    return l;
  } catch { return null; }
}
