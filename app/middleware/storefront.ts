import {
  createShopifyRequestContext,
  createStorefrontClient,
  handleShopifyRedirects,
  handleShopifyRoutes,
  type CacheInstance,
} from "@shopify/hydrogen";
import type { Context, NextFunction, NextResponse } from "@marko/run";

import { cartHandlers, getCartData } from "../data/cart.server.ts";
import type { CartInitialData } from "../data/cart.ts";
import { applyDiscountCode } from "../data/discount.server.ts";
import { getStorefrontCache } from "../data/storefront-cache.ts";
import { createRetryingStorefrontFetch } from "../data/storefront-fetch.ts";
import {
  FALLBACK_FOOTER_MENU,
  FALLBACK_NAVIGATION_MENU,
  normalizeStoreDomain,
  queryAnalyticsShop,
  queryShellMenus,
  type AnalyticsShop,
  type AppStorefrontClient,
  type NavigationMenuData,
  type StoreWideSaleData,
} from "../data/storefront.ts";
import { localizeInternalUrl, type ActiveMarket } from "../lib/market.ts";
import { routeTemplates } from "../lib/route-templates.ts";
import type { AppPlatform, Env } from "../runtime.ts";

/** The store-wide data every document renders around its page. */
export interface ShellData {
  navigationMenu: NavigationMenuData;
  footerMenu: NavigationMenuData;
  storeWideSale: StoreWideSaleData | null;
  cart: CartInitialData;
  analyticsShop: AnalyticsShop | null;
}

declare module "@marko/run" {
  interface Context {
    storefront: AppStorefrontClient;
    shell: ShellData;
  }
}

// Tags outside the routes see `$global` as `Marko.Global`.
declare global {
  namespace Marko {
    interface Global {
      shell?: ShellData;
      platform?: AppPlatform;
    }
  }
}

/** What a middleware passes back: `next()`'s typed response or its own. */
type AnyResponse = Response | NextResponse;

export interface StorefrontOptions {
  cache?: CacheInstance;
  env?: Env;
  fetch?: typeof globalThis.fetch;
}

/** What @marko/run throws when a handler returns `null` for its 404 page. */
const NOT_MATCHED = Symbol.for("Run.Response.NotMatched");
const SUBSCRIBE_PATH = "/subscribe";
const SEO_PATH =
  /^\/(?:robots\.txt|sitemap\.xml|sitemap\/[^/]+(?:\/[^/]+)?\.xml)$/;
const ROBOTS_PATH = "/robots.txt";
const PRODUCT_GRID_FRAGMENT_PATH = /^\/collections\/[^/]+\/products$/;

const EMPTY_SHELL: ShellData = {
  navigationMenu: FALLBACK_NAVIGATION_MENU,
  footerMenu: FALLBACK_FOOTER_MENU,
  storeWideSale: null,
  cart: { cart: null },
  analyticsShop: null,
};

/**
 * Creates the request's Storefront client and serves the Shopify-owned routes
 * (cart API, checkout, permalinks, discount links) ahead of the app's own. Pages
 * then get the shell data, and a 404 tries Shopify's redirects.
 */
export function storefront(options: StorefrontOptions = {}) {
  return async (ctx: Context, next: NextFunction): Promise<AnyResponse> => {
    let { platform } = ctx;
    let env = { ...platform.env, ...options.env };

    if (
      !platform.buyerIp &&
      ctx.request.method === "POST" &&
      ctx.url.pathname === SUBSCRIBE_PATH
    ) {
      return subscribeUnavailable(ctx.request);
    }

    if (platform.unsupportedLocale) {
      ctx.shell = EMPTY_SHELL;
      return ctx.request.method === "GET" || ctx.request.method === "HEAD"
        ? next()
        : new Response("Not Found", { status: 404 });
    }

    let storeDomain = env.PUBLIC_STORE_DOMAIN;
    let storefrontId = env["PUBLIC" + "_STOREFRONT_" + "ID"];

    let privateStorefrontToken = env["PRIVATE" + "_STOREFRONT_" + "API_TOKEN"];
    // Local development can fall back to the store's public token. Shopify then
    // attributes every request to the server's IP, so deployments use the
    // private token, which forwards the buyer IP.
    let publicStorefrontToken = env["PUBLIC" + "_STOREFRONT_" + "API_TOKEN"];
    if (!storeDomain || !(privateStorefrontToken || publicStorefrontToken)) {
      throw new Error(
        "PUBLIC_STORE_DOMAIN and PRIVATE_STOREFRONT_API_TOKEN (or PUBLIC_STOREFRONT_API_TOKEN) are required to query Shopify.",
      );
    }

    let buyerIp = platform.buyerIp;
    if (!buyerIp) {
      throw new Error("The runtime adapter must provide a trusted buyer IP.");
    }

    let activeMarket = platform.market;
    let requestContext = createShopifyRequestContext({
      request: ctx.request,
      i18n: activeMarket,
      buyerIp,
    });
    let config = {
      storeDomain,
      storefrontId,
      cache: options.cache ?? getStorefrontCache(platform.cache),
      waitUntil: platform.waitUntil,
      fetch: createRetryingStorefrontFetch({ fetch: options.fetch }),
    };
    let storefrontClient = privateStorefrontToken
      ? createStorefrontClient({
          type: "private",
          requestContext,
          config: { ...config, privateStorefrontToken },
        })
      : createStorefrontClient({
          type: "public",
          requestContext,
          config: { ...config, publicStorefrontToken },
        });

    ctx.storefront = storefrontClient;

    if (SEO_PATH.test(ctx.url.pathname)) {
      let analyticsShop =
        ctx.url.pathname === ROBOTS_PATH
          ? await queryAnalyticsShop(
              storefrontClient,
              storefrontId ?? "0",
              normalizeStoreDomain(storeDomain),
            )
          : null;
      ctx.shell = { ...EMPTY_SHELL, analyticsShop };
      return applyResponseHeaders(requestContext, await next());
    }

    // Shopify-owned checkout, permalink, AJAX cart, and /api/cart routes run
    // ahead of the app's routes, on the prefix-free path the router matched,
    // with the active market kept on the request-scoped client.
    let shopifyRoute = handleShopifyRoutes({
      request: ctx.request,
      requestContext,
      sessionManager: createEphemeralHydrogenRouteSessionManager(ctx.request),
      storefrontClient,
      routeTemplates,
      handlers: [cartHandlers],
    });
    if (shopifyRoute) {
      return noStore(
        localizeRedirect(await shopifyRoute, activeMarket, ctx.url),
      );
    }

    let discount = getDiscountRequest(ctx.request);
    if (discount) {
      let location = localizeInternalUrl(
        discount.location,
        activeMarket.pathPrefix,
      );
      let headers = new Headers({
        Location: location,
        "Cache-Control": "private, no-store",
      });

      if (discount.code && ctx.request.method === "GET") {
        try {
          let discountHeaders = await applyDiscountCode(
            ctx.request,
            storefrontClient,
            discount.code,
          );
          for (let [name, value] of discountHeaders)
            headers.append(name, value);
        } catch (error) {
          if (ctx.request.signal.aborted && error === ctx.request.signal.reason)
            throw error;
          console.error("[hydrogen] Discount application failed");
        }
      }

      return applyResponseHeaders(
        requestContext,
        new Response(null, { status: 303, headers }),
      );
    }

    // Subscription POSTs need the request-scoped Storefront client for fresh
    // variant verification, and product grid fragments render only cards, so
    // neither needs shell/cart network requests.
    if (
      (ctx.request.method === "POST" && ctx.url.pathname === SUBSCRIBE_PATH) ||
      PRODUCT_GRID_FRAGMENT_PATH.test(ctx.url.pathname)
    ) {
      ctx.shell = EMPTY_SHELL;
      return applyResponseHeaders(requestContext, await next());
    }

    let [shellMenus, cart, analyticsShop] = await Promise.all([
      queryShellMenus(storefrontClient, storeDomain),
      getCartData(ctx.request, storefrontClient),
      queryAnalyticsShop(
        storefrontClient,
        storefrontId ?? "0",
        normalizeStoreDomain(storeDomain),
      ),
    ]);
    ctx.shell = { ...shellMenus, cart, analyticsShop };

    let response: AnyResponse;
    try {
      response = await next();
    } catch (error) {
      // A handler returning `null` throws past middleware to the 404 page.
      if (error !== NOT_MATCHED) throw error;
      let redirect = await shopifyRedirect();
      if (!redirect) throw error;
      response = redirect;
    }
    if (response.status === 404) {
      response = (await shopifyRedirect()) ?? response;
    }
    return applyResponseHeaders(requestContext, noStoreRedirect(response));

    async function shopifyRedirect() {
      let redirect = await handleShopifyRedirects({
        request: ctx.request,
        storefrontClient,
        routeTemplates,
      });
      return redirect && localizeRedirect(redirect, activeMarket, ctx.url);
    }
  };
}

/** Subscription abuse controls need a trusted IP; fail closed without one. */
function subscribeUnavailable(request: Request): Response {
  let headers = new Headers({ "Cache-Control": "private, no-store" });
  let body = {
    error: "Something went wrong. Please try again.",
    success: false,
  };
  if (request.headers.get("Accept")?.includes("application/json")) {
    return Response.json(body, { status: 503, headers });
  }
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Subscribe unavailable</title></head><body><main><h1>Subscribe</h1><p role="alert">Something went wrong. Please try again.</p></main></body></html>',
    { status: 503, headers },
  );
}

function localizeRedirect(
  response: AnyResponse,
  market: ActiveMarket,
  requestUrl: URL,
): AnyResponse {
  if (!market.pathPrefix || response.status < 300 || response.status >= 400) {
    return response;
  }
  let location = response.headers.get("Location");
  if (!location) return response;

  let target: URL;
  try {
    target = new URL(location, requestUrl);
  } catch {
    return response;
  }
  if (target.origin !== requestUrl.origin) return response;

  let localized = localizeInternalUrl(
    `${target.pathname}${target.search}${target.hash}`,
    market.pathPrefix,
  );
  if (localized === location) return response;
  let mutable = new Response(response.body, response);
  mutable.headers.set("Location", localized);
  return mutable;
}

interface DiscountRequest {
  code: string | null;
  location: string;
}

function getDiscountRequest(request: Request): DiscountRequest | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  let url = new URL(request.url);
  let discountPath = url.pathname.match(/^\/discount\/([^/]+)\/?$/);
  if (discountPath) {
    let code = decodePathSegment(discountPath[1]!);
    let candidate =
      url.searchParams.get("redirect") ??
      url.searchParams.get("return_to") ??
      "/";
    let target = safeSameOriginUrl(url, candidate);

    for (let [name, value] of url.searchParams) {
      if (name !== "redirect" && name !== "return_to" && name !== "discount") {
        target.searchParams.append(name, value);
      }
    }

    return { code, location: relativeUrl(target) };
  }

  if (!url.searchParams.has("discount")) return null;
  let code = normalizeDiscountCode(url.searchParams.get("discount"));
  url.searchParams.delete("discount");
  return { code, location: relativeUrl(url) };
}

function decodePathSegment(value: string): string | null {
  try {
    return normalizeDiscountCode(decodeURIComponent(value));
  } catch {
    return null;
  }
}

function normalizeDiscountCode(value: string | null): string | null {
  return value && value.length <= 255 ? value : null;
}

function safeSameOriginUrl(requestUrl: URL, candidate: string): URL {
  try {
    let target = new URL(candidate, requestUrl);
    return target.origin === requestUrl.origin
      ? target
      : new URL("/", requestUrl);
  } catch {
    return new URL("/", requestUrl);
  }
}

function relativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function noStoreRedirect(response: AnyResponse): AnyResponse {
  return response.status >= 300 && response.status < 400
    ? noStore(response)
    : response;
}

function noStore(response: AnyResponse): AnyResponse {
  try {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    let mutableResponse = new Response(response.body, response);
    mutableResponse.headers.set("Cache-Control", "private, no-store");
    return mutableResponse;
  }
}

type EphemeralHydrogenRouteSessionManager = Parameters<
  typeof handleShopifyRoutes
>[0]["sessionManager"];
type EphemeralSessionItem = Parameters<
  EphemeralHydrogenRouteSessionManager["setSessionItem"]
>[1];

/**
 * Request-local scratch state required by Hydrogen compatibility routes.
 * Values never survive the request and are never committed to a cookie. This
 * is not a durable session boundary and is unsafe for Customer Account API
 * authentication, OAuth state/PKCE/nonces, or any cross-request state.
 */
function createEphemeralHydrogenRouteSessionManager(
  request: Request,
): EphemeralHydrogenRouteSessionManager {
  let values = new Map<string, EphemeralSessionItem>();

  return {
    getSessionOrigin() {
      return new URL(request.url).origin;
    },
    getSessionItem(key: string) {
      return values.get(key);
    },
    setSessionItem(key: string, value: EphemeralSessionItem) {
      values.set(key, value);
    },
    removeSessionItem(key: string) {
      values.delete(key);
    },
  };
}

function applyResponseHeaders(
  requestContext: ReturnType<typeof createShopifyRequestContext>,
  response: AnyResponse,
): AnyResponse {
  try {
    requestContext.applyResponseHeaders(response.headers);
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // Some runtimes expose immutable response headers. Recreate the response so
    // Hydrogen can append its request-context headers at the final boundary.
    let mutableResponse = new Response(response.body, response);
    requestContext.applyResponseHeaders(mutableResponse.headers);
    return mutableResponse;
  }
}
