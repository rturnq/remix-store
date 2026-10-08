import fs from "node:fs";
import path from "node:path";

import type { Adapter } from "@marko/run/vite";
import type { Plugin } from "vite";

export interface OxygenAdapterOptions {
  /** The Worker module marko-run builds and MiniOxygen runs. */
  entry: string;
  /** Written to `oxygen.json`; Hydrogen's own date can be newer than Oxygen supports. */
  compatibilityDate: string;
}

/**
 * Runs @marko/run on Shopify Oxygen. MiniOxygen's Vite plugin makes the SSR
 * environment workerd-shaped: dev runs the Worker in workerd with HMR for the
 * client, preview runs the build there, and the build is rearranged into the
 * layout `shopify hydrogen deploy` uploads (`dist/server/index.js` beside
 * `oxygen.json`, browser files in `dist/client`).
 */
export default function oxygenAdapter({
  entry,
  compatibilityDate,
}: OxygenAdapterOptions): Adapter {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate)) {
    throw new Error(`Invalid Oxygen compatibility date: ${compatibilityDate}`);
  }
  let isBuild = false;

  return {
    name: "oxygen-adapter",
    configure(options) {
      isBuild = options.isBuild;
    },
    viteConfig() {
      if (isBuild) {
        return {
          // Oxygen uploads one Worker module.
          environments: {
            ssr: {
              build: { rolldownOptions: { output: { codeSplitting: false } } },
            },
          },
        };
      }
      // In dev, marko-run hands the generated router only to its own Node entry.
      // Inside workerd the Worker entry imports it, so point the import at the
      // plugin's virtual router module, which resolves for any importer.
      return {
        resolve: {
          alias: [
            {
              find: /^@marko\/run\/router$/,
              replacement: "virtual:marko-run/__marko-run__router.js",
            },
          ],
        },
      };
    },
    async plugins() {
      const { oxygen } = await import("@shopify/mini-oxygen/vite");
      const pinCompatibilityDate: Plugin = {
        name: "oxygen-adapter:compatibility-date",
        configResolved(config) {
          let plugin = config.plugins.find(
            ({ name }) => name === "oxygen:main",
          );
          plugin?.api?.registerPluginOptions({ compatibilityDate });
        },
      };
      return [...oxygen({ entry }), pinCompatibilityDate];
    },
    async startDev({ config, options }) {
      const { createServer } = await import("vite");
      const server = await createServer({
        ...config,
        server: { ...config.server, port: options.port, strictPort: true },
      });
      await server.listen();
      server.printUrls();
      return {
        port: server.config.server.port ?? options.port ?? 0,
        close: () => server.close(),
      };
    },
    async startPreview({ options }) {
      const [{ preview }, { oxygen }] = await Promise.all([
        import("vite"),
        import("@shopify/mini-oxygen/vite"),
      ]);
      // MiniOxygen's preview server runs `dist/server/index.js` beside the
      // client build; nothing else from the app's Vite config applies.
      const server = await preview({
        root: options.cwd,
        configFile: false,
        plugins: [oxygen({ entry })],
        build: { outDir: "dist/client" },
        preview: { port: options.port, strictPort: true },
      });
      server.printUrls();
      return {
        port: options.port ?? 0,
        close: () => server.close(),
      };
    },
    buildEnd({ config }) {
      // marko-run writes the Worker to `dist/index.mjs` and the client to
      // `dist/public`; MiniOxygen writes `oxygen.json` beside the Worker.
      const clientDir = path.resolve(config.root, config.build.outDir);
      const dist = path.dirname(clientDir);
      const serverDir = path.join(dist, "server");
      fs.mkdirSync(serverDir, { recursive: true });
      fs.renameSync(
        path.join(dist, "index.mjs"),
        path.join(serverDir, "index.js"),
      );
      fs.rmSync(path.join(dist, "oxygen.json"), { force: true });
      fs.writeFileSync(
        path.join(serverDir, "oxygen.json"),
        JSON.stringify(
          { version: 1, compatibility_date: compatibilityDate },
          null,
          2,
        ),
      );
      fs.renameSync(clientDir, path.join(dist, "client"));
    },
  };
}
