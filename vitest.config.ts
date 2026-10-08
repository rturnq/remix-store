import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose @marko/run plugin builds the app.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
  },
});
