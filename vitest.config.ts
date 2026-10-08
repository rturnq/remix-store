import marko from "@marko/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose @marko/run plugin builds the app.
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["app/**/*.test.ts"],
          // The first request in each file compiles every route through Vite.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        plugins: [marko()],
        test: {
          name: "browser",
          include: ["app/**/*.test.browser.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
