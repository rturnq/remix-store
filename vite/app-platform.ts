import type { Adapter } from "@marko/run/vite";

/**
 * Types `ctx.platform` as the app's own bindings. Both runtime entries call the
 * router with an `AppPlatform`, whatever the adapter would otherwise declare.
 */
export function withAppPlatform(adapter: Adapter): Adapter {
  return {
    ...adapter,
    typeInfo(writer) {
      writer(`import type { AppPlatform } from "../app/runtime.ts";\n`);
      return "AppPlatform";
    },
  };
}
