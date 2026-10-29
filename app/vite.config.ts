import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// The OpenSCAD engine (openscad-wasm-prebuilt) is one 11 MB ES module with the
// wasm inlined. It is served as-is from /engine/openscad.js instead of being
// bundled, and the worker imports it at runtime.
const engineSrc = path.resolve(__dirname, "../node_modules/openscad-wasm-prebuilt/dist/openscad.js");

function engine(): Plugin {
  return {
    name: "gearbox-engine",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0].endsWith("/engine/openscad.js")) {
          res.setHeader("Content-Type", "text/javascript");
          res.setHeader("Cache-Control", "no-cache");
          fs.createReadStream(engineSrc).pipe(res);
          return;
        }
        next();
      });
    },
    writeBundle(opts) {
      const dir = path.join(opts.dir ?? path.resolve(__dirname, "../dist"), "engine");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(engineSrc, path.join(dir, "openscad.js"));
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: process.env.GEARBOX_BASE ?? "/GearBox/",
  plugins: [react(), engine()],
  build: {
    outDir: path.resolve(__dirname, "../dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
  },
  worker: { format: "es" },
  server: { fs: { allow: [path.resolve(__dirname, "..")] } },
});
