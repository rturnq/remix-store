// Writes .marko-run/routes.d.ts, which types `Run`, route data and
// `ctx.platform`. @marko/run generates it only while routing, so load the
// router once through Vite; dev and build regenerate it as routes change.
import { createServer } from "vite";

const server = await createServer({
  configFile: "vite.config.ts",
  logLevel: "error",
  appType: "custom",
  build: { outDir: "node_modules/.cache/marko-run-types" },
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  await server.ssrLoadModule("@marko/run/router");
} finally {
  await server.close();
}
