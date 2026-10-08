import type { CacheInstance } from "@shopify/hydrogen";

import type { ActiveMarket } from "./lib/market.ts";

export type Env = Record<string, string | undefined>;

/** What a runtime entry knows about a request before the app handles it. */
export interface Runtime {
  env: Env;
  /** The buyer's IP, read only from a source the runtime trusts. */
  buyerIp?: string;
  /** The Worker Cache API. Node has none and caches Storefront data in memory. */
  cache?: CacheInstance;
  waitUntil?(promise: Promise<unknown>): void;
  /** The current time; tests pin it to check seasonal pages. */
  now?(): Date;
}

/** The request-scoped bindings every route reads from `ctx.platform`. */
export interface AppPlatform extends Runtime {
  market: ActiveMarket;
  /** Set when the path starts with a locale the store does not sell in. */
  unsupportedLocale?: true;
}
