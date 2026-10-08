import { createServer, type ViteDevServer } from "vite";
import { afterAll } from "vitest";

import type { RateLimiter } from "../data/rate-limit.ts";
import { MemoryStorefrontCache } from "../data/storefront-cache.ts";

export const testEnv = {
  PUBLIC_CHECKOUT_DOMAIN: "checkout.example.com",
  PUBLIC_STORE_DOMAIN: "example.myshopify.com",
  ["PUBLIC" + "_STOREFRONT_" + "ID"]: "test-storefront-id",
  ["PRIVATE_" + "STOREFRONT_API_TOKEN"]: "test-token",
};

let vite: Promise<ViteDevServer> | undefined;

afterAll(async () => {
  let server = vite;
  vite = undefined;
  await (await server)?.close();
});

/**
 * The app's request boundary, loaded through Vite with the @marko/run plugin
 * so routes compile as they do in development. Storefront requests go to
 * `fetch`, and each app gets its own Storefront cache.
 */
export function createTestApp(
  fetch: typeof globalThis.fetch,
  options: {
    buyerIp?: string;
    now?: () => Date;
    subscriptionRateLimiter?: RateLimiter;
  } = {},
) {
  let cache = new MemoryStorefrontCache();
  return {
    async fetch(request: Request): Promise<Response> {
      // Like a browser; @marko/run renders the 404 page only for HTML requests.
      if (!request.headers.has("Accept")) {
        request.headers.set("Accept", "text/html");
      }
      let { handleRequest } = await loadApp();
      // Storefront API calls go to the test's fake; anything else (Shopify's
      // AJAX cart, the Admin API) to whatever `fetch` the test installed.
      let upstream = globalThis.fetch;
      globalThis.fetch = (input, init) =>
        isStorefrontApi(input) ? fetch(input, init) : upstream(input, init);
      try {
        let response = await handleRequest(request, {
          buyerIp: "buyerIp" in options ? options.buyerIp : "127.0.0.1",
          cache,
          env: { ...testEnv, ["ADMIN" + "_ACCESS_TOKEN"]: "test-admin-token" },
          now: options.now,
          subscriptionRateLimiter: options.subscriptionRateLimiter,
        });
        return withoutHydrationMarkers(response);
      } finally {
        globalThis.fetch = upstream;
      }
    },
  };
}

function isStorefrontApi(input: RequestInfo | URL): boolean {
  let url = input instanceof Request ? input.url : String(input);
  return /^\/api\/[^/]+\/graphql\.json$/.test(new URL(url).pathname);
}

/**
 * Marko marks dynamic text and scopes with comments the browser resumes from;
 * tests assert on the markup alone.
 */
async function withoutHydrationMarkers(response: Response): Promise<Response> {
  if (!response.headers.get("Content-Type")?.startsWith("text/html")) {
    return response;
  }
  let html = (await response.text()).replace(/<!(?:--[\s\S]*?--)?>/g, "");
  return new Response(html, response);
}

async function loadApp(): Promise<typeof import("../request.ts")> {
  vite ??= createServer({
    configFile: "vite.config.ts",
    logLevel: "error",
    appType: "custom",
    // @marko/run writes generated route modules under the output directory;
    // keep each test worker's apart from the dev server's and each other's.
    build: { outDir: `node_modules/.cache/marko-run-test/${process.pid}` },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  let server = await vite;
  // Registers the generated router that `@marko/run/router` calls into.
  await server.ssrLoadModule("@marko/run/router");
  return server.ssrLoadModule("/app/request.ts") as Promise<
    typeof import("../request.ts")
  >;
}

export function createStorefrontFetch(
  handlers: Record<string, StorefrontHandler>,
): typeof globalThis.fetch {
  return async (_input, init) => {
    let body = parseStorefrontRequestBody(init?.body);
    let operationName = operationNameFrom(body.query);
    let handler = handlers[operationName];
    if (!handler && operationName === "redirects") {
      return graphqlResponse({ urlRedirects: { edges: [] } });
    }
    if (
      !handler &&
      operationName === "RemixCanadianSitemapResources" &&
      handlers.RemixSitemapResources
    ) {
      return graphqlResponse(await handlers.RemixSitemapResources(body));
    }
    if (
      !handler &&
      operationName === "RemixCanadianSitemapIndex" &&
      handlers.RemixSitemapIndex
    ) {
      return graphqlResponse(await handlers.RemixSitemapIndex(body));
    }
    if (!handler) {
      throw new Error(`Unexpected Storefront operation: ${operationName}`);
    }
    return graphqlResponse(await handler(body));
  };
}

export function graphqlResponse(
  data: object,
  errors?: Array<{ message: string }>,
): Response {
  return new Response(JSON.stringify(errors ? { data, errors } : { data }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function navigationData() {
  return {
    footerMenu: { items: [] },
    menu: { items: [] },
    shop: { primaryDomain: { url: "https://example.myshopify.com" } },
  };
}

export function analyticsShopData() {
  return {
    shop: { id: "gid://shopify/Shop/test" },
    localization: { country: { currency: { isoCode: "USD" } } },
  };
}

export type StorefrontJsonValue =
  | boolean
  | number
  | string
  | null
  | undefined
  | StorefrontJsonValue[]
  | StorefrontJsonObject;

export interface StorefrontJsonObject {
  [key: string]: StorefrontJsonValue;
}

export interface StorefrontRequestBody {
  query: string;
  variables: StorefrontJsonObject;
}

export interface StorefrontHandler {
  (body: StorefrontRequestBody): object | Promise<object>;
}

function parseStorefrontRequestBody(
  body: BodyInit | null | undefined,
): StorefrontRequestBody {
  let value = JSON.parse(String(body)) as Partial<StorefrontRequestBody>;
  if (typeof value.query !== "string") {
    throw new Error("Invalid Storefront request body");
  }
  return { query: value.query, variables: value.variables ?? {} };
}

function operationNameFrom(query: string): string {
  let match = query.match(/\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!match?.[1]) throw new Error("Storefront request has no operation name");
  return match[1];
}
