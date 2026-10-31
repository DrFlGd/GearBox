// Rendered models kept in the browser (IndexedDB), so a part, kit or print
// plate that was rendered before opens at once instead of rendering again.
// The key is a hash of the request (every -D define: part, size, profile, fit
// overrides) and of the sources it renders from (the embedded .scad files and
// the engine version), so any change to the config or to the library renders
// fresh. Entries from older sources are dropped; the newest MAX_ENTRIES stay.
import { files } from "./files";
import type { OutputFormat } from "./protocol";

declare const __ENGINE_VERSION__: string;

export type CachedRender = { bytes: Uint8Array; seconds: number; messages: string[] };
type Row = CachedRender & { key: string; src: string; at: number };

const DB = "gearbox-renders", STORE = "renders", MAX_ENTRIES = 400;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

let srcKey: Promise<string> | null = null;
function sourceKey(): Promise<string> {
  srcKey ??= sha256(__ENGINE_VERSION__ + "\n" + Object.keys(files).sort().map(p => p + "\n" + files[p]).join("\n"));
  return srcKey;
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbp ??= (async () => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
      const d = await req(open);
      void prune(d, await sourceKey());
      return d;
    } catch { return null; }   // private window or storage blocked: render every time
  })();
  return dbp;
}

/** Drop entries rendered from other sources, then the oldest past MAX_ENTRIES. */
async function prune(d: IDBDatabase, src: string) {
  try {
    const rows = await req(d.transaction(STORE).objectStore(STORE).index("at").getAll()) as Row[];
    const fresh = rows.filter(r => r.src === src);
    const drop = [...rows.filter(r => r.src !== src), ...fresh.slice(0, Math.max(0, fresh.length - MAX_ENTRIES))];
    if (!drop.length) return;
    const store = d.transaction(STORE, "readwrite").objectStore(STORE);
    for (const r of drop) store.delete(r.key);
  } catch { /* best effort */ }
}

export async function renderKey(defines: string[], format: OutputFormat): Promise<string> {
  return sha256(await sourceKey() + "\n" + format + "\n" + defines.join("\n"));
}

export async function getCached(key: string): Promise<CachedRender | null> {
  const d = await db();
  if (!d) return null;
  try {
    const row = await req(d.transaction(STORE).objectStore(STORE).get(key)) as Row | undefined;
    if (!row) return null;
    // touch it so the cap keeps what is in use
    d.transaction(STORE, "readwrite").objectStore(STORE).put({ ...row, at: Date.now() });
    return { bytes: row.bytes, seconds: row.seconds, messages: row.messages };
  } catch { return null; }
}

export async function putCached(key: string, r: CachedRender): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const row: Row = { key, src: await sourceKey(), at: Date.now(), bytes: r.bytes.slice(), seconds: r.seconds, messages: r.messages };
    await req(d.transaction(STORE, "readwrite").objectStore(STORE).put(row));
    void prune(d, row.src);
  } catch { /* quota full: keep going without the cache */ }
}
