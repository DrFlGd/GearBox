// Worker thread for render-catalog.mjs: renders the jobs it is sent, one at a
// time, so the catalog can use every core (an OpenSCAD render blocks its thread).
import { parentPort } from "node:worker_threads";
import { render } from "./render.mjs";

parentPort.on("message", async job => {
  const r = await render({ ...job, quiet: true });
  parentPort.postMessage({ id: job.id, ...r });
});
