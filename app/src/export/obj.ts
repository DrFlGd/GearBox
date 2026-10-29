import type { Mesh } from "./threemf";

export function meshToObj(mesh: Mesh, name: string): Uint8Array {
  const out: string[] = [`# GearBox part generator\no ${name}\n`];
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += 3) out.push(`v ${v[i]} ${v[i + 1]} ${v[i + 2]}\n`);
  const t = mesh.triangles;
  for (let i = 0; i < t.length; i += 3) out.push(`f ${t[i] + 1} ${t[i + 1] + 1} ${t[i + 2] + 1}\n`);
  return new TextEncoder().encode(out.join(""));
}
