// Settings' view of the render cache (cache.ts) from the page: how much is saved, and
// a way to clear it. Kept apart from cache.ts, which pulls in every .scad source.
const DB = "gearbox-renders", STORE = "renders";

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function open(): Promise<IDBDatabase | null> {
  try {
    const o = indexedDB.open(DB, 1);
    o.onupgradeneeded = () => o.result.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
    return await req(o);
  } catch { return null; }
}

/** How many renders are saved, and roughly how much space the site uses (null when the browser will not say). */
export async function cacheStats(): Promise<{ entries: number; bytes: number | null }> {
  const d = await open();
  let entries = 0;
  if (d) { try { entries = await req(d.transaction(STORE).objectStore(STORE).count()); } catch { /* ignore */ } finally { d.close(); } }
  let bytes: number | null = null;
  try { bytes = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* ignore */ }
  return { entries, bytes };
}

/** Drop every saved render. */
export async function clearCache(): Promise<void> {
  const d = await open();
  if (!d) return;
  try { await req(d.transaction(STORE, "readwrite").objectStore(STORE).clear()); } catch { /* ignore */ } finally { d.close(); }
}
