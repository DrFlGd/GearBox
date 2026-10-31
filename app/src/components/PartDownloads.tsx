import { download } from "../download";
import { meshTo3mf, type Mesh } from "../export/threemf";
import { meshToObj } from "../export/obj";

type Props = { stl: Uint8Array | null; mesh: Mesh | null; name: string; fileBase: string; busy: boolean; label?: string; title?: string };

/** The one place a rendered model downloads from: STL first, 3MF and OBJ beside it. */
export default function PartDownloads({ stl, mesh, name, fileBase, busy, label = "Download STL", title }: Props) {
  const off = !stl || !mesh || busy;
  return (
    <span className="downloads" title={title}>
      <button type="button" className="primary" disabled={off} onClick={() => download(stl!, `${fileBase}.stl`, "model/stl")}>{label}</button>
      <button type="button" disabled={off} onClick={() => download(meshTo3mf(mesh!, name), `${fileBase}.3mf`, "model/3mf")}>3MF</button>
      <button type="button" disabled={off} onClick={() => download(meshToObj(mesh!, name), `${fileBase}.obj`, "model/obj")}>OBJ</button>
    </span>
  );
}
