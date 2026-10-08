import marko from "@marko/run/vite";
import nodeAdapter from "@marko/run-adapter-node";
import { defineConfig } from "vite";

import { withAppPlatform } from "./vite/app-platform.ts";

// Node/Fly. `vite.oxygen.config.ts` builds the same routes into an Oxygen Worker.
export default defineConfig({
  plugins: [
    marko({ adapter: withAppPlatform(nodeAdapter()), routesDir: "app/routes" }),
  ],
  build: { assetsInlineLimit: 0, sourcemap: false },
});
