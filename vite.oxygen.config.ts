import marko from "@marko/run/vite";
import { defineConfig } from "vite";

import { withAppPlatform } from "./vite/app-platform.ts";
import oxygenAdapter from "./vite/oxygen-adapter.ts";

// Shopify Oxygen. `vite.config.ts` builds the same routes for Node/Fly.
export default defineConfig({
  plugins: [
    marko({
      adapter: withAppPlatform(
        oxygenAdapter({
          entry: "app/entry.oxygen.ts",
          // Hydrogen's preview dates are newer than Oxygen accepts.
          compatibilityDate: "2026-04-01",
        }),
      ),
      routesDir: "app/routes",
    }),
  ],
  build: { assetsInlineLimit: 0, sourcemap: false },
});
