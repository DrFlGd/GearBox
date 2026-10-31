import type { ReactNode } from "react";
import type { Engine } from "../App";
import type { RenderState } from "../useRender";
import type { Mesh } from "../export/threemf";

type Props = { engine: Engine; render: RenderState; lines: number; mesh: Mesh | null; idle: ReactNode };

/** The toolbar's one line: engine loading, render progress, or what was rendered and how long it took. */
export default function StatusLine({ engine, render, lines, mesh, idle }: Props) {
  const size = mesh ? mesh.bbox.max.map((m, i) => m - mesh.bbox.min[i]) : null;
  return (
    <span className="status">
      {engine.status === "loading" && "Loading the OpenSCAD engine (11 MB, once)…"}
      {engine.status === "failed" && <span className="err">Engine failed to load. {engine.error}</span>}
      {engine.status === "ready" && render.status === "rendering" && (render.note ?? `Rendering ${render.name}…${lines ? ` (${lines} lines)` : ""}`)}
      {engine.status === "ready" && render.status === "done" && (render.note ? <>{render.note}{render.cached ? " · from cache" : ""}</> : size && (
        <>
          <b>{render.name}</b> · {size.map(v => v.toFixed(1)).join(" × ")} mm · {(mesh!.triangles.length / 3).toLocaleString()} triangles · {render.cached ? "from cache" : `${render.seconds.toFixed(1)} s`}
          {render.messages.some(m => /WARNING/.test(m)) && <span className="badge warn" title={render.messages.join("\n")}>warnings</span>}
        </>
      ))}
      {engine.status === "ready" && render.status === "error" && <span className="err">Render failed{render.note ? `: ${render.note}` : ""}. Turn on the console in Settings to see why.</span>}
      {engine.status === "ready" && render.status === "idle" && idle}
    </span>
  );
}
